export type TeamSide = 'ct' | 't';
export type WeaponId = 'knife' | 'usp' | 'ak47' | 'm4a1' | 'awp';

export interface WeaponSpec {
  id: WeaponId;
  name: string;
  slot: 1 | 2 | 3; // 1 = primary, 2 = pistol, 3 = knife
  price: number;
  damage: number;
  headMultiplier: number;
  fireInterval: number; // seconds between shots
  automatic: boolean;
  magSize: number;
  reserveMax: number;
  reloadTime: number;
  baseSpread: number;
  moveSpread: number;
  recoilKick: number;
  moveSpeed: number;
  killReward: number;
  range: number;
  hasScope?: boolean;
}

export const WEAPONS: Record<WeaponId, WeaponSpec> = {
  knife: {
    id: 'knife',
    name: 'Нож',
    slot: 3,
    price: 0,
    damage: 55,
    headMultiplier: 2.0,
    fireInterval: 0.45,
    automatic: false,
    magSize: 0,
    reserveMax: 0,
    reloadTime: 0,
    baseSpread: 0,
    moveSpread: 0,
    recoilKick: 0.01,
    moveSpeed: 7.4,
    killReward: 1500,
    range: 2.7,
  },
  usp: {
    id: 'usp',
    name: 'USP-S',
    slot: 2,
    price: 200,
    damage: 35,
    headMultiplier: 3.1,
    fireInterval: 0.17,
    automatic: false,
    magSize: 12,
    reserveMax: 36,
    reloadTime: 1.45,
    baseSpread: 0.005,
    moveSpread: 0.022,
    recoilKick: 0.022,
    moveSpeed: 6.8,
    killReward: 300,
    range: 110,
  },
  ak47: {
    id: 'ak47',
    name: 'AK-47',
    slot: 1,
    price: 2700,
    damage: 36,
    headMultiplier: 3.2,
    fireInterval: 0.1,
    automatic: true,
    magSize: 30,
    reserveMax: 90,
    reloadTime: 1.9,
    baseSpread: 0.006,
    moveSpread: 0.042,
    recoilKick: 0.028,
    moveSpeed: 6.1,
    killReward: 300,
    range: 130,
  },
  m4a1: {
    id: 'm4a1',
    name: 'M4A1-S',
    slot: 1,
    price: 3100,
    damage: 33,
    headMultiplier: 2.9,
    fireInterval: 0.092,
    automatic: true,
    magSize: 25,
    reserveMax: 75,
    reloadTime: 1.8,
    baseSpread: 0.004,
    moveSpread: 0.032,
    recoilKick: 0.02,
    moveSpeed: 6.2,
    killReward: 300,
    range: 130,
  },
  awp: {
    id: 'awp',
    name: 'AWP',
    slot: 1,
    price: 4750,
    damage: 115,
    headMultiplier: 3.5,
    fireInterval: 1.25,
    automatic: false,
    magSize: 10,
    reserveMax: 30,
    reloadTime: 2.2,
    baseSpread: 0.001,
    moveSpread: 0.075,
    recoilKick: 0.065,
    moveSpeed: 5.5,
    killReward: 150,
    range: 180,
    hasScope: true,
  },
};

export type BoxMaterial = 'sandstone' | 'crate' | 'container' | 'concrete' | 'arch';

export interface ArenaBox {
  id: string;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
  material: BoxMaterial;
}

export interface BombsiteZone {
  id: 'A' | 'B';
  x: number;
  z: number;
  radius: number;
}

export interface TacticalMap {
  halfSize: number;
  boxes: ArenaBox[];
  ctSpawns: { x: number; z: number }[];
  tSpawns: { x: number; z: number }[];
  bombsites: BombsiteZone[];
  waypoints: { x: number; z: number }[];
}

function boxCenter(
  id: string,
  cx: number,
  cy: number,
  cz: number,
  w: number,
  h: number,
  d: number,
  material: BoxMaterial
): ArenaBox {
  return {
    id,
    minX: cx - w / 2,
    maxX: cx + w / 2,
    minY: cy - h / 2,
    maxY: cy + h / 2,
    minZ: cz - d / 2,
    maxZ: cz + d / 2,
    material,
  };
}

