export const CITY_HALF_SIZE = 320;
export const ROAD_STEP = 64; // 9 grid road centers: -256..+256
export const ROAD_WIDTH = 16;

export type VehicleKind = 'sport' | 'muscle' | 'taxi' | 'sedan' | 'suv' | 'police';
export type BuildingShape = 'stepped' | 'cylinder' | 'spire' | 'modern';

export interface BuildingBox {
  id: string;
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number;
  shape: BuildingShape;
  style: 'glass' | 'concrete' | 'brick' | 'tower';
  baseColor: string;
  litColor: string;
}

export interface CityBlock {
  cx: number;
  cz: number;
  size: number;
  isPark: boolean;
  hasFountain?: boolean;
}

export interface CityLayout {
  buildings: BuildingBox[];
  blocks: CityBlock[];
  roadCoords: number[];
  missionSpots: { x: number; z: number; name: string }[];
  palmPositions: { x: number; z: number }[];
  lampPositions: { x: number; z: number; rotY: number }[];
}

export interface VehicleState {
  id: string;
  kind: VehicleKind;
  color: string;
  x: number;
  z: number;
  heading: number; // radians, 0 = +Z forward
  vx: number;
  vz: number;
  speed: number;
  steerAngle: number;
  wheelSpin: number;
  pitch: number;
  roll: number;
  hp: number;
  maxHp: number;
  radius: number;
  isPolice: boolean;
  aiLaneAxis?: 'x' | 'z';
  aiLaneDir?: 1 | -1;
  aiLaneCoord?: number;
}

export interface PedestrianState {
  x: number;
  z: number;
  heading: number;
  vx: number;
  vz: number;
  walkCycle: number;
  hp: number;
}

export interface VehicleInput {
  throttle: number; // -1..1
  steer: number; // -1..1 (+1 left, -1 right)
  handbrake: boolean;
}

export type MissionType = 'delivery' | 'sprint' | 'heist';

export interface MissionState {
  type: MissionType;
  title: string;
  phase: 'to_pickup' | 'to_dropoff';
  checkpoints: { x: number; z: number; name: string }[];
  checkpointIdx: number;
  pickup: { x: number; z: number; name: string };
  dropoff: { x: number; z: number; name: string };
  reward: number;
  timeLeft: number;
  completedCount: number;
}

