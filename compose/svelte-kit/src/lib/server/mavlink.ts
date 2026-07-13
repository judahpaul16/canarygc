import { SerialPort } from 'serialport';
import { connect, type Socket } from 'net';
import {
    MavLinkPacketSplitter,
    MavLinkPacketParser,
    common,
    ardupilotmega,
    minimal,
    send
} from 'node-mavlink';

import { building } from '$app/environment';
import { REGISTRY } from '$lib/mavlink-registry'

// Once telemetry has flowed, silence beyond this window means a stalled link
// and the connection recycles. Before the first packet the connection just
// listens: an autopilot pauses its boot on serial0 until a client connects and
// can take a minute before the first bytes, and disconnecting mid-boot resets
// it, so a young quiet connection is left alone.
const STALE_LINK_MS = 4000;
// A connection that never produces a packet recycles eventually, so a dead
// peer cannot hold the link forever.
const FIRST_PACKET_RECYCLE_MS = 300_000;
// Telemetry logs are capped so a long-running station cannot grow them without
// bound; the cap covers several minutes of backlog for the event-log view.
const MAX_LOG_ENTRIES = 5000;

const SUPERVISOR_INTERVAL_MS = 2000;
const GCS_HEARTBEAT_MS = 1000;

interface MavlinkState {
    port: SerialPort | Socket | null;
    reader: MavLinkPacketParser | null;
    online: boolean;
    lastPacketAt: number;
    connectedAt: number;
    logs: string[];
    newLogs: string[];
    latestHeartbeat: string;
    supervisor: ReturnType<typeof setInterval> | null;
    gcsBeat: ReturnType<typeof setInterval> | null;
    lastErrorMessage: string;
    wasAlive: boolean;
    suspended: boolean;
}

// The link state lives on globalThis so a dev-server module reload reuses the
// open connection. Module-local state orphans the previous socket on every
// reload, and an orphan holds SITL's single serial-over-TCP slot, leaving every
// later connection byte-less.
const g = globalThis as typeof globalThis & { __canarygcMavlink?: MavlinkState };
const state: MavlinkState = (g.__canarygcMavlink ??= {
    port: null,
    reader: null,
    online: false,
    lastPacketAt: 0,
    connectedAt: 0,
    logs: [],
    newLogs: [],
    latestHeartbeat: '',
    supervisor: null,
    gcsBeat: null,
    lastErrorMessage: '',
    wasAlive: false,
    suspended: false
});

function superviseLink(): void {
    if (state.suspended) return;
    const alive = linkAlive();
    if (alive !== state.wasAlive) {
        state.wasAlive = alive;
        console.log(alive ? 'MAVLink link up' : 'MAVLink link down');
    }
    if (!state.port) {
        initializePort();
        return;
    }
    const now = Date.now();
    const streamedThenStalled = state.lastPacketAt > 0 && now - state.lastPacketAt > STALE_LINK_MS;
    const neverStreamed = state.lastPacketAt === 0 && now - state.connectedAt > FIRST_PACKET_RECYCLE_MS;
    if (streamedThenStalled || neverStreamed) teardownConnection();
}

// The server owns the autopilot link and keeps it alive on its own; browser
// heartbeats read the state these loops maintain rather than driving dialing.
// This also guarantees the first client an autopilot sees after boot is one
// stable connection, since SITL binds serial0 to its first client. The loops
// are recreated on module load so a dev reload runs the current logic, and
// prerendering during the build loads this module too, so they stay off there.
if (!building) {
    if (state.supervisor) clearInterval(state.supervisor);
    state.supervisor = setInterval(superviseLink, SUPERVISOR_INTERVAL_MS);

    // A 1 Hz station heartbeat so autopilot GCS-failsafe configurations see the
    // ground station while the link is up.
    if (state.gcsBeat) clearInterval(state.gcsBeat);
    state.gcsBeat = setInterval(() => {
        if (!linkAlive() || !state.port) return;
        const heartbeat = new minimal.Heartbeat();
        heartbeat.type = minimal.MavType.GCS;
        heartbeat.autopilot = minimal.MavAutopilot.INVALID;
        heartbeat.baseMode = 0 as minimal.MavModeFlag;
        heartbeat.customMode = 0;
        heartbeat.systemStatus = minimal.MavState.ACTIVE;
        heartbeat.mavlinkVersion = 3;
        send(state.port, heartbeat).catch(() => {});
    }, GCS_HEARTBEAT_MS);
}

