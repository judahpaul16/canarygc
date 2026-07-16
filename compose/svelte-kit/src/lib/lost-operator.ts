// Decision core of the lost-operator failsafe: whether the station, having
// seen no operator for the configured window while the vehicle is armed,
// commands the recovery now. The server tracks presence and calls this on a
// timer; keeping the rule pure keeps it testable.

export interface LostOperatorInput {
  // Configured window in minutes; 0 or less means the failsafe is off.
  minutes: number;
  // Open operator streams right now.
  clients: number;
  // When the last operator stream closed (or the server booted), ms epoch.
  lastSeenAt: number;
  // Whether the recovery already fired for this outage.
  fired: boolean;
  armed: boolean;
  linkUp: boolean;
  now: number;
}

export function lostOperatorTriggers(input: LostOperatorInput): boolean {
  if (input.minutes <= 0) return false;
  if (input.fired) return false;
  if (!input.armed || !input.linkUp) return false;
  if (input.clients > 0) return false;
  if (input.lastSeenAt <= 0) return false;
  return input.now - input.lastSeenAt >= input.minutes * 60_000;
}
