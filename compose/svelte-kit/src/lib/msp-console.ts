// The MSP console mirrors the MAVLink console for Betaflight and INAV boards:
// a catalog of MSP commands to autocomplete, a hint per command, input parsing,
// and a decoder that turns a response payload into readable text. MSP commands
// are numeric codes; a request carries an optional byte payload and the board
// answers with a payload the console decodes when the shape is known.
import {
  MSP,
  decodeApiVersion,
  decodeFcVariant,
  decodeFcVersion,
  decodeBoardInfo,
  decodeStatus,
  decodeRawGps,
  decodeAttitude,
  decodeAltitude,
  decodeAnalog,
  decodeMotors,
  decodeBoxNames,
  decodeBoxIds,
  decodeModeRanges
} from './msp';

export interface MspConsoleCommand {
  name: string;
  code: number;
  v2?: boolean;
  // A write triggers an action or changes state, rather than only reading.
  write?: boolean;
  hint: string;
}

// A working set of standard MSP commands. Reads return telemetry or identity;
// writes act on the board (calibrations, reboot, RC override, settings).
const COMMANDS: MspConsoleCommand[] = [
  { name: 'MSP_API_VERSION', code: MSP.API_VERSION, hint: 'MSP protocol and FC API version' },
  { name: 'MSP_FC_VARIANT', code: MSP.FC_VARIANT, hint: 'firmware id (BTFL, INAV)' },
  { name: 'MSP_FC_VERSION', code: MSP.FC_VERSION, hint: 'firmware version' },
  { name: 'MSP_BOARD_INFO', code: MSP.BOARD_INFO, hint: 'board identifier and target name' },
  { name: 'MSP_BUILD_INFO', code: MSP.BUILD_INFO, hint: 'firmware build date and time' },
  { name: 'MSP_NAME', code: 10, hint: 'craft name' },
  { name: 'MSP_STATUS', code: MSP.STATUS, hint: 'cycle time, sensors, armed and mode flags' },
  { name: 'MSP_STATUS_EX', code: 150, hint: 'status plus arming-disabled flags' },
  { name: 'MSP_RAW_IMU', code: 102, hint: 'raw accelerometer, gyro, magnetometer' },
  { name: 'MSP_SERVO', code: 103, hint: 'servo outputs (microseconds)' },
  { name: 'MSP_MOTOR', code: MSP.MOTOR, hint: 'motor outputs (microseconds)' },
  { name: 'MSP_RC', code: 105, hint: 'RC channel values (microseconds)' },
  { name: 'MSP_RAW_GPS', code: MSP.RAW_GPS, hint: 'fix, satellites, lat, lon, altitude, speed' },
  { name: 'MSP_COMP_GPS', code: 107, hint: 'distance and bearing to home' },
  { name: 'MSP_ATTITUDE', code: MSP.ATTITUDE, hint: 'roll, pitch, yaw (degrees)' },
  { name: 'MSP_ALTITUDE', code: MSP.ALTITUDE, hint: 'altitude and vertical speed' },
  { name: 'MSP_ANALOG', code: MSP.ANALOG, hint: 'battery voltage, current, mAh, rssi' },
  { name: 'MSP_RC_TUNING', code: 111, hint: 'rates and expo' },
  { name: 'MSP_PID', code: 112, hint: 'PID gains' },
  { name: 'MSP_BOXNAMES', code: MSP.BOXNAMES, v2: true, hint: 'flight-mode box names' },
  { name: 'MSP_BOXIDS', code: MSP.BOXIDS, hint: 'flight-mode box permanent ids' },
  { name: 'MSP_MODE_RANGES', code: MSP.MODE_RANGES, hint: 'aux mode-activation ranges' },
  { name: 'MSP_BATTERY_STATE', code: 130, hint: 'battery cell count, capacity, state' },
  { name: 'MSP_UID', code: 160, hint: 'board unique id' },
  { name: 'MSP_WP_GETINFO', code: MSP.WP_GETINFO, hint: 'waypoint capacity and count (INAV)' },
  { name: 'MSP_SET_RAW_RC', code: MSP.SET_RAW_RC, write: true, hint: 'override RC: each channel as two bytes (u16 LE, microseconds)' },
  { name: 'MSP_ACC_CALIBRATION', code: MSP.ACC_CALIBRATION, write: true, hint: 'start accelerometer calibration (no payload; keep level and still)' },
  { name: 'MSP_MAG_CALIBRATION', code: MSP.MAG_CALIBRATION, write: true, hint: 'start compass calibration (no payload; rotate the craft)' },
  { name: 'MSP_SET_MODE_RANGE', code: MSP.SET_MODE_RANGE, write: true, hint: 'slot, permId, aux, startStep, endStep (five bytes)' },
  { name: 'MSP_EEPROM_WRITE', code: MSP.EEPROM_WRITE, write: true, hint: 'persist settings to EEPROM (no payload)' },
  { name: 'MSP_REBOOT', code: MSP.REBOOT, write: true, hint: 'reboot the flight controller (no payload)' }
];