const logs = state.logs;
const newLogs = state.newLogs;

export function latestHeartbeat(): string {
    return state.latestHeartbeat;
}

// A firmware upload needs the autopilot's serial device to itself; suspend
// releases the connection and holds the supervisor off until resume, when the
// station dials back into the freshly flashed board.
export function suspendLink(): void {
    state.suspended = true;
    teardownConnection();
}

export function resumeLink(): void {
    state.suspended = false;
}

function pushLog(entry: string): void {
    logs.push(entry);
    newLogs.push(entry);
    if (logs.length > MAX_LOG_ENTRIES) logs.splice(0, logs.length - MAX_LOG_ENTRIES);
    if (newLogs.length > MAX_LOG_ENTRIES) newLogs.splice(0, newLogs.length - MAX_LOG_ENTRIES);
}

function linkAlive(): boolean {
    return Boolean(
        state.port && state.reader && state.lastPacketAt > 0 && Date.now() - state.lastPacketAt < STALE_LINK_MS
    );
}

// Opens the connection and starts listening; the link counts as alive once the
// first packet arrives. Safe to call repeatedly, it only dials when no
// connection exists.
function initializePort(): void {
    if (state.port || state.suspended) return;
    try {
        openConnection();
        setupPacketReader();
        setupPortListeners();
        state.connectedAt = Date.now();
    } catch (error) {
        teardownConnection();
        const message = (error as Error).message;
        if (message !== state.lastErrorMessage) {
            state.lastErrorMessage = message;
            console.error('Failed to initialize port:', message);
        }
    }
}

function teardownConnection(): void {
    state.reader?.removeAllListeners();
    state.reader = null;
    if (state.port) {
        state.port.removeAllListeners();
        state.port.destroy();
        state.port = null;
    }
    state.online = false;
    state.lastPacketAt = 0;
    state.connectedAt = 0;
}

function openConnection(): void {
    const isProduction = process.env.NODE_ENV === 'production';
    if (isProduction === true) {
        // Use UART serial port in production
        state.port = new SerialPort({ path: '/dev/ttyACM0', baudRate: 115200, lock: false });
    } else {
        // Use TCP socket in development
        const socket = connect({ host: 'sitl', port: 5760 });
        socket.setKeepAlive(true, 1000);
        socket.setNoDelay(true);
        state.port = socket;
    }
}

function setupPacketReader(): void {
    state.reader = state.port!
        .pipe(new MavLinkPacketSplitter())
        .pipe(new MavLinkPacketParser());

    state.reader.on('data', (packet) => {
        if (state.lastPacketAt === 0) {
            state.lastErrorMessage = '';
            pushLog('MAVLink connection initialized');
        }
        state.online = true;
        state.lastPacketAt = Date.now();
        const clazz = REGISTRY[packet.header.msgid];
        if (clazz) {
            const data = packet.protocol.data(packet.payload, clazz);
            const sanitizedData = convertBigIntToNumber(data);
            const timestamp = new Date().toISOString();
            const logEntry = `${clazz.MSG_NAME}(${clazz.MAGIC_NUMBER})::${timestamp}::${JSON.stringify(sanitizedData)}`;
            pushLog(logEntry);
            // The vehicle heartbeat arrives at 1 Hz while attitude and position
            // stream far faster, so it can rotate out of the capped ring between
            // client polls; the newest one is kept aside so every poll sees it.
            // Type 6 is MAV_TYPE_GCS: a bridge such as MAVProxy beats too, and
            // its heartbeat must never shadow the vehicle's.
            if (clazz.MSG_NAME === 'HEARTBEAT' && (sanitizedData as { type?: number }).type !== 6) {
                state.latestHeartbeat = logEntry;
            }
            if (logEntry.includes('_ACK') && !logEntry.includes('"command":512')) console.log(logEntry);
        }
    });
}

