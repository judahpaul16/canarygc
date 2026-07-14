// Shared multirotor flight dynamics for the SITL sims. One quad-X model:
// motor commands in, integrated attitude / velocity / position and sensor
// outputs back. The mixer geometry mirrors the Betaflight and INAV quad-X
// tables (motor order RR, FR, RL, FL) so each firmware's PID outputs produce
// the rotations its mixer expects. Axes are NED with the body frame
// front-right-down; positive pitch is nose down at this interface, matching
// the firmwares' SITL sensor conventions.
export const G = 9.80665;

const MASS_KG = 1.2;
const HOVER_SUM = 2.0; // sum of motor commands (avg 0.5) that holds 1 g
const K_THRUST = (MASS_KG * G) / HOVER_SUM;
const I_ROLL = 0.012;
const I_PITCH = 0.012;
const I_YAW = 0.024;
const ARM_TORQUE = 0.28; // N*m per unit differential command, roll/pitch
const YAW_TORQUE = 0.06;
const RATE_DAMP = 0.35; // aero damping on body rates
const LIN_DRAG = 0.35; // horizontal drag, keeps speeds finite and the estimator damped
const MAX_TILT_INTEGRATION = Math.PI / 2.2;

// Per-motor mixer signs, motor order RR, FR, RL, FL: a positive firmware
// roll command raises the left motors and rolls right, a positive pitch
// command raises the rear motors and pitches nose down, matching the
// quad-X tables both firmwares ship.
const MIX_ROLL = [-1, -1, 1, 1];
const MIX_PITCH = [1, -1, 1, -1];
const MIX_YAW = [-1, 1, 1, -1];

export class QuadSim {
	constructor(home = { lat: 36.91061, lon: -2.876605, altM: 0 }) {
		this.home = home;
		this.reset();
	}

	reset() {
		this.posN = 0; // meters north of home
		this.posE = 0; // meters east of home
		this.posD = 0; // meters down (negative = above ground)
		this.velN = 0;
		this.velE = 0;
		this.velD = 0;
		this.roll = 0; // rad, positive right
		this.pitch = 0; // rad, positive nose down (firmware SITL convention)
		this.yaw = 0; // rad, heading 0 = north, positive clockwise
		this.p = 0; // rad/s body roll rate
		this.q = 0; // rad/s body pitch rate (positive = nose-down rate)
		this.r = 0; // rad/s body yaw rate (positive = clockwise)
		this.accBodyX = 0; // specific force, m/s^2, front
		this.accBodyY = 0; // right
		this.accBodyZ = -G; // down (at rest the IMU reads -g on the down axis)
		this.onGround = true;
	}

