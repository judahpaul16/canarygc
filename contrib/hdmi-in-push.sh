#!/usr/bin/env bash
# CanaryGC HDMI-in push (RK3588) - HDMI-only
#
# Source of truth: contrib/hdmi-in-push.sh in this repository. Deployed to
# /usr/local/bin/hdmi-in-push.sh and run as hdmi-in-push.service. Edit the repo
# copy, never the deployed copy.
#
# Locates the rk_hdmirx capture node (node numbering drifts across boots; only
# /dev/video* children are considered), captures the HDMI RX signal and
# hardware-encodes it (h264_rkmpp) to an H.264 RTSP stream on MediaMTX's
# CAM_PATH (default `cam`). This is the HDMI-RX path only - MIPI/CSI capture is
# not covered.
#
# Reliability design (the push pipeline must survive in the field unattended):
# - waits for the rk_hdmirx node to appear (late driver probe at boot) instead
#   of exiting, so systemd never churns on a missing node;
# - polls for a valid DV timing and only runs ffmpeg while a signal exists;
#   mid-stream signal loss returns to polling automatically;
# - signal geometry/format is re-probed on every start (never hard-coded), so
#   a source that changes resolution or colorimetry mid-session is picked up;
# - encode frame rate follows the source's native rate (probed from DV timing,
#   e.g. 1080p60 -> 60fps), falling back to the FPS tunable only on probe
#   failure, so a source rate change is picked up on the next restart;
# - consecutive instant ffmpeg failures back off (MediaMTX restarting, device
#   busy) instead of hot-spinning;
# - single-instance guard: a second copy (e.g. a manual test run) exits
#   quietly instead of fighting over /dev/video0;
# - one tunable (CAM_PATH) drives BOTH the RTSP push URL and the API poll, so
#   the watchdog always watches the same path ffmpeg publishes into; a
#   mismatched RTSP_PUSH_URL fails preflight instead of drifting at runtime;
#
# Requires Armbian's ffmpeg built with --enable-rkmpp (h264_rkmpp). The RTSP
# target is MediaMTX which runs on the host network (:8554), sharing this
# board's 127.0.0.1.
set -euo pipefail

# ---- tunables (validated below; invalid values warn and fall back) ----
# FPS is only a FALLBACK: the real encode framerate is probed from the HDMI
# source's DV timing each time the stream starts (probe_source_fps), so the
# source's native rate (e.g. 1080p60) is followed automatically. The env var
# below is used only when that probe fails or returns garbage.
FPS="${FPS:-30}"
BITRATE="${BITRATE:-6000000}"                       # default ~ 6 Mbps
POLL_INTERVAL="${POLL_INTERVAL:-0.5}"               # no-signal probe period (s)
RETRY_INTERVAL="${RETRY_INTERVAL:-0.5}"             # wait after a healthy ffmpeg run ends (s)
NODE_POLL_INTERVAL="${NODE_POLL_INTERVAL:-2}"       # rk_hdmirx node wait period (s)
FAST_FAIL_WINDOW_S="${FAST_FAIL_WINDOW_S:-10}"      # ffmpeg run shorter than this counts as a fast fail
MAX_FAST_FAILS="${MAX_FAST_FAILS:-5}"               # consecutive fast fails before...
LONG_BACKOFF_S="${LONG_BACKOFF_S:-30}"              # ...a long backoff (s)
MEDIAMTX_API="${MEDIAMTX_API:-http://127.0.0.1:9997}"
# Single MediaMTX path shared by the RTSP push URL and the API poll. Keeping
# one tunable guarantees the watchdog and ffmpeg always agree on the path.
CAM_PATH="${CAM_PATH:-cam}"
# RTSP target; the service pushes to MediaMTX's CAM_PATH on the host network.
RTSP_PUSH_URL="${RTSP_PUSH_URL:-rtsp://127.0.0.1:8554/$CAM_PATH}"
# Single-instance lock path (overridable so it works off /run in testing).
LOCK_FILE="${LOCK_FILE:-/run/hdmi-in-push.lock}"
RTSP_MONITOR_INTERVAL="${RTSP_MONITOR_INTERVAL:-1}"  # watchdog poll period (s)
RTSP_MONITOR_CONSEC="${RTSP_MONITOR_CONSEC:-2}"      # consecutive dead polls before kill
RTSP_WARMUP_S="${RTSP_WARMUP_S:-8}"                  # cold-start grace before watchdog counts

