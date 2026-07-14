#!/bin/bash
# Launches the INAV SITL and provisions it for station flight over its own CLI:
# the FAKE GPS provider on a spare UART so the navigation estimator uses the
# sim's GPS, and MSP as the receiver so the station's RC reaches the flight
# controller. Settings persist in eeprom.bin; the CLI pass is idempotent, so a
# restart just reapplies the same values.
set -u

./inav_SITL "$@" &
SITL_PID=$!

provision() {
  for i in $(seq 1 60); do
    if (exec 3<>/dev/tcp/127.0.0.1/5760) 2>/dev/null; then
      exec 3>&-
      break
    fi
    sleep 0.5
  done
  sleep 3
  exec 3<>/dev/tcp/127.0.0.1/5760 || return
  {
    printf '#\n'
    sleep 1
    printf 'feature GPS\n'
    sleep 0.5
    printf 'set gps_provider = FAKE\n'
    sleep 0.5
    printf 'set receiver_type = MSP\n'
    sleep 0.5
    printf 'mmix 0 1.0 -1.0 1.0 -1.0\n'
    sleep 0.3
    printf 'mmix 1 1.0 -1.0 -1.0 1.0\n'
    sleep 0.3
    printf 'mmix 2 1.0 1.0 1.0 1.0\n'
    sleep 0.3
    printf 'mmix 3 1.0 1.0 -1.0 -1.0\n'
    sleep 0.3
    printf 'save\n'
    sleep 2
  } >&3
  exec 3>&-
  echo "[provision] GPS provider FAKE + MSP receiver applied"
}

provision &
wait $SITL_PID
