import { toMediaMtxPatch, type CameraSource, type CameraSourceKind } from '../camera-source';
import { getSetting } from './settings';

const API_URL = (process.env.MEDIAMTX_API_URL ?? 'http://localhost:9997').replace(/\/$/, '');

// Pushes the chosen source onto the live MediaMTX `cam` path via its control
// API, so the operator's pick in Integrations takes effect without editing a
// file or restarting a container. The camera bridge runs only in the
// production profile, so an unreachable API (dev, or the bridge down) is
// logged and swallowed; the setting re-applies once the bridge is up.
export async function applyCameraSource(source: CameraSource, lowBandwidth = false): Promise<boolean> {
    const patch = toMediaMtxPatch(source, lowBandwidth);
    try {
        const res = await fetch(`${API_URL}/v3/config/paths/patch/cam`, {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(patch)
        });
        if (!res.ok) {
            console.warn(`MediaMTX camera patch returned ${res.status}`);
            return false;
        }
        return true;
    } catch (err) {
        console.warn(`MediaMTX not reachable to apply camera source: ${(err as Error).message}`);
        return false;
    }
}

export async function readCameraSource(): Promise<CameraSource> {
    const kind = ((await getSetting('camera.kind')) ?? 'pi') as CameraSourceKind;
    return {
        kind,
        url: (await getSetting('camera.url')) ?? '',
        device: (await getSetting('camera.device')) ?? '/dev/video0'
    };
}

let applied = false;

// Re-applies the saved source once per server process, so a MediaMTX that
// booted from its env default picks up the operator's stored choice.
export async function initCameraSource(): Promise<void> {
    if (applied) return;
    applied = true;
    const lowBandwidth = (await getSetting('mode.lowBandwidth')) === 'true';
    await applyCameraSource(await readCameraSource(), lowBandwidth);
}

// Re-applies the stored camera source at the current bandwidth posture, so
// toggling low-bandwidth mode caps or restores the video encoder without the
// operator re-picking the source.
export async function applyBandwidthMode(lowBandwidth: boolean): Promise<boolean> {
    return applyCameraSource(await readCameraSource(), lowBandwidth);
}
