#!/bin/sh
# Marine craft (submarine, surface boat) spawn on open water; land and air
# craft spawn at the configured land home. MARINE_LAT/MARINE_LON default to a
# point in the open Atlantic off the Georgia coast and are env-overridable.
set -e

case "${VEHICLE}:${MODEL}" in
  ArduSub:* | *:motorboat | *:boat | *:sailboat)
    HOME_LAT="${MARINE_LAT:-31.5}"
    HOME_LON="${MARINE_LON:--79.8}"
    ;;
  *)
    HOME_LAT="${LAT}"
    HOME_LON="${LON}"
    ;;
esac

exec /ardupilot/Tools/autotest/sim_vehicle.py \
  --vehicle "${VEHICLE}" -I"${INSTANCE}" \
  --custom-location="${HOME_LAT},${HOME_LON},${ALT},${DIR}" \
  -w --frame "${MODEL}" --no-rebuild --no-mavproxy --speedup "${SPEEDUP}"
