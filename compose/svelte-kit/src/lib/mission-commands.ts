import type { MissionPlanActions } from '../stores/missionPlanStore';

const FRAME_GLOBAL_RELATIVE_ALT = 3;
const FRAME_MISSION = 2;

type Px4Support = 'ok' | 'drop' | { substitute: string };

interface CommandSpec {
  id: number;
  positional: boolean;
  // 'ok' runs as-is; 'drop' is skipped for PX4; an object rewrites it to an equivalent.
  px4: Px4Support;
}

// Autopilot-neutral mission command table. IDs are the standard MAV_CMD values.
// ArduPilot accepts the whole table; the px4 field records what PX4 can run.
export const MISSION_COMMANDS: Record<string, CommandSpec> = {
  NAV_WAYPOINT: { id: 16, positional: true, px4: 'ok' },
  NAV_LOITER_UNLIM: { id: 17, positional: true, px4: 'ok' },
  NAV_LOITER_TURNS: { id: 18, positional: true, px4: 'drop' },
  NAV_LOITER_TIME: { id: 19, positional: true, px4: 'ok' },
  NAV_RETURN_TO_LAUNCH: { id: 20, positional: false, px4: 'ok' },
  NAV_LAND: { id: 21, positional: true, px4: 'ok' },
  NAV_TAKEOFF: { id: 22, positional: true, px4: 'ok' },
  NAV_LOITER_TO_ALT: { id: 31, positional: true, px4: 'ok' },
  NAV_SPLINE_WAYPOINT: { id: 82, positional: true, px4: { substitute: 'NAV_WAYPOINT' } },
  NAV_VTOL_TAKEOFF: { id: 84, positional: true, px4: 'ok' },
  NAV_VTOL_LAND: { id: 85, positional: true, px4: 'ok' },
  NAV_GUIDED_ENABLE: { id: 92, positional: false, px4: 'drop' },
  NAV_DELAY: { id: 93, positional: false, px4: 'ok' },
  NAV_PAYLOAD_PLACE: { id: 94, positional: true, px4: 'drop' },
  CONDITION_DELAY: { id: 112, positional: false, px4: 'drop' },
  CONDITION_CHANGE_ALT: { id: 113, positional: false, px4: 'drop' },
  CONDITION_DISTANCE: { id: 114, positional: false, px4: 'drop' },
  CONDITION_YAW: { id: 115, positional: false, px4: 'drop' },
  DO_JUMP: { id: 177, positional: false, px4: 'ok' },
  DO_CHANGE_SPEED: { id: 178, positional: false, px4: 'ok' },
  DO_SET_SERVO: { id: 183, positional: false, px4: 'ok' },
  DO_REPEAT_SERVO: { id: 184, positional: false, px4: 'drop' },
  DO_LAND_START: { id: 189, positional: false, px4: 'ok' },
  DO_SET_ROI: { id: 201, positional: true, px4: 'ok' },
  DO_DIGICAM_CONFIGURE: { id: 202, positional: false, px4: 'drop' },
  DO_DIGICAM_CONTROL: { id: 203, positional: false, px4: 'ok' },
  DO_MOUNT_CONTROL: { id: 205, positional: false, px4: 'ok' },
  DO_SET_CAM_TRIGG_DIST: { id: 206, positional: false, px4: 'ok' },
  DO_FENCE_ENABLE: { id: 207, positional: false, px4: 'drop' },
  DO_GRIPPER: { id: 211, positional: false, px4: 'drop' },
  DO_ENGINE_CONTROL: { id: 223, positional: false, px4: 'drop' },
  DO_WINCH: { id: 42600, positional: false, px4: 'drop' }
};

const ID_TO_NAME = new Map<number, string>(
  Object.entries(MISSION_COMMANDS).map(([name, spec]) => [spec.id, name])
);

export function commandNameForId(id: number): string | undefined {
  return ID_TO_NAME.get(id);
}

export interface NormalizedMissionItem {
  command: number;
  frame: number;
  param1: number;
  param2: number;
  param3: number;
  param4: number;
  lat: number;
  lon: number;
  alt: number;
}

export interface NormalizeResult {
  items: NormalizedMissionItem[];
  warnings: string[];
}

// Resolves the neutral plan into wire-ready items for the connected autopilot.
// PX4 loses commands it cannot run (substituted or skipped) with a warning each.
export function normalizeMission(actions: MissionPlanActions, targetIsPX4: boolean): NormalizeResult {
  const warnings: string[] = [];
  const items: NormalizedMissionItem[] = [];
  const indices = Object.keys(actions)
    .map(Number)
    .sort((a, b) => a - b);

  for (const index of indices) {
    const item = actions[index];
    let name = item.type;
    let spec: CommandSpec | undefined = MISSION_COMMANDS[name];

    if (!spec) {
      warnings.push(`Item ${index}: unknown command ${name}, skipped.`);
      continue;
    }

    if (targetIsPX4 && spec.px4 !== 'ok') {
      if (spec.px4 === 'drop') {
        warnings.push(`Item ${index}: ${name} is not supported on PX4, skipped.`);
        continue;
      }
      warnings.push(`Item ${index}: ${name} replaced with ${spec.px4.substitute} for PX4.`);
      name = spec.px4.substitute;
      spec = MISSION_COMMANDS[name];
    }

    items.push({
      command: spec.id,
      frame: spec.positional ? FRAME_GLOBAL_RELATIVE_ALT : FRAME_MISSION,
      param1: item.param1 ?? 0,
      param2: item.param2 ?? 0,
      param3: item.param3 ?? 0,
      param4: item.param4 ?? 0,
      lat: item.lat ?? 0,
      lon: item.lon ?? 0,
      alt: item.alt ?? 0
    });
  }

  return { items, warnings };
}
