export const TABLE_W = 880;
export const TABLE_H = 440;
export const CUSHION = 34;
export const BALL_R = 11.5;
export const CORNER_POCKET_R = 21;
export const SIDE_POCKET_R = 19;

export const PLAY_LEFT = CUSHION;
export const PLAY_RIGHT = TABLE_W - CUSHION;
export const PLAY_TOP = CUSHION;
export const PLAY_BOTTOM = TABLE_H - CUSHION;
export const HEAD_STRING_X = PLAY_LEFT + (PLAY_RIGHT - PLAY_LEFT) * 0.25;
export const FOOT_SPOT_X = PLAY_LEFT + (PLAY_RIGHT - PLAY_LEFT) * 0.72;
export const CENTER_Y = TABLE_H / 2;

export type BallGroup = 'solid' | 'stripe';
export type BilliardsMode = 'practice' | 'vs_ai' | 'local_2p';
export type BilliardsDifficulty = 'casual' | 'pro';

export interface Pocket {
  x: number;
  y: number;
  r: number;
  isSide: boolean;
}

export const POCKETS: Pocket[] = [
  { x: PLAY_LEFT + 2, y: PLAY_TOP + 2, r: CORNER_POCKET_R, isSide: false },
  { x: TABLE_W / 2, y: PLAY_TOP - 3, r: SIDE_POCKET_R, isSide: true },
  { x: PLAY_RIGHT - 2, y: PLAY_TOP + 2, r: CORNER_POCKET_R, isSide: false },
  { x: PLAY_LEFT + 2, y: PLAY_BOTTOM - 2, r: CORNER_POCKET_R, isSide: false },
  { x: TABLE_W / 2, y: PLAY_BOTTOM + 3, r: SIDE_POCKET_R, isSide: true },
  { x: PLAY_RIGHT - 2, y: PLAY_BOTTOM - 2, r: CORNER_POCKET_R, isSide: false },
];

export const BALL_COLORS: Record<number, string> = {
  0: '#F8FAFC', // Cue ball
  1: '#FACC15', // Yellow
  2: '#2563EB', // Blue
  3: '#DC2626', // Red
  4: '#7C3AED', // Purple
  5: '#EA580C', // Orange
  6: '#16A34A', // Green
  7: '#991B1B', // Maroon
  8: '#111827', // Black 8-ball
  9: '#FACC15',
  10: '#2563EB',
  11: '#DC2626',
  12: '#7C3AED',
  13: '#EA580C',
  14: '#16A34A',
  15: '#991B1B',
};

export interface Ball {
  id: number; // 0 = cue, 1..7 solid, 8 = eight, 9..15 stripe
  x: number;
  y: number;
  vx: number;
  vy: number;
  pocketed: boolean;
}

export interface PhysicsEvent {
  type: 'ball_hit' | 'rail_hit' | 'pocket';
  strength: number;
  ballId?: number;
  otherId?: number;
}

export interface BilliardsGameState {
  mode: BilliardsMode;
  difficulty: BilliardsDifficulty;
  balls: Ball[];
  turn: 1 | 2;
  player1Group: BallGroup | null;
  player2Group: BallGroup | null;
  ballInHand: boolean;
  isBreakShot: boolean;
  phase: 'aiming' | 'shooting' | 'gameover';
  winner: 1 | 2 | null;
  statusMessage: string;
  runCount: number;
  totalPocketed: number;
}

export function getBallGroup(id: number): BallGroup | 'cue' | 'eight' {
  if (id === 0) return 'cue';
  if (id === 8) return 'eight';
  return id < 8 ? 'solid' : 'stripe';
}

export function createInitialBalls(): Ball[] {
  const balls: Ball[] = [
    { id: 0, x: HEAD_STRING_X, y: CENTER_Y, vx: 0, vy: 0, pocketed: false },
  ];

  // Standard 8-ball rack with 8 in center, solid and stripe in back corners
  const rackOrder = [
    1,
    9, 2,
    3, 8, 10,
    11, 4, 12, 5,
    6, 13, 7, 14, 15,
  ];

  const dx = BALL_R * Math.sqrt(3) + 0.6;
  const dy = BALL_R * 2 + 0.6;
  let idx = 0;

  for (let row = 0; row < 5; row++) {
    const x = FOOT_SPOT_X + row * dx;
    const startY = CENTER_Y - (row * dy) / 2;
    for (let col = 0; col <= row; col++) {
      const id = rackOrder[idx++];
      balls.push({
        id,
        x,
        y: startY + col * dy,
        vx: 0,
        vy: 0,
        pocketed: false,
      });
    }
  }

  return balls;
}

