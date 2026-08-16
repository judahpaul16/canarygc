import { describe, expect, it } from 'vitest';
import { spanFromChunks } from './flight-log';

const line = (ts: string) => `ATTITUDE(39)::${ts}::{"roll":0.1}\n`;

describe('spanFromChunks', () => {
	it('spans first to last timestamp', () => {
		const head = line('2026-07-22T18:00:00.000Z') + line('2026-07-22T18:00:01.000Z');
		const tail = line('2026-07-22T18:24:59.500Z') + line('2026-07-22T18:25:00.000Z');
		expect(spanFromChunks(head, tail)).toBe(25 * 60 * 1000);
	});

	it('handles head and tail from the same chunk of a small file', () => {
		const all = line('2026-07-22T18:00:00.000Z') + line('2026-07-22T18:00:30.000Z');
		expect(spanFromChunks(all, all)).toBe(30_000);
	});

	it('returns 0 when a chunk has no timestamp', () => {
		expect(spanFromChunks('ARMED at 14:03:22\n', 'DISARMED at 14:09:10\n')).toBe(0);
		expect(spanFromChunks('', '')).toBe(0);
	});

	it('never returns a negative span', () => {
		const head = line('2026-07-22T18:10:00.000Z');
		const tail = line('2026-07-22T18:00:00.000Z');
		expect(spanFromChunks(head, tail)).toBe(0);
	});
});
