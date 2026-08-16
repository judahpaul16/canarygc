import { REGISTRY as MINIMAL_REGISTRY } from 'mavlink-mappings/dist/lib/minimal';
import { REGISTRY as COMMON_REGISTRY } from 'mavlink-mappings/dist/lib/common';
import { REGISTRY as ARDUPILOTMEGA_REGISTRY } from 'mavlink-mappings/dist/lib/ardupilotmega';
import type { MavLinkPacketRegistry } from 'mavlink-mappings';

export const REGISTRY: MavLinkPacketRegistry = {
	...MINIMAL_REGISTRY,
	...COMMON_REGISTRY,
	...ARDUPILOTMEGA_REGISTRY,
};
