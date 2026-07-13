import { describe, expect, it } from 'vitest';
import { parseCsv, parseKml, parseKmz, parseMissionFile, parseQgcPlan, parseQgcWpl } from './mission-import';

const wpl = `QGC WPL 110
0\t1\t0\t16\t0\t0\t0\t0\t33.75\t-84.39\t300\t1
1\t0\t3\t22\t0\t0\t0\t0\t33.751\t-84.391\t10\t1
2\t0\t3\t82\t0\t0\t0\t0\t33.752\t-84.392\t30\t1
3\t0\t3\t99999\t0\t0\t0\t0\t0\t0\t0\t1`;

const plan = {
	fileType: 'Plan',
	mission: {
		plannedHomePosition: [33.75, -84.39, 300],
		items: [
			{ type: 'SimpleItem', command: 22, params: [0, 0, 0, null, 33.751, -84.391, 10] },
			{ type: 'ComplexItem', command: 16 },
			{ type: 'SimpleItem', command: 16, params: [5, 0, 0, 0, 33.752, -84.392, 30] }
		]
	}
};

describe('parseQgcWpl', () => {
	it('parses rows into typed actions and skips unknown commands', () => {
		const actions = parseQgcWpl(wpl);
		expect(actions[0].type).toBe('NAV_WAYPOINT');
		expect(actions[1].type).toBe('NAV_TAKEOFF');
		expect(actions[2].type).toBe('NAV_SPLINE_WAYPOINT');
		expect(actions[3]).toBeUndefined();
		expect(actions[1].lat).toBeCloseTo(33.751, 6);
		expect(actions[1].alt).toBe(10);
	});

	it('rejects files without the header or without items', () => {
		expect(() => parseQgcWpl('not a wpl file')).toThrow();
		expect(() => parseQgcWpl('QGC WPL 110')).toThrow();
	});
});

describe('parseQgcPlan', () => {
	it('parses the home position and simple items, skipping complex items', () => {
		const actions = parseQgcPlan(plan);
		expect(actions[0].type).toBe('NAV_WAYPOINT');
		expect(actions[0].lat).toBeCloseTo(33.75, 6);
		expect(actions[1].type).toBe('NAV_TAKEOFF');
		expect(actions[2].type).toBe('NAV_WAYPOINT');
		expect(actions[2].param1).toBe(5);
		expect(Object.keys(actions)).toHaveLength(3);
	});

	it('rejects a plan without mission items', () => {
		expect(() => parseQgcPlan({})).toThrow();
	});
});

const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Test Route</name>
    <Placemark>
      <LineString>
        <coordinates>
          -84.39,33.75,20 -84.388,33.751,25 -84.386,33.752,30
        </coordinates>
      </LineString>
    </Placemark>
  </Document>
</kml>`;

describe('parseKml', () => {
	it('reads lon,lat,alt tuples out of a LineString', () => {
		const actions = parseKml(kml);
		expect(Object.keys(actions)).toHaveLength(3);
		expect(actions[0].type).toBe('NAV_WAYPOINT');
		expect(actions[0].lat).toBeCloseTo(33.75, 6);
		expect(actions[0].lon).toBeCloseTo(-84.39, 6);
		expect(actions[0].alt).toBe(20);
		expect(actions[2].alt).toBe(30);
	});

	it('falls back to gx:Track coordinates', () => {
		const track = `<kml><Placemark><gx:Track>
			<gx:coord>-84.39 33.75 15</gx:coord>
			<gx:coord>-84.388 33.751 18</gx:coord>
		</gx:Track></Placemark></kml>`;
		const actions = parseKml(track);
		expect(Object.keys(actions)).toHaveLength(2);
		expect(actions[1].lat).toBeCloseTo(33.751, 6);
		expect(actions[1].alt).toBe(18);
	});

	it('rejects a KML with no coordinates', () => {
		expect(() => parseKml('<kml><Document></Document></kml>')).toThrow();
	});
});

describe('parseCsv', () => {
	it('maps named header columns in any order', () => {
		const csv = `name,altitude,longitude,latitude
