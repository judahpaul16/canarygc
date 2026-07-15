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
// Which protocol the connected flight controller speaks: a MAVLink autopilot
// (ArduPilot, PX4) or an MSP board (Betaflight, INAV). The flight controls
// dispatch on this and on the firmware below.
export const fcProtocolStore = writable<'mavlink' | 'msp' | null>(null);
// The MSP firmware, which decides how a mission flies: INAV navigates onboard
// (upload waypoints, then arm and engage NAV WP over MSP, the same as a MAVLink
// autopilot), while Betaflight has no waypoint engine and flies by companion
// guidance from the station.
export const fcFirmwareStore = writable<'Betaflight' | 'INAV' | 'Cleanflight' | 'Unknown' | null>(null);
export const mavModelStore = writable<string>('UNKNOWN');
export const mavTypeStore = writable<string>('Unknown');
export const mavArmedStateStore = writable<boolean>(false);
export const mavStateStore = writable<string>('Unknown');
export const mavModeStore = writable<string>('Unknown');
export const mavLocationStore = writable<import('leaflet').LatLng | { lat: number; lng: number }>(latLng);
// The vehicle's home (launch/return point) from HOME_POSITION telemetry; null
// until the autopilot reports one.
export const mavHomeStore = writable<{ lat: number; lon: number } | null>(null);
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