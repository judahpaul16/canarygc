import { describe, it, expect } from 'vitest';
import { toMediaMtxEnv, captureCommand, toMediaMtxPatch } from './camera-source';

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
});
