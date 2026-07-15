import { mkdir, readdir, stat, readFile, unlink, appendFile } from 'node:fs/promises';
import { join, basename } from 'node:path';

// Where session recordings land. A bind mount or volume keeps them across
// restarts; the default is a working-directory folder for local runs.
const LOG_DIR = process.env.FLIGHT_LOG_PATH ?? './flight-logs';

// Session names come from the client, so they are constrained to this shape and
// reduced to a basename before use; nothing can escape the log directory.
const SAFE_NAME = /^[A-Za-z0-9._-]+$/;

function safeFile(name: string): string {
  const base = basename(name);
  if (!SAFE_NAME.test(base)) throw new Error('Invalid log name');
  return base.endsWith('.log') ? base : `${base}.log`;
}

// Appends a batch of live log lines to the session's file, the ground station's
// own record of a flight the way a tlog records the telemetry link.
export async function appendFlightLog(id: string, lines: string[]): Promise<void> {
  if (lines.length === 0) return;
  await mkdir(LOG_DIR, { recursive: true });
  await appendFile(join(LOG_DIR, safeFile(id)), lines.join('\n') + '\n', 'utf8');
}

export interface FlightLogInfo {
  name: string;
  size: number;
  modified: string;
}

export async function listFlightLogs(): Promise<FlightLogInfo[]> {
  await mkdir(LOG_DIR, { recursive: true });
  const names = (await readdir(LOG_DIR)).filter((n) => n.endsWith('.log'));
  const infos = await Promise.all(
    names.map(async (name) => {
      const s = await stat(join(LOG_DIR, name));
      return { name, size: s.size, modified: s.mtime.toISOString() };
    })
  );
  return infos.sort((a, b) => b.modified.localeCompare(a.modified));
}

export async function readFlightLog(name: string): Promise<Buffer> {
  return readFile(join(LOG_DIR, safeFile(name)));
}

export async function deleteFlightLog(name: string): Promise<void> {
  await unlink(join(LOG_DIR, safeFile(name)));
}