export function generateCityLayout(): CityLayout {
  const roadCoords = [-256, -192, -128, -64, 0, 64, 128, 192, 256];
  const blockCenters = [-288, -224, -160, -96, -32, 32, 96, 160, 224, 288];
  const blockSize = ROAD_STEP - ROAD_WIDTH; // 48m city blocks

  const buildings: BuildingBox[] = [];
  const blocks: CityBlock[] = [];
  const palmPositions: { x: number; z: number }[] = [];
  const lampPositions: { x: number; z: number; rotY: number }[] = [];

  const palettes: Array<{
    style: BuildingBox['style'];
    baseColor: string;
    litColor: string;
  }> = [
    { style: 'glass', baseColor: '#19293e', litColor: '#6ad2f5' },
    { style: 'tower', baseColor: '#222836', litColor: '#ffd480' },
    { style: 'concrete', baseColor: '#343a46', litColor: '#ffe09e' },
    { style: 'brick', baseColor: '#4c322d', litColor: '#ffbe6b' },
  ];

  const shapes: BuildingShape[] = ['stepped', 'cylinder', 'spire', 'modern'];

  let bIdx = 0;
  for (let bx = 0; bx < blockCenters.length; bx++) {
    for (let bz = 0; bz < blockCenters.length; bz++) {
      const cx = blockCenters[bx];
      const cz = blockCenters[bz];

      const isPark =
        (cx === -32 && cz === 32) ||
        (cx === 96 && cz === -32) ||
        (cx === -160 && cz === -96) ||
        (cx === 160 && cz === 160);
      const hasFountain = cx === -32 && cz === 32;
      blocks.push({ cx, cz, size: blockSize, isPark, hasFountain });

      if (isPark) {
        palmPositions.push(
          { x: cx - 15, z: cz - 15 },
          { x: cx + 15, z: cz - 15 },
          { x: cx - 15, z: cz + 15 },
          { x: cx + 15, z: cz + 15 }
        );
        continue;
      }

      const subOffsets = [
        [-10.5, -10.5],
        [10.5, -10.5],
        [-10.5, 10.5],
        [10.5, 10.5],
      ];
      for (let s = 0; s < subOffsets.length; s++) {
        const hash = (bx * 23 + bz * 41 + s * 17) % 100;
        if (hash < 16) continue;

        const pal = palettes[(bx + bz + s) % palettes.length];
        const shape = shapes[(bx * 3 + bz + s) % shapes.length];
        const distCenter = Math.hypot(cx, cz);
        const downtownFactor = Math.max(0.35, 1.45 - distCenter / 310);
        const height = Math.round((16 + (hash % 38)) * downtownFactor);
        const w = 14 + (hash % 5);
        const d = 14 + ((hash * 3) % 5);

        buildings.push({
          id: `b_${bIdx++}`,
          x: cx + subOffsets[s][0],
          z: cz + subOffsets[s][1],
          width: w,
          depth: d,
          height,
          shape,
          style: pal.style,
          baseColor: pal.baseColor,
          litColor: pal.litColor,
        });
      }
    }
  }

  // Coastal boardwalk palms
  for (let p = -280; p <= 280; p += 56) {
    palmPositions.push({ x: p, z: CITY_HALF_SIZE - 4 });
    palmPositions.push({ x: p, z: -CITY_HALF_SIZE + 4 });
  }

  // Streetlamps along avenues
  for (const rc of roadCoords) {
    for (let pos = -256; pos <= 256; pos += 128) {
      lampPositions.push({ x: rc - 9.2, z: pos + 16, rotY: Math.PI / 2 });
      lampPositions.push({ x: rc + 9.2, z: pos - 16, rotY: -Math.PI / 2 });
    }
  }

  const missionSpots = [
    { x: -64, z: -64, name: 'Деловой центр' },
    { x: 64, z: -64, name: 'Неоновый квартал' },
    { x: 0, z: 64, name: 'Южная набережная' },
    { x: -128, z: 64, name: 'Промзона Доки' },
    { x: 128, z: 64, name: 'Бульвар Пальм' },
    { x: 0, z: -128, name: 'Северный вокзал' },
    { x: -128, z: -128, name: 'Технопарк' },
    { x: 128, z: -128, name: 'Аэропорт-Сити' },
    { x: -192, z: 0, name: 'Западный проспект' },
    { x: 192, z: 0, name: 'Восточный терминал' },
    { x: 0, z: -256, name: 'Северный пирс' },
    { x: 0, z: 256, name: 'Маяк Дель-Мар' },
    { x: -256, z: -192, name: 'Заводской квартал' },
    { x: 256, z: -192, name: 'Бизнес-Сити' },
    { x: -256, z: 192, name: 'Портовый док' },
    { x: 256, z: 192, name: 'Пляж Вайнвуд' },
  ];

  return { buildings, blocks, roadCoords, missionSpots, palmPositions, lampPositions };
}

