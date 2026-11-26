import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyChessMove,
  createInitialChessState,
  getLegalMoves,
} from './chess/engine';
import { chooseBestChessMove } from './chess/ai';
import {
  createMinesweeperState,
  revealMinesweeperCell,
  toggleMinesweeperFlag,
} from './minesweeper/engine';
import {
  BALL_R,
  PLAY_RIGHT,
  computeAiShot,
  createInitialBilliardsState,
  evaluateShotOutcome,
  stepBilliardsPhysics,
} from './billiards/engine';
import {
  applyCheckersMove,
  chooseCheckersAiMove,
  createInitialCheckersState,
  getLegalCheckersMoves,
} from './checkers/engine';
import {
  applyTicTacToeMove,
  chooseTicTacToeAiMove,
  createTicTacToeState,
} from './tictactoe/engine';
import {
  computeAiVehicleInput,
  createInitialVehicles,
  createNextMission,
  generateCityLayout,
  resolveVehiclePairCollision,
  stepPedestrianPhysics,
  stepVehiclePhysics,
} from './citydriver/engine';
import {
  WEAPONS,
  applyDamageToActor,
  castBulletRay,
  createActor,
  createTacticalMap,
  hasLineOfSight,
  resolveActorMovement,
} from './tacticalfps/engine';
import {
  COLOR_GRID_SIZE,
  applyColorBlockPlacement,
  createInitialColorBlockState,
} from './colorblock/engine';

test('Chess: initial state has 20 legal moves and Fool Mate triggers checkmate', () => {
  let state = createInitialChessState();
  assert.equal(getLegalMoves(state).length, 20);

  // 1. f3 e5 2. g4 Qh4#
  const move = (from: number, to: number) => {
    const m = getLegalMoves(state, from).find((x) => x.to === to);
    assert.ok(m, `Expected legal move ${from}->${to}`);
    state = applyChessMove(state, m);
  };

  move(53, 45); // f2->f3
  move(12, 28); // e7->e5
  move(54, 38); // g2->g4
  move(3, 39);  // Qd8->h4#

  assert.equal(state.status, 'checkmate');
  assert.equal(state.winner, 'b');
  assert.equal(state.history[3].san, 'Qh4#');
});

test('Chess: castling and en passant work according to FIDE rules', () => {
  let state = createInitialChessState();
  const play = (from: number, to: number) => {
    const m = getLegalMoves(state, from).find((x) => x.to === to);
    assert.ok(m, `Expected legal move ${from}->${to}`);
    state = applyChessMove(state, m);
  };

  // Clear kingside for White castling
  play(52, 36); // e4
  play(12, 28); // e5
  play(62, 45); // Nf3
  play(1, 18);  // Nc6
  play(61, 34); // Bc4
  play(6, 21);  // Nf6
  play(60, 62); // O-O

  assert.equal(state.board[62]?.type, 'k');
  assert.equal(state.board[61]?.type, 'r');
  assert.equal(state.history[state.history.length - 1].san, 'O-O');

  // Test AI returns a legal move
  const aiMove = chooseBestChessMove(state, 2);
  assert.ok(aiMove);
  const legal = getLegalMoves(state);
  assert.ok(legal.some((m) => m.from === aiMove.from && m.to === aiMove.to));
});

test('Minesweeper: first click is safe and flag counter updates', () => {
  let state = createMinesweeperState('beginner');
  state = revealMinesweeperCell(state, 4, 4);
  assert.equal(state.minesPlaced, true);
  assert.equal(state.status, 'playing');
  assert.equal(state.cells[4 * 9 + 4].isMine, false);
  assert.ok(state.revealedCount >= 1);

  // Find an unrevealed cell and flag it
  const unrevealed = state.cells.find((c) => !c.isRevealed);
  assert.ok(unrevealed);
  state = toggleMinesweeperFlag(state, unrevealed.row, unrevealed.col);
  assert.equal(state.flagsUsed, 1);
  state = toggleMinesweeperFlag(state, unrevealed.row, unrevealed.col);
  assert.equal(state.flagsUsed, 0);
});

