import { get } from 'svelte/store';
import { mavModelStore, mavTypeStore } from '../stores/mavlinkStore';

// POSCTL is the app's stick-flying intent: each stack resolves it to its
// native pilot position mode (PX4 Position, ArduPilot Loiter).
export type FlightMode = 'GUIDED' | 'AUTO' | 'RTL' | 'LOITER' | 'LAND' | 'POSCTL';

export const MAV_MODE_FLAG_SAFETY_ARMED = 128;
export const MAV_MODE_FLAG_CUSTOM_MODE_ENABLED = 1;

// DO_SET_MODE params per autopilot: [param1 baseMode, param2 customMode, param3 customSubMode]
interface AutopilotStrategy {
  setModeParams(mode: FlightMode): [number, number, number];
  decodeCustomMode(customMode: number): string;
  supportsLocalSetpoint: boolean;
}

// ArduPilot numbers its flight modes differently per vehicle, so each intent
// mode resolves through the connected vehicle's own table. POSCTL is the
// stick-flying hold: Loiter on copter, Cruise on plane (auto-throttle keeps a
// spring-centered gamepad stick from stalling it while the stick steers),
// Manual on rover, and depth-holding AltHold on a sub. LAND has no plane or
// rover equivalent, so it falls back to the safe "come home / stop" mode for
// that vehicle.
const COPTER_MODES: Record<FlightMode, number> = {
  GUIDED: 4, AUTO: 3, RTL: 6, LOITER: 5, LAND: 9, POSCTL: 5
};
const PLANE_MODES: Record<FlightMode, number> = {
  GUIDED: 15, AUTO: 10, RTL: 11, LOITER: 12, LAND: 11, POSCTL: 7
};
const ROVER_MODES: Record<FlightMode, number> = {
  GUIDED: 15, AUTO: 10, RTL: 11, LOITER: 5, LAND: 4, POSCTL: 0
};
const SUB_MODES: Record<FlightMode, number> = {
  GUIDED: 4, AUTO: 3, RTL: 9, LOITER: 16, LAND: 9, POSCTL: 2
};

const COPTER_MODE_NAMES: Record<number, string> = {
  0: 'STABILIZE', 1: 'ACRO', 2: 'ALT_HOLD', 3: 'AUTO', 4: 'GUIDED', 5: 'LOITER',
  6: 'RTL', 7: 'CIRCLE', 9: 'LAND', 11: 'DRIFT', 13: 'SPORT', 14: 'FLIP',
  15: 'AUTOTUNE', 16: 'POSHOLD', 17: 'BRAKE', 18: 'THROW', 19: 'AVOID_ADSB',
  20: 'GUIDED_NOGPS', 21: 'SMART_RTL', 22: 'FLOWHOLD', 23: 'FOLLOW', 24: 'ZIGZAG',
  25: 'SYSTEMID', 26: 'AUTOROTATE', 27: 'AUTO_RTL'
};

const PLANE_MODE_NAMES: Record<number, string> = {
  0: 'MANUAL', 1: 'CIRCLE', 2: 'STABILIZE', 3: 'TRAINING', 4: 'ACRO', 5: 'FBWA',
  6: 'FBWB', 7: 'CRUISE', 8: 'AUTOTUNE', 10: 'AUTO', 11: 'RTL', 12: 'LOITER',
  13: 'TAKEOFF', 14: 'AVOID_ADSB', 15: 'GUIDED', 16: 'INITIALISING',
  17: 'QSTABILIZE', 18: 'QHOVER', 19: 'QLOITER', 20: 'QLAND', 21: 'QRTL',
  22: 'QAUTOTUNE', 23: 'QACRO', 24: 'THERMAL', 25: 'LOITER_TO_QLAND'
};

const ROVER_MODE_NAMES: Record<number, string> = {
  0: 'MANUAL', 1: 'ACRO', 3: 'STEERING', 4: 'HOLD', 5: 'LOITER', 6: 'FOLLOW',
  7: 'SIMPLE', 8: 'DOCK', 9: 'CIRCLE', 10: 'AUTO', 11: 'RTL', 12: 'SMART_RTL',
  15: 'GUIDED', 16: 'INITIALISING'
};

const SUB_MODE_NAMES: Record<number, string> = {
  0: 'STABILIZE', 1: 'ACRO', 2: 'ALT_HOLD', 3: 'AUTO', 4: 'GUIDED', 7: 'CIRCLE',
  9: 'SURFACE', 16: 'POSHOLD', 19: 'MANUAL', 20: 'MOTOR_DETECT', 21: 'SURFTRAK'
};

// PX4 encodes customMode as (main_mode << 16) | (sub_mode << 24) on the wire the
// full 32-bit custom_mode is main in bits 16-23 and sub in bits 24-31.
const PX4_MAIN = {
  MANUAL: 1, ALTCTL: 2, POSCTL: 3, AUTO: 4, ACRO: 5, OFFBOARD: 6, STABILIZED: 7, RATTITUDE: 8
} as const;

const PX4_AUTO_SUB = {
  READY: 1, TAKEOFF: 2, LOITER: 3, MISSION: 4, RTL: 5, LAND: 6, RTGS: 7, FOLLOW_TARGET: 8, PRECLAND: 9
} as const;

const PX4_MAIN_NAMES: Record<number, string> = {
  1: 'MANUAL', 2: 'ALTCTL', 3: 'POSCTL', 4: 'AUTO', 5: 'ACRO', 6: 'OFFBOARD', 7: 'STABILIZED', 8: 'RATTITUDE'
};

