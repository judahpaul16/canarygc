import { beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { hasSessionValue, sessionBool, sessionString } from './session-persisted';

function stubSessionStorage(initial: Record<string, string> = {}) {
	const data = new Map(Object.entries(initial));
	vi.stubGlobal('sessionStorage', {
		getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
		setItem: (k: string, v: string) => void data.set(k, v),
		removeItem: (k: string) => void data.delete(k),
		clear: () => data.clear(),
		key: () => null,
		get length() {
			return data.size;
		}
	} as Storage);
	return data;
}

beforeEach(() => {
	vi.unstubAllGlobals();
});

describe('sessionBool', () => {
	it('starts from the fallback without writing the key', () => {
		const data = stubSessionStorage();
		const store = sessionBool('t.flag', false);
		expect(get(store)).toBe(false);
		expect(data.has('t.flag')).toBe(false);
		expect(hasSessionValue('t.flag')).toBe(false);
	});

	it('persists on change and restores the stored value over the fallback', () => {
		const data = stubSessionStorage();
		const store = sessionBool('t.flag', false);
		store.set(true);
		expect(data.get('t.flag')).toBe('true');
		expect(hasSessionValue('t.flag')).toBe(true);
		expect(get(sessionBool('t.flag', false))).toBe(true);
	});
});

describe('sessionString', () => {
	it('round-trips values and restores them', () => {
		stubSessionStorage({ 't.type': '3D' });
		const store = sessionString('t.type', 'Satellite');
		expect(get(store)).toBe('3D');
		store.set('OpenStreetMap');
		expect(get(sessionString('t.type', 'Satellite'))).toBe('OpenStreetMap');
	});
});

describe('without sessionStorage', () => {
	it('falls back to plain stores on the server', () => {
		const store = sessionBool('t.server', true);
		expect(get(store)).toBe(true);
		expect(hasSessionValue('t.server')).toBe(false);
	});
});
