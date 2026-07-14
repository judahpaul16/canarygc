// FDM-protocol flight simulator for the Betaflight SITL. Betaflight listens
// for fdm_packet state on UDP 9003 and sends its motor outputs to this
// process on UDP 9002 (normalized) and 9001 (raw PWM), so this server is the
// aircraft: it integrates the shared quad model with the latest motors and
// streams the state struct back at a fixed rate. With Betaflight's virtual
// GPS (the SITL default) the position fields carry longitude, latitude, and
// altitude and the velocity fields are east, north, up.
import { createSocket } from 'dgram';
import { QuadSim, G } from './physics.mjs';

const BF_HOST = process.env.BF_HOST ?? 'betaflight-sitl';
const STATE_PORT = 9003; // Betaflight's state-in server
const MOTOR_PORT = 9002; // normalized motors arrive here
const RAW_PORT = 9001; // raw PWM arrives here, drained

const sim = new QuadSim();
let motors = [0, 0, 0, 0];
let lastStep = process.hrtime.bigint();
const t0 = process.hrtime.bigint();
let statePackets = 0;
let motorPackets = 0;

const motorSock = createSocket('udp4');
motorSock.on('message', (msg) => {
	if (msg.length < 16) return;
	motors = [msg.readFloatLE(0), msg.readFloatLE(4), msg.readFloatLE(8), msg.readFloatLE(12)];
	motorPackets++;
});
motorSock.bind(MOTOR_PORT, '0.0.0.0');

const rawSock = createSocket('udp4');
rawSock.on('message', () => {});
rawSock.bind(RAW_PORT, '0.0.0.0');

const stateSock = createSocket('udp4');

// fdm_packet: 18 little-endian doubles. Gyro is body FLU (Betaflight negates
// pitch and yaw into its own frame), acceleration is the body specific force
// with 1 g reading 9.80665 at rest, the quaternion is w,x,y,z from standard
// aerospace roll/pitch/yaw.
function buildFdm() {
	const buf = Buffer.alloc(18 * 8);
	let o = 0;
	const put = (v) => {
		buf.writeDoubleLE(v, o);
		o += 8;
	};
	const phi = sim.roll;
	const theta = -sim.pitch; // physics pitch is nose-down positive; standard is nose-up
	const psi = sim.yaw;
	const cr = Math.cos(phi / 2), sr = Math.sin(phi / 2);
	const cp = Math.cos(theta / 2), sp = Math.sin(theta / 2);
	const cy = Math.cos(psi / 2), sy = Math.sin(psi / 2);
	const qw = cr * cp * cy + sr * sp * sy;
	const qx = sr * cp * cy - cr * sp * sy;
	const qy = cr * sp * cy + sr * cp * sy;
	const qz = cr * cp * sy - sr * sp * cy;

	put(Number(process.hrtime.bigint() - t0) / 1e9); // timestamp seconds
	put(sim.p); // gyro roll rate, rad/s
	put(sim.q); // pitch rate, nose-down positive here; Betaflight negates
	put(sim.r); // yaw rate; Betaflight negates
	put(sim.accBodyX);
	put(sim.accBodyY);
	put(sim.accBodyZ); // at rest reads -g on the down axis
	put(qw);
	put(qx);
	put(qy);
	put(qz);
	const { lat, lon } = sim.latLon();
	put(sim.velE); // Ve
	put(sim.velN); // Vn
	put(-sim.velD); // Vup
	put(lon);
	put(lat);
	put(sim.altitudeM());
	put(sim.pressurePa());
	return buf;
}

setInterval(() => {
	const now = process.hrtime.bigint();
	const dt = Number(now - lastStep) / 1e9;
	lastStep = now;
	sim.step(motors, dt);
	stateSock.send(buildFdm(), STATE_PORT, BF_HOST);
	statePackets++;
}, 5);

setInterval(() => {
	console.log(
		`[fc-sim] bf fdm out=${statePackets}/5s motors=${motorPackets}/5s alt=${sim.altitudeM().toFixed(1)}m agl=${sim.aglM().toFixed(1)}m hdg=${sim.headingDeg().toFixed(0)} ground=${sim.onGround} m=[${motors.map((v) => v.toFixed(2)).join(',')}]`
	);
	statePackets = 0;
	motorPackets = 0;
}, 5000);

console.log(`[fc-sim] FDM-protocol quad sim: state to ${BF_HOST}:${STATE_PORT}, motors on ${MOTOR_PORT}`);
