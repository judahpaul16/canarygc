// File: src/lib/mavlink-registry.ts


import { ardupilotmega, common, minimal, type MavLinkPacketRegistry } from 'node-mavlink';

export const REGISTRY: MavLinkPacketRegistry = {
	...minimal.REGISTRY,
	...common.REGISTRY,
	...ardupilotmega.REGISTRY,
};

