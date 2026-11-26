import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  CITY_HALF_SIZE,
  MissionState,
  MissionType,
  PedestrianState,
  ROAD_WIDTH,
  VehicleKind,
  VehicleState,
  computeAiVehicleInput,
  createInitialVehicles,
  createNextMission,
  generateCityLayout,
  resolveVehiclePairCollision,
  stepPedestrianPhysics,
  stepVehiclePhysics,
} from '../../games/citydriver/engine';
import {
  createConfiguredRenderer,
  createSkyDome,
  makeAsphaltTexture,
  makeBuildingFacadeTexture,
  makeRadialShadowTexture,
  scheduleNextFrame,
} from '../../utils/threeHelpers';
import { soundFX } from '../../utils/sound';

interface CityDriverGameProps {
  onRecordUpdate: (stats: {
    cashEarned: number;
    missionsCompleted: number;
    maxWanted: number;
  }) => void;
}

interface HudSnapshot {
  phase: 'title' | 'playing' | 'wasted';
  speedKmh: number;
  inVehicle: boolean;
  vehicleLabel: string;
  vehicleHp: number;
  playerHp: number;
  cash: number;
  wantedStars: number;
  mission: MissionState;
  missionDist: number;
  canEnterVehicle: boolean;
  cameraMode: number;
  statusBanner: string | null;
}

const VEHICLE_NAMES: Record<VehicleKind, string> = {
  sport: 'Sultan GT Coupe',
  muscle: 'Dominator V8',
  taxi: 'City Cab',
  sedan: 'Premier Sedan',
  suv: 'Patriot 4x4',
  police: 'LSPD Interceptor',
};

function makeLowerBodyGeometry(kind: VehicleKind): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  if (kind === 'suv') {
    shape.moveTo(-2.14, 0.34);
    shape.lineTo(2.14, 0.34);
    shape.lineTo(2.16, 0.84);
    shape.lineTo(1.16, 0.96);
    shape.lineTo(-1.95, 0.98);
    shape.lineTo(-2.14, 0.82);
    shape.lineTo(-2.14, 0.34);
  } else if (kind === 'sport') {
    shape.moveTo(-2.16, 0.28);
    shape.lineTo(2.22, 0.28);
    shape.lineTo(2.14, 0.62);
    shape.lineTo(1.06, 0.80);
    shape.lineTo(-1.82, 0.86);
    shape.lineTo(-2.16, 0.72);
    shape.lineTo(-2.16, 0.28);
  } else {
    shape.moveTo(-2.14, 0.30);
    shape.lineTo(2.16, 0.30);
    shape.lineTo(2.12, 0.68);
    shape.lineTo(1.10, 0.84);
    shape.lineTo(-1.88, 0.88);
    shape.lineTo(-2.14, 0.72);
    shape.lineTo(-2.14, 0.30);
  }

  const width = kind === 'suv' ? 1.92 : 1.88;
  const geom = new THREE.ExtrudeGeometry(shape, {
    depth: width,
    bevelEnabled: true,
    bevelThickness: 0.09,
    bevelSize: 0.06,
    bevelSegments: 2,
  });
  geom.rotateY(-Math.PI / 2);
  geom.translate(width / 2, 0, 0);
  geom.computeVertexNormals();
  return geom;
}

function makeCabinGeometry(kind: VehicleKind): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  if (kind === 'suv') {
    shape.moveTo(-1.92, 0.92);
    shape.lineTo(1.12, 0.92);
    shape.lineTo(0.64, 1.54);
    shape.lineTo(-1.68, 1.54);
    shape.lineTo(-1.92, 0.92);
  } else if (kind === 'sport') {
    shape.moveTo(-1.74, 0.78);
    shape.lineTo(1.02, 0.76);
    shape.lineTo(0.28, 1.24);
    shape.lineTo(-0.96, 1.24);
    shape.lineTo(-1.74, 0.78);
  } else {
    shape.moveTo(-1.78, 0.82);
    shape.lineTo(1.04, 0.80);
    shape.lineTo(0.42, 1.32);
    shape.lineTo(-1.02, 1.32);
    shape.lineTo(-1.78, 0.82);
  }

  const width = kind === 'suv' ? 1.54 : 1.34;
  const geom = new THREE.ExtrudeGeometry(shape, {
    depth: width,
    bevelEnabled: true,
    bevelThickness: 0.08,
    bevelSize: 0.05,
    bevelSegments: 2,
  });
  geom.rotateY(-Math.PI / 2);
  geom.translate(width / 2, 0, 0);
  geom.computeVertexNormals();
  return geom;
}

const SCULPTED_CAR_GEOS: Partial<
  Record<VehicleKind, { lower: THREE.ExtrudeGeometry; cabin: THREE.ExtrudeGeometry }>
> = {};
function getCarGeos(kind: VehicleKind) {
  if (!SCULPTED_CAR_GEOS[kind]) {
    SCULPTED_CAR_GEOS[kind] = {
      lower: makeLowerBodyGeometry(kind),
      cabin: makeCabinGeometry(kind),
    };
  }
  return SCULPTED_CAR_GEOS[kind]!;
}

