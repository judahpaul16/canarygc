import * as THREE from 'three';

// Broad vehicle families the 3D map renders a distinct model for.
export type VehicleClass = 'multirotor' | 'plane' | 'boat' | 'rover' | 'sub' | 'generic';

// Models are built in a right-handed frame where +Z is the nose (forward), +Y
// is up, and +X is the right wing. The map layer rotates this frame into East /
// Up / North world space, so heading points the nose along the compass bearing.
// Sizes are a few times life-size so the craft stays legible against map tiles.

const NOSE = 0xff6b35;

function part(
  geometry: THREE.BufferGeometry,
  color: number,
  opts: { metalness?: number; roughness?: number; opacity?: number } = {}
): THREE.Mesh {
  const material = new THREE.MeshStandardMaterial({
    color,
    metalness: opts.metalness ?? 0.3,
    roughness: opts.roughness ?? 0.6,
    transparent: opts.opacity !== undefined,
    opacity: opts.opacity ?? 1
  });
  return new THREE.Mesh(geometry, material);
}

function multirotor(): THREE.Group {
  const g = new THREE.Group();
  const body = part(new THREE.BoxGeometry(1.6, 0.5, 1.6), 0x2b2f36);
  g.add(body);
  const canopy = part(new THREE.SphereGeometry(0.55, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), 0x11151b);
  canopy.position.y = 0.25;
  g.add(canopy);
  // Four arms and rotor discs on the diagonals; the forward pair is accented so
  // the operator reads which way the craft points.
  const reach = 2.2;
  const diag = reach / Math.SQRT2;
  const corners: Array<[number, number, boolean]> = [
    [diag, diag, true],
    [-diag, diag, true],
    [diag, -diag, false],
    [-diag, -diag, false]
  ];
  for (const [x, z, front] of corners) {
    const arm = part(new THREE.BoxGeometry(0.18, 0.14, reach), front ? NOSE : 0x3a3f47);
    arm.position.set(x / 2, 0, z / 2);
    arm.lookAt(new THREE.Vector3(0, 0, 0));
    g.add(arm);
    const rotor = part(new THREE.CylinderGeometry(0.95, 0.95, 0.08, 24), front ? NOSE : 0x9aa4b2, {
      opacity: 0.55,
      roughness: 0.3
    });
    rotor.position.set(x, 0.28, z);
    g.add(rotor);
    const hub = part(new THREE.CylinderGeometry(0.14, 0.14, 0.4, 12), 0x1a1d22);
    hub.position.set(x, 0.15, z);
    g.add(hub);
  }
  return g;
}

function plane(): THREE.Group {
  const g = new THREE.Group();
  const fuselage = part(new THREE.BoxGeometry(0.6, 0.6, 5), 0xd7dde5, { roughness: 0.5 });
  g.add(fuselage);
  const nose = part(new THREE.ConeGeometry(0.32, 1.1, 20), NOSE);
  nose.rotation.x = Math.PI / 2;
  nose.position.z = 3;
  g.add(nose);
  const wings = part(new THREE.BoxGeometry(7, 0.14, 1.2), 0x3a7bd5, { roughness: 0.5 });
  wings.position.z = 0.3;
  g.add(wings);
  const tailplane = part(new THREE.BoxGeometry(2.6, 0.12, 0.8), 0x3a7bd5, { roughness: 0.5 });
  tailplane.position.z = -2.3;
  g.add(tailplane);
  const fin = part(new THREE.BoxGeometry(0.12, 1.1, 0.9), 0xd7dde5, { roughness: 0.5 });
  fin.position.set(0, 0.55, -2.3);
  g.add(fin);
  return g;
}

function boat(): THREE.Group {
  const g = new THREE.Group();
  const hull = part(new THREE.BoxGeometry(2, 0.7, 4), 0xe8eef5, { roughness: 0.5 });
  g.add(hull);
  const bow = part(new THREE.ConeGeometry(1, 1.6, 4), 0xe8eef5, { roughness: 0.5 });
  bow.rotation.x = Math.PI / 2;
  bow.rotation.z = Math.PI / 4;
  bow.scale.set(1, 0.7, 1);
  bow.position.z = 2.4;
  g.add(bow);
  const cabin = part(new THREE.BoxGeometry(1.3, 0.9, 1.6), 0x3a7bd5, { roughness: 0.5 });
  cabin.position.set(0, 0.8, -0.3);
  g.add(cabin);
  const mast = part(new THREE.CylinderGeometry(0.06, 0.06, 1.4, 8), NOSE);
  mast.position.set(0, 1.6, 0.4);
  g.add(mast);
  return g;
}

function rover(): THREE.Group {
  const g = new THREE.Group();
  const chassis = part(new THREE.BoxGeometry(1.8, 0.6, 2.6), 0x4a5568, { roughness: 0.6 });
  chassis.position.y = 0.5;
  g.add(chassis);
  const hood = part(new THREE.BoxGeometry(1.5, 0.4, 0.9), NOSE, { roughness: 0.5 });
  hood.position.set(0, 0.75, 1);
  g.add(hood);
  for (const x of [-0.95, 0.95]) {
    for (const z of [-0.9, 0.9]) {
      const wheel = part(new THREE.CylinderGeometry(0.55, 0.55, 0.35, 18), 0x1a1d22, { roughness: 0.8 });
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, 0.35, z);
      g.add(wheel);
    }
  }
  return g;
}

function sub(): THREE.Group {
  const g = new THREE.Group();
  const hull = part(new THREE.CapsuleGeometry(0.7, 3, 8, 20), 0x2c3e50, { metalness: 0.5, roughness: 0.4 });
  hull.rotation.x = Math.PI / 2;
  g.add(hull);
  const tower = part(new THREE.BoxGeometry(0.5, 0.7, 0.9), 0x22303d);
  tower.position.set(0, 0.7, -0.2);
  g.add(tower);
  const rudder = part(new THREE.BoxGeometry(0.1, 1, 0.9), NOSE);
  rudder.position.set(0, 0, -2.1);
  g.add(rudder);
  const plane = part(new THREE.BoxGeometry(2, 0.1, 0.7), NOSE);
  plane.position.set(0, 0, -2.1);
  g.add(plane);
  return g;
}

const BUILDERS: Record<VehicleClass, () => THREE.Group> = {
  multirotor,
  plane,
  boat,
  rover,
  sub,
  generic: multirotor
};

export function buildVehicleModel(cls: VehicleClass): THREE.Group {
  return BUILDERS[cls]();
}

// Frees the geometries and materials a model owns before it is dropped, so
// swapping vehicle classes never leaks GPU buffers.
export function disposeVehicleModel(group: THREE.Group): void {
  group.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const material = mesh.material;
    if (Array.isArray(material)) material.forEach((mm) => mm.dispose());
    else if (material) material.dispose();
  });
}