export function createTacticalMap(): TacticalMap {
  const H = 40;
  const boxes: ArenaBox[] = [
    // Perimeter sandstone walls
    boxCenter('wall_n', 0, 3.5, -H, H * 2 + 2, 7, 2, 'sandstone'),
    boxCenter('wall_s', 0, 3.5, H, H * 2 + 2, 7, 2, 'sandstone'),
    boxCenter('wall_w', -H, 3.5, 0, 2, 7, H * 2, 'sandstone'),
    boxCenter('wall_e', H, 3.5, 0, 2, 7, H * 2, 'sandstone'),

    // Mid dividing walls creating Left(B), Mid, Right(A) lanes with doors & arches
    boxCenter('mid_w_n', -14, 3, -15, 2.2, 6, 18, 'sandstone'),
    boxCenter('mid_w_s', -14, 3, 15, 2.2, 6, 18, 'sandstone'),
    boxCenter('mid_w_lintel', -14, 4.9, 0, 2.2, 2.2, 12, 'arch'),

    boxCenter('mid_e_n', 14, 3, -15, 2.2, 6, 18, 'sandstone'),
    boxCenter('mid_e_s', 14, 3, 15, 2.2, 6, 18, 'sandstone'),
    boxCenter('mid_e_lintel', 14, 4.9, 0, 2.2, 2.2, 12, 'arch'),

    // Mid double-door bunker walls
    boxCenter('mid_doors_w', -6.5, 2.4, -2, 7.5, 4.8, 1.5, 'concrete'),
    boxCenter('mid_doors_e', 6.5, 2.4, -2, 7.5, 4.8, 1.5, 'concrete'),

    // Mid crates (cover)
    boxCenter('mid_xbox', 0, 1.0, 9, 2.8, 2.0, 2.8, 'crate'),
    boxCenter('mid_crate_n', 0, 0.9, -14, 2.4, 1.8, 2.4, 'crate'),

    // Bombsite A (East lane, around x=27, z=-18)
    boxCenter('a_container', 26, 1.45, -18, 3.2, 2.9, 7.2, 'container'),
    boxCenter('a_crate_1', 21, 0.9, -24, 2.4, 1.8, 2.4, 'crate'),
    boxCenter('a_crate_2', 32, 1.1, -11, 2.6, 2.2, 2.6, 'crate'),
    boxCenter('a_long_cover', 27, 0.95, 10, 3.4, 1.9, 2.2, 'crate'),
    boxCenter('a_car_cover', 25, 0.85, 22, 4.2, 1.7, 2.2, 'concrete'),

    // Bombsite B (West lane, around x=-27, z=-18)
    boxCenter('b_container', -27, 1.45, -16, 6.8, 2.9, 3.1, 'container'),
    boxCenter('b_crate_1', -22, 1.0, -24, 2.6, 2.0, 2.6, 'crate'),
    boxCenter('b_crate_2', -33, 0.9, -21, 2.2, 1.8, 2.2, 'crate'),
    boxCenter('b_tunnel_wall', -28, 2.5, 12, 10, 5, 2, 'sandstone'),
    boxCenter('b_crate_s', -23, 0.9, 22, 2.5, 1.8, 2.5, 'crate'),

    // Spawn cover boxes
    boxCenter('ct_cover_w', -8, 1.0, -30, 3.2, 2.0, 1.8, 'crate'),
    boxCenter('ct_cover_e', 8, 1.0, -30, 3.2, 2.0, 1.8, 'crate'),
    boxCenter('t_cover_w', -8, 1.0, 30, 3.2, 2.0, 1.8, 'crate'),
    boxCenter('t_cover_e', 8, 1.0, 30, 3.2, 2.0, 1.8, 'crate'),
  ];

  const ctSpawns = [
    { x: 0, z: -34 },
    { x: -5, z: -34 },
    { x: 5, z: -34 },
    { x: -10, z: -33 },
    { x: 10, z: -33 },
  ];

  const tSpawns = [
    { x: 0, z: 34 },
    { x: -5, z: 34 },
    { x: 5, z: 34 },
    { x: -10, z: 33 },
    { x: 10, z: 33 },
  ];

  const bombsites: BombsiteZone[] = [
    { id: 'A', x: 27, z: -18, radius: 7.5 },
    { id: 'B', x: -27, z: -18, radius: 7.5 },
  ];

  const waypoints = [
    { x: 0, z: -26 },
    { x: 0, z: -6 },
    { x: 0, z: 4 },
    { x: 0, z: 22 },
    { x: 24, z: -26 },
    { x: 27, z: -18 },
    { x: 21, z: 0 },
    { x: 27, z: 18 },
    { x: -24, z: -26 },
    { x: -27, z: -18 },
    { x: -20, z: 0 },
    { x: -22, z: 18 },
  ];

  return { halfSize: H, boxes, ctSpawns, tSpawns, bombsites, waypoints };
}

export interface ActorState {
  id: string;
  name: string;
  team: TeamSide;
  isPlayer: boolean;
  x: number;
  y: number;
  z: number;
  vy: number;
  yaw: number;
  pitch: number;
  hp: number;
  armor: number;
  alive: boolean;
  crouching: boolean;
  grounded: boolean;
  weaponId: WeaponId;
  primaryWeapon: WeaponId | null;
  secondaryWeapon: WeaponId;
  magAmmo: number;
  reserveAmmo: number;
  reloadingLeft: number;
  fireCooldown: number;
  recoilBloom: number;
  kills: number;
  deaths: number;
  walkCycle: number;
  aiTargetWpIdx: number;
  aiBurstLeft: number;
  aiWaitLeft: number;
  flashHitTimer: number;
}

