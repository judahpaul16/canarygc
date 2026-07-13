// MAV_MISSION_RESULT.MAV_MISSION_ACCEPTED: the vehicle accepted the whole plan.
export const MAV_MISSION_ACCEPTED = 0;

export type UploadEvent =
	| { kind: 'request'; seq: number }
	| { kind: 'ack'; type: number };

export type UploadAction =
	| { kind: 'send'; seq: number }
	| { kind: 'done' }
	| { kind: 'fail'; reason: string };

// The mission-upload handshake, as a pure decision: given the vehicle's next
// message and the item count, the station either sends the requested item,
// finishes on an accepting MISSION_ACK, or fails on a rejecting ack or a
// request for a sequence number outside the plan.
export function decideUploadAction(event: UploadEvent, count: number): UploadAction {
	if (event.kind === 'ack') {
		return event.type === MAV_MISSION_ACCEPTED
			? { kind: 'done' }
			: { kind: 'fail', reason: `vehicle rejected the mission (result ${event.type})` };
	}
	if (event.seq >= 0 && event.seq < count) {
		return { kind: 'send', seq: event.seq };
	}
	return { kind: 'fail', reason: `vehicle requested item ${event.seq} outside 0..${count - 1}` };
}
