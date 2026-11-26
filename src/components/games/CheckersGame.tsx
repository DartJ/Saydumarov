import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Cpu, Crown, Globe, RotateCcw, Users } from 'lucide-react';
import {
  CheckersColor,
  CheckersMove,
  CheckersState,
  applyCheckersMove,
  chooseCheckersAiMove,
  createInitialCheckersState,
  getLegalCheckersMoves,
} from '../../games/checkers/engine';
import { OnlineRoom } from '../../types/arcade';
import { pushRoomStateUpdate } from '../../services/supabaseClient';
import { soundFX } from '../../utils/sound';

interface CheckersGameProps {
  showLegalHints: boolean;
  onRecordResult: (won: boolean) => void;
  onlineRoom?: OnlineRoom | null;
  onlineUserId?: string | null;
  opponentPresent?: boolean;
}

export const CheckersGame: React.FC<CheckersGameProps> = ({
  showLegalHints,
  onRecordResult,
  onlineRoom,
  onlineUserId,
  opponentPresent = true,
}) => {
  const isOnline = Boolean(onlineRoom && onlineUserId);
  const onlineMyColor: CheckersColor =
    isOnline && onlineRoom?.host_id === onlineUserId ? 'w' : 'b';

  const [mode, setMode] = useState<'vs_ai' | 'local_2p' | 'online'>(
    isOnline ? 'online' : 'vs_ai'
  );
  const [state, setState] = useState<CheckersState>(() => {
    if (
      isOnline &&
      onlineRoom?.state &&
      Array.isArray((onlineRoom.state as unknown as CheckersState).board)
    ) {
      return onlineRoom.state as unknown as CheckersState;
    }
    return createInitialCheckersState();
  });
  const [selectedSq, setSelectedSq] = useState<number | null>(null);
  const recordedRef = useRef(false);

  useEffect(() => {
    if (!onlineRoom) return;
    setMode('online');
    const incoming = onlineRoom.state as unknown as CheckersState | undefined;
    if (incoming && Array.isArray(incoming.board)) {
      setState(incoming);
      setSelectedSq(incoming.mustContinueFrom);
    }
  }, [onlineRoom]);

  useEffect(() => {
    if (!state.winner) {
      recordedRef.current = false;
      return;
    }
    if (recordedRef.current) return;
    recordedRef.current = true;
    const myColor = mode === 'online' ? onlineMyColor : 'w';
    const won = state.winner === myColor || (mode === 'local_2p' && state.winner !== 'draw');
    if (won) soundFX.winFanfare();
    else soundFX.loseTone();
    onRecordResult(state.winner === myColor);
  }, [state.winner, mode, onlineMyColor, onRecordResult]);

  const legalMovesForSelected = useMemo(() => {
    const activeSq = state.mustContinueFrom ?? selectedSq;
    if (activeSq === null) return [];
    return getLegalCheckersMoves(state, activeSq);
  }, [state, selectedSq]);

  const allLegalMoves = useMemo(() => getLegalCheckersMoves(state), [state]);

  const executeMove = async (move: CheckersMove) => {
    const next = applyCheckersMove(state, move);
    setState(next);
    setSelectedSq(next.mustContinueFrom);
    if (move.capturedSq !== undefined) soundFX.capturePiece();
    else soundFX.movePiece();

    if (mode === 'online' && onlineRoom) {
      await pushRoomStateUpdate({
        roomId: onlineRoom.id,
        state: next as unknown as Record<string, unknown>,
        currentTurn: next.turn,
        status: next.winner ? 'finished' : 'playing',
      });
    }
  };

  // AI Turn
  useEffect(() => {
    if (mode !== 'vs_ai' || state.winner || state.turn !== 'b') return;
    const t = window.setTimeout(() => {
      const m = chooseCheckersAiMove(state);
      if (m) executeMove(m);
    }, 340);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, state]);

  const handleSquareClick = (sq: number) => {
    if (state.winner) return;
    if (mode === 'vs_ai' && state.turn !== 'w') return;
    if (mode === 'online') {
      if (onlineRoom?.status === 'waiting') return;
      if (state.turn !== onlineMyColor) return;
    }

    const match = legalMovesForSelected.find((m) => m.to === sq);
    if (match) {
      executeMove(match);
      return;
    }

    if (state.mustContinueFrom !== null) return;
    const piece = state.board[sq];
    if (piece && piece.color === state.turn) {
      const hasMoves = allLegalMoves.some((m) => m.from === sq);
      if (hasMoves) {
        setSelectedSq(sq === selectedSq ? null : sq);
      }
    } else {
      setSelectedSq(null);
    }
  };

  const resetGame = (nextMode: 'vs_ai' | 'local_2p' = mode === 'online' ? 'vs_ai' : mode) => {
    soundFX.click();
    setMode(nextMode);
    setState(createInitialCheckersState());
    setSelectedSq(null);
  };

  const flipped = mode === 'online' && onlineMyColor === 'b';
  const indices = useMemo(() => {
    const arr: number[] = [];
    for (let i = 0; i < 64; i++) arr.push(flipped ? 63 - i : i);
    return arr;
  }, [flipped]);

  const hasMandatoryCapture = allLegalMoves.some((m) => m.capturedSq !== undefined);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,540px)_300px] gap-6 items-start justify-center w-full max-w-4xl mx-auto">
      <div className="flex flex-col gap-3 w-full">
        {mode === 'online' && !opponentPresent && onlineRoom?.status === 'playing' && (
          <div className="px-4 py-2 rounded-lg bg-amber-500/15 border border-amber-500/40 text-amber-200 text-xs">
            Соперник отключился от комнаты. Ожидание переподключения...
          </div>
        )}

        <div className="aspect-square w-full rounded-xl overflow-hidden border border-white/12 bg-[#111622] shadow-2xl grid grid-cols-8 grid-rows-8">
          {indices.map((sq) => {
            const r = Math.floor(sq / 8);
            const c = sq % 8;
            const isDark = (r + c) % 2 === 1;
            const piece = state.board[sq];
            const isSelected = (state.mustContinueFrom ?? selectedSq) === sq;
            const isTarget =
              showLegalHints && legalMovesForSelected.some((m) => m.to === sq);
            const isMovable =
              showLegalHints &&
              !isSelected &&
              allLegalMoves.some((m) => m.from === sq);

            let bg = isDark ? 'bg-[#263143]' : 'bg-[#8E9BAF]';
            if (state.lastMove?.from === sq || state.lastMove?.to === sq) {
              bg = isDark ? 'bg-[#334B67]' : 'bg-[#B1C4D8]';
            }
            if (isSelected) bg = 'bg-cyan-500/45';

            return (
              <button
                key={sq}
                type="button"
                disabled={!isDark}
                onClick={() => handleSquareClick(sq)}
                aria-label={`Клетка ${r + 1}-${c + 1}`}
                className={`relative flex items-center justify-center ${bg} focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400`}
              >
                {piece && (
                  <div
                    className={`w-[74%] h-[74%] rounded-full flex items-center justify-center shadow-lg border-2 transition-transform ${
                      piece.color === 'w'
                        ? 'bg-gradient-to-b from-slate-50 to-slate-300 border-slate-400 text-slate-900'
                        : 'bg-gradient-to-b from-slate-700 to-slate-950 border-slate-500 text-amber-400'
                    } ${isMovable ? 'ring-2 ring-cyan-400/60' : ''}`}
                  >
                    {piece.king && <Crown className="w-4 h-4 sm:w-5 sm:h-5" />}
                  </div>
                )}

                {isTarget && (
                  <span className="w-4 h-4 rounded-full bg-cyan-400/80 ring-4 ring-cyan-500/20 pointer-events-none" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-4 bg-[#111622] border border-white/8 rounded-xl p-4 w-full">
        <div
          className={`px-3.5 py-2.5 rounded-lg border text-sm font-semibold ${
            state.winner
              ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
              : 'bg-[#171E2E] border-white/10 text-slate-100'
          }`}
        >
          {state.winner
            ? state.winner === 'draw'
              ? 'Ничья'
              : state.winner === 'w'
              ? 'Победили Белые!'
              : 'Победили Чёрные!'
            : state.turn === 'w'
            ? 'Ход Белых'
            : mode === 'vs_ai'
            ? 'Ход компьютера...'
            : 'Ход Чёрных'}
        </div>

        {hasMandatoryCapture && !state.winner && (
          <p className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
            Обязательное взятие доступной шашки
          </p>
        )}

        {mode !== 'online' ? (
          <div className="grid grid-cols-2 gap-1.5 p-1 bg-[#0B0F17] rounded-lg">
            <button
              type="button"
              onClick={() => resetGame('vs_ai')}
              className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-md text-xs font-semibold transition-colors whitespace-nowrap ${
                mode === 'vs_ai'
                  ? 'bg-cyan-500 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Cpu className="w-3.5 h-3.5" />
              <span>Против ИИ</span>
            </button>
            <button
              type="button"
              onClick={() => resetGame('local_2p')}
              className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-md text-xs font-semibold transition-colors whitespace-nowrap ${
                mode === 'local_2p'
                  ? 'bg-cyan-500 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>2 игрока</span>
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs text-cyan-300 bg-cyan-500/10 border border-cyan-500/30 rounded-lg px-3 py-2">
            <Globe className="w-4 h-4 shrink-0" />
            <span>
              Онлайн-комната <strong className="font-mono-num">{onlineRoom?.code}</strong> · Вы:{' '}
              {onlineMyColor === 'w' ? 'Белые' : 'Чёрные'}
            </span>
          </div>
        )}

        <button
          type="button"
          disabled={mode === 'online'}
          onClick={() => resetGame()}
          className="flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-lg bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 text-slate-950 text-xs font-bold transition-colors whitespace-nowrap"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Новая партия</span>
        </button>

        <p className="text-xs text-slate-400 leading-relaxed">
          Правила русских шашек: бой обязателен (включая бой назад), дамка ходит на
          любое число свободных диагональных клеток и может продолжать серию взятий.
        </p>
      </div>
    </div>
  );
};
