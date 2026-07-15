import { get } from 'svelte/store';
import { mavLocationStore } from '../stores/mavlinkStore';
import { missionPlanActionsStore, type MissionPlanActions } from '../stores/missionPlanStore';
import { sendMavlinkCommand, setFlightMode } from './mavlink-client';
import { isPlane, isPX4 } from './flight-modes';
import { normalizeMission, MISSION_COMMANDS } from './mission-commands';

// Wire sequence of the plan's landing entry point: the DO_LAND_START marker
// when the plan carries one, else the NAV_LAND item itself. Computed against
// the normalized items so the number matches what the vehicle holds.
export function landingSequenceSeq(actions: MissionPlanActions, targetIsPX4: boolean): number | null {
  const { items } = normalizeMission(actions, targetIsPX4);
  const start = items.findIndex((item) => item.command === MISSION_COMMANDS.DO_LAND_START.id);
  if (start >= 0) return start;
  const land = items.findIndex((item) => item.command === MISSION_COMMANDS.NAV_LAND.id);
  return land >= 0 ? land : null;
}

export function planeHasLandingSequence(): boolean {
  return landingSequenceSeq(get(missionPlanActionsStore), isPX4()) !== null;
}

// Lands the connected vehicle. A copter lands in place. A fixed wing cannot:
// when the plan carries a landing sequence the mission jumps there and AUTO
// flies the approach down to touchdown; otherwise the plane returns to launch
// and loiters overhead. Resolves true when a landing is actually under way.
export async function landNow(): Promise<boolean> {
  if (isPlane()) {
    const seq = landingSequenceSeq(get(missionPlanActionsStore), isPX4());
    if (seq === null) {
      await setFlightMode('RTL');
      return false;
    }
    await sendMavlinkCommand('DO_SET_MISSION_CURRENT', [seq, 0], { cmdLong: true });
    await setFlightMode('AUTO');
    return true;
  }
  const loc = get(mavLocationStore) as { lat: number; lng: number };
  await setFlightMode('GUIDED');
  await sendMavlinkCommand('NAV_LAND', [0, 0, 0, 0, loc.lat, loc.lng, 0], { cmdLong: true });
  return true;
}
