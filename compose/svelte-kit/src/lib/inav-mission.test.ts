import { describe, expect, it } from 'vitest';
import {
	planInavEngage,
	buildInavRcFrame,
	resolvePermId,
	findRangeForBox,
	pickFreeAux,
	resolveArmChannel,
	buildManualRcFrame
} from './inav-mission';
import { INAV_BOX_ID, type ModeRange } from './msp';

// The box tables the INAV SITL reports, trimmed to the modes the planner reads.
const NAMES = ['ARM', 'ANGLE', 'NAV POSHOLD', 'NAV RTH', 'NAV WP', 'NAV ALTHOLD'];
const IDS = [
	INAV_BOX_ID.ARM,
	INAV_BOX_ID.ANGLE,
	INAV_BOX_ID.NAV_POSHOLD,
	INAV_BOX_ID.NAV_RTH,
	INAV_BOX_ID.NAV_WP,
	INAV_BOX_ID.NAV_ALTHOLD
];

describe('resolvePermId', () => {
	it('reads the id from the board tables', () => {
		expect(resolvePermId(NAMES, IDS, 'NAV WP', 99)).toBe(INAV_BOX_ID.NAV_WP);
	});
	it('falls back when the board reports no id table', () => {
		expect(resolvePermId(['ARM'], [], 'NAV WP', INAV_BOX_ID.NAV_WP)).toBe(INAV_BOX_ID.NAV_WP);
	});
});

describe('findRangeForBox / pickFreeAux', () => {
	const ranges: ModeRange[] = [{ permId: INAV_BOX_ID.ARM, auxChannel: 0, startStep: 32, endStep: 48 }];
	it('finds an existing assignment', () => {
		expect(findRangeForBox(ranges, INAV_BOX_ID.ARM)?.auxChannel).toBe(0);
		expect(findRangeForBox(ranges, INAV_BOX_ID.NAV_WP)).toBeUndefined();
	});
	it('picks the lowest aux avoiding used and excluded channels', () => {
		expect(pickFreeAux(ranges, [])).toBe(1);
		expect(pickFreeAux(ranges, [1])).toBe(2);
	});
});

describe('planInavEngage', () => {
	it('allocates two distinct aux channels and slots on a bare board', () => {
		const plan = planInavEngage({ names: NAMES, ids: IDS, ranges: [] });
		expect(plan.armAux).not.toBe(plan.navAux);
		expect(plan.assignments).toHaveLength(2);
		const slots = plan.assignments.map((a) => a.slotIndex);
		expect(new Set(slots).size).toBe(2);
		// Both assignments use a high window (1700-2100us) and 1900us activation.
		expect(plan.armUs).toBe(1900);
		expect(plan.navUs).toBe(1900);
		for (const a of plan.assignments) {
			expect(a.startStep).toBe(32);
			expect(a.endStep).toBe(48);
		}
	});

	it('reuses existing assignments and writes nothing', () => {
		const ranges: ModeRange[] = [
			{ permId: INAV_BOX_ID.ARM, auxChannel: 0, startStep: 32, endStep: 48 },
			{ permId: INAV_BOX_ID.NAV_WP, auxChannel: 2, startStep: 24, endStep: 40 }
		];
		const plan = planInavEngage({ names: NAMES, ids: IDS, ranges });
		expect(plan.assignments).toHaveLength(0);
		expect(plan.armAux).toBe(0);
		expect(plan.navAux).toBe(2);
		// Activation is the midpoint of each existing window.
		expect(plan.armUs).toBe(1900); // (1700+2100)/2
		expect(plan.navUs).toBe(1700); // (1500+1900)/2
	});

	it('allocates only the missing mode and avoids the used channel', () => {
		const ranges: ModeRange[] = [{ permId: INAV_BOX_ID.ARM, auxChannel: 0, startStep: 32, endStep: 48 }];
		const plan = planInavEngage({ names: NAMES, ids: IDS, ranges });
		expect(plan.armAux).toBe(0);
		expect(plan.assignments).toHaveLength(1);
		expect(plan.assignments[0].permId).toBe(INAV_BOX_ID.NAV_WP);
		expect(plan.navAux).not.toBe(0);
	});
});

describe('resolveArmChannel', () => {
	it('reuses an existing ARM assignment without writing a mode range', () => {
		const ranges = [{ permId: INAV_BOX_ID.ARM, auxChannel: 0, startStep: 32, endStep: 48 }];
		const arm = resolveArmChannel({ names: NAMES, ids: IDS, ranges });
		expect(arm.armAux).toBe(0);
		expect(arm.armUs).toBe(1900);
		expect(arm.assignment).toBeNull();
	});

	it('allocates a spare aux and returns the mode range to write when ARM is unassigned', () => {
		const arm = resolveArmChannel({ names: NAMES, ids: IDS, ranges: [] });
		expect(arm.assignment).not.toBeNull();
		expect(arm.assignment?.permId).toBe(INAV_BOX_ID.ARM);
		expect(arm.armAux).toBe(arm.assignment?.auxChannel);
		expect(arm.armUs).toBe(1900);
	});
});

describe('buildManualRcFrame', () => {
	it('sets sticks and holds the arm channel high when armed', () => {
		const ch = buildManualRcFrame({ armAux: 1, armUs: 1900, channelCount: 8, roll: 1400, pitch: 1600, yaw: 1500, throttleUs: 1200, armed: true });
		expect(ch[0]).toBe(1400); // roll
		expect(ch[1]).toBe(1600); // pitch
		expect(ch[2]).toBe(1200); // throttle
		expect(ch[3]).toBe(1500); // yaw
		expect(ch[4 + 1]).toBe(1900); // arm aux high
	});

	it('holds the arm channel low when disarmed', () => {
		const ch = buildManualRcFrame({ armAux: 1, armUs: 1900, channelCount: 8, roll: 1500, pitch: 1500, yaw: 1500, throttleUs: 1000, armed: false });
		expect(ch[4 + 1]).toBe(1000);
	});
});

describe('buildInavRcFrame', () => {
	const plan = planInavEngage({ names: NAMES, ids: IDS, ranges: [] });

	it('centers sticks, keeps throttle low, and engages arm + NAV WP when armed', () => {
		const ch = buildInavRcFrame(plan, true);
		expect(ch[0]).toBe(1500); // roll
		expect(ch[1]).toBe(1500); // pitch
		expect(ch[2]).toBe(1000); // throttle low; NAV WP governs it in flight
		expect(ch[3]).toBe(1500); // yaw
		expect(ch[4 + plan.armAux]).toBe(plan.armUs);
		expect(ch[4 + plan.navAux]).toBe(plan.navUs);
	});

	it('rests the arm and NAV WP channels low when disarmed', () => {
		const ch = buildInavRcFrame(plan, false);
		expect(ch[4 + plan.armAux]).toBe(1000);
		expect(ch[4 + plan.navAux]).toBe(1000);
	});

	it('sends enough channels to carry the highest aux used', () => {
		const ch = buildInavRcFrame(plan, true);
		expect(ch.length).toBeGreaterThanOrEqual(4 + Math.max(plan.armAux, plan.navAux) + 1);
	});
});
