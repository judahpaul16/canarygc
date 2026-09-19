# CanaryGC on RK3588

This document describes deploying CanaryGC as a Docker Compose stack on an
RK3588 board running **Armbian**, and pushing the board's hardware **HDMI-In
(RX)** input into the running web app via MediaMTX + ffmpeg's Rockchip
hardware encoder (H.264).

The deployment helper configures the existing ARM64 application stack and
board UART access. The optional video publisher is **HDMI-RX only**, via
`rk_hdmirx`; MIPI-CSI sensor and ISP bring-up remains board-specific.

---

## 1. What this covers

- One-shot provisioning script: `contrib/setup-rk3588.sh`
- HDMI-In push service: `contrib/hdmi-in-push.sh` + `contrib/hdmi-in-push.service`
- MediaMTX container profile in `docker-compose.yml` (host network, RTSP on
  TCP, H.264 from the Rockchip VPU encoder `h264_rkmpp`)
- Device-cgroup rules for Linux serial nodes `ttyS0..ttyS15`
  (character device major 4, minor numbers 64..79)

### Hardware evidence and validation boundary

| Item | Value |
|------|-------|
| Board | RK3588 (Armbian) |
| OS release | Ubuntu 24.04 (noble) / Armbian 26.8 |
| Kernel | `6.1.157-rk3588-ophub` vendor kernel |
| Capture | **HDMI-RX** via `rk_hdmirx`; video node numbering varies |
| Encoder | `h264_rkmpp` (Rockchip MPP, hw) |
| Notes | The host FFmpeg build must provide `h264_rkmpp`; generic distribution builds may not |

The table records the contributor's earlier working HDMI-RX deployment.
The revised installer, watchdog, and cleanup logic in this contribution have
been validated with isolated command stubs, not re-tested on that board.
Existing upstream images already support ARM64; this contribution does not
introduce a new image architecture. The UART rules allow Linux device numbers;
they do not imply that a board exposes sixteen physical UARTs.

---

## 2. Prerequisites

- An RK3588 board running Armbian. **Tested baseline: Ubuntu 24.04 (noble)
  based Armbian images, vendor kernel `6.1.157-rk3588-ophub`, HDMI-RX via
  `rk_hdmirx`.** This is the only hardware test this document is based on.
- `curl` to download the helper; `sudo` and a user allowed to install packages.
- `git`, `docker.io`, `docker-compose-v2`, and `ca-certificates` are installed
  by the helper from the distribution's packages. `docker-compose-v2` is not
  packaged on every release, so the script detects the OS, warns outside the
  tested baseline, and reports an actionable error if the compose plugin is
  missing after install.
- The app repo (default `judahpaul16/canarygc` main branch; override with
  `REPO_URL` / `REPO_BRANCH`).

---

## 3. Install (with system setup)

```bash
curl -fsSL https://raw.githubusercontent.com/judahpaul16/canarygc/main/contrib/setup-rk3588.sh \
  | bash -s --
```

What the script does:

1. Detects the OS and states the tested baseline (Ubuntu 24.04 noble Armbian
   images); anything else gets a `WARN` that `docker-compose-v2` may be
   missing. It never adds third-party apt repositories.
2. Installs system packages (`docker.io`, `docker-compose-v2`, `git`,
   `ca-certificates`) **non-interactively**.
3. Adds the current user to `dialout` and `video` for host device access
   (a re-login is required). Container access uses the existing `/dev` mount
   and device-cgroup rules. Docker group access may require another login.
4. Fails up front with an actionable message if the `docker compose` (v2
   plugin) command is unavailable after install.
5. Clones `judahpaul16/canarygc` into the home directory (if not already
   present). **The install is non-destructive:**
   - An existing checkout (`$APP_DIR/.git`) is reused as-is — never `rm`'d,
     never force-cloned, never overwritten, never auto-pulled.
   - An existing `.env` is **never** overwritten. Only a missing `.env` is
     created from `.env.example`, then tuned to RK3588 defaults:
     `WEBRTC_SOURCE=publisher` so the `hdmi-in-push` service can push into
     MediaMTX's path. Existing `.env` files (e.g. carried over from a
     Raspberry Pi) keep whatever they set — to use an IP camera on a reused
     `.env`, set `WEBRTC_SOURCE=rtsp://...` yourself.
    - The default mode starts production services `app`, `nginx`, and `webrtc`.
      It does not prune Docker data or stop unrelated services.
   - The host's WiFi/NetworkManager policy, serial getty console on
     `ttyS0`/`ttyS1`, and system UART console are left untouched.
6. Starts the production stack:
   `docker compose --profile production up -d app nginx webrtc`. The `webrtc`
   (MediaMTX) service is **always** started rather than gated on a
   `/dev/video*` node existing at install time — its source can be an
   IP-camera RTSP/RTMP/SRT URL, a local capture device, or the `hdmi-in-push`
   service.

