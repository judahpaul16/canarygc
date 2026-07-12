import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './+server';

type Handler = (event: { url: URL }) => Promise<Response>;
const get = GET as unknown as Handler;

const fetchMock = vi.fn();

function feedPayload() {
	return {
		ac: [
			{ hex: 'abc123', flight: 'DAL42 ', lat: 33.8, lon: -84.4, alt_baro: 10000, gs: 200, track: 90 },
			{ hex: 'noloc' },
			{ flight: 'GHOST', lat: 33.9, lon: -84.5 }
		]
	};
}

beforeEach(() => {
	fetchMock.mockReset();
	vi.stubGlobal('fetch', fetchMock);
});

async function request(bbox: string) {
	const res = await get({ url: new URL(`http://localhost/api/traffic?bbox=${bbox}`) });
	return res.json();
}

describe('GET /api/traffic', () => {
	it('returns no contacts without a usable bbox', async () => {
		const empty = await get({ url: new URL('http://localhost/api/traffic') });
		expect((await empty.json()).contacts).toEqual([]);
		expect((await request('a,b,c,d')).contacts).toEqual([]);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('maps feed aircraft into contacts and drops entries without position or hex', async () => {
		fetchMock.mockResolvedValueOnce(
			new Response(JSON.stringify(feedPayload()), { status: 200 })
		);
		const { contacts } = await request('-84.5,33.7,-84.3,33.9');
		expect(contacts).toHaveLength(1);
		expect(contacts[0]).toMatchObject({
			id: 'net-abc123',
			callsign: 'DAL42',
			lat: 33.8,
			lon: -84.4
		});
		expect(contacts[0].altM).toBeCloseTo(3048, 0);
		expect(contacts[0].speedMps).toBeCloseTo(102.9, 1);
	});

	it('falls back to the second feed when the first fails', async () => {
		fetchMock
			.mockRejectedValueOnce(new Error('down'))
			.mockResolvedValueOnce(new Response(JSON.stringify(feedPayload()), { status: 200 }));
		const { contacts } = await request('-84.6,33.6,-84.2,34.0');
		expect(contacts).toHaveLength(1);
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(String(fetchMock.mock.calls[1][0])).toContain('adsb.fi');
	});

	it('clamps the query radius between 5 and 250 nautical miles', async () => {
		fetchMock.mockResolvedValue(new Response(JSON.stringify({ ac: [] }), { status: 200 }));
		await request('-84.4001,33.7999,-84.3999,33.8001');
		expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/5$|dist\/5/);
		fetchMock.mockClear();
		fetchMock.mockResolvedValue(new Response(JSON.stringify({ ac: [] }), { status: 200 }));
		await request('-100,20,-70,45');
		expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/250$|dist\/250/);
	});
});
