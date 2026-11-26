import React, { useCallback, useMemo, useRef, useState } from 'react';
import { RotateCcw, Sparkles, Trophy } from 'lucide-react';
import {
  BlockColor,
  BlockShape,
  COLOR_GRID_SIZE,
  ColorBlockState,
  PlacementPreview,
  applyColorBlockPlacement,
  createInitialColorBlockState,
  previewColorBlockPlacement,
} from '../../games/colorblock/engine';
import { soundFX } from '../../utils/sound';

interface ColorBlockGameProps {
  bestScore: number;
  onRecordUpdate: (stats: {
    score: number;
    linesDelta: number;
    bestCombo: number;
  }) => void;
}

const COLOR_STYLES: Record<
  BlockColor,
  { bg: string; border: string; glow: string }
> = {
  cyan: {
    bg: 'bg-cyan-400',
    border: 'border-cyan-200/70',
    glow: 'shadow-[inset_0_2px_4px_rgba(255,255,255,0.45)]',
  },
  amber: {
    bg: 'bg-amber-400',
    border: 'border-amber-200/70',
    glow: 'shadow-[inset_0_2px_4px_rgba(255,255,255,0.45)]',
  },
  rose: {
    bg: 'bg-rose-500',
    border: 'border-rose-200/70',
    glow: 'shadow-[inset_0_2px_4px_rgba(255,255,255,0.45)]',
  },
  emerald: {
    bg: 'bg-emerald-400',
    border: 'border-emerald-200/70',
    glow: 'shadow-[inset_0_2px_4px_rgba(255,255,255,0.45)]',
  },
  violet: {
    bg: 'bg-violet-500',
    border: 'border-violet-200/70',
    glow: 'shadow-[inset_0_2px_4px_rgba(255,255,255,0.45)]',
  },
  sky: {
    bg: 'bg-sky-400',
    border: 'border-sky-200/70',
    glow: 'shadow-[inset_0_2px_4px_rgba(255,255,255,0.45)]',
  },
};

