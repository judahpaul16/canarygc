import { describe, expect, it } from 'vitest';
import {
	decodeMode,
	isAirVehicle,
	isArmed,
	isAutoLabel,
	isGroundOrSurface,
	isGuidedLabel,
	isPX4,
	isSubmarine,
	strategyFor,
	MAV_MODE_FLAG_SAFETY_ARMED
} from './flight-modes';

describe('autopilot detection', () => {
	it('detects PX4 by model name', () => {
		expect(isPX4('PX4 Autopilot')).toBe(true);
		expect(isPX4('px4')).toBe(true);
		expect(isPX4('ArduPilot Mega')).toBe(false);
		expect(isPX4('')).toBe(false);
	});

	it('treats everything but rovers, boats, and submarines as air vehicles', () => {
		expect(isAirVehicle('Quadrotor')).toBe(true);
		expect(isAirVehicle('Fixed Wing')).toBe(true);
		expect(isAirVehicle('Ground Rover')).toBe(false);
		expect(isAirVehicle('Surface Boat')).toBe(false);
		expect(isAirVehicle('Submarine')).toBe(false);
		expect(isAirVehicle('')).toBe(false);
	});

	it('identifies submarines for the depth control', () => {
		expect(isSubmarine('Submarine')).toBe(true);
		expect(isSubmarine('Ground Rover')).toBe(false);
		expect(isSubmarine('Quadrotor')).toBe(false);
	});

	it('identifies rovers and boats as ground or surface vehicles', () => {
		expect(isGroundOrSurface('Ground Rover')).toBe(true);
		expect(isGroundOrSurface('Surface Boat')).toBe(true);
		expect(isGroundOrSurface('Submarine')).toBe(false);
		expect(isGroundOrSurface('Quadrotor')).toBe(false);
	});
});

describe('mode encoding', () => {
	it('encodes ArduPilot GUIDED as a copter custom mode', () => {
		const [baseMode, customMode] = strategyFor('ArduPilot').setModeParams('GUIDED');
		expect(baseMode).toBeGreaterThan(0);
		expect(customMode).toBe(4);
	});

	it('encodes PX4 modes as main and sub modes', () => {
		const [, main, sub] = strategyFor('PX4').setModeParams('RTL');
		expect(main).toBeGreaterThan(0);
		expect(sub).toBeGreaterThan(0);
	});

	it('decodes each stack with its own table', () => {
		expect(decodeMode(4, 'ArduPilot')).toBe('GUIDED');
		expect(decodeMode(4, 'PX4')).not.toBe('GUIDED');
	});
});

describe('flag helpers', () => {
	it('reads the armed bit', () => {
		expect(isArmed(MAV_MODE_FLAG_SAFETY_ARMED)).toBe(true);
		expect(isArmed(0)).toBe(false);
	});

	it('matches auto and guided labels across stacks', () => {
		expect(isAutoLabel('AUTO')).toBe(true);
		expect(isAutoLabel('AUTO.MISSION')).toBe(true);
		expect(isGuidedLabel('GUIDED')).toBe(true);
		expect(isGuidedLabel('LOITER')).toBe(false);
	});
});
