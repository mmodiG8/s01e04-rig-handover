import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import type { RigConfig } from '../src/config.js';
import type { NightDigest } from '../src/digest/types.js';

// Every case gets its own runs dir, created under test/ (never runs/, never the OS temp folder).
// Only the exact directories returned by mkdtempSync are removed.
const testDir = dirname(fileURLToPath(import.meta.url));
const ownedDirs: string[] = [];

function runsDirWith(files: Record<string, string>): string {
  const dir = mkdtempSync(join(testDir, '.digest-runs-'));
  ownedDirs.push(dir);
  for (const [name, body] of Object.entries(files)) {
    writeFileSync(join(dir, name), body);
  }
  return dir;
}

function appFor(runsDir: string) {
  const config: RigConfig = {
    adapter: 'shim',
    installed: '2026-10-29T14:06:00+01:00',
    beatEverySeconds: 60,
    runsDir,
  };
  return createApp(config);
}

// The HTML segment for one job's table row: everything from its <tr up to the next one.
function rowHtml(html: string, job: string): string {
  const row = html.split('<tr').find((segment) => segment.includes(job));
  expect(row, `row for ${job}`).toBeDefined();
  return row ?? '';
}

function jsonLines(...events: object[]): string {
  return events.map((event) => JSON.stringify(event)).join('\n');
}

const mainNight = jsonLines(
  { at: '2026-10-28T22:05:00+01:00', job: 'sync-invoices', status: 'ok', owner: 'ana' },
  { at: '2026-10-28T22:10:00+01:00', job: 'rebuild-index', status: 'retry', owner: 'ben', error: 'timeout after 30s' },
  { at: '2026-10-28T22:12:00+01:00', job: 'rebuild-index', status: 'retry', owner: 'ben', error: 'timeout after 30s' },
  { at: '2026-10-28T22:14:00+01:00', job: 'rebuild-index', status: 'retry', owner: 'ben', error: 'timeout after 60s' },
  { at: '2026-10-28T22:20:00+01:00', job: 'rebuild-index', status: 'ok', owner: 'ben' },
  { at: '2026-10-28T23:00:00+01:00', job: 'backup-db', status: 'fail', owner: null, error: 'disk full' },
  { at: '2026-10-28T23:30:00+01:00', job: 'ship-report', status: 'ok', owner: 'cy' },
);

const mainExpected: NightDigest = {
  night: '2026-10-28',
  rows: [
    {
      job: 'backup-db',
      owner: null,
      runs: 1,
      retries: 0,
      fails: 1,
      lastStatus: 'fail',
      lastError: 'disk full',
      firstAt: '2026-10-28T23:00:00+01:00',
      lastAt: '2026-10-28T23:00:00+01:00',
    },
    {
      job: 'rebuild-index',
      owner: 'ben',
      runs: 4,
      retries: 3,
      fails: 0,
      lastStatus: 'ok',
      lastError: 'timeout after 60s',
      firstAt: '2026-10-28T22:10:00+01:00',
      lastAt: '2026-10-28T22:20:00+01:00',
    },
    {
      job: 'ship-report',
      owner: 'cy',
      runs: 1,
      retries: 0,
      fails: 0,
      lastStatus: 'ok',
      lastError: null,
      firstAt: '2026-10-28T23:30:00+01:00',
      lastAt: '2026-10-28T23:30:00+01:00',
    },
    {
      job: 'sync-invoices',
      owner: 'ana',
      runs: 1,
      retries: 0,
      fails: 0,
      lastStatus: 'ok',
      lastError: null,
      firstAt: '2026-10-28T22:05:00+01:00',
      lastAt: '2026-10-28T22:05:00+01:00',
    },
  ],
  badLines: 0,
  counts: { ok: 3, retry: 3, fail: 1 },
};

beforeEach(() => {
  vi.stubEnv('LANE_ID', 'lane-digest-test');
  vi.stubEnv('LANE_MARKER', 'DIGEST-TEST-MARKER');
});

