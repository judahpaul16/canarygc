import { beforeEach, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { toastStore, pushToast, dismissToast } from './toastStore';

const base = {
  title: 'Flight restriction 6/1',
  content: 'SECURITY',
  type: 'warning' as const,
  duration: 0,
  persistent: true
};

beforeEach(() => toastStore.set([]));

describe('pushToast keyed dedup', () => {
  it('returns the live toast for a repeated key', () => {
    const first = pushToast({ ...base, key: 'notam:6/1' });
    const second = pushToast({ ...base, key: 'notam:6/1' });
    expect(second).toBe(first);
    expect(get(toastStore)).toHaveLength(1);
  });

  it('stacks distinct keys and unkeyed toasts', () => {
    pushToast({ ...base, key: 'notam:6/1' });
    pushToast({ ...base, key: 'notam:6/2' });
    pushToast({ ...base });
    pushToast({ ...base });
    expect(get(toastStore)).toHaveLength(4);
  });

  it('shows a keyed toast again after dismissal', () => {
    const first = pushToast({ ...base, key: 'notam:6/1' });
    dismissToast(first);
    const second = pushToast({ ...base, key: 'notam:6/1' });
    expect(second).not.toBe(first);
    expect(get(toastStore)).toHaveLength(1);
  });
});
