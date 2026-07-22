import type { MavLinkData, MavLinkDataConstructor } from 'mavlink-mappings';

export function convertBigIntToNumber(obj: unknown): unknown {
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

export function formatTelemetryLine(
	clazz: MavLinkDataConstructor<MavLinkData>,
	data: unknown,
	timestamp: string
): string {
	return `${clazz.MSG_NAME}(${clazz.MAGIC_NUMBER})::${timestamp}::${JSON.stringify(data)}`;
}