is_posint() { [[ "${1:-}" =~ ^[1-9][0-9]*$ ]]; }
is_posnum() {
    # positive integer or decimal (e.g. 0.5); run once at startup, so the awk
    # subprocess cost is irrelevant. Rejects 0, 0.0, negatives, and junk.
    awk -v v="${1:-}" 'BEGIN{exit !(v+0>0 && v ~ /^[0-9]+([.][0-9]+)?$/)}'
}

# check_int <name> <value> <default>: integer-only validator.
check_int() {
    if is_posint "$2"; then
        printf '%s' "$2"
    else
        echo "WARN: $1='$2' is not a positive integer, using default $3" >&2
        printf '%s' "$3"
    fi
}

# check_num <name> <value> <default>: validates a positive number (int or
# decimal seconds); warns and falls back to the default on invalid input.
check_num() {
    if is_posnum "$2"; then
        printf '%s' "$2"
    else
        echo "WARN: $1='$2' is not a positive number, using default $3" >&2
        printf '%s' "$3"
    fi
}

FPS="$(check_num FPS "$FPS" 30)"
BITRATE="$(check_int BITRATE "$BITRATE" 6000000)"
# Probe/retry intervals default to sub-second so a signal that returns after a
# short jitter is detected and re-pushed within ~1s, instead of a 2s+ wait.
POLL_INTERVAL="$(check_num POLL_INTERVAL "$POLL_INTERVAL" 0.5)"
RETRY_INTERVAL="$(check_num RETRY_INTERVAL "$RETRY_INTERVAL" 0.5)"
NODE_POLL_INTERVAL="$(check_num NODE_POLL_INTERVAL "$NODE_POLL_INTERVAL" 2)"
FAST_FAIL_WINDOW_S="$(check_int FAST_FAIL_WINDOW_S "$FAST_FAIL_WINDOW_S" 10)"
MAX_FAST_FAILS="$(check_int MAX_FAST_FAILS "$MAX_FAST_FAILS" 5)"
LONG_BACKOFF_S="$(check_int LONG_BACKOFF_S "$LONG_BACKOFF_S" 30)"
RTSP_MONITOR_INTERVAL="$(check_num RTSP_MONITOR_INTERVAL "$RTSP_MONITOR_INTERVAL" 1)"
RTSP_MONITOR_CONSEC="$(check_int RTSP_MONITOR_CONSEC "$RTSP_MONITOR_CONSEC" 2)"
RTSP_WARMUP_S="$(check_num RTSP_WARMUP_S "$RTSP_WARMUP_S" 8)"

# ---- preflight: fail fast with a clear message; systemd backstop restarts ----
# CAM_PATH must be a single path token: reject slashes, spaces, and the like so
# the API URL and RTSP URL stay well-formed.
if ! [[ "$CAM_PATH" =~ ^[A-Za-z0-9_-]+$ ]]; then
    echo "ERROR: CAM_PATH='$CAM_PATH' must be a single path segment (letters, digits, '-' or '_')" >&2
    exit 1
fi
# The push URL's path must equal CAM_PATH. If they differ, the watchdog polls
# state for a different path than ffmpeg publishes into, making the
# "online":false checks meaningless - fail now instead of drifting later.
RTSP_URL_PATH="${RTSP_PUSH_URL#*://}"
RTSP_URL_PATH="${RTSP_URL_PATH#*/}"
RTSP_URL_PATH="${RTSP_URL_PATH%%\?*}"
if [[ "$RTSP_URL_PATH" != "$CAM_PATH" ]]; then
    echo "ERROR: RTSP_PUSH_URL path is '/$RTSP_URL_PATH' but CAM_PATH='$CAM_PATH'" >&2
    echo "ERROR: the watchdog polls /v3/paths/get/$CAM_PATH - set CAM_PATH to match, or keep the default rtsp://127.0.0.1:8554/$CAM_PATH" >&2
    exit 1
fi