	// Advances the model by dt with 4 motor commands in 0..1.
	step(motors, dt) {
		if (!(dt > 0)) return;
		if (dt > 0.05) dt = 0.05;
		const m = motors.map((v) => Math.max(0, Math.min(1, v || 0)));
		const thrust = K_THRUST * (m[0] + m[1] + m[2] + m[3]);

		const tRoll = ARM_TORQUE * (MIX_ROLL[0] * m[0] + MIX_ROLL[1] * m[1] + MIX_ROLL[2] * m[2] + MIX_ROLL[3] * m[3]);
		const tPitch = ARM_TORQUE * (MIX_PITCH[0] * m[0] + MIX_PITCH[1] * m[1] + MIX_PITCH[2] * m[2] + MIX_PITCH[3] * m[3]);
		const tYaw = YAW_TORQUE * (MIX_YAW[0] * m[0] + MIX_YAW[1] * m[1] + MIX_YAW[2] * m[2] + MIX_YAW[3] * m[3]);

		this.p += ((tRoll - RATE_DAMP * this.p * I_ROLL) / I_ROLL) * dt;
		this.q += ((tPitch - RATE_DAMP * this.q * I_PITCH) / I_PITCH) * dt;
		this.r += ((tYaw - RATE_DAMP * this.r * I_YAW) / I_YAW) * dt;

		if (this.onGround) {
			// The airframe rests on its legs: no rotation below hover thrust.
			if (thrust < MASS_KG * G * 0.98) {
				this.p = 0;
				this.q = 0;
				this.r = 0;
				this.roll *= 0.9;
				this.pitch *= 0.9;
			}
		}

		this.roll += this.p * dt;
		this.pitch += this.q * dt;
		this.yaw += this.r * dt;
		this.roll = clampAngle(this.roll, MAX_TILT_INTEGRATION);
		this.pitch = clampAngle(this.pitch, MAX_TILT_INTEGRATION);
		this.yaw = wrap2pi(this.yaw);

		// Thrust points up along -body-z; pitch here is positive nose down, so a
		// positive pitch tips the thrust vector forward.
		const cr = Math.cos(this.roll);
		const sr = Math.sin(this.roll);
		const cp = Math.cos(this.pitch);
		const sp = Math.sin(this.pitch);
		const cy = Math.cos(this.yaw);
		const sy = Math.sin(this.yaw);
		const a = thrust / MASS_KG;
		const aUp = a * cr * cp;
		const aFwd = a * sp; // nose-down pitch tips thrust forward
		const aRight = -a * sr * cp; // right roll tips thrust right... which is -body-left; sign gives right drift for +roll

		let aN = aFwd * cy - aRight * sy;
		let aE = aFwd * sy + aRight * cy;
		let aD = G - aUp;

		// The ground supplies the support force: resting on it, the craft does
		// not sink, and the IMU reads the full 1 g reaction instead of freefall.
		if (this.onGround && aD > 0) {
			aD = 0;
			aN = 0;
			aE = 0;
		}

		this.velN += (aN - LIN_DRAG * this.velN) * dt;
		this.velE += (aE - LIN_DRAG * this.velE) * dt;
		this.velD += aD * dt;

		this.posN += this.velN * dt;
		this.posE += this.velE * dt;
		this.posD += this.velD * dt;

		if (this.posD >= 0) {
			this.posD = 0;
			if (this.velD > 0) this.velD = 0;
			this.onGround = true;
			// Ground friction kills horizontal drift while resting.
			this.velN *= 0.8;
			this.velE *= 0.8;
		} else {
			this.onGround = false;
		}

		// Specific force the IMU reads (body frame, FRD): acceleration minus
		// gravity, rotated into the body through yaw, then pitch, then roll.
		// Hover or rest reads (0, 0, -g).
		const fN = aN;
		const fE = aE;
		const fD = aD - G;
		const f1x = fN * cy + fE * sy;
		const f1y = -fN * sy + fE * cy;
		const f2x = f1x * cp + fD * sp;
		const f2z = -f1x * sp + fD * cp;
		this.accBodyX = f2x;
		this.accBodyY = f1y * cr + f2z * sr;
		this.accBodyZ = -f1y * sr + f2z * cr;
	}

	latLon() {
		const mPerDegLat = 111320;
		const lat = this.home.lat + this.posN / mPerDegLat;
		const lon = this.home.lon + this.posE / (mPerDegLat * Math.cos((this.home.lat * Math.PI) / 180));
		return { lat, lon };
	}

	altitudeM() {
		return this.home.altM - this.posD;
	}

	aglM() {
		return -this.posD;
	}

	groundspeedMs() {
		return Math.hypot(this.velN, this.velE);
	}

	headingDeg() {
		return ((this.yaw * 180) / Math.PI + 360) % 360;
	}

	pressurePa() {
		const h = this.altitudeM();
		return 101325 * Math.pow(1 - 2.25577e-5 * h, 5.25588);
	}
}

function wrap2pi(a) {
	while (a < 0) a += Math.PI * 2;
	while (a >= Math.PI * 2) a -= Math.PI * 2;
	return a;
}

function clampAngle(a, lim) {
	return Math.max(-lim, Math.min(lim, a));
}
