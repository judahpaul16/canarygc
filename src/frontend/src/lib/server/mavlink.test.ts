import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SerialPort } from 'serialport';
import { connect, type Socket } from 'net';
import {
  initializePort,
  handlePacket,
  handleDisconnect,
  handleError,
  closeConnection,
  scheduleReconnect,
  online,
  logs,
  newLogs
} from './mavlink'; // Adjust the path accordingly

vi.mock('serialport');
vi.mock('net');

describe('MavLink Function Tests', () => {
  let mockSerialPort: vi.Mocked<SerialPort>;
  let mockSocket: vi.Mocked<Socket>;

  beforeEach(() => {
    vi.useFakeTimers();
    mockSerialPort = new SerialPort({ path: '', baudRate: 115200 }) as unknown as vi.Mocked<SerialPort>;
    mockSocket = connect({ host: 'sitl', port: 5760 }) as unknown as vi.Mocked<Socket>;
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.resetAllMocks();
  });

  it('should initialize port successfully', async () => {
    mockSocket.on = vi.fn((event, callback) => {
      if (event === 'data') callback(); // Simulate successful connection
    });

    await initializePort();

    expect(mockSocket.on).toHaveBeenCalledWith('data', expect.any(Function));
    expect(online).toBe(false);
  });

  it('should handle errors during initialization', async () => {
    const mockError = new Error('Connection error');
    mockSocket.on = vi.fn((event, callback) => {
      if (event === 'error') callback(mockError);
    });

    const scheduleReconnectSpy = vi.spyOn(global, 'setTimeout');

    await initializePort();

    expect(scheduleReconnectSpy).toHaveBeenCalledTimes(1);
  });

  it('should handle packet processing correctly', () => {
    const mockPacket = {
      header: { msgid: 0 },
      payload: {}
    } as any;

    handlePacket(mockPacket);

    expect(online).toBe(true);
    expect(logs.length).toBeGreaterThan(0); // Assuming the packet gets processed into logs
    expect(newLogs.length).toBeGreaterThan(0);
  });

  it('should handle disconnect and schedule reconnection', () => {
    const scheduleReconnectSpy = vi.spyOn(global, 'setTimeout');

    handleDisconnect();

    expect(online).toBe(false);
    expect(scheduleReconnectSpy).toHaveBeenCalledTimes(1);
  });

  it('should handle errors and schedule reconnection', () => {
    const mockError = new Error('Test error');
    const scheduleReconnectSpy = vi.spyOn(global, 'setTimeout');

    handleError(mockError);

    expect(online).toBe(false);
    expect(scheduleReconnectSpy).toHaveBeenCalledTimes(1);
  });

  it('should close connections properly', async () => {
    mockSocket.removeAllListeners = vi.fn();
    mockSocket.destroy = vi.fn();

    await closeConnection();

    expect(mockSocket.removeAllListeners).toHaveBeenCalled();
    expect(mockSocket.destroy).toHaveBeenCalled();
    expect(online).toBe(false);
  });

  it('should schedule reconnection after disconnect or error', () => {
    const initializePortSpy = vi.spyOn(global, 'setTimeout');

    scheduleReconnect();

    expect(initializePortSpy).toHaveBeenCalledWith(expect.any(Function), 5000);
  });
});