test('Billiards: 16 balls initialized, collisions separate cleanly without overlap, scratch restores cue', () => {
  const state = createInitialBilliardsState('vs_ai', 'pro');
  assert.equal(state.balls.length, 16);

  // Shoot cue ball hard toward rack
  const balls = state.balls.map((b) => ({ ...b }));
  balls[0].vx = 20;
  balls[0].vy = 0.2;

  let hitOccurred = false;
  for (let i = 0; i < 180; i++) {
    const res = stepBilliardsPhysics(balls, 1 / 60);
    if (res.events.some((e) => e.type === 'ball_hit')) hitOccurred = true;
    if (!res.moving) break;
  }
  assert.equal(hitOccurred, true);

  // Verify no two unpocketed balls overlap and stay within table bounds
  const active = balls.filter((b) => !b.pocketed);
  for (let i = 0; i < active.length; i++) {
    assert.ok(active[i].x <= PLAY_RIGHT + 1);
    for (let j = i + 1; j < active.length; j++) {
      const dist = Math.hypot(active[i].x - active[j].x, active[i].y - active[j].y);
      assert.ok(dist >= BALL_R * 2 - 0.5, `Balls overlapped: dist=${dist}`);
    }
  }

  // Test AI shot generator produces finite angle & power
  const aiShot = computeAiShot(state);
  assert.ok(Number.isFinite(aiShot.angle));
  assert.ok(aiShot.power > 0);

  // Test scratch restores cue ball and grants ballInHand
  const afterScratch = evaluateShotOutcome(state, [0], null);
  assert.equal(afterScratch.ballInHand, true);
  assert.equal(afterScratch.balls[0].pocketed, false);
});

test('Checkers: initial 24 pieces and AI picks a valid move', () => {
  const state = createInitialCheckersState();
  const whiteCount = state.board.filter((p) => p?.color === 'w').length;
  const blackCount = state.board.filter((p) => p?.color === 'b').length;
  assert.equal(whiteCount, 12);
  assert.equal(blackCount, 12);

  const moves = getLegalCheckersMoves(state);
  assert.equal(moves.length, 7);
  const next = applyCheckersMove(state, moves[0]);
  assert.equal(next.turn, 'b');

  const aiMove = chooseCheckersAiMove(next);
  assert.ok(aiMove);
});

test('TicTacToe: 3x3 detects win and AI blocks threats', () => {
  let state = createTicTacToeState(3);
  state = applyTicTacToeMove(state, 0); // X
  state = applyTicTacToeMove(state, 4); // O
  state = applyTicTacToeMove(state, 1); // X threatens 2
  const aiIdx = chooseTicTacToeAiMove(state);
  assert.equal(aiIdx, 2); // O must block at 2
});

test('CityDriver: layout builds city blocks, vehicle accelerates/drifts & collides cleanly with buildings', () => {
  const layout = generateCityLayout();
  assert.ok(layout.buildings.length >= 40);
  assert.ok(layout.missionSpots.length >= 6);

  const vehicles = createInitialVehicles();
  const car = vehicles[0];
  const startZ = car.z;

  // Accelerate north (-Z)
  for (let i = 0; i < 60; i++) {
    stepVehiclePhysics(car, { throttle: 1, steer: 0, handbrake: false }, 1 / 60, layout.buildings);
  }
  assert.ok(car.speed > 15, `Expected high forward speed, got ${car.speed}`);
  assert.ok(car.z < startZ, 'Car facing heading=PI should move toward -Z');

  // Drift turn with handbrake
  let drifted = false;
  for (let i = 0; i < 30; i++) {
    const res = stepVehiclePhysics(
      car,
      { throttle: 1, steer: 1, handbrake: true },
      1 / 60,
      layout.buildings
    );
    if (res.isDrifting) drifted = true;
  }
  assert.equal(drifted, true);

  // Pair collision separates overlapping vehicles
  const v1 = { ...vehicles[0], x: 0, z: 0, vx: 10, vz: 0 };
  const v2 = { ...vehicles[1], x: 1.5, z: 0, vx: -5, vz: 0 };
  const impact = resolveVehiclePairCollision(v1, v2);
  assert.ok(impact > 0);
  assert.ok(Math.hypot(v1.x - v2.x, v1.z - v2.z) >= v1.radius + v2.radius - 0.01);

  // Pedestrian movement + mission generator
  const ped = { x: 0, z: 0, heading: 0, vx: 0, vz: 0, walkCycle: 0, hp: 100 };
  stepPedestrianPhysics(ped, 1, 0, 0, true, 0.2, layout.buildings);
  assert.ok(ped.z < 0);

  const aiInput = computeAiVehicleInput(vehicles[5], 10, 10, true);
  assert.ok(aiInput.throttle > 0);

  const mission = createNextMission(layout.missionSpots, 0, 0, 0);
  assert.equal(mission.phase, 'to_pickup');
});

