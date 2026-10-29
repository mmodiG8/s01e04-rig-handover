import { readdirSync } from 'node:fs';
import type { RigConfig } from './config.js';
import { readNight } from './digest/read-night.js';
import type { NightDigest } from './digest/types.js';
import { lastBeat, type Beat } from './heartbeat.js';

// A night listed on disk, with what reading its file produced. 'gone' is a file listed but
// missing when read; 'unreadable' is any other read error. Neither is shown as zero events.
export type NightEntry =
  | { night: string; state: 'ok'; digest: NightDigest }
  | { night: string; state: 'gone' }
  | { night: string; state: 'unreadable'; error: string };

export type Status = {
  adapter: string;
  installed: string;
  lastBeat: Beat | null;
  nights: NightEntry[];
};

// Nights on disk = runs/<YYYY-MM-DD>.jsonl, newest first.
export function nightsOnDisk(runsDir: string): string[] {
  try {
    return readdirSync(runsDir)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))
      .map((f) => f.slice(0, 10))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

function readEntry(runsDir: string, night: string): NightEntry {
  try {
    const digest = readNight(runsDir, night);
    return digest ? { night, state: 'ok', digest } : { night, state: 'gone' };
  } catch (error) {
    return { night, state: 'unreadable', error: error instanceof Error ? error.message : String(error) };
  }
}

export function readStatus(config: RigConfig): Status {
  return {
    adapter: config.adapter,
    installed: config.installed,
    lastBeat: lastBeat(),
    nights: nightsOnDisk(config.runsDir).map((night) => readEntry(config.runsDir, night)),
  };
}