export function createInitialBilliardsState(
  mode: BilliardsMode,
  difficulty: BilliardsDifficulty = 'pro'
): BilliardsGameState {
  return {
    mode,
    difficulty,
    balls: createInitialBalls(),
    turn: 1,
    player1Group: null,
    player2Group: null,
    ballInHand: false,
    isBreakShot: true,
    phase: 'aiming',
    winner: null,
    statusMessage:
      mode === 'practice'
        ? 'Тренировка: прицельтесь мышью или касанием и оттяните кий'
        : 'Разбой пирамиды — ваш удар',
    runCount: 0,
    totalPocketed: 0,
  };
}

export function isAnyBallMoving(balls: Ball[]): boolean {
  for (const b of balls) {
    if (!b.pocketed && (Math.abs(b.vx) > 0.001 || Math.abs(b.vy) > 0.001)) {
      return true;
    }
  }
  return false;
}

export function isValidCuePlacement(
  balls: Ball[],
  x: number,
  y: number,
  isBreakShot: boolean
): boolean {
  const maxX = isBreakShot ? HEAD_STRING_X : PLAY_RIGHT - BALL_R - 2;
  if (
    x < PLAY_LEFT + BALL_R + 2 ||
    x > maxX ||
    y < PLAY_TOP + BALL_R + 2 ||
    y > PLAY_BOTTOM - BALL_R - 2
  ) {
    return false;
  }

  for (const p of POCKETS) {
    const dx = x - p.x;
    const dy = y - p.y;
    if (dx * dx + dy * dy < (p.r + BALL_R) * (p.r + BALL_R)) {
      return false;
    }
  }

  for (const b of balls) {
    if (b.id === 0 || b.pocketed) continue;
    const dx = x - b.x;
    const dy = y - b.y;
    if (dx * dx + dy * dy < (BALL_R * 2 + 1.5) * (BALL_R * 2 + 1.5)) {
      return false;
    }
  }

  return true;
}

export function findSafeCueSpot(balls: Ball[], isBreakShot: boolean): { x: number; y: number } {
  if (isValidCuePlacement(balls, HEAD_STRING_X, CENTER_Y, isBreakShot)) {
    return { x: HEAD_STRING_X, y: CENTER_Y };
  }
  for (let x = PLAY_LEFT + 40; x <= (isBreakShot ? HEAD_STRING_X : PLAY_RIGHT - 40); x += 18) {
    for (let y = PLAY_TOP + 36; y <= PLAY_BOTTOM - 36; y += 18) {
      if (isValidCuePlacement(balls, x, y, isBreakShot)) {
        return { x, y };
      }
    }
  }
  return { x: HEAD_STRING_X, y: CENTER_Y };
}

function isNearPocketMouth(x: number, y: number): boolean {
  for (const p of POCKETS) {
    const dx = x - p.x;
    const dy = y - p.y;
    if (dx * dx + dy * dy < (p.r + BALL_R * 0.65) * (p.r + BALL_R * 0.65)) {
      return true;
    }
  }
  return false;
}

/**
 * Advances billiards physics by clamped dt (in seconds).
 * Uses 8 substeps per frame to prevent fast-ball tunneling or sticking.
 */
