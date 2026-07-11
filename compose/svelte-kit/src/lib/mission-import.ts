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

  if (/^\s*QGC WPL/i.test(text)) {
    return { title, actions: parseQgcWpl(text) };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Unrecognized mission file. Expected a .plan, .waypoints, or .json file.');
  }

  if (parsed !== null && typeof parsed === 'object') {
    if ('mission' in parsed) return { title, actions: parseQgcPlan(parsed as QgcPlan) };
    if (isNativeActions(parsed as Record<string, unknown>)) {
      return { title, actions: parsed as MissionPlanActions };
    }
  }

  throw new Error('Unrecognized mission file format.');
}
