import type { MissionPlanActions } from '../stores/missionPlanStore';
import { normalizeMission } from './mission-commands';

// Serializes a plan to the "QGC WPL 110" waypoint text that Mission Planner and
// QGroundControl both read (and that parseQgcWpl reads back). Columns per row:
// seq, current, frame, command, p1-p4, x(lat), y(lon), z(alt), autocontinue.
// Row 0 carries the current flag, as Mission Planner writes it.
export function toQgcWpl(actions: MissionPlanActions): string {
  const { items } = normalizeMission(actions, false);
  const lines = ['QGC WPL 110'];
  items.forEach((item, seq) => {
    lines.push(
      [
        seq,
        seq === 0 ? 1 : 0,
        item.frame,
        item.command,
        item.param1,
        item.param2,
        item.param3,
        item.param4,
        item.lat,
        item.lon,
        item.alt,
        1
      ].join('\t')
    );
  });
  return lines.join('\n') + '\n';
}