for bin in v4l2-ctl ffmpeg flock curl pgrep; do
    command -v "$bin" >/dev/null 2>&1 || {
        echo "ERROR: required '$bin' not found in PATH; see https://github.com/judahpaul16/canarygc/wiki/RK3588-Deployment for host dependencies" >&2
        exit 1
    }
done
# The whole pipeline depends on the Rockchip VPU encoder being present; check
# once instead of letting ffmpeg fail mid-stream with a confusing message. Use
# the -encoders LIST: `ffmpeg -h encoder=<name>` returns exit 0 even for
# encoders the build does not have, so it cannot prove h264_rkmpp exists.
ENC_OUT="$(ffmpeg -hide_banner -encoders 2>&1)"
if ! grep -q 'h264_rkmpp' <<<"$ENC_OUT"; then
    echo "ERROR: ffmpeg lacks the h264_rkmpp encoder - need Armbian's ffmpeg built with --enable-rkmpp" >&2
    exit 1
fi

# Single instance: a manual test run while the service is active exits quietly
# instead of racing it for the capture node. Locks never go stale (released on
# process death), and a normal exit does not trigger the on-failure restart.
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
    echo "another hdmi-in-push instance is already running, exiting" >&2
    exit 0
fi

# ---- lifecycle: reap ffmpeg + watchdog AND their descendants on any exit ----
FFMPEG_PID=""
WATCHDOG_PID=""

_kill_tree_children() {
    local pid="$1" children=""
    if command -v pgrep >/dev/null 2>&1; then
        children="$(pgrep -P "$pid" 2>/dev/null || true)"
    fi
    local child
    for child in $children; do
        _kill_tree_children "$child"
        kill -9 "$child" 2>/dev/null || true
    done
}

_kill_tree() {
    local pid="$1"
    [[ -n "$pid" ]] || return 0
    _kill_tree_children "$pid"
    kill -TERM "$pid" 2>/dev/null || true
    local attempt
    for attempt in {1..20}; do
        kill -0 "$pid" 2>/dev/null || return 0
        sleep 0.1
    done
    kill -KILL "$pid" 2>/dev/null || true
}

cleanup() {
    local rc=$?
    trap - EXIT INT TERM
    # The killed process itself may already be gone; its descendants must not
    # be lost, so always walk the tree rather than gating on kill -0.
    if [[ -n "$WATCHDOG_PID" ]]; then
        _kill_tree "$WATCHDOG_PID"
        wait "$WATCHDOG_PID" 2>/dev/null || true
        WATCHDOG_PID=""
    fi
    if [[ -n "$FFMPEG_PID" ]]; then
        _kill_tree "$FFMPEG_PID"
        wait "$FFMPEG_PID" 2>/dev/null || true
        FFMPEG_PID=""
    fi
    exit "$rc"
}
trap cleanup EXIT INT TERM

# hdmirx node numbering drifts; pair the "rk_hdmirx" name line with its
# indented node line, like hdmiin-yolov5-kvm's scripts/kvm-direct.sh. Only
# /dev/video* children are candidates - /dev/media* and other sub-devices are
# ignored so ffmpeg never opens a non-capture node.
find_node() {
    local device="" line dev="" n=""
    while IFS= read -r line; do
        if [[ "$line" == $'\t'* ]]; then
            if [[ -z "$dev" && "$device" == *"rk_hdmirx"* ]]; then
                n="$(echo "$line" | tr -d '[:space:]')"
                if [[ "$n" == /dev/video* ]]; then
                    dev="$n"
                fi
            fi
        else
            device="$line"
        fi
    done < <(v4l2-ctl --list-devices 2>/dev/null)
    printf '%s' "$dev"
}

# True when the node currently reports a valid HDMI signal. The output is
# captured to a variable first: with `set -o pipefail`, piping straight into
# `grep -q` races v4l2-ctl against SIGPIPE and can report "no signal" on a
# live source. No signal shows as `Link has been severed` (v4l2-ctl fails) or
# an all-zero timing (grep finds nothing) - both correctly read as false.
has_signal() {
    local out
    out="$(v4l2-ctl -d "$DEV" --query-dv-timings 2>&1)" || return 1
    grep -qE "Active width: [1-9][0-9]*" <<<"$out"
}

