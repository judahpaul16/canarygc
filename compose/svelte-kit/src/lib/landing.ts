import { get } from 'svelte/store';
import { mavLocationStore } from '../stores/mavlinkStore';
import { missionPlanActionsStore, type MissionPlanActions } from '../stores/missionPlanStore';
import { sendMavlinkCommand, setFlightMode } from './mavlink-client';
import { isPlane, isPX4 } from './flight-modes';
import {
  normalizeMission,
  MISSION_COMMANDS,
  FRAME_GLOBAL_RELATIVE_ALT,
  FRAME_MISSION,
  type NormalizedMissionItem
} from './mission-commands';
import { bearingDegrees, destinationPoint, type LatLon } from './geo';

// The synthesized final: an approach fix this far out from the launch point,
// this high above it, giving a shallow glide both autopilots accept.
const APPROACH_DISTANCE_M = 800;
const APPROACH_ALT_M = 60;

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

export interface AutolandMission {
  items: NormalizedMissionItem[];
  landStartSeq: number;
}

// Appends a landing sequence to the normalized mission: a DO_LAND_START
// marker, an approach fix between the vehicle and the launch point, and a
// NAV_LAND at the launch point, so AUTO flies a straight final into home.
// Null when the plan carries no home slot to land at.
export function buildAutolandMission(
  actions: MissionPlanActions,
  targetIsPX4: boolean,
  vehicle: LatLon
): AutolandMission | null {
  const home = actions[0];
  if (!home || home.lat == null || home.lon == null) return null;
  const homePoint: LatLon = { lat: home.lat, lon: home.lon };

  const { items } = normalizeMission(actions, targetIsPX4);
  const approach = destinationPoint(homePoint, bearingDegrees(homePoint, vehicle), APPROACH_DISTANCE_M);
  const landStartSeq = items.length;
  items.push(
    {
      command: MISSION_COMMANDS.DO_LAND_START.id,
      frame: FRAME_MISSION,
      param1: 0,
      param2: 0,
      param3: 0,
      param4: 0,
      lat: 0,
      lon: 0,
      alt: 0
    },
    {
      command: MISSION_COMMANDS.NAV_WAYPOINT.id,
      frame: FRAME_GLOBAL_RELATIVE_ALT,
      param1: 0,
      param2: 0,
      param3: 0,
      param4: 0,
      lat: approach.lat,
      lon: approach.lon,
      alt: APPROACH_ALT_M
    },
    {
      command: MISSION_COMMANDS.NAV_LAND.id,
      frame: FRAME_GLOBAL_RELATIVE_ALT,
      param1: 0,
      param2: 0,
      param3: 0,
      param4: 0,
      lat: homePoint.lat,
      lon: homePoint.lon,
      alt: 0
    }
  );
  return { items, landStartSeq };
}

async function uploadMission(items: NormalizedMissionItem[]): Promise<boolean> {
  try {
    const res = await fetch('/api/mavlink/load_mission', {
      method: 'POST',
      headers: { 'content-type': 'application/json', actions: JSON.stringify(items) }
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function flyMissionFrom(seq: number): Promise<void> {
  await sendMavlinkCommand('DO_SET_MISSION_CURRENT', [seq, 0], { cmdLong: true });
  await setFlightMode('AUTO');
}

// Lands the connected vehicle. A copter lands in place. A fixed wing flies a
// landing sequence: the mission's own when it carries one, else a synthesized
// approach into the launch point uploaded on the spot. When synthesis is
// declined or impossible the plane returns to launch and loiters overhead.
// Resolves true when a landing is actually under way.
export async function landNow(autoland = true): Promise<boolean> {
  if (isPlane()) {
    const targetIsPX4 = isPX4();
    const actions = get(missionPlanActionsStore);
    const seq = landingSequenceSeq(actions, targetIsPX4);
    if (seq !== null) {
      await flyMissionFrom(seq);
      return true;
    }
    if (autoland) {
      const vehicle = get(mavLocationStore) as { lat: number; lng: number } | null;
      const synth = vehicle
        ? buildAutolandMission(actions, targetIsPX4, { lat: vehicle.lat, lon: vehicle.lng })
        : null;
      if (synth && (await uploadMission(synth.items))) {
        await flyMissionFrom(synth.landStartSeq);
        return true;
      }
    }
    await setFlightMode('RTL');
    return false;
  }
  const loc = get(mavLocationStore) as { lat: number; lng: number };
  await setFlightMode('GUIDED');
  await sendMavlinkCommand('NAV_LAND', [0, 0, 0, 0, loc.lat, loc.lng, 0], { cmdLong: true });
  return true;
}
