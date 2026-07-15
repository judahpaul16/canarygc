import { get } from 'svelte/store';
import { mavLocationStore, mavHomeStore } from '../stores/mavlinkStore';
import { missionPlanActionsStore, type MissionPlanActions } from '../stores/missionPlanStore';
import { safetyLimitsStore } from '../stores/safetyStore';
import { sendMavlinkCommand, setFlightMode } from './mavlink-client';
import { notify } from './overlays';
import { isPlane, isPX4 } from './flight-modes';
import {
  normalizeMission,
  MISSION_COMMANDS,
  FRAME_GLOBAL_RELATIVE_ALT,
  FRAME_MISSION,
  type NormalizedMissionItem
} from './mission-commands';
import { destinationPoint, type LatLon } from './geo';
import { pickApproach, type ApproachPick } from './landing-approach';
import { refreshAirspace, refreshHazards, refreshBuildings } from './preflight';
import { sampleElevations } from './dem';

const HOME_POSITION_MSG_ID = 242;
const HOME_WAIT_MS = 5000;
const HOME_POLL_MS = 250;

// Hazard data for the corridor pick covers this far around the launch point.
const LANDING_AREA_RADIUS_M = 1800;
// A landing must never hang on hazard sources; past this budget the pick
// proceeds with whatever data arrived and says the rest went unchecked.
const HAZARD_FETCH_TIMEOUT_MS = 15_000;

function withTimeout<T>(promise: Promise<T>, fallback: T, timedOut: { hit: boolean }): Promise<T> {
  return Promise.race([
    promise.catch(() => {
      timedOut.hit = true;
      return fallback;
    }),
    new Promise<T>((resolve) =>
      setTimeout(() => {
        timedOut.hit = true;
        resolve(fallback);
      }, HAZARD_FETCH_TIMEOUT_MS)
    )
  ]);
}

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

// Builds the mission the plane flies to land: the loaded plan's normalized
// items (or, with no plan, a single home slot) followed by a DO_LAND_START
// marker, the picked approach fix, and a NAV_LAND at the launch point, so
// AUTO flies a straight final into home.
export function buildAutolandMission(
  actions: MissionPlanActions,
  targetIsPX4: boolean,
  home: LatLon,
  approach: { lat: number; lon: number; altM: number }
): AutolandMission {
  const { items } = normalizeMission(actions, targetIsPX4);
  // ArduPilot mission item 0 is the home slot; seed one when landing with no
  // loaded plan so the landing sequence does not start at index 0.
  if (items.length === 0) {
    items.push({
      command: MISSION_COMMANDS.NAV_WAYPOINT.id,
      frame: FRAME_GLOBAL_RELATIVE_ALT,
      param1: 0,
      param2: 0,
      param3: 0,
      param4: 0,
      lat: home.lat,
      lon: home.lon,
      alt: 0
    });
  }
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
      alt: approach.altM
    },
    {
      command: MISSION_COMMANDS.NAV_LAND.id,
      frame: FRAME_GLOBAL_RELATIVE_ALT,
      param1: 0,
      param2: 0,
      param3: 0,
      param4: 0,
      lat: home.lat,
      lon: home.lon,
      alt: 0
    }
  );
  return { items, landStartSeq };
}

// Corridor pick for the synthesized landing: pulls airspace, obstacle, and
// building data around the launch point, then runs the approach picker with
// terrain sampling. Warnings surface to the operator as they are found.
async function planApproach(home: LatLon, vehicle: LatLon): Promise<ApproachPick> {
  const area: MissionPlanActions = {};
  [0, 90, 180, 270].forEach((bearing, i) => {
    const corner = destinationPoint(home, bearing, LANDING_AREA_RADIUS_M);
    area[i] = {
      type: 'NAV_WAYPOINT',
      lat: corner.lat,
      lon: corner.lon,
      alt: 0,
      notes: '',
      param1: null,
      param2: null,
      param3: null,
      param4: null
    };
  });
  const timedOut = { hit: false };
  const [airspace, hazards, buildings] = await Promise.all([
    withTimeout(refreshAirspace(area), [], timedOut),
    withTimeout(refreshHazards(area), { ceilings: [], obstacles: [] }, timedOut),
    withTimeout(refreshBuildings(area), [], timedOut)
  ]);
  if (timedOut.hit) {
    notify({
      title: 'Landing approach',
      content: 'Some hazard data did not load in time, so parts of the approach go unchecked.',
      type: 'warning'
    });
  }
  const pick = await pickApproach(
    home,
    vehicle,
    airspace,
    hazards.obstacles,
    buildings,
    get(safetyLimitsStore).maxAltitudeM,
    sampleElevations
  );
  for (const warning of pick.warnings) {
    notify({ title: 'Landing approach', content: warning, type: 'warning' });
  }
  return pick;
}

// The launch point to land at: the loaded plan's slot 0, else the autopilot's
// reported home. When neither is known yet, asks the vehicle for HOME_POSITION
// and waits briefly for it, so a plane flying with no plan still has a home.
async function resolveHome(actions: MissionPlanActions): Promise<LatLon | null> {
  const slot = actions[0];
  if (slot && slot.lat != null && slot.lon != null) return { lat: slot.lat, lon: slot.lon };
  const known = get(mavHomeStore);
  if (known) return known;
  await sendMavlinkCommand('REQUEST_MESSAGE', [HOME_POSITION_MSG_ID], { cmdLong: true });
  const deadline = Date.now() + HOME_WAIT_MS;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, HOME_POLL_MS));
    const home = get(mavHomeStore);
    if (home) return home;
  }
  return null;
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
// approach into the launch point uploaded on the spot, picked clear of
// obstacles, terrain, and restricted airspace where map data allows. When
// synthesis is declined or impossible the plane returns to launch and loiters
// overhead. Resolves true when a landing is actually under way.
export async function landNow(autoland = true): Promise<boolean> {
  if (isPlane()) {
    const targetIsPX4 = isPX4();
    const actions = get(missionPlanActionsStore);
    const seq = landingSequenceSeq(actions, targetIsPX4);
    if (seq !== null) {
      await flyMissionFrom(seq);
      return true;
    }
    const home = autoland ? await resolveHome(actions) : null;
    const vehicle = get(mavLocationStore) as { lat: number; lng: number } | null;
    if (autoland && vehicle && home) {
      const pick = await planApproach(home, { lat: vehicle.lat, lon: vehicle.lng });
      const synth = buildAutolandMission(actions, targetIsPX4, home, {
        lat: pick.approach.lat,
        lon: pick.approach.lon,
        altM: pick.altM
      });
      if (await uploadMission(synth.items)) {
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
