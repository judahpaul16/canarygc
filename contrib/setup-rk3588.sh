#!/usr/bin/env bash

# setup-rk3588.sh - CanaryGC provisioning for an RK3588 single-board computer
# (aarch64).
#
# This is the RK3588 counterpart of the Raspberry Pi contrib/setup.sh: it keeps
# the Docker install + compose startup flow and drops the Pi-specific pieces
# (dtoverlay, rpiCamera, NetworkManager WiFi policy, ModemManager 4G routing).
#
# Tested on: Ubuntu 24.04 (noble) based Armbian images for RK3588 boards, with
# the vendor kernel (6.1.157-rk3588-ophub) and HDMI-RX via the rk_hdmirx
# driver. docker-compose-v2 is only packaged on some Debian/Ubuntu releases, so
# the script detects the OS, warns when it is outside the tested baseline, and
# fails with an actionable error if the compose plugin turns out missing - it
# does NOT cobble together extra apt repositories.
#
# Non-destructive by design:
#   1. Defaults to cloning judahpaul16/canarygc's main branch (override with
#      REPO_URL / REPO_BRANCH). An existing $APP_DIR/.git checkout is reused -
#      nothing is removed or overwritten, and no auto-pull happens.
#   2. An existing .env is always preserved. Only a missing .env is created
#      from .env.example, tuned to RK3588 defaults (WEBRTC_SOURCE=publisher so
#      the hdmi-in-push service can push into MediaMTX's path).
#   3. No docker prune, no down of unrelated profiles, no ttyS0/getty policy
#      changes.
#   4. The firewall (UFW) is intentionally NOT touched: auto-enabling a firewall
#      on a remotely administered board can cut the SSH session. IPv4 forwarding
#      is left to the Docker daemon, which enables it itself at startup.
#
# Usage:
#   # Full install (packages + app) then start the production profile
#   bash -s -- < setup-rk3588.sh
#   # App only (assumes Docker is already configured)
#   bash -s -- --install-only < setup-rk3588.sh
#   # System preparation only (no container start)
#   bash -s -- --setup-only < setup-rk3588.sh
#   # SITL simulation via the development profile
#   bash -s -- --simulation < setup-rk3588.sh
set -euo pipefail

ARG="${1:-}"
if [[ "$ARG" != "" && "$ARG" != "--install-only" && "$ARG" != "--setup-only" && "$ARG" != "--simulation" ]]; then
    echo "unknown option: $ARG" >&2
    exit 1
fi

REPO_URL="${REPO_URL:-https://github.com/judahpaul16/canarygc.git}"
REPO_BRANCH="${REPO_BRANCH:-main}"
APP_DIR="${APP_DIR:-$HOME/canarygc}"
# Overridable so tests can point at a fixture instead of the live host file.
OS_RELEASE_FILE="${OS_RELEASE_FILE:-/etc/os-release}"

echo "CanaryGC RK3588 setup - repo: $REPO_URL (branch: $REPO_BRANCH)"

