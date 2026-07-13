import type { MissionPlanActions, MissionPlanItem } from '../stores/missionPlanStore';
import { commandNameForId } from './mission-commands';

function toNum(value: unknown): number {
  const n = typeof value === 'number' ? value : parseFloat(String(value));
  return Number.isFinite(n) ? n : 0;
}

function makeItem(type: string, lat: number, lon: number, alt: number, params: number[]): MissionPlanItem {
  return {
    type,
    lat,
    lon,
    alt,
    notes: '',
    param1: params[0] ?? 0,
    param2: params[1] ?? 0,
    param3: params[2] ?? 0,
    param4: params[3] ?? 0
  };
}

// Mission Planner .waypoints / .txt: the tab or space separated "QGC WPL 110"
// format. Columns: seq, current, frame, command, p1-p4, x(lat), y(lon), z(alt),
// autocontinue. Row 0 is home, which maps to the plan's hidden index-0 slot.
export function parseQgcWpl(text: string): MissionPlanActions {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (!/^QGC WPL/i.test(lines[0] ?? '')) throw new Error('Not a QGC WPL waypoint file.');

  const actions: MissionPlanActions = {};
  let seq = 0;

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(/\s+/);
    if (cols.length < 12) continue;
    const command = parseInt(cols[3], 10);
    const name = commandNameForId(command) ?? (seq === 0 ? 'NAV_WAYPOINT' : undefined);
    if (!name) continue;
    actions[seq++] = makeItem(name, toNum(cols[8]), toNum(cols[9]), toNum(cols[10]), [
      toNum(cols[4]),
      toNum(cols[5]),
      toNum(cols[6]),
      toNum(cols[7])
    ]);
  }

  if (seq === 0) throw new Error('No mission items found in the waypoint file.');
  return actions;
}

interface QgcSimpleItem {
  type?: string;
  command?: number;
  params?: (number | null)[];
}

interface QgcPlan {
  mission?: {
    items?: QgcSimpleItem[];
    plannedHomePosition?: (number | null)[];
  };
}

// QGroundControl .plan JSON. Each SimpleItem carries a 7-element params array
// [p1, p2, p3, p4, x(lat), y(lon), z(alt)]; ComplexItems (surveys) are skipped.
export function parseQgcPlan(plan: QgcPlan): MissionPlanActions {
  const mission = plan.mission;
  if (!mission || !Array.isArray(mission.items)) throw new Error('Not a QGroundControl plan file.');

  const actions: MissionPlanActions = {};
  let seq = 0;

  const home = mission.plannedHomePosition;
  if (Array.isArray(home) && home.length >= 2) {
    actions[seq++] = makeItem('NAV_WAYPOINT', toNum(home[0]), toNum(home[1]), toNum(home[2]), [0, 0, 0, 0]);
  }

  for (const item of mission.items) {
    if (item.type !== 'SimpleItem' || typeof item.command !== 'number') continue;
    const name = commandNameForId(item.command);
    if (!name) continue;
    const p = (item.params ?? []).map(toNum);
    actions[seq++] = makeItem(name, p[4] ?? 0, p[5] ?? 0, p[6] ?? 0, [p[0] ?? 0, p[1] ?? 0, p[2] ?? 0, p[3] ?? 0]);
  }

  if (seq === 0) throw new Error('No supported mission items found in the plan file.');
  return actions;
}

function coordTupleToItem(lon: number, lat: number, alt: number): MissionPlanItem | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return makeItem('NAV_WAYPOINT', lat, lon, Number.isFinite(alt) ? alt : 0, [0, 0, 0, 0]);
}