function setupPortListeners(): void {
    state.port!.on('close', handlePortClose);
    // A stream 'error' with no listener would crash the process; handle it so a
    // mid-flight read error drops the link cleanly instead.
    state.port!.on('error', handlePortError);
}

function handlePortClose(): void {
    teardownConnection();
    pushLog('MAVLink connection closed');
}

function handlePortError(err: Error): void {
    teardownConnection();
    if (err.message !== state.lastErrorMessage) {
        state.lastErrorMessage = err.message;
        pushLog(`MAVLink connection error: ${err.message}`);
    }
}

async function requestStatus() {
    if (!state.port || !state.reader) {
        state.online = false;
        return;
    }

    let request = new common.RequestMessageCommand();
    request.targetSystem = 1;
    request.targetComponent = 1;
    request.messageId = common.GlobalPositionInt.MSG_ID;
    request.responseTarget = 1;
    await send(state.port, request);

    request = new common.RequestMessageCommand();
    request.targetSystem = 1;
    request.targetComponent = 1;
    request.messageId = common.GpsRawInt.MSG_ID;
    request.responseTarget = 1;
    await send(state.port, request);

    request = new common.RequestMessageCommand();
    request.targetSystem = 1;
    request.targetComponent = 1;
    request.messageId = common.MissionCurrent.MSG_ID;
    request.responseTarget = 1;
    await send(state.port, request);

    request = new common.RequestMessageCommand();
    request.targetSystem = 1;
    request.targetComponent = 1;
    request.messageId = common.BatteryStatus.MSG_ID;
    request.responseTarget = 1;
    await send(state.port, request);
}

async function requestParameters() {
    if (!state.port || !state.reader) {
        state.online = false;
        return;
    }

    const request = new common.ParamRequestList();
    request.targetSystem = 1;
    request.targetComponent = 1;
    await send(state.port, request);
}

async function writeParameter(id: string, value: number, type: number) {
    if (!state.port || !state.reader) {
        state.online = false;
        return;
    }

    const request = new common.ParamSet();
    request.targetSystem = 1;
    request.targetComponent = 1;
    request.paramId = id;
    request.paramValue = value;
    request.paramType = type;
    await send(state.port, request);
}

async function sendMavlinkCommand(command: string, params: number[], useCmdLong = false, useArduPilotMega = false) {
    if (!state.port || !state.reader) {
        state.online = false;
        return;
    }

    let commandMsg: common.CommandInt | common.CommandLong;
    if (useCmdLong) commandMsg = new common.CommandLong();
    else {
        commandMsg = new common.CommandInt();
        commandMsg.frame = 0; // MAV_FRAME_GLOBAL;
    };

    commandMsg.targetSystem = 1;
    commandMsg.targetComponent = 1;

    if (useArduPilotMega) commandMsg.command = parseInt(`${ardupilotmega.MavCmd[command as keyof typeof ardupilotmega.MavCmd]}`);
    else commandMsg.command = common.MavCmd[command as keyof typeof common.MavCmd];

    // Assign every param the caller supplied, including 0 and NaN. A truthy
    // guard would drop them, and NAV_TAKEOFF needs NaN lat/lon to mean "take
    // off in place" rather than the CommandLong's 0 default (which sends the
    // vehicle toward coordinate 0,0).
    if (params[0] !== undefined) commandMsg._param1 = params[0];
    if (params[1] !== undefined) commandMsg._param2 = params[1];
    if (params[2] !== undefined) commandMsg._param3 = params[2];
    if (params[3] !== undefined) commandMsg._param4 = params[3];
    if (params[4] !== undefined) commandMsg._param5 = params[4];
    if (params[5] !== undefined) commandMsg._param6 = params[5];
    if (params[6] !== undefined) commandMsg._param7 = params[6];
    await send(state.port, commandMsg);
}

