import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, DigestStatus, NightDigest, ReadNight } from './types.js';

type RunEvent = {
  at: string;
  job: string;
  status: DigestStatus;
  owner: string | null;
  error?: string;
};

type JobState = {
  row: DigestRow;
  firstInstant: Instant;
  lastInstant: Instant;
  errorInstant: Instant | null;
};

type Instant = {
  seconds: number;
  fraction: string;
};

function toInstant(at: string): Instant {
  // Date.parse truncates sub-millisecond digits, which still matter for ordering.
  return {
    seconds: Math.floor(Date.parse(at) / 1000),
    fraction: (/\.(\d+)/.exec(at)?.[1] ?? '').replace(/0+$/, ''),
  };
}

function compareInstants(left: Instant, right: Instant): number {
  return left.seconds - right.seconds
    || (left.fraction < right.fraction ? -1 : left.fraction > right.fraction ? 1 : 0);
}

function isTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.exec(value);
  if (!match || match[0] !== value) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1]
    && Number.isFinite(Date.parse(value));
}

function isRunEvent(value: unknown): value is RunEvent {
  return typeof value === 'object'
    && value !== null
    && !Array.isArray(value)
    && 'at' in value && isTimestamp(value.at)
    && 'job' in value && typeof value.job === 'string' && value.job.trim().length > 0
    && 'status' in value
    && (value.status === 'ok' || value.status === 'retry' || value.status === 'fail')
    && 'owner' in value && (typeof value.owner === 'string' || value.owner === null)
    && (!('error' in value) || typeof value.error === 'string');
}

export const readNight: ReadNight = (runsDir, night) => {
  if (night.length !== 10 || !/^\d{4}-\d{2}-\d{2}$/.test(night)) return null;

  let contents: string;
  try {
    contents = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (error: unknown) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }

  const digest: NightDigest = {
    night,
    rows: [],
    badLines: 0,
    counts: { ok: 0, retry: 0, fail: 0 },
  };
  const jobs = new Map<string, JobState>();

  for (const line of contents.split(/\r?\n/)) {
    if (!line.trim()) continue;

    let event: unknown;
    try {
      event = JSON.parse(line);
    } catch {
      digest.badLines++;
      continue;
    }
    if (!isRunEvent(event)) {
      digest.badLines++;
      continue;
    }

    digest.counts[event.status]++;
    const instant = toInstant(event.at);
    let state = jobs.get(event.job);
    if (!state) {
      state = {
        row: {
          job: event.job,
          owner: event.owner,
          runs: 0,
          retries: 0,
          fails: 0,
          lastStatus: event.status,
          lastError: null,
          firstAt: event.at,
          lastAt: event.at,
        },
        firstInstant: instant,
        lastInstant: instant,
        errorInstant: null,
      };
      jobs.set(event.job, state);
    }

    const { row } = state;
    row.runs++;
    if (event.status === 'retry') row.retries++;
    if (event.status === 'fail') row.fails++;
    if (compareInstants(instant, state.firstInstant) < 0) {
      state.firstInstant = instant;
      row.firstAt = event.at;
    }
    if (compareInstants(instant, state.lastInstant) >= 0) {
      state.lastInstant = instant;
      row.lastAt = event.at;
      row.lastStatus = event.status;
      row.owner = event.owner;
    }
    if (event.error !== undefined
      && (state.errorInstant === null || compareInstants(instant, state.errorInstant) >= 0)) {
      state.errorInstant = instant;
      row.lastError = event.error;
    }
  }

  digest.rows = [...jobs.values()]
    .map(({ row }) => row)
    .sort((left, right) => left.job < right.job ? -1 : left.job > right.job ? 1 : 0);
  return digest;
};
