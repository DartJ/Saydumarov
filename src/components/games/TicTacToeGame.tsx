import React, { useEffect, useRef, useState } from 'react';
import { Cpu, Globe, RotateCcw, Users } from 'lucide-react';
import {
  GridSize,
  Mark,
  TicTacToeState,
  applyTicTacToeMove,
  chooseTicTacToeAiMove,
  createTicTacToeState,
} from '../../games/tictactoe/engine';
import { OnlineRoom } from '../../types/arcade';
import { pushRoomStateUpdate } from '../../services/supabaseClient';
import { soundFX } from '../../utils/sound';

interface TicTacToeGameProps {
  onRecordResult: (outcome: 'win' | 'draw' | 'loss') => void;
  onlineRoom?: OnlineRoom | null;
  onlineUserId?: string | null;
}

export const TicTacToeGame: React.FC<TicTacToeGameProps> = ({
  onRecordResult,
  onlineRoom,
  onlineUserId,
}) => {
  const isOnline = Boolean(onlineRoom && onlineUserId);
  const onlineMyMark: Mark =
    isOnline && onlineRoom?.host_id === onlineUserId ? 'X' : 'O';

  const [mode, setMode] = useState<'vs_ai' | 'local_2p' | 'online'>(
    isOnline ? 'online' : 'vs_ai'
  );
  const [gridSize, setGridSize] = useState<GridSize>(3);
  const [state, setState] = useState<TicTacToeState>(() => {
    if (
      isOnline &&
      onlineRoom?.state &&
      Array.isArray((onlineRoom.state as unknown as TicTacToeState).cells)
    ) {
      return onlineRoom.state as unknown as TicTacToeState;
    }
    return createTicTacToeState(3);
  });

  const recordedRef = useRef(false);

  useEffect(() => {
    if (!onlineRoom) return;
    setMode('online');
    const incoming = onlineRoom.state as unknown as TicTacToeState | undefined;
    if (incoming && Array.isArray(incoming.cells)) {
      setState(incoming);
      setGridSize(incoming.size);
    }
  }, [onlineRoom]);

  useEffect(() => {
    if (!state.winner) {
      recordedRef.current = false;
      return;
    }
    if (recordedRef.current) return;
    recordedRef.current = true;
    if (state.winner === 'draw') {
      soundFX.checkAlert();
      onRecordResult('draw');
    } else {
      const myMark = mode === 'online' ? onlineMyMark : 'X';
      if (mode === 'local_2p' || state.winner === myMark) {
        soundFX.winFanfare();
        onRecordResult('win');
      } else {
        soundFX.loseTone();
        onRecordResult('loss');
      }
    }
  }, [state.winner, mode, onlineMyMark, onRecordResult]);

  const makeMove = async (idx: number) => {
    const next = applyTicTacToeMove(state, idx);
    if (next === state) return;
    soundFX.movePiece();
    setState(next);

    if (mode === 'online' && onlineRoom) {
      await pushRoomStateUpdate({
        roomId: onlineRoom.id,
        state: next as unknown as Record<string, unknown>,
        currentTurn: next.turn,
        status: next.winner ? 'finished' : 'playing',
      });
    }
  };

  useEffect(() => {
    if (mode !== 'vs_ai' || state.winner || state.turn !== 'O') return;
    const t = window.setTimeout(() => {
      const idx = chooseTicTacToeAiMove(state);
      if (idx >= 0) makeMove(idx);
    }, 260);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, state]);

  const handleCellClick = (idx: number) => {
    if (state.winner || state.cells[idx] !== null) return;
    if (mode === 'vs_ai' && state.turn !== 'X') return;
    if (mode === 'online') {
      if (onlineRoom?.status === 'waiting') return;
      if (state.turn !== onlineMyMark) return;
    }
    makeMove(idx);
  };

  const reset = (
    nextMode: 'vs_ai' | 'local_2p' = mode === 'online' ? 'vs_ai' : mode,
    nextSize: GridSize = gridSize
  ) => {
    soundFX.click();
    setMode(nextMode);
    setGridSize(nextSize);
    setState(createTicTacToeState(nextSize));
  };

  return (
    <div className="flex flex-col items-center gap-5 w-full max-w-xl mx-auto">
      {mode !== 'online' ? (
        <div className="w-full flex flex-wrap items-center justify-between gap-3 bg-[#111622] border border-white/8 rounded-xl p-3">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => reset('vs_ai', gridSize)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                mode === 'vs_ai'
                  ? 'bg-cyan-500 text-slate-950'
                  : 'bg-[#19202F] text-slate-300'
              }`}
            >
              <Cpu className="w-3.5 h-3.5" />
              <span>Против ИИ</span>
            </button>
            <button
              type="button"
              onClick={() => reset('local_2p', gridSize)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                mode === 'local_2p'
                  ? 'bg-cyan-500 text-slate-950'
                  : 'bg-[#19202F] text-slate-300'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>2 игрока</span>
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            {([3, 5] as const).map((sz) => (
              <button
                key={sz}
                type="button"
                onClick={() => reset(mode, sz)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors whitespace-nowrap ${
                  gridSize === sz
                    ? 'bg-rose-500/20 border-rose-400 text-rose-200'
                    : 'bg-[#19202F] border-white/8 text-slate-300'
                }`}
              >
                {sz === 3 ? '3×3 (3 в ряд)' : '5×5 (4 в ряд)'}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-xs text-cyan-200">
          <span className="flex items-center gap-2">
            <Globe className="w-4 h-4" />
            Комната <strong className="font-mono-num">{onlineRoom?.code}</strong>
          </span>
          <span>Вы играете за {onlineMyMark}</span>
        </div>
      )}

      <div className="px-5 py-2.5 rounded-xl bg-[#111622] border border-white/8 text-sm font-semibold text-slate-100">
        {state.winner
          ? state.winner === 'draw'
            ? 'Ничья!'
            : `Победили ${state.winner}!`
          : `Сейчас ходит: ${state.turn}`}
      </div>

      <div
        className="grid gap-2.5 p-4 rounded-2xl bg-[#111622] border border-white/10 shadow-2xl w-full max-w-md aspect-square"
        style={{
          gridTemplateColumns: `repeat(${state.size}, minmax(0, 1fr))`,
        }}
      >
        {state.cells.map((val, idx) => {
          const isWinCell = state.winningLine?.includes(idx) ?? false;
          return (
            <button
              key={idx}
              type="button"
              onClick={() => handleCellClick(idx)}
              aria-label={`Клетка ${idx + 1}${val ? `, ${val}` : ', пустая'}`}
              className={`rounded-xl border flex items-center justify-center font-display font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
                state.size === 3 ? 'text-4xl sm:text-5xl' : 'text-2xl sm:text-3xl'
              } ${
                isWinCell
                  ? 'bg-emerald-500/20 border-emerald-400'
                  : 'bg-[#171E2E] hover:bg-[#1F293D] border-white/8'
              } ${
                val === 'X'
                  ? 'text-cyan-400'
                  : val === 'O'
                  ? 'text-rose-400'
                  : 'text-transparent'
              }`}
            >
              {val ?? '·'}
            </button>
          );
        })}
      </div>

      {mode !== 'online' && (
        <button
          type="button"
          onClick={() => reset()}
          className="flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Сыграть ещё</span>
        </button>
      )}
    </div>
  );
};