export function stepBilliardsPhysics(
  balls: Ball[],
  dtSeconds: number
): { moving: boolean; events: PhysicsEvent[] } {
  const clampedDt = Math.min(Math.max(dtSeconds, 0.001), 0.1);
  const SUBSTEPS = Math.min(24, Math.max(8, Math.ceil(clampedDt * 480)));
  const subDt = (clampedDt * 60) / SUBSTEPS; // normalized to 60fps units
  const frictionPerSubstep = Math.pow(0.981, (clampedDt * 60) / SUBSTEPS);
  const restitutionBall = 0.94;
  const restitutionWall = 0.82;

  const events: PhysicsEvent[] = [];

  for (let step = 0; step < SUBSTEPS; step++) {
    // 1. Integrate positions & apply cloth friction
    for (const b of balls) {
      if (b.pocketed) continue;
      b.x += b.vx * subDt;
      b.y += b.vy * subDt;
      b.vx *= frictionPerSubstep;
      b.vy *= frictionPerSubstep;

      const speedSq = b.vx * b.vx + b.vy * b.vy;
      if (speedSq < 0.008) {
        b.vx = 0;
        b.vy = 0;
      } else if (speedSq < 0.25) {
        const drag = Math.pow(0.94, 1 / SUBSTEPS);
        b.vx *= drag;
        b.vy *= drag;
      }
    }

    // 2. Check pocket captures
    for (const b of balls) {
      if (b.pocketed) continue;
      for (const p of POCKETS) {
        const dx = b.x - p.x;
        const dy = b.y - p.y;
        const distSq = dx * dx + dy * dy;
        const captureR = p.r - 1.5;
        if (distSq < captureR * captureR) {
          b.pocketed = true;
          b.vx = 0;
          b.vy = 0;
          events.push({ type: 'pocket', strength: 1, ballId: b.id });
          break;
        }
      }
    }

    // 3. Cushion collisions (allowing pocket mouth entry)
    for (const b of balls) {
      if (b.pocketed) continue;
      const inMouth = isNearPocketMouth(b.x, b.y);
      if (inMouth) continue;

      if (b.x - BALL_R < PLAY_LEFT) {
        b.x = PLAY_LEFT + BALL_R;
        const impact = Math.abs(b.vx);
        b.vx = Math.abs(b.vx) * restitutionWall;
        if (impact > 0.4) events.push({ type: 'rail_hit', strength: Math.min(1, impact / 12) });
      } else if (b.x + BALL_R > PLAY_RIGHT) {
        b.x = PLAY_RIGHT - BALL_R;
        const impact = Math.abs(b.vx);
        b.vx = -Math.abs(b.vx) * restitutionWall;
        if (impact > 0.4) events.push({ type: 'rail_hit', strength: Math.min(1, impact / 12) });
      }

      if (b.y - BALL_R < PLAY_TOP) {
        b.y = PLAY_TOP + BALL_R;
        const impact = Math.abs(b.vy);
        b.vy = Math.abs(b.vy) * restitutionWall;
        if (impact > 0.4) events.push({ type: 'rail_hit', strength: Math.min(1, impact / 12) });
      } else if (b.y + BALL_R > PLAY_BOTTOM) {
        b.y = PLAY_BOTTOM - BALL_R;
        const impact = Math.abs(b.vy);
        b.vy = -Math.abs(b.vy) * restitutionWall;
        if (impact > 0.4) events.push({ type: 'rail_hit', strength: Math.min(1, impact / 12) });
      }
    }

    // 4. Ball-ball elastic collisions
    const minDist = BALL_R * 2;
    const minDistSq = minDist * minDist;

    for (let i = 0; i < balls.length; i++) {
      const a = balls[i];
      if (a.pocketed) continue;
      for (let j = i + 1; j < balls.length; j++) {
        const b = balls[j];
        if (b.pocketed) continue;

        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distSq = dx * dx + dy * dy;
        if (distSq >= minDistSq) continue;

        let dist = Math.sqrt(distSq);
        let nx = 1;
        let ny = 0;
        if (dist > 0.0001) {
          nx = dx / dist;
          ny = dy / dist;
        } else {
          dist = 0.0001;
        }

        // Positional separation so balls never stick together
        const overlap = minDist - dist;
        const sep = overlap * 0.5 + 0.02;
        a.x -= nx * sep;
        a.y -= ny * sep;
        b.x += nx * sep;
        b.y += ny * sep;

        // Relative velocity along normal
        const rvx = b.vx - a.vx;
        const rvy = b.vy - a.vy;
        const velAlongNormal = rvx * nx + rvy * ny;

        if (velAlongNormal < 0) {
          const impulse = (-(1 + restitutionBall) * velAlongNormal) / 2;
          a.vx -= impulse * nx;
          a.vy -= impulse * ny;
          b.vx += impulse * nx;
          b.vy += impulse * ny;

          const strength = Math.min(1, Math.abs(velAlongNormal) / 14);
          if (strength > 0.05) {
            events.push({
              type: 'ball_hit',
              strength,
              ballId: a.id,
              otherId: b.id,
            });
          }
        }
      }
    }
  }

  return { moving: isAnyBallMoving(balls), events };
}

