import { describe, it, expect } from 'vitest';
import {
  LOW_BANDWIDTH_BITRATE,
  toMediaMtxEnv,
  captureCommand,
  toMediaMtxPatch,
  patchMatchesPathConf
} from './camera-source';

describe('camera source to MediaMTX env', () => {
  it('maps the Pi camera to rpiCamera with no runOnDemand', () => {
    expect(toMediaMtxEnv({ kind: 'pi' })).toEqual({
      WEBRTC_SOURCE: 'rpiCamera',
      WEBRTC_RUNONDEMAND: ''
    });
  });

  it('maps a stream URL straight to the source', () => {
    expect(toMediaMtxEnv({ kind: 'url', url: '  rtsp://10.0.0.5:554/live  ' })).toEqual({
      WEBRTC_SOURCE: 'rtsp://10.0.0.5:554/live',
      WEBRTC_RUNONDEMAND: ''
    });
  });

  it('maps a USB device to a publisher fed by an FFmpeg capture command', () => {
    const env = toMediaMtxEnv({ kind: 'usb', device: '/dev/video1', width: 1280, height: 720, fps: 60 });
    expect(env.WEBRTC_SOURCE).toBe('publisher');
    expect(env.WEBRTC_RUNONDEMAND).toContain('-i /dev/video1');
    expect(env.WEBRTC_RUNONDEMAND).toContain('-video_size 1280x720');
    expect(env.WEBRTC_RUNONDEMAND).toContain('-framerate 60');
    expect(env.WEBRTC_RUNONDEMAND).toContain('rtsp://localhost:8554/cam');
  });

  it('defaults the capture device and geometry', () => {
    expect(captureCommand('/dev/video0')).toBe(
      'ffmpeg -f v4l2 -framerate 30 -video_size 720x480 -i /dev/video0 ' +
        '-c:v libx264 -preset ultrafast -tune zerolatency -pix_fmt yuv420p ' +
        '-f rtsp rtsp://localhost:8554/cam'
    );
  });

  it('builds a MediaMTX patch that sets the source directly for a URL', () => {
    expect(toMediaMtxPatch({ kind: 'url', url: 'rtsp://10.0.0.5:554/live' })).toEqual({
      source: 'rtsp://10.0.0.5:554/live',
      runOnDemand: ''
    });
  });

  it('builds a MediaMTX patch that publishes a capture device on demand', () => {
    const patch = toMediaMtxPatch({ kind: 'usb', device: '/dev/video0' });
    expect(patch.source).toBe('publisher');
    expect(patch.runOnDemand).toContain('ffmpeg');
    expect(patch.runOnDemandRestart).toBe(true);
  });

  it('sets the Pi camera bitrate, capped in low-bandwidth mode', () => {
    expect(toMediaMtxPatch({ kind: 'pi' }).rpiCameraBitrate).toBe(5_000_000);
    expect(toMediaMtxPatch({ kind: 'pi' }, true).rpiCameraBitrate).toBe(LOW_BANDWIDTH_BITRATE);
  });

  it('selects CSI camera 0 unless another camera id is given', () => {
    expect(toMediaMtxPatch({ kind: 'pi' }).rpiCameraCamID).toBe(0);
    expect(toMediaMtxPatch({ kind: 'pi', piCamId: 1 }).rpiCameraCamID).toBe(1);
  });

  it('reports whether a live path config already carries the patch', () => {
    const patch = toMediaMtxPatch({ kind: 'pi', piCamId: 1 });
    expect(patchMatchesPathConf(patch, { ...patch, extra: 'x' })).toBe(true);
    expect(patchMatchesPathConf(patch, { ...patch, rpiCameraCamID: 0 })).toBe(false);
    expect(patchMatchesPathConf(patch, null)).toBe(false);
  });

  it('treats an empty patched value and an absent config value as equal', () => {
    expect(patchMatchesPathConf({ source: 'rtsp://a/b', runOnDemand: '' }, { source: 'rtsp://a/b' })).toBe(
      true
    );
  });

  it('caps the capture encoder bitrate in low-bandwidth mode', () => {
    const patch = toMediaMtxPatch({ kind: 'usb', device: '/dev/video0' }, true);
    expect(patch.runOnDemand).toContain(`-b:v ${LOW_BANDWIDTH_BITRATE}`);
    expect(patch.runOnDemand).toContain(`-maxrate ${LOW_BANDWIDTH_BITRATE}`);
  });
});