const PX4_AUTO_SUB_NAMES: Record<number, string> = {
  1: 'AUTO.READY', 2: 'AUTO.TAKEOFF', 3: 'AUTO.LOITER', 4: 'AUTO.MISSION', 5: 'AUTO.RTL',
  6: 'AUTO.LAND', 7: 'AUTO.RTGS', 8: 'AUTO.FOLLOW_TARGET', 9: 'AUTO.PRECLAND'
};

function arduPilotStrategy(
  modes: Record<FlightMode, number>,
  names: Record<number, string>
): AutopilotStrategy {
  return {
    setModeParams(mode) {
      return [MAV_MODE_FLAG_CUSTOM_MODE_ENABLED, modes[mode], 0];
    },
    decodeCustomMode(customMode) {
      return names[customMode] ?? `MODE(${customMode})`;
    },
    supportsLocalSetpoint: true
  };
}

const copterStrategy = arduPilotStrategy(COPTER_MODES, COPTER_MODE_NAMES);
const planeStrategy = arduPilotStrategy(PLANE_MODES, PLANE_MODE_NAMES);
const roverStrategy = arduPilotStrategy(ROVER_MODES, ROVER_MODE_NAMES);
const subStrategy = arduPilotStrategy(SUB_MODES, SUB_MODE_NAMES);

type ArduClass = 'copter' | 'plane' | 'rover' | 'sub';

function arduClassFor(type: string): ArduClass {
  if (/submarine/i.test(type)) return 'sub';
  if (/rover|boat/i.test(type)) return 'rover';
  if (/wing|vtol/i.test(type)) return 'plane';
  return 'copter';
}

const ARDU_STRATEGIES: Record<ArduClass, AutopilotStrategy> = {
  copter: copterStrategy,
  plane: planeStrategy,
  rover: roverStrategy,
  sub: subStrategy
};

const px4Strategy: AutopilotStrategy = {
  setModeParams(mode) {
    switch (mode) {
      case 'POSCTL':
        return [MAV_MODE_FLAG_CUSTOM_MODE_ENABLED, PX4_MAIN.POSCTL, 0];
      case 'GUIDED':
      case 'LOITER':
        return [MAV_MODE_FLAG_CUSTOM_MODE_ENABLED, PX4_MAIN.AUTO, PX4_AUTO_SUB.LOITER];
      case 'AUTO':
        return [MAV_MODE_FLAG_CUSTOM_MODE_ENABLED, PX4_MAIN.AUTO, PX4_AUTO_SUB.MISSION];
      case 'RTL':
        return [MAV_MODE_FLAG_CUSTOM_MODE_ENABLED, PX4_MAIN.AUTO, PX4_AUTO_SUB.RTL];
      case 'LAND':
        return [MAV_MODE_FLAG_CUSTOM_MODE_ENABLED, PX4_MAIN.AUTO, PX4_AUTO_SUB.LAND];
    }
  },
  decodeCustomMode(customMode) {
    const main = (customMode >> 16) & 0xff;
    const sub = (customMode >> 24) & 0xff;
    if (main === PX4_MAIN.AUTO && PX4_AUTO_SUB_NAMES[sub]) return PX4_AUTO_SUB_NAMES[sub];
    return PX4_MAIN_NAMES[main] ?? `MODE(${customMode})`;
  },
  supportsLocalSetpoint: false
};

// Ground and water vehicles fly nothing; airspace-related chrome keys off this.
export function isAirVehicle(type: string = get(mavTypeStore)): boolean {
  return !!type && !/rover|boat|submarine/i.test(type);
}

// Submarines move through a depth axis instead of altitude; the go-to control
// commands depth (below the surface) rather than height above it.
export function isSubmarine(type: string = get(mavTypeStore)): boolean {
  return /submarine/i.test(type);
}

// Rovers and boats move only in the surface plane, so a vertical go-to control
// has no meaning for them.
export function isGroundOrSurface(type: string = get(mavTypeStore)): boolean {
  return /rover|boat/i.test(type);
}

// Fixed-wing and VTOL craft launch through ArduPlane's own TAKEOFF mode rather
// than a copter-style climb-in-place command.
export function isPlane(type: string = get(mavTypeStore)): boolean {
  return /wing|vtol/i.test(type);
}

export function isPX4(model: string = get(mavModelStore)): boolean {
  return model.toUpperCase().includes('PX4');
}

export function strategyFor(
  model: string = get(mavModelStore),
  type: string = get(mavTypeStore)
): AutopilotStrategy {
  return isPX4(model) ? px4Strategy : ARDU_STRATEGIES[arduClassFor(type)];
}

export function decodeMode(
  customMode: number,
  model: string = get(mavModelStore),
  type: string = get(mavTypeStore)
): string {
  return strategyFor(model, type).decodeCustomMode(customMode);
}

export function isArmed(baseMode: number): boolean {
  return (baseMode & MAV_MODE_FLAG_SAFETY_ARMED) !== 0;
}

// The mission progress and control gates treat these labels as "mission running"
// and "hold" respectively, across both autopilot families.
export function isAutoLabel(label: string): boolean {
  return label.includes('AUTO') && !label.includes('AUTO.LOITER');
}

export function isGuidedLabel(label: string): boolean {
  return label.includes('GUIDED') || label.includes('AUTO.LOITER');
}