export function createInitialVehicles(): VehicleState[] {
  return [
    {
      id: 'player_sport',
      kind: 'sport',
      color: '#e11d48',
      x: 3.6,
      z: 18,
      heading: Math.PI,
      vx: 0,
      vz: 0,
      speed: 0,
      steerAngle: 0,
      wheelSpin: 0,
      pitch: 0,
      roll: 0,
      hp: 100,
      maxHp: 100,
      radius: 2.05,
      isPolice: false,
    },
    {
      id: 'parked_muscle',
      kind: 'muscle',
      color: '#f59e0b',
      x: -60.5,
      z: 24,
      heading: 0,
      vx: 0,
      vz: 0,
      speed: 0,
      steerAngle: 0,
      wheelSpin: 0,
      pitch: 0,
      roll: 0,
      hp: 100,
      maxHp: 100,
      radius: 2.1,
      isPolice: false,
    },
    {
      id: 'parked_suv',
      kind: 'suv',
      color: '#e2e8f0',
      x: 60.2,
      z: -24,
      heading: Math.PI / 2,
      vx: 0,
      vz: 0,
      speed: 0,
      steerAngle: 0,
      wheelSpin: 0,
      pitch: 0,
      roll: 0,
      hp: 120,
      maxHp: 120,
      radius: 2.15,
      isPolice: false,
    },
    // Active Traffic across expanded avenues
    {
      id: 'traffic_taxi_1',
      kind: 'taxi',
      color: '#eab308',
      x: -3.8,
      z: -42,
      heading: 0,
      vx: 0,
      vz: 11,
      speed: 11,
      steerAngle: 0,
      wheelSpin: 0,
      pitch: 0,
      roll: 0,
      hp: 100,
      maxHp: 100,
      radius: 2.0,
      isPolice: false,
      aiLaneAxis: 'z',
      aiLaneDir: 1,
      aiLaneCoord: -3.8,
    },
    {
      id: 'traffic_taxi_2',
      kind: 'taxi',
      color: '#eab308',
      x: 131.8,
      z: 80,
      heading: Math.PI,
      vx: 0,
      vz: -11,
      speed: 11,
      steerAngle: 0,
      wheelSpin: 0,
      pitch: 0,
      roll: 0,
      hp: 100,
      maxHp: 100,
      radius: 2.0,
      isPolice: false,
      aiLaneAxis: 'z',
      aiLaneDir: -1,
      aiLaneCoord: 131.8,
    },
    {
      id: 'traffic_sedan_1',
      kind: 'sedan',
      color: '#38bdf8',
      x: 42,
      z: 60.2,
      heading: -Math.PI / 2,
      vx: -11,
      vz: 0,
      speed: 11,
      steerAngle: 0,
      wheelSpin: 0,
      pitch: 0,
      roll: 0,
      hp: 100,
      maxHp: 100,
      radius: 2.0,
      isPolice: false,
      aiLaneAxis: 'x',
      aiLaneDir: -1,
      aiLaneCoord: 60.2,
    },
    {
      id: 'traffic_sedan_2',
      kind: 'sedan',
      color: '#10b981',
      x: 67.8,
      z: -90,
      heading: 0,
      vx: 0,
      vz: 10,
      speed: 10,
      steerAngle: 0,
      wheelSpin: 0,
      pitch: 0,
      roll: 0,
      hp: 100,
      maxHp: 100,
      radius: 2.0,
      isPolice: false,
      aiLaneAxis: 'z',
      aiLaneDir: 1,
      aiLaneCoord: 67.8,
    },
    {
      id: 'traffic_sport_1',
      kind: 'sport',
      color: '#a855f7',
      x: -110,
      z: 3.8,
      heading: Math.PI / 2,
      vx: 14,
      vz: 0,
      speed: 14,
      steerAngle: 0,
      wheelSpin: 0,
      pitch: 0,
      roll: 0,
      hp: 100,
      maxHp: 100,
      radius: 2.05,
      isPolice: false,
      aiLaneAxis: 'x',
      aiLaneDir: 1,
      aiLaneCoord: 3.8,
    },
    {
      id: 'traffic_muscle_1',
      kind: 'muscle',
      color: '#fb923c',
      x: -131.8,
      z: -130,
      heading: 0,
      vx: 0,
      vz: 12,
      speed: 12,
      steerAngle: 0,
      wheelSpin: 0,
      pitch: 0,
      roll: 0,
      hp: 110,
      maxHp: 110,
      radius: 2.1,
      isPolice: false,
      aiLaneAxis: 'z',
      aiLaneDir: 1,
      aiLaneCoord: -131.8,
    },
    {
      id: 'traffic_suv_1',
      kind: 'suv',
      color: '#64748b',
      x: 150,
      z: -124.2,
      heading: -Math.PI / 2,
      vx: -10,
      vz: 0,
      speed: 10,
      steerAngle: 0,
      wheelSpin: 0,
      pitch: 0,
      roll: 0,
      hp: 120,
      maxHp: 120,
      radius: 2.15,
      isPolice: false,
      aiLaneAxis: 'x',
      aiLaneDir: -1,
      aiLaneCoord: -124.2,
    },
    {
      id: 'traffic_sedan_3',
      kind: 'sedan',
      color: '#f43f5e',
      x: -67.8,
      z: 140,
      heading: Math.PI,
      vx: 0,
      vz: -11,
      speed: 11,
      steerAngle: 0,
      wheelSpin: 0,
      pitch: 0,
      roll: 0,
      hp: 100,
      maxHp: 100,
      radius: 2.0,
      isPolice: false,
      aiLaneAxis: 'z',
      aiLaneDir: -1,
      aiLaneCoord: -67.8,
    },
    {
      id: 'traffic_taxi_3',
      kind: 'taxi',
      color: '#eab308',
      x: 40,
      z: 195.8,
      heading: Math.PI / 2,
      vx: 11,
      vz: 0,
      speed: 11,
      steerAngle: 0,
      wheelSpin: 0,
      pitch: 0,
      roll: 0,
      hp: 100,
      maxHp: 100,
      radius: 2.0,
      isPolice: false,
      aiLaneAxis: 'x',
      aiLaneDir: 1,
      aiLaneCoord: 195.8,
    },
    {
      id: 'traffic_suv_2',
      kind: 'suv',
      color: '#14b8a6',
      x: -195.8,
      z: 60,
      heading: 0,
      vx: 0,
      vz: 10,
      speed: 10,
      steerAngle: 0,
      wheelSpin: 0,
      pitch: 0,
      roll: 0,
      hp: 120,
      maxHp: 120,
      radius: 2.15,
      isPolice: false,
      aiLaneAxis: 'z',
      aiLaneDir: 1,
      aiLaneCoord: -195.8,
    },
    // Police Patrols
    {
      id: 'police_1',
      kind: 'police',
      color: '#1e293b',
      x: 3.8,
      z: -110,
      heading: 0,
      vx: 0,
      vz: 12,
      speed: 12,
      steerAngle: 0,
      wheelSpin: 0,
      pitch: 0,
      roll: 0,
      hp: 130,
      maxHp: 130,
      radius: 2.05,
      isPolice: true,
      aiLaneAxis: 'z',
      aiLaneDir: 1,
      aiLaneCoord: 3.8,
    },
    {
      id: 'police_2',
      kind: 'police',
      color: '#1e293b',
      x: -90,
      z: -60.2,
      heading: Math.PI / 2,
      vx: 12,
      vz: 0,
      speed: 12,
      steerAngle: 0,
      wheelSpin: 0,
      pitch: 0,
      roll: 0,
      hp: 130,
      maxHp: 130,
      radius: 2.05,
      isPolice: true,
      aiLaneAxis: 'x',
      aiLaneDir: 1,
      aiLaneCoord: -60.2,
    },
    {
      id: 'police_3',
      kind: 'police',
      color: '#1e293b',
      x: 195.8,
      z: -50,
      heading: Math.PI,
      vx: 0,
      vz: -12,
      speed: 12,
      steerAngle: 0,
      wheelSpin: 0,
      pitch: 0,
      roll: 0,
      hp: 130,
      maxHp: 130,
      radius: 2.05,
      isPolice: true,
      aiLaneAxis: 'z',
      aiLaneDir: -1,
      aiLaneCoord: 195.8,
    },
  ];
}

