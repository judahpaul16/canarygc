import { building } from '$app/environment';
import { getSetting } from './settings';
import {
    linkAlive,
    mavlinkConfigured,
    pushStationLog,
    sendMavlinkCommand,
    uploadMission,
    vehicleSnapshot,
    type VehicleSnapshot
} from './mavlink';
import { airspaceForBbox, buildingsForBbox, hazardsForBbox } from './overlays';
import { sampleElevationsServer } from './dem';
import { lostOperatorTriggers } from '$lib/lost-operator';
import { isArmed, isPlane, isPX4, strategyFor } from '$lib/flight-modes';
import { buildAutolandMission } from '$lib/landing';
import { pickApproach } from '$lib/landing-approach';
import { destinationPoint, type LatLon } from '$lib/geo';
import { DEFAULT_SAFETY_LIMITS } from '$lib/safety';

// Lost-operator failsafe: when no operator has been connected for the
// configured window while the vehicle is armed, the station commands the
// recovery itself. A copter, rover, or sub returns to launch; a fixed wing
// flies the same synthesized autoland approach the Land control uses, since a
// plane in RTL loiters overhead instead of landing.

export const LOST_OPERATOR_SETTING = 'failsafe.lostOperatorMinutes';

const CHECK_INTERVAL_MS = 15_000;
// Position telemetry older than this does not anchor an approach.
const POSITION_FRESH_MS = 30_000;
const HOME_WAIT_MS = 5000;
const HOME_POLL_MS = 250;
const HOME_POSITION_MSG_ID = 242;
// Hazard data for the approach pick covers this far around the launch point,
// matching the operator-driven landing flow.
const LANDING_AREA_RADIUS_M = 1800;
const BBOX_PAD_DEG = 0.1;
// A recovery must never hang on hazard sources; past this budget the pick
// proceeds with whatever data arrived.
const HAZARD_FETCH_TIMEOUT_MS = 15_000;

interface PresenceState {
    clients: number;
    lastSeenAt: number;
    fired: boolean;
    watcher: ReturnType<typeof setInterval> | null;
    running: boolean;
}

// Presence survives dev-server module reloads the same way the link state does.
const g = globalThis as typeof globalThis & { __canarygcPresence?: PresenceState };
const presence: PresenceState = (g.__canarygcPresence ??= {
    clients: 0,
    // The server just booted: with no operator yet, the window starts now.
    lastSeenAt: Date.now(),
    fired: false,
    watcher: null,
    running: false
});

export function operatorStreamOpened(): void {
    presence.clients += 1;
    presence.fired = false;
}

export function operatorStreamClosed(): void {
    presence.clients = Math.max(0, presence.clients - 1);
    if (presence.clients === 0) presence.lastSeenAt = Date.now();
}

function withTimeout<T>(promise: Promise<T>, fallback: T): Promise<T> {
    return Promise.race([
        promise.catch(() => fallback),
        new Promise<T>((resolve) => setTimeout(() => resolve(fallback), HAZARD_FETCH_TIMEOUT_MS))
    ]);
}

function areaBbox(home: LatLon): string {
    const corners = [0, 90, 180, 270].map((bearing) => destinationPoint(home, bearing, LANDING_AREA_RADIUS_M));
    const lats = corners.map((c) => c.lat);
    const lons = corners.map((c) => c.lon);
    return [
        Math.min(...lons) - BBOX_PAD_DEG,
        Math.min(...lats) - BBOX_PAD_DEG,
        Math.max(...lons) + BBOX_PAD_DEG,
        Math.max(...lats) + BBOX_PAD_DEG
    ].join(',');
}

async function setMode(snapshot: VehicleSnapshot, mode: 'RTL' | 'AUTO'): Promise<void> {
    const [baseMode, customMode, customSubMode] = strategyFor(snapshot.modelName, snapshot.typeName).setModeParams(mode);
    await sendMavlinkCommand('DO_SET_MODE', [baseMode, customMode, customSubMode], true);
}