function buildVehicleMesh(
  v: VehicleState,
  shadowTex: THREE.Texture
): {
  group: THREE.Group;
  bodyTilt: THREE.Group;
  wheels: THREE.Group[];
  frontSteerPivots: THREE.Group[];
  brakeLights: THREE.Mesh[];
  sirenRed?: THREE.Mesh;
  sirenBlue?: THREE.Mesh;
} {
  const group = new THREE.Group();
  const bodyTilt = new THREE.Group();
  group.add(bodyTilt);

  const shadowGeo = new THREE.PlaneGeometry(3.2, 5.4);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: shadowTex,
    transparent: true,
    depthWrite: false,
  });
  const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
  shadowMesh.rotation.x = -Math.PI / 2;
  shadowMesh.position.y = 0.03;
  group.add(shadowMesh);

  const paintMat = new THREE.MeshStandardMaterial({
    color: v.color,
    roughness: v.kind === 'sport' ? 0.25 : 0.34,
    metalness: 0.52,
  });
  const darkTrimMat = new THREE.MeshStandardMaterial({
    color: '#141820',
    roughness: 0.72,
    metalness: 0.22,
  });
  const glassMat = new THREE.MeshStandardMaterial({
    color: '#0c1624',
    roughness: 0.12,
    metalness: 0.85,
  });
  const chromeMat = new THREE.MeshStandardMaterial({
    color: '#d4dce6',
    roughness: 0.24,
    metalness: 0.9,
  });

  // Sculpted streamlined chassis + narrower tapered cabin greenhouse
  const geos = getCarGeos(v.kind);
  const bodyMesh = new THREE.Mesh(geos.lower, paintMat);
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;
  bodyTilt.add(bodyMesh);

  const cabinMesh = new THREE.Mesh(geos.cabin, paintMat);
  cabinMesh.castShadow = true;
  cabinMesh.receiveShadow = true;
  bodyTilt.add(cabinMesh);

  // Sloped windshield, rear fastback glass & side windows sized to tapered cabin
  const cabinW = v.kind === 'suv' ? 1.44 : 1.24;
  const cabinH = v.kind === 'suv' ? 1.24 : 1.04;
  const frontGlass = new THREE.Mesh(new THREE.BoxGeometry(cabinW, 0.34, 0.08), glassMat);
  frontGlass.position.set(0, cabinH, 0.66);
  frontGlass.rotation.x = -0.84;
  bodyTilt.add(frontGlass);

  const rearGlass = new THREE.Mesh(new THREE.BoxGeometry(cabinW * 0.96, 0.34, 0.08), glassMat);
  rearGlass.position.set(0, cabinH - 0.02, -1.26);
  rearGlass.rotation.x = 0.96;
  bodyTilt.add(rearGlass);

  const sideGlass = new THREE.Mesh(
    new THREE.BoxGeometry(cabinW + 0.24, 0.26, 1.32),
    glassMat
  );
  sideGlass.position.set(0, cabinH - 0.02, -0.25);
  bodyTilt.add(sideGlass);

  // Police white doors band
  if (v.isPolice) {
    const doorBand = new THREE.Mesh(
      new THREE.BoxGeometry(2.04, 0.42, 1.65),
      new THREE.MeshStandardMaterial({ color: '#f1f5f9', roughness: 0.3, metalness: 0.2 })
    );
    doorBand.position.set(0, 0.54, -0.05);
    bodyTilt.add(doorBand);
  }

  // Side mirrors + lower front splitter + rear diffuser + dual chrome exhaust tips
  for (const sx of [-1.02, 1.02]) {
    const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.1, 0.14), darkTrimMat);
    mirror.position.set(sx, 0.88, 0.56);
    bodyTilt.add(mirror);
  }

  const frontSplitter = new THREE.Mesh(new THREE.BoxGeometry(1.94, 0.09, 0.24), darkTrimMat);
  frontSplitter.position.set(0, 0.3, 2.18);
  bodyTilt.add(frontSplitter);

  const rearDiffuser = new THREE.Mesh(new THREE.BoxGeometry(1.88, 0.16, 0.22), darkTrimMat);
  rearDiffuser.position.set(0, 0.34, -2.14);
  bodyTilt.add(rearDiffuser);

  for (const ex of [-0.58, 0.58]) {
    const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.18, 10), chromeMat);
    exhaust.rotation.x = Math.PI / 2;
    exhaust.position.set(ex, 0.34, -2.23);
    bodyTilt.add(exhaust);
  }

  // Glowing Headlights (+Z front)
  const headMat = new THREE.MeshStandardMaterial({
    color: '#fff6d6',
    emissive: '#ffe9a8',
    emissiveIntensity: 2.0,
    roughness: 0.18,
  });
  for (const sx of [-0.66, 0.66]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.14, 0.1), headMat);
    hl.position.set(sx, 0.56, 2.18);
    bodyTilt.add(hl);
  }

  // Taillights (-Z rear)
  const brakeLights: THREE.Mesh[] = [];
  for (const sx of [-0.64, 0.64]) {
    const tailMat = new THREE.MeshStandardMaterial({
      color: '#ef4444',
      emissive: '#b91c1c',
      emissiveIntensity: 1.4,
      roughness: 0.22,
    });
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.13, 0.1), tailMat);
    tl.position.set(sx, 0.62, -2.17);
    bodyTilt.add(tl);
    brakeLights.push(tl);
  }

  if (v.kind === 'sport' || v.kind === 'muscle') {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(1.76, 0.06, 0.28), darkTrimMat);
    wing.position.set(0, 1.06, -1.96);
    bodyTilt.add(wing);
    for (const sx of [-0.56, 0.56]) {
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.22, 0.14), darkTrimMat);
      strut.position.set(sx, 0.94, -1.96);
      bodyTilt.add(strut);
    }
  }

  if (v.kind === 'taxi') {
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(0.65, 0.2, 0.3),
      new THREE.MeshStandardMaterial({
        color: '#fef08a',
        emissive: '#facc15',
        emissiveIntensity: 1.5,
      })
    );
    sign.position.set(0, 1.44, -0.22);
    bodyTilt.add(sign);
  }

  let sirenRed: THREE.Mesh | undefined;
  let sirenBlue: THREE.Mesh | undefined;
  if (v.isPolice) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.08, 0.26), darkTrimMat);
    bar.position.set(0, 1.38, -0.22);
    bodyTilt.add(bar);
    sirenRed = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.11, 0.24),
      new THREE.MeshStandardMaterial({
        color: '#ef4444',
        emissive: '#ef4444',
        emissiveIntensity: 0.3,
      })
    );
    sirenRed.position.set(-0.34, 1.44, -0.22);
    bodyTilt.add(sirenRed);

    sirenBlue = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.11, 0.24),
      new THREE.MeshStandardMaterial({
        color: '#3b82f6',
        emissive: '#3b82f6',
        emissiveIntensity: 0.3,
      })
    );
    sirenBlue.position.set(0.34, 1.44, -0.22);
    bodyTilt.add(sirenBlue);
  }

  const wheels: THREE.Group[] = [];
  const frontSteerPivots: THREE.Group[] = [];
  const tireMat = new THREE.MeshStandardMaterial({ color: '#111318', roughness: 0.85 });
  const wheelCoords: [number, number, boolean][] = [
    [-0.95, 1.34, true],
    [0.95, 1.34, true],
    [-0.95, -1.32, false],
    [0.95, -1.32, false],
  ];

  for (const [wx, wz, isFront] of wheelCoords) {
    const steerPivot = new THREE.Group();
    steerPivot.position.set(wx, 0.35, wz);
    group.add(steerPivot);
    if (isFront) frontSteerPivots.push(steerPivot);

    const spinGroup = new THREE.Group();
    steerPivot.add(spinGroup);
    wheels.push(spinGroup);

    const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.26, 16), tireMat);
    tire.rotation.z = Math.PI / 2;
    spinGroup.add(tire);

    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.275, 10), chromeMat);
    rim.rotation.z = Math.PI / 2;
    spinGroup.add(rim);
  }

  return { group, bodyTilt, wheels, frontSteerPivots, brakeLights, sirenRed, sirenBlue };
}

function buildPedestrianMesh(shadowTex: THREE.Texture) {
  const group = new THREE.Group();
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(1.1, 1.1),
    new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.03;
  group.add(shadow);

  const jacketMat = new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.65 });
  const shirtMat = new THREE.MeshStandardMaterial({ color: '#e2e8f0', roughness: 0.7 });
  const pantsMat = new THREE.MeshStandardMaterial({ color: '#0f172a', roughness: 0.78 });
  const skinMat = new THREE.MeshStandardMaterial({ color: '#e6b89c', roughness: 0.62 });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.66, 0.26), jacketMat);
  torso.position.y = 1.12;
  torso.castShadow = true;
  group.add(torso);

  const chest = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.52, 0.28), shirtMat);
  chest.position.y = 1.1;
  group.add(chest);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 10), skinMat);
  head.position.y = 1.64;
  group.add(head);

  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.72, 0.2), pantsMat);
  legL.position.set(-0.14, 0.42, 0);
  group.add(legL);

  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.72, 0.2), pantsMat);
  legR.position.set(0.14, 0.42, 0);
  group.add(legR);

  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.56, 0.16), jacketMat);
  armL.position.set(-0.35, 1.12, 0);
  group.add(armL);

  const armR = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.56, 0.16), jacketMat);
  armR.position.set(0.35, 1.12, 0);
  group.add(armR);

  return { group, legL, legR, armL, armR };
}