export function createActor(
  id: string,
  name: string,
  team: TeamSide,
  isPlayer: boolean,
  spawn: { x: number; z: number },
  primary: WeaponId | null = null
): ActorState {
  const startWep = primary ?? 'usp';
  const spec = WEAPONS[startWep];
  return {
    id,
    name,
    team,
    isPlayer,
    x: spawn.x,
    y: 0,
    z: spawn.z,
    vy: 0,
    yaw: team === 'ct' ? Math.PI : 0, // CT faces +Z (South), T faces -Z (North)
    pitch: 0,
    hp: 100,
    armor: isPlayer ? 0 : 50,
    alive: true,
    crouching: false,
    grounded: true,
    weaponId: startWep,
    primaryWeapon: primary,
    secondaryWeapon: 'usp',
    magAmmo: spec.magSize,
    reserveAmmo: spec.reserveMax,
    reloadingLeft: 0,
    fireCooldown: 0,
    recoilBloom: 0,
    kills: 0,
    deaths: 0,
    walkCycle: 0,
    aiTargetWpIdx: 0,
    aiBurstLeft: 0,
    aiWaitLeft: 0.4,
    flashHitTimer: 0,
  };
}

export function resolveActorMovement(
  actor: ActorState,
  moveX: number,
  moveZ: number,
  jump: boolean,
  crouch: boolean,
  walkQuiet: boolean,
  dt: number,
  map: TacticalMap
): void {
  actor.crouching = crouch;
  const spec = WEAPONS[actor.weaponId];
  let maxSpd = spec.moveSpeed;
  if (crouch) maxSpd *= 0.52;
  else if (walkQuiet) maxSpd *= 0.58;

  const len = Math.hypot(moveX, moveZ);
  let vx = 0;
  let vz = 0;
  if (len > 0.001) {
    vx = (moveX / len) * maxSpd;
    vz = (moveZ / len) * maxSpd;
    actor.walkCycle += dt * (crouch ? 5 : 9.5);
  }

  if (jump && actor.grounded && !crouch) {
    actor.vy = 6.9;
    actor.grounded = false;
  }

  actor.vy -= 19.5 * dt;
  actor.y += actor.vy * dt;
  if (actor.y <= 0) {
    actor.y = 0;
    actor.vy = 0;
    actor.grounded = true;
  }

  const radius = 0.46;
  const actorHeight = crouch ? 1.25 : 1.78;
  let nx = actor.x + vx * dt;
  let nz = actor.z + vz * dt;

  // Map outer clamp
  const bound = map.halfSize - 1.5;
  nx = Math.max(-bound, Math.min(bound, nx));
  nz = Math.max(-bound, Math.min(bound, nz));

  for (let i = 0; i < map.boxes.length; i++) {
    const b = map.boxes[i];
    if (actor.y + actorHeight <= b.minY + 0.05 || actor.y >= b.maxY - 0.05) {
      continue;
    }
    const cx = Math.max(b.minX, Math.min(nx, b.maxX));
    const cz = Math.max(b.minZ, Math.min(nz, b.maxZ));
    const dx = nx - cx;
    const dz = nz - cz;
    const distSq = dx * dx + dz * dz;
    if (distSq < radius * radius) {
      const dist = Math.sqrt(distSq);
      if (dist > 0.0001) {
        const push = radius - dist;
        nx += (dx / dist) * push;
        nz += (dz / dist) * push;
      } else {
        const penX = Math.min(Math.abs(nx - b.minX), Math.abs(b.maxX - nx)) + radius;
        const penZ = Math.min(Math.abs(nz - b.minZ), Math.abs(b.maxZ - nz)) + radius;
        if (penX < penZ) {
          nx = nx < (b.minX + b.maxX) / 2 ? b.minX - radius : b.maxX + radius;
        } else {
          nz = nz < (b.minZ + b.maxZ) / 2 ? b.minZ - radius : b.maxZ + radius;
        }
      }
    }
  }

  actor.x = nx;
  actor.z = nz;
}

export interface RayHitResult {
  hitWall: boolean;
  wallDist: number;
  hitPoint: { x: number; y: number; z: number };
  hitActor: ActorState | null;
  hitZone: 'head' | 'body' | null;
  damage: number;
}

