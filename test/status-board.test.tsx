import { describe, expect, it } from 'vitest';
import type { NightDigest } from '../src/digest/types.js';
import type { NightEntry, Status } from '../src/status.js';
import { StatusBoard } from '../src/views/status.js';

// The board view is tested on its own: readStatus needs the shared reader, which is not on
// this branch yet, so these tests build Status values directly.
const digest = (night: string, counts: NightDigest['counts']): NightDigest => ({ night, rows: [], badLines: 0, counts });

const status = (nights: NightEntry[]): Status => ({
  adapter: 'shim',
  installed: '2026-10-29T14:06:00+01:00',
  lastBeat: { at: '2026-10-29T23:48:00.000Z', pid: 4242, laneId: 'lane-07' },
  nights,
});

const render = (s: Status) => String(StatusBoard({ status: s }));

describe('status board view', () => {
  it('links each night to its digest with ok / retry / fail counts', () => {
    const html = render(
      status([
        { night: '2026-10-28', state: 'ok', digest: digest('2026-10-28', { ok: 4, retry: 2, fail: 1 }) },
        { night: '2026-10-27', state: 'ok', digest: digest('2026-10-27', { ok: 1, retry: 0, fail: 0 }) },
      ]),
    );

    expect(html).toContain('<a href="/digest/2026-10-28">2026-10-28</a>');
    expect(html).toContain('<a href="/digest/2026-10-27">2026-10-27</a>');
    expect(html).toContain('<td>4</td><td>2</td><td>1</td>');
    expect(html).toContain('<td>1</td><td>0</td><td>0</td>');
    expect(html.indexOf('2026-10-28')).toBeLessThan(html.indexOf('2026-10-27'));
    expect(html).toContain('counts are log events per night');
  });

  it('keeps adapter, installed and last beat', () => {
    const html = render(status([]));
    expect(html).toContain('shim');
    expect(html).toContain('2026-10-29T14:06:00+01:00');
    expect(html).toContain('2026-10-29T23:48:00.000Z · pid 4242');
  });

  it('says nothing is in runs/ when no night is on disk', () => {
    const html = render(status([]));
    expect(html).toContain('nothing in runs/');
    expect(html).not.toContain('/digest/');
  });

  it('marks a night whose file vanished instead of showing zero counts', () => {
    const html = render(status([{ night: '2026-10-26', state: 'gone' }]));
    expect(html).toContain('<a href="/digest/2026-10-26">2026-10-26</a>');
    expect(html).toContain('file gone since listing');
    expect(html).toContain('<td>—</td><td>—</td><td>—</td>');
  });

  it('marks a night that cannot be read with its error', () => {
    const html = render(status([{ night: '2026-10-25', state: 'unreadable', error: 'EACCES: permission denied' }]));
    expect(html).toContain('unreadable: EACCES: permission denied');
    expect(html).toContain('<td>—</td><td>—</td><td>—</td>');
  });
});