const VEHICLE_SPECS: Record<
  VehicleKind,
  { maxFwd: number; maxRev: number; accel: number; brake: number; grip: number; turnRate: number }
> = {
  sport: { maxFwd: 42, maxRev: 13, accel: 24, brake: 36, grip: 8.2, turnRate: 2.45 },
  muscle: { maxFwd: 37, maxRev: 11, accel: 21, brake: 31, grip: 6.3, turnRate: 2.25 },
  police: { maxFwd: 41, maxRev: 13, accel: 24, brake: 36, grip: 8.6, turnRate: 2.5 },
  suv: { maxFwd: 33, maxRev: 11, accel: 17, brake: 29, grip: 7.4, turnRate: 2.05 },
  taxi: { maxFwd: 30, maxRev: 10, accel: 16, brake: 28, grip: 7.5, turnRate: 2.15 },
  sedan: { maxFwd: 32, maxRev: 10, accel: 17, brake: 28, grip: 7.8, turnRate: 2.2 },
};

export function resolveCircleBuildings(
  x: number,
  z: number,
  radius: number,
  buildings: BuildingBox[]
): { x: number; z: number; hitImpact: number } {
  let nx = x;
  let nz = z;
  let hitImpact = 0;

  const limit = CITY_HALF_SIZE - radius - 1.5;
  if (nx < -limit) {
    nx = -limit;
    hitImpact = Math.max(hitImpact, 1);
  } else if (nx > limit) {
    nx = limit;
    hitImpact = Math.max(hitImpact, 1);
  }
  if (nz < -limit) {
    nz = -limit;
    hitImpact = Math.max(hitImpact, 1);
  } else if (nz > limit) {
    nz = limit;
    hitImpact = Math.max(hitImpact, 1);
  }

  for (let i = 0; i < buildings.length; i++) {
    const b = buildings[i];
    const halfW = b.width * 0.5;
    const halfD = b.depth * 0.5;
    const closestX = Math.max(b.x - halfW, Math.min(nx, b.x + halfW));
    const closestZ = Math.max(b.z - halfD, Math.min(nz, b.z + halfD));
    const dx = nx - closestX;
    const dz = nz - closestZ;
    const distSq = dx * dx + dz * dz;

    if (distSq < radius * radius) {
      const dist = Math.sqrt(distSq);
      if (dist > 0.0001) {
        const overlap = radius - dist;
        nx += (dx / dist) * overlap;
        nz += (dz / dist) * overlap;
      } else {
        const penX = halfW + radius - Math.abs(nx - b.x);
        const penZ = halfD + radius - Math.abs(nz - b.z);
        if (penX < penZ) {
          nx += nx >= b.x ? penX : -penX;
        } else {
          nz += nz >= b.z ? penZ : -penZ;
        }
      }
      hitImpact = 1;
    }
  }

  return { x: nx, z: nz, hitImpact };
}

