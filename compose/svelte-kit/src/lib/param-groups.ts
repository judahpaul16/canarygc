import { get } from 'svelte/store';
import { mavModelStore } from '../stores/mavlinkStore';
import { isPX4 } from './flight-modes';
import { m } from '$lib/paraglide/messages';

export interface ParamGroup {
  key: string;
  label: () => string;
  icon: string;
  blurb: () => string;
  prefixes: { ardupilot: string[]; px4: string[] };
}

// Curated one-line descriptions for the parameters an operator most often
// reaches for inside each group, keyed by exact parameter id.
export const PARAM_HELP: Record<string, () => string> = {
  FS_THR_ENABLE: m.param_help_fs_thr_enable,
  FS_THR_VALUE: m.param_help_fs_thr_value,
  FS_GCS_ENABLE: m.param_help_fs_gcs_enable,
  FS_EKF_ACTION: m.param_help_fs_ekf_action,
  FS_OPTIONS: m.param_help_fs_options,
  FS_CRASH_CHECK: m.param_help_fs_crash_check,
  BATT_FS_LOW_ACT: m.param_help_batt_fs_low_act,
  BATT_FS_CRT_ACT: m.param_help_batt_fs_crt_act,
  NAV_RCL_ACT: m.param_help_nav_rcl_act,
  NAV_DLL_ACT: m.param_help_nav_dll_act,
  COM_LOW_BAT_ACT: m.param_help_com_low_bat_act,
  COM_RC_LOSS_T: m.param_help_com_rc_loss_t,
  GF_ACTION: m.param_help_gf_action,
  LOG_BACKEND_TYPE: m.param_help_log_backend_type,
  LOG_BITMASK: m.param_help_log_bitmask,
  LOG_DISARMED: m.param_help_log_disarmed,
  LOG_FILE_DSRMROT: m.param_help_log_file_dsrmrot,
  SDLOG_MODE: m.param_help_sdlog_mode,
  SDLOG_PROFILE: m.param_help_sdlog_profile,
  OSD_TYPE: m.param_help_osd_type,
  OSD_CHAN: m.param_help_osd_chan,
  OSD_UNITS: m.param_help_osd_units,
  BATT_MONITOR: m.param_help_batt_monitor,
  BATT_CAPACITY: m.param_help_batt_capacity,
  BATT_LOW_VOLT: m.param_help_batt_low_volt,
  BATT_CRT_VOLT: m.param_help_batt_crt_volt,
  BAT_LOW_THR: m.param_help_bat_low_thr,
  BAT_CRIT_THR: m.param_help_bat_crit_thr,
  BAT_EMERGEN_THR: m.param_help_bat_emergen_thr,
  FENCE_ENABLE: m.param_help_fence_enable,
  FENCE_ALT_MAX: m.param_help_fence_alt_max,
  FENCE_RADIUS: m.param_help_fence_radius,
  FENCE_ACTION: m.param_help_fence_action,
  GF_MAX_HOR_DIST: m.param_help_gf_max_hor_dist,
  GF_MAX_VER_DIST: m.param_help_gf_max_ver_dist,
  RTL_ALT: m.param_help_rtl_alt,
  RTL_LOIT_TIME: m.param_help_rtl_loit_time,
  RTL_RETURN_ALT: m.param_help_rtl_return_alt,
  RTL_DESCEND_ALT: m.param_help_rtl_descend_alt
};

export const PARAM_GROUPS: ParamGroup[] = [
  {
    key: 'failsafe',
    label: m.param_group_failsafe,
    icon: 'fa-shield-halved',
    blurb: m.param_group_failsafe_blurb,
    prefixes: {
      ardupilot: ['FS_', 'BATT_FS'],
      px4: ['NAV_RCL', 'NAV_DLL', 'COM_LOW_BAT', 'COM_RC_LOSS', 'COM_POSCTL_NAVL', 'COM_OBL']
    }
  },
  {
    key: 'logging',
    label: m.param_group_logging,
    icon: 'fa-box-archive',
    blurb: m.param_group_logging_blurb,
    prefixes: { ardupilot: ['LOG_'], px4: ['SDLOG_'] }
  },
  {
    key: 'osd',
    label: m.param_group_osd,
    icon: 'fa-tv',
    blurb: m.param_group_osd_blurb,
    prefixes: { ardupilot: ['OSD_'], px4: ['OSD_'] }
  },
  {
    key: 'battery',
    label: m.param_group_battery,
    icon: 'fa-battery-half',
    blurb: m.param_group_battery_blurb,
    prefixes: { ardupilot: ['BATT_'], px4: ['BAT_', 'BAT1_'] }
  },
  {
    key: 'geofence',
    label: m.param_group_geofence,
    icon: 'fa-draw-polygon',
    blurb: m.param_group_geofence_blurb,
    prefixes: { ardupilot: ['FENCE_'], px4: ['GF_'] }
  },
  {
    key: 'return',
    label: m.param_group_return,
    icon: 'fa-house',
    blurb: m.param_group_return_blurb,
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
  return PARAM_HELP[paramId.replace(/^"|"$/g, '').toUpperCase()]?.();
}
