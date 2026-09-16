#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Lightweight stub tests for the RK3588 platform scripts (Python stdlib only).

Design:
- A temp PATH directory holds fake commands (sudo/apt/docker/systemctl/git/
  v4l2-ctl/curl/ffmpeg/flock/sleep/...). The fakes record every invocation in
  $FAKE_CTL and emit controlled output; they never touch the real systemd,
  docker, ffmpeg, or hardware.
- The REAL bash scripts from the repository are executed against the fakes,
  covering: non-destructive install, default/overridden repo, .env handling,
  OS-baseline detection, compose-plugin error, device discovery (only
  /dev/video* children), signal/node waits, the watchdog (online/ready/
  down/unknown semantics, JSON whitespace tolerance), single-instance lock,
  preflight (encoder list, path consistency, missing binaries), and process
  tree cleanup on SIGTERM (real descendants reaped, not just the parent PID).

Run: python3 -m unittest tests.test_rk3588_platform
     # or: python3 tests/test_rk3588_platform.py
"""
import os
import shutil
import signal
import subprocess
import tempfile
import time
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SETUP = ROOT / "contrib" / "setup-rk3588.sh"
PUSH = ROOT / "contrib" / "hdmi-in-push.sh"

REAL_PATH = os.environ["PATH"]

# ---- fake commands ----
SUDO = r"""#!/usr/bin/env bash
echo "sudo $*" >> "$FAKE_CTL/sudo.log"
# swallow stdin (e.g. `echo 1 | sudo tee ...`); never actually write anything
cat >/dev/null 2>&1 || true
exit 0
"""

APT = r"""#!/usr/bin/env bash
echo "apt-get $*" >> "$FAKE_CTL/apt.log"
exit 0
"""

SYSTEMCTL = r"""#!/usr/bin/env bash
echo "systemctl $*" >> "$FAKE_CTL/systemctl.log"
exit 0
"""

DOCKER = r"""#!/usr/bin/env bash
echo "docker $*" >> "$FAKE_CTL/docker.log"
# marker simulates an OS whose docker-compose-v2 is missing
if [[ "$*" == "compose version"* ]] && [[ -e "$FAKE_CTL/docker_no_compose" ]]; then
    exit 1
fi
exit 0
"""

GIT = r"""#!/usr/bin/env bash
echo "git $*" >> "$FAKE_CTL/git.log"
if [[ "${1:-}" == "clone" ]]; then
    # args: clone -b <branch> <url> <target>
    target="${@: -1}"
    mkdir -p "$target/.git" "$target/contrib"
    cp "$FAKE_TREE/.env.example" "$target/.env.example"
    : > "$target/contrib/setup-rk3588.sh"
fi
exit 0
"""

V4L2 = r"""#!/usr/bin/env bash
args="$*"
echo "v4l2-ctl $args" >> "$FAKE_CTL/v4l2.log"
case "$args" in
  *--list-devices*)
    printf 'rk_hdmirx (platform: rk_hdmirx-0):\n\t/dev/media0\n\t/dev/video1\n' ;;
  *--query-dv-timings*)
    if [[ -e "$FAKE_CTL/signal" ]]; then
      printf 'Active width: 1920\nActive height: 1080\nPixelclock: 148500000 (60.00 frames per second)\n'
    else
      exit 1
    fi ;;
  *--get-fmt-video*)
    printf 'Width/Height : 1920/1080\nPixel Format :  %s\n' "'NV12'" ;;
