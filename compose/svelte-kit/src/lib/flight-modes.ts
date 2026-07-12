import { get } from 'svelte/store';
import { mavModelStore, mavTypeStore } from '../stores/mavlinkStore';

export type FlightMode = 'GUIDED' | 'AUTO' | 'RTL' | 'LOITER' | 'LAND';

export const MAV_MODE_FLAG_SAFETY_ARMED = 128;
export const MAV_MODE_FLAG_CUSTOM_MODE_ENABLED = 1;

// DO_SET_MODE params per autopilot: [param1 baseMode, param2 customMode, param3 customSubMode]
interface AutopilotStrategy {
  setModeParams(mode: FlightMode): [number, number, number];
  decodeCustomMode(customMode: number): string;
  supportsLocalSetpoint: boolean;
}

// ArduPilot Copter custom modes (mavlink-mappings ardupilotmega CopterMode)
const COPTER_MODE: Record<FlightMode, number> = {
  AUTO: 3,
  GUIDED: 4,
  LOITER: 5,
  RTL: 6,
  LAND: 9
};

const COPTER_MODE_NAMES: Record<number, string> = {
  0: 'STABILIZE', 1: 'ACRO', 2: 'ALT_HOLD', 3: 'AUTO', 4: 'GUIDED', 5: 'LOITER',
  6: 'RTL', 7: 'CIRCLE', 9: 'LAND', 11: 'DRIFT', 13: 'SPORT', 14: 'FLIP',
  15: 'AUTOTUNE', 16: 'POSHOLD', 17: 'BRAKE', 18: 'THROW', 19: 'AVOID_ADSB',
  20: 'GUIDED_NOGPS', 21: 'SMART_RTL', 22: 'FLOWHOLD', 23: 'FOLLOW', 24: 'ZIGZAG',
  25: 'SYSTEMID', 26: 'AUTOROTATE', 27: 'AUTO_RTL'
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

const arduPilotStrategy: AutopilotStrategy = {
  setModeParams(mode) {
    return [MAV_MODE_FLAG_CUSTOM_MODE_ENABLED, COPTER_MODE[mode], 0];
  },
  decodeCustomMode(customMode) {
    return COPTER_MODE_NAMES[customMode] ?? `MODE(${customMode})`;
  },
  supportsLocalSetpoint: true
};

const px4Strategy: AutopilotStrategy = {
  setModeParams(mode) {
    switch (mode) {
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

export function isPX4(model: string = get(mavModelStore)): boolean {
  return model.toUpperCase().includes('PX4');
}

export function strategyFor(model: string = get(mavModelStore)): AutopilotStrategy {
  return isPX4(model) ? px4Strategy : arduPilotStrategy;
}

export function decodeMode(customMode: number, model: string = get(mavModelStore)): string {
  return strategyFor(model).decodeCustomMode(customMode);
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
