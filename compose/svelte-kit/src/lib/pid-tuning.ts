import { isPX4 } from './flight-modes';
import type { Parameter } from '../stores/mavlinkStore';

// The rate and attitude PID gains an operator tunes, per autopilot family.
const PID_PREFIXES = {
  ardupilot: ['ATC_RAT_', 'ATC_ANG_'],
  px4: ['MC_ROLLRATE', 'MC_PITCHRATE', 'MC_YAWRATE', 'MC_ROLL_P', 'MC_PITCH_P', 'MC_YAW_P']
};

export interface PidValue {
  param_id: string;
  value: number;
}

export interface VibrationSnapshot {
  x: number;
  y: number;
  z: number;
  clip0: number;
  clip1: number;
  clip2: number;
}

export interface AttitudeSnapshot {
  rollDeg: number;
  pitchDeg: number;
}

export interface TuningContext {
  model: string;
  pids: PidValue[];
  vibration?: VibrationSnapshot | null;
  attitude?: AttitudeSnapshot | null;
}

export interface TuningRecommendation {
  param_id: string;
  current: number;
  suggested: number;
  reason: string;
}

export interface TuningResult {
  summary: string;
  recommendations: TuningRecommendation[];
}

export function pidPrefixes(model: string): string[] {
  return isPX4(model) ? PID_PREFIXES.px4 : PID_PREFIXES.ardupilot;
}

export function isPidParam(paramId: string, model: string): boolean {
  const id = paramId.replace(/^"|"$/g, '').toUpperCase();
  return pidPrefixes(model).some((p) => id.startsWith(p));
}

export function collectPidParams(params: Parameter[], model: string): PidValue[] {
  return params
    .filter((p) => isPidParam(p.param_id, model))
    .map((p) => ({ param_id: p.param_id.replace(/^"|"$/g, ''), value: p.param_value }));
}

export function buildTuningPrompt(context: TuningContext): { system: string; user: string } {
  const family = isPX4(context.model) ? 'PX4' : 'ArduPilot';

  const system =
    `You are a flight-control tuning expert for multirotor drones running ${family}. ` +
    'Given the current rate and attitude PID gains plus recent vibration and attitude telemetry, ' +
    'recommend conservative gain changes that reduce oscillation and improve tracking. ' +
    'Keep every change within 30 percent of the current value and never suggest an unsafe gain. ' +
    'Respond with a single JSON object and nothing else, matching: ' +
    '{"summary": string, "recommendations": [{"param_id": string, "current": number, "suggested": number, "reason": string}]}. ' +
    'Only include parameters that should change. Return an empty recommendations array when the tune already looks healthy.';

  const lines: string[] = [];
  lines.push('Current PID gains:');
  for (const pid of context.pids) {
    lines.push(`  ${pid.param_id} = ${pid.value}`);
  }

  if (context.vibration) {
    const v = context.vibration;
    lines.push('');
    lines.push(
      `Vibration (m/s^2): X ${v.x.toFixed(1)}, Y ${v.y.toFixed(1)}, Z ${v.z.toFixed(1)}. ` +
        `Accelerometer clipping counts: ${v.clip0}, ${v.clip1}, ${v.clip2}. ` +
        'Above 30 is high and above 60 is severe.'
    );
  } else {
    lines.push('');
    lines.push('Vibration telemetry is unavailable.');
  }

  if (context.attitude) {
    lines.push(
      `Latest attitude: roll ${context.attitude.rollDeg.toFixed(1)} deg, pitch ${context.attitude.pitchDeg.toFixed(1)} deg.`
    );
  }

  return { system, user: lines.join('\n') };
}

function coerceRecommendation(value: unknown): TuningRecommendation | null {
  if (value === null || typeof value !== 'object') return null;
  const r = value as Record<string, unknown>;
  const param_id = typeof r.param_id === 'string' ? r.param_id.trim() : '';
  const suggested = typeof r.suggested === 'number' ? r.suggested : Number(r.suggested);
  const current = typeof r.current === 'number' ? r.current : Number(r.current);
  if (!param_id || !Number.isFinite(suggested)) return null;
  return {
    param_id,
    current: Number.isFinite(current) ? current : 0,
    suggested,
    reason: typeof r.reason === 'string' ? r.reason : ''
  };
}

// Pulls the JSON object out of a model reply, tolerating a markdown code fence
// or prose around it, and validates every recommendation.
export function parseTuningResponse(text: string): TuningResult {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('The assistant did not return a tuning result.');

  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new Error('The assistant returned malformed JSON.');
  }

  const obj = parsed as Record<string, unknown>;
  const rawRecs = Array.isArray(obj.recommendations) ? obj.recommendations : [];
  const recommendations = rawRecs
    .map(coerceRecommendation)
    .filter((r): r is TuningRecommendation => r !== null);

  return {
    summary: typeof obj.summary === 'string' ? obj.summary : '',
    recommendations
  };
}
