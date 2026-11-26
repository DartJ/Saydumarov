import React, { useEffect, useRef, useState } from 'react';
import { Cpu, Crosshair, RotateCcw, Target, Users } from 'lucide-react';
import {
  BALL_COLORS,
  BALL_R,
  Ball,
  BilliardsDifficulty,
  BilliardsGameState,
  BilliardsMode,
  CENTER_Y,
  CUSHION,
  HEAD_STRING_X,
  PLAY_BOTTOM,
  PLAY_LEFT,
  PLAY_RIGHT,
  PLAY_TOP,
  POCKETS,
  TABLE_H,
  TABLE_W,
  computeAiShot,
  computeAimPreview,
  createInitialBilliardsState,
  evaluateShotOutcome,
  isValidCuePlacement,
  stepBilliardsPhysics,
} from '../../games/billiards/engine';
import { soundFX } from '../../utils/sound';

interface BilliardsGameProps {
  onRecordUpdate: (stats: {
    playedDelta: number;
    winAiDelta: number;
    pocketedDelta: number;
    runCount: number;
  }) => void;
}

interface HudSnapshot {
  mode: BilliardsMode;
  difficulty: BilliardsDifficulty;
  turn: 1 | 2;
  player1Group: 'solid' | 'stripe' | null;
  player2Group: 'solid' | 'stripe' | null;
  ballInHand: boolean;
  phase: 'aiming' | 'shooting' | 'gameover';
  winner: 1 | 2 | null;
  statusMessage: string;
  runCount: number;
  pocketedIds: number[];
  powerPct: number;
}

function makeHudSnapshot(st: BilliardsGameState, powerPct = 55): HudSnapshot {
  return {
    mode: st.mode,
    difficulty: st.difficulty,
    turn: st.turn,
    player1Group: st.player1Group,
    player2Group: st.player2Group,
    ballInHand: st.ballInHand,
    phase: st.phase,
    winner: st.winner,
    statusMessage: st.statusMessage,
    runCount: st.runCount,
    pocketedIds: st.balls.filter((b) => b.pocketed && b.id !== 0).map((b) => b.id),
    powerPct,
  };
}

