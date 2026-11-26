import React, { useEffect, useRef, useState } from 'react';
import { Bomb, Flag, RotateCcw, Trophy } from 'lucide-react';
import {
  MINESWEEPER_PRESETS,
  MinesweeperDifficulty,
  MinesweeperState,
  chordMinesweeperCell,
  createMinesweeperState,
  revealMinesweeperCell,
  toggleMinesweeperFlag,
} from '../../games/minesweeper/engine';
import { MinesweeperRecord } from '../../types/arcade';
import { soundFX } from '../../utils/sound';

const NUM_COLORS: Record<number, string> = {
  1: 'text-sky-400',
  2: 'text-emerald-400',
  3: 'text-rose-400',
  4: 'text-indigo-400',
  5: 'text-amber-400',
  6: 'text-teal-400',
  7: 'text-fuchsia-400',
  8: 'text-slate-200',
};

interface MinesweeperGameProps {
  record: MinesweeperRecord;
  onRecordFinish: (
    difficulty: MinesweeperDifficulty,
    won: boolean,
    elapsedSec: number
  ) => void;
}

export const MinesweeperGame: React.FC<MinesweeperGameProps> = ({
  record,
  onRecordFinish,
}) => {
  const [difficulty, setDifficulty] = useState<MinesweeperDifficulty>('beginner');
  const [state, setState] = useState<MinesweeperState>(() =>
    createMinesweeperState('beginner')
  );
  const [flagMode, setFlagMode] = useState<boolean>(false);
  const [elapsedSec, setElapsedSec] = useState<number>(0);

  const recordedEndRef = useRef<boolean>(false);

  // Timer ticks while playing
  useEffect(() => {
    if (state.status !== 'playing') return;
    const id = window.setInterval(() => {
      setElapsedSec((prev) => prev + 1);
    }, 1000);
    return () => window.clearInterval(id);
  }, [state.status]);

  // Record win/loss once
  useEffect(() => {
    if (state.status !== 'won' && state.status !== 'lost') {
      recordedEndRef.current = false;
      return;
    }
    if (recordedEndRef.current) return;
    recordedEndRef.current = true;

    if (state.status === 'won') {
      soundFX.winFanfare();
      onRecordFinish(state.difficulty, true, elapsedSec);
    } else {
      soundFX.loseTone();
      onRecordFinish(state.difficulty, false, elapsedSec);
    }
  }, [state.status, state.difficulty, elapsedSec, onRecordFinish]);

  const handleReset = (nextDiff: MinesweeperDifficulty = difficulty) => {
    soundFX.click();
    setDifficulty(nextDiff);
    setState(createMinesweeperState(nextDiff));
    setElapsedSec(0);
    setFlagMode(false);
  };

  const handleCellClick = (row: number, col: number) => {
    if (state.status === 'won' || state.status === 'lost') return;
    const cell = state.cells[row * state.cols + col];
    if (!cell) return;

    if (cell.isRevealed) {
      const next = chordMinesweeperCell(state, row, col);
      if (next !== state) {
        soundFX.mineReveal();
        setState(next);
      }
      return;
    }

    if (flagMode) {
      soundFX.mineFlag();
      setState((prev) => toggleMinesweeperFlag(prev, row, col));
      return;
    }

    if (cell.isFlagged) return;
    const next = revealMinesweeperCell(state, row, col);
    if (next.status === 'playing' || next.status === 'won') {
      soundFX.mineReveal();
    }
    setState(next);
  };

  const handleContextMenu = (
    e: React.MouseEvent,
    row: number,
    col: number
  ) => {
    e.preventDefault();
    if (state.status === 'won' || state.status === 'lost') return;
    soundFX.mineFlag();
    setState((prev) => toggleMinesweeperFlag(prev, row, col));
  };

  const minesRemaining = state.totalMines - state.flagsUsed;
  const bestForCurrent =
    difficulty === 'beginner'
      ? record.beginnerBestSec
      : difficulty === 'intermediate'
      ? record.intermediateBestSec
      : record.expertBestSec;

  const cellSizeClass =
    difficulty === 'beginner'
      ? 'w-9 h-9 sm:w-11 sm:h-11 text-base'
      : difficulty === 'intermediate'
      ? 'w-7 h-7 sm:w-8 sm:h-8 text-sm'
      : 'w-6 h-6 sm:w-7 sm:h-7 text-xs';

  return (
    <div className="flex flex-col items-center gap-5 w-full max-w-5xl mx-auto">
      {/* Top Toolbar */}
      <div className="w-full flex flex-wrap items-center justify-between gap-3 bg-[#111622] border border-white/8 rounded-xl p-3.5">
        <div className="flex flex-wrap items-center gap-1.5">
          {(['beginner', 'intermediate', 'expert'] as const).map((diff) => (
            <button
              key={diff}
              type="button"
              onClick={() => handleReset(diff)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                difficulty === diff
                  ? 'bg-amber-500 text-slate-950'
                  : 'bg-[#19202F] text-slate-300 hover:text-white border border-white/8'
              }`}
            >
              {MINESWEEPER_PRESETS[diff].label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              soundFX.click();
              setFlagMode((v) => !v);
            }}
            aria-pressed={flagMode}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors whitespace-nowrap ${
              flagMode
                ? 'bg-rose-500/20 border-rose-400 text-rose-200'
                : 'bg-[#19202F] border-white/10 text-slate-300 hover:text-white'
            }`}
          >
            <Flag className="w-3.5 h-3.5" />
            <span>{flagMode ? 'Режим: Флаг' : 'Режим: Открыть'}</span>
          </button>

          <button
            type="button"
            onClick={() => handleReset(difficulty)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold transition-colors whitespace-nowrap"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Новая игра</span>
          </button>
        </div>
      </div>

      {/* HUD Strip */}
      <div className="flex flex-wrap items-center justify-center gap-6 px-5 py-3 rounded-xl bg-[#111622] border border-white/8">
        <div className="flex items-center gap-2">
          <Bomb className="w-4 h-4 text-amber-400" />
          <span className="text-xs text-slate-400">Мины:</span>
          <span
            className="font-mono-num text-lg font-bold text-amber-300"
            data-testid="mines-remaining"
          >
            {minesRemaining}
          </span>
        </div>

        <span aria-hidden="true" className="text-slate-700">·</span>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">Время:</span>
          <span
            className="font-mono-num text-lg font-bold text-slate-100"
            data-testid="mines-timer"
          >
            {String(elapsedSec).padStart(3, '0')}с
          </span>
        </div>

        <span aria-hidden="true" className="text-slate-700">·</span>

        <div className="flex items-center gap-2">
          <Trophy className="w-4 h-4 text-emerald-400" />
          <span className="text-xs text-slate-400">Рекорд:</span>
          <span className="font-mono-num text-sm font-semibold text-emerald-300">
            {bestForCurrent !== null ? `${bestForCurrent}с` : '—'}
          </span>
        </div>
      </div>

      {/* Status Outcome Banner */}
      {(state.status === 'won' || state.status === 'lost') && (
        <div
          className={`px-5 py-3 rounded-xl border text-sm font-semibold flex items-center gap-4 ${
            state.status === 'won'
              ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
              : 'bg-rose-500/15 border-rose-500/40 text-rose-200 animate-mine-shake'
          }`}
        >
          <span>
            {state.status === 'won'
              ? `Победа! Поле разминировано за ${elapsedSec} сек.`
              : 'Взрыв! Вы попали на мину.'}
          </span>
          <button
            type="button"
            onClick={() => handleReset(difficulty)}
            className="px-3 py-1 rounded-md bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition-colors whitespace-nowrap"
          >
            Сыграть ещё
          </button>
        </div>
      )}

      {/* Minefield Grid */}
      <div className="max-w-full overflow-x-auto pb-2">
        <div
          className="inline-grid gap-1 p-3 rounded-xl bg-[#111622] border border-white/10 shadow-2xl select-none"
          style={{
            gridTemplateColumns: `repeat(${state.cols}, minmax(0, 1fr))`,
          }}
          role="grid"
          aria-label="Игровое поле Сапёра"
        >
          {state.cells.map((cell) => {
            const key = `${cell.row}-${cell.col}`;
            const isExploded = state.explodedKey === key;

            let cellStyle =
              'bg-[#222B3D] hover:bg-[#2C374D] border-t border-l border-white/15 border-b-2 border-r-2 border-b-black/40 border-r-black/40';
            if (cell.isRevealed) {
              if (cell.isMine) {
                cellStyle = isExploded
                  ? 'bg-rose-600 border border-rose-300'
                  : 'bg-rose-950/70 border border-rose-500/30';
              } else {
                cellStyle =
                  'bg-[#0D1119] border border-white/5 animate-cell-pop';
              }
            } else if (cell.isFlagged) {
              cellStyle =
                'bg-[#2A2233] border border-rose-500/50';
            }

            return (
              <button
                key={key}
                type="button"
                onClick={() => handleCellClick(cell.row, cell.col)}
                onContextMenu={(e) => handleContextMenu(e, cell.row, cell.col)}
                aria-label={`Клетка ${cell.row + 1}-${cell.col + 1}${
                  cell.isFlagged
                    ? ', флаг'
                    : cell.isRevealed
                    ? cell.isMine
                      ? ', мина'
                      : `, открыта, мин рядом: ${cell.adjacentMines}`
                    : ', закрыта'
                }`}
                className={`${cellSizeClass} rounded-md flex items-center justify-center font-mono-num font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${cellStyle}`}
              >
                {cell.isRevealed ? (
                  cell.isMine ? (
                    <Bomb className="w-4 h-4 text-white" />
                  ) : cell.adjacentMines > 0 ? (
                    <span className={NUM_COLORS[cell.adjacentMines]}>
                      {cell.adjacentMines}
                    </span>
                  ) : null
                ) : cell.isFlagged ? (
                  <Flag className="w-3.5 h-3.5 text-rose-400 fill-rose-400" />
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      <p className="text-xs text-slate-400 text-center">
        Совет: нажмите на открытую цифру, когда вокруг неё выставлены все флаги, чтобы
        мгновенно раскрыть соседние безопасные клетки.
      </p>
    </div>
  );
};
