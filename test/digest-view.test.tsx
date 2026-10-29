import { describe, expect, it } from 'vitest';
import type { NightDigest } from '../src/digest/types.js';
import { DigestPage } from '../src/views/digest.js';

const row = (over: Partial<NightDigest['rows'][number]>): NightDigest['rows'][number] => ({
  job: 'lane/sync',
  owner: 'rook',
  runs: 1,
  retries: 0,
  fails: 0,
  lastStatus: 'ok',
  lastError: null,
  firstAt: '2026-10-29T01:00:00+01:00',
  lastAt: '2026-10-29T01:00:00+01:00',
  ...over,
});

const render = async (night: string, digest: NightDigest | null) =>
  String(await (<DigestPage night={night} digest={digest} />).toString());

describe('digest view', () => {
  it('says so when there is no digest for the night', async () => {
    const html = await render('2026-01-01', null);
    expect(html).toContain('no run log for this night');
    expect(html).not.toContain('<table');
  });

  it('says nothing ran for an empty night', async () => {
    const html = await render('2026-10-30', {
      night: '2026-10-30',
      rows: [],
      badLines: 0,
      counts: { ok: 0, retry: 0, fail: 0 },
    });
    expect(html).toContain('nothing ran');
    expect(html).not.toContain('<table');
  });

  it('renders one row per job with em dashes for missing values and timestamps untouched', async () => {
    const html = await render('2026-10-28', {
      night: '2026-10-28',
      rows: [
        row({ job: 'digest/render', owner: null, firstAt: '2026-10-29T05:41:09+01:00', lastAt: '2026-10-29T05:41:09+01:00' }),
      ],
      badLines: 1,
      counts: { ok: 1, retry: 0, fail: 0 },
    });
    expect(html).toContain('digest/render');
    expect(html).toContain('<td>—</td>');
    expect(html).toContain('<td>2026-10-29T05:41:09+01:00</td>');
    expect(html).toContain('bad lines skipped 1');
    expect(html).not.toContain('class="warn"');
  });

  it('marks rows with three or more retries, and any failure even when the last status is ok', async () => {
    const html = await render('2026-10-28', {
      night: '2026-10-28',
      rows: [
        row({ job: 'a/retries', retries: 3, runs: 3, lastStatus: 'retry', lastError: 'upstream 503' }),
        row({ job: 'b/failed-then-ok', fails: 1, runs: 2, lastStatus: 'ok', lastError: 'quota exceeded' }),
        row({ job: 'c/quiet', retries: 2, runs: 2, lastStatus: 'retry', lastError: 'lock held' }),
      ],
      badLines: 0,
      counts: { ok: 0, retry: 5, fail: 1 },
    });
    expect(html).toMatch(/<tr class="warn"><td>a\/retries<\/td>/);
    expect(html).toMatch(/<tr class="warn"><td>b\/failed-then-ok<\/td>/);
    expect(html).toMatch(/<tr><td>c\/quiet<\/td>/);
  });

  it('escapes job and error text', async () => {
    const html = await render('2026-10-28', {
      night: '2026-10-28',
      rows: [row({ job: '<script>x</script>', lastError: '<b>no</b>' })],
      badLines: 0,
      counts: { ok: 1, retry: 0, fail: 0 },
    });
    expect(html).not.toContain('<script>x</script>');
    expect(html).toContain('&lt;script&gt;x&lt;/script&gt;');
    expect(html).toContain('&lt;b&gt;no&lt;/b&gt;');
  });
});