export const BilliardsGame: React.FC<BilliardsGameProps> = ({ onRecordUpdate }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gameRef = useRef<BilliardsGameState>(
    createInitialBilliardsState('vs_ai', 'pro')
  );
  const aimAngleRef = useRef<number>(0);
  const isDraggingPowerRef = useRef<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const pullPowerRef = useRef<number>(0); // 0..1 during pull drag
  const manualPowerRef = useRef<number>(0.55); // slider 0.1..1
  const pointerTablePosRef = useRef<{ x: number; y: number }>({
    x: HEAD_STRING_X,
    y: CENTER_Y,
  });

  // Track events within a single shot
  const shotPocketedRef = useRef<number[]>([]);
  const shotFirstHitRef = useRef<number | null>(null);
  const aiTimerRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number>(0);
  const scheduleRenderRef = useRef<() => void>(() => {});

  const [hud, setHud] = useState<HudSnapshot>(() =>
    makeHudSnapshot(gameRef.current, 55)
  );
  const [sliderPower, setSliderPower] = useState<number>(55);

  const syncHud = (overridePct?: number) => {
    setHud(
      makeHudSnapshot(
        gameRef.current,
        overridePct ?? Math.round(manualPowerRef.current * 100)
      )
    );
  };

  const strikeCueBall = (angle: number, powerNorm: number) => {
    const st = gameRef.current;
    if (st.phase !== 'aiming' || st.ballInHand) return;
    const cue = st.balls.find((b) => b.id === 0);
    if (!cue || cue.pocketed) return;

    const clampedPower = Math.min(1, Math.max(0.08, powerNorm));
    const speed = 3.2 + clampedPower * 17.5;
    cue.vx = Math.cos(angle) * speed;
    cue.vy = Math.sin(angle) * speed;

    shotPocketedRef.current = [];
    shotFirstHitRef.current = null;
    st.phase = 'shooting';
    st.statusMessage = 'Удар выполнен...';
    soundFX.billiardHit(clampedPower);
    syncHud();
    scheduleRenderRef.current();
  };

  const resetTable = (
    nextMode: BilliardsMode = gameRef.current.mode,
    nextDiff: BilliardsDifficulty = gameRef.current.difficulty
  ) => {
    if (aiTimerRef.current) {
      window.clearTimeout(aiTimerRef.current);
      aiTimerRef.current = null;
    }
    soundFX.click();
    gameRef.current = createInitialBilliardsState(nextMode, nextDiff);
    aimAngleRef.current = 0;
    pullPowerRef.current = 0;
    isDraggingPowerRef.current = false;
    shotPocketedRef.current = [];
    shotFirstHitRef.current = null;
    syncHud();
    scheduleRenderRef.current();
  };

  // Trigger AI shot when it's AI's turn in vs_ai mode
  const scheduleAiIfNeeded = () => {
    const st = gameRef.current;
    if (st.mode !== 'vs_ai' || st.turn !== 2 || st.phase !== 'aiming') return;

    if (aiTimerRef.current) window.clearTimeout(aiTimerRef.current);
    aiTimerRef.current = window.setTimeout(() => {
      const cur = gameRef.current;
      if (cur.mode !== 'vs_ai' || cur.turn !== 2 || cur.phase !== 'aiming') return;

      // If AI has ball-in-hand, place cue ball cleanly
      if (cur.ballInHand) {
        const cue = cur.balls.find((b) => b.id === 0)!;
        cue.pocketed = false;
        cue.x = HEAD_STRING_X;
        cue.y = CENTER_Y;
        if (!isValidCuePlacement(cur.balls, cue.x, cue.y, false)) {
          outer: for (let x = PLAY_LEFT + 45; x <= PLAY_RIGHT - 45; x += 22) {
            for (let y = PLAY_TOP + 38; y <= PLAY_BOTTOM - 38; y += 22) {
              if (isValidCuePlacement(cur.balls, x, y, false)) {
                cue.x = x;
                cue.y = y;
                break outer;
              }
            }
          }
        }
        cur.ballInHand = false;
      }

      const shot = computeAiShot(cur);
      aimAngleRef.current = shot.angle;
      const normPower = Math.min(1, Math.max(0.25, (shot.power - 3.2) / 17.5));
      strikeCueBall(shot.angle, normPower);
    }, 800);
  };

  // Main Canvas2D render & physics loop (mounted once; active 60Hz only while shooting)
  useEffect(() => {
    let rafId = 0;
    lastFrameRef.current = performance.now();

    const drawBall = (ctx: CanvasRenderingContext2D, b: Ball) => {
      if (b.pocketed) return;
      const color = BALL_COLORS[b.id] || '#CBD5E1';

      // Soft table shadow
      ctx.beginPath();
      ctx.arc(b.x + 2.5, b.y + 3, BALL_R, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.38)';
      ctx.fill();

      // Base sphere
      ctx.save();
      ctx.beginPath();
      ctx.arc(b.x, b.y, BALL_R, 0, Math.PI * 2);
      ctx.clip();

      if (b.id >= 9 && b.id <= 15) {
        // Striped ball: ivory base + colored equatorial band
        ctx.fillStyle = '#F8FAFC';
        ctx.fillRect(b.x - BALL_R, b.y - BALL_R, BALL_R * 2, BALL_R * 2);
        ctx.fillStyle = color;
        ctx.fillRect(
          b.x - BALL_R,
          b.y - BALL_R * 0.54,
          BALL_R * 2,
          BALL_R * 1.08
        );
      } else {
        ctx.fillStyle = color;
        ctx.fillRect(b.x - BALL_R, b.y - BALL_R, BALL_R * 2, BALL_R * 2);
      }

      // Spherical shading gradient
      const shade = ctx.createRadialGradient(
        b.x - BALL_R * 0.35,
        b.y - BALL_R * 0.35,
        BALL_R * 0.15,
        b.x,
        b.y,
        BALL_R * 1.1
      );
      shade.addColorStop(0, 'rgba(255,255,255,0.28)');
      shade.addColorStop(0.55, 'rgba(0,0,0,0)');
      shade.addColorStop(1, 'rgba(0,0,0,0.45)');
      ctx.fillStyle = shade;
      ctx.fillRect(b.x - BALL_R, b.y - BALL_R, BALL_R * 2, BALL_R * 2);

      // Number circle for balls 1..15
      if (b.id > 0) {
        ctx.beginPath();
        ctx.arc(b.x, b.y, BALL_R * 0.46, 0, Math.PI * 2);
        ctx.fillStyle = '#F8FAFC';
        ctx.fill();

        ctx.fillStyle = '#0F172A';
        ctx.font = 'bold 8px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(b.id), b.x, b.y + 0.5);
      }

      // Specular gloss dot
      ctx.beginPath();
      ctx.arc(b.x - BALL_R * 0.35, b.y - BALL_R * 0.35, BALL_R * 0.22, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.68)';
      ctx.fill();

      ctx.restore();

      // Subtle rim outline
      ctx.beginPath();
      ctx.arc(b.x, b.y, BALL_R, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(15, 23, 42, 0.45)';
      ctx.lineWidth = 0.8;
      ctx.stroke();
    };

    const renderFrame = (now: number) => {
      const dt = Math.min((now - lastFrameRef.current) / 1000, 0.1);
      lastFrameRef.current = now;

      const st = gameRef.current;

      // Advance physics when shooting
      if (st.phase === 'shooting') {
        const res = stepBilliardsPhysics(st.balls, dt);

        for (const ev of res.events) {
          if (ev.type === 'ball_hit') {
            if (shotFirstHitRef.current === null) {
              if (ev.ballId === 0 && ev.otherId !== undefined) {
                shotFirstHitRef.current = ev.otherId;
              } else if (ev.otherId === 0 && ev.ballId !== undefined) {
                shotFirstHitRef.current = ev.ballId;
              }
            }
            soundFX.billiardHit(ev.strength);
          } else if (ev.type === 'rail_hit') {
            soundFX.billiardRail(ev.strength);
          } else if (ev.type === 'pocket' && ev.ballId !== undefined) {
            shotPocketedRef.current.push(ev.ballId);
            soundFX.billiardPocket();
          }
        }

        if (!res.moving) {
          const pocketedNow = shotPocketedRef.current.slice();
          const nextState = evaluateShotOutcome(
            st,
            pocketedNow,
            shotFirstHitRef.current
          );
          gameRef.current = nextState;

          const nonCuePots = pocketedNow.filter((id) => id !== 0).length;
          if (nonCuePots > 0 || nextState.phase === 'gameover') {
            onRecordUpdate({
              playedDelta: nextState.phase === 'gameover' ? 1 : 0,
              winAiDelta:
                nextState.phase === 'gameover' &&
                nextState.mode === 'vs_ai' &&
                nextState.winner === 1
                  ? 1
                  : 0,
              pocketedDelta: nonCuePots,
              runCount: nextState.runCount,
            });
          }

          if (nextState.phase === 'gameover') {
            if (nextState.mode === 'vs_ai' && nextState.winner === 2) {
              soundFX.loseTone();
            } else {
              soundFX.winFanfare();
            }
          }

          syncHud();
          scheduleAiIfNeeded();
        }
      }

      // Draw Table & Balls
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, TABLE_W, TABLE_H);

          // 1. Mahogany Wooden Outer Frame
          const railGrad = ctx.createLinearGradient(0, 0, TABLE_W, TABLE_H);
          railGrad.addColorStop(0, '#4A2518');
          railGrad.addColorStop(0.5, '#33180E');
          railGrad.addColorStop(1, '#4A2518');
          ctx.fillStyle = railGrad;
          ctx.beginPath();
          ctx.roundRect(0, 0, TABLE_W, TABLE_H, 18);
          ctx.fill();

          // Inner brass trim
          ctx.strokeStyle = 'rgba(217, 169, 98, 0.35)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.roundRect(8, 8, TABLE_W - 16, TABLE_H - 16, 14);
          ctx.stroke();

          // Diamond sights on rails
          ctx.fillStyle = '#D9A962';
          for (let i = 1; i <= 7; i++) {
            if (i === 4) continue;
            const dx = PLAY_LEFT + ((PLAY_RIGHT - PLAY_LEFT) * i) / 8;
            ctx.beginPath();
            ctx.arc(dx, CUSHION * 0.5, 2.3, 0, Math.PI * 2);
            ctx.arc(dx, TABLE_H - CUSHION * 0.5, 2.3, 0, Math.PI * 2);
            ctx.fill();
          }
          for (let j = 1; j <= 3; j++) {
            const dy = PLAY_TOP + ((PLAY_BOTTOM - PLAY_TOP) * j) / 4;
            ctx.beginPath();
            ctx.arc(CUSHION * 0.5, dy, 2.3, 0, Math.PI * 2);
            ctx.arc(TABLE_W - CUSHION * 0.5, dy, 2.3, 0, Math.PI * 2);
            ctx.fill();
          }

          // 2. Emerald-Teal Tournament Felt
          const feltGrad = ctx.createRadialGradient(
            TABLE_W / 2,
            TABLE_H / 2,
            40,
            TABLE_W / 2,
            TABLE_H / 2,
            TABLE_W * 0.65
          );
          feltGrad.addColorStop(0, '#0F6B50');
          feltGrad.addColorStop(1, '#094333');
          ctx.fillStyle = feltGrad;
          ctx.fillRect(PLAY_LEFT, PLAY_TOP, PLAY_RIGHT - PLAY_LEFT, PLAY_BOTTOM - PLAY_TOP);

          // Cushion inner shadow
          ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
          ctx.lineWidth = 5;
          ctx.strokeRect(
            PLAY_LEFT + 1.5,
            PLAY_TOP + 1.5,
            PLAY_RIGHT - PLAY_LEFT - 3,
            PLAY_BOTTOM - PLAY_TOP - 3
          );

          // Head string & Foot spot markings
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(HEAD_STRING_X, PLAY_TOP + 6);
          ctx.lineTo(HEAD_STRING_X, PLAY_BOTTOM - 6);
          ctx.stroke();

          ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
          ctx.beginPath();
          ctx.arc(HEAD_STRING_X, CENTER_Y, 3, 0, Math.PI * 2);
          ctx.fill();

          // 3. Pockets
          for (const p of POCKETS) {
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r + 3, 0, Math.PI * 2);
            ctx.fillStyle = '#1E140E';
            ctx.fill();

            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fillStyle = '#05070A';
            ctx.fill();
          }

          // 4. Balls
          for (const b of st.balls) {
            drawBall(ctx, b);
          }

          // 5. Ball-in-hand placement preview
          if (st.phase === 'aiming' && st.ballInHand && (st.mode !== 'vs_ai' || st.turn === 1)) {
            const pt = pointerTablePosRef.current;
            const valid = isValidCuePlacement(st.balls, pt.x, pt.y, st.isBreakShot);
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, BALL_R, 0, Math.PI * 2);
            ctx.fillStyle = valid ? 'rgba(6, 182, 212, 0.35)' : 'rgba(244, 63, 94, 0.35)';
            ctx.fill();
            ctx.strokeStyle = valid ? '#22D3EE' : '#FB7185';
            ctx.lineWidth = 2;
            ctx.stroke();
          }

          // 6. Aiming line + Ghost ball + Cue stick
          const canHumanAim =
            st.phase === 'aiming' &&
            !st.ballInHand &&
            (st.mode !== 'vs_ai' || st.turn === 1);

          if (canHumanAim) {
            const cue = st.balls.find((b) => b.id === 0);
            if (cue && !cue.pocketed) {
              const angle = aimAngleRef.current;
              const preview = computeAimPreview(st.balls, angle);

              // Dotted aim ray
              ctx.save();
              ctx.setLineDash([5, 5]);
              ctx.strokeStyle = 'rgba(226, 232, 240, 0.55)';
              ctx.lineWidth = 1.5;
              ctx.beginPath();
              ctx.moveTo(cue.x, cue.y);
              ctx.lineTo(preview.hitX, preview.hitY);
              ctx.stroke();

              // Ghost ball circle
              ctx.setLineDash([]);
              ctx.beginPath();
              ctx.arc(preview.hitX, preview.hitY, BALL_R, 0, Math.PI * 2);
              ctx.strokeStyle = 'rgba(34, 211, 238, 0.65)';
              ctx.lineWidth = 1.3;
              ctx.stroke();

              // Target ball deflection vector
              if (
                preview.targetBallId !== null &&
                preview.targetDirX !== undefined &&
                preview.targetDirY !== undefined
              ) {
                const targetBall = st.balls.find((b) => b.id === preview.targetBallId);
                if (targetBall) {
                  ctx.strokeStyle = 'rgba(250, 204, 21, 0.8)';
                  ctx.lineWidth = 2;
                  ctx.beginPath();
                  ctx.moveTo(targetBall.x, targetBall.y);
                  ctx.lineTo(
                    targetBall.x + preview.targetDirX * 56,
                    targetBall.y + preview.targetDirY * 56
                  );
                  ctx.stroke();
                }
              }
              ctx.restore();

              // Cue stick behind cue ball
              const activePower = isDraggingPowerRef.current
                ? pullPowerRef.current
                : manualPowerRef.current * 0.35;
              const pullbackOffset = BALL_R + 10 + activePower * 68;
              const stickLen = 220;
              const backX = cue.x - Math.cos(angle) * pullbackOffset;
              const backY = cue.y - Math.sin(angle) * pullbackOffset;
              const buttX = backX - Math.cos(angle) * stickLen;
              const buttY = backY - Math.sin(angle) * stickLen;

              // Cue shadow
              ctx.strokeStyle = 'rgba(0,0,0,0.4)';
              ctx.lineWidth = 6.5;
              ctx.lineCap = 'round';
              ctx.beginPath();
              ctx.moveTo(backX + 2, backY + 3);
              ctx.lineTo(buttX + 2, buttY + 3);
              ctx.stroke();

              // Cue shaft
              const cueGrad = ctx.createLinearGradient(backX, backY, buttX, buttY);
              cueGrad.addColorStop(0, '#38BDF8'); // tip chalk
              cueGrad.addColorStop(0.03, '#F8FAFC'); // ferrule
              cueGrad.addColorStop(0.06, '#E7C89C'); // maple shaft
              cueGrad.addColorStop(0.65, '#9A6338');
              cueGrad.addColorStop(1, '#1E1B18'); // wrap
              ctx.strokeStyle = cueGrad;
              ctx.lineWidth = 5.5;
              ctx.beginPath();
              ctx.moveTo(backX, backY);
              ctx.lineTo(buttX, buttY);
              ctx.stroke();
            }
          }
        }
      }

      rafId = 0;
      if (gameRef.current.phase === 'shooting') {
        rafId = requestAnimationFrame(renderFrame);
      }
    };

    const scheduleRender = () => {
      if (rafId === 0) {
        lastFrameRef.current = performance.now();
        rafId = requestAnimationFrame(renderFrame);
      }
    };

    scheduleRenderRef.current = scheduleRender;
    scheduleRender();

    return () => {
      if (rafId !== 0) cancelAnimationFrame(rafId);
      if (aiTimerRef.current) window.clearTimeout(aiTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const screenToTable = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: CENTER_Y, y: CENTER_Y };
    const rect = canvas.getBoundingClientRect();
    const scaleX = TABLE_W / Math.max(1, rect.width);
    const scaleY = TABLE_H / Math.max(1, rect.height);
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const st = gameRef.current;
    if (st.phase !== 'aiming') return;
    if (st.mode === 'vs_ai' && st.turn === 2) return;

    const pt = screenToTable(e.clientX, e.clientY);
    pointerTablePosRef.current = pt;

    if (st.ballInHand) {
      if (isValidCuePlacement(st.balls, pt.x, pt.y, st.isBreakShot)) {
        const cue = st.balls.find((b) => b.id === 0)!;
        cue.pocketed = false;
        cue.x = pt.x;
        cue.y = pt.y;
        cue.vx = 0;
        cue.vy = 0;
        st.ballInHand = false;
        st.statusMessage = 'Биток установлен — прицельтесь для удара';
        soundFX.click();
        syncHud();
        scheduleRenderRef.current();
      }
      return;
    }

    const cue = st.balls.find((b) => b.id === 0);
    if (!cue) return;

    e.currentTarget.setPointerCapture(e.pointerId);
    aimAngleRef.current = Math.atan2(pt.y - cue.y, pt.x - cue.x);
    isDraggingPowerRef.current = true;
    dragStartRef.current = pt;
    pullPowerRef.current = 0;
    scheduleRenderRef.current();
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const st = gameRef.current;
    const pt = screenToTable(e.clientX, e.clientY);
    pointerTablePosRef.current = pt;

    if (st.phase !== 'aiming') return;
    if (st.mode === 'vs_ai' && st.turn === 2) return;
    if (st.ballInHand) {
      scheduleRenderRef.current();
      return;
    }

    const cue = st.balls.find((b) => b.id === 0);
    if (!cue) return;

    if (isDraggingPowerRef.current && dragStartRef.current) {
      const dx = pt.x - dragStartRef.current.x;
      const dy = pt.y - dragStartRef.current.y;
      const dragDist = Math.hypot(dx, dy);
      const power = Math.min(1, dragDist / 130);
      pullPowerRef.current = power;
      const pct = Math.round(power * 100);
      setSliderPower(pct);
    } else {
      aimAngleRef.current = Math.atan2(pt.y - cue.y, pt.x - cue.x);
    }
    scheduleRenderRef.current();
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDraggingPowerRef.current) return;
    isDraggingPowerRef.current = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }

    const pwr = pullPowerRef.current;
    pullPowerRef.current = 0;

    if (pwr >= 0.07) {
      strikeCueBall(aimAngleRef.current, pwr);
    } else {
      scheduleRenderRef.current();
    }
  };

  const groupLabel = (g: 'solid' | 'stripe' | null) =>
    g === 'solid' ? 'Сплошные (1–7)' : g === 'stripe' ? 'Полосатые (9–15)' : 'Не выбраны';

  return (
    <div className="flex flex-col gap-4 w-full max-w-5xl mx-auto">
      {/* Mode & Difficulty Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[#111622] border border-white/8 rounded-xl p-3.5">
        <div className="flex flex-wrap items-center gap-1.5">
          {([
            { id: 'vs_ai', label: 'Против ИИ', icon: Cpu },
            { id: 'practice', label: 'Тренировка', icon: Target },
            { id: 'local_2p', label: '2 игрока', icon: Users },
          ] as const).map((m) => {
            const Icon = m.icon;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => resetTable(m.id, hud.difficulty)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                  hud.mode === m.id
                    ? 'bg-emerald-500 text-slate-950'
                    : 'bg-[#19202F] text-slate-300 hover:text-white border border-white/8'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{m.label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          {hud.mode === 'vs_ai' && (
            <div className="flex items-center gap-1 bg-[#0B0F17] p-1 rounded-lg">
              {([
                { id: 'casual', label: 'Любитель' },
                { id: 'pro', label: 'Профи' },
              ] as const).map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => resetTable('vs_ai', d.id)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                    hud.difficulty === d.id
                      ? 'bg-[#1F293B] text-emerald-300'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={() => resetTable()}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold transition-colors whitespace-nowrap"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Новый стол</span>
          </button>
        </div>
      </div>

      {/* Live Status & Groups Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-[#111622] border border-white/8 text-xs">
        <div className="flex items-center gap-3">
          <span
            className={`font-semibold ${
              hud.phase === 'gameover' ? 'text-emerald-300' : 'text-slate-100'
            }`}
            data-testid="billiards-status"
          >
            {hud.statusMessage}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-slate-300">
          {hud.mode !== 'practice' && (
            <>
              <span>
                {hud.mode === 'vs_ai' ? 'Вы' : 'Игрок 1'}:{' '}
                <strong className="text-cyan-300">{groupLabel(hud.player1Group)}</strong>
              </span>
              <span aria-hidden="true" className="text-slate-700">·</span>
              <span>
                {hud.mode === 'vs_ai' ? 'Компьютер' : 'Игрок 2'}:{' '}
                <strong className="text-amber-300">{groupLabel(hud.player2Group)}</strong>
              </span>
            </>
          )}
          <span className="font-mono-num text-slate-400">
            Забито: <strong className="text-slate-100">{hud.pocketedIds.length}/15</strong>
          </span>
        </div>
      </div>

      {/* Billiards Canvas Surface */}
      <div className="relative w-full rounded-2xl overflow-hidden border border-white/10 bg-[#0B0F17] shadow-2xl">
        <canvas
          ref={canvasRef}
          width={TABLE_W}
          height={TABLE_H}
          data-testid="billiards-canvas"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={() => {
            isDraggingPowerRef.current = false;
            pullPowerRef.current = 0;
          }}
          className="w-full h-auto block touch-none cursor-crosshair select-none"
        />
      </div>

      {/* Tactile Power Control & Pocketed Tray */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-center bg-[#111622] border border-white/8 rounded-xl p-3.5">
        <div className="flex flex-wrap items-center gap-3">
          <label
            htmlFor="billiards-power"
            className="text-xs font-semibold text-slate-300 whitespace-nowrap"
          >
            Сила удара:
          </label>
          <input
            id="billiards-power"
            type="range"
            min={10}
            max={100}
            value={sliderPower}
            onChange={(e) => {
              const val = Number(e.target.value);
              setSliderPower(val);
              manualPowerRef.current = val / 100;
            }}
            className="w-40 sm:w-56 accent-emerald-500 cursor-pointer"
          />
          <span className="font-mono-num text-xs font-bold text-emerald-300 w-10">
            {sliderPower}%
          </span>
          <button
            type="button"
            disabled={
              hud.phase !== 'aiming' ||
              hud.ballInHand ||
              (hud.mode === 'vs_ai' && hud.turn === 2)
            }
            onClick={() => strikeCueBall(aimAngleRef.current, manualPowerRef.current)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 disabled:pointer-events-none text-slate-950 text-xs font-bold transition-colors whitespace-nowrap"
          >
            <Crosshair className="w-3.5 h-3.5" />
            <span>Ударить кием</span>
          </button>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs text-slate-400 mr-1">Луза:</span>
          {hud.pocketedIds.length === 0 ? (
            <span className="text-xs text-slate-500">пока пусто</span>
          ) : (
            hud.pocketedIds.map((id) => (
              <span
                key={id}
                className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-mono-num font-bold border border-white/25"
                style={{
                  backgroundColor: id >= 9 ? '#F8FAFC' : BALL_COLORS[id],
                  color: id >= 9 || id === 1 ? '#0F172A' : '#F8FAFC',
                }}
              >
                {id}
              </span>
            ))
          )}
        </div>
      </div>

      <p className="text-xs text-slate-400 text-center">
        Наведите указатель в направлении удара, зажмите кнопку мыши (или палец) и
        оттяните назад, либо задайте силу ползунком и нажмите «Ударить кием».
      </p>
    </div>
  );
};
