import { describe, expect, it } from 'vitest';
import { clampToViewport } from './draggable';

describe('clampToViewport', () => {
	it('leaves an in-bounds position unchanged', () => {
		expect(clampToViewport(100, 100, 200, 150, 1000, 800)).toEqual({ left: 100, top: 100 });
	});

	it('pulls a panel back from the right and bottom edges', () => {
		expect(clampToViewport(900, 700, 200, 150, 1000, 800, 8)).toEqual({ left: 792, top: 642 });
	});

	it('pulls a panel back from the top-left past the margin', () => {
		expect(clampToViewport(-50, -20, 200, 150, 1000, 800, 8)).toEqual({ left: 8, top: 8 });
	});

	it('keeps the panel at the margin when it is larger than the viewport', () => {
		expect(clampToViewport(0, 0, 2000, 1200, 1000, 800, 8)).toEqual({ left: 8, top: 8 });
	});
});