export function rayIntersectAABB(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  box: ArenaBox,
  maxDist: number
): number | null {
  let tmin = 0;
  let tmax = maxDist;

  const axes: [number, number, number, number][] = [
    [ox, dx, box.minX, box.maxX],
    [oy, dy, box.minY, box.maxY],
    [oz, dz, box.minZ, box.maxZ],
  ];

  for (let i = 0; i < 3; i++) {
    const [o, d, bmin, bmax] = axes[i];
    if (Math.abs(d) < 1e-8) {
      if (o < bmin || o > bmax) return null;
    } else {
      let t1 = (bmin - o) / d;
      let t2 = (bmax - o) / d;
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
      }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
  }
  return tmin;
}

export function rayIntersectSphere(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  cx: number,
  cy: number,
  cz: number,
  radius: number,
  maxDist: number
): number | null {
  const fx = ox - cx;
  const fy = oy - cy;
  const fz = oz - cz;
  const b = fx * dx + fy * dy + fz * dz;
  const c = fx * fx + fy * fy + fz * fz - radius * radius;
  const disc = b * b - c;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  if (t >= 0 && t <= maxDist) return t;
  return null;
}

export function castBulletRay(
  shooter: ActorState,
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  weapon: WeaponSpec,
  map: TacticalMap,
  actors: ActorState[]
): RayHitResult {
  let closestWall = weapon.range;
  let hitWall = false;

  for (let i = 0; i < map.boxes.length; i++) {
    const t = rayIntersectAABB(ox, oy, oz, dx, dy, dz, map.boxes[i], closestWall);
    if (t !== null && t < closestWall) {
      closestWall = t;
      hitWall = true;
    }
  }

  // Also check ground plane (y = 0)
  if (dy < -0.0001) {
    const tGround = -oy / dy;
    if (tGround > 0 && tGround < closestWall) {
      closestWall = tGround;
      hitWall = true;
    }
  }

  let bestActor: ActorState | null = null;
  let bestDist = closestWall;
  let bestZone: 'head' | 'body' | null = null;

  for (let i = 0; i < actors.length; i++) {
    const target = actors[i];
    if (!target.alive || target.id === shooter.id || target.team === shooter.team) {
      continue;
    }

    const headY = target.y + (target.crouching ? 1.12 : 1.56);
    const tHead = rayIntersectSphere(
      ox,
      oy,
      oz,
      dx,
      dy,
      dz,
      target.x,
      headY,
      target.z,
      0.24,
      bestDist
    );
    if (tHead !== null && tHead < bestDist) {
      bestDist = tHead;
      bestActor = target;
      bestZone = 'head';
    }

    const bodyBox: ArenaBox = {
      id: target.id,
      minX: target.x - 0.34,
      maxX: target.x + 0.34,
      minY: target.y + 0.1,
      maxY: target.y + (target.crouching ? 1.0 : 1.4),
      minZ: target.z - 0.34,
      maxZ: target.z + 0.34,
      material: 'concrete',
    };
    const tBody = rayIntersectAABB(ox, oy, oz, dx, dy, dz, bodyBox, bestDist);
    if (tBody !== null && tBody < bestDist) {
      bestDist = tBody;
      bestActor = target;
      bestZone = 'body';
    }
  }

  let damage = 0;
  if (bestActor && bestZone) {
    const raw =
      bestZone === 'head'
        ? weapon.damage * weapon.headMultiplier
        : weapon.damage;
    const armorFactor = bestActor.armor > 0 ? (weapon.id === 'awp' ? 0.98 : 0.8) : 1.0;
    damage = Math.round(raw * armorFactor);
  }

  return {
    hitWall: bestActor === null && hitWall,
    wallDist: bestDist,
    hitPoint: {
      x: ox + dx * bestDist,
      y: oy + dy * bestDist,
      z: oz + dz * bestDist,
    },
    hitActor: bestActor,
    hitZone: bestZone,
    damage,
  };
}

export function hasLineOfSight(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  map: TacticalMap
): boolean {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const dist = Math.hypot(dx, dy, dz);
  if (dist < 0.01) return true;
  const ndx = dx / dist;
  const ndy = dy / dist;
  const ndz = dz / dist;
  for (let i = 0; i < map.boxes.length; i++) {
    const t = rayIntersectAABB(ax, ay, az, ndx, ndy, ndz, map.boxes[i], dist);
    if (t !== null && t < dist - 0.25) return false;
  }
  return true;
}

export function applyDamageToActor(target: ActorState, damage: number): boolean {
  if (!target.alive) return false;
  if (target.armor > 0) {
    const absorbed = Math.min(target.armor, Math.round(damage * 0.25));
    target.armor -= absorbed;
  }
  target.hp = Math.max(0, target.hp - damage);
  target.flashHitTimer = 0.22;
  if (target.hp <= 0) {
    target.alive = false;
    target.deaths += 1;
    return true;
  }
  return false;
}
