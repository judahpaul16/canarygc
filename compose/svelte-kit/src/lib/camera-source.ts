// Maps a chosen live-feed camera source to the two environment values the
// MediaMTX `cam` path reads (WEBRTC_SOURCE and WEBRTC_RUNONDEMAND). The app
// always reads the single WebRTC path at :8889/cam; only the source changes.

export type CameraSourceKind = 'pi' | 'url' | 'usb';

export interface CameraSource {
  kind: CameraSourceKind;
  // A stream URL for kind 'url' (rtsp://, rtmp://, or srt://). An FC-attached
  // camera that advertises RTSP via MAVLink, an IP camera, or a companion
  // computer all land here.
  url?: string;
  // A V4L2 device path for kind 'usb' (for example /dev/video0). A USB analog
  // capture dongle or an HDMI grabber (digital FPV: HDZero, DJI, Walksnail)
  // presents as one of these; a Betaflight board cannot emit IP video itself.
  device?: string;
  width?: number;
  height?: number;
  fps?: number;
}

export interface MediaMtxEnv {
  WEBRTC_SOURCE: string;
  WEBRTC_RUNONDEMAND: string;
}

// The video bitrate the marginal-link posture caps the encoder at, in bits per
// second. The camera bridge and the WebRTC video track share the uplink with
// telemetry, so a hard cap leaves room for the control stream.
export const LOW_BANDWIDTH_BITRATE = 500_000;
const RPI_DEFAULT_BITRATE = 5_000_000;

// MediaMTX transcodes the captured V4L2 device to RTSP on its own server, then
// serves it over WebRTC; browsers cannot play RTSP or raw V4L2 directly. A
// bitrate caps the encoder for the marginal-link posture.
export function captureCommand(
  device: string,
  width = 720,
  height = 480,
  fps = 30,
  bitrate?: number
): string {
  const rate = bitrate
    ? `-b:v ${bitrate} -maxrate ${bitrate} -bufsize ${bitrate * 2} `
    : '';
  return (
    `ffmpeg -f v4l2 -framerate ${fps} -video_size ${width}x${height} -i ${device} ` +
    `-c:v libx264 -preset ultrafast -tune zerolatency -pix_fmt yuv420p ${rate}` +
    `-f rtsp rtsp://localhost:8554/cam`
  );
}

export function toMediaMtxEnv(source: CameraSource): MediaMtxEnv {
  switch (source.kind) {
    case 'pi':
      return { WEBRTC_SOURCE: 'rpiCamera', WEBRTC_RUNONDEMAND: '' };
    case 'url':
      return { WEBRTC_SOURCE: (source.url ?? '').trim(), WEBRTC_RUNONDEMAND: '' };
    case 'usb':
      return {
        WEBRTC_SOURCE: 'publisher',
        WEBRTC_RUNONDEMAND: captureCommand(
          (source.device ?? '/dev/video0').trim(),
          source.width,
          source.height,
          source.fps
        )
      };
  }
}

// The body for MediaMTX's `PATCH /v3/config/paths/patch/cam` control-API call,
// which updates the live `cam` path source without a restart. A capture device
// publishes through an on-demand FFmpeg command; every other source is set
// directly. lowBandwidth caps the encoder bitrate for the Pi camera and the
// USB capture; a URL source runs its own encoder the station cannot reach.
export function toMediaMtxPatch(source: CameraSource, lowBandwidth = false): Record<string, unknown> {
  const bitrate = lowBandwidth ? LOW_BANDWIDTH_BITRATE : undefined;
  switch (source.kind) {
    case 'usb':
      return {
        source: 'publisher',
        runOnDemand: captureCommand(
          (source.device ?? '/dev/video0').trim(),
          source.width,
          source.height,
          source.fps,
          bitrate
        ),
        runOnDemandRestart: true
      };
    case 'pi':
      return {
        source: 'rpiCamera',
        rpiCameraBitrate: bitrate ?? RPI_DEFAULT_BITRATE,
        runOnDemand: ''
      };
    case 'url':
      return { source: (source.url ?? '').trim(), runOnDemand: '' };
  }
}