export function evaluateShotOutcome(
  state: BilliardsGameState,
  pocketedIds: number[],
  firstHitBallId: number | null
): BilliardsGameState {
  const nextBalls = state.balls.map((b) => ({ ...b }));
  const cueBall = nextBalls.find((b) => b.id === 0)!;
  const scratched = pocketedIds.includes(0);
  const eightPocketed = pocketedIds.includes(8);
  const nonCuePocketed = pocketedIds.filter((id) => id !== 0 && id !== 8);

  if (state.mode === 'practice') {
    if (scratched) {
      const spot = findSafeCueSpot(nextBalls, false);
      cueBall.pocketed = false;
      cueBall.x = spot.x;
      cueBall.y = spot.y;
      cueBall.vx = 0;
      cueBall.vy = 0;
    }
    const remainingObject = nextBalls.filter((b) => b.id !== 0 && !b.pocketed);
    if (remainingObject.length === 0) {
      return {
        ...state,
        balls: nextBalls,
        phase: 'gameover',
        winner: 1,
        totalPocketed: state.totalPocketed + nonCuePocketed.length + (eightPocketed ? 1 : 0),
        statusMessage: 'Стол очищен! Отличная серия.',
      };
    }
    const madeAny = nonCuePocketed.length > 0 || eightPocketed;
    const newRun = scratched ? 0 : madeAny ? state.runCount + nonCuePocketed.length : 0;
    return {
      ...state,
      balls: nextBalls,
      isBreakShot: false,
      ballInHand: scratched,
      phase: 'aiming',
      runCount: newRun,
      totalPocketed: state.totalPocketed + nonCuePocketed.length + (eightPocketed ? 1 : 0),
      statusMessage: scratched
        ? 'Фол: биток в лузе — установите шар в любую точку стола'
        : madeAny
        ? `Отличный удар! Шаров забито: ${nonCuePocketed.length + (eightPocketed ? 1 : 0)}`
        : 'Прицельтесь для следующего удара',
    };
  }

  // Competitive 8-ball rules (vs_ai or local_2p)
  const currentPlayer = state.turn;
  const otherPlayer: 1 | 2 = currentPlayer === 1 ? 2 : 1;
  let p1Group = state.player1Group;
  let p2Group = state.player2Group;
  const currentGroup = currentPlayer === 1 ? p1Group : p2Group;

  // Check if current player had already cleared their group before this shot
  const remainingOwnBefore =
    currentGroup === null
      ? 7
      : nextBalls.filter(
          (b) => !b.pocketed && getBallGroup(b.id) === currentGroup
        ).length;

  // 8-ball potted
  if (eightPocketed) {
    const legalEightWin =
      currentGroup !== null && remainingOwnBefore === 0 && !scratched;
    const winner = legalEightWin ? currentPlayer : otherPlayer;
    const pName =
      state.mode === 'vs_ai'
        ? winner === 1
          ? 'Вы победили!'
          : 'Компьютер победил'
        : `Победил Игрок ${winner}`;
    return {
      ...state,
      balls: nextBalls,
      phase: 'gameover',
      winner,
      totalPocketed: state.totalPocketed + nonCuePocketed.length + 1,
      statusMessage: legalEightWin
        ? `${pName} Восьмёрка забита по правилам.`
        : `${pName} Преждевременный забой восьмёрки или фол.`,
    };
  }

  // Determine fouls
  let foul = scratched || firstHitBallId === null;
  if (!foul && currentGroup !== null && firstHitBallId !== null) {
    const hitGroup = getBallGroup(firstHitBallId);
    if (remainingOwnBefore > 0 && hitGroup !== currentGroup) {
      foul = true;
    } else if (remainingOwnBefore === 0 && hitGroup !== 'eight') {
      foul = true;
    }
  }

  // Restore cue ball if scratched
  if (scratched) {
    const spot = findSafeCueSpot(nextBalls, false);
    cueBall.pocketed = false;
    cueBall.x = spot.x;
    cueBall.y = spot.y;
    cueBall.vx = 0;
    cueBall.vy = 0;
  }

  // Assign groups on first legal pocketed ball after break
  let pottedOwn = false;
  if (!foul && nonCuePocketed.length > 0) {
    if (p1Group === null && !state.isBreakShot) {
      const firstGroup = getBallGroup(nonCuePocketed[0]);
      if (firstGroup === 'solid' || firstGroup === 'stripe') {
        if (currentPlayer === 1) {
          p1Group = firstGroup;
          p2Group = firstGroup === 'solid' ? 'stripe' : 'solid';
        } else {
          p2Group = firstGroup;
          p1Group = firstGroup === 'solid' ? 'stripe' : 'solid';
        }
        pottedOwn = true;
      }
    } else if (p1Group === null && state.isBreakShot) {
      pottedOwn = true;
    } else {
      const myGroup = currentPlayer === 1 ? p1Group : p2Group;
      pottedOwn = nonCuePocketed.some((id) => getBallGroup(id) === myGroup);
    }
  }

  const keepTurn = !foul && pottedOwn;
  const nextTurn = keepTurn ? currentPlayer : otherPlayer;
  const actorLabel = (p: 1 | 2) =>
    state.mode === 'vs_ai' ? (p === 1 ? 'Ваш ход' : 'Ход компьютера') : `Ход Игрока ${p}`;

  let statusMessage = actorLabel(nextTurn);
  if (foul) {
    statusMessage = `Фол! Свободный шар — ${actorLabel(nextTurn).toLowerCase()}`;
  } else if (keepTurn) {
    statusMessage = `Шар в лузе! Продолжайте серию (${actorLabel(nextTurn).toLowerCase()})`;
  }

  return {
    ...state,
    balls: nextBalls,
    turn: nextTurn,
    player1Group: p1Group,
    player2Group: p2Group,
    ballInHand: foul,
    isBreakShot: false,
    phase: 'aiming',
    runCount: keepTurn ? state.runCount + nonCuePocketed.length : 0,
    totalPocketed: state.totalPocketed + nonCuePocketed.length,
    statusMessage,
  };
}

