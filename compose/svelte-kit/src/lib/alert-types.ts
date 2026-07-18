import { m } from '$lib/paraglide/messages';
import type { Locale } from '$lib/paraglide/runtime';

// A paraglide message accessor for the no-input alert strings: resolves with the
// ambient UI locale on the client, or an explicit operator locale for emails.
type AlertMessage = (input?: Record<string, never>, options?: { locale?: Locale }) => string;

export interface AlertType {
  id: string;
  label: AlertMessage;
  icon: string;
  description: AlertMessage;
}

// The alert catalog mirrors the spoken telemetry callouts. Each id is both the
// toggle key (alert.enabled.<id>) and the event the client dispatcher fires.
export const ALERT_TYPES: AlertType[] = [
  { id: 'armed', label: m.alert_armed_label, icon: 'fa-lock', description: m.alert_armed_desc },
  { id: 'disarmed', label: m.alert_disarmed_label, icon: 'fa-lock-open', description: m.alert_disarmed_desc },
  { id: 'mode', label: m.alert_mode_label, icon: 'fa-sliders', description: m.alert_mode_desc },
  { id: 'mission_complete', label: m.alert_mission_complete_label, icon: 'fa-flag-checkered', description: m.alert_mission_complete_desc },
  { id: 'failsafe', label: m.alert_failsafe_label, icon: 'fa-triangle-exclamation', description: m.alert_failsafe_desc },
  { id: 'emergency', label: m.alert_emergency_label, icon: 'fa-burst', description: m.alert_emergency_desc },
  { id: 'crash', label: m.alert_crash_label, icon: 'fa-plane-circle-exclamation', description: m.alert_crash_desc },
  { id: 'battery_low', label: m.alert_battery_low_label, icon: 'fa-battery-quarter', description: m.alert_battery_low_desc },
  { id: 'battery_critical', label: m.alert_battery_critical_label, icon: 'fa-battery-empty', description: m.alert_battery_critical_desc },
  { id: 'gps_lost', label: m.alert_gps_lost_label, icon: 'fa-satellite-dish', description: m.alert_gps_lost_desc },
  { id: 'gps_acquired', label: m.alert_gps_acquired_label, icon: 'fa-satellite', description: m.alert_gps_acquired_desc },
  { id: 'link_lost', label: m.alert_link_lost_label, icon: 'fa-plug-circle-xmark', description: m.alert_link_lost_desc },
  { id: 'link_restored', label: m.alert_link_restored_label, icon: 'fa-plug-circle-check', description: m.alert_link_restored_desc }
];

export const ALERT_IDS = ALERT_TYPES.map((a) => a.id);

export interface AlertTelemetry {
  lat: number;
  lon: number;
  altitude: number;
  speed: number;
  heading: number;
  battery: number | null;
  mode: string;
  armed: boolean;
  state: string;
  satellites: number;
  hdop: number;
  model: string;
  type: string;
  online: boolean;
}

export interface AlertPayload {
  type: string;
  // Raw values for the event; the notify handler composes the description in the
  // operator's locale so the email never carries the client's UI language.
  params: Record<string, string | number>;
  telemetry: AlertTelemetry;
}