// The launch point to land at: the vehicle's reported home, requested and
// briefly waited for when it is not cached yet.
async function resolveHome(): Promise<LatLon | null> {
    const known = vehicleSnapshot().home;
    if (known) return known;
    await sendMavlinkCommand('REQUEST_MESSAGE', [HOME_POSITION_MSG_ID], true);
    const deadline = Date.now() + HOME_WAIT_MS;
    while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, HOME_POLL_MS));
        const home = vehicleSnapshot().home;
        if (home) return home;
    }
    return null;
}

// The plane recovery: pick an approach corridor clear of airspace, obstacles,
// buildings, and terrain where data allows, upload it as a landing sequence,
// and fly it. Falls back to RTL when no home or fresh position is known or the
// upload fails, which loiters the plane overhead rather than leaving it
// uncommanded.
async function autolandPlane(snapshot: VehicleSnapshot): Promise<void> {
    const home = await resolveHome();
    const position = snapshot.position && Date.now() - snapshot.position.at < POSITION_FRESH_MS ? snapshot.position : null;
    if (!home || !position) {
        pushStationLog('Lost-operator failsafe: no home or fresh position for an approach; commanding RTL');
        await setMode(snapshot, 'RTL');
        return;
    }

    const bbox = areaBbox(home);
    const [airspace, hazards, buildings] = await Promise.all([
        withTimeout(airspaceForBbox(bbox).then((r) => r.zones), []),
        withTimeout(hazardsForBbox(bbox).then((r) => r.obstacles), []),
        withTimeout(buildingsForBbox(bbox), [])
    ]);

    const pick = await pickApproach(
        home,
        { lat: position.lat, lon: position.lon },
        airspace,
        hazards,
        buildings,
        DEFAULT_SAFETY_LIMITS.maxAltitudeM,
        sampleElevationsServer
    );
    for (const warning of pick.warnings) {
        pushStationLog(`Lost-operator failsafe: ${warning}`);
    }

    const synth = buildAutolandMission({}, isPX4(snapshot.modelName), home, {
        lat: pick.approach.lat,
        lon: pick.approach.lon,
        altM: pick.altM
    });
    const result = await uploadMission(synth.items);
    if (!result.ok) {
        pushStationLog(`Lost-operator failsafe: landing upload failed (${result.message}); commanding RTL`);
        await setMode(snapshot, 'RTL');
        return;
    }
    await sendMavlinkCommand('DO_SET_MISSION_CURRENT', [synth.landStartSeq, 0], true);
    await setMode(snapshot, 'AUTO');
    pushStationLog('Lost-operator failsafe: autoland approach uploaded and engaged');
}

async function check(): Promise<void> {
    if (presence.running || !mavlinkConfigured()) return;
    presence.running = true;
    try {
        const minutes = Number((await getSetting(LOST_OPERATOR_SETTING)) ?? 0);
        const snapshot = vehicleSnapshot();
        const armed = isArmed(snapshot.baseMode);
        // A disarm ends the recovery, so the next flight is protected even when
        // no operator reconnects in between.
        if (!armed) presence.fired = false;
        const trigger = lostOperatorTriggers({
            minutes,
            clients: presence.clients,
            lastSeenAt: presence.lastSeenAt,
            fired: presence.fired,
            armed,
            linkUp: linkAlive(),
            now: Date.now()
        });
        if (!trigger) return;

        presence.fired = true;
        if (isPlane(snapshot.typeName)) {
            pushStationLog(`Lost-operator failsafe: no operator for ${minutes} min; starting the autoland approach`);
            await autolandPlane(snapshot);
        } else {
            pushStationLog(`Lost-operator failsafe: no operator for ${minutes} min; commanding RTL`);
            await setMode(snapshot, 'RTL');
        }
    } catch (error) {
        pushStationLog(`Lost-operator failsafe error: ${(error as Error).message}`);
    } finally {
        presence.running = false;
    }
}

if (!building) {
    if (presence.watcher) clearInterval(presence.watcher);
    presence.watcher = setInterval(() => void check(), CHECK_INTERVAL_MS);
}