afterEach(() => {
  vi.unstubAllEnvs();
  for (const dir of ownedDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('digest page /digest/:night', () => {
  it('renders a night with rows as HTML with one table and no scripts', async () => {
    const app = appFor(runsDirWith({ '2026-10-28.jsonl': mainNight }));
    const res = await app.request('/digest/2026-10-28');
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(html.match(/<table[\s>]/g)).toHaveLength(1);
    expect(html).not.toMatch(/<script/i);
    for (const row of mainExpected.rows) {
      expect(html).toContain(row.job);
    }
  });

  it('returns 404 for a night with no file', async () => {
    const app = appFor(runsDirWith({ '2026-10-28.jsonl': mainNight }));
    expect((await app.request('/digest/2026-10-28')).status).toBe(200);
    const res = await app.request('/digest/2026-10-27');
    expect(res.status).toBe(404);
  });

  it('returns 404 for a malformed night', async () => {
    const app = appFor(runsDirWith({ '2026-10-28.jsonl': mainNight }));
    expect((await app.request('/digest/2026-10-28')).status).toBe(200);
    const res = await app.request('/digest/not-a-night');
    expect(res.status).toBe(404);
  });

  it('says "nothing ran" for an empty night file', async () => {
    const app = appFor(runsDirWith({ '2026-10-28.jsonl': '' }));
    const res = await app.request('/digest/2026-10-28');
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(html).toContain('nothing ran');
    expect(html).not.toMatch(/<script/i);
  });

  it('keeps good jobs and still renders when a line is bad', async () => {
    const night = [
      JSON.stringify({ at: '2026-10-28T08:00:00+05:30', job: 'alpha-job', status: 'ok', owner: 'ana' }),
      '{not json',
      JSON.stringify({ at: '2026-10-28T09:00:00+05:30', job: 'alpha-job', status: 'retry', owner: 'ana', error: 'boom' }),
      '   ',
      JSON.stringify({ at: '2026-10-28T10:00:00+05:30', job: 'gamma-job', status: 'ok', owner: 'cy' }),
      JSON.stringify({ at: '2026-10-28T11:00:00+05:30', status: 'ok', owner: 'cy' }),
    ].join('\n');
    const app = appFor(runsDirWith({ '2026-10-28.jsonl': night }));
    const res = await app.request('/digest/2026-10-28');
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(html).toContain('alpha-job');
    expect(html).toContain('gamma-job');
    expect(html).not.toMatch(/<script/i);
  });

  it('escapes unsafe job, owner and error text and never emits scripts', async () => {
    const night = jsonLines({
      at: '2026-10-28T12:00:00+01:00',
      job: '<script>alert(1)</script>',
      status: 'fail',
      owner: '<img src=x onerror=alert(2)>',
      error: '"><script>alert(3)</script>',
    });
    const app = appFor(runsDirWith({ '2026-10-28.jsonl': night }));
    const res = await app.request('/digest/2026-10-28');
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<img/i);
    expect(html).toContain('&lt;script&gt;alert(1)');
    expect(html).toContain('&lt;img src=x onerror=alert(2)&gt;');
    expect(html).toContain('&lt;script&gt;alert(3)');
  });

  it('shows a null owner as an em dash in its row', async () => {
    const app = appFor(runsDirWith({ '2026-10-28.jsonl': mainNight }));
    const html = await (await app.request('/digest/2026-10-28')).text();

    expect(rowHtml(html, 'backup-db')).toMatch(/<td>backup-db<\/td><td>—<\/td>/);
    expect(rowHtml(html, 'sync-invoices')).toMatch(/<td>sync-invoices<\/td><td>ana<\/td>/);
  });

  it('keeps the original timestamp offsets and compares instants, not strings', async () => {
    const night = jsonLines(
      { at: '2026-10-28T10:00:00+05:30', job: 'offset-job', status: 'retry', owner: 'ana', error: 'late' },
      { at: '2026-10-28T06:00:00+00:00', job: 'offset-job', status: 'ok', owner: 'ben' },
    );
    const app = appFor(runsDirWith({ '2026-10-28.jsonl': night }));
    const html = await (await app.request('/digest/2026-10-28')).text();
    const row = rowHtml(html, 'offset-job');

    expect(row).toContain('2026-10-28T10:00:00+05:30');
    expect(row).toContain('2026-10-28T06:00:00+00:00');
    expect(html).not.toContain('2026-10-28T04:30');
  });

  it('marks retries of 3 or more and any prior fail, and nothing else', async () => {
    const night = jsonLines(
      { at: '2026-10-27T01:00:00+01:00', job: 'quiet-retry', status: 'retry', owner: 'ana', error: 'slow' },
      { at: '2026-10-27T01:05:00+01:00', job: 'quiet-retry', status: 'retry', owner: 'ana', error: 'slow' },
      { at: '2026-10-27T02:00:00+01:00', job: 'edge-retry', status: 'retry', owner: 'ben', error: 'e1' },
      { at: '2026-10-27T02:01:00+01:00', job: 'edge-retry', status: 'retry', owner: 'ben', error: 'e2' },
      { at: '2026-10-27T02:02:00+01:00', job: 'edge-retry', status: 'retry', owner: 'ben', error: 'e3' },
      { at: '2026-10-27T02:03:00+01:00', job: 'edge-retry', status: 'ok', owner: 'ben' },
      { at: '2026-10-27T03:00:00+01:00', job: 'healed-fail', status: 'fail', owner: 'cy', error: 'no route' },
      { at: '2026-10-27T03:10:00+01:00', job: 'healed-fail', status: 'ok', owner: 'cy' },
      { at: '2026-10-27T04:00:00+01:00', job: 'clean-job', status: 'ok', owner: 'ana' },
    );
    const app = appFor(runsDirWith({ '2026-10-27.jsonl': night }));
    const html = await (await app.request('/digest/2026-10-27')).text();

    expect(rowHtml(html, 'edge-retry')).toContain('warn');
    expect(rowHtml(html, 'healed-fail')).toContain('warn');
    expect(rowHtml(html, 'quiet-retry')).not.toContain('warn');
    expect(rowHtml(html, 'clean-job')).not.toContain('warn');
  });

  it('shows the lane banner with the lane id and marker', async () => {
    const app = appFor(runsDirWith({ '2026-10-28.jsonl': mainNight }));
    const html = await (await app.request('/digest/2026-10-28')).text();

    expect(html).toContain('lane-digest-test');
    expect(html).toContain('DIGEST-TEST-MARKER');
  });

  it('shows "no marker set" in the banner when LANE_MARKER is unset', async () => {
    vi.stubEnv('LANE_MARKER', '');
    const app = appFor(runsDirWith({ '2026-10-28.jsonl': mainNight }));
    const html = await (await app.request('/digest/2026-10-28')).text();

    expect(html).toContain('no marker set');
  });
});

describe('digest JSON /api/digest/:night', () => {
  it('returns the NightDigest for a nonempty night', async () => {
    const app = appFor(runsDirWith({ '2026-10-28.jsonl': mainNight }));
    const res = await app.request('/api/digest/2026-10-28');

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect((await res.json()) as NightDigest).toEqual(mainExpected);
  });

  it('returns 404 for a night with no file', async () => {
    const app = appFor(runsDirWith({ '2026-10-28.jsonl': mainNight }));
    expect((await app.request('/api/digest/2026-10-28')).status).toBe(200);
    const res = await app.request('/api/digest/2026-10-27');
    expect(res.status).toBe(404);
  });

  it('returns 404 for a malformed night', async () => {
    const app = appFor(runsDirWith({ '2026-10-28.jsonl': mainNight }));
    expect((await app.request('/api/digest/2026-10-28')).status).toBe(200);
    const res = await app.request('/api/digest/2026-10-28x');
    expect(res.status).toBe(404);
  });

  it('returns an empty digest with zero counts for an empty night', async () => {
    const app = appFor(runsDirWith({ '2026-10-28.jsonl': '' }));
    const res = await app.request('/api/digest/2026-10-28');

    expect(res.status).toBe(200);
    expect((await res.json()) as NightDigest).toEqual({
      night: '2026-10-28',
      rows: [],
      badLines: 0,
      counts: { ok: 0, retry: 0, fail: 0 },
    });
  });

  it('counts a bad line and keeps the good jobs', async () => {
    const night = [
      JSON.stringify({ at: '2026-10-28T08:00:00+05:30', job: 'alpha-job', status: 'ok', owner: 'ana' }),
      '{not json',
      JSON.stringify({ at: '2026-10-28T09:00:00+05:30', job: 'alpha-job', status: 'retry', owner: 'ana', error: 'boom' }),
      '   ',
      JSON.stringify({ at: '2026-10-28T10:00:00+05:30', job: 'gamma-job', status: 'ok', owner: 'cy' }),
      JSON.stringify({ at: '2026-10-28T11:00:00+05:30', status: 'ok', owner: 'cy' }),
    ].join('\n');
    const app = appFor(runsDirWith({ '2026-10-28.jsonl': night }));
    const body = (await (await app.request('/api/digest/2026-10-28')).json()) as NightDigest;

    expect(body.badLines).toBe(2);
    expect(body.counts).toEqual({ ok: 2, retry: 1, fail: 0 });
    expect(body.rows).toEqual([
      {
        job: 'alpha-job',
        owner: 'ana',
        runs: 2,
        retries: 1,
        fails: 0,
        lastStatus: 'retry',
        lastError: 'boom',
        firstAt: '2026-10-28T08:00:00+05:30',
        lastAt: '2026-10-28T09:00:00+05:30',
      },
      {
        job: 'gamma-job',
        owner: 'cy',
        runs: 1,
        retries: 0,
        fails: 0,
        lastStatus: 'ok',
        lastError: null,
        firstAt: '2026-10-28T10:00:00+05:30',
        lastAt: '2026-10-28T10:00:00+05:30',
      },
    ]);
  });

  it('keeps the original timestamp offsets and compares instants, not strings', async () => {
    const night = jsonLines(
      { at: '2026-10-28T10:00:00+05:30', job: 'offset-job', status: 'retry', owner: 'ana', error: 'late' },
      { at: '2026-10-28T06:00:00+00:00', job: 'offset-job', status: 'ok', owner: 'ben' },
    );
    const app = appFor(runsDirWith({ '2026-10-28.jsonl': night }));
    const body = (await (await app.request('/api/digest/2026-10-28')).json()) as NightDigest;

    expect(body.rows).toEqual([
      {
        job: 'offset-job',
        owner: 'ben',
        runs: 2,
        retries: 1,
        fails: 0,
        lastStatus: 'ok',
        lastError: 'late',
        firstAt: '2026-10-28T10:00:00+05:30',
        lastAt: '2026-10-28T06:00:00+00:00',
      },
    ]);
  });
});

describe('digest HTML and JSON agreement', () => {
  it('lists jobs in the same ordinal order in the page and the JSON', async () => {
    const night = jsonLines(
      { at: '2026-10-28T09:00:00+01:00', job: 'zeta-job', status: 'ok', owner: 'ana' },
      { at: '2026-10-28T09:01:00+01:00', job: 'alpha-job', status: 'ok', owner: 'ana' },
      { at: '2026-10-28T09:02:00+01:00', job: 'beta-job', status: 'ok', owner: 'ben' },
      { at: '2026-10-28T09:03:00+01:00', job: 'Beta-job', status: 'ok', owner: 'ben' },
      { at: '2026-10-28T09:04:00+01:00', job: 'Zeta-job', status: 'ok', owner: 'cy' },
    );
    const app = appFor(runsDirWith({ '2026-10-28.jsonl': night }));
    const body = (await (await app.request('/api/digest/2026-10-28')).json()) as NightDigest;
    const html = await (await app.request('/digest/2026-10-28')).text();

    const jobs = body.rows.map((row) => row.job);
    expect(jobs).toEqual(['Beta-job', 'Zeta-job', 'alpha-job', 'beta-job', 'zeta-job']);

    const positions = jobs.map((job) => html.indexOf(job));
    for (const position of positions) {
      expect(position).toBeGreaterThan(-1);
    }
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });
});