export const CityDriverGame: React.FC<CityDriverGameProps> = ({ onRecordUpdate }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const minimapRef = useRef<HTMLCanvasElement | null>(null);

  const [hud, setHud] = useState<HudSnapshot>(() => ({
    phase:
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('autostart') === '1'
        ? 'playing'
        : 'title',
    speedKmh: 0,
    inVehicle: true,
    vehicleLabel: VEHICLE_NAMES.sport,
    vehicleHp: 100,
    playerHp: 100,
    cash: 500,
    wantedStars: 0,
    mission: {
      type: 'delivery',
      title: 'VIP-доставка',
      phase: 'to_pickup',
      checkpoints: [],
      checkpointIdx: 0,
      pickup: { x: -64, z: -64, name: 'Деловой центр' },
      dropoff: { x: 64, z: -64, name: 'Неоновый квартал' },
      reward: 700,
      timeLeft: 85,
      completedCount: 0,
    },
    missionDist: 90,
    canEnterVehicle: false,
    cameraMode: 0,
    statusBanner: null,
  }));

  const keysRef = useRef<Record<string, boolean>>({});
  const touchCtrlRef = useRef({ throttle: 0, steer: 0, handbrake: false });
  const actionTriggerRef = useRef<{
    toggleVehicle: boolean;
    cycleCam: boolean;
    cycleMission: boolean;
    startGame: boolean;
    resetGame: boolean;
  }>({
    toggleVehicle: false,
    cycleCam: false,
    cycleMission: false,
    startGame: false,
    resetGame: false,
  });

  const handleStart = useCallback(() => {
    soundFX.click();
    actionTriggerRef.current.startGame = true;
  }, []);

  const handleRespawn = useCallback(() => {
    soundFX.click();
    actionTriggerRef.current.resetGame = true;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const layout = generateCityLayout();
    let vehicles = createInitialVehicles();
    let activeVehicleId: string | null = vehicles[0].id;
    let ped: PedestrianState = {
      x: vehicles[0].x - 2.2,
      z: vehicles[0].z,
      heading: Math.PI,
      vx: 0,
      vz: 0,
      walkCycle: 0,
      hp: 100,
    };

    let cash = 500;
    let wantedStars = 0;
    let wantedDecayTimer = 0;
    let maxWantedSeen = 0;
    let missionIdx = 0;
    let mission = createNextMission(layout.missionSpots, vehicles[0].x, vehicles[0].z, 0, 'delivery');
    const params = new URLSearchParams(window.location.search);
    let phase: 'title' | 'playing' | 'wasted' =
      params.get('autostart') === '1' ? 'playing' : 'title';
    let cameraMode = 0;
    let cameraYaw = Math.PI;
    let statusBanner: string | null = null;
    let bannerTimer = 0;
    let sirenClock = 0;
    let lastHudEmit = 0;
    let crashedGrace = 0;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#182136');
    scene.fog = new THREE.FogExp2('#1c253c', 0.0034);

    const rect = canvas.getBoundingClientRect();
    const width = Math.max(320, rect.width || canvas.parentElement?.clientWidth || 960);
    const height = Math.max(240, rect.height || 560);

    const { renderer, isSoftwareGl, dispose: disposeRenderer } = createConfiguredRenderer(
      canvas,
      scene,
      width,
      height
    );
    const maxAniso = renderer.capabilities.getMaxAnisotropy();

    const camera = new THREE.PerspectiveCamera(62, width / height, 0.5, 820);

    const hemi = new THREE.HemisphereLight('#78a8ec', '#222838', 0.9);
    scene.add(hemi);

    const sun = new THREE.DirectionalLight('#ffb168', 2.3);
    sun.position.set(160, 120, 140);
    if (!isSoftwareGl) {
      sun.castShadow = true;
      sun.shadow.mapSize.set(1024, 1024);
      sun.shadow.camera.left = -110;
      sun.shadow.camera.right = 110;
      sun.shadow.camera.top = 110;
      sun.shadow.camera.bottom = -110;
    }
    scene.add(sun);

    const skyDome = createSkyDome('#131b32', '#7a3f38', 540);
    scene.add(skyDome);

    const sunGlow = new THREE.Mesh(
      new THREE.CircleGeometry(46, 24),
      new THREE.MeshBasicMaterial({ color: '#ff9642', fog: false })
    );
    sunGlow.position.set(340, 75, 320);
    sunGlow.lookAt(0, 0, 0);
    scene.add(sunGlow);

    const waterMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1500, 1500),
      new THREE.MeshStandardMaterial({
        color: '#0c233b',
        roughness: 0.2,
        metalness: 0.68,
      })
    );
    waterMesh.rotation.x = -Math.PI / 2;
    waterMesh.position.y = -0.9;
    scene.add(waterMesh);

    const asphaltTex = makeAsphaltTexture(maxAniso);
    asphaltTex.repeat.set(58, 58);
    const roadGround = new THREE.Mesh(
      new THREE.PlaneGeometry(CITY_HALF_SIZE * 2, CITY_HALF_SIZE * 2),
      new THREE.MeshStandardMaterial({
        map: asphaltTex,
        roughness: 0.84,
        metalness: 0.08,
      })
    );
    roadGround.rotation.x = -Math.PI / 2;
    roadGround.receiveShadow = true;
    scene.add(roadGround);

    const seawallMat = new THREE.MeshStandardMaterial({ color: '#475569', roughness: 0.8 });
    const wallLen = CITY_HALF_SIZE * 2 + 4;
    for (const [wx, wz, rx, rz] of [
      [0, CITY_HALF_SIZE + 1, wallLen, 2],
      [0, -CITY_HALF_SIZE - 1, wallLen, 2],
      [CITY_HALF_SIZE + 1, 0, 2, wallLen],
      [-CITY_HALF_SIZE - 1, 0, 2, wallLen],
    ] as [number, number, number, number][]) {
      const sw = new THREE.Mesh(new THREE.BoxGeometry(rx, 1.6, rz), seawallMat);
      sw.position.set(wx, 0.2, wz);
      scene.add(sw);
    }

    const sidewalkMat = new THREE.MeshStandardMaterial({ color: '#333b4a', roughness: 0.88 });
    const parkMat = new THREE.MeshStandardMaterial({ color: '#1f4d36', roughness: 0.92 });
    const sidewalkGeo = new THREE.BoxGeometry(1, 0.24, 1);

    for (const blk of layout.blocks) {
      const m = new THREE.Mesh(sidewalkGeo, blk.isPark ? parkMat : sidewalkMat);
      m.scale.set(blk.size, 1, blk.size);
      m.position.set(blk.cx, 0.12, blk.cz);
      m.receiveShadow = true;
      scene.add(m);

      if (blk.hasFountain) {
        const basin = new THREE.Mesh(
          new THREE.CylinderGeometry(7.2, 7.8, 0.7, 20),
          new THREE.MeshStandardMaterial({ color: '#64748b', roughness: 0.6 })
        );
        basin.position.set(blk.cx, 0.5, blk.cz);
        const waterPool = new THREE.Mesh(
          new THREE.CylinderGeometry(6.4, 6.4, 0.75, 20),
          new THREE.MeshStandardMaterial({
            color: '#0ea5e9',
            emissive: '#0284c7',
            emissiveIntensity: 0.45,
            roughness: 0.15,
          })
        );
        waterPool.position.set(blk.cx, 0.54, blk.cz);
        scene.add(basin, waterPool);
      }
    }

    // Road lane dashes
    const dashGeo = new THREE.PlaneGeometry(0.32, 4.2);
    const dashMat = new THREE.MeshBasicMaterial({ color: '#e2b642' });
    const dashTransforms: THREE.Matrix4[] = [];
    const tmpM = new THREE.Matrix4();
    const tmpQ = new THREE.Quaternion();
    const tmpV = new THREE.Vector3();
    const tmpS = new THREE.Vector3(1, 1, 1);

    for (const rc of layout.roadCoords) {
      for (let d = -CITY_HALF_SIZE + 12; d < CITY_HALF_SIZE - 12; d += 14) {
        if (layout.roadCoords.some((cross) => Math.abs(d - cross) < ROAD_WIDTH * 0.6)) continue;
        tmpQ.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
        tmpV.set(rc, 0.025, d);
        tmpM.compose(tmpV, tmpQ, tmpS);
        dashTransforms.push(tmpM.clone());

        tmpQ.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, Math.PI / 2));
        tmpV.set(d, 0.025, rc);
        tmpM.compose(tmpV, tmpQ, tmpS);
        dashTransforms.push(tmpM.clone());
      }
    }
    const dashInst = new THREE.InstancedMesh(dashGeo, dashMat, dashTransforms.length);
    dashTransforms.forEach((m, idx) => dashInst.setMatrixAt(idx, m));
    scene.add(dashInst);

    // Varied Architectural Skyline (Stepped towers, Cylindrical glass towers, Spire towers)
    const facadeCache = new Map<string, THREE.MeshStandardMaterial>();
    const roofMat = new THREE.MeshStandardMaterial({ color: '#1b202b', roughness: 0.85 });
    const buildingGeo = new THREE.BoxGeometry(1, 1, 1);
    const cylGeo = new THREE.CylinderGeometry(0.5, 0.54, 1, 16);
    const spireMat = new THREE.MeshBasicMaterial({ color: '#f43f5e' });

    for (const b of layout.buildings) {
      const key = `${b.baseColor}_${b.litColor}`;
      let mat = facadeCache.get(key);
      if (!mat) {
        const tex = makeBuildingFacadeTexture(b.baseColor, b.litColor, maxAniso);
        tex.repeat.set(1, 2);
        mat = new THREE.MeshStandardMaterial({
          map: tex,
          roughness: b.style === 'glass' ? 0.24 : 0.72,
          metalness: b.style === 'glass' ? 0.58 : 0.15,
        });
        facadeCache.set(key, mat);
      }

      if (b.shape === 'cylinder') {
        const cyl = new THREE.Mesh(cylGeo, [mat, roofMat, roofMat]);
        const rad = Math.min(b.width, b.depth);
        cyl.scale.set(rad, b.height, rad);
        cyl.position.set(b.x, b.height / 2 + 0.24, b.z);
        cyl.receiveShadow = true;
        scene.add(cyl);
      } else if (b.shape === 'stepped' || b.shape === 'spire') {
        const podiumH = b.height * 0.55;
        const topH = b.height * 0.45;
        const podium = new THREE.Mesh(buildingGeo, [mat, mat, roofMat, roofMat, mat, mat]);
        podium.scale.set(b.width, podiumH, b.depth);
        podium.position.set(b.x, podiumH / 2 + 0.24, b.z);
        podium.receiveShadow = true;
        scene.add(podium);

        const crown = new THREE.Mesh(buildingGeo, [mat, mat, roofMat, roofMat, mat, mat]);
        crown.scale.set(b.width * 0.7, topH, b.depth * 0.7);
        crown.position.set(b.x, podiumH + topH / 2 + 0.24, b.z);
        scene.add(crown);

        if (b.shape === 'spire' && b.height > 26) {
          const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.35, 7, 6), roofMat);
          spire.position.set(b.x, b.height + 3.5, b.z);
          const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.32, 6, 6), spireMat);
          beacon.position.set(b.x, b.height + 7.1, b.z);
          scene.add(spire, beacon);
        }
      } else {
        const mesh = new THREE.Mesh(buildingGeo, [mat, mat, roofMat, roofMat, mat, mat]);
        mesh.scale.set(b.width, b.height, b.depth);
        mesh.position.set(b.x, b.height / 2 + 0.24, b.z);
        mesh.receiveShadow = true;
        scene.add(mesh);
      }
    }

    // Palm trees
    const trunkGeo = new THREE.CylinderGeometry(0.18, 0.28, 5.2, 7);
    const trunkMat = new THREE.MeshStandardMaterial({ color: '#5c4028', roughness: 0.9 });
    const crownGeo = new THREE.ConeGeometry(2.3, 1.4, 7);
    const crownMat = new THREE.MeshStandardMaterial({ color: '#276738', roughness: 0.75 });
    const trunkInst = new THREE.InstancedMesh(trunkGeo, trunkMat, layout.palmPositions.length);
    const crownInst = new THREE.InstancedMesh(crownGeo, crownMat, layout.palmPositions.length);
    layout.palmPositions.forEach((p, idx) => {
      tmpQ.identity();
      tmpV.set(p.x, 2.7, p.z);
      tmpM.compose(tmpV, tmpQ, tmpS);
      trunkInst.setMatrixAt(idx, tmpM);
      tmpV.set(p.x, 5.4, p.z);
      tmpM.compose(tmpV, tmpQ, tmpS);
      crownInst.setMatrixAt(idx, tmpM);
    });
    scene.add(trunkInst, crownInst);

    // Streetlamps
    const poleGeo = new THREE.CylinderGeometry(0.08, 0.12, 5.6, 6);
    const poleMat = new THREE.MeshStandardMaterial({ color: '#334155', roughness: 0.55, metalness: 0.6 });
    const bulbGeo = new THREE.SphereGeometry(0.24, 8, 6);
    const bulbMat = new THREE.MeshBasicMaterial({ color: '#ffd98a' });
    const poleInst = new THREE.InstancedMesh(poleGeo, poleMat, layout.lampPositions.length);
    const bulbInst = new THREE.InstancedMesh(bulbGeo, bulbMat, layout.lampPositions.length);
    layout.lampPositions.forEach((lp, idx) => {
      tmpQ.identity();
      tmpV.set(lp.x, 2.9, lp.z);
      tmpM.compose(tmpV, tmpQ, tmpS);
      poleInst.setMatrixAt(idx, tmpM);
      tmpV.set(lp.x, 5.7, lp.z);
      tmpM.compose(tmpV, tmpQ, tmpS);
      bulbInst.setMatrixAt(idx, tmpM);
    });
    scene.add(poleInst, bulbInst);

    // Mission beacon
    const beaconGroup = new THREE.Group();
    const ringMesh = new THREE.Mesh(
      new THREE.RingGeometry(2.4, 3.1, 28),
      new THREE.MeshBasicMaterial({
        color: '#22d3ee',
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.85,
      })
    );
    ringMesh.rotation.x = -Math.PI / 2;
    ringMesh.position.y = 0.08;
    const beamMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(1.5, 2.4, 28, 16, 1, true),
      new THREE.MeshBasicMaterial({
        color: '#22d3ee',
        transparent: true,
        opacity: 0.18,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    beamMesh.position.y = 14;
    beaconGroup.add(ringMesh, beamMesh);
    scene.add(beaconGroup);

    const shadowTex = makeRadialShadowTexture();
    const vehicleMeshes = new Map<string, ReturnType<typeof buildVehicleMesh>>();
    for (const v of vehicles) {
      const built = buildVehicleMesh(v, shadowTex);
      built.group.position.set(v.x, 0, v.z);
      built.group.rotation.y = v.heading;
      scene.add(built.group);
      vehicleMeshes.set(v.id, built);
    }

    const pedMesh = buildPedestrianMesh(shadowTex);
    pedMesh.group.visible = false;
    scene.add(pedMesh.group);

    const onResize = () => {
      const r = canvas.getBoundingClientRect();
      const w = Math.max(320, r.width);
      const h = Math.max(240, r.height);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(canvas);

    const onKeyDown = (e: KeyboardEvent) => {
      keysRef.current[e.code] = true;
      if (e.code === 'KeyF' && !e.repeat) actionTriggerRef.current.toggleVehicle = true;
      if (e.code === 'KeyC' && !e.repeat) actionTriggerRef.current.cycleCam = true;
      if (e.code === 'KeyM' && !e.repeat) actionTriggerRef.current.cycleMission = true;
      if (e.code === 'KeyH' && !e.repeat && phase === 'playing' && activeVehicleId) {
        soundFX.carHorn();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keysRef.current[e.code] = false;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    const onContextLost = (e: Event) => e.preventDefault();
    canvas.addEventListener('webglcontextlost', onContextLost);

    const drawMinimap = (px: number, pz: number, heading: number, targetX: number, targetZ: number) => {
      const mm = minimapRef.current;
      if (!mm) return;
      const ctx = mm.getContext('2d');
      if (!ctx) return;
      const S = mm.width;
      const half = S / 2;
      const scale = 0.58;

      ctx.fillStyle = '#0c111b';
      ctx.fillRect(0, 0, S, S);

      ctx.fillStyle = '#242c3c';
      for (const rc of layout.roadCoords) {
        const rx = half + (rc - px) * scale;
        const rz = half + (rc - pz) * scale;
        ctx.fillRect(rx - 5, 0, 10, S);
        ctx.fillRect(0, rz - 5, S, 10);
      }

      ctx.fillStyle = '#3c485e';
      for (const b of layout.buildings) {
        const bx = half + (b.x - px) * scale;
        const bz = half + (b.z - pz) * scale;
        if (bx < -20 || bx > S + 20 || bz < -20 || bz > S + 20) continue;
        ctx.fillRect(bx - (b.width * scale) / 2, bz - (b.depth * scale) / 2, b.width * scale, b.depth * scale);
      }

      // Traffic & Police dots
      for (const v of vehicles) {
        if (v.id === activeVehicleId) continue;
        const vx = half + (v.x - px) * scale;
        const vz = half + (v.z - pz) * scale;
        if (vx < 0 || vx > S || vz < 0 || vz > S) continue;
        if (v.isPolice) {
          ctx.fillStyle = wantedStars > 0 && Math.floor(sirenClock * 5) % 2 === 0 ? '#ef4444' : '#3b82f6';
          ctx.beginPath();
          ctx.arc(vx, vz, 3.2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillStyle = '#94a3b8';
          ctx.fillRect(vx - 1.5, vz - 1.5, 3, 3);
        }
      }

      const tx = half + (targetX - px) * scale;
      const tz = half + (targetZ - pz) * scale;
      const clampX = Math.max(7, Math.min(S - 7, tx));
      const clampZ = Math.max(7, Math.min(S - 7, tz));
      ctx.fillStyle = mission.phase === 'to_pickup' ? '#22d3ee' : '#f59e0b';
      ctx.beginPath();
      ctx.arc(clampX, clampZ, 4.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.save();
      ctx.translate(half, half);
      ctx.rotate(-heading + Math.PI);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(0, -6);
      ctx.lineTo(4.5, 5);
      ctx.lineTo(-4.5, 5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    };

    let disposed = false;
    let cancelFrame = () => {};
    let lastTime = performance.now();
    const smoothCamPos = new THREE.Vector3(vehicles[0].x, 4.2, vehicles[0].z + 8.5);
    const smoothLookAt = new THREE.Vector3(vehicles[0].x, 1.2, vehicles[0].z);
    camera.position.copy(smoothCamPos);
    camera.lookAt(smoothLookAt);
    renderer.render(scene, camera);

    const tick = () => {
      if (disposed) return;
      const now = performance.now();
      const dt = Math.min(0.05, Math.max(0.008, (now - lastTime) / 1000));
      lastTime = now;
      sirenClock += dt;

      if (actionTriggerRef.current.startGame) {
        actionTriggerRef.current.startGame = false;
        phase = 'playing';
        statusBanner = `${mission.title} · Нажмите M чтобы сменить контракт`;
        bannerTimer = 4.0;
      }

      if (actionTriggerRef.current.resetGame) {
        actionTriggerRef.current.resetGame = false;
        vehicles = createInitialVehicles();
        activeVehicleId = vehicles[0].id;
        ped.hp = 100;
        wantedStars = 0;
        phase = 'playing';
        mission = createNextMission(layout.missionSpots, vehicles[0].x, vehicles[0].z, mission.completedCount);
        statusBanner = 'Вы снова в деле!';
        bannerTimer = 3.0;
      }

      if (actionTriggerRef.current.cycleCam) {
        actionTriggerRef.current.cycleCam = false;
        cameraMode = (cameraMode + 1) % 3;
      }

      if (actionTriggerRef.current.cycleMission && phase === 'playing') {
        actionTriggerRef.current.cycleMission = false;
        missionIdx += 1;
        const mTypes: MissionType[] = ['delivery', 'sprint', 'heist'];
        const chosen = mTypes[missionIdx % mTypes.length];
        const px = activeVehicleId ? (vehicles.find((v) => v.id === activeVehicleId)?.x ?? 0) : ped.x;
        const pz = activeVehicleId ? (vehicles.find((v) => v.id === activeVehicleId)?.z ?? 0) : ped.z;
        mission = createNextMission(layout.missionSpots, px, pz, mission.completedCount, chosen);
        if (chosen === 'heist') {
          wantedStars = Math.max(wantedStars, 2);
          maxWantedSeen = Math.max(maxWantedSeen, wantedStars);
        }
        statusBanner = `Новый контракт: ${mission.title}`;
        bannerTimer = 3.2;
        soundFX.click();
      }

      if (bannerTimer > 0) {
        bannerTimer -= dt;
        if (bannerTimer <= 0) statusBanner = null;
      }
      if (crashedGrace > 0) crashedGrace -= dt;

      const k = keysRef.current;
      const tc = touchCtrlRef.current;

      const throttle =
        (k['KeyW'] || k['ArrowUp'] ? 1 : 0) -
        (k['KeyS'] || k['ArrowDown'] ? 1 : 0) +
        tc.throttle;
      const steer =
        (k['KeyA'] || k['ArrowLeft'] ? 1 : 0) -
        (k['KeyD'] || k['ArrowRight'] ? 1 : 0) +
        tc.steer;
      const handbrake = Boolean(k['Space'] || tc.handbrake);

      const clampedThrottle = Math.max(-1, Math.min(1, throttle));
      const clampedSteer = Math.max(-1, Math.min(1, steer));

      if (actionTriggerRef.current.toggleVehicle && phase === 'playing') {
        actionTriggerRef.current.toggleVehicle = false;
        if (activeVehicleId) {
          const cur = vehicles.find((v) => v.id === activeVehicleId);
          if (cur) {
            ped.x = cur.x - Math.cos(cur.heading) * 2.3;
            ped.z = cur.z + Math.sin(cur.heading) * 2.3;
            ped.heading = cur.heading;
          }
          activeVehicleId = null;
          soundFX.click();
        } else {
          let best: VehicleState | null = null;
          let bestDist = 5.5;
          for (const v of vehicles) {
            if (v.hp <= 0) continue;
            const d = Math.hypot(v.x - ped.x, v.z - ped.z);
            if (d < bestDist) {
              bestDist = d;
              best = v;
            }
          }
          if (best) {
            activeVehicleId = best.id;
            if (best.isPolice || best.kind === 'taxi') {
              wantedStars = Math.max(wantedStars, 1);
              maxWantedSeen = Math.max(maxWantedSeen, wantedStars);
              statusBanner = 'Угон служебного авто! Полиция на хвосте!';
              bannerTimer = 3.2;
            }
            soundFX.click();
          }
        }
      }

      const activeCar = activeVehicleId
        ? vehicles.find((v) => v.id === activeVehicleId) ?? null
        : null;

      const playerX = activeCar ? activeCar.x : ped.x;
      const playerZ = activeCar ? activeCar.z : ped.z;
      const playerHeading = activeCar ? activeCar.heading : ped.heading;

      if (phase === 'playing') {
        if (activeCar) {
          const res = stepVehiclePhysics(
            activeCar,
            { throttle: clampedThrottle, steer: clampedSteer, handbrake },
            dt,
            layout.buildings
          );
          if (res.crashedSpeed > 8 && crashedGrace <= 0) {
            soundFX.carCrash(Math.min(1, res.crashedSpeed / 22));
            crashedGrace = 0.4;
          }
          if (activeCar.hp <= 0) {
            phase = 'wasted';
            soundFX.loseTone();
            onRecordUpdate({
              cashEarned: 0,
              missionsCompleted: 0,
              maxWanted: maxWantedSeen,
            });
          }
        } else {
          cameraYaw += clampedSteer * 2.1 * dt;
          stepPedestrianPhysics(
            ped,
            clampedThrottle,
            0,
            cameraYaw,
            Boolean(k['ShiftLeft'] || k['ShiftRight']),
            dt,
            layout.buildings
          );
        }

        for (const v of vehicles) {
          if (v.id === activeVehicleId) continue;
          const pursuit = v.isPolice && wantedStars > 0;
          const aiIn = computeAiVehicleInput(v, playerX, playerZ, pursuit);
          stepVehiclePhysics(v, aiIn, dt, layout.buildings);
        }

        for (let i = 0; i < vehicles.length; i++) {
          for (let j = i + 1; j < vehicles.length; j++) {
            const imp = resolveVehiclePairCollision(vehicles[i], vehicles[j]);
            if (imp > 5 && (vehicles[i].id === activeVehicleId || vehicles[j].id === activeVehicleId)) {
              if (crashedGrace <= 0) {
                soundFX.carCrash(Math.min(1, imp / 18));
                crashedGrace = 0.45;
              }
              if (vehicles[i].isPolice || vehicles[j].isPolice || imp > 13) {
                if (wantedStars < 4) wantedStars += 1;
                maxWantedSeen = Math.max(maxWantedSeen, wantedStars);
                wantedDecayTimer = 0;
              }
            }
          }
        }

        if (wantedStars > 0) {
          const nearestCop = vehicles
            .filter((v) => v.isPolice)
            .reduce((min, v) => Math.min(min, Math.hypot(v.x - playerX, v.z - playerZ)), 999);
          if (nearestCop > 80) {
            wantedDecayTimer += dt;
            if (wantedDecayTimer > 10) {
              wantedStars -= 1;
              wantedDecayTimer = 0;
            }
          } else {
            wantedDecayTimer = 0;
          }
        }

        mission.timeLeft -= dt;
        const activeTarget =
          mission.type === 'sprint'
            ? mission.checkpoints[mission.checkpointIdx] ?? mission.dropoff
            : mission.phase === 'to_pickup'
            ? mission.pickup
            : mission.dropoff;
        const distToTarget = Math.hypot(playerX - activeTarget.x, playerZ - activeTarget.z);

        if (distToTarget < 6.0) {
          if (mission.type === 'sprint') {
            if (mission.checkpointIdx < mission.checkpoints.length - 1) {
              mission.checkpointIdx += 1;
              mission.dropoff = mission.checkpoints[mission.checkpointIdx];
              soundFX.cashPickup();
              statusBanner = `Чекпоинт ${mission.checkpointIdx}/${mission.checkpoints.length}: ${mission.dropoff.name}`;
              bannerTimer = 2.8;
            } else {
              cash += mission.reward;
              soundFX.winFanfare();
              onRecordUpdate({ cashEarned: mission.reward, missionsCompleted: 1, maxWanted: maxWantedSeen });
              statusBanner = `Спринт завершён! +$${mission.reward}`;
              bannerTimer = 3.8;
              missionIdx += 1;
              mission = createNextMission(layout.missionSpots, playerX, playerZ, mission.completedCount + 1);
            }
          } else if (mission.phase === 'to_pickup') {
            mission.phase = 'to_dropoff';
            mission.timeLeft = Math.max(mission.timeLeft, 75);
            if (mission.type === 'heist') {
              wantedStars = Math.max(wantedStars, 2);
              maxWantedSeen = Math.max(maxWantedSeen, wantedStars);
            }
            soundFX.cashPickup();
            statusBanner = `Груз забран! Доставьте в: ${mission.dropoff.name}`;
            bannerTimer = 3.5;
          } else {
            cash += mission.reward;
            wantedStars = Math.max(0, wantedStars - 1);
            soundFX.winFanfare();
            onRecordUpdate({ cashEarned: mission.reward, missionsCompleted: 1, maxWanted: maxWantedSeen });
            statusBanner = `Контракт выполнен! +$${mission.reward}`;
            bannerTimer = 3.8;
            missionIdx += 1;
            mission = createNextMission(layout.missionSpots, playerX, playerZ, mission.completedCount + 1);
          }
        } else if (mission.timeLeft <= 0) {
          statusBanner = 'Время вышло — назначен новый контракт';
          bannerTimer = 3.0;
          missionIdx += 1;
          mission = createNextMission(layout.missionSpots, playerX, playerZ, mission.completedCount);
        }
      }

      for (const v of vehicles) {
        const vm = vehicleMeshes.get(v.id);
        if (!vm) continue;
        vm.group.position.set(v.x, 0, v.z);
        vm.group.rotation.y = v.heading;
        vm.bodyTilt.rotation.x = v.pitch;
        vm.bodyTilt.rotation.z = v.roll;

        for (const p of vm.frontSteerPivots) p.rotation.y = v.steerAngle;
        for (const w of vm.wheels) w.rotation.x = v.wheelSpin;

        const braking = v.id === activeVehicleId && (clampedThrottle < -0.1 || handbrake);
        for (const bl of vm.brakeLights) {
          (bl.material as THREE.MeshStandardMaterial).emissiveIntensity = braking ? 3.2 : 1.0;
        }

        if (v.isPolice && vm.sirenRed && vm.sirenBlue) {
          const activeSiren = wantedStars > 0;
          const phaseFlip = Math.floor(sirenClock * 8) % 2 === 0;
          (vm.sirenRed.material as THREE.MeshStandardMaterial).emissiveIntensity = activeSiren
            ? phaseFlip ? 3.8 : 0.2
            : 0.25;
          (vm.sirenBlue.material as THREE.MeshStandardMaterial).emissiveIntensity = activeSiren
            ? !phaseFlip ? 3.8 : 0.2
            : 0.25;
        }
      }

      if (!activeCar) {
        pedMesh.group.visible = true;
        pedMesh.group.position.set(ped.x, 0, ped.z);
        pedMesh.group.rotation.y = ped.heading;
        const moving = Math.hypot(ped.vx, ped.vz) > 0.5;
        const swing = moving ? Math.sin(ped.walkCycle) * 0.55 : 0;
        pedMesh.legL.rotation.x = swing;
        pedMesh.legR.rotation.x = -swing;
        pedMesh.armL.rotation.x = -swing * 0.8;
        pedMesh.armR.rotation.x = swing * 0.8;
      } else {
        pedMesh.group.visible = false;
      }

      const activeTarget =
        mission.type === 'sprint'
          ? mission.checkpoints[mission.checkpointIdx] ?? mission.dropoff
          : mission.phase === 'to_pickup'
          ? mission.pickup
          : mission.dropoff;
      beaconGroup.position.set(activeTarget.x, 0, activeTarget.z);
      const beaconColor = mission.phase === 'to_pickup' ? '#22d3ee' : '#f59e0b';
      (ringMesh.material as THREE.MeshBasicMaterial).color.set(beaconColor);
      (beamMesh.material as THREE.MeshBasicMaterial).color.set(beaconColor);
      ringMesh.scale.setScalar(1 + Math.sin(sirenClock * 4) * 0.1);

      if (phase === 'title') {
        const orbitAng = sirenClock * 0.22;
        camera.position.set(
          vehicles[0].x + Math.sin(orbitAng) * 10.5,
          3.9,
          vehicles[0].z + Math.cos(orbitAng) * 10.5
        );
        camera.lookAt(vehicles[0].x, 1.0, vehicles[0].z);
      } else {
        const camBackDist = activeCar ? (cameraMode === 0 ? 7.8 : cameraMode === 1 ? 12.2 : 0.4) : 5.2;
        const camHeight = activeCar ? (cameraMode === 0 ? 3.85 : cameraMode === 1 ? 5.2 : 1.55) : 2.7;
        const yawRef = activeCar ? activeCar.heading : cameraYaw + Math.PI;

        let desiredX = playerX - Math.sin(yawRef) * camBackDist;
        let desiredZ = playerZ - Math.cos(yawRef) * camBackDist;
        if (cameraMode === 2 && activeCar) {
          desiredX = playerX + Math.sin(yawRef) * 0.3;
          desiredZ = playerZ + Math.cos(yawRef) * 0.3;
        }

        const lerpF = cameraMode === 2 ? 0.55 : Math.min(1, dt * 7.5);
        smoothCamPos.x += (desiredX - smoothCamPos.x) * lerpF;
        smoothCamPos.y += (camHeight - smoothCamPos.y) * lerpF;
        smoothCamPos.z += (desiredZ - smoothCamPos.z) * lerpF;
        camera.position.copy(smoothCamPos);

        const lookFwd = cameraMode === 2 ? 12 : 4.5;
        smoothLookAt.set(
          playerX + Math.sin(yawRef) * lookFwd,
          activeCar ? 1.25 : 1.45,
          playerZ + Math.cos(yawRef) * lookFwd
        );
        camera.lookAt(smoothLookAt);

        const spd = activeCar ? Math.abs(activeCar.speed) : 0;
        const targetFov = 62 + Math.min(14, (spd / 42) * 14);
        if (Math.abs(camera.fov - targetFov) > 0.2) {
          camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 6);
          camera.updateProjectionMatrix();
        }
      }

      renderer.render(scene, camera);

      if (now - lastHudEmit > 110) {
        lastHudEmit = now;
        drawMinimap(playerX, playerZ, playerHeading, activeTarget.x, activeTarget.z);
        const nearAnyCar =
          !activeCar &&
          vehicles.some((v) => v.hp > 0 && Math.hypot(v.x - ped.x, v.z - ped.z) < 5.5);

        setHud({
          phase,
          speedKmh: activeCar ? Math.round(Math.abs(activeCar.speed) * 3.6) : 0,
          inVehicle: Boolean(activeCar),
          vehicleLabel: activeCar ? VEHICLE_NAMES[activeCar.kind] : 'Пешком',
          vehicleHp: activeCar ? activeCar.hp : 100,
          playerHp: ped.hp,
          cash,
          wantedStars,
          mission: { ...mission },
          missionDist: Math.round(Math.hypot(playerX - activeTarget.x, playerZ - activeTarget.z)),
          canEnterVehicle: nearAnyCar,
          cameraMode,
          statusBanner,
        });
      }

      cancelFrame = scheduleNextFrame(renderer, isSoftwareGl, tick);
    };

    cancelFrame = scheduleNextFrame(renderer, isSoftwareGl, tick);

    return () => {
      disposed = true;
      cancelFrame();
      ro.disconnect();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      disposeRenderer();
    };
  }, [onRecordUpdate]);

  const targetPoint =
    hud.mission.type === 'sprint'
      ? hud.mission.checkpoints[hud.mission.checkpointIdx] ?? hud.mission.dropoff
      : hud.mission.phase === 'to_pickup'
      ? hud.mission.pickup
      : hud.mission.dropoff;

  return (
    <div className="max-w-6xl mx-auto flex flex-col gap-3">
      <div className="relative w-full h-[540px] sm:h-[620px] rounded-2xl overflow-hidden border border-white/10 bg-[#0c111b] select-none">
        <canvas
          ref={canvasRef}
          className="w-full h-full block"
          aria-label="Мегаполис Drive 3D"
        />

        {/* HUD Top-Left */}
        {hud.phase === 'playing' && (
          <div className="absolute top-3 left-3 flex flex-col gap-2 pointer-events-none max-w-xs">
            <div className="bg-[#0b101b]/90 border border-white/12 rounded-xl px-3.5 py-2.5 text-xs">
              <div className="text-[11px] uppercase tracking-wider text-cyan-400 font-bold">
                {hud.mission.title}
              </div>
              <div className="text-sm font-semibold text-white mt-0.5">{targetPoint.name}</div>
              <div className="flex items-center gap-3 mt-1 text-slate-300 font-mono-num">
                <span>{hud.missionDist} м</span>
                <span aria-hidden="true">·</span>
                <span className={hud.mission.timeLeft < 15 ? 'text-rose-400 font-bold' : ''}>
                  {Math.max(0, Math.ceil(hud.mission.timeLeft))}с
                </span>
                <span aria-hidden="true">·</span>
                <span className="text-emerald-400">+${hud.mission.reward}</span>
              </div>
            </div>

            {hud.statusBanner && (
              <div className="bg-cyan-950/90 border border-cyan-400/40 rounded-lg px-3 py-1.5 text-xs font-medium text-cyan-100">
                {hud.statusBanner}
              </div>
            )}
          </div>
        )}

        {/* HUD Top-Right */}
        {hud.phase === 'playing' && (
          <div className="absolute top-3 right-3 flex flex-col items-end gap-2 pointer-events-none">
            <div className="bg-[#0b101b]/90 border border-white/12 rounded-xl px-3.5 py-2 text-right">
              <div className="font-mono-num text-xl font-bold text-emerald-400">
                ${hud.cash.toLocaleString('ru-RU')}
              </div>
              <div className="flex items-center justify-end gap-1 mt-0.5 text-sm">
                {[1, 2, 3, 4, 5].map((star) => (
                  <span
                    key={star}
                    className={star <= hud.wantedStars ? 'text-amber-400' : 'text-slate-700'}
                  >
                    ★
                  </span>
                ))}
              </div>
            </div>

            <div className="bg-[#0b101b]/90 border border-white/12 rounded-xl px-3.5 py-2 text-right">
              <div className="text-[11px] text-slate-400">{hud.vehicleLabel}</div>
              <div className="font-mono-num text-2xl font-bold text-white leading-none mt-0.5">
                {hud.speedKmh} <span className="text-xs text-slate-400 font-normal">км/ч</span>
              </div>
              {hud.inVehicle && (
                <div className="w-28 h-1.5 bg-slate-800 rounded-full overflow-hidden mt-2">
                  <div
                    className="h-full bg-cyan-400 transition-all"
                    style={{ width: `${Math.max(0, Math.min(100, hud.vehicleHp))}%` }}
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Corner Radar Minimap */}
        {hud.phase === 'playing' && (
          <div className="absolute bottom-3 left-3 pointer-events-none">
            <canvas
              ref={minimapRef}
              width={136}
              height={136}
              className="rounded-xl border-2 border-white/20 bg-[#0c111b] shadow-lg"
            />
          </div>
        )}

        {/* Action Buttons */}
        {hud.phase === 'playing' && (
          <div className="absolute bottom-3 right-3 flex flex-col items-end gap-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  actionTriggerRef.current.cycleMission = true;
                }}
                className="px-3 py-1.5 rounded-lg bg-[#0b101b]/90 hover:bg-[#192236] border border-white/15 text-xs font-semibold text-amber-300"
              >
                Миссия (M)
              </button>
              <button
                type="button"
                onClick={() => {
                  actionTriggerRef.current.cycleCam = true;
                }}
                className="px-3 py-1.5 rounded-lg bg-[#0b101b]/90 hover:bg-[#192236] border border-white/15 text-xs font-semibold text-slate-200"
              >
                Камера (C)
              </button>
              <button
                type="button"
                onClick={() => {
                  actionTriggerRef.current.toggleVehicle = true;
                }}
                className={`px-3 py-1.5 rounded-lg border text-xs font-semibold ${
                  hud.inVehicle || hud.canEnterVehicle
                    ? 'bg-cyan-500/90 text-slate-950 border-cyan-300'
                    : 'bg-[#0b101b]/80 text-slate-400 border-white/10'
                }`}
              >
                {hud.inVehicle ? 'Выйти (F)' : hud.canEnterVehicle ? 'Сесть (F)' : 'Авто (F)'}
              </button>
            </div>

            <div className="flex items-center gap-1.5 sm:hidden">
              <button
                type="button"
                onPointerDown={() => { touchCtrlRef.current.steer = 1; }}
                onPointerUp={() => { touchCtrlRef.current.steer = 0; }}
                onPointerLeave={() => { touchCtrlRef.current.steer = 0; }}
                className="w-11 h-11 rounded-lg bg-[#111827]/90 border border-white/15 text-white font-bold"
              >
                ◀
              </button>
              <button
                type="button"
                onPointerDown={() => { touchCtrlRef.current.steer = -1; }}
                onPointerUp={() => { touchCtrlRef.current.steer = 0; }}
                onPointerLeave={() => { touchCtrlRef.current.steer = 0; }}
                className="w-11 h-11 rounded-lg bg-[#111827]/90 border border-white/15 text-white font-bold"
              >
                ▶
              </button>
              <button
                type="button"
                onPointerDown={() => { touchCtrlRef.current.throttle = -1; }}
                onPointerUp={() => { touchCtrlRef.current.throttle = 0; }}
                onPointerLeave={() => { touchCtrlRef.current.throttle = 0; }}
                className="px-3 h-11 rounded-lg bg-rose-600/90 text-white text-xs font-bold"
              >
                Стоп
              </button>
              <button
                type="button"
                onPointerDown={() => { touchCtrlRef.current.throttle = 1; }}
                onPointerUp={() => { touchCtrlRef.current.throttle = 0; }}
                onPointerLeave={() => { touchCtrlRef.current.throttle = 0; }}
                className="px-4 h-11 rounded-lg bg-emerald-500/90 text-slate-950 text-xs font-bold"
              >
                Газ
              </button>
            </div>
          </div>
        )}

        {/* Title Overlay */}
        {hud.phase === 'title' && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#090d16]/75 p-6">
            <div className="max-w-md w-full bg-[#111726]/95 border border-white/12 rounded-2xl p-6 text-center flex flex-col gap-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-widest text-amber-400">
                  Расширенный 3D-мегаполис · 640×640 м
                </div>
                <h2 className="font-display text-2xl sm:text-3xl font-bold text-white mt-1">
                  Мегаполис Drive 3D
                </h2>
                <p className="text-xs sm:text-sm text-slate-300 mt-2 leading-relaxed">
                  Большой прибрежный город с небоскрёбами, парками, плотным трафиком,
                  физикой дрифта, сменой авто, погонями полиции и 3 типами контрактов.
                </p>
              </div>
              <div className="text-xs text-slate-400 flex flex-wrap justify-center gap-x-3 gap-y-1">
                <span>WASD — руль/газ</span>
                <span>·</span>
                <span>Space — дрифт</span>
                <span>·</span>
                <span>F — выйти/сесть</span>
                <span>·</span>
                <span>M — миссия</span>
              </div>
              <button
                type="button"
                data-start="true"
                onClick={handleStart}
                className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm transition-colors"
              >
                Выехать в город
              </button>
            </div>
          </div>
        )}

        {/* Wasted Overlay */}
        {hud.phase === 'wasted' && (
          <div className="absolute inset-0 flex items-center justify-center bg-rose-950/75 p-6">
            <div className="max-w-sm w-full bg-[#111622] border border-rose-500/40 rounded-2xl p-6 text-center flex flex-col gap-4">
              <h2 className="font-display text-2xl font-bold text-rose-400">Машина уничтожена</h2>
              <p className="text-xs text-slate-300">
                Выполнено контрактов: {hud.mission.completedCount} · Капитал: ${hud.cash}
              </p>
              <button
                type="button"
                onClick={handleRespawn}
                className="w-full py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-sm"
              >
                Новая машина
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 bg-[#111622] border border-white/8 rounded-xl text-xs text-slate-400">
        <span>WASD / Стрелки — руль · Space — дрифт · F — выйти/сесть в любое авто · M — смена миссии · C — камера</span>
        <span className="text-slate-300">3 типа контрактов: VIP-доставка, Спринт, Побег</span>
      </div>
    </div>
  );
};
