// INAV flies its own onboard waypoint missions, the same as an ArduPilot or PX4
// autopilot, but it is reached over MSP. A mission runs when the craft is armed
// and the NAV WP flight mode is active, and INAV activates a mode only when its
// aux channel sits inside a configured range. So the station engages a mission
// the way a transmitter switch would: find the aux channel that arms and the one
// that turns on NAV WP, then hold both inside their active windows over MSP RC
// override while INAV navigates. These are pure functions so the channel
// planning is testable without a live link.
import { INAV_BOX_ID, modeStepToUs, usToModeStep, type ModeRange } from './msp';

// The station's RC frame layout matches the Betaflight AETR default the guidance
// path uses: sticks on 0..3, aux channels from index 4. An aux channel index n
// (0-based) from the mode ranges is RC channel 4 + n.
const ROLL = 0;
const PITCH = 1;
const THROTTLE = 2;
const YAW = 3;
const AUX_BASE = 4;
const CENTER_US = 1500;
const REST_US = 1000; // aux resting low, throttle-low for arming
const NEW_RANGE_US = 1900; // activation for a channel the station assigns itself
const MAX_MODE_SLOTS = 40; // INAV's mode-activation-condition table size

export interface ModeAssignment {
	slotIndex: number;
	permId: number;
	auxChannel: number;
	startStep: number;
	endStep: number;
}

export interface InavEngagePlan {
	armAux: number;
	navAux: number;
	armUs: number; // value that holds the arm channel inside its window
	navUs: number; // value that holds NAV WP inside its window
	assignments: ModeAssignment[]; // mode ranges to write before engaging
	channelCount: number;
}

// The permanent id for a box, resolved from the board's own name/id tables and
// falling back to the compiled-in id when a build reports no id table.
export function resolvePermId(names: string[], ids: number[], boxName: string, fallback: number): number {
	const i = names.findIndex((n) => n === boxName);
	if (i >= 0 && i < ids.length) return ids[i];
	return fallback;
}

// The active range for a box, if the operator already assigned it to an aux
// channel.
export function findRangeForBox(ranges: ModeRange[], permId: number): ModeRange | undefined {
	return ranges.find((r) => r.permId === permId);
}

// The lowest aux channel not already driving a mode and not in the exclude list,
// so a station-assigned mode does not collide with an existing switch.
export function pickFreeAux(ranges: ModeRange[], exclude: number[]): number {
	const used = new Set<number>([...ranges.map((r) => r.auxChannel), ...exclude]);
	for (let aux = 0; aux < 16; aux++) if (!used.has(aux)) return aux;
	return 15;
}

// The lowest unused slot in INAV's mode-range table, so writing an assignment
// does not overwrite an existing one.
function firstFreeSlot(ranges: ModeRange[], usedSlots: number[]): number {
	// The decoded ranges dropped empty slots, so any count below the table size
	// leaves room; step past slots this plan already claimed.
	const taken = new Set<number>(usedSlots);
	for (let slot = 0; slot < MAX_MODE_SLOTS; slot++) if (!taken.has(slot)) return slot;
	return MAX_MODE_SLOTS - 1;
}

// Works out how to arm and engage NAV WP on this board: reuses the operator's
// existing aux assignments when present, and otherwise allocates spare aux
// channels and returns the mode ranges to write for them. The activation value
// for each channel is the midpoint of its window, so the hold sits safely inside
// the range rather than on its edge.
export function planInavEngage(cfg: { names: string[]; ids: number[]; ranges: ModeRange[] }): InavEngagePlan {
	const { names, ids, ranges } = cfg;
	const armId = resolvePermId(names, ids, 'ARM', INAV_BOX_ID.ARM);
	const navId = resolvePermId(names, ids, 'NAV WP', INAV_BOX_ID.NAV_WP);

	const assignments: ModeAssignment[] = [];
	const claimedAux: number[] = [];
	const claimedSlots: number[] = [];

	const resolveChannel = (permId: number): { aux: number; us: number } => {
		const existing = findRangeForBox(ranges, permId);
		if (existing) {
			return { aux: existing.auxChannel, us: Math.round((modeStepToUs(existing.startStep) + modeStepToUs(existing.endStep)) / 2) };
		}
		const aux = pickFreeAux(ranges, claimedAux);
		claimedAux.push(aux);
		const slotIndex = firstFreeSlot(ranges, claimedSlots);
		claimedSlots.push(slotIndex);
		const startStep = usToModeStep(1700);
		const endStep = usToModeStep(2100);
		assignments.push({ slotIndex, permId, auxChannel: aux, startStep, endStep });
		return { aux, us: NEW_RANGE_US };
	};

	const arm = resolveChannel(armId);
	const nav = resolveChannel(navId);
	const maxAux = Math.max(arm.aux, nav.aux);

	return {
		armAux: arm.aux,
		navAux: nav.aux,
		armUs: arm.us,
		navUs: nav.us,
		assignments,
		channelCount: Math.max(8, AUX_BASE + maxAux + 1)
	};
}

