// RealFlight-protocol flight simulator for the INAV SITL. INAV's --sim=rf
// driver POSTs SOAP ExchangeData calls carrying the mixer's motor outputs and
// reads the aircraft state back from the response, so this server is the
// aircraft: each exchange steps the shared quad model with the motors and
// answers with the fields INAV parses (attitude, rates, body acceleration,
// position, velocities, battery). INAV computes GPS coordinates itself from
// the position offsets around its built-in reference point.
import { createServer } from 'net';
import { QuadSim } from './physics.mjs';

const PORT = Number(process.env.RF_PORT ?? 18083);
const sim = new QuadSim();
let lastStep = process.hrtime.bigint();
let exchanges = 0;
let lastMotors = [0, 0, 0, 0];

function stepWithMotors(motors) {
	const now = process.hrtime.bigint();
	const dt = Number(now - lastStep) / 1e9;
	lastStep = now;
	sim.step(motors, Math.min(dt, 0.05));
}

// The response elements INAV parses with strstr(name) + atof, so each value
// follows its element name directly. Position axes: +X north, +Y west (INAV
// negates Y into east when it fakes coordinates).
function stateXml() {
	const deg = 180 / Math.PI;
	// INAV converts azimuth with 360 - ((az + 90) mod 360); a heading of exactly
	// 0 would produce 360.0, so it is nudged inside [0, 360).
	const heading = Math.max(sim.headingDeg(), 0.01);
	const az = ((270 - heading) % 360 + 360) % 360;
	const items = Array.from({ length: 12 }, () => '<item>0.0000</item>').join('');
	const fields = [
		['m-airspeed-MPS', sim.groundspeedMs()],
		['m-altitudeASL-MTR', sim.altitudeM()],
		['m-altitudeAGL-MTR', sim.aglM()],
		['m-groundspeed-MPS', sim.groundspeedMs()],
		['m-pitchRate-DEGpSEC', -sim.q * deg],
		['m-rollRate-DEGpSEC', sim.p * deg],
		['m-yawRate-DEGpSEC', -sim.r * deg],
		['m-azimuth-DEG', az > 180 ? az - 360 : az],
		['m-inclination-DEG', -sim.pitch * deg],
		['m-roll-DEG', sim.roll * deg],
		['m-aircraftPositionX-MTR', sim.posN],
		['m-aircraftPositionY-MTR', -sim.posE],
		['m-velocityWorldU-MPS', -sim.velE],
		['m-velocityWorldV-MPS', sim.velN],
		['m-velocityWorldW-MPS', sim.velD],
		// Raw FRD specific force: INAV negates Y and Z on receive and reads +g on
		// its body-up axis at rest, so the raw values land in its frame.
		['m-accelerationBodyAX-MPS2', sim.accBodyX],
		['m-accelerationBodyAY-MPS2', sim.accBodyY],
		['m-accelerationBodyAZ-MPS2', sim.accBodyZ],
		['m-batteryVoltage-VOLTS', 16.8],
		['m-batteryCurrentDraw-AMPS', 1.2]
	];
	const body = fields.map(([k, v]) => `<${k}>${Number(v).toFixed(6)}</${k}>`).join('');
	return (
		'<?xml version="1.0" encoding="UTF-8"?>' +
		'<SOAP-ENV:Envelope><SOAP-ENV:Body><ReturnData>' +
		body +
		'<m-currentAircraftStatus>CAS-FLYING</m-currentAircraftStatus>' +
		'<m-channelValues-0to1 xsi:type="SOAP-ENC:Array" SOAP-ENC:arrayType="xsd:double[12]">' +
		items +
		'</m-channelValues-0to1>' +
		'</ReturnData></SOAP-ENV:Body></SOAP-ENV:Envelope>'
	);
}

function parseMotors(body) {
	const motors = [];
	const re = /<item>([-\d.eE]+)<\/item>/g;
	let m;
	while ((m = re.exec(body)) && motors.length < 12) motors.push(parseFloat(m[1]));
	return motors.slice(0, 4);
}

function respond(socket, xml) {
	const payload = Buffer.from(xml, 'utf8');
	socket.write(
		'HTTP/1.1 200 OK\r\n' +
			'Content-Type: text/xml; charset=utf-8\r\n' +
			`Content-Length: ${payload.length}\r\n` +
			'Connection: close\r\n\r\n'
	);
	socket.end(payload);
}

// INAV opens one TCP connection per SOAP call and reads until close, so the
// server parses a single request per connection and closes after the reply.
const server = createServer((socket) => {
	let data = Buffer.alloc(0);
	socket.on('data', (chunk) => {
		data = Buffer.concat([data, chunk]);
		const headerEnd = data.indexOf('\r\n\r\n');
		if (headerEnd === -1) return;
		const header = data.subarray(0, headerEnd).toString('latin1');
		const lenMatch = header.match(/Content-Length:\s*(\d+)/i);
		const bodyLen = lenMatch ? parseInt(lenMatch[1]) : 0;
		if (data.length < headerEnd + 4 + bodyLen) return;
		const body = data.subarray(headerEnd + 4, headerEnd + 4 + bodyLen).toString('utf8');

		if (body.includes('<ExchangeData>')) {
			lastMotors = parseMotors(body);
			stepWithMotors(lastMotors);
			exchanges++;
			respond(socket, stateXml());
			return;
		}
		if (body.includes('ResetAircraft')) sim.reset();
		respond(
			socket,
			'<?xml version="1.0" encoding="UTF-8"?><SOAP-ENV:Envelope><SOAP-ENV:Body><OK/></SOAP-ENV:Body></SOAP-ENV:Envelope>'
		);
	});
	socket.on('error', () => {});
});

server.listen(PORT, '0.0.0.0', () => {
	console.log(`[fc-sim] RealFlight-protocol quad sim listening on ${PORT}`);
});

setInterval(() => {
	console.log(
		`[fc-sim] ${exchanges} exchanges/5s alt=${sim.altitudeM().toFixed(1)}m agl=${sim.aglM().toFixed(1)}m hdg=${sim.headingDeg().toFixed(0)} gs=${sim.groundspeedMs().toFixed(1)}m/s ground=${sim.onGround} m=[${lastMotors.map((v) => v.toFixed(2)).join(',')}]`
	);
	exchanges = 0;
}, 5000);
