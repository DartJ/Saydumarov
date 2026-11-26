export const CITY_HALF_SIZE = 192;
export const ROAD_STEP = 64; // Grid road centers at -128, -64, 0, 64, 128
export const ROAD_WIDTH = 16;

export type VehicleKind = 'sport' | 'muscle' | 'taxi' | 'sedan' | 'police';

export interface BuildingBox {
  id: string;
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number;
  style: 'glass' | 'concrete' | 'brick' | 'tower';
  baseColor: string;
  litColor: string;
}

export interface CityBlock {
  cx: number;
  cz: number;
  size: number;
  isPark: boolean;
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
  heading: number; // radians, 0 = +Z forward, sin(h)=x, cos(h)=z
  vx: number;
  vz: number;
  speed: number; // signed forward speed m/s
  steerAngle: number;
  wheelSpin: number;
  pitch: number;
  roll: number;
  hp: number;
  maxHp: number;
  radius: number;
  isPolice: boolean;
  aiWaypointIdx?: number;
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

export interface MissionState {
  phase: 'to_pickup' | 'to_dropoff';
  pickup: { x: number; z: number; name: string };
  dropoff: { x: number; z: number; name: string };
  reward: number;
  timeLeft: number;
  completedCount: number;
}

export function generateCityLayout(): CityLayout {
  const roadCoords = [-128, -64, 0, 64, 128];
  const blockCenters = [-160, -96, -32, 32, 96, 160];
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
    { style: 'glass', baseColor: '#1a2738', litColor: '#6ad2f5' },
    { style: 'tower', baseColor: '#222834', litColor: '#ffd480' },
    { style: 'concrete', baseColor: '#343942', litColor: '#ffe09e' },
    { style: 'brick', baseColor: '#4a312c', litColor: '#ffbe6b' },
  ];

  let bIdx = 0;
  for (let bx = 0; bx < blockCenters.length; bx++) {
    for (let bz = 0; bz < blockCenters.length; bz++) {
      const cx = blockCenters[bx];
      const cz = blockCenters[bz];

      // Make two scenic central-east / coastal blocks parks with palms
      const isPark = (cx === -32 && cz === 32) || (cx === 96 && cz === -32);
      blocks.push({ cx, cz, size: blockSize, isPark });

      if (isPark) {
        palmPositions.push(
          { x: cx - 14, z: cz - 14 },
          { x: cx + 14, z: cz - 14 },
          { x: cx - 14, z: cz + 14 },
          { x: cx + 14, z: cz + 14 }
        );
        continue;
      }

      // Place 2x2 buildings inside each 48x48 city block (leaving perimeter sidewalks)
      const subOffsets = [
        [-10.5, -10.5],
        [10.5, -10.5],
        [-10.5, 10.5],
        [10.5, 10.5],
      ];
      for (let s = 0; s < subOffsets.length; s++) {
        const hash = (bx * 19 + bz * 37 + s * 13) % 100;
        // Skip occasional courtyard corner for variety
        if (hash < 12) continue;

        const pal = palettes[(bx + bz + s) % palettes.length];
        const distCenter = Math.hypot(cx, cz);
        const downtownFactor = Math.max(0.35, 1.35 - distCenter / 210);
        const height = Math.round((14 + (hash % 32)) * downtownFactor);
        const w = 15 + (hash % 4);
        const d = 15 + ((hash * 3) % 4);

        buildings.push({
          id: `b_${bIdx++}`,
          x: cx + subOffsets[s][0],
          z: cz + subOffsets[s][1],
          width: w,
          depth: d,
          height,
          style: pal.style,
          baseColor: pal.baseColor,
          litColor: pal.litColor,
        });
      }
    }
  }

  // Coastal palms along outer boardwalk
  for (let p = -168; p <= 168; p += 42) {
    palmPositions.push({ x: p, z: CITY_HALF_SIZE - 4 });
    palmPositions.push({ x: p, z: -CITY_HALF_SIZE + 4 });
  }