export interface ArmChannel {
	armAux: number; // 0-based aux channel that arms
	armUs: number; // value inside the arm window
	channelCount: number; // channels the RC frame must carry
	assignment: ModeAssignment | null; // a mode range to write when ARM had no aux
}

// Resolves the aux channel that arms the craft, reusing the operator's existing
// ARM assignment or allocating a spare aux and returning the mode range to write.
// Manual gamepad flight and the mission both drive this channel to arm over MSP.
export function resolveArmChannel(cfg: { names: string[]; ids: number[]; ranges: ModeRange[] }): ArmChannel {
	const armId = resolvePermId(cfg.names, cfg.ids, 'ARM', INAV_BOX_ID.ARM);
	const existing = findRangeForBox(cfg.ranges, armId);
	if (existing) {
		const us = Math.round((modeStepToUs(existing.startStep) + modeStepToUs(existing.endStep)) / 2);
		return { armAux: existing.auxChannel, armUs: us, channelCount: Math.max(8, AUX_BASE + existing.auxChannel + 1), assignment: null };
	}
	const aux = pickFreeAux(cfg.ranges, []);
	const startStep = usToModeStep(1700);
	const endStep = usToModeStep(2100);
	return {
		armAux: aux,
		armUs: NEW_RANGE_US,
		channelCount: Math.max(8, AUX_BASE + aux + 1),
		assignment: { slotIndex: cfg.ranges.length, permId: armId, auxChannel: aux, startStep, endStep }
	};
}

// Builds one MSP_SET_RAW_RC frame for manual stick flight: sticks (AETR) from the
// gamepad, throttle passed through, and the arm aux channel held high or low. The
// FC must have received the arm channel low before high, so the caller settles the
// channel low first; a real transmitter arm switch works the same way.
export function buildManualRcFrame(opts: {
	armAux: number;
	armUs: number;
	channelCount: number;
	roll: number;
	pitch: number;
	yaw: number;
	throttleUs: number;
	armed: boolean;
}): number[] {
	const ch = new Array<number>(opts.channelCount).fill(REST_US);
	ch[ROLL] = opts.roll;
	ch[PITCH] = opts.pitch;
	ch[YAW] = opts.yaw;
	ch[THROTTLE] = opts.throttleUs;
	ch[AUX_BASE + opts.armAux] = opts.armed ? opts.armUs : REST_US;
	return ch;
}

// Builds one MSP_SET_RAW_RC frame that holds the plan's arm and NAV WP channels
// inside their windows (when armed) with sticks centered and throttle low; NAV WP
// governs throttle once INAV is navigating. Disarmed, both channels rest low so
// nothing engages by accident.
export function buildInavRcFrame(plan: InavEngagePlan, armed: boolean): number[] {
	const ch = new Array<number>(plan.channelCount).fill(REST_US);
	ch[ROLL] = CENTER_US;
	ch[PITCH] = CENTER_US;
	ch[YAW] = CENTER_US;
	ch[THROTTLE] = REST_US;
	ch[AUX_BASE + plan.armAux] = armed ? plan.armUs : REST_US;
	ch[AUX_BASE + plan.navAux] = armed ? plan.navUs : REST_US;
	return ch;
}
