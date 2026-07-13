import { describe, expect, it } from 'vitest';
import { decideUploadAction } from './mission-upload';

describe('decideUploadAction', () => {
	it('sends the requested item when the sequence is in range', () => {
		expect(decideUploadAction({ kind: 'request', seq: 0 }, 3)).toEqual({ kind: 'send', seq: 0 });
		expect(decideUploadAction({ kind: 'request', seq: 2 }, 3)).toEqual({ kind: 'send', seq: 2 });
	});

	it('re-sends the same item when the vehicle re-requests it (packet loss)', () => {
		expect(decideUploadAction({ kind: 'request', seq: 1 }, 3)).toEqual({ kind: 'send', seq: 1 });
	});

	it('fails on a request past the last item', () => {
		expect(decideUploadAction({ kind: 'request', seq: 3 }, 3)).toEqual({
			kind: 'fail',
			reason: 'vehicle requested item 3 outside 0..2'
		});
		expect(decideUploadAction({ kind: 'request', seq: -1 }, 3).kind).toBe('fail');
	});

	it('finishes on an accepting ack', () => {
		expect(decideUploadAction({ kind: 'ack', type: 0 }, 3)).toEqual({ kind: 'done' });
	});

	it('fails on a rejecting ack, naming the result code', () => {
		expect(decideUploadAction({ kind: 'ack', type: 13 }, 3)).toEqual({
			kind: 'fail',
			reason: 'vehicle rejected the mission (result 13)'
		});
	});
});