  // Streetlamps along main avenues
  for (const rc of roadCoords) {
    for (let pos = -160; pos <= 160; pos += 64) {
      lampPositions.push({ x: rc - 9.2, z: pos + 14, rotY: Math.PI / 2 });
      lampPositions.push({ x: rc + 9.2, z: pos - 14, rotY: -Math.PI / 2 });
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
      heading: Math.PI, // facing north (-Z)
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
  ];
}

const VEHICLE_SPECS: Record<
  VehicleKind,
  { maxFwd: number; maxRev: number; accel: number; brake: number; grip: number; turnRate: number }
> = {
  sport: { maxFwd: 38, maxRev: 12, accel: 22, brake: 34, grip: 8.2, turnRate: 2.4 },
  muscle: { maxFwd: 35, maxRev: 11, accel: 20, brake: 30, grip: 6.4, turnRate: 2.25 },
  police: { maxFwd: 39, maxRev: 13, accel: 23, brake: 35, grip: 8.6, turnRate: 2.5 },
  taxi: { maxFwd: 29, maxRev: 10, accel: 15, brake: 28, grip: 7.4, turnRate: 2.1 },
  sedan: { maxFwd: 31, maxRev: 10, accel: 16, brake: 28, grip: 7.8, turnRate: 2.15 },
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
        // Inside AABB fallback: push out along nearest edge
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

  // Steering smooth response
  const targetSteer = input.steer * 0.65;
  v.steerAngle += (targetSteer - v.steerAngle) * Math.min(1, dt * 10);

  // Turn rate scales smoothly with speed & reverses when backing up
  const speedRatio = Math.min(1, Math.abs(prevForwardVel) / 6.0);
  const steerSign = prevForwardVel >= -0.2 ? 1 : -1;
  const handbrakeTurnBoost = input.handbrake ? 1.45 : 1.0;
  v.heading +=
    input.steer * spec.turnRate * handbrakeTurnBoost * speedRatio * steerSign * dt;

  // Project momentum onto the NEW heading so cornering produces authentic lateral slip
  const nFwdX = Math.sin(v.heading);
  const nFwdZ = Math.cos(v.heading);
  const nRightX = Math.cos(v.heading);
  const nRightZ = -Math.sin(v.heading);

  let forwardVel = v.vx * nFwdX + v.vz * nFwdZ;
  let lateralVel = v.vx * nRightX + v.vz * nRightZ;

  // Longitudinal forces
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
    // Rolling resistance
    forwardVel *= Math.exp(-1.15 * dt);
  }

  if (input.handbrake) {
    forwardVel *= Math.exp(-2.1 * dt);
  }

  forwardVel = Math.max(-spec.maxRev, Math.min(spec.maxFwd, forwardVel));

  // Lateral grip vs drift slip
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
    // Reflect velocity slightly & absorb energy
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

  // Suspension lean for visual weight (GTA IV style body roll!)
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
  // Forward in world from camera yaw (-sin, -cos)
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
    const throttle = Math.abs(diff) > 1.2 ? 0.55 : 0.92;
    return { throttle, steer, handbrake: false };
  }

  // Cruise along assigned lane & wrap smoothly at city edges
  if (ai.aiLaneAxis === 'z') {
    const dir = ai.aiLaneDir ?? 1;
    if (dir > 0 && ai.z > CITY_HALF_SIZE - 18) ai.z = -CITY_HALF_SIZE + 18;
    if (dir < 0 && ai.z < -CITY_HALF_SIZE + 18) ai.z = CITY_HALF_SIZE - 18;
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
    if (dir > 0 && ai.x > CITY_HALF_SIZE - 18) ai.x = -CITY_HALF_SIZE + 18;
    if (dir < 0 && ai.x < -CITY_HALF_SIZE + 18) ai.x = CITY_HALF_SIZE - 18;
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
  completedCount: number
): MissionState {
  // Pick a pickup spot reasonably close (25..130m), dropoff far away (>95m)
  const sorted = [...spots].sort(
    (a, b) => Math.hypot(a.x - playerX, a.z - playerZ) - Math.hypot(b.x - playerX, b.z - playerZ)
  );
  const pickup = sorted[Math.min(1, sorted.length - 1)];
  const farSpots = spots.filter((s) => Math.hypot(s.x - pickup.x, s.z - pickup.z) > 85);
  const dropoff =
    farSpots[completedCount % Math.max(1, farSpots.length)] ?? spots[spots.length - 1];

  return {
    phase: 'to_pickup',
    pickup,
    dropoff,
    reward: 650 + completedCount * 150,
    timeLeft: 75,
    completedCount,
  };
}