// Google Earth / KML. Every <coordinates> block is a whitespace-separated list
// of "lon,lat,alt" tuples: a Point carries one, a LineString or LinearRing
// carries the whole path. gx:Track uses <gx:coord>lon lat alt</gx:coord>.
export function parseKml(text: string): MissionPlanActions {
  const actions: MissionPlanActions = {};
  let seq = 0;

  const coordBlocks = text.match(/<coordinates>([\s\S]*?)<\/coordinates>/gi) ?? [];
  for (const block of coordBlocks) {
    const inner = block.replace(/<\/?coordinates>/gi, '');
    for (const tuple of inner.split(/\s+/)) {
      if (!tuple) continue;
      const p = tuple.split(',');
      const item = coordTupleToItem(toNum(p[0]), toNum(p[1]), p.length >= 3 ? toNum(p[2]) : 0);
      if (item) actions[seq++] = item;
    }
  }

  if (seq === 0) {
    const gxBlocks = text.match(/<gx:coord>([\s\S]*?)<\/gx:coord>/gi) ?? [];
    for (const block of gxBlocks) {
      const p = block.replace(/<\/?gx:coord>/gi, '').trim().split(/\s+/);
      const item = coordTupleToItem(toNum(p[0]), toNum(p[1]), p.length >= 3 ? toNum(p[2]) : 0);
      if (item) actions[seq++] = item;
    }
  }

  if (seq === 0) throw new Error('No coordinates found in the KML file.');
  return actions;
}

const LAT_KEYS = ['lat', 'latitude', 'y'];
const LON_KEYS = ['lon', 'lng', 'long', 'longitude', 'x'];
const ALT_KEYS = ['alt', 'altitude', 'elevation', 'elev', 'height', 'agl', 'z'];

function splitCsvLine(line: string): string[] {
  return line.split(/[,;\t]/).map((c) => c.trim());
}

function matchColumn(header: string[], keys: string[]): number {
  return header.findIndex((h) => keys.some((k) => h === k || (k.length > 2 && h.startsWith(k))));
}

// Plain coordinate CSV. A header row maps columns by name (lat/latitude,
// lon/lng/longitude, alt/altitude/elevation); a headerless file is read as
// lat, lon, alt in column order. Comma, semicolon, and tab all delimit.
export function parseCsv(text: string): MissionPlanActions {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length === 0) throw new Error('The CSV file is empty.');

  let latCol = 0;
  let lonCol = 1;
  let altCol = 2;
  let start = 0;

  const firstCols = splitCsvLine(lines[0]);
  const firstIsNumeric =
    firstCols.length >= 2 && firstCols.slice(0, 2).every((c) => c !== '' && Number.isFinite(Number(c)));
  if (!firstIsNumeric) {
    const header = firstCols.map((c) => c.toLowerCase().replace(/[^a-z]/g, ''));
    latCol = matchColumn(header, LAT_KEYS);
    lonCol = matchColumn(header, LON_KEYS);
    altCol = matchColumn(header, ALT_KEYS);
    if (latCol < 0 || lonCol < 0) {
      throw new Error('CSV header must include latitude and longitude columns.');
    }
    start = 1;
  }

  const actions: MissionPlanActions = {};
  let seq = 0;
  for (let i = start; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    const lat = Number(cols[latCol]);
    const lon = Number(cols[lonCol]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const alt = altCol >= 0 && cols[altCol] !== undefined && cols[altCol] !== '' ? toNum(cols[altCol]) : 0;
    actions[seq++] = makeItem('NAV_WAYPOINT', lat, lon, alt, [0, 0, 0, 0]);
  }

  if (seq === 0) throw new Error('No valid coordinate rows found in the CSV file.');
  return actions;
}

