import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./overlays', () => ({ notify: vi.fn() }));

import { repositionRelative, sendMavlinkCommand, setPositionLocal } from './mavlink-client';
import { notify } from './overlays';
import {
	mavAltitudeAmslStore,
	mavLocationStore,
	mavModelStore
} from '../stores/mavlinkStore';

const fetchMock = vi.fn(async () => new Response('ok', { status: 200 }));

beforeEach(() => {
	fetchMock.mockClear();
	vi.stubGlobal('fetch', fetchMock);
	mavLocationStore.set({ lat: 33.791051, lng: -84.371309 });
	mavAltitudeAmslStore.set(300);
});

function sentHeaders(): Record<string, string> {
	const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
	return init.headers as Record<string, string>;
}

describe('repositionRelative', () => {
	it('sends DO_REPOSITION with degE7 ints, AMSL altitude, and wrapped radians yaw', async () => {
		await repositionRelative(1, 0, 2, 90);
		const params = sentHeaders().params.split(',').map(Number);
		expect(sentHeaders().command).toBe('DO_REPOSITION');
		expect(sentHeaders().useCmdLong).toBe('false');
		expect(params[0]).toBe(-1);
		expect(params[1]).toBe(1);
		// degE7 ints quantize to 1e-7 degrees, so the offset matches within
		// half a wire step.
		const dLat = params[4] / 1e7 - 33.791051;
		expect(dLat).toBeCloseTo(1 / 111320, 7);
		expect(params[5] / 1e7).toBeCloseTo(-84.371309, 6);
		expect(params[3]).toBeCloseTo(Math.PI / 2, 5);
		expect(params[6]).toBeCloseTo(302, 6);
	});

	it('moves east without touching latitude', async () => {
		await repositionRelative(0, 10, 0);
		const params = sentHeaders().params.split(',').map(Number);
		expect(params[4] / 1e7).toBeCloseTo(33.791051, 7);
		expect(params[5] / 1e7).toBeGreaterThan(-84.371309);
	});

	it('keeps the heading with NaN yaw', async () => {
		await repositionRelative(0, 0, 1);
		const params = sentHeaders().params.split(',');
		expect(params[3]).toBe('NaN');
	});
});

describe('setPositionLocal', () => {
	it('refuses on PX4 with a notification instead of a request', async () => {
		mavModelStore.set('PX4');
		const ok = await setPositionLocal(1, 0, -10);
		expect(ok).toBe(false);
		expect(fetchMock).not.toHaveBeenCalled();
		expect(notify).toHaveBeenCalled();
	});

	it('posts the setpoint for ArduPilot', async () => {
		mavModelStore.set('ArduPilot');
		await setPositionLocal(1, 0, -10);
		expect(fetchMock).toHaveBeenCalledWith(
			'/api/mavlink/set_position_local',
			expect.objectContaining({ method: 'POST' })
		);
	});
});

describe('sendMavlinkCommand', () => {
	it('serializes params preserving 0 and NaN', async () => {
		await sendMavlinkCommand('NAV_TAKEOFF', [0, 0, 0, NaN, NaN, NaN, 10], { cmdLong: true });
		expect(sentHeaders().params).toBe('0,0,0,NaN,NaN,NaN,10');
		expect(sentHeaders().useCmdLong).toBe('true');
	});
});