### Firewall management (yours, not the script's)

`setup-rk3588.sh` never enables UFW or adds firewall rules: on a remotely
administered board, enabling a firewall from the installer can drop the SSH
session the installer itself runs in. Manage the firewall out-of-band, after
the SSH port is confirmed open. If you choose UFW, a minimal starting point:

```bash
sudo ufw allow 22      # your SSH port (use your actual SSH port)
sudo ufw allow 80      # HTTP_PORT
sudo ufw allow 8889/tcp
sudo ufw allow 8189/udp
sudo ufw enable
```

Also note: Docker bridge networking needs IPv4 forwarding, which the Docker
daemon configures for itself at startup — the script performs no manual
`sysctl` changes.

### Install-only (Skip system setup)

If Docker and Compose are already configured, run from your checkout:

```bash
REPO_BRANCH=main bash -s -- --install-only < contrib/setup-rk3588.sh
```

This reuses an existing `$APP_DIR/.git` clone, preserves `.env`, and only runs
`docker compose --profile production up -d` — no `sudo`, no package installs.
A `--simulation` mode starts the `development` profile for SITL testing.

`APP_DIR` selects the checkout directory. Existing checkouts are not updated
automatically, including when `REPO_URL` or `REPO_BRANCH` is specified; update
them deliberately before rerunning. Download URLs above become available in
upstream `main` only after this contribution is merged. To review before
merge, run `bash contrib/setup-rk3588.sh` from this contribution's checkout,
with `APP_DIR` pointing to it.

### Connect the flight controller

Enable the desired UART in your board's device tree/BSP, verify its pinout
and voltage level, and use a non-console UART. Pin numbering and UART aliases
vary between boards. CanaryGC's automatic scan does not include every
`/dev/ttyS*` device, so set an explicit path in the checkout's `.env`:

```ini
MAVLINK_SERIAL_PATH=/dev/ttyS8
MAVLINK_BAUD=115200
```

`ttyS8` is an example, not a universal RK3588 mapping. Match the flight
controller's configured MAVLink baud rate. Apply changes with
`docker compose --profile production up -d app` and check
`docker compose logs --tail=50 app` for `MAVLink link up`.
Ordinary container restarts preserve the environment used at creation;
after editing `.env`, use Compose `up` to recreate changed services.

---

## 4. HDMI-In push service (HDMI-RX only)

Depending on the kernel, the `rk_hdmirx` node may appear before or after a
source is connected. `contrib/hdmi-in-push.sh` independently checks node
discovery and valid DV timings; the systemd unit runs this script. It:

1. **Waits for the capture node** (`/dev/video*` from the `rk_hdmirx` probe)
   — the driver node may not be present at boot.
2. **Waits for an HDMI signal** (via `v4l2-ctl --query-dv-timings`); when the
   source is live it starts ffmpeg with:
   - `h264_rkmpp` hardware encoder (VPU), native source FPS probed from the
     DV timings (fallback `30`),
   - default bitrate `6_000_000` (6000 kbps) — override `BITRATE`,
   - `-rtsp_transport tcp` for MediaMTX interop, pushing to
     `rtsp://127.0.0.1:8554/$CAM_PATH` (default `CAM_PATH=cam`; set
     `RTSP_PUSH_URL` to override, keeping the path equal to `CAM_PATH`).
3. **Watchdog**: polls the MediaMTX path state (`/v3/paths/get/$CAM_PATH`) and
    restarts ffmpeg after two consecutive explicit offline observations.
    It prefers `online`; older APIs use `ready` when `online` is absent.
    API failures and responses without either state are unknown and do not
    trigger a restart. An
   unknown poll additionally **resets the consecutive-down counter** (so
   `down -> unknown -> down` is not a run of two downs) and is logged
   rate-limited (on the transition, then at most once a minute). JSON matches
   tolerate whitespace (`"online": true`).
4. **Preflight** uses the `ffmpeg -encoders` **list** to prove `h264_rkmpp`
   exists, not `ffmpeg -h encoder=...` (which returns exit 0 even for encoders
   the build lacks). A `RTSP_PUSH_URL` whose path differs from `CAM_PATH`
   fails at startup with a clear message instead of drifting at runtime.
5. Single-instance enforcement via `flock` on `/run/hdmi-in-push.lock`
   (`LOCK_FILE`); a second instance exits quietly.
6. **Cleanup** terminates the tracked processes and their current descendants,
   waits for direct children, and bounds graceful termination before SIGKILL.
   systemd additionally enforces control-group cleanup and a stop timeout.

### Install

Install `v4l-utils`, `curl`, `util-linux` (`flock`), and `procps` (`pgrep`),
plus a board-compatible FFmpeg build with Rockchip MPP support. Check:

```bash
ffmpeg -hide_banner -encoders
v4l2-ctl --list-devices
v4l2-ctl -d /dev/video1 --query-dv-timings
```

