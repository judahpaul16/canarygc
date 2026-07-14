export interface AlertType {
  id: string;
  label: string;
  icon: string;
  description: string;
}

// The alert catalog mirrors the spoken telemetry callouts. Each id is both the
// toggle key (alert.enabled.<id>) and the event the client dispatcher fires.
export const ALERT_TYPES: AlertType[] = [
  { id: 'armed', label: 'Armed', icon: 'fa-lock', description: 'The vehicle armed.' },
  { id: 'disarmed', label: 'Disarmed', icon: 'fa-lock-open', description: 'The vehicle disarmed.' },
  { id: 'mode', label: 'Flight mode change', icon: 'fa-sliders', description: 'The flight mode changed.' },
  { id: 'mission_complete', label: 'Mission complete', icon: 'fa-flag-checkered', description: 'The mission finished.' },
  { id: 'failsafe', label: 'Failsafe', icon: 'fa-triangle-exclamation', description: 'The vehicle entered a failsafe state.' },
  { id: 'emergency', label: 'Emergency', icon: 'fa-burst', description: 'The vehicle reported an emergency.' },
  { id: 'crash', label: 'Crash detected', icon: 'fa-plane-circle-exclamation', description: 'A likely crash: the vehicle disarmed while still airborne.' },
  { id: 'battery_low', label: 'Battery low', icon: 'fa-battery-quarter', description: 'Battery dropped to the low threshold.' },
  { id: 'battery_critical', label: 'Battery critical', icon: 'fa-battery-empty', description: 'Battery reached the critical threshold.' },
  { id: 'gps_lost', label: 'GPS signal lost', icon: 'fa-satellite-dish', description: 'GPS dropped below a usable fix.' },
  { id: 'gps_acquired', label: 'GPS fix acquired', icon: 'fa-satellite', description: 'GPS regained a usable fix.' },
  { id: 'link_lost', label: 'Link lost', icon: 'fa-plug-circle-xmark', description: 'The telemetry link dropped.' },
  { id: 'link_restored', label: 'Link restored', icon: 'fa-plug-circle-check', description: 'The telemetry link came back.' }
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
  description: string;
  telemetry: AlertTelemetry;
}