# One compact line per stream start (best effort, never fails the script).
describe_signal() {
    local fmt timings
    fmt="$(v4l2-ctl -d "$DEV" --get-fmt-video 2>/dev/null | grep -E "Width/Height|Pixel Format" | tr '\n' ' ' || true)"
    timings="$(v4l2-ctl -d "$DEV" --query-dv-timings 2>/dev/null | grep -E "Active width|Active height|frames per second" | tr '\n' ' ' || true)"
    printf '%s %s' "$fmt" "$timings"
    return 0
}

# Probe the HDMI source's native frame rate from its DV timing (e.g. the
# "60.00 frames per second" on the Pixelclock line). Prints a positive number
# (may be fractional, e.g. 59.94) or nothing on failure/no signal. The value is
# re-probed on every stream start, so a source that changes rate mid-session is
# picked up on the next restart.
probe_source_fps() {
    v4l2-ctl -d "$DEV" --query-dv-timings 2>/dev/null \
        | grep -oE '[0-9]+(\.[0-9]+)? frames per second' \
        | head -1 \
        | grep -oE '[0-9]+(\.[0-9]+)?' || true
}

# Poll MediaMTX's per-path state. Prints one of:
#   online   - explicit "online":true      (healthy, prefer this)
#   ready    - no online field, "ready":true (older/transitional API)
#   down     - explicit "online":false, or no online+ready:false
#   unknown  - API unreachable or body unparseable
# Patterns tolerate arbitrary whitespace around the colon because a proxy or
# pretty-printer may emit `"online": true` with spaces.
poll_path_state() {
    local body
    body="$(curl -fsS --max-time 3 "$MEDIAMTX_API/v3/paths/get/$CAM_PATH" 2>/dev/null)" || { echo unknown; return; }
    if grep -qE '"online"[[:space:]]*:[[:space:]]*true' <<<"$body"; then echo online; return; fi
    if grep -qE '"online"[[:space:]]*:[[:space:]]*false' <<<"$body"; then echo down; return; fi
    if grep -qE '"ready"[[:space:]]*:[[:space:]]*true' <<<"$body"; then echo ready; return; fi
    if grep -qE '"ready"[[:space:]]*:[[:space:]]*false' <<<"$body"; then echo down; return; fi
    echo unknown
}

# Background watchdog: watch the ffmpeg PID and the MediaMTX CAM_PATH state.
# When the RTSP push is no longer being accepted (explicit online=false) the
# ffmpeg process may be stuck on a half-closed socket and never exit; SIGKILL
# it so the driver-facing EINVAL (or wait timeout) resolves and the main loop
# restarts. Unknown polls (API down/parse failure) never kill a stream and
# reset the consecutive-down counter, so down -> unknown -> down is not a run
# of two downs.
rtsp_watchdog() {
    local pid="$1" dead=0 state="" prev="" now="" last_unknown_log=0
    # Cold-start grace: give ffmpeg time to lock DV timing, init rkmpp, do the
    # RTSP handshake, and let MediaMTX mark the path online before counting
    # dead polls. Otherwise a slow first frame gets SIGKILLed and the exporter
    # thrashes through the fast-fail backoff.
    sleep "$RTSP_WARMUP_S"
    while kill -0 "$pid" 2>/dev/null; do
        state="$(poll_path_state)"
        if [[ "$state" == "online" || "$state" == "ready" ]]; then
            dead=0
        elif [[ "$state" == "down" ]]; then
            dead=$((dead + 1))
            if (( dead >= RTSP_MONITOR_CONSEC )); then
                echo "RTSP push lost to MediaMTX (explicit offline x${dead}), killing ffmpeg ${pid}"
                kill -9 "$pid" 2>/dev/null || true
                return
            fi
        else
            # unknown: never judge dead (avoid killing a healthy stream), and
            # break the consecutive-down streak. Log the transition, then at
            # most once a minute while it stays unknown.
            dead=0
            now="$(date +%s 2>/dev/null || echo 0)"
            if [[ "$prev" != "unknown" || $(( now - last_unknown_log )) -ge 60 ]]; then
                echo "RTSP watchdog: MediaMTX state unknown (API unreachable or body unparseable), keeping stream"
                last_unknown_log="$now"
            fi
        fi
        prev="$state"
        sleep "$RTSP_MONITOR_INTERVAL"
    done
}

