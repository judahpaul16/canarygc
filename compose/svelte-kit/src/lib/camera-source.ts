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

// MediaMTX transcodes the captured V4L2 device to RTSP on its own server, then
// serves it over WebRTC; browsers cannot play RTSP or raw V4L2 directly.
export function captureCommand(
  device: string,
  width = 720,
  height = 480,
  fps = 30
): string {
  return (
    `ffmpeg -f v4l2 -framerate ${fps} -video_size ${width}x${height} -i ${device} ` +
    `-c:v libx264 -preset ultrafast -tune zerolatency -pix_fmt yuv420p ` +
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
// directly.
export function toMediaMtxPatch(source: CameraSource): Record<string, unknown> {
  const env = toMediaMtxEnv(source);
  if (env.WEBRTC_RUNONDEMAND) {
    return {
      source: env.WEBRTC_SOURCE,
      runOnDemand: env.WEBRTC_RUNONDEMAND,
      runOnDemandRestart: true
    };
  }
  return { source: env.WEBRTC_SOURCE, runOnDemand: '' };
}