esac
exit 0
"""

CURL = r"""#!/usr/bin/env bash
log="$FAKE_CTL/curl.log"
prev=0; [[ -f "$log" ]] && prev=$(wc -l < "$log" 2>/dev/null || echo 0)
echo "curl $*" >> "$log"
: "${FAKE_CURL_THRESHOLD:=2}"
seq_file="$FAKE_CTL/curl_seq"
if [[ -f "$seq_file" ]]; then
  mapfile -t _seq < "$seq_file"
  mode="${_seq[0]:-}"
  if (( ${#_seq[@]} > 1 )); then
    printf '%s\n' "${_seq[@]:1}" > "$seq_file"
  fi
else
  mode="$(cat "$FAKE_CTL/curl_mode" 2>/dev/null || echo online)"
fi
case "$mode" in
  count)
    if (( prev >= FAKE_CURL_THRESHOLD )); then
      echo '{"name":"cam","ready":true,"online":false}'
    else
      echo '{"name":"cam","ready":true,"online":true}'
    fi ;;
  offline)         echo '{"name":"cam","ready":true,"online":false}' ;;
  online)          echo '{"name":"cam","ready":true,"online":true}' ;;
  readyonly)       echo '{"name":"cam","ready":true}' ;;
  online_space)    echo '{"name": "cam", "ready": true, "online": true}' ;;
  offline_space)   echo '{"name": "cam", "ready": true, "online": false}' ;;
  empty)           exit 0 ;;
  fail)            exit 1 ;;
  slow)
    # A deliberately long-lived poll whose TERM is ignored (trap '' TERM is
    # inherited by the inner job), so only cleanup's tree-reaping can remove
    # it. Used to prove descendants are reaped, not just the watchdog PID.
    echo "curl_slow $$ ppid=$PPID" >> "$FAKE_CTL/curl_pids.log"
    trap '' TERM
    /bin/sleep 300 & _sp=$!
    echo "sleep_child $_sp" >> "$FAKE_CTL/curl_pids.log"
    wait ;;
  *)                 echo '{"name":"cam","ready":true,"online":true}' ;;
esac
exit 0
"""

FFMPEG = r"""#!/usr/bin/env bash
echo "ffmpeg $*" >> "$FAKE_CTL/ffmpeg.log"
case "$*" in
  *"-encoders"*)
    # Preflight probes the -encoders LIST. A real `ffmpeg -h encoder=<name>`
    # returns exit 0 even for an encoder the build does not have, so the list
    # is the only reliable presence signal.
    if [[ -e "$FAKE_CTL/ffmpeg_no_rkmpp" ]]; then
      printf ' V....D h264_mmal   MMAL H.264 encoder\n'
    else
      printf ' V....D h264_rkmpp   Rockchip Media Process Platform (MPP) H.264 encoder\n'
    fi ;;
  *"encoder=h264_rkmpp"*)
    # Model the real quirk deliberately: this probe exits 0 even when the
    # encoder is missing, so relying on its exit status is broken behavior.
    exit 0 ;;
  *)
    echo $$ > "$FAKE_CTL/ffmpeg.pid"
    [[ ! -e "$FAKE_CTL/ffmpeg_ignore_term" ]] || trap '' TERM
    exec /bin/sleep 60 ;;
