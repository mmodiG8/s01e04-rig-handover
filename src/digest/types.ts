export type DigestStatus = 'ok' | 'retry' | 'fail';

export type DigestRow = {
  job: string;
  // Owner of the chronologically latest event, including an explicit null.
  owner: string | null;
  // Total valid events for this job, including retries and failures.
  runs: number;
  retries: number;
  // All fail events, even when lastStatus is later ok.
  fails: number;
  lastStatus: DigestStatus;
  // Most recent chronological error string; later successes do not clear it.
  lastError: string | null;
  // Chronological extrema, retaining the original timestamp strings and offsets.
  firstAt: string;
  lastAt: string;
};

export type NightDigest = {
  night: string;
  // One row per job, sorted ascending by job using ordinal string comparison.
  rows: DigestRow[];
  // Malformed JSON or invalid events; blank/whitespace-only lines are ignored.
  badLines: number;
  // Counts of valid events, not jobs or their final statuses.
  counts: {
    ok: number;
    retry: number;
    fail: number;
  };
};

/**
 * Synchronous reader entry: src/digest/read-night.ts exports readNight: ReadNight.
 * Reads runsDir/<night>.jsonl; night must match /^\d{4}-\d{2}-\d{2}$/.
 * Returns null for an invalid night or ENOENT only; other file errors throw.
 * An empty file returns a digest with no rows, no bad lines and zero counts.
 *
 * Valid events have an offset-bearing ISO timestamp at, a nonempty string job,
 * a DigestStatus status, owner: string | null, and optional error: string.
 * Invalid lines increment badLines without aborting or affecting rows/counts.
 * runs counts all valid events; retries/fails count their respective statuses.
 * Compare timestamp instants, not their strings; equal instants use file order
 * (later lines win for lastAt, lastStatus, owner and lastError).
 * firstAt retains the first earliest event; lastError is null only if no event
 * for that job has an error string, regardless of subsequent event statuses.
 */
export type ReadNight = (runsDir: string, night: string) => NightDigest | null;
