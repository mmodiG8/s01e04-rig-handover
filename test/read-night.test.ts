import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readNight } from '../src/digest/read-night.js';

vi.mock('node:fs', { spy: true });

const night = '2026-10-28';
const validEvent = {
  at: '2026-10-28T23:00:00+01:00',
  job: 'lane/sync',
  status: 'ok',
  owner: 'rook',
};

describe('readNight', () => {
  let runsDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    runsDir = join(process.cwd(), 'test', `.reader-fixtures-${randomUUID()}`);
    fs.mkdirSync(runsDir);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(runsDir, { recursive: true, force: true });
  });

  function writeLines(lines: unknown[]) {
    fs.writeFileSync(join(runsDir, `${night}.jsonl`), lines.map(line => JSON.stringify(line)).join('\n'));
  }

  it('reads the real night without dropping null owners or recovered retries', () => {
    expect(readNight(join(process.cwd(), 'runs'), night)).toEqual({
      night,
      badLines: 1,
      counts: { ok: 10, retry: 4, fail: 1 },
      rows: [
        {
          job: 'digest/render', owner: null, runs: 1, retries: 0, fails: 0,
          lastStatus: 'ok', lastError: null,
          firstAt: '2026-10-29T05:41:09+01:00', lastAt: '2026-10-29T05:41:09+01:00',
        },
        {
          job: 'fixtures/refresh', owner: 'rook', runs: 4, retries: 3, fails: 0,
          lastStatus: 'ok', lastError: 'upstream 503',
          firstAt: '2026-10-29T01:30:00+01:00', lastAt: '2026-10-29T01:37:00+01:00',
        },
        {
          job: 'lane/sync', owner: 'rook', runs: 8, retries: 1, fails: 0,
          lastStatus: 'ok', lastError: 'lock held',
          firstAt: '2026-10-28T23:00:06+01:00', lastAt: '2026-10-29T05:00:04+01:00',
        },
        {
          job: 'notes/backup', owner: 'lane-07', runs: 1, retries: 0, fails: 1,
          lastStatus: 'fail', lastError: 'quota exceeded',
          firstAt: '2026-10-29T04:00:01+01:00', lastAt: '2026-10-29T04:00:01+01:00',
        },
        {
          job: 'rig/rotate-logs', owner: 'lane-07', runs: 1, retries: 0, fails: 0,
          lastStatus: 'ok', lastError: null,
          firstAt: '2026-10-28T23:00:02+01:00', lastAt: '2026-10-28T23:00:02+01:00',
        },
      ],
    });
  });

  it('returns null for a missing file or missing runs directory', () => {
    expect(readNight(runsDir, night)).toBeNull();
    expect(readNight(join(runsDir, 'missing'), night)).toBeNull();
  });

  it.each([
    '', '2026-1-01', '2026-10-8', '20261028', '2026-10-28.jsonl',
    '../2026-10-28', '..\\2026-10-28', '2026-10-28/../2026-10-29',
    'C:\\2026-10-28', '/2026-10-28', '2026-10-28\n', '2026-10-28\0',
  ])('rejects invalid night %j before accessing the filesystem', invalidNight => {
    const read = vi.spyOn(fs, 'readFileSync');
    expect(readNight(runsDir, invalidNight)).toBeNull();
    expect(read).not.toHaveBeenCalled();
  });

  it.each(['', '\n', ' \t\r\n\r\n  '])('returns an empty digest for empty or blank content %j', contents => {
    fs.writeFileSync(join(runsDir, `${night}.jsonl`), contents);
    expect(readNight(runsDir, night)).toEqual({
      night, rows: [], badLines: 0, counts: { ok: 0, retry: 0, fail: 0 },
    });
  });

  it('ignores blank lines, CRLF and a trailing newline around valid records', () => {
    fs.writeFileSync(join(runsDir, `${night}.jsonl`),
      `\r\n${JSON.stringify(validEvent)}\r\n \t\r\n${JSON.stringify(validEvent)}\r\n`);
    const digest = readNight(runsDir, night);
    expect(digest).toMatchObject({ badLines: 0, counts: { ok: 2, retry: 0, fail: 0 } });
    expect(digest?.rows).toHaveLength(1);
    expect(digest?.rows[0].runs).toBe(2);
  });

  it('counts malformed JSON and continues to valid later lines', () => {
    fs.writeFileSync(join(runsDir, `${night}.jsonl`),
      `${JSON.stringify(validEvent)}\n{"job":\nnot-json\n${JSON.stringify(validEvent)}\n`);
    expect(readNight(runsDir, night)).toMatchObject({
      badLines: 2, counts: { ok: 2, retry: 0, fail: 0 }, rows: [{ runs: 2 }],
    });
  });

  it.each([
    null, [], [validEvent], true, 12, 'event', {},
    { job: 'lane/sync', status: 'ok', owner: 'rook' },
    { at: validEvent.at, status: 'ok', owner: 'rook' },
    { at: validEvent.at, job: 'lane/sync', owner: 'rook' },
    { at: validEvent.at, job: 'lane/sync', status: 'ok' },
    { ...validEvent, job: '' },
    { ...validEvent, job: ' \t' },
    { ...validEvent, job: 1 },
    { ...validEvent, owner: 1 },
    { ...validEvent, owner: {} },
    { ...validEvent, status: 'OK' },
    { ...validEvent, status: null },
    { ...validEvent, error: null },
    { ...validEvent, error: { message: 'oops' } },
    { ...validEvent, error: false },
    { ...validEvent, at: null },
    { ...validEvent, at: 1793224800000 },
    { ...validEvent, at: 'not-a-date' },
    { ...validEvent, at: '2026-10-28' },
    { ...validEvent, at: '2026-10-28T23:00:00' },
    { ...validEvent, at: '2026-02-29T23:00:00Z' },
    { ...validEvent, at: '1900-02-29T23:00:00Z' },
    { ...validEvent, at: '2026-04-31T23:00:00Z' },
    { ...validEvent, at: '2026-00-28T23:00:00Z' },
    { ...validEvent, at: '2026-13-28T23:00:00Z' },
    { ...validEvent, at: '2026-10-00T23:00:00Z' },
    { ...validEvent, at: '2026-10-32T23:00:00Z' },
    { ...validEvent, at: '2026-10-28T24:00:00Z' },
    { ...validEvent, at: '2026-10-28T23:60:00Z' },
    { ...validEvent, at: '2026-10-28T23:00:60Z' },
    { ...validEvent, at: '2026-10-28T23:00:00+24:00' },
    { ...validEvent, at: '2026-10-28T23:00:00+01:60' },
    { ...validEvent, at: '2026-10-28T23:00:00Z\n' },
  ])('counts invalid schema %j without affecting valid rows or counts', invalidEvent => {
    writeLines([invalidEvent, validEvent]);
    expect(readNight(runsDir, night)).toEqual({
      night, badLines: 1, counts: { ok: 1, retry: 0, fail: 0 },
      rows: [{
        job: validEvent.job, owner: 'rook', runs: 1, retries: 0, fails: 0,
        lastStatus: 'ok', lastError: null, firstAt: validEvent.at, lastAt: validEvent.at,
      }],
    });
  });

  it('keeps a nonempty night with no usable records distinct from a missing file', () => {
    writeLines([null, {}, false]);
    expect(readNight(runsDir, night)).toEqual({
      night, rows: [], badLines: 3, counts: { ok: 0, retry: 0, fail: 0 },
    });
  });

  it.each(['2024-02-29T23:59:59Z', '2000-02-29T00:00:00.123+05:30', '2026-10-28T23:00:00.5-07:00'])(
    'accepts valid calendar timestamps and preserves %s', at => {
      writeLines([{ ...validEvent, at, owner: '', error: '', extra: 'ignored' }]);
      expect(readNight(runsDir, night)).toMatchObject({
        badLines: 0, rows: [{ owner: '', lastError: '', firstAt: at, lastAt: at }],
      });
    },
  );

  it('uses chronological instants across offsets, not file or lexical order', () => {
    writeLines([
      { ...validEvent, at: '2026-10-29T00:30:00-03:00', owner: null },
      { ...validEvent, at: '2026-10-28T23:30:00-02:00', status: 'fail', error: 'latest error' },
      { ...validEvent, at: '2026-10-29T02:00:00+02:00', status: 'retry', error: 'older error' },
    ]);
    expect(readNight(runsDir, night)).toEqual({
      night, badLines: 0, counts: { ok: 1, retry: 1, fail: 1 },
      rows: [{
        job: validEvent.job, owner: null, runs: 3, retries: 1, fails: 1,
        lastStatus: 'ok', lastError: 'latest error',
        firstAt: '2026-10-29T02:00:00+02:00', lastAt: '2026-10-29T00:30:00-03:00',
      }],
    });
  });

  it('uses later lines for equal latest instants and errors, retaining the first earliest time', () => {
    writeLines([
      { ...validEvent, at: '2026-10-28T23:00:00Z', status: 'retry', error: 'first error' },
      { ...validEvent, at: '2026-10-29T01:00:00+02:00', status: 'fail', error: 'last error' },
      { ...validEvent, at: '2026-10-28T18:00:00-05:00', owner: null },
    ]);
    expect(readNight(runsDir, night)?.rows).toEqual([{
      job: validEvent.job, owner: null, runs: 3, retries: 1, fails: 1,
      lastStatus: 'ok', lastError: 'last error',
      firstAt: '2026-10-28T23:00:00Z', lastAt: '2026-10-28T18:00:00-05:00',
    }]);
  });

  it('orders fractional seconds without losing sub-millisecond precision', () => {
    writeLines([
      { ...validEvent, at: '2026-10-28T23:00:00.0002Z', status: 'fail', error: 'latest error' },
      { ...validEvent, at: '2026-10-28T23:00:00.0001Z', status: 'retry', error: 'older error' },
      { ...validEvent, at: '2026-10-29T01:00:00.000200+02:00', owner: null },
    ]);
    expect(readNight(runsDir, night)?.rows).toEqual([{
      job: validEvent.job, owner: null, runs: 3, retries: 1, fails: 1,
      lastStatus: 'ok', lastError: 'latest error',
      firstAt: '2026-10-28T23:00:00.0001Z', lastAt: '2026-10-29T01:00:00.000200+02:00',
    }]);
  });

  it('retains the latest error on any status and counts every failure after recovery', () => {
    writeLines([
      { ...validEvent, at: '2026-10-28T20:00:00Z', status: 'fail', error: 'first failure' },
      { ...validEvent, at: '2026-10-28T21:00:00Z', status: 'fail' },
      { ...validEvent, at: '2026-10-28T22:00:00Z', error: 'recovery warning' },
      { ...validEvent, at: '2026-10-28T23:00:00Z' },
    ]);
    expect(readNight(runsDir, night)).toMatchObject({
      counts: { ok: 2, retry: 0, fail: 2 },
      rows: [{ runs: 4, retries: 0, fails: 2, lastStatus: 'ok', lastError: 'recovery warning' }],
    });
  });

  it('keeps null errors for retries and failures with no error strings', () => {
    writeLines([{ ...validEvent, status: 'retry' }, { ...validEvent, status: 'fail' }]);
    expect(readNight(runsDir, night)?.rows[0]).toMatchObject({
      runs: 2, retries: 1, fails: 1, lastStatus: 'fail', lastError: null,
    });
  });

  it('preserves a named latest owner when an older null-owner event appears later', () => {
    writeLines([
      { ...validEvent, at: '2026-10-28T22:00:00Z', owner: 'latest owner' },
      { ...validEvent, at: '2026-10-28T21:00:00Z', owner: null },
    ]);
    expect(readNight(runsDir, night)?.rows[0].owner).toBe('latest owner');
  });

  it('sorts independent jobs by ordinal comparison, including special object keys', () => {
    writeLines(['z', 'ä', 'a', '__proto__', 'Z', 'constructor'].map(job => ({ ...validEvent, job })));
    const digest = readNight(runsDir, night);
    expect(digest?.rows.map(row => row.job)).toEqual(['Z', '__proto__', 'a', 'constructor', 'z', 'ä']);
    expect(digest?.rows.every(row => row.runs === 1)).toBe(true);
    expect(digest?.counts).toEqual({ ok: 6, retry: 0, fail: 0 });
  });

  it('propagates filesystem errors other than missing files', () => {
    fs.mkdirSync(join(runsDir, `${night}.jsonl`));
    expect(() => readNight(runsDir, night)).toThrow();
  });

  it.each(['EACCES', 'EIO'])('propagates %s unchanged', code => {
    const error = Object.assign(new Error('read failed'), { code });
    vi.spyOn(fs, 'readFileSync').mockImplementationOnce(() => { throw error; });
    expect(() => readNight(runsDir, night)).toThrow(error);
  });
});
