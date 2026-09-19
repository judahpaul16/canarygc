import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startFeedPoller, type FeedPollerHandle, type FeedPollerOptions, type ReadyState } from './live-feed-poller';

const flush = () => vi.advanceTimersByTimeAsync(0);

let handles: FeedPollerHandle[] = [];

function opts(overrides: Partial<FeedPollerOptions> = {}) {
  const {
    pollReady = vi.fn<FeedPollerOptions['pollReady']>(() => Promise.resolve('ready')),
    pollAvailable = vi.fn<FeedPollerOptions['pollAvailable']>(() => Promise.resolve(true)),
    onReadyFlip = vi.fn<() => void>(),
    onAvailability = vi.fn<() => void>(),
    ...rest
  } = overrides;
  const handle = startFeedPoller({ pollReady, pollAvailable, onReadyFlip, onAvailability, ...rest });
  handles.push(handle);
  return { pollReady, pollAvailable, onReadyFlip, onAvailability, handle };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  for (const h of handles) h.stop();
  handles = [];
  vi.useRealTimers();
});

describe('lifecycle', () => {
  it('clears request deadline timers immediately on stop', async () => {
    const { handle } = opts({
      pollReady: () => new Promise<ReadyState>(() => {}),
      pollAvailable: () => new Promise<boolean>(() => {})
    });
    await flush();
    handle.stop();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not schedule another poll when a result callback stops it', async () => {
    const { handle } = opts({ onAvailability: () => handle.stop() });
    await flush();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('polls ready and availability immediately on start', async () => {
    const { pollReady, pollAvailable } = opts();
    await flush();
    expect(pollReady).toHaveBeenCalledTimes(1);
    expect(pollAvailable).toHaveBeenCalledTimes(1);
  });

  it('stops polling and schedules no further timers after stop()', async () => {
    const { pollReady, handle } = opts({ pollReady: vi.fn<FeedPollerOptions['pollReady']>(() => Promise.resolve('down')) });
    await flush();
    expect(pollReady).toHaveBeenCalledTimes(1);
    handle.stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(pollReady).toHaveBeenCalledTimes(1);
  });

  it('aborts the signal of an in-flight poll on stop()', async () => {
    let signalWhenCalled: AbortSignal | undefined;
    let release!: (ok: boolean) => void;
    const gate = new Promise<boolean>((r) => (release = r));
    const pollAvailable = vi.fn<FeedPollerOptions['pollAvailable']>((signal) => {
      signalWhenCalled = signal;
      return gate;
    });
    const { handle } = opts({ pollAvailable });
    await flush();
    handle.stop();
    expect(signalWhenCalled?.aborted).toBe(true);
    release(false);
  });

  it('does not report or reschedule when an availability poll settles after stop()', async () => {
    let release!: (ok: boolean) => void;
    const gate = new Promise<boolean>((r) => (release = r));
    const pollAvailable = vi.fn<FeedPollerOptions['pollAvailable']>(() => gate);
    const { onAvailability, handle } = opts({ pollAvailable });
    await flush();
    handle.stop();
    release(true);
    await flush();
    expect(onAvailability).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(50000);
    expect(pollAvailable).toHaveBeenCalledTimes(1);
  });

  it('does not flip or reschedule when a ready poll settles after stop()', async () => {
    let release!: (state: ReadyState) => void;
    const gate = new Promise<ReadyState>((r) => (release = r));
    const pollReady = vi.fn<FeedPollerOptions['pollReady']>(() => gate);
    const { onReadyFlip, handle } = opts({ pollReady });
    await flush();
    handle.stop();
    release('ready');
    await flush();
    expect(onReadyFlip).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(50000);
    expect(pollReady).toHaveBeenCalledTimes(1);
  });
});

describe('ready state machine', () => {
  it('does not reload the iframe on the first ready observation', async () => {
    const { onReadyFlip } = opts({ pollReady: vi.fn<FeedPollerOptions['pollReady']>(() => Promise.resolve('ready')) });
    await flush();
    await vi.advanceTimersByTimeAsync(3001);
    await vi.advanceTimersByTimeAsync(3001);
    expect(onReadyFlip).not.toHaveBeenCalled();
  });

  it('reloads exactly once per genuine down to ready transition and never on consecutive ready', async () => {
    const seq: ReadyState[] = ['down', 'ready', 'ready', 'ready', 'down', 'ready'];
    const { onReadyFlip } = opts({ pollReady: vi.fn(() => Promise.resolve(seq.shift() as ReadyState)) });
    await flush();
    expect(onReadyFlip).toHaveBeenCalledTimes(0);
    await vi.advanceTimersByTimeAsync(401);
    expect(onReadyFlip).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(3001);
    expect(onReadyFlip).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(3001);
    expect(onReadyFlip).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(3001);
    await vi.advanceTimersByTimeAsync(401);
    expect(onReadyFlip).toHaveBeenCalledTimes(2);
  });

  it('keeps lastReady across unknown so a flagged down still recovers', async () => {
    const seq: ReadyState[] = ['down', 'unknown', 'ready'];
    const { onReadyFlip } = opts({ pollReady: vi.fn(() => Promise.resolve(seq.shift() as ReadyState)) });
    await flush();
    await vi.advanceTimersByTimeAsync(401);
    await vi.advanceTimersByTimeAsync(5001);
    expect(onReadyFlip).toHaveBeenCalledTimes(1);
  });

  it('never invents a false down from unknown', async () => {
    const seq: ReadyState[] = ['unknown', 'ready'];
    const { onReadyFlip } = opts({ pollReady: vi.fn(() => Promise.resolve(seq.shift() as ReadyState)) });
    await flush();
    await vi.advanceTimersByTimeAsync(5001);
    expect(onReadyFlip).not.toHaveBeenCalled();
  });
});

describe('poll cadence', () => {
  it('polls explicit down every 400ms', async () => {
    const { pollReady } = opts({ pollReady: vi.fn<FeedPollerOptions['pollReady']>(() => Promise.resolve('down')) });
    await flush();
    await vi.advanceTimersByTimeAsync(399);
    expect(pollReady).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(pollReady).toHaveBeenCalledTimes(2);
  });

  it('polls ready every 3000ms', async () => {
    const { pollReady } = opts();
    await flush();
    await vi.advanceTimersByTimeAsync(2999);
    expect(pollReady).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(pollReady).toHaveBeenCalledTimes(2);
  });

  it('backs off 5000ms on unknown', async () => {
    const { pollReady } = opts({ pollReady: vi.fn<FeedPollerOptions['pollReady']>(() => Promise.resolve('unknown')) });
    await flush();
    await vi.advanceTimersByTimeAsync(4999);
    expect(pollReady).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(pollReady).toHaveBeenCalledTimes(2);
  });

  it('never overlaps polls within a single chain', async () => {
    let release!: (v: ReadyState) => void;
    const gate = new Promise<ReadyState>((r) => (release = r));
    let calls = 0;
    const pollReady = vi.fn<FeedPollerOptions['pollReady']>(() => {
      calls++;
      return gate;
    });
    const { handle } = opts({ pollReady, downDelay: 400 });
    await flush();
    expect(calls).toBe(1);
    await vi.advanceTimersByTimeAsync(5000);
    expect(calls).toBe(1);
    release('down');
    await flush();
    await vi.advanceTimersByTimeAsync(401);
    expect(calls).toBe(2);
    handle.stop();
  });
});

describe('timeout recovery', () => {
  it('backs off as unknown after a hung ready poll and still flips on a later recovery', async () => {
    let times = 0;
    const pollReady = vi.fn<FeedPollerOptions['pollReady']>((signal: AbortSignal) => {
      times++;
      if (times === 1) return Promise.resolve('down');
      if (times === 2) {
        return new Promise<ReadyState>((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        });
      }
      return Promise.resolve('ready');
    });
    const { onReadyFlip, handle } = opts({ pollReady, readyTimeoutMs: 1000 });
    await flush();
    await vi.advanceTimersByTimeAsync(401);
    expect(times).toBe(2);
    await vi.advanceTimersByTimeAsync(1001);
    await vi.advanceTimersByTimeAsync(5001);
    expect(onReadyFlip).toHaveBeenCalledTimes(1);
    handle.stop();
  });
});

describe('feed availability probe', () => {
  it('probes every 10s and reports a failure as unavailable without reloading', async () => {
    const { pollAvailable, onAvailability, onReadyFlip } = opts({
      pollAvailable: vi.fn(() => Promise.reject(new Error('network down')))
    });
    await flush();
    expect(onAvailability).toHaveBeenCalledWith(false);
    await vi.advanceTimersByTimeAsync(9999);
    expect(pollAvailable).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(pollAvailable).toHaveBeenCalledTimes(2);
    expect(onReadyFlip).not.toHaveBeenCalled();
  });

  it('reports recovery back to available on the next successful probe', async () => {
    const { onAvailability, handle } = opts({
      pollAvailable: vi
        .fn<FeedPollerOptions['pollAvailable']>()
        .mockResolvedValueOnce(false)
        .mockResolvedValue(true)
    });
    await flush();
    expect(onAvailability).toHaveBeenLastCalledWith(false);
    await vi.advanceTimersByTimeAsync(10001);
    expect(onAvailability).toHaveBeenLastCalledWith(true);
    handle.stop();
  });

  it('never drives the reload decision', async () => {
    const { onReadyFlip } = opts({
      pollAvailable: vi.fn(() => Promise.resolve(true))
    });
    await flush();
    expect(onReadyFlip).not.toHaveBeenCalled();
  });
});