export function stepVehiclePhysics(
  v: VehicleState,
  input: VehicleInput,
  dt: number,
  buildings: BuildingBox[]
): { crashedSpeed: number; isDrifting: boolean } {
  const spec = VEHICLE_SPECS[v.kind];
  const prevFwdX = Math.sin(v.heading);
  const prevFwdZ = Math.cos(v.heading);
  const prevForwardVel = v.vx * prevFwdX + v.vz * prevFwdZ;

  const targetSteer = input.steer * 0.65;
  v.steerAngle += (targetSteer - v.steerAngle) * Math.min(1, dt * 10);

  const speedRatio = Math.min(1, Math.abs(prevForwardVel) / 6.0);
  const steerSign = prevForwardVel >= -0.2 ? 1 : -1;
  const handbrakeTurnBoost = input.handbrake ? 1.45 : 1.0;
  v.heading +=
    input.steer * spec.turnRate * handbrakeTurnBoost * speedRatio * steerSign * dt;

  const nFwdX = Math.sin(v.heading);
  const nFwdZ = Math.cos(v.heading);
  const nRightX = Math.cos(v.heading);
  const nRightZ = -Math.sin(v.heading);

  let forwardVel = v.vx * nFwdX + v.vz * nFwdZ;
  let lateralVel = v.vx * nRightX + v.vz * nRightZ;

  if (input.throttle > 0.05) {
    if (forwardVel < -0.5) {
      forwardVel += spec.brake * dt;
    } else {
      forwardVel += spec.accel * input.throttle * dt;
    }
  } else if (input.throttle < -0.05) {
    if (forwardVel > 0.5) {
      forwardVel -= spec.brake * Math.abs(input.throttle) * dt;
    } else {
      forwardVel += spec.accel * 0.65 * input.throttle * dt;
    }
  } else {
    forwardVel *= Math.exp(-1.15 * dt);
  }

  if (input.handbrake) {
    forwardVel *= Math.exp(-2.1 * dt);
  }

  forwardVel = Math.max(-spec.maxRev, Math.min(spec.maxFwd, forwardVel));

  const lateralDamp = input.handbrake ? 1.75 : spec.grip;
  lateralVel *= Math.exp(-lateralDamp * dt);

  v.vx = nFwdX * forwardVel + nRightX * lateralVel;
  v.vz = nFwdZ * forwardVel + nRightZ * lateralVel;

  const prevSpeed = Math.hypot(v.vx, v.vz);
  const nextX = v.x + v.vx * dt;
  const nextZ = v.z + v.vz * dt;

  const res = resolveCircleBuildings(nextX, nextZ, v.radius, buildings);
  let crashedSpeed = 0;
  if (res.hitImpact > 0) {
    const pushX = res.x - nextX;
    const pushZ = res.z - nextZ;
    const pushLen = Math.hypot(pushX, pushZ);
    if (pushLen > 0.0001) {
      const nx = pushX / pushLen;
      const nz = pushZ / pushLen;
      const vn = v.vx * nx + v.vz * nz;
      if (vn < 0) {
        crashedSpeed = Math.abs(vn);
        v.vx -= 1.25 * vn * nx;
        v.vz -= 1.25 * vn * nz;
        v.vx *= 0.65;
        v.vz *= 0.65;
      }
    } else {
      crashedSpeed = prevSpeed;
      v.vx *= -0.3;
      v.vz *= -0.3;
    }
  }

  v.x = res.x;
  v.z = res.z;
  v.speed = v.vx * nFwdX + v.vz * nFwdZ;
  v.wheelSpin += v.speed * dt * 2.4;

  const targetPitch = -input.throttle * 0.032 + (crashedSpeed > 4 ? 0.05 : 0);
  const targetRoll = -input.steer * Math.min(1, Math.abs(v.speed) / 18) * 0.065;
  v.pitch += (targetPitch - v.pitch) * Math.min(1, dt * 8);
  v.roll += (targetRoll - v.roll) * Math.min(1, dt * 8);

  if (crashedSpeed > 7) {
    v.hp = Math.max(0, v.hp - Math.round((crashedSpeed - 5) * 1.4));
  }

  const isDrifting = Math.abs(lateralVel) > 3.2 && Math.abs(v.speed) > 7;
  return { crashedSpeed, isDrifting };
}