export const ColorBlockGame: React.FC<ColorBlockGameProps> = ({
  bestScore,
  onRecordUpdate,
}) => {
  const [game, setGame] = useState<ColorBlockState>(() =>
    createInitialColorBlockState()
  );
  const [selectedTrayIdx, setSelectedTrayIdx] = useState<number | null>(0);
  const [hoverCell, setHoverCell] = useState<[number, number] | null>(null);
  const [dragState, setDragState] = useState<{
    trayIdx: number;
    x: number;
    y: number;
  } | null>(null);
  const [flashBanner, setFlashBanner] = useState<string | null>(null);
  const [poppingKeys, setPoppingKeys] = useState<Set<string>>(() => new Set());

  const gridRef = useRef<HTMLDivElement | null>(null);

  const activeIdx = dragState ? dragState.trayIdx : selectedTrayIdx;
  const activeShape: BlockShape | null =
    activeIdx !== null ? game.tray[activeIdx] ?? null : null;

  const preview: PlacementPreview | null = useMemo(() => {
    if (!activeShape || !hoverCell) return null;
    const anchorRow = hoverCell[0] - Math.floor((activeShape.height - 1) / 2);
    const anchorCol = hoverCell[1] - Math.floor((activeShape.width - 1) / 2);
    return previewColorBlockPlacement(game.grid, activeShape, anchorRow, anchorCol);
  }, [activeShape, game.grid, hoverCell]);

  const previewSet = useMemo(() => {
    const s = new Set<string>();
    if (!preview) return s;
    for (const [r, c] of preview.cells) s.add(`${r},${c}`);
    return s;
  }, [preview]);

  const clearingRowSet = useMemo(
    () => new Set(preview?.clearingRows ?? []),
    [preview]
  );
  const clearingColSet = useMemo(
    () => new Set(preview?.clearingCols ?? []),
    [preview]
  );

  const placeAtCell = useCallback(
    (trayIdx: number, centerRow: number, centerCol: number) => {
      const shape = game.tray[trayIdx];
      if (!shape) return false;
      const anchorRow = centerRow - Math.floor((shape.height - 1) / 2);
      const anchorCol = centerCol - Math.floor((shape.width - 1) / 2);
      const res = applyColorBlockPlacement(game, trayIdx, anchorRow, anchorCol);
      if (!res.placed) return false;

      setGame(res.nextState);
      setHoverCell(null);

      if (res.clearedCount > 0) {
        soundFX.winFanfare();
        const keys = new Set(res.clearedCells.map(([r, c]) => `${r},${c}`));
        setPoppingKeys(keys);
        window.setTimeout(() => setPoppingKeys(new Set()), 320);

        const label =
          res.clearedCount >= 3
            ? `МЕГА КОМБО ×${res.clearedCount}! +${res.pointsGained}`
            : res.clearedCount === 2
            ? `Двойная линия! +${res.pointsGained}`
            : res.nextState.streak > 1
            ? `Серия ×${res.nextState.streak}! +${res.pointsGained}`
            : `+${res.pointsGained}`;
        setFlashBanner(label);
        window.setTimeout(() => setFlashBanner(null), 1300);
      } else {
        soundFX.movePiece();
      }

      if (res.nextState.gameOver) {
        soundFX.loseTone();
      }

      onRecordUpdate({
        score: res.nextState.score,
        linesDelta: res.clearedCount,
        bestCombo: res.nextState.bestCombo,
      });

      // Auto-select next available piece in tray
      const nextAvail = res.nextState.tray.findIndex((p) => p !== null);
      setSelectedTrayIdx(nextAvail >= 0 ? nextAvail : null);
      return true;
    },
    [game, onRecordUpdate]
  );

  const cellFromClientPoint = (clientX: number, clientY: number): [number, number] | null => {
    const el = gridRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top - 28; // slight upward offset while dragging
    if (x < 0 || y < 0 || x >= rect.width || y >= rect.height) return null;
    const col = Math.floor((x / rect.width) * COLOR_GRID_SIZE);
    const row = Math.floor((y / rect.height) * COLOR_GRID_SIZE);
    if (row < 0 || row >= COLOR_GRID_SIZE || col < 0 || col >= COLOR_GRID_SIZE) return null;
    return [row, col];
  };

  const handleTrayPointerDown = (
    idx: number,
    e: React.PointerEvent<HTMLButtonElement>
  ) => {
    if (!game.tray[idx] || game.gameOver) return;
    soundFX.click();
    setSelectedTrayIdx(idx);
    setDragState({ trayIdx: idx, x: e.clientX, y: e.clientY });

    const onMove = (ev: PointerEvent) => {
      setDragState({ trayIdx: idx, x: ev.clientX, y: ev.clientY });
      setHoverCell(cellFromClientPoint(ev.clientX, ev.clientY));
    };

    const onUp = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      const cell = cellFromClientPoint(ev.clientX, ev.clientY);
      setDragState(null);
      if (cell) {
        placeAtCell(idx, cell[0], cell[1]);
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const handleRestart = () => {
    soundFX.click();
    setGame(createInitialColorBlockState());
    setSelectedTrayIdx(0);
    setHoverCell(null);
    setFlashBanner(null);
  };

  const displayedBest = Math.max(bestScore, game.score);

  return (
    <div className="max-w-4xl mx-auto flex flex-col gap-5 select-none">
      {/* Top Score & Controls Strip */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-[#111622] border border-white/8 rounded-2xl px-5 py-4">
        <div className="flex items-center gap-6">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-slate-400">Очки</div>
            <div className="font-mono-num text-2xl sm:text-3xl font-bold text-cyan-300 leading-none mt-0.5">
              {game.score}
            </div>
          </div>
          <div className="border-l border-white/10 pl-5">
            <div className="text-[11px] uppercase tracking-wider text-slate-400 flex items-center gap-1">
              <Trophy className="w-3.5 h-3.5 text-amber-400" />
              <span>Рекорд</span>
            </div>
            <div className="font-mono-num text-xl sm:text-2xl font-bold text-amber-300 leading-none mt-0.5">
              {displayedBest}
            </div>
          </div>
          <div className="border-l border-white/10 pl-5 hidden sm:block">
            <div className="text-[11px] uppercase tracking-wider text-slate-400">Линии</div>
            <div className="font-mono-num text-xl font-bold text-slate-100 leading-none mt-0.5">
              {game.linesCleared}
            </div>
          </div>
          {game.streak > 1 && (
            <div className="flex items-center gap-1 text-xs font-bold text-emerald-400">
              <Sparkles className="w-4 h-4" />
              <span>Серия ×{game.streak}</span>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={handleRestart}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#19202F] hover:bg-[#232D42] border border-white/10 text-xs font-semibold text-slate-100 transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Новая игра</span>
        </button>
      </div>

      {/* Main Board + Piece Tray */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6 items-start">
        <div className="relative bg-[#0E131E] border border-white/10 rounded-2xl p-3 sm:p-5 flex justify-center">
          <div
            ref={gridRef}
            onMouseLeave={() => {
              if (!dragState) setHoverCell(null);
            }}
            className="grid grid-cols-8 gap-1.5 w-full max-w-[440px] aspect-square bg-[#080B12] p-2 rounded-xl border border-white/8"
          >
            {game.grid.map((row, r) =>
              row.map((cell, c) => {
                const key = `${r},${c}`;
                const isPreview = previewSet.has(key);
                const isClearingHighlight =
                  preview?.valid && (clearingRowSet.has(r) || clearingColSet.has(c));
                const isPopping = poppingKeys.has(key);

                let cellClass =
                  'bg-[#131926] border border-white/5 hover:border-white/15';
                if (cell) {
                  const st = COLOR_STYLES[cell];
                  cellClass = `${st.bg} ${st.border} ${st.glow} border`;
                } else if (isPreview && activeShape) {
                  const st = COLOR_STYLES[activeShape.color];
                  cellClass = preview?.valid
                    ? `${st.bg} opacity-55 border border-white/50 scale-[0.96]`
                    : 'bg-rose-500/35 border border-rose-400/60';
                }

                if (isClearingHighlight && cell) {
                  cellClass += ' ring-2 ring-white/85 brightness-125';
                }
                if (isPopping) {
                  cellClass += ' scale-75 opacity-30';
                }

                return (
                  <button
                    key={key}
                    type="button"
                    aria-label={`Клетка ${r + 1}:${c + 1}`}
                    onMouseEnter={() => {
                      if (!dragState) setHoverCell([r, c]);
                    }}
                    onClick={() => {
                      if (activeIdx !== null) {
                        placeAtCell(activeIdx, r, c);
                      }
                    }}
                    className={`w-full h-full rounded-lg transition-all duration-100 ${cellClass}`}
                  />
                );
              })
            )}
          </div>

          {/* Floating Combo Banner */}
          {flashBanner && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-xl bg-amber-400 text-slate-950 font-display text-xs sm:text-sm font-bold shadow-lg pointer-events-none animate-bounce">
              {flashBanner}
            </div>
          )}

          {/* Game Over Overlay */}
          {game.gameOver && (
            <div className="absolute inset-0 rounded-2xl bg-[#090D16]/85 flex items-center justify-center p-6">
              <div className="max-w-xs w-full bg-[#111622] border border-white/12 rounded-2xl p-6 text-center flex flex-col gap-3">
                <h2 className="font-display text-xl font-bold text-white">Ходов больше нет</h2>
                <p className="text-xs text-slate-300">
                  Итоговый счёт: <span className="font-mono-num font-bold text-cyan-300">{game.score}</span> ·
                  Линий: <span className="font-mono-num font-bold text-white">{game.linesCleared}</span>
                </p>
                <button
                  type="button"
                  data-start="true"
                  onClick={handleRestart}
                  className="w-full py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-sm"
                >
                  Сыграть ещё раз
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Piece Tray */}
        <div className="bg-[#111622] border border-white/8 rounded-2xl p-4 flex flex-col gap-4">
          <div>
            <h3 className="font-display text-sm font-bold text-white">Фигуры</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Перетащите блок на поле или выберите фигуру и кликните по клетке
            </p>
          </div>

          <div className="grid grid-cols-3 lg:grid-cols-1 gap-3">
            {game.tray.map((shape, idx) => {
              const isSelected = selectedTrayIdx === idx;
              return (
                <button
                  key={idx}
                  type="button"
                  aria-label={
                    shape
                      ? `Фигура ${idx + 1}: ${shape.cells.length} кл.`
                      : `Слот ${idx + 1}: пусто`
                  }
                  disabled={!shape || game.gameOver}
                  onPointerDown={(e) => handleTrayPointerDown(idx, e)}
                  className={`min-h-[96px] rounded-xl border flex items-center justify-center p-3 transition-colors touch-none ${
                    !shape
                      ? 'bg-[#0A0E17] border-white/5 opacity-30 cursor-default'
                      : isSelected
                      ? 'bg-[#192338] border-cyan-400/70'
                      : 'bg-[#0D121D] hover:bg-[#151D2E] border-white/10'
                  }`}
                >
                  {shape && (
                    <div
                      className="grid gap-1"
                      style={{
                        gridTemplateColumns: `repeat(${shape.width}, 18px)`,
                        gridTemplateRows: `repeat(${shape.height}, 18px)`,
                      }}
                    >
                      {Array.from({ length: shape.height }).map((_, sr) =>
                        Array.from({ length: shape.width }).map((__, sc) => {
                          const filled = shape.cells.some(
                            ([cr, cc]) => cr === sr && cc === sc
                          );
                          const st = COLOR_STYLES[shape.color];
                          return (
                            <div
                              key={`${sr}_${sc}`}
                              className={`w-[18px] h-[18px] rounded-[4px] ${
                                filled
                                  ? `${st.bg} ${st.border} ${st.glow} border`
                                  : 'bg-transparent'
                              }`}
                            />
                          );
                        })
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Dragging Ghost Piece */}
      {dragState && game.tray[dragState.trayIdx] && (
        <div
          className="fixed pointer-events-none z-50"
          style={{
            left: dragState.x,
            top: dragState.y - 28,
            transform: 'translate(-50%, -50%) scale(1.25)',
          }}
        >
          {(() => {
            const shape = game.tray[dragState.trayIdx]!;
            const st = COLOR_STYLES[shape.color];
            return (
              <div
                className="grid gap-1 opacity-90"
                style={{
                  gridTemplateColumns: `repeat(${shape.width}, 22px)`,
                  gridTemplateRows: `repeat(${shape.height}, 22px)`,
                }}
              >
                {Array.from({ length: shape.height }).map((_, sr) =>
                  Array.from({ length: shape.width }).map((__, sc) => {
                    const filled = shape.cells.some(
                      ([cr, cc]) => cr === sr && cc === sc
                    );
                    return (
                      <div
                        key={`${sr}_${sc}`}
                        className={`w-[22px] h-[22px] rounded-[5px] ${
                          filled ? `${st.bg} ${st.border} border` : 'bg-transparent'
                        }`}
                      />
                    );
                  })
                )}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
};
