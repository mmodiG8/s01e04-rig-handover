import type { NightEntry, Status } from '../status.js';

// Counts are log events per night (ok / retry / fail lines), not final job states. Gone or
// unreadable nights keep their row with — counts and a warning, never zeros.
function NightRow({ entry }: { entry: NightEntry }) {
  const counts = entry.state === 'ok' ? entry.digest.counts : null;
  return (
    <tr>
      <td>
        <a href={`/digest/${entry.night}`}>{entry.night}</a>
        {entry.state === 'gone' && <span class="warn"> · file gone since listing</span>}
        {entry.state === 'unreadable' && <span class="warn"> · unreadable: {entry.error}</span>}
      </td>
      <td>{counts ? counts.ok : '—'}</td>
      <td>{counts ? counts.retry : '—'}</td>
      <td>{counts ? counts.fail : '—'}</td>
    </tr>
  );
}

export function StatusBoard({ status }: { status: Status }) {
  return (
    <>
      <h1>status</h1>
      <table>
        <tbody>
          <tr><th>adapter</th><td>{status.adapter}</td></tr>
          <tr><th>installed</th><td>{status.installed}</td></tr>
          <tr>
            <th>last beat</th>
            <td>{status.lastBeat ? `${status.lastBeat.at} · pid ${status.lastBeat.pid}` : <span class="warn">none</span>}</td>
          </tr>
        </tbody>
      </table>
      <h2>nights on disk</h2>
      {status.nights.length === 0 ? (
        <p class="mute">nothing in runs/</p>
      ) : (
        <>
          <table>
            <thead>
              <tr><th>night</th><th>ok</th><th>retry</th><th>fail</th></tr>
            </thead>
            <tbody>
              {status.nights.map((entry) => (
                <NightRow entry={entry} />
              ))}
            </tbody>
          </table>
          <p class="mute">counts are log events per night, not final job states</p>
        </>
      )}
    </>
  );
}
