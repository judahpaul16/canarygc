import { MavLinkPacketSignature } from 'node-mavlink';

// Derives the 32-byte signing key from a passphrase with SHA-256, matching how
// QGroundControl and Mission Planner turn a passphrase into a signing key, so
// the same passphrase configured on the autopilot authenticates this link.
export function deriveSigningKey(passphrase: string): Buffer | null {
	const trimmed = passphrase.trim();
	if (!trimmed) return null;
	return MavLinkPacketSignature.key(trimmed);
}

// MAVLink rejects a signed message whose timestamp is not newer than the last
// one seen on that link, so successive signatures must strictly increase even
// when several are sent inside the same millisecond.
export function nextSigningTimestamp(now: number, last: number): number {
	return Math.max(now, last + 1);
}