async function inflateRaw(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

interface ZipEntry {
  method: number;
  localOffset: number;
  compSize: number;
}

// KMZ is a ZIP archive holding a KML (usually doc.kml). Read the central
// directory to locate the first .kml entry, then inflate or copy its bytes and
// hand the KML to parseKml.
export async function parseKmz(bytes: Uint8Array<ArrayBuffer>): Promise<MissionPlanActions> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();

  let eocd = -1;
  for (let i = bytes.length - 22; i >= 0; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Not a valid KMZ archive.');

  const cdCount = view.getUint16(eocd + 10, true);
  let cdOffset = view.getUint32(eocd + 16, true);

  let named: ZipEntry | null = null;
  let firstKml: ZipEntry | null = null;
  for (let n = 0; n < cdCount; n++) {
    if (view.getUint32(cdOffset, true) !== 0x02014b50) break;
    const method = view.getUint16(cdOffset + 10, true);
    const compSize = view.getUint32(cdOffset + 20, true);
    const nameLen = view.getUint16(cdOffset + 28, true);
    const extraLen = view.getUint16(cdOffset + 30, true);
    const commentLen = view.getUint16(cdOffset + 32, true);
    const localOffset = view.getUint32(cdOffset + 42, true);
    const name = decoder.decode(bytes.subarray(cdOffset + 46, cdOffset + 46 + nameLen));
    if (/\.kml$/i.test(name)) {
      const entry: ZipEntry = { method, localOffset, compSize };
      if (/(^|\/)doc\.kml$/i.test(name)) named = entry;
      else if (!firstKml) firstKml = entry;
    }
    cdOffset += 46 + nameLen + extraLen + commentLen;
  }

  const entry = named ?? firstKml;
  if (!entry) throw new Error('No KML found inside the KMZ archive.');

  if (view.getUint32(entry.localOffset, true) !== 0x04034b50) throw new Error('Corrupt KMZ archive.');
  const lNameLen = view.getUint16(entry.localOffset + 26, true);
  const lExtraLen = view.getUint16(entry.localOffset + 28, true);
  const dataStart = entry.localOffset + 30 + lNameLen + lExtraLen;
  const comp = bytes.subarray(dataStart, dataStart + entry.compSize);
  const raw = entry.method === 0 ? comp : await inflateRaw(comp);
  return parseKml(decoder.decode(raw));
}

function isNativeActions(value: Record<string, unknown>): boolean {
  const items = Object.values(value);
  if (items.length === 0) return false;
  return items.every(
    (item) => item !== null && typeof item === 'object' && 'type' in (item as object) && 'lat' in (item as object)
  );
}

export interface ImportedMission {
  title: string;
  actions: MissionPlanActions;
}

export function parseMissionFile(filename: string, text: string): ImportedMission {
  const title = filename.replace(/\.[^.]+$/, '').replace(/_/g, ' ');
  const ext = (filename.match(/\.([^.]+)$/)?.[1] ?? '').toLowerCase();

  if (ext === 'kml' || /<coordinates>|<kml[\s>]/i.test(text)) {
    return { title, actions: parseKml(text) };
  }

  if (/^\s*QGC WPL/i.test(text)) {
    return { title, actions: parseQgcWpl(text) };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    if (ext === 'csv' || text.includes(',')) {
      return { title, actions: parseCsv(text) };
    }
    throw new Error('Unrecognized mission file. Expected a .plan, .waypoints, .kml, .kmz, .csv, or .json file.');
  }

  if (parsed !== null && typeof parsed === 'object') {
    if ('mission' in parsed) return { title, actions: parseQgcPlan(parsed as QgcPlan) };
    if (isNativeActions(parsed as Record<string, unknown>)) {
      return { title, actions: parsed as MissionPlanActions };
    }
  }

  throw new Error('Unrecognized mission file format.');
}

// Reads a File from the import picker: KMZ is unzipped from its bytes, every
// other format is parsed as text.
export async function readMissionFile(file: File): Promise<ImportedMission> {
  if (/\.kmz$/i.test(file.name)) {
    const title = file.name.replace(/\.[^.]+$/, '').replace(/_/g, ' ');
    const bytes = new Uint8Array(await file.arrayBuffer());
    return { title, actions: await parseKmz(bytes) };
  }
  return parseMissionFile(file.name, await file.text());
}
