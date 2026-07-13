import { get } from 'svelte/store';
import { mavModelStore } from '../stores/mavlinkStore';
import { isPX4 } from './flight-modes';

export interface ParamGroup {
  key: string;
  label: string;
  icon: string;
  blurb: string;
  prefixes: { ardupilot: string[]; px4: string[] };
}

// Curated one-line descriptions for the parameters an operator most often
// reaches for inside each group, keyed by exact parameter id.
export const PARAM_HELP: Record<string, string> = {
  FS_THR_ENABLE: 'Action when the RC link is lost (throttle failsafe).',
  FS_THR_VALUE: 'PWM below which the throttle channel counts as RC loss.',
  FS_GCS_ENABLE: 'Action when the ground-station heartbeat is lost.',
  FS_EKF_ACTION: 'Action when the EKF position estimate fails.',
  FS_OPTIONS: 'Bitmask of failsafe continuation options.',
  FS_CRASH_CHECK: 'Disarm automatically when a crash is detected.',
  BATT_FS_LOW_ACT: 'Action taken at the low-battery threshold.',
  BATT_FS_CRT_ACT: 'Action taken at the critical-battery threshold.',
  NAV_RCL_ACT: 'Action when the RC link is lost.',
  NAV_DLL_ACT: 'Action when the data link (ground station) is lost.',
  COM_LOW_BAT_ACT: 'Action taken as the battery drains.',
  COM_RC_LOSS_T: 'Seconds without RC before the failsafe triggers.',
  GF_ACTION: 'Action when the geofence is breached.',
  LOG_BACKEND_TYPE: 'Where logs are written (SD card, MAVLink, or both).',
  LOG_BITMASK: 'Which message groups are recorded to the log.',
  LOG_DISARMED: 'Keep logging while the vehicle is disarmed.',
  LOG_FILE_DSRMROT: 'Start a new log file each time the vehicle disarms.',
  SDLOG_MODE: 'When the SD-card logger records (armed, from boot, or always).',
  SDLOG_PROFILE: 'Which topic profile the logger records.',
  OSD_TYPE: 'On-screen-display backend driving the video overlay.',
  OSD_CHAN: 'RC channel that switches OSD screens.',
  OSD_UNITS: 'Measurement units shown on the overlay.',
  BATT_MONITOR: 'Battery monitor type and source.',
  BATT_CAPACITY: 'Pack capacity in mAh used for the remaining estimate.',
  BATT_LOW_VOLT: 'Voltage that triggers the low-battery failsafe.',
  BATT_CRT_VOLT: 'Voltage that triggers the critical-battery failsafe.',
  BAT_LOW_THR: 'Remaining fraction that triggers the low-battery warning.',
  BAT_CRIT_THR: 'Remaining fraction that triggers the critical action.',
  BAT_EMERGEN_THR: 'Remaining fraction that triggers the emergency landing.',
  FENCE_ENABLE: 'Turn the geofence on or off.',
  FENCE_ALT_MAX: 'Maximum altitude the fence allows.',
  FENCE_RADIUS: 'Radius of the circular fence around home.',
  FENCE_ACTION: 'Action when the fence is breached.',
  GF_MAX_HOR_DIST: 'Maximum horizontal distance from home before the fence acts.',
  GF_MAX_VER_DIST: 'Maximum altitude before the fence acts.',
  RTL_ALT: 'Altitude the vehicle climbs to before returning home.',
  RTL_LOIT_TIME: 'Time to loiter above home before landing.',
  RTL_RETURN_ALT: 'Altitude the vehicle returns at during RTL.',
  RTL_DESCEND_ALT: 'Altitude the vehicle descends to before the final landing.'
};

export const PARAM_GROUPS: ParamGroup[] = [
  {
    key: 'failsafe',
    label: 'Failsafe',
    icon: 'fa-shield-halved',
    blurb: 'What the vehicle does when RC, the ground link, the battery, or position estimation fails.',
    prefixes: {
      ardupilot: ['FS_', 'BATT_FS'],
      px4: ['NAV_RCL', 'NAV_DLL', 'COM_LOW_BAT', 'COM_RC_LOSS', 'COM_POSCTL_NAVL', 'COM_OBL']
    }
  },
  {
    key: 'logging',
    label: 'Logging',
    icon: 'fa-box-archive',
    blurb: 'Flight-log (blackbox) recording: where logs are written and which messages they capture.',
    prefixes: { ardupilot: ['LOG_'], px4: ['SDLOG_'] }
  },
  {
    key: 'osd',
    label: 'OSD',
    icon: 'fa-tv',
    blurb: 'On-screen-display overlay drawn over the FPV video feed.',
    prefixes: { ardupilot: ['OSD_'], px4: ['OSD_'] }
  },
  {
    key: 'battery',
    label: 'Battery',
    icon: 'fa-battery-half',
    blurb: 'Battery monitoring, capacity, and the voltage thresholds that arm the failsafes.',
    prefixes: { ardupilot: ['BATT_'], px4: ['BAT_', 'BAT1_'] }
  },
  {
    key: 'geofence',
    label: 'Geofence',
    icon: 'fa-draw-polygon',
    blurb: 'Virtual boundary the vehicle refuses to cross, and what it does at the edge.',
    prefixes: { ardupilot: ['FENCE_'], px4: ['GF_'] }
  },
  {
    key: 'return',
    label: 'Return',
    icon: 'fa-house',
    blurb: 'Return-to-launch behavior: the climb, the path home, and the landing sequence.',
    prefixes: { ardupilot: ['RTL_'], px4: ['RTL_'] }
  }
];

export function prefixesFor(group: ParamGroup, model: string = get(mavModelStore)): string[] {
  return isPX4(model) ? group.prefixes.px4 : group.prefixes.ardupilot;
}

export function paramInGroup(
  paramId: string,
  group: ParamGroup,
  model: string = get(mavModelStore)
): boolean {
  const id = paramId.replace(/^"|"$/g, '').toUpperCase();
  return prefixesFor(group, model).some((p) => id.startsWith(p));
}

export function helpFor(paramId: string): string | undefined {
  return PARAM_HELP[paramId.replace(/^"|"$/g, '').toUpperCase()];
}
