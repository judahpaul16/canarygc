import { PeerConnection, type DataChannel } from 'node-datachannel';
import { subscribeTelemetry, mavlinkConfigured, latestHeartbeat } from './mavlink';
import { operatorStreamOpened, operatorStreamClosed } from './operator-failsafe';
import {
    ENVELOPE_DISABLED,
    encodeFrameEnvelope,
    encodeLineEnvelope,
    encodeMarkerEnvelope
} from '$lib/telemetry-envelope';

const ICE_SERVERS = ['stun:stun.l.google.com:19302'];
const GATHER_TIMEOUT_MS = 3000;

// ICE only needs one working candidate pair, so the answer goes back once
// gathering finishes or the ceiling passes, whichever comes first.
function gatheredDescription(pc: PeerConnection): Promise<string> {
    return new Promise((resolve) => {
        const finish = () => resolve(pc.localDescription()?.sdp ?? '');
        if (pc.gatheringState() === 'complete') return finish();
        const timer = setTimeout(finish, GATHER_TIMEOUT_MS);
        pc.onGatheringStateChange((state) => {
            if (state === 'complete') {
                clearTimeout(timer);
                finish();
            }
        });
    });
}

// Answers a browser's SDP offer with a peer that pushes the raw MAVLink frames
// over the operator's unreliable telemetry DataChannel. Loss drops a packet
// instead of stalling the stream behind TCP retransmits, and the frames ride
// above the video track the same peer scheduler serves. The operator-present
// failsafe hooks track the channel exactly as the fallback stream tracks its
// connection.
export async function answerTelemetryOffer(offerSdp: string): Promise<string> {
    const pc = new PeerConnection('gcs', { iceServers: ICE_SERVERS });
    let unsubscribe: (() => void) | null = null;
    let present = false;

    const cleanup = () => {
        if (present) {
            operatorStreamClosed();
            present = false;
        }
        unsubscribe?.();
        unsubscribe = null;
        try {
            pc.close();
        } catch {
            // Already closed.
        }
    };

    pc.onStateChange((state) => {
        if (state === 'disconnected' || state === 'failed' || state === 'closed') cleanup();
    });

    pc.onDataChannel((channel: DataChannel) => {
        if (channel.getLabel() !== 'telemetry') return;
        const send = (bytes: Uint8Array) => {
            try {
                if (channel.isOpen()) channel.sendMessageBinary(Buffer.from(bytes));
            } catch {
                // Channel closed between the check and the send.
            }
        };
        channel.onOpen(() => {
            operatorStreamOpened();
            present = true;
            if (!mavlinkConfigured()) {
                send(encodeMarkerEnvelope(ENVELOPE_DISABLED));
                return;
            }
            const heartbeat = latestHeartbeat();
            if (heartbeat) send(encodeLineEnvelope(Date.now(), heartbeat));
            unsubscribe = subscribeTelemetry({
                onFrame: (tsMs, frame) => send(encodeFrameEnvelope(tsMs, frame)),
                onLine: (tsMs, line) => send(encodeLineEnvelope(tsMs, line))
            });
        });
        channel.onClosed(() => cleanup());
    });

    pc.setRemoteDescription(offerSdp, 'offer');
    return gatheredDescription(pc);
}