function isSegmentClear(
  balls: Ball[],
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  ignoreIds: Set<number>
): boolean {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1) return true;
  const clearance = BALL_R * 2 - 1.5;

  for (const b of balls) {
    if (b.pocketed || ignoreIds.has(b.id)) continue;
    const t = Math.max(0, Math.min(1, ((b.x - x1) * dx + (b.y - y1) * dy) / lenSq));
    const px = x1 + t * dx;
    const py = y1 + t * dy;
    const distSq = (b.x - px) * (b.x - px) + (b.y - py) * (b.y - py);
    if (distSq < clearance * clearance) return false;
  }
  return true;
}

/**
 * Raycast aim line from cue ball to find first obstacle (ball or rail) and deflection vector.
 */
export function computeAimPreview(
  balls: Ball[],
  angle: number
): {
  hitX: number;
  hitY: number;
  targetBallId: number | null;
  targetDirX?: number;
  targetDirY?: number;
} {
  const cue = balls.find((b) => b.id === 0);
  if (!cue) return { hitX: 0, hitY: 0, targetBallId: null };

  const dx = Math.cos(angle);
  const dy = Math.sin(angle);

  // Distance to walls
  let minT = Infinity;
  if (dx > 0.0001) minT = Math.min(minT, (PLAY_RIGHT - BALL_R - cue.x) / dx);
  else if (dx < -0.0001) minT = Math.min(minT, (PLAY_LEFT + BALL_R - cue.x) / dx);
  if (dy > 0.0001) minT = Math.min(minT, (PLAY_BOTTOM - BALL_R - cue.y) / dy);
  else if (dy < -0.0001) minT = Math.min(minT, (PLAY_TOP + BALL_R - cue.y) / dy);

  let hitBall: Ball | null = null;
  const R = BALL_R * 2;

  for (const b of balls) {
    if (b.id === 0 || b.pocketed) continue;
    const ocX = b.x - cue.x;
    const ocY = b.y - cue.y;
    const proj = ocX * dx + ocY * dy;
    if (proj <= 0) continue;
    const perpSq = ocX * ocX + ocY * ocY - proj * proj;
    if (perpSq >= R * R) continue;
    const thc = Math.sqrt(R * R - perpSq);
    const t = proj - thc;
    if (t > 0 && t < minT) {
      minT = t;
      hitBall = b;
    }
  }

  const hitX = cue.x + dx * minT;
  const hitY = cue.y + dy * minT;

  if (hitBall) {
    const tdx = hitBall.x - hitX;
    const tdy = hitBall.y - hitY;
    const len = Math.hypot(tdx, tdy) || 1;
    return {
      hitX,
      hitY,
      targetBallId: hitBall.id,
      targetDirX: tdx / len,
      targetDirY: tdy / len,
    };
  }

  return { hitX, hitY, targetBallId: null };
}

