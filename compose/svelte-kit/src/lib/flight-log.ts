// The ground station keeps its own black box: the live log is batched to a
// per-flight session file on the server. The client records because it holds
// the unified view of both MAVLink and MSP events, and a gap in the stream
// rolls over to a fresh session so each flight lands in its own file.
const FLIGHT_LOG_GAP_MS = 90000;

let flightLogId = '';
let flightLogAt = 0;
let flightLogBuffer: string[] = [];

export function recordFlightLine(line: string) {
  const now = Date.now();
  if (!flightLogId || now - flightLogAt > FLIGHT_LOG_GAP_MS) {
    flightLogId = `flight-${new Date(now).toISOString().replace(/[:.]/g, '-')}`;
  }
  flightLogAt = now;
  flightLogBuffer.push(line.replace(/\n+$/, ''));
}

export async function flushFlightLog() {
  if (flightLogBuffer.length === 0 || !flightLogId) return;
  const lines = flightLogBuffer;
  flightLogBuffer = [];
  try {
    await fetch('/api/flight-log/append', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: flightLogId, lines })
    });
  } catch {
    flightLogBuffer = lines.concat(flightLogBuffer);
  }
}