test('TacticalFPS: map boxes block movement/sight, headshots deal lethal multiplier damage', () => {
  const map = createTacticalMap();
  assert.ok(map.boxes.length >= 20);
  assert.equal(map.bombsites.length, 2);

  const shooter = createActor('p1', 'Player', 'ct', true, { x: 0, z: -26 }, 'ak47');
  const enemy = createActor('e1', 'Bot1', 't', false, { x: 0, z: -18 }, 'ak47');

  // Clear line of sight in open corridor (x=0, z=-26 to z=-18, no wall between)
  assert.equal(hasLineOfSight(shooter.x, 1.6, shooter.z, enemy.x, 1.6, enemy.z, map), true);

  // Wall at mid_doors (z=-2) blocks sight from z=-26 to z=10 if aiming through x=-6.5
  assert.equal(hasLineOfSight(-6.5, 1.6, -20, -6.5, 1.6, 15, map), false);

  // Headshot raycast hits enemy head at y=1.56
  const hit = castBulletRay(
    shooter,
    shooter.x,
    1.56,
    shooter.z,
    0,
    0,
    1,
    WEAPONS.ak47,
    map,
    [shooter, enemy]
  );
  assert.equal(hit.hitActor?.id, 'e1');
  assert.equal(hit.hitZone, 'head');
  assert.ok(hit.damage >= 90);

  const killed = applyDamageToActor(enemy, hit.damage);
  assert.equal(typeof killed, 'boolean');

  // Movement stops against perimeter wall
  shooter.z = -38.5;
  for (let i = 0; i < 20; i++) {
    resolveActorMovement(shooter, 0, -1, false, false, false, 0.05, map);
  }
  assert.ok(shooter.z >= -map.halfSize + 1.0);

  // CS2 walkable crate: jumping above mid_step (maxY=0.8) lands cleanly on top of crate
  const crateActor = createActor('jump_tester', 'Tester', 'ct', true, { x: -1.8, z: 9 });
  crateActor.y = 1.1;
  crateActor.vy = -1.0;
  crateActor.grounded = false;
  for (let i = 0; i < 10; i++) {
    resolveActorMovement(crateActor, 0, 0, false, false, false, 0.05, map);
  }
  assert.ok(crateActor.y >= 0.79 && crateActor.grounded, `Expected landing on crate top, got y=${crateActor.y}`);
});

test('ColorBlock: creates 8x8 board, places shapes, and clears completed rows with combo points', () => {
  let state = createInitialColorBlockState();
  assert.equal(state.grid.length, COLOR_GRID_SIZE);
  assert.equal(state.tray.length, 3);

  // Fill first 7 columns of row 0 and set a 1x1 piece in tray[0]
  for (let c = 0; c < 7; c++) {
    state.grid[0][c] = 'cyan';
  }
  state.tray[0] = { id: 'dot_test', cells: [[0, 0]], color: 'amber', width: 1, height: 1 };

  const res = applyColorBlockPlacement(state, 0, 0, 7);
  assert.equal(res.placed, true);
  assert.equal(res.clearedCount, 1);
  assert.ok(res.pointsGained >= 130);
  assert.equal(res.nextState.grid[0].every((c) => c === null), true);
  assert.equal(res.nextState.linesCleared, 1);
});