alpha,20,-84.39,33.75
bravo,25,-84.388,33.751`;
		const actions = parseCsv(csv);
		expect(Object.keys(actions)).toHaveLength(2);
		expect(actions[0].lat).toBeCloseTo(33.75, 6);
		expect(actions[0].lon).toBeCloseTo(-84.39, 6);
		expect(actions[0].alt).toBe(20);
	});

	it('reads a headerless file as lat, lon, alt', () => {
		const csv = `33.75,-84.39,20\n33.751,-84.388,25`;
		const actions = parseCsv(csv);
		expect(Object.keys(actions)).toHaveLength(2);
		expect(actions[1].lat).toBeCloseTo(33.751, 6);
		expect(actions[1].lon).toBeCloseTo(-84.388, 6);
	});

	it('rejects a header without latitude and longitude', () => {
		expect(() => parseCsv('name,note\nalpha,x')).toThrow();
	});
});

function makeKmz(
	name: string,
	data: Uint8Array,
	method: number,
	comp: Uint8Array
): Uint8Array<ArrayBuffer> {
	const nameBytes = new TextEncoder().encode(name);

	const local = new Uint8Array(30 + nameBytes.length + comp.length);
	const lv = new DataView(local.buffer);
	lv.setUint32(0, 0x04034b50, true);
	lv.setUint16(8, method, true);
	lv.setUint32(18, comp.length, true);
	lv.setUint32(22, data.length, true);
	lv.setUint16(26, nameBytes.length, true);
	local.set(nameBytes, 30);
	local.set(comp, 30 + nameBytes.length);

	const central = new Uint8Array(46 + nameBytes.length);
	const cv = new DataView(central.buffer);
	cv.setUint32(0, 0x02014b50, true);
	cv.setUint16(10, method, true);
	cv.setUint32(20, comp.length, true);
	cv.setUint32(24, data.length, true);
	cv.setUint16(28, nameBytes.length, true);
	cv.setUint32(42, 0, true);
	central.set(nameBytes, 46);

	const eocd = new Uint8Array(22);
	const ev = new DataView(eocd.buffer);
	ev.setUint32(0, 0x06054b50, true);
	ev.setUint16(8, 1, true);
	ev.setUint16(10, 1, true);
	ev.setUint32(12, central.length, true);
	ev.setUint32(16, local.length, true);

	const out = new Uint8Array(local.length + central.length + eocd.length);
	out.set(local, 0);
	out.set(central, local.length);
	out.set(eocd, local.length + central.length);
	return out;
}

async function deflateRaw(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
	const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
	return new Uint8Array(await new Response(stream).arrayBuffer());
}

describe('parseKmz', () => {
	const kmlBytes = new Uint8Array(new TextEncoder().encode(kml));

	it('extracts a stored (uncompressed) doc.kml', async () => {
		const kmz = makeKmz('doc.kml', kmlBytes, 0, kmlBytes);
		const actions = await parseKmz(kmz);
		expect(Object.keys(actions)).toHaveLength(3);
		expect(actions[0].lat).toBeCloseTo(33.75, 6);
	});

	it('inflates a deflated doc.kml', async () => {
		const comp = await deflateRaw(kmlBytes);
		const kmz = makeKmz('doc.kml', kmlBytes, 8, comp);
		const actions = await parseKmz(kmz);
		expect(Object.keys(actions)).toHaveLength(3);
		expect(actions[2].alt).toBe(30);
	});

	it('rejects bytes that are not a ZIP', async () => {
		await expect(parseKmz(new Uint8Array(new TextEncoder().encode('not a zip')))).rejects.toThrow();
	});
});

describe('parseMissionFile', () => {
	it('routes by content across the supported formats', () => {
		expect(parseMissionFile('mission.waypoints', wpl).actions[1].type).toBe('NAV_TAKEOFF');
		expect(parseMissionFile('mission.plan', JSON.stringify(plan)).actions[1].type).toBe(
			'NAV_TAKEOFF'
		);
		expect(parseMissionFile('route.kml', kml).actions[0].lat).toBeCloseTo(33.75, 6);
		expect(
			parseMissionFile('points.csv', 'latitude,longitude,altitude\n33.75,-84.39,20').actions[0].alt
		).toBe(20);
	});
});