export function computeAiShot(
  state: BilliardsGameState
): { angle: number; power: number } {
  const cue = state.balls.find((b) => b.id === 0)!;
  const aiGroup = state.player2Group;

  // Collect legal target balls
  let targets = state.balls.filter((b) => !b.pocketed && b.id !== 0);
  if (aiGroup !== null) {
    const own = targets.filter((b) => getBallGroup(b.id) === aiGroup);
    targets = own.length > 0 ? own : targets.filter((b) => b.id === 8);
  } else {
    targets = targets.filter((b) => b.id !== 8);
  }

  let bestScore = -Infinity;
  let bestAngle = 0;
  let bestPower = 13;

  for (const target of targets) {
    for (const pocket of POCKETS) {
      const toPocketX = pocket.x - target.x;
      const toPocketY = pocket.y - target.y;
      const distToPocket = Math.hypot(toPocketX, toPocketY);
      if (distToPocket < 1) continue;
      const px = toPocketX / distToPocket;
      const py = toPocketY / distToPocket;

      // Ghost ball coordinates
      const ghostX = target.x - px * (BALL_R * 2);
      const ghostY = target.y - py * (BALL_R * 2);

      if (
        ghostX < PLAY_LEFT + BALL_R ||
        ghostX > PLAY_RIGHT - BALL_R ||
        ghostY < PLAY_TOP + BALL_R ||
        ghostY > PLAY_BOTTOM - BALL_R
      ) {
        continue;
      }

      const toGhostX = ghostX - cue.x;
      const toGhostY = ghostY - cue.y;
      const distCueToGhost = Math.hypot(toGhostX, toGhostY);
      if (distCueToGhost < 1) continue;
      const cx = toGhostX / distCueToGhost;
      const cy = toGhostY / distCueToGhost;

      // Cut alignment dot product (>0.25 means reasonable cut angle)
      const alignment = cx * px + cy * py;
      if (alignment < 0.25) continue;

      const ignore = new Set<number>([0, target.id]);
      const cueClear = isSegmentClear(state.balls, cue.x, cue.y, ghostX, ghostY, ignore);
      const objClear = isSegmentClear(
        state.balls,
        target.x,
        target.y,
        pocket.x,
        pocket.y,
        ignore
      );

      if (!cueClear || !objClear) continue;

      const score = alignment * 120 - distToPocket * 0.12 - distCueToGhost * 0.08;
      if (score > bestScore) {
        bestScore = score;
        bestAngle = Math.atan2(toGhostY, toGhostX);
        bestPower = Math.min(18, Math.max(9.5, 9 + (distCueToGhost + distToPocket) * 0.015));
      }
    }
  }

  // Fallback if snookered: hit closest legal target directly
  if (bestScore === -Infinity && targets.length > 0) {
    let closest = targets[0];
    let minD = Infinity;
    for (const t of targets) {
      const d = Math.hypot(t.x - cue.x, t.y - cue.y);
      if (d < minD) {
        minD = d;
        closest = t;
      }
    }
    bestAngle = Math.atan2(closest.y - cue.y, closest.x - cue.x);
    bestPower = 12;
  }

  // Add difficulty jitter
  const jitter = state.difficulty === 'casual' ? 0.08 : 0.018;
  bestAngle += (Math.random() - 0.5) * jitter;

  return { angle: bestAngle, power: bestPower };
}