#### SETUP (system preparation; skipped by --install-only / --simulation) ####
if [[ "$ARG" != "--install-only" && "$ARG" != "--simulation" ]]; then
    # Detect the OS so the tested baseline is explicit and any untested release
    # gets a warning (docker-compose-v2 is not on every Debian derivative).
    if [[ -r "$OS_RELEASE_FILE" ]]; then
        . "$OS_RELEASE_FILE"
        echo "Detected OS: ${PRETTY_NAME:-${ID:-unknown} ${VERSION_ID:-unknown}} (arch: $(uname -m))"
        if [[ "${ID:-}" != "ubuntu" || "${VERSION_ID:-}" != "24.04" ]]; then
            echo "WARN: this script is tested on Ubuntu 24.04 (noble) Armbian images only." >&2
            echo "WARN: docker-compose-v2 may not be packaged on this release; if 'docker compose' is unavailable after this step, install the Docker compose plugin manually (https://docs.docker.com/compose/install/)." >&2
        fi
    fi

    echo "Installing system dependencies..."
    sudo apt-get update
    # docker.io ships the compose plugin path; git / ca-certificates are for
    # HTTPS clones. The firewall is deliberately not installed/enabled here.
    if ! sudo apt-get -y install docker.io docker-compose-v2 git ca-certificates; then
        echo "ERROR: distribution packages could not be installed. Configure Docker and the Compose v2 plugin, then use --install-only." >&2
        exit 1
    fi

    sudo systemctl enable docker
    sudo systemctl start docker
    sudo systemctl status docker --no-pager

    # Serial/camera group membership: dialout covers ttyS*/ttyUSB*/ttyACM*,
    # video covers /dev/video*. A re-login is needed for new groups to apply.
    sudo usermod -aG dialout "$(whoami)"
    sudo usermod -aG video "$(whoami)"
    echo "Added $(whoami) to dialout/video groups (re-login for new groups to take effect)"

    # Fail with an actionable message when the compose v2 plugin is missing
    # instead of letting the later `docker compose` call fail cryptically.
    if ! docker compose version >/dev/null 2>&1; then
        echo "ERROR: 'docker compose' (compose plugin v2) is unavailable; docker-compose-v2 is not packaged on this release." >&2
        echo "ERROR: this script is tested on Ubuntu 24.04 (noble). Install the compose plugin manually (https://docs.docker.com/compose/install/) or re-run on an Ubuntu 24.04 based image." >&2
        exit 1
    fi

    # The docker group change needs a re-login; when the daemon is unreachable,
    # add the user and ask them to re-login, mirroring contrib/setup.sh.
    if ! docker ps >/dev/null 2>&1; then
        echo "Docker daemon unreachable - adding $(whoami) to the 'docker' group. Please log out and back in, then re-run the script."
        sudo usermod -aG docker "$(whoami)"
        exit 0
    fi
fi

#### INSTALL (application deploy; skipped by --setup-only) ####
if [[ "$ARG" != "--setup-only" ]]; then
    if [[ -e "$APP_DIR/.git" ]]; then
        echo "Reusing existing checkout at $APP_DIR (no auto-pull; local changes and .env left untouched)"
    else
        echo "Cloning $REPO_URL (branch $REPO_BRANCH) into $APP_DIR ..."
        git clone -b "$REPO_BRANCH" "$REPO_URL" "$APP_DIR"
    fi
    cd "$APP_DIR"

    if [[ -f .env ]]; then
        echo "Reusing existing .env (WEBRTC_SOURCE and other values left unchanged)"
        echo "For HDMI-RX, set WEBRTC_SOURCE=publisher in .env before starting the push service."
    else
        echo "Creating .env from .env.example with RK3588 defaults"
        cp .env.example .env
        # The Pi default WEBRTC_SOURCE=rpiCamera has no meaning on RK3588.
        # 'publisher' makes MediaMTX wait for an external RTSP push (i.e. the
        # hdmi-in-push service). Existing .env files are never rewritten.
        if grep -q '^WEBRTC_SOURCE=' .env; then
            sed -i 's/^WEBRTC_SOURCE=.*/WEBRTC_SOURCE=publisher/' .env
        else
            printf '\n# RK3588 default: wait for an external publisher (hdmi-in-push).\nWEBRTC_SOURCE=publisher\n' >> .env
        fi
    fi

    if [[ "$ARG" == "--simulation" ]]; then
        echo "Starting development (SITL) profile..."
        docker compose --profile development up -d
    else
        # webrtc (MediaMTX) is always started: the source can be an IP-camera
        # RTSP/RTMP/SRT URL (WEBRTC_SOURCE=rtsp://...), a local capture device,
        # or the hdmi-in-push service. It is deliberately NOT gated on a
        # /dev/video* node existing at install time.
        echo "Starting production profile (app nginx webrtc)..."
        docker compose --profile production up -d app nginx webrtc
    fi
    docker ps
fi

echo "Done."
