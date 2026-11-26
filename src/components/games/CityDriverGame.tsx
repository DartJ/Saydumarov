import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  BuildingBox,
  CITY_HALF_SIZE,
  MissionState,
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
  police: 'LSPD Interceptor',
};

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

  // Soft radial ground shadow
  const shadowGeo = new THREE.PlaneGeometry(3.1, 5.2);
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
    roughness: v.kind === 'sport' ? 0.28 : 0.36,
    metalness: 0.45,
  });
  const darkTrimMat = new THREE.MeshStandardMaterial({
    color: '#161a22',
    roughness: 0.72,
    metalness: 0.2,
  });
  const glassMat = new THREE.MeshStandardMaterial({
    color: '#0d1828',
    roughness: 0.14,
    metalness: 0.8,
  });
  const chromeMat = new THREE.MeshStandardMaterial({
    color: '#cfd6e0',
    roughness: 0.26,
    metalness: 0.88,
  });

  // Lower chassis
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.94, 0.56, 4.28), paintMat);
  chassis.position.y = 0.58;
  chassis.castShadow = true;
  chassis.receiveShadow = true;
  bodyTilt.add(chassis);

  // Police white doors accent
  if (v.isPolice) {
    const doorBand = new THREE.Mesh(
      new THREE.BoxGeometry(1.98, 0.42, 1.85),
      new THREE.MeshStandardMaterial({ color: '#f1f5f9', roughness: 0.32, metalness: 0.2 })
    );
    doorBand.position.set(0, 0.58, 0.1);
    bodyTilt.add(doorBand);
  }

  // Cabin greenhouse
  const cabinLen = v.kind === 'sport' ? 2.05 : 2.35;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.66, 0.5, cabinLen), paintMat);
  cabin.position.set(0, 1.06, -0.15);
  cabin.castShadow = true;
  bodyTilt.add(cabin);

  // Windshield & rear glass
  const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.4, cabinLen + 0.08), glassMat);
  windshield.position.set(0, 1.05, -0.15);
  bodyTilt.add(windshield);

  // Side windows
  const sideGlass = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.34, cabinLen - 0.35), glassMat);
  sideGlass.position.set(0, 1.05, -0.15);
  bodyTilt.add(sideGlass);

  // Front & rear bumpers
  const frontBumper = new THREE.Mesh(new THREE.BoxGeometry(1.98, 0.24, 0.22), darkTrimMat);
  frontBumper.position.set(0, 0.36, 2.15);
  bodyTilt.add(frontBumper);

  const rearBumper = new THREE.Mesh(new THREE.BoxGeometry(1.98, 0.24, 0.22), darkTrimMat);
  rearBumper.position.set(0, 0.36, -2.15);
  bodyTilt.add(rearBumper);

  // Headlights (+Z front)
  const headMat = new THREE.MeshStandardMaterial({
    color: '#fff6d6',
    emissive: '#ffe9a8',
    emissiveIntensity: 1.8,
    roughness: 0.2,
  });
  for (const sx of [-0.66, 0.66]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.16, 0.08), headMat);
    hl.position.set(sx, 0.62, 2.15);
    bodyTilt.add(hl);
  }

  // Taillights (-Z rear)
  const brakeLights: THREE.Mesh[] = [];
  for (const sx of [-0.66, 0.66]) {
    const tailMat = new THREE.MeshStandardMaterial({
      color: '#ef4444',
      emissive: '#b91c1c',
      emissiveIntensity: 1.2,
      roughness: 0.25,
    });
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.16, 0.08), tailMat);
    tl.position.set(sx, 0.64, -2.15);
    bodyTilt.add(tl);
    brakeLights.push(tl);
  }

  // Sport rear spoiler
  if (v.kind === 'sport') {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.08, 0.34), darkTrimMat);
    wing.position.set(0, 1.04, -1.96);
    bodyTilt.add(wing);
    for (const sx of [-0.62, 0.62]) {
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.22, 0.14), darkTrimMat);
      strut.position.set(sx, 0.92, -1.96);
      bodyTilt.add(strut);
    }
  }

  // Taxi roof beacon
  if (v.kind === 'taxi') {
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(0.65, 0.22, 0.32),
      new THREE.MeshStandardMaterial({
        color: '#fef08a',
        emissive: '#facc15',
        emissiveIntensity: 1.4,
      })
    );
    sign.position.set(0, 1.4, -0.05);
    bodyTilt.add(sign);
  }

  let sirenRed: THREE.Mesh | undefined;
  let sirenBlue: THREE.Mesh | undefined;
  if (v.isPolice) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.1, 0.28), darkTrimMat);
    bar.position.set(0, 1.35, -0.05);
    bodyTilt.add(bar);
    sirenRed = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.12, 0.26),
      new THREE.MeshStandardMaterial({
        color: '#ef4444',
        emissive: '#ef4444',
        emissiveIntensity: 0.3,
      })
    );
    sirenRed.position.set(-0.34, 1.42, -0.05);
    bodyTilt.add(sirenRed);

    sirenBlue = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.12, 0.26),
      new THREE.MeshStandardMaterial({
        color: '#3b82f6',
        emissive: '#3b82f6',
        emissiveIntensity: 0.3,
      })
    );
    sirenBlue.position.set(0.34, 1.42, -0.05);
    bodyTilt.add(sirenBlue);
  }

  // 4 composite wheels
  const wheels: THREE.Group[] = [];
  const frontSteerPivots: THREE.Group[] = [];
  const tireMat = new THREE.MeshStandardMaterial({ color: '#111318', roughness: 0.85 });
  const wheelCoords: [number, number, boolean][] = [
    [-0.95, 1.32, true],
    [0.95, 1.32, true],
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

    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.275, 10), chromeMat);
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

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.66, 0.28), jacketMat);
  torso.position.y = 1.12;
  torso.castShadow = true;
  group.add(torso);

  const chest = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.52, 0.3), shirtMat);
  chest.position.y = 1.1;
  group.add(chest);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 10), skinMat);
  head.position.y = 1.64;
  group.add(head);

  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.72, 0.22), pantsMat);
  legL.position.set(-0.14, 0.42, 0);
  group.add(legL);

  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.72, 0.22), pantsMat);
  legR.position.set(0.14, 0.42, 0);
  group.add(legR);

  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.56, 0.18), jacketMat);
  armL.position.set(-0.36, 1.12, 0);
  group.add(armL);

  const armR = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.56, 0.18), jacketMat);
  armR.position.set(0.36, 1.12, 0);
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
      phase: 'to_pickup',
      pickup: { x: -64, z: -64, name: 'Деловой центр' },
      dropoff: { x: 64, z: -64, name: 'Неоновый квартал' },
      reward: 650,
      timeLeft: 75,
      completedCount: 0,
    },
    missionDist: 90,
    canEnterVehicle: false,
    cameraMode: 0,
    statusBanner: null,
  }));

  // Control refs read inside simulation loop without React re-render overhead
  const keysRef = useRef<Record<string, boolean>>({});
  const touchCtrlRef = useRef({ throttle: 0, steer: 0, handbrake: false });
  const actionTriggerRef = useRef<{ toggleVehicle: boolean; cycleCam: boolean; startGame: boolean; resetGame: boolean }>({
    toggleVehicle: false,
    cycleCam: false,
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
    let mission = createNextMission(layout.missionSpots, vehicles[0].x, vehicles[0].z, 0);
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

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#1a2236');
    scene.fog = new THREE.FogExp2('#1d263d', 0.0048);

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

    const camera = new THREE.PerspectiveCamera(62, width / height, 0.5, 650);

    // Golden-hour + dusk city lighting
    const hemi = new THREE.HemisphereLight('#78a6e8', '#232838', 0.85);
    scene.add(hemi);

    const sun = new THREE.DirectionalLight('#ffb066', 2.25);
    sun.position.set(120, 95, 110);
    if (!isSoftwareGl) {
      sun.castShadow = true;
      sun.shadow.mapSize.set(1024, 1024);
      sun.shadow.camera.left = -90;
      sun.shadow.camera.right = 90;
      sun.shadow.camera.top = 90;
      sun.shadow.camera.bottom = -90;
    }
    scene.add(sun);

    // Sunset sky dome & horizon glow backdrop disc
    const skyDome = createSkyDome('#141c33', '#7a3e38', 420);
    scene.add(skyDome);

    const sunGlow = new THREE.Mesh(
      new THREE.CircleGeometry(36, 24),
      new THREE.MeshBasicMaterial({ color: '#ff9642', fog: false })
    );
    sunGlow.position.set(240, 62, 220);
    sunGlow.lookAt(0, 0, 0);
    scene.add(sunGlow);

    // Ocean perimeter around the coastal city island
    const waterMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1100, 1100),
      new THREE.MeshStandardMaterial({
        color: '#0c233b',
        roughness: 0.22,
        metalness: 0.65,
      })
    );
    waterMesh.rotation.x = -Math.PI / 2;
    waterMesh.position.y = -0.8;
    scene.add(waterMesh);

    // Asphalt island base
    const asphaltTex = makeAsphaltTexture(maxAniso);
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

    // Seawall rim
    const seawallMat = new THREE.MeshStandardMaterial({ color: '#475569', roughness: 0.8 });
    const wallLen = CITY_HALF_SIZE * 2 + 4;
    for (const [wx, wz, rx, rz] of [
      [0, CITY_HALF_SIZE + 1, wallLen, 2],
      [0, -CITY_HALF_SIZE - 1, wallLen, 2],
      [CITY_HALF_SIZE + 1, 0, 2, wallLen],
      [-CITY_HALF_SIZE - 1, 0, 2, wallLen],
    ] as [number, number, number, number][]) {
      const sw = new THREE.Mesh(new THREE.BoxGeometry(rx, 1.4, rz), seawallMat);
      sw.position.set(wx, 0.2, wz);
      scene.add(sw);
    }

    // Raised sidewalks & parks
    const sidewalkMat = new THREE.MeshStandardMaterial({ color: '#333b4a', roughness: 0.88 });
    const parkMat = new THREE.MeshStandardMaterial({ color: '#1f4d36', roughness: 0.92 });
    const sidewalkGeo = new THREE.BoxGeometry(1, 0.24, 1);

    for (const blk of layout.blocks) {
      const m = new THREE.Mesh(sidewalkGeo, blk.isPark ? parkMat : sidewalkMat);
      m.scale.set(blk.size, 1, blk.size);
      m.position.set(blk.cx, 0.12, blk.cz);
      m.receiveShadow = true;
      scene.add(m);
    }

    // Road lane dashes (InstancedMesh for crisp performance)
    const dashGeo = new THREE.PlaneGeometry(0.32, 4.2);
    const dashMat = new THREE.MeshBasicMaterial({ color: '#e2b642' });
    const dashTransforms: THREE.Matrix4[] = [];
    const tmpM = new THREE.Matrix4();
    const tmpQ = new THREE.Quaternion();
    const tmpV = new THREE.Vector3();
    const tmpS = new THREE.Vector3(1, 1, 1);

    for (const rc of layout.roadCoords) {
      for (let d = -CITY_HALF_SIZE + 10; d < CITY_HALF_SIZE - 10; d += 12) {
        // Skip intersections
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

    // Buildings with procedural lit facades (shared materials per palette)
    const facadeCache = new Map<string, THREE.MeshStandardMaterial>();
    const roofMat = new THREE.MeshStandardMaterial({ color: '#1b202b', roughness: 0.85 });
    const buildingGeo = new THREE.BoxGeometry(1, 1, 1);

    for (const b of layout.buildings) {
      const key = `${b.baseColor}_${b.litColor}`;
      let mat = facadeCache.get(key);
      if (!mat) {
        const tex = makeBuildingFacadeTexture(b.baseColor, b.litColor, maxAniso);
        tex.repeat.set(1, 2);
        mat = new THREE.MeshStandardMaterial({
          map: tex,
          roughness: b.style === 'glass' ? 0.25 : 0.72,
          metalness: b.style === 'glass' ? 0.55 : 0.15,
        });
        facadeCache.set(key, mat);
      }
      const mesh = new THREE.Mesh(buildingGeo, [mat, mat, roofMat, roofMat, mat, mat]);
      mesh.scale.set(b.width, b.height, b.depth);
      mesh.position.set(b.x, b.height / 2 + 0.24, b.z);
      mesh.castShadow = !isSoftwareGl;
      mesh.receiveShadow = true;
      scene.add(mesh);
    }

    // Palm trees (Instanced trunks + crowns)
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

    // Streetlamp poles + warm glowing bulbs
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

    // Mission beacon ring + beam
    const beaconGroup = new THREE.Group();
    const ringMesh = new THREE.Mesh(
      new THREE.RingGeometry(2.2, 2.8, 28),
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
      new THREE.CylinderGeometry(1.4, 2.2, 24, 16, 1, true),
      new THREE.MeshBasicMaterial({
        color: '#22d3ee',
        transparent: true,
        opacity: 0.16,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    beamMesh.position.y = 12;
    beaconGroup.add(ringMesh, beamMesh);
    scene.add(beaconGroup);

    // Vehicle meshes + pedestrian mesh
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

    // Resize observer
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

    // Keyboard listeners
    const onKeyDown = (e: KeyboardEvent) => {
      keysRef.current[e.code] = true;
      if (e.code === 'KeyF' && !e.repeat) {
        actionTriggerRef.current.toggleVehicle = true;
      }
      if (e.code === 'KeyC' && !e.repeat) {
        actionTriggerRef.current.cycleCam = true;
      }
      if (e.code === 'KeyH' && !e.repeat && phase === 'playing' && activeVehicleId) {
        soundFX.carHorn();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keysRef.current[e.code] = false;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    // Context lost guard
    const onContextLost = (e: Event) => {
      e.preventDefault();
    };
    canvas.addEventListener('webglcontextlost', onContextLost);

    const drawMinimap = (px: number, pz: number, heading: number, targetX: number, targetZ: number) => {
      const mm = minimapRef.current;
      if (!mm) return;
      const ctx = mm.getContext('2d');
      if (!ctx) return;
      const S = mm.width;
      const half = S / 2;
      const scale = 0.72;

      ctx.fillStyle = '#0c111b';
      ctx.fillRect(0, 0, S, S);

      // Roads
      ctx.fillStyle = '#242c3c';
      for (const rc of layout.roadCoords) {
        const rx = half + (rc - px) * scale;
        const rz = half + (rc - pz) * scale;
        ctx.fillRect(rx - 6, 0, 12, S);
        ctx.fillRect(0, rz - 6, S, 12);
      }

      // Buildings
      ctx.fillStyle = '#3c485e';
      for (const b of layout.buildings) {
        const bx = half + (b.x - px) * scale;
        const bz = half + (b.z - pz) * scale;
        if (bx < -20 || bx > S + 20 || bz < -20 || bz > S + 20) continue;
        ctx.fillRect(bx - (b.width * scale) / 2, bz - (b.depth * scale) / 2, b.width * scale, b.depth * scale);
      }

      // Police dots
      for (const v of vehicles) {
        if (!v.isPolice) continue;
        const vx = half + (v.x - px) * scale;
        const vz = half + (v.z - pz) * scale;
        ctx.fillStyle = wantedStars > 0 && Math.floor(sirenClock * 5) % 2 === 0 ? '#ef4444' : '#3b82f6';
        ctx.beginPath();
        ctx.arc(vx, vz, 3.2, 0, Math.PI * 2);
        ctx.fill();
      }

      // Mission beacon on edge or map
      const tx = half + (targetX - px) * scale;
      const tz = half + (targetZ - pz) * scale;
      const clampX = Math.max(7, Math.min(S - 7, tx));
      const clampZ = Math.max(7, Math.min(S - 7, tz));
      ctx.fillStyle = mission.phase === 'to_pickup' ? '#22d3ee' : '#f59e0b';
      ctx.beginPath();
      ctx.arc(clampX, clampZ, 4.5, 0, Math.PI * 2);
      ctx.fill();

      // Player triangle
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
        statusBanner = 'Подберите груз на точке и доставьте до цели';
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

      // Enter / Exit vehicle toggle
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
          // Find nearest vehicle within 5.5m
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

        // Step traffic & police AI
        for (const v of vehicles) {
          if (v.id === activeVehicleId) continue;
          const pursuit = v.isPolice && wantedStars > 0;
          const aiIn = computeAiVehicleInput(v, playerX, playerZ, pursuit);
          stepVehiclePhysics(v, aiIn, dt, layout.buildings);
        }

        // Vehicle-to-vehicle collisions
        for (let i = 0; i < vehicles.length; i++) {
          for (let j = i + 1; j < vehicles.length; j++) {
            const imp = resolveVehiclePairCollision(vehicles[i], vehicles[j]);
            if (imp > 5 && (vehicles[i].id === activeVehicleId || vehicles[j].id === activeVehicleId)) {
              if (crashedGrace <= 0) {
                soundFX.carCrash(Math.min(1, imp / 18));
                crashedGrace = 0.45;
              }
              if (vehicles[i].isPolice || vehicles[j].isPolice || imp > 13) {
                if (wantedStars < 3) wantedStars += 1;
                maxWantedSeen = Math.max(maxWantedSeen, wantedStars);
                wantedDecayTimer = 0;
              }
            }
          }
        }

        // Wanted stars decay when far from police
        if (wantedStars > 0) {
          const nearestCop = vehicles
            .filter((v) => v.isPolice)
            .reduce((min, v) => Math.min(min, Math.hypot(v.x - playerX, v.z - playerZ)), 999);
          if (nearestCop > 70) {
            wantedDecayTimer += dt;
            if (wantedDecayTimer > 10) {
              wantedStars -= 1;
              wantedDecayTimer = 0;
            }
          } else {
            wantedDecayTimer = 0;
          }
        }

        // Mission progression
        mission.timeLeft -= dt;
        const target = mission.phase === 'to_pickup' ? mission.pickup : mission.dropoff;
        const distToTarget = Math.hypot(playerX - target.x, playerZ - target.z);
        if (distToTarget < 5.5) {
          if (mission.phase === 'to_pickup') {
            mission.phase = 'to_dropoff';
            mission.timeLeft = Math.max(mission.timeLeft, 65);
            soundFX.cashPickup();
            statusBanner = `Груз забран! Доставьте в: ${mission.dropoff.name}`;
            bannerTimer = 3.5;
          } else {
            cash += mission.reward;
            wantedStars = Math.max(0, wantedStars - 1);
            soundFX.winFanfare();
            onRecordUpdate({
              cashEarned: mission.reward,
              missionsCompleted: 1,
              maxWanted: maxWantedSeen,
            });
            statusBanner = `Контракт выполнен! +$${mission.reward}`;
            bannerTimer = 3.8;
            mission = createNextMission(
              layout.missionSpots,
              playerX,
              playerZ,
              mission.completedCount + 1
            );
          }
        } else if (mission.timeLeft <= 0) {
          statusBanner = 'Время вышло — назначен новый контракт';
          bannerTimer = 3.0;
          mission = createNextMission(
            layout.missionSpots,
            playerX,
            playerZ,
            mission.completedCount
          );
        }
      }

      // Sync vehicle meshes
      for (const v of vehicles) {
        const vm = vehicleMeshes.get(v.id);
        if (!vm) continue;
        vm.group.position.set(v.x, 0, v.z);
        vm.group.rotation.y = v.heading;
        vm.bodyTilt.rotation.x = v.pitch;
        vm.bodyTilt.rotation.z = v.roll;

        for (const p of vm.frontSteerPivots) {
          p.rotation.y = v.steerAngle;
        }
        for (const w of vm.wheels) {
          w.rotation.x = v.wheelSpin;
        }

        const braking = v.id === activeVehicleId && (clampedThrottle < -0.1 || handbrake);
        for (const bl of vm.brakeLights) {
          (bl.material as THREE.MeshStandardMaterial).emissiveIntensity = braking ? 3.2 : 1.0;
        }

        if (v.isPolice && vm.sirenRed && vm.sirenBlue) {
          const activeSiren = wantedStars > 0;
          const phaseFlip = Math.floor(sirenClock * 8) % 2 === 0;
          (vm.sirenRed.material as THREE.MeshStandardMaterial).emissiveIntensity = activeSiren
            ? phaseFlip
              ? 3.8
              : 0.2
            : 0.25;
          (vm.sirenBlue.material as THREE.MeshStandardMaterial).emissiveIntensity = activeSiren
            ? !phaseFlip
              ? 3.8
              : 0.2
            : 0.25;
        }
      }

      // Sync pedestrian mesh
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

      // Sync mission beacon
      const activeTarget = mission.phase === 'to_pickup' ? mission.pickup : mission.dropoff;
      beaconGroup.position.set(activeTarget.x, 0, activeTarget.z);
      const beaconColor = mission.phase === 'to_pickup' ? '#22d3ee' : '#f59e0b';
      (ringMesh.material as THREE.MeshBasicMaterial).color.set(beaconColor);
      (beamMesh.material as THREE.MeshBasicMaterial).color.set(beaconColor);
      ringMesh.scale.setScalar(1 + Math.sin(sirenClock * 4) * 0.1);

      // Update chase camera
      if (phase === 'title') {
        const orbitAng = sirenClock * 0.22;
        camera.position.set(
          vehicles[0].x + Math.sin(orbitAng) * 11,
          4.4,
          vehicles[0].z + Math.cos(orbitAng) * 11
        );
        camera.lookAt(vehicles[0].x, 1.1, vehicles[0].z);
      } else {
        const camBackDist = activeCar ? (cameraMode === 0 ? 8.2 : cameraMode === 1 ? 12.2 : 0.4) : 5.2;
        const camHeight = activeCar ? (cameraMode === 0 ? 3.5 : cameraMode === 1 ? 5.2 : 1.55) : 2.7;
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
        const targetFov = 62 + Math.min(14, (spd / 38) * 14);
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

  const targetPoint = hud.mission.phase === 'to_pickup' ? hud.mission.pickup : hud.mission.dropoff;

  return (
    <div className="max-w-6xl mx-auto flex flex-col gap-3">
      <div className="relative w-full h-[540px] sm:h-[620px] rounded-2xl overflow-hidden border border-white/10 bg-[#0c111b] select-none">
        <canvas
          ref={canvasRef}
          className="w-full h-full block"
          aria-label="Мегаполис Drive 3D"
        />

        {/* HUD Top-Left: Mission & Status */}
        {hud.phase === 'playing' && (
          <div className="absolute top-3 left-3 flex flex-col gap-2 pointer-events-none max-w-xs">
            <div className="bg-[#0b101b]/90 border border-white/12 rounded-xl px-3.5 py-2.5 text-xs">
              <div className="text-[11px] uppercase tracking-wider text-cyan-400 font-bold">
                {hud.mission.phase === 'to_pickup' ? 'Контракт · Подбор' : 'Контракт · Доставка'}
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

        {/* HUD Top-Right: Cash, Wanted Stars & Speed */}
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
                    className={
                      star <= hud.wantedStars
                        ? 'text-amber-400'
                        : 'text-slate-700'
                    }
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

        {/* HUD Bottom-Left: Corner Radar Minimap */}
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

        {/* HUD Bottom-Right: Interactive Action & Touch Controls */}
        {hud.phase === 'playing' && (
          <div className="absolute bottom-3 right-3 flex flex-col items-end gap-2">
            <div className="flex items-center gap-2">
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

            {/* Compact Touch Pad for Mobile / Pointer Driving */}
            <div className="flex items-center gap-1.5 sm:hidden">
              <button
                type="button"
                onPointerDown={() => {
                  touchCtrlRef.current.steer = 1;
                }}
                onPointerUp={() => {
                  touchCtrlRef.current.steer = 0;
                }}
                onPointerLeave={() => {
                  touchCtrlRef.current.steer = 0;
                }}
                className="w-11 h-11 rounded-lg bg-[#111827]/90 border border-white/15 text-white font-bold"
              >
                ◀
              </button>
              <button
                type="button"
                onPointerDown={() => {
                  touchCtrlRef.current.steer = -1;
                }}
                onPointerUp={() => {
                  touchCtrlRef.current.steer = 0;
                }}
                onPointerLeave={() => {
                  touchCtrlRef.current.steer = 0;
                }}
                className="w-11 h-11 rounded-lg bg-[#111827]/90 border border-white/15 text-white font-bold"
              >
                ▶
              </button>
              <button
                type="button"
                onPointerDown={() => {
                  touchCtrlRef.current.throttle = -1;
                }}
                onPointerUp={() => {
                  touchCtrlRef.current.throttle = 0;
                }}
                onPointerLeave={() => {
                  touchCtrlRef.current.throttle = 0;
                }}
                className="px-3 h-11 rounded-lg bg-rose-600/90 text-white text-xs font-bold"
              >
                Стоп
              </button>
              <button
                type="button"
                onPointerDown={() => {
                  touchCtrlRef.current.throttle = 1;
                }}
                onPointerUp={() => {
                  touchCtrlRef.current.throttle = 0;
                }}
                onPointerLeave={() => {
                  touchCtrlRef.current.throttle = 0;
                }}
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
                  Открытый 3D-город · WebGL
                </div>
                <h2 className="font-display text-2xl sm:text-3xl font-bold text-white mt-1">
                  Мегаполис Drive 3D
                </h2>
                <p className="text-xs sm:text-sm text-slate-300 mt-2 leading-relaxed">
                  Свободная езда по ночному прибрежному мегаполису, дрифт с ручником,
                  угон транспорта, уход от полицейской погони и скоростные контракты.
                </p>
              </div>
              <div className="text-xs text-slate-400 flex flex-wrap justify-center gap-x-3 gap-y-1">
                <span>WASD — руль/газ</span>
                <span>·</span>
                <span>Space — дрифт</span>
                <span>·</span>
                <span>F — выйти/сесть</span>
                <span>·</span>
                <span>C — камера</span>
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

      {/* Bottom Legend Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 bg-[#111622] border border-white/8 rounded-xl text-xs text-slate-400">
        <span>Управление: WASD / Стрелки — движение · Space — ручной тормоз/дрифт · F — выйти/сесть в любое авто · H — сигнал</span>
        <span className="text-slate-300">Цель: доезжайте до голубых и золотых маяков на радаре</span>
      </div>
    </div>
  );
};