esac
"""

FLOCK = r"""#!/usr/bin/env bash
# delegate to the real flock (needs fd semantics); the lock file is pointed at
# tmp via LOCK_FILE
exec {flock} "$@"
"""

SLEEP = r"""#!/usr/bin/env bash
exec /bin/sleep 0.03
"""


def write_fake(directory: Path, name: str, body: str) -> None:
    p = directory / name
    p.write_text(body.replace("{flock}", shutil.which("flock") or "flock"))
    os.chmod(p, 0o755)


class _Base(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.fake_dir = Path(tempfile.mkdtemp(prefix="rk3588_fakes_"))
        cls.addClassCleanup(shutil.rmtree, cls.fake_dir)
        for name, body in (
            ("sudo", SUDO), ("apt-get", APT), ("systemctl", SYSTEMCTL),
            ("docker", DOCKER), ("git", GIT),
            ("v4l2-ctl", V4L2), ("curl", CURL), ("ffmpeg", FFMPEG),
            ("flock", FLOCK), ("sleep", SLEEP),
        ):
            write_fake(cls.fake_dir, name, body)

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="rk3588_case_"))
        self.addCleanup(shutil.rmtree, self.tmp)
        self.ctl = self.tmp / "ctl"
        self.ctl.mkdir()
        (self.ctl / "curl_mode").write_text("online")
        self.procs = []
        self.home_counter = 0

    def tearDown(self):
        for p in self.procs:
            self._stop(p)

    # ---- base environment ----
    def _base_env(self, home=None, extra=None):
        e = dict(os.environ)
        e["PATH"] = str(self.fake_dir) + os.pathsep + REAL_PATH
        e["FAKE_CTL"] = str(self.ctl)
        e["FAKE_TREE"] = str(self.tmp / "tree")
        if home is not None:
            e["HOME"] = str(home)
        if extra:
            e.update(extra)
        return e

    def _fresh_home(self):
        self.home_counter += 1
        h = self.tmp / ("home%d" % self.home_counter)
        h.mkdir(parents=True, exist_ok=True)
        return h

    # ---- process helpers ----
    def _stop(self, p):
        if p.poll() is not None:
            return
        try:
            os.killpg(os.getpgid(p.pid), signal.SIGTERM)
        except (ProcessLookupError, PermissionError):
            pass
        try:
            p.wait(timeout=5)
        except subprocess.TimeoutExpired:
            try:
                os.killpg(os.getpgid(p.pid), signal.SIGKILL)
            except (ProcessLookupError, PermissionError):
                pass
            p.wait(timeout=5)

    def _start(self, script: Path, env):
        out = open(self.tmp / "out.log", "w")
        err = open(self.tmp / "err.log", "w")
        try:
            p = subprocess.Popen(
                ["bash", str(script)], env=env,
                stdout=out, stderr=err, start_new_session=True,
            )
        except BaseException:
            out.close()
            err.close()
            raise
        # close the parent-side handles (Popen duplicated the fds) to avoid
        # ResourceWarning
        out.close(); err.close()
        self.procs.append(p)
        return p

    def _log(self, name: str) -> str:
        # fakes write logs to $FAKE_CTL(=self.ctl); process stdout/stderr live
        # in self.tmp
        for base in (self.ctl, self.tmp):
            p = base / name
            if p.exists():
                return p.read_text(errors="ignore")
        return ""

    def _wait_log(self, name: str, sub: str, timeout: float = 6.0) -> bool:
        end = time.monotonic() + timeout
        while time.monotonic() < end:
            if sub in self._log(name):
                return True
            time.sleep(0.05)
        return False

    def _wait_ffmpeg_pid(self, timeout: float = 6.0):
        path = self.ctl / "ffmpeg.pid"
        end = time.monotonic() + timeout
        while time.monotonic() < end:
            if path.exists():
                try:
                    return int(path.read_text().strip())
                except ValueError:
                    return None
            time.sleep(0.05)
        return None

    def _reset_ctl(self):
        # clear pids/logs left by a previous instance in this test so stale
        # state does not leak into the next round
        for name in ("ffmpeg.pid", "curl.log", "curl_seq", "curl_pids.log",
                     "ffmpeg.log", "out.log", "err.log"):
            p = self.ctl / name
            if p.exists():
                p.unlink()

    def _push_env(self, **kw):
        extra = {
            "LOCK_FILE": str(self.ctl / "push.lock"),
            "POLL_INTERVAL": "0.1",
            "RETRY_INTERVAL": "0.1",
            "NODE_POLL_INTERVAL": "0.1",
            "FAST_FAIL_WINDOW_S": "5",
            "MAX_FAST_FAILS": "3",
            "LONG_BACKOFF_S": "1",
            "RTSP_MONITOR_INTERVAL": "0.05",
            "RTSP_MONITOR_CONSEC": "2",
            "RTSP_WARMUP_S": "0.05",
            "MEDIAMTX_API": "http://127.0.0.1:9997",
            "RTSP_PUSH_URL": "rtsp://127.0.0.1:8554/cam",
            "FAKE_CURL_THRESHOLD": "2",
        }
        extra.update(kw)
        return self._base_env(home=self.tmp, extra=extra)


class SetupScriptTests(_Base):
    """setup-rk3588.sh: non-destructive install, repo defaults/override, .env,
    OS baseline detection, compose-plugin error."""

    def _tree(self):
        tree = self.tmp / "tree"
        (tree / "contrib").mkdir(parents=True, exist_ok=True)
        (tree / ".env.example").write_text("EXAMPLE=1\nWEBRTC_SOURCE=rpiCamera\n")
        return tree

    def _run_setup(self, args=(), home=None, **env_kw):
        home = home or self._fresh_home()
        env = self._base_env(home=home, extra=env_kw)
        r = subprocess.run(
            ["bash", str(SETUP), *args], env=env,
            capture_output=True, text=True, timeout=90,
        )
        return r

    def test_full_install_defaults_to_judahpaul16_main_and_override(self):
        self._tree()
        r = self._run_setup()
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("clone -b main https://github.com/judahpaul16/canarygc.git",
                      self._log("git.log"))
        # REPO_URL / REPO_BRANCH override the clone target
        r2 = self._run_setup(args=("--install-only",),
                             REPO_URL="https://github.com/foo/pkg-cgc.git",
                             REPO_BRANCH="rk3588")
        self.assertEqual(r2.returncode, 0, r2.stderr)
        self.assertIn("clone -b rk3588 https://github.com/foo/pkg-cgc.git",
                      self._log("git.log"))

    def test_full_install_is_non_destructive_and_skips_firewall(self):
        """no rm/prune/down-all, no firewall (UFW) and no manual sysctl:
        auto-enabling a firewall can drop the SSH session; the Docker daemon
        enables IPv4 forwarding itself."""
        self._tree()
        r = self._run_setup()
        self.assertEqual(r.returncode, 0, r.stderr)
        dock = self._log("docker.log")
        self.assertNotIn("prune", dock)
        self.assertNotIn("--remove-orphans", dock)
        self.assertNotIn("down", dock)
        self.assertIn("docker compose --profile production up -d app nginx webrtc", dock)
        self.assertIn("docker ps", dock)
        self.assertIn("docker compose version", dock)
        sudo = self._log("sudo.log")
        self.assertIn("apt-get -y install docker.io docker-compose-v2 git ca-certificates", sudo)
        self.assertIn("usermod -aG dialout", sudo)
        self.assertIn("usermod -aG video", sudo)
        self.assertNotIn("ufw", sudo)
        self.assertNotIn("iptables", sudo)
        self.assertNotIn("net.ipv4.ip_forward", sudo)
        self.assertNotIn("sysctl", sudo)

    def test_install_only_skips_system_setup_and_reuses_existing_checkout(self):
        self._tree()
        appdir = self._fresh_home() / "canarygc"
        (appdir / ".git").mkdir(parents=True)
        (appdir / "contrib").mkdir()
        (appdir / "keep.txt").write_text("MARKER\n")
        (appdir / ".env").write_text("KEEP=1\nWEBRTC_SOURCE=rpiCamera\n")
        r = self._run_setup(args=("--install-only",), home=appdir.parent)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(self._log("sudo.log"), "")
        self.assertNotIn("clone", self._log("git.log"))
        self.assertEqual((appdir / "keep.txt").read_text(), "MARKER\n")
        # an existing .env is preserved as-is (WEBRTC_SOURCE untouched)
        self.assertEqual((appdir / ".env").read_text(), "KEEP=1\nWEBRTC_SOURCE=rpiCamera\n")
        self.assertIn("docker compose --profile production up -d app nginx webrtc",
                      self._log("docker.log"))

    def test_new_env_gets_rk3588_publisher_default(self):
        """only a missing .env is created, tuned to RK3588 (WEBRTC_SOURCE=
        publisher so hdmi-in-push can publish into MediaMTX)."""
        self._tree()
        home = self._fresh_home()
        r = self._run_setup(home=home)
        self.assertEqual(r.returncode, 0, r.stderr)
        env = (home / "canarygc" / ".env").read_text()
        self.assertIn("WEBRTC_SOURCE=publisher", env)

    def test_os_detection_warns_outside_tested_baseline(self):
        """detect the release; anything but Ubuntu 24.04 gets an explicit
        WARN (docker-compose-v2 is not packaged everywhere), no hidden repo
        hacking."""
        self._tree()
        osrel = self.tmp / "os-release"
        osrel.write_text('ID=debian\nVERSION_ID="12"\nPRETTY_NAME="Debian GNU/Linux 12 (bookworm)"\n')
        r = self._run_setup(OS_RELEASE_FILE=str(osrel))
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("tested on Ubuntu 24.04", r.stderr)

    def test_os_detection_silent_on_ubuntu_2404(self):
        self._tree()
        osrel = self.tmp / "os-release"
        osrel.write_text('ID=ubuntu\nVERSION_ID="24.04"\nPRETTY_NAME="Ubuntu 24.04.1 LTS"\n')
        r = self._run_setup(OS_RELEASE_FILE=str(osrel))
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertNotIn("tested on Ubuntu 24.04", r.stderr)

    def test_missing_compose_plugin_fails_with_actionable_error(self):
        self._tree()
        (self.ctl / "docker_no_compose").write_text("1")
        r = self._run_setup()
        self.assertEqual(r.returncode, 1)
        self.assertIn("ERROR", r.stderr)
        self.assertIn("compose", r.stderr)
        self.assertIn("docker compose version", self._log("docker.log"))


class HdmiPushScriptTests(_Base):
    """hdmi-in-push.sh: device discovery, signal/node waits, watchdog
    semantics, run-down/readiness handling, preflight, cleanup."""

    def test_sigterm_bounds_shutdown_when_ffmpeg_ignores_term(self):
        (self.ctl / "signal").write_text("1")
        (self.ctl / "ffmpeg_ignore_term").write_text("1")
        p = self._start(PUSH, self._push_env())
        pid = self._wait_ffmpeg_pid()
        self.assertIsNotNone(pid)
        self.assertTrue(self._wait_log("curl.log", "curl -fsS"))
        p.send_signal(signal.SIGTERM)
        try:
            p.wait(timeout=5)
        except subprocess.TimeoutExpired:
            self.fail("shutdown must not hang on ffmpeg ignoring TERM")
        self.assertFalse(os.path.exists("/proc/%d" % pid))

    def test_preflight_detects_missing_encoder_from_encoders_list(self):
        # `ffmpeg -h encoder=<name>` returns exit 0 even for an encoder the
        # build lacks; the script must probe the -encoders LIST instead. The
        # list omits h264_rkmpp here, so preflight must fail.
        (self.ctl / "ffmpeg_no_rkmpp").write_text("1")
        r = subprocess.run(["bash", str(PUSH)], env=self._push_env(),
                           capture_output=True, text=True, timeout=20)
        self.assertEqual(r.returncode, 1)
        self.assertIn("h264_rkmpp", r.stderr)
        self.assertIn("ERROR", r.stderr)
        logs = self._log("ffmpeg.log")
        self.assertIn("-encoders", logs)
        self.assertNotIn("-h encoder", logs)

    def test_preflight_passes_when_encoder_list_contains_rkmpp(self):
        (self.ctl / "signal").write_text("1")
        self._start(PUSH, self._push_env())
        self.assertTrue(self._wait_log("out.log", "starting push"), self._log("out.log"))
        self.assertNotIn("ERROR", self._log("err.log"))

    def test_preflight_missing_required_binary_fails(self):
        # host has no v4l2-ctl (confirmed) and the fake dir omits it too, so
        # preflight must report the missing binary
        if any(Path(p).joinpath("v4l2-ctl").exists() for p in REAL_PATH.split(os.pathsep)):
            self.skipTest("host has v4l2-ctl; cannot simulate a missing binary")
        fresh = Path(tempfile.mkdtemp(prefix="rk3588_minbin_"))
        self.addCleanup(shutil.rmtree, fresh)
        for name in ("curl", "flock", "sleep"):
            write_fake(fresh, name, globals()[name.upper().replace("-", "_")])
        env = self._push_env()
        env["PATH"] = str(fresh) + os.pathsep + REAL_PATH
        r = subprocess.run(["bash", str(PUSH)], env=env,
                           capture_output=True, text=True, timeout=20)
        self.assertEqual(r.returncode, 1)
        self.assertIn("v4l2-ctl", r.stderr)

    def test_find_node_picks_only_dev_video_node(self):
        (self.ctl / "signal").write_text("1")
        self._start(PUSH, self._push_env())
        self.assertTrue(self._wait_log("out.log", "starting push"), self._log("out.log"))
        out = self._log("out.log")
        self.assertIn("/dev/video1", out)
        self.assertNotIn("media0", out)
        self.assertTrue(self._wait_log("ffmpeg.log", "-f v4l2 -framerate 60.00 -i /dev/video1"))

    def test_waits_for_capture_node_when_node_absent(self):
        # driver not probed yet (empty list-devices); once the node appears,
        # the script must start pushing instead of giving up
        orig = (self.fake_dir / "v4l2-ctl").read_text()
        (self.fake_dir / "v4l2-ctl").write_text("""#!/usr/bin/env bash
