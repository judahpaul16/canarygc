export type ReadyState = 'ready' | 'down' | 'unknown';

export interface FeedPollerCallbacks {
  onReadyFlip(): void;
  onAvailability(available: boolean): void;
}

export interface FeedPollerOptions extends FeedPollerCallbacks {
  pollReady(signal: AbortSignal): Promise<ReadyState>;
  pollAvailable(signal: AbortSignal): Promise<boolean>;
  readyDelay?: number;
  downDelay?: number;
  unknownDelay?: number;
  availableDelay?: number;
  readyTimeoutMs?: number;
  availableTimeoutMs?: number;
}

export interface FeedPollerHandle {
  stop(): void;
}

interface PollChain<T> {
  request(signal: AbortSignal): Promise<T>;
  timeoutMs: number;
  fallback: T;
  onResult(result: T): void;
  nextDelay(result: T): number;
}

export function startFeedPoller(options: FeedPollerOptions): FeedPollerHandle {
  const readyDelay = options.readyDelay ?? 3000;
  const downDelay = options.downDelay ?? 400;
  const unknownDelay = options.unknownDelay ?? 5000;
  const availableDelay = options.availableDelay ?? 10000;
  const readyTimeoutMs = options.readyTimeoutMs ?? 4000;
  const availableTimeoutMs = options.availableTimeoutMs ?? 8000;

  let stopped = false;
  let lastReady: ReadyState | null = null;
  const pendingTimers = new Set<ReturnType<typeof setTimeout>>();
  const inFlight = new Set<AbortController>();

  async function drive<T>(chain: PollChain<T>): Promise<void> {
    if (stopped) return;
    const controller = new AbortController();
    inFlight.add(controller);
    const timeout = setTimeout(() => controller.abort(), chain.timeoutMs);
    pendingTimers.add(timeout);
    let result: T;
    try {
      result = await chain.request(controller.signal);
    } catch {
      result = chain.fallback;
    }
    clearTimeout(timeout);
    pendingTimers.delete(timeout);
    inFlight.delete(controller);
    if (stopped) return;
    chain.onResult(result);
    if (stopped) return;
    const timer = setTimeout(() => {
      pendingTimers.delete(timer);
      void drive(chain);
    }, chain.nextDelay(result));
    pendingTimers.add(timer);
  }

  void drive<ReadyState>({
    request: options.pollReady,
    timeoutMs: readyTimeoutMs,
    fallback: 'unknown',
    nextDelay: (state) => (state === 'ready' ? readyDelay : state === 'down' ? downDelay : unknownDelay),
    onResult: (state) => {
      if (state === 'ready' && lastReady === 'down') options.onReadyFlip();
      if (state !== 'unknown') lastReady = state;
    }
  });

  void drive<boolean>({
    request: options.pollAvailable,
    timeoutMs: availableTimeoutMs,
    fallback: false,
    nextDelay: () => availableDelay,
    onResult: (available) => options.onAvailability(available)
  });

  return {
    stop() {
      stopped = true;
      for (const timer of pendingTimers) clearTimeout(timer);
      pendingTimers.clear();
      for (const controller of inFlight) controller.abort();
      inFlight.clear();
    }
  };
}