push_stream() {
    # Follow the source's native frame rate: probe the DV timing, fall back to
    # the FPS tunable when the probe fails. The probe runs here (not once at
    # startup) so a source that changed rate is picked up on this restart.
    local FPS_EFFECTIVE RC
    FPS_EFFECTIVE="$(probe_source_fps)"
    if [[ -z "$FPS_EFFECTIVE" ]]; then
        FPS_EFFECTIVE="$FPS"
        echo "source fps probe failed, falling back to FPS=$FPS_EFFECTIVE"
    else
        echo "source fps $FPS_EFFECTIVE, encoding at $FPS_EFFECTIVE"
    fi
    # NOTE: do not pass -video_size/-pix_fmt for hdmirx - the driver reports the
    # source signal's native geometry/pixel format (bgr24 vs nv12) and cannot be
    # S_FMT-overridden. ffmpeg auto-detects and converts to NV12 for h264_rkmpp.
    # -nostdin: stdin is /dev/null under systemd; never let keypresses (or EOF
    # handling quirks) control a daemonized ffmpeg.
    # Run ffmpeg in the background and track its PID so the RTSP watchdog can
    # reap a stuck half-closed push; `wait` still returns its real exit code.
    ffmpeg -hide_banner -nostdin \
        -f v4l2 -framerate "$FPS_EFFECTIVE" -i "$DEV" \
        -c:v h264_rkmpp -b:v "$BITRATE" \
        -maxrate "$BITRATE" -bufsize "$((BITRATE * 2))" \
        -rtsp_transport tcp \
        -f rtsp "$RTSP_PUSH_URL" &
    FFMPEG_PID=$!
    rtsp_watchdog "$FFMPEG_PID" &
    WATCHDOG_PID=$!
    wait "$FFMPEG_PID"
    RC=$?
    # Whatever stopped ffmpeg (clean exit, signal loss, watchdog SIGKILL),
    # reap the watchdog and every helper before returning so the next push
    # attempt starts clean - no orphaned sleep/curl holding the flock.
    _kill_tree "$WATCHDOG_PID"
    wait "$WATCHDOG_PID" 2>/dev/null || true
    WATCHDOG_PID=""
    FFMPEG_PID=""
    return "$RC"
}

# Status flips are logged once each; steady state stays quiet.
LOST=1
NODE_WAIT_LOGGED=0
FAILS=0
while true; do
    DEV="$(find_node)"
    if [[ -z "$DEV" ]]; then
        if [[ "$NODE_WAIT_LOGGED" == "0" ]]; then
            echo "rk_hdmirx node absent (driver not probed yet?), waiting..."
            NODE_WAIT_LOGGED=1
        fi
        LOST=1
        sleep "$NODE_POLL_INTERVAL"
        continue
    fi
    NODE_WAIT_LOGGED=0

    if has_signal; then
        if [[ "$LOST" == "1" ]]; then
            echo "HDMI source detected ($DEV): $(describe_signal), starting push"
            LOST=0
        fi
        START_TS="$(date +%s)"
        if push_stream; then
            echo "ffmpeg exited cleanly, re-probing..."
            FAILS=0
            LOST=1
            sleep "$RETRY_INTERVAL"
        else
            RC=$?
            RUN_S=$(( $(date +%s) - START_TS ))
            if (( RUN_S < FAST_FAIL_WINDOW_S )); then
                FAILS=$((FAILS + 1))
            else
                FAILS=0
            fi
            LOST=1
            if (( FAILS >= MAX_FAST_FAILS )); then
                echo "ffmpeg failed ${FAILS}x in a row within ${FAST_FAIL_WINDOW_S}s (rc=$RC, MediaMTX down?), backing off ${LONG_BACKOFF_S}s..."
                sleep "$LONG_BACKOFF_S"
                FAILS=0
            else
                echo "ffmpeg exited rc=$RC after ${RUN_S}s (signal lost or error), re-probing..."
                sleep "$RETRY_INTERVAL"
            fi
        fi
    else
        if [[ "$LOST" == "0" ]]; then
            echo "no HDMI source signal, waiting..."
            LOST=1
        fi
        sleep "$POLL_INTERVAL"
    fi
done
