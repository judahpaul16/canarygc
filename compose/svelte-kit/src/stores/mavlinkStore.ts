import { writable } from 'svelte/store';

const latLng = { lat: 33.79105092934356, lng: -84.37130870603511 };

export interface Parameter {
    param_id: string;
    param_value: number;
    param_type: number;
    param_count: number;
    param_index: number;
}

export interface ParameterMeta {
    min?: number;
    max?: number;
    increment?: number;
    description?: string;
    units?: string;
}

export const onlineStore = writable<boolean>(false);
// Which protocol the connected flight controller speaks. A Betaflight or INAV
// board is 'msp' and answers none of the autonomous MAVLink commands (takeoff,
// land, missions, parameters), so the dashboard gates those controls on it.
export const fcProtocolStore = writable<'mavlink' | 'msp' | null>(null);
export const mavModelStore = writable<string>('UNKNOWN');
export const mavTypeStore = writable<string>('Unknown');
export const mavArmedStateStore = writable<boolean>(false);
export const mavStateStore = writable<string>('Unknown');
export const mavModeStore = writable<string>('Unknown');
export const mavLocationStore = writable<import('leaflet').LatLng | { lat: number; lng: number }>(latLng);
export const mavSatelliteStore = writable<{ total: number; hdop: number }>({ total: 0, hdop: 999.0 });
export const mavHeadingStore = writable<number>(320);
export const mavAltitudeStore = writable<number>(0);
// Altitude above mean sea level; PX4's DO_REPOSITION reads its altitude as
// AMSL regardless of the declared frame.
export const mavAltitudeAmslStore = writable<number>(0);
export const mavSpeedStore = writable<number>(0);
// Roll and pitch in degrees for the artificial-horizon HUD; yaw comes from
// mavHeadingStore. Positive roll banks right, positive pitch is nose-up.
export const mavAttitudeStore = writable<{ rollDeg: number; pitchDeg: number }>({
    rollDeg: 0,
    pitchDeg: 0
});
// Accelerometer vibration levels and clipping counts from the VIBRATION
// message; the AI PID tuning assistant reads these as a tuning-health signal.
export const mavVibrationStore = writable<{
    x: number;
    y: number;
    z: number;
    clip0: number;
    clip1: number;
    clip2: number;
} | null>(null);
// Per-output servo/motor PWM (microseconds) from SERVO_OUTPUT_RAW; the
// calibration page shows these live during an ESC or motor test.
export const mavServoOutputStore = writable<number[]>([]);
export const mavBatteryStore = writable<number|null>(null);
// A camera stream the vehicle advertises via VIDEO_STREAM_INFORMATION; its uri
// is offered as a ready-to-use RTSP source for the live feed.
export const mavVideoStreamStore = writable<{ uri: string; name: string } | null>(null);
export const mavlinkLogStore = writable<string[]>([]);
export const mavlinkParamStore = writable<{[key: string]: Parameter}>({});