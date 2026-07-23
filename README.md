<div align="center">

<span style="color: red;">⚠️ **Warning**: This project is in **early development**. Use at your own risk! **It is your responsibility** to understand the risks involved as well as the **laws and regulations** governing the use of unmanned aerial vehicles (UAVs) in your area.</span>

<img src="compose/svelte-kit/static/logo.png" alt="Canary Ground Control Logo" width="100"/>

# 🚁 Canary Ground Control 📡

[![CI/CD](https://github.com/judahpaul16/canarygc/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/judahpaul16/canarygc/actions/workflows/ci.yml?query=branch%3Amain)
![Raspberry Pi Version](https://img.shields.io/badge/Raspberry_Pi-3B%20%2F%204B%20%2F%205%20%2F%20CM4%20%2F%20CM5-red?style=flat-square&logo=raspberry-pi)
![OS](https://img.shields.io/badge/OS-64--bit%20Linux%20%28arm64%20%2F%20x86__64%29-blue?style=flat-square&logo=linux)
![Docker Compose Version](https://img.shields.io/badge/Docker%20Compose-v2.27.1-blue?style=flat-square&logo=docker)
![Latest Docker Image](https://img.shields.io/docker/v/judahpaul/canarygc)

A web-based ground control station (GCS) for remote autopilot management via the [MAVLink protocol](https://en.wikipedia.org/wiki/MAVLink).

![Dashboard 1](screenshots/dashboard_1.png)
<table>
  <tr>
    <td width="50%">
      <img src="screenshots/mission-planner.png" alt="Mission Planner" height="220" width="100%"><br>
      <sub>Mission planning</sub>
    </td>
    <td width="50%">
      <img src="screenshots/calibration.png" alt="Calibration" height="220" width="100%"><br>
      <sub>Calibration</sub>
    </td>
  </tr>
  <tr>
    <td width="50%">
      <img src="screenshots/events.png" alt="MAVLink Events" height="220" width="100%"><br>
      <sub>MAVLink Events</sub>
    </td>
    <td width="50%">
      <img src="screenshots/parameters.png" alt="Vehicle Parameters" height="220" width="100%"><br>
      <sub>Vehicle Parameters</sub>
    </td>
  </tr>
</table>

</div>

## 🐚 TL;DR | Setup Script

### Production Deployment
```bash
curl -s https://raw.githubusercontent.com/judahpaul16/canarygc/main/contrib/setup.sh | \
    bash -s --
```

### Local Testing with SITL
```bash
curl -s https://raw.githubusercontent.com/judahpaul16/canarygc/main/contrib/setup.sh | \
    bash -s -- --simulation
```

### Install-Only (Without System Setup)
Skips the host provisioning (installing Docker, nginx, and the other system packages, the UFW firewall and 4G routing rules, the Docker daemon config, and the Raspberry Pi UART overlays) and just brings the app up with Docker Compose, assuming Docker is already installed and running.
```bash
curl -s https://raw.githubusercontent.com/judahpaul16/canarygc/main/contrib/setup.sh | \
    bash -s -- --install-only
```


---

## 🤔 How Does It Work?

Unlike traditional GCS software, Canary Ground Control is a web-based application that runs on a Raspberry Pi, making it a part of the flight stack. This enables you to manage your autopilot from anywhere in the world, as long as you have an internet connection.

![Diagram](screenshots/diagram.png)

The reference hardware build (Raspberry Pi 4B, Holybro S500 V2, camera, and 4G modem) is documented in the [Build guide](https://github.com/judahpaul16/canarygc/wiki/Build).

---

## ✨ Features

**Flight and control**
* Live MAVLink telemetry and control (attitude, position, battery, GPS, mode changes, arm/disarm, virtual D-Pad), with flight modes and armed state decoded correctly for both ArduPilot and PX4.
* Gamepad flight streams a connected pad as `MANUAL_CONTROL`, switches the vehicle to its stick mode (PX4 Position, ArduPilot Loiter), and hands back to an autonomous hold on release.
* WebRTC camera feed from an onboard Raspberry Pi camera via [MediaMTX](https://github.com/bluenviron/mediamtx).

**Maps and airspace** (2D Leaflet, 3D MapLibre)
* One persistent map behind every page with curved waypoint legs and session-persistent toggles, plus light, dark, and hybrid-satellite basemaps from a MapTiler key or keyless fallbacks, each overridable with a custom XYZ URL.
* Airspace, LAANC ceiling grid, obstacle, and live ADS-B traffic overlays on both maps, from [OpenAIP](https://www.openaip.net) with a key or the FAA's keyless US layers, each with a plain-language popup.

**Mission planning**
* Plans are stored autopilot-neutral and adjusted to the connected autopilot on upload, ArduPilot running the full command set and PX4 reporting what it substitutes or skips.
* Import QGroundControl `.plan`, Mission Planner `.waypoints`, the app's JSON, a Google Earth `.kml` or `.kmz`, or a coordinate `.csv`.
* Five pattern generators (survey transects, orbit ring, corridor lanes, expanding-square search, structure scan) and one-click path optimization that raises or routes legs around obstacles, buildings, and restricted airspace.

**Safety**
* Pre-flight validation of every waypoint and leg against altitude limits, a home geofence, and fetched airspace, blocking on restricted airspace and prompting on controlled.
* Lost-operator failsafe (return to launch or synthesized autoland), a manual-control deadman, audible callouts, and per-event email alerts with live coordinates.
* MAVLink 2 signing with replay protection, so a publicly reachable link accepts commands only from a key holder.

**Firmware, calibration, and tuning**
* Firmware tab flashes ArduPilot, PX4, Betaflight, and INAV, detecting boards over MSP and flashing over USB DFU or the autopilot's CRC-verified serial bootloader.
* Sensor calibration (accelerometer, level, gyro, compass, ESC) adapted per autopilot, and full parameter read, edit, search, import, and export with quick-config chips.
* AI-assisted PID tuning sends the current gains and recent telemetry to an OpenAI-compatible endpoint and applies the suggestions with one click.

**Console, logs, and ops**
* Color-coded event log with per-message filters, search, and download, and a raw `MAV_CMD` console with autocomplete, parameter hints, and validation.
* Integrations for SMTP, airspace keys, and tiles, an emailed expiring password reset, dashboard weather, compass, and stats widgets, and build info at `/version`.

---

## ❓ Why Not Just Run Mission Planner or QGC over a VPN?

A GCS setup has two links. One carries command and control to the autopilot,
the other carries the operator's view. A desktop GCS merges them. The laptop is
the ground station, so the aircraft's C2 link stretches over the internet to
wherever that laptop sits, and the autopilot's GCS failsafe ends up judging
internet weather. Leave the timeout at its default 5 seconds and a rough patch
of coverage can trip a failsafe mid-mission. Stretch it or configure the
failsafe to ignore the loss and it stops protecting you from anything. The
laptop sleeps, roams, or crashes, and the aircraft flies on with whatever
compromise you picked.

CanaryGC splits the two. The ground station runs onboard the aircraft and
heartbeats the flight controller at 1 Hz over a short serial link. That
heartbeat only stops if the companion computer itself fails, so a GCS failsafe
means a real onboard problem and not a coverage gap. The internet hop carries
only the operator's browser session, and a dropped connection never takes the
ground station down.

When the connection does drop, an autonomous mission continues onboard with no
GCS failsafe firing and the battery, geofence, and EKF failsafes still active,
and the browser reconnects on its own when coverage returns. Manual control
runs a deadman, so the gamepad and companion-guidance streams release the craft
to the flight controller's own failsafe when the operator goes quiet. And when
nobody has been connected for a set window, the lost-operator failsafe commands
a recovery on its own, return to launch for a copter, rover, or sub, and a
synthesized autoland for a fixed wing.

Running the desktop GCS on the Pi itself over VNC or RDP avoids the laptop but
streams a desktop image over cellular, a full X11 stack on the companion and
control through a laggy remote session. A headless web GCS streams telemetry
and commands instead of pixels, runs with no desktop stack, and serves any
browser, so the field device is whatever is in your pocket.

An LTE kit like the [XBStation](https://www.xbstation.com/) moves MAVLink and
video onto the cell network, but the laptop running Mission Planner or
QGroundControl is still the ground station. The raw C2 stream still crosses the
internet, every coverage blip is still a GCS-loss event at the autopilot, and a
sleeping or crashed laptop still orphans the aircraft mid-mission. CanaryGC
moves the ground station itself onto the airframe. The GCS heartbeat stays on a
serial link that cannot lose coverage, the failsafes above run onboard next to
the autopilot, and what crosses the cell network is a browser session you can
drop and rejoin from any device.

None of this makes cellular a cure-all. A cell link needs coverage, its latency
is not RF-grade for hand-flown FPV, and a publicly reachable autopilot has to be
signed or tunneled. ArduPilot recommends
[redundant telemetry links](https://ardupilot.org/plane/docs/common-redundant-telemetry.html)
in general, and one example it gives is a cellular primary with a long-range 900
or 433 MHz radio backing it up, where even a short-range WiFi link helps regain
control once the craft returns home. CanaryGC is the cellular link in that
setup, and an RF radio should back it up on long range or certified operations.

---

## 🧑‍💻 Local Development

The stack is a single `docker-compose.yml` with `development`, `development-px4`, `development-betaflight`, `development-inav`, and `production` profiles.

Before the first bring-up, copy the environment template (optional; the stack runs on defaults without it):

```bash
cp .env.example .env    # host ports and app config, one file at the repo root
```

The root `.env` feeds both Docker Compose (host ports, which SITL vehicle to run, the image) and the app container (API keys, MSP, database); the Integrations page overrides the app keys at runtime.

**Development** runs the SvelteKit dev server with hot reload against an ArduPilot SITL container:

```bash
docker compose --profile development up -d
```

The app is served at `http://localhost:5173`; SITL exposes MAVLink on TCP `5760`. Set a different host port with `APP_DEV_PORT` in a root `.env` if 5173 collides. The first bring-up builds the ArduPilot SITL image from source (Copter 4.5.7), which takes a while; later runs reuse it, and the simulator streams telemetry about a minute after it starts. The stack runs detached; follow its output with:

```bash
docker compose --profile development logs -f
```

The SITL image builds the copter, rover, plane, and sub binaries, so the same `development` profile flies any of them. `SITL_VEHICLE` and `SITL_MODEL` pick which, and the dashboard controls adapt to the vehicle: a submarine gets a depth control (Go to Depth, Ascend, Descend), a rover drops the vertical control, and a plane, copter, or sub keeps Max Speed:

```bash
SITL_VEHICLE=Rover     SITL_MODEL=rover    docker compose --profile development up -d   # ground rover
SITL_VEHICLE=ArduSub   SITL_MODEL=vectored docker compose --profile development up -d   # submarine
SITL_VEHICLE=ArduPlane SITL_MODEL=plane    docker compose --profile development up -d   # fixed wing
```

To develop against **PX4** instead, use the `development-px4` profile:

```bash
docker compose --profile development-px4 up -d
```

This runs headless PX4 SITL (Gazebo) alongside a MAVProxy bridge that presents PX4's MAVLink on the same TCP `5760`, so the app connects identically. Both dev profiles bind `5760`, so run one at a time. PX4 SITL streams telemetry about a minute after Gazebo finishes initializing.

To exercise the **Firmware tab against a Betaflight or INAV flight controller** with no hardware, use the `development-betaflight` or `development-inav` profile:

```bash
docker compose --profile development-betaflight up -d   # or development-inav
```

Each builds the flight-controller firmware for the host CPU (SITL) and serves MSP on TCP `5761`, which the app reaches through the shared `msp-sitl` alias. The Firmware tab detects the board and reads its identity over MSP, as it would a real board on a serial link. These profiles carry no MAVLink autopilot, so the dashboard link stays offline; they cover MSP detection and telemetry.

On first run the database is empty, so open `/register` to create the operator account. To reset it later, wipe the dev database and restart:

```bash
docker exec canarygc_app sh -c 'rm -f /app/src/data.db*'
docker restart canarygc_app
```

The schema recreates empty on the next boot, and the app then prompts for first-run operator setup.

**Production** pulls the published app image (`ghcr.io/judahpaul16/canarygc`) and runs the WebRTC camera bridge, talking to a real autopilot over USB serial (`/dev/ttyACM0`):

```bash
docker compose --profile production up -d app webrtc
```

The app is served at `http://localhost:3000`.

### Gates

From `compose/svelte-kit`, mirroring CI:

```bash
npm ci                              # install from the lockfile
npm run lint                        # eslint
npm run check                       # svelte-check
npm test                            # vitest unit suite
npm run build                       # production build
npm audit --audit-level=moderate    # dependency audit
```

### End-to-end tests

The Playwright suite in `compose/svelte-kit/e2e` drives the dev stack on
`localhost:5174` and authenticates by minting a session for the operator
account straight into `src/data.db`, so the stack must be up and the operator
account created (first run). Browsers install once with
`npx playwright install --with-deps chromium`.

```bash
npm run test:e2e                    # planner, event log, persistence
E2E_SITL=1 npm run test:e2e         # adds the SITL flight: arm, takeoff, move, climb, yaw
```

The flight spec flies the simulator and sets ArduCopter's Guided mode, so run
it against a freshly started `development` profile (the ArduPilot SITL); a
lockstep SITL under heavy host load drifts. The suite runs single-worker
because every spec shares one app and one vehicle.

---

## ⚙️ Configuration

The app reads its configuration from environment variables (see the root `.env.example`):

| Variable | Purpose |
| --- | --- |
| `DATABASE_PATH` | Path to the SQLite database file (migrated on first boot). |
| `OPENAIP_API_KEY` | [OpenAIP](https://www.openaip.net) key for worldwide airspace. Without it, airspace falls back to the FAA's keyless US layers. |
| `VITE_ALTITUDE_ANGEL_API_KEY` | Optional key for the Altitude Angel airspace endpoint. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | SMTP for password-reset and alert email. |

The airspace keys and SMTP settings are also editable in-app under **Integrations**, which stores them in the database and takes precedence over the environment.

---

## 🤝 Contributing

Contributions are welcome. [CONTRIBUTING.md](CONTRIBUTING.md) covers the development setup, the CI gates, the commit markers that drive versioning, and the branch workflow.

---

## 📜 License
This software is made available under the MIT License. See the [`LICENSE`](LICENSE.md) file for more information.
