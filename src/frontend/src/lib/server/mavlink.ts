import { SerialPort } from 'serialport';
import { connect, type Socket } from 'net';
import {
    MavLinkPacketSplitter,
    MavLinkPacketParser,
    type MavLinkPacketRegistry,
    type MavLinkPacket,
    minimal,
    common,
    ardupilotmega,
    send
} from 'node-mavlink';
import type { MissionPlanActions } from '../../stores/missionPlanStore';

const REGISTRY: MavLinkPacketRegistry = {
    ...minimal.REGISTRY,
    ...common.REGISTRY,
    ...ardupilotmega.REGISTRY,
};

interface ParamValueData {
    paramId: string;
    paramValue: string;
    paramType: number;
    paramCount: number;
    paramIndex: number;
}

let port: SerialPort | Socket | null = null;
let reader: MavLinkPacketParser | null = null;
let online = false;
let statusRequested = false;
let logs: string[] = [];
let newLogs: string[] = [];

async function initializePort(): Promise<void> {
    if (port) return; // Return if port is already initialized

    // Use UART serial port in production
    // port = new SerialPort({ path: '/dev/ttyACM0', baudRate: 115200 });

    // Uncomment for development
    port = connect({ host: 'sitl', port: 5760 });

    await new Promise<void>((resolve, reject) => {
        port!.on('error', (err) => {
            reject(new Error(`Error connecting to the MAVLink server: ${err.message}`));
        });
        port!.on('data', () => {
            logs.push('MAVLink connection initialized');
            resolve();
        });
    });

    reader = port
        .pipe(new MavLinkPacketSplitter())
        .pipe(new MavLinkPacketParser());

    reader.on('data', (packet: MavLinkPacket) => {
        online = true;
        const clazz = REGISTRY[packet.header.msgid];
        if (clazz) {
            const data = packet.protocol.data(packet.payload, clazz);
            const sanitizedData = convertBigIntToNumber(data);
            let timestamp = new Date().toISOString();
            let logEntry = `${clazz.MSG_NAME}(${clazz.MAGIC_NUMBER})::${timestamp}::${JSON.stringify(sanitizedData as ParamValueData)}`;
            logs.push(logEntry); // Store log entries
            newLogs.push(logEntry);
            if (logEntry.includes('_ACK')) console.log(logEntry);
        }
    });

    port.on('close', () => {
        port = null;
        reader = null;
    });
}

async function requestSysStatus() {
    if (!port || !reader) throw new Error('Port or reader is not initialized');

    let request = new common.SetMessageIntervalCommand();
    request.targetSystem = 1;
    request.targetComponent = 1;
    request.messageId = common.GlobalPositionInt.MSG_ID;
    request.interval = 1000000; // 1 Hz (every 1 seconds)
    request.responseTarget = 1;
    await send(port!, request);

    request = new common.SetMessageIntervalCommand();
    request.targetSystem = 1;
    request.targetComponent = 1;
    request.messageId = common.MissionCurrent.MSG_ID;
    request.interval = 1000000; // 1 Hz (every 1 seconds)
    request.responseTarget = 1;
    await send(port!, request);

    request = new common.SetMessageIntervalCommand();
    request.targetSystem = 1;
    request.targetComponent = 1;
    request.messageId = common.SysStatus.MSG_ID;
    request.interval = 1000000; // 1 Hz (every 1 seconds)
    request.responseTarget = 1;
    await send(port!, request);
    statusRequested = true;
}

async function requestParameters() {
    if (!port || !reader) throw new Error('Port or reader is not initialized');

    const request = new common.ParamRequestList();
    request.targetSystem = 1;
    request.targetComponent = 1;
    await send(port!, request);
}

async function sendMavlinkCommand(command: string, params: number[], useArduPilotMega = false, useCmdLong = true) {
    if (!port || !reader) throw new Error('Port or reader is not initialized');

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

    if (params[0]) commandMsg._param1 = params[0];
    if (params[1]) commandMsg._param2 = params[1];
    if (params[2]) commandMsg._param3 = params[2];
    if (params[3]) commandMsg._param4 = params[3];
    if (params[4]) commandMsg._param5 = params[4];
    if (params[5]) commandMsg._param6 = params[5];
    if (params[6]) commandMsg._param7 = params[6];
    await send(port, commandMsg);
}

async function setMissionCount(numItems: number) {
    if (!port || !reader) throw new Error('Port or reader is not initialized');

    const count = new common.MissionCount();
    count.targetSystem = 1;
    count.targetComponent = 1;
    count.count = numItems;
    count.opaqueId = 0;
    await send(port, count);
    await new Promise((resolve) => setTimeout(resolve, 250)); // Wait for 250 ms
}

async function loadMissionItem(item: any, index: number) {
    if (!port || !reader) throw new Error('Port or reader is not initialized');

    const msg = new common.MissionItemInt();
    msg.targetSystem = 1;
    msg.targetComponent = 1;
    msg.seq = index;
    msg.frame = 3 // MAV_FRAME_GLOBAL_RELATIVE_ALT;
    msg.command = common.MavCmd[`${item.type}` as keyof typeof common.MavCmd];
    msg.current = index === 0 ? 1 : 0;
    msg.autocontinue = 1;
    if (item.param1 !== null) msg.param1 = item.param1;
    if (item.param2 !== null) msg.param2 = item.param2;
    if (item.param3 !== null) msg.param3 = item.param3;
    if (item.param4 !== null) msg.param4 = item.param4;
    msg.x = Number((item.lat * 1e7).toFixed(0));
    msg.y = Number((item.lon * 1e7).toFixed(0));
    msg.z = item.alt === null ? 0 : item.alt;
    msg.missionType = 0;
    await send(port, msg);
}

async function clearAllMissionItems() {
    if (!port || !reader) throw new Error('Port or reader is not initialized');

    const msg = new common.MissionClearAll();
    msg.targetSystem = 1;
    msg.targetComponent = 1;
    await send(port, msg);
}

async function setPositionLocal(x: number, y: number, z: number) {
    if (!port || !reader) throw new Error('Port or reader is not initialized');
    const msg = new common.SetPositionTargetLocalNed();
    
    // Set parameters for the command
    msg.timeBootMs = 0;
    msg.targetSystem = 1;
    msg.targetComponent = 1;
    msg.coordinateFrame = 1; // MAV_FRAME_LOCAL_NED
    // ignore velocity and acceleration and yaw
    // @ts-ignore
    msg.typeMask = 0b111111111000;
    msg.x = x;
    msg.y = y;
    msg.z = z;
    // Send the command to the drone
    await send(port, msg);
  }

function convertBigIntToNumber(obj: any): any {
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
    requestSysStatus,
    requestParameters,
    sendMavlinkCommand,
    setMissionCount,
    loadMissionItem,
    clearAllMissionItems,
    setPositionLocal,
    online,
    statusRequested,
    logs,
    newLogs,
    common,
};