echo "v4l2-ctl $*" >> "$FAKE_CTL/v4l2.log"
[[ -e "$FAKE_CTL/node_ready" ]] || exit 0
case "$*" in
  *--list-devices*) printf 'rk_hdmirx (platform: rk_hdmirx-0):\\n\\t/dev/video1\\n';;
  *--query-dv-timings*) printf 'Active width: 1920\\nframes per second: 60.00\\n';;
esac
exit 0
""")
        os.chmod(self.fake_dir / "v4l2-ctl", 0o755)
        try:
            (self.ctl / "signal").write_text("1")
            self._start(PUSH, self._push_env())
            self.assertTrue(self._wait_log("out.log", "rk_hdmirx node absent"),
                            self._log("out.log"))
            self.assertNotIn("-f rtsp", self._log("ffmpeg.log"))
            (self.ctl / "node_ready").write_text("1")
            self.assertTrue(self._wait_log("out.log", "starting push"), self._log("out.log"))
        finally:
            (self.fake_dir / "v4l2-ctl").write_text(orig)
            os.chmod(self.fake_dir / "v4l2-ctl", 0o755)

    def test_waits_for_signal_then_starts_push(self):
        self._start(PUSH, self._push_env())
        time.sleep(0.8)
        self.assertNotIn("-f rtsp", self._log("ffmpeg.log"))
        (self.ctl / "signal").write_text("1")
        self.assertTrue(self._wait_log("out.log", "starting push"), self._log("out.log"))
        # "starting push" prints just before ffmpeg's command line is logged,
        # so wait for the push command to reach disk
        self.assertTrue(self._wait_log("ffmpeg.log", "-f rtsp"), self._log("ffmpeg.log"))

    def test_watchdog_kills_on_explicit_offline(self):
        (self.ctl / "signal").write_text("1")
        (self.ctl / "curl_mode").write_text("count")  # online twice, then offline
        self._start(PUSH, self._push_env())
        self.assertTrue(self._wait_log("out.log", "killing ffmpeg"), self._log("out.log"))
        self.assertIn("-f rtsp", self._log("ffmpeg.log"))

    def test_watchdog_never_kills_on_api_failure_or_unknown(self):
        for mode in ("fail", "empty"):
            self._reset_ctl()  # clear pids/logs left by the previous round
            (self.ctl / "curl_mode").write_text(mode)
            (self.ctl / "signal").write_text("1")
            p = self._start(PUSH, self._push_env())
            pid = self._wait_ffmpeg_pid()
            self.assertIsNotNone(pid, self._log("out.log"))
            time.sleep(1.5)
            self.assertNotIn("killing ffmpeg", self._log("out.log"))
            self.assertTrue(os.path.exists("/proc/%d" % pid), "ffmpeg must not be reaped on uncertainty")
            self.assertIn("curl -fsS", self._log("curl.log"))  # watchdog is polling
            self._stop(p)

    def test_watchdog_ready_only_state_counts_as_healthy(self):
        (self.ctl / "signal").write_text("1")
        (self.ctl / "curl_mode").write_text("readyonly")
        self._start(PUSH, self._push_env())
        pid = self._wait_ffmpeg_pid()
        self.assertIsNotNone(pid)
        time.sleep(1.2)
        self.assertNotIn("killing ffmpeg", self._log("out.log"))
        self.assertTrue(os.path.exists("/proc/%d" % pid))

    def test_watchdog_unknown_resets_consecutive_down_counter(self):
        (self.ctl / "signal").write_text("1")
        (self.ctl / "curl_seq").write_text("offline\nempty\noffline\nonline\n")
        self._start(PUSH, self._push_env())
        pid = self._wait_ffmpeg_pid()
        self.assertIsNotNone(pid)
        time.sleep(0.8)
        self.assertIn("state unknown", self._log("out.log"))
        self.assertGreaterEqual(len(self._log("curl.log").splitlines()), 4)
        self.assertNotIn("killing ffmpeg", self._log("out.log"))
        self.assertTrue(os.path.exists("/proc/%d" % pid))

    def test_watchdog_accepts_offline_json_with_whitespace(self):
        (self.ctl / "signal").write_text("1")
        (self.ctl / "curl_mode").write_text("offline_space")  # "online": false
        self._start(PUSH, self._push_env())
        self.assertTrue(self._wait_log("out.log", "killing ffmpeg"), self._log("out.log"))

    def test_watchdog_accepts_online_json_with_whitespace(self):
        (self.ctl / "signal").write_text("1")
        (self.ctl / "curl_mode").write_text("online_space")  # "online": true
        p = self._start(PUSH, self._push_env())
        pid = self._wait_ffmpeg_pid()
        self.assertIsNotNone(pid)
        time.sleep(1.0)
        self.assertNotIn("killing ffmpeg", self._log("out.log"))
        self.assertTrue(os.path.exists("/proc/%d" % pid))
        self._stop(p)

    def test_configurable_api_and_cam_path(self):
        # CAM_PATH drives BOTH the API poll and the RTSP URL, so the watchdog
        # never watches a different path than ffmpeg publishes into
        (self.ctl / "signal").write_text("1")
        self._start(PUSH, self._push_env(
            MEDIAMTX_API="http://127.0.0.1:5999",
            RTSP_PUSH_URL="rtsp://127.0.0.1:8554/team-cam",
            CAM_PATH="team-cam",
        ))
        self.assertTrue(self._wait_log("out.log", "starting push"), self._log("out.log"))
        self.assertTrue(self._wait_log("curl.log", "127.0.0.1:5999/v3/paths/get/team-cam"),
                        self._log("curl.log"))
        self.assertTrue(self._wait_log("ffmpeg.log", "rtsp://127.0.0.1:8554/team-cam"),
                        self._log("ffmpeg.log"))

    def test_rtsp_url_path_must_match_cam_path(self):
        r = subprocess.run(["bash", str(PUSH)], env=self._push_env(
            RTSP_PUSH_URL="rtsp://127.0.0.1:8554/somewhere-else",
        ), capture_output=True, text=True, timeout=20)
        self.assertEqual(r.returncode, 1)
        self.assertIn("ERROR", r.stderr)
        self.assertIn("CAM_PATH", r.stderr)

    def test_invalid_bitrate_falls_back_to_6m(self):
        self._start(PUSH, self._push_env(BITRATE="abc"))
        self.assertTrue(self._wait_log("err.log", "using default 6000000"),
                        self._log("err.log"))

    def test_single_instance_guard(self):
        (self.ctl / "signal").write_text("1")
        self._start(PUSH, self._push_env())
        self.assertIsNotNone(self._wait_ffmpeg_pid())
        r = subprocess.run(["bash", str(PUSH)], env=self._push_env(),
                           capture_output=True, text=True, timeout=10)
        self.assertEqual(r.returncode, 0)
        self.assertIn("already running", r.stderr)

    def test_sigterm_cleans_up_ffmpeg(self):
        (self.ctl / "signal").write_text("1")
        p = self._start(PUSH, self._push_env())
        pid = self._wait_ffmpeg_pid()
        self.assertIsNotNone(pid)
        time.sleep(0.3)
        self._stop(p)
        self.assertIsNotNone(p.poll(), "script must exit")
        self.assertFalse(os.path.exists("/proc/%d" % pid), "no ffmpeg left after SIGTERM")

    def test_sigterm_reaps_real_descendant_processes(self):
        # A slow curl poll ignores TERM (and its inner sleep inherits that).
        # SIGTERM is sent to the script's own PID only (no group kill), so a
        # group signal cannot hide the orphan; only cleanup's descendant
        # reaping can remove the whole tree.
        (self.ctl / "signal").write_text("1")
        (self.ctl / "curl_mode").write_text("slow")
        p = self._start(PUSH, self._push_env())
        self.assertTrue(self._wait_log("curl_pids.log", "curl_slow"),
                        self._log("curl_pids.log"))
        lines = self._log("curl_pids.log").strip().splitlines()
        # line 0 -> "curl_slow <curlpid> ppid=<watchdogpid>"
        curl_pid = int(lines[0].split()[1])
        watchdog_pid = int(lines[0].split()[2].split("=")[1])
        # line 1 -> "sleep_child <pid>" (the curl helper's own child)
        sleep_pid = int(lines[1].split()[1])
        # sanity: these really are descendants, not the top-level script
        self.assertNotEqual(curl_pid, p.pid)
        self.assertNotEqual(watchdog_pid, p.pid)
        self.assertTrue(os.path.exists("/proc/%d" % curl_pid))
        time.sleep(0.1)
        p.send_signal(signal.SIGTERM)
        try:
            p.wait(timeout=10)
        except subprocess.TimeoutExpired:
            self.fail("hdmi-in-push did not exit after SIGTERM")
        self.assertFalse(os.path.exists("/proc/%d" % watchdog_pid))
        self.assertFalse(os.path.exists("/proc/%d" % curl_pid),
                         "watchdog's ignored-TERM curl helper must not survive as an orphan")
        self.assertFalse(os.path.exists("/proc/%d" % sleep_pid),
                         "the curl helper's own child must be reaped too, not just the parent PID")


if __name__ == "__main__":
    unittest.main(verbosity=2)