export function stepPedestrianPhysics(
  ped: PedestrianState,
  moveFwd: number,
  moveStrafe: number,
  cameraYaw: number,
  sprint: boolean,
  dt: number,
  buildings: BuildingBox[]
): void {
  const speed = sprint ? 9.4 : 5.2;
  const sinY = Math.sin(cameraYaw);
  const cosY = Math.cos(cameraYaw);
  const dirX = -sinY * moveFwd + cosY * moveStrafe;
  const dirZ = -cosY * moveFwd - sinY * moveStrafe;
  const len = Math.hypot(dirX, dirZ);

  if (len > 0.01) {
    const nx = dirX / len;
    const nz = dirZ / len;
    ped.vx = nx * speed;
    ped.vz = nz * speed;
    ped.heading = Math.atan2(nx, nz);
    ped.walkCycle += dt * (sprint ? 12 : 7.5);
  } else {
    ped.vx *= Math.exp(-14 * dt);
    ped.vz *= Math.exp(-14 * dt);
  }

  const res = resolveCircleBuildings(
    ped.x + ped.vx * dt,
    ped.z + ped.vz * dt,
    0.55,
    buildings
  );
  ped.x = res.x;
  ped.z = res.z;
}

export function computeAiVehicleInput(
  ai: VehicleState,
  targetX: number,
  targetZ: number,
  pursuitMode: boolean
): VehicleInput {
  if (pursuitMode) {
    const dx = targetX - ai.x;
    const dz = targetZ - ai.z;
    const desiredHeading = Math.atan2(dx, dz);
    let diff = desiredHeading - ai.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const steer = Math.max(-1, Math.min(1, diff * 1.8));
    const throttle = Math.abs(diff) > 1.2 ? 0.55 : 0.94;
    return { throttle, steer, handbrake: false };
  }

  if (ai.aiLaneAxis === 'z') {
    const dir = ai.aiLaneDir ?? 1;
    if (dir > 0 && ai.z > CITY_HALF_SIZE - 20) ai.z = -CITY_HALF_SIZE + 20;
    if (dir < 0 && ai.z < -CITY_HALF_SIZE + 20) ai.z = CITY_HALF_SIZE - 20;
    const desiredH = dir > 0 ? 0 : Math.PI;
    const laneErr = ((ai.aiLaneCoord ?? ai.x) - ai.x) * (dir > 0 ? 0.08 : -0.08);
    let diff = desiredH - ai.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return {
      throttle: ai.speed < 12 ? 0.55 : 0.25,
      steer: Math.max(-0.8, Math.min(0.8, diff * 1.4 + laneErr)),
      handbrake: false,
    };
  } else {
    const dir = ai.aiLaneDir ?? 1;
    if (dir > 0 && ai.x > CITY_HALF_SIZE - 20) ai.x = -CITY_HALF_SIZE + 20;
    if (dir < 0 && ai.x < -CITY_HALF_SIZE + 20) ai.x = CITY_HALF_SIZE - 20;
    const desiredH = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    const laneErr = ((ai.aiLaneCoord ?? ai.z) - ai.z) * (dir > 0 ? -0.08 : 0.08);
    let diff = desiredH - ai.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return {
      throttle: ai.speed < 12 ? 0.55 : 0.25,
      steer: Math.max(-0.8, Math.min(0.8, diff * 1.4 + laneErr)),
      handbrake: false,
    };
  }
}

