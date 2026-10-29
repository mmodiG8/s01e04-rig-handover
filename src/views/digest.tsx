import type { DigestRow, NightDigest } from '../digest/types.js';

const dash = '—';

// Slow readers need these flagged: retried three times or more, or failed at least once,
// even when the job's last run came back ok.
export function needsAttention(row: DigestRow): boolean {
  return row.retries >= 3 || row.fails > 0;
}

export function DigestPage({ night, digest }: { night: string; digest: NightDigest | null }) {
  if (!digest) {
    return (
      <>
        <h1>digest · {night}</h1>
        <p class="warn">no run log for this night</p>
      </>
    );
  }
  return (
    <>
      <h1>digest · {digest.night}</h1>
      <p class="mute">
        events: ok {digest.counts.ok} · retry {digest.counts.retry} · fail {digest.counts.fail} · bad lines skipped {digest.badLines}
      </p>
      {digest.rows.length === 0 ? (
        <p class="mute">nothing ran</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>job</th>
              <th>owner</th>
              <th>runs</th>
              <th>retries</th>
              <th>fails</th>
              <th>last status</th>
              <th>last error</th>
              <th>first at</th>
              <th>last at</th>
            </tr>
          </thead>
          <tbody>
            {digest.rows.map((row) => (
              <tr class={needsAttention(row) ? 'warn' : undefined}>
                <td>{row.job}</td>
                <td>{row.owner ?? dash}</td>
                <td>{row.runs}</td>
                <td>{row.retries}</td>
                <td>{row.fails}</td>
                <td>{row.lastStatus}</td>
                <td>{row.lastError ?? dash}</td>
                <td>{row.firstAt}</td>
                <td>{row.lastAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