Replace `/dev/video1` with the `rk_hdmirx` capture node. The encoder list
must include `h264_rkmpp`. Set `WEBRTC_SOURCE=publisher` in `.env`, then run
`docker compose --profile production up -d webrtc` before enabling the service.
Clear any saved camera-source override in the application's Integrations
settings if it selects a different source. The publisher runs on the host;
the existing `latest-rpi` MediaMTX image is not a source of host FFmpeg tools.

```bash
sudo install -m 0755 contrib/hdmi-in-push.sh /usr/local/bin/hdmi-in-push.sh
sudo install -m 0644 contrib/hdmi-in-push.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now hdmi-in-push
```

Optional config: create `/etc/default/hdmi-in-push` (loaded via
`EnvironmentFile=-/etc/default/hdmi-in-push`):

```ini
# MediaMTX API (the service's own v3 API, default http://127.0.0.1:9997)
MEDIAMTX_API=http://127.0.0.1:9997
# MediaMTX path this service publishes to; must match the RTSP_PUSH_URL path.
CAM_PATH=cam
# RTSP target on the MediaMTX server (default rtsp://127.0.0.1:8554/cam)
RTSP_PUSH_URL=rtsp://127.0.0.1:8554/cam
BITRATE=6000000
LOCK_FILE=/run/hdmi-in-push.lock
```

After changing `/etc/default/hdmi-in-push`, run
`sudo systemctl restart hdmi-in-push`. Inspect failures with
`journalctl -u hdmi-in-push -n 50 --no-pager`. After correcting repeated
startup errors, use `sudo systemctl reset-failed hdmi-in-push` before starting
again. No HDMI signal is a waiting state, not a service failure.

Default probe/retry intervals are 0.5 seconds; absent-node polling is 2
seconds. Five failures shorter than 10 seconds trigger a 30-second backoff.
The watchdog waits 8 seconds at startup and polls every second. These values
can be overridden using the variable names in the script.

---

## 5. docker-compose.yml : RK3588 additions

The only Compose change is expanded serial-device permission:

**`device_cgroup_rules`** — Linux serial range
   (`c 4:64 rmw` … `c 4:79 rmw`, covering `ttyS0..ttyS15`), in addition to the
   generic USB serial (`188:*`), USB ACM (`166:*`), USB bus devices (`189:*`),
   and existing `204:*` rules. The upstream rules already allow `ttyS0/ttyS1`;
   this adds `ttyS2..ttyS15` without granting access to virtual terminals.

```
device_cgroup_rules:
  - "c 166:* rmw"
  - "c 188:* rmw"
  - "c 204:* rmw"
  - "c 4:64 rmw"
  - "c 4:65 rmw"
  - ...
  - "c 4:79 rmw"
  - "c 189:* rmw"
```

Host networking, MediaMTX, and ARM64 images already exist upstream. The
unchanged MediaMTX service binds RTSP to `:8554`, WebRTC HTTP to `:8889`, and
the control API to `:9997` (not loopback-only). Restrict access to trusted
networks with your deployment's firewall. `MEDIAMTX_API` configures the
publisher's API client; it does not change the server's bind address.
For remote MediaMTX, configure both the RTSP target and API endpoint to
refer to the same server. The CanaryGC UI uses path `cam`; custom `CAM_PATH`
values require matching server and reader configuration outside this helper.

---

## 6. Verification

```bash
# Syntax
bash -n contrib/setup-rk3588.sh contrib/hdmi-in-push.sh
# Unit tests (stdlib-only, run against fake /dev/video*, docker, ffmpeg, curl)
python3 -m unittest tests.test_rk3588_platform
# Compose shape
docker compose --profile production config --quiet
```

Expected: all unit tests pass; `bash -n` clean; compose `config` valid.

---

## Untested boundaries

- **MIPI-CSI cameras / other RK3588 capture paths**: not tested. Bringing up
  a MIPI sensor needs a sensor driver/DTB overlay plus the ISP/media pipeline
  configuration (Rockchip BSP preparation); the `hdmi-in-push.sh` script only
  targets `/dev/video*` nodes surfaced by the HDMI-RX driver.
- **RGA (Rockchip 2D accelerator)**: not claimed here. Streaming encodes with
  `h264_rkmpp`; any RGA-dependent path is unverified on this baseline.
- **Video resolution beyond 1080p60**: ffmpeg/`v4l2-ctl` probe everything; no
  4K capture was tested on this document's baseline.
- **Multiple simultaneous HDMI sources**: the watchdog/push loop is a single
  stream design around one `/dev/video*` node.
- Only the **ARM64/Armbian (Ubuntu 24.04 noble) / HDMI-RX** path is described
  here; the Raspberry Pi flow is unchanged in the root docs. **No claim of
  full-hardware adaptation or support for boards beyond the tested baseline
  above.**