export function resolveVehiclePairCollision(a: VehicleState, b: VehicleState): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const minDist = a.radius + b.radius;
  const distSq = dx * dx + dz * dz;
  if (distSq >= minDist * minDist || distSq < 0.0001) return 0;

  const dist = Math.sqrt(distSq);
  const nx = dx / dist;
  const nz = dz / dist;
  const overlap = minDist - dist;
  a.x -= nx * overlap * 0.5;
  a.z -= nz * overlap * 0.5;
  b.x += nx * overlap * 0.5;
  b.z += nz * overlap * 0.5;

  const rvx = b.vx - a.vx;
  const rvz = b.vz - a.vz;
  const velAlongNormal = rvx * nx + rvz * nz;
  if (velAlongNormal > 0) return 0;

  const impulse = -(1 + 0.45) * velAlongNormal * 0.5;
  a.vx -= impulse * nx;
  a.vz -= impulse * nz;
  b.vx += impulse * nx;
  b.vz += impulse * nz;
  return Math.abs(velAlongNormal);
}

export function createNextMission(
  spots: { x: number; z: number; name: string }[],
  playerX: number,
  playerZ: number,
  completedCount: number,
  forcedType?: MissionType
): MissionState {
  const types: MissionType[] = ['delivery', 'sprint', 'heist'];
  const type = forcedType ?? types[completedCount % types.length];

  const sorted = [...spots].sort(
    (a, b) => Math.hypot(a.x - playerX, a.z - playerZ) - Math.hypot(b.x - playerX, b.z - playerZ)
  );
  const pickup = sorted[Math.min(1, sorted.length - 1)];
  const farSpots = spots.filter((s) => Math.hypot(s.x - pickup.x, s.z - pickup.z) > 120);
  const dropoff =
    farSpots[completedCount % Math.max(1, farSpots.length)] ?? spots[spots.length - 1];

  if (type === 'sprint') {
    const mid1 = sorted[Math.min(3, sorted.length - 1)];
    const mid2 = farSpots[0] ?? sorted[sorted.length - 2];
    const finish = farSpots[Math.min(2, Math.max(0, farSpots.length - 1))] ?? dropoff;
    return {
      type,
      title: 'Уличный спринт (3 точки)',
      phase: 'to_dropoff',
      checkpoints: [mid1, mid2, finish],
      checkpointIdx: 0,
      pickup: mid1,
      dropoff: mid1,
      reward: 950 + completedCount * 150,
      timeLeft: 95,
      completedCount,
    };
  }

  if (type === 'heist') {
    return {
      type,
      title: 'Побег с грузом (Розыск)',
      phase: 'to_pickup',
      checkpoints: [pickup, dropoff],
      checkpointIdx: 0,
      pickup,
      dropoff,
      reward: 1350 + completedCount * 200,
      timeLeft: 95,
      completedCount,
    };
  }

  return {
    type: 'delivery',
    title: 'VIP-доставка',
    phase: 'to_pickup',
    checkpoints: [pickup, dropoff],
    checkpointIdx: 0,
    pickup,
    dropoff,
    reward: 700 + completedCount * 150,
    timeLeft: 85,
    completedCount,
  };
}