// One frame of the gamepad stream; axes arrive pre-normalized to the
// MANUAL_CONTROL -1000..1000 ranges.
async function sendManualControl(x: number, y: number, z: number, r: number, buttons: number) {
    if (!state.port || !state.reader) {
        state.online = false;
        return;
    }

    const msg = new common.ManualControl();
    msg.target = 1;
    msg.x = x;
    msg.y = y;
    msg.z = z;
    msg.r = r;
    msg.buttons = buttons;
    await send(state.port, msg);
}

async function setMissionCount(numItems: number) {
    if (!state.port || !state.reader) {
        state.online = false;
        return;
    }

    const count = new common.MissionCount();
    count.targetSystem = 1;
    count.targetComponent = 1;
    count.count = numItems;
    count.opaqueId = 0;
    await send(state.port, count);
    await new Promise((resolve) => setTimeout(resolve, 250)); // Wait for 250 ms
}

export interface MissionItemInput {
    command: number;
    frame: number;
    lat: number;
    lon: number;
    alt: number;
    param1: number;
    param2: number;
    param3: number;
    param4: number;
}

async function loadMissionItem(item: MissionItemInput, index: number) {
    if (!state.port || !state.reader) {
        state.online = false;
        return;
    }

    const msg = new common.MissionItemInt();
    msg.targetSystem = 1;
    msg.targetComponent = 1;
    msg.seq = index;
    msg.frame = item.frame;
    msg.command = item.command;
    msg.current = index === 0 ? 1 : 0;
    msg.autocontinue = 1;
    msg.param1 = item.param1;
    msg.param2 = item.param2;
    msg.param3 = item.param3;
    msg.param4 = item.param4;
    msg.x = Number((item.lat * 1e7).toFixed(0));
    msg.y = Number((item.lon * 1e7).toFixed(0));
    msg.z = item.alt;
    msg.missionType = 0;
    await send(state.port, msg);
}

async function clearAllMissionItems() {
    if (!state.port || !state.reader) {
        state.online = false;
        return;
    }

    const msg = new common.MissionClearAll();
    msg.targetSystem = 1;
    msg.targetComponent = 1;
    await send(state.port, msg);
}

async function setPositionLocal(x: number, y: number, z: number) {
    if (!state.port || !state.reader) {
        state.online = false;
        return;
    }
    const msg = new common.SetPositionTargetLocalNed();

    msg.timeBootMs = 0;
    msg.targetSystem = 1;
    msg.targetComponent = 1;
    msg.coordinateFrame = 1; // MAV_FRAME_LOCAL_NED
    // @ts-expect-error typeMask is declared readonly upstream but must be set per message
    msg.typeMask = 0b011111111000; // ignore all but position
    msg.x = x;
    msg.y = y;
    msg.z = z;
    msg.yawRate = 0;
    await send(state.port, msg);
  }

function convertBigIntToNumber(obj: unknown): unknown {
    if (typeof obj === 'bigint') {
        return Number(obj);
    } else if (Array.isArray(obj)) {
        return obj.map(convertBigIntToNumber);
    } else if (obj !== null && typeof obj === 'object') {
        return Object.fromEntries(
            Object.entries(obj).map(([key, value]) => [key, convertBigIntToNumber(value)])
        );
    } else {
        return obj;
    }
}

export {
    initializePort,
    requestStatus,
    requestParameters,
    writeParameter,
    sendMavlinkCommand,
    sendManualControl,
    setMissionCount,
    loadMissionItem,
    clearAllMissionItems,
    setPositionLocal,
    linkAlive,
    logs,
    newLogs,
};