const BY_NAME = new Map(COMMANDS.map((c) => [c.name, c]));

export function mspCommandCatalog(): MspConsoleCommand[] {
  return COMMANDS;
}

export function mspParamHint(name: string): string {
  return BY_NAME.get(name)?.hint ?? 'optional payload as byte values (0-255)';
}

export interface ParsedMspInput {
  ok: boolean;
  error?: string;
  name?: string;
  code?: number;
  v2?: boolean;
  write?: boolean;
  payload?: number[];
}

// Parses "MSP_NAME byte byte ..." into a command and an optional byte payload.
// The name resolves against the catalog; the trailing tokens are payload bytes.
export function parseMspConsoleInput(input: string): ParsedMspInput {
  const tokens = input.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return { ok: false, error: 'Type an MSP command name' };
  const name = `MSP_${tokens[0].toUpperCase().replace(/^MSP_?/, '')}`;
  const entry = BY_NAME.get(name);
  if (!entry) return { ok: false, error: `Unknown MSP command: ${tokens[0]}` };
  const payload: number[] = [];
  for (const t of tokens.slice(1)) {
    const v = Number.parseInt(t, 10);
    if (!Number.isInteger(v) || v < 0 || v > 255) {
      return { ok: false, error: `Payload takes byte values 0-255: ${t}` };
    }
    payload.push(v);
  }
  return { ok: true, name, code: entry.code, v2: entry.v2, write: entry.write, payload };
}

function hex(payload: number[]): string {
  if (!payload.length) return '(empty)';
  return payload.map((b) => b.toString(16).padStart(2, '0')).join(' ');
}

// Turns a response payload into readable text: a decoded object for a known
// command, otherwise the raw bytes so any response is still inspectable.
export function describeMspResponse(code: number, payload: number[]): string {
  if (!payload.length) return 'ok (no payload)';
  const bytes = Uint8Array.from(payload);
  const known: Record<number, () => unknown> = {
    [MSP.API_VERSION]: () => decodeApiVersion(bytes),
    [MSP.FC_VARIANT]: () => decodeFcVariant(bytes),
    [MSP.FC_VERSION]: () => decodeFcVersion(bytes),
    [MSP.BOARD_INFO]: () => decodeBoardInfo(bytes),
    [MSP.STATUS]: () => decodeStatus(bytes),
    [MSP.RAW_GPS]: () => decodeRawGps(bytes),
    [MSP.ATTITUDE]: () => decodeAttitude(bytes),
    [MSP.ALTITUDE]: () => decodeAltitude(bytes),
    [MSP.ANALOG]: () => decodeAnalog(bytes),
    [MSP.MOTOR]: () => decodeMotors(bytes),
    [MSP.BOXNAMES]: () => decodeBoxNames(bytes),
    [MSP.BOXIDS]: () => decodeBoxIds(bytes),
    [MSP.MODE_RANGES]: () => decodeModeRanges(bytes)
  };
  const decoded = known[code]?.();
  if (decoded !== undefined && decoded !== null) return JSON.stringify(decoded);
  return `${payload.length} bytes: ${hex(payload)}`;
}
