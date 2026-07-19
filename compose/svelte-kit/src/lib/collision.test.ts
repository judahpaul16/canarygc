import { describe, expect, it } from 'vitest';
import { assessContact, detectThreats, THREAT_HORIZON_S } from './collision';
import type { TrafficContact } from '../stores/trafficStore';

const own = { lat: 33.75, lon: -84.39, altM: 300, headingDeg: 0, speedMps: 0 };

function contact(extra: Partial<TrafficContact>): TrafficContact {
  return {
    id: 'net-abc123',
    callsign: 'N560P',
    lat: 33.75,
    lon: -84.39,
    altM: 300,
    headingDeg: 180,
    speedMps: 60,
    onGround: false,
    source: 'network',
    seenAt: 0,
    ...extra
  };
}

describe('assessContact', () => {
  it('flags a co-altitude contact converging head-on', () => {
    // 6 km north, southbound at 60 m/s, reaches the ownship in ~100 s.
    const threat = assessContact(own, contact({ lat: own.lat + 6000 / 111_320 }));
    expect(threat).not.toBeNull();
    expect(threat!.tSec).toBeGreaterThan(60);
    expect(threat!.tSec).toBeLessThan(THREAT_HORIZON_S);
    expect(threat!.horizontalM).toBeLessThan(611);
  });

  it('reports an immediate threat inside the puck', () => {
    const threat = assessContact(own, contact({ lat: own.lat + 200 / 111_320 }));
    expect(threat).not.toBeNull();
    expect(threat!.tSec).toBe(0);
  });

  it('ignores a contact well above the vertical band', () => {
    expect(assessContact(own, contact({ altM: 3000 }))).toBeNull();
  });

  it('ignores a diverging contact', () => {
    // 6 km north and northbound, opening range the whole horizon.
    const threat = assessContact(
      own,
      contact({ lat: own.lat + 6000 / 111_320, headingDeg: 0 })
    );
    expect(threat).toBeNull();
  });

  it('ignores a contact on the ground', () => {
    expect(assessContact(own, contact({ onGround: true }))).toBeNull();
  });

  it('flags a descending contact entering the band', () => {
    // Co-located horizontally, 500 m above, descending at 5 m/s.
    const threat = assessContact(
      own,
      contact({ altM: 800, speedMps: 0, verticalRateMps: -5 })
    );
    expect(threat).not.toBeNull();
    expect(threat!.tSec).toBeGreaterThan(80);
  });

  it('treats a contact without altitude as co-altitude', () => {
    const threat = assessContact(own, contact({ altM: null }));
    expect(threat).not.toBeNull();
  });
});

describe('detectThreats', () => {
  it('sorts threats by time to loss of well clear', () => {
    const near = contact({ id: 'a', lat: own.lat + 1000 / 111_320 });
    const far = contact({ id: 'b', lat: own.lat + 5000 / 111_320 });
    const threats = detectThreats(own, [far, near]);
    expect(threats.map((t) => t.contact.id)).toEqual(['a', 'b']);
  });

  it('returns nothing for clear skies', () => {
    expect(detectThreats(own, [contact({ altM: 5000 })])).toEqual([]);
  });
});
