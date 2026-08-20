export const RELEASE_SERVO_CHANNEL = 9;
export const RELEASE_OPEN_PWM_US = 1050;
export const RELEASE_CLOSE_PWM_US = 1950;
export const RELEASE_CYCLE_DELAY_MS = 500;

export type ServoActionTab = 'servo' | 'parachute' | 'gripper' | 'relay' | 'winch';

export interface ServoTabValues {
  channel: number;
  pwm: number;
  cycle: boolean;
  cyclePwm: number;
  cycleDelayMs: number;
}

export interface ParachuteTabValues {
  action: 'release' | 'enable' | 'disable';
}

export interface GripperTabValues {
  instance: number;
  action: 'release' | 'grab';
}

export interface RelayTabValues {
  instance: number;
  state: 'on' | 'off';
}

export type WinchAction =
  | 'deliver'
  | 'retract'
  | 'lock'
  | 'hold'
  | 'relaxed'
  | 'load_line'
  | 'abandon_line'
  | 'load_payload'
  | 'length'
  | 'rate';

export interface WinchTabValues {
  instance: number;
  action: WinchAction;
  lengthM: number;
  rateMs: number;
}

export interface ServoActionValues {
  servo: ServoTabValues;
  parachute: ParachuteTabValues;
  gripper: GripperTabValues;
  relay: RelayTabValues;
  winch: WinchTabValues;
}

export const DEFAULT_SERVO_ACTIONS: ServoActionValues = {
  servo: {
    channel: RELEASE_SERVO_CHANNEL,
    pwm: RELEASE_OPEN_PWM_US,
    cycle: true,
    cyclePwm: RELEASE_CLOSE_PWM_US,
    cycleDelayMs: RELEASE_CYCLE_DELAY_MS
  },
  parachute: { action: 'release' },
  gripper: { instance: 1, action: 'release' },
  relay: { instance: 0, state: 'on' },
  winch: { instance: 1, action: 'deliver', lengthM: 5, rateMs: 1 }
};

export interface MavCommandStep {
  command: string;
  params: number[];
  delayMsBefore?: number;
}

const PARACHUTE_PARAM: Record<ParachuteTabValues['action'], number> = {
  disable: 0,
  enable: 1,
  release: 2
};

export function buildServoSteps(v: ServoTabValues): MavCommandStep[] {
  const steps: MavCommandStep[] = [{ command: 'DO_SET_SERVO', params: [v.channel, v.pwm] }];
  if (v.cycle) {
    steps.push({
      command: 'DO_SET_SERVO',
      params: [v.channel, v.cyclePwm],
      delayMsBefore: v.cycleDelayMs
    });
  }
  return steps;
}

export function buildParachuteSteps(v: ParachuteTabValues): MavCommandStep[] {
  return [{ command: 'DO_PARACHUTE', params: [PARACHUTE_PARAM[v.action]] }];
}

export function buildGripperSteps(v: GripperTabValues): MavCommandStep[] {
  return [{ command: 'DO_GRIPPER', params: [v.instance, v.action === 'grab' ? 1 : 0] }];
}

export function buildRelaySteps(v: RelayTabValues): MavCommandStep[] {
  return [{ command: 'DO_SET_RELAY', params: [v.instance, v.state === 'on' ? 1 : 0] }];
}

const WINCH_ACTION_PARAM: Record<WinchAction, number> = {
  relaxed: 0,
  length: 1,
  rate: 2,
  lock: 3,
  deliver: 4,
  hold: 5,
  retract: 6,
  load_line: 7,
  abandon_line: 8,
  load_payload: 9
};

export function buildWinchSteps(v: WinchTabValues): MavCommandStep[] {
  const length = v.action === 'length' ? v.lengthM : 0;
  const rate = v.action === 'length' || v.action === 'rate' ? v.rateMs : 0;
  return [{ command: 'DO_WINCH', params: [v.instance, WINCH_ACTION_PARAM[v.action], length, rate] }];
}

export function buildSteps(tab: ServoActionTab, values: ServoActionValues): MavCommandStep[] {
  switch (tab) {
    case 'servo':
      return buildServoSteps(values.servo);
    case 'parachute':
      return buildParachuteSteps(values.parachute);
    case 'gripper':
      return buildGripperSteps(values.gripper);
    case 'relay':
      return buildRelaySteps(values.relay);
    case 'winch':
      return buildWinchSteps(values.winch);
  }
}

const STORE_KEY = 'servoActions';

function finite(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

export function sanitizeServoActions(raw: unknown): ServoActionValues {
  const d = DEFAULT_SERVO_ACTIONS;
  const source = (raw && typeof raw === 'object' ? raw : {}) as Record<string, Record<string, unknown>>;
  const servo = source.servo ?? {};
  const parachute = source.parachute ?? {};
  const gripper = source.gripper ?? {};
  const relay = source.relay ?? {};
  const winch = source.winch ?? {};
  return {
    servo: {
      channel: finite(servo.channel, d.servo.channel),
      pwm: finite(servo.pwm, d.servo.pwm),
      cycle: typeof servo.cycle === 'boolean' ? servo.cycle : d.servo.cycle,
      cyclePwm: finite(servo.cyclePwm, d.servo.cyclePwm),
      cycleDelayMs: finite(servo.cycleDelayMs, d.servo.cycleDelayMs)
    },
    parachute: {
      action: oneOf(parachute.action, ['release', 'enable', 'disable'] as const, d.parachute.action)
    },
    gripper: {
      instance: finite(gripper.instance, d.gripper.instance),
      action: oneOf(gripper.action, ['release', 'grab'] as const, d.gripper.action)
    },
    relay: {
      instance: finite(relay.instance, d.relay.instance),
      state: oneOf(relay.state, ['on', 'off'] as const, d.relay.state)
    },
    winch: {
      instance: finite(winch.instance, d.winch.instance),
      action: oneOf(
        winch.action,
        [
          'deliver',
          'retract',
          'lock',
          'hold',
          'relaxed',
          'load_line',
          'abandon_line',
          'load_payload',
          'length',
          'rate'
        ] as const,
        d.winch.action
      ),
      lengthM: finite(winch.lengthM, d.winch.lengthM),
      rateMs: finite(winch.rateMs, d.winch.rateMs)
    }
  };
}

export function loadServoActions(): ServoActionValues {
  if (typeof localStorage === 'undefined') return sanitizeServoActions(null);
  try {
    return sanitizeServoActions(JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null'));
  } catch {
    return sanitizeServoActions(null);
  }
}

export function saveServoActions(values: ServoActionValues): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(STORE_KEY, JSON.stringify(values));
}
