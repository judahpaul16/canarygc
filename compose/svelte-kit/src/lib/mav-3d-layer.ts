import * as THREE from 'three';
import maplibregl, { type CustomLayerInterface, type CustomRenderMethodInput, type Map as MapLibreMap } from 'maplibre-gl';
import { buildVehicleModel, disposeVehicleModel, type VehicleClass } from './vehicle-models-3d';

export interface Mav3DState {
  lat: number;
  lng: number;
  amsl: number;
  // Terrain height under the vehicle, sampled by the caller outside the render
  // pass. Querying terrain inside render() re-dirties the map every frame and
  // locks the main thread into a repaint loop.
  ground: number;
  headingDeg: number;
  rollDeg: number;
  pitchDeg: number;
  cls: VehicleClass;
}

const DEG = Math.PI / 180;
// A few times life-size so the craft reads against tiles at flight zooms.
const MODEL_SCALE = 3;

// A three.js custom layer that draws the vehicle as a 3D model at its true
// flight altitude. The scene is rotated and Z-flipped once so a child placed at
// (east, up, north) meters lands in world space; the layer matrix projects that
// scene through the map camera, following the documented MapLibre pattern for
// three.js models on terrain.
export function createMav3DLayer(getState: () => Mav3DState | null): CustomLayerInterface {
  let renderer: THREE.WebGLRenderer;
  let camera: THREE.Camera;
  let scene: THREE.Scene;
  let vehicle: THREE.Group | null = null;
  let currentClass: VehicleClass | null = null;
  let dropLine: THREE.Line;
  let shadow: THREE.Mesh;
  let renderFailed = false;

  function setVehicleModel(cls: VehicleClass) {
    if (cls === currentClass) return;
    if (vehicle) {
      scene.remove(vehicle);
      disposeVehicleModel(vehicle);
    }
    vehicle = buildVehicleModel(cls);
    vehicle.scale.setScalar(MODEL_SCALE);
    scene.add(vehicle);
    currentClass = cls;
  }

  return {
    id: 'mav-3d',
    type: 'custom',
    renderingMode: '3d',

    onAdd(m: MapLibreMap, gl: WebGLRenderingContext | WebGL2RenderingContext) {
      camera = new THREE.Camera();
      scene = new THREE.Scene();
      scene.rotateX(Math.PI / 2);
      scene.scale.multiply(new THREE.Vector3(1, 1, -1));

      const sun = new THREE.DirectionalLight(0xffffff, 2.4);
      sun.position.set(0.4, 1, 0.3).normalize();
      scene.add(sun);
      scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x1b2028, 1.2));

      // Vertical tether from the ground point up to the craft, so the altitude
      // is obvious even when the camera is near level.
      const lineGeom = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 1, 0)
      ]);
      dropLine = new THREE.Line(
        lineGeom,
        new THREE.LineBasicMaterial({ color: 0x39c0ff, transparent: true, opacity: 0.85 })
      );
      scene.add(dropLine);

      // Ground ring under the craft, lying flat on the terrain.
      shadow = new THREE.Mesh(
        new THREE.RingGeometry(2, 5, 40),
        new THREE.MeshBasicMaterial({
          color: 0x0a0f16,
          transparent: true,
          opacity: 0.28,
          side: THREE.DoubleSide
        })
      );
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.y = 0.1;
      scene.add(shadow);

      renderer = new THREE.WebGLRenderer({ canvas: m.getCanvas(), context: gl, antialias: true });
      renderer.autoClear = false;
    },

    render(_gl: WebGLRenderingContext | WebGL2RenderingContext, args: CustomRenderMethodInput) {
      try {
        const s = getState();
        if (!s || !Number.isFinite(s.lat) || !Number.isFinite(s.lng)) return;
        setVehicleModel(s.cls);

        const agl = Math.max(0, s.amsl - s.ground);

        vehicle!.position.set(0, agl, 0);
        vehicle!.rotation.order = 'YXZ';
        vehicle!.rotation.set(-s.pitchDeg * DEG, s.headingDeg * DEG, -s.rollDeg * DEG);

        dropLine.scale.set(1, Math.max(agl, 0.001), 1);
        dropLine.visible = agl > 0.5;

        const merc = maplibregl.MercatorCoordinate.fromLngLat([s.lng, s.lat], s.ground);
        const scale = merc.meterInMercatorCoordinateUnits();

        const projection = new THREE.Matrix4().fromArray(args.defaultProjectionData.mainMatrix);
        const world = new THREE.Matrix4()
          .makeTranslation(merc.x, merc.y, merc.z)
          .scale(new THREE.Vector3(scale, -scale, scale));
        camera.projectionMatrix = projection.multiply(world);

        renderer.resetState();
        renderer.render(scene, camera);
        // three.js leaves its last vertex array bound; hand the context back to
        // the map with no stray binding so the map's own draws stay valid.
        if (_gl instanceof WebGL2RenderingContext) _gl.bindVertexArray(null);
      } catch (err) {
        // A single bad frame must never take the map's interaction down; log the
        // cause once so it can be diagnosed, and let the map keep rendering.
        if (!renderFailed) {
          renderFailed = true;
          console.error('mav-3d layer render failed:', err);
        }
      }
    },

    onRemove() {
      if (vehicle) disposeVehicleModel(vehicle);
      dropLine?.geometry.dispose();
      (dropLine?.material as THREE.Material)?.dispose();
      shadow?.geometry.dispose();
      (shadow?.material as THREE.Material)?.dispose();
      renderer?.dispose();
    }
  };
}
