import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  RotateCcw,
  Undo2,
  ArrowUpDown,
  Clock,
  Cpu,
  Users,
  Globe,
} from 'lucide-react';
import {
  ChessMove,
  ChessState,
  PieceColor,
  PieceType,
  applyChessMove,
  createInitialChessState,
  getLegalMoves,
  sqToCoord,
} from '../../games/chess/engine';
import { ChessDifficulty, chooseBestChessMove } from '../../games/chess/ai';
import { ChessPieceSvg } from './ChessPieceSvg';
import { soundFX } from '../../utils/sound';
import { OnlineRoom } from '../../types/arcade';
import { pushRoomStateUpdate } from '../../services/supabaseClient';

export type ChessMode = 'vs_ai' | 'local_2p' | 'online';
type TimeControlId = 'none' | 'blitz' | 'rapid';

const TIME_CONTROLS: Record<
  TimeControlId,
  { label: string; initialSec: number; incrementSec: number }
> = {
  none: { label: 'Без таймера', initialSec: 0, incrementSec: 0 },
  blitz: { label: '3+2 Блиц', initialSec: 180, incrementSec: 2 },
  rapid: { label: '10+0 Рапид', initialSec: 600, incrementSec: 0 },
};

const PIECE_NAMES_RU: Record<PieceType, string> = {
  p: 'Пешка',
  n: 'Конь',
  b: 'Слон',
  r: 'Ладья',
  q: 'Ферзь',
  k: 'Король',
};

const PIECE_MATERIAL: Record<PieceType, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0,
};

interface ChessGameProps {
  showLegalHints: boolean;
  onRecordResult: (outcome: 'win' | 'loss' | 'draw') => void;
  onlineRoom?: OnlineRoom | null;
  onlineUserId?: string | null;
  opponentPresent?: boolean;
}

function formatClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${String(m).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
}

export const ChessGame: React.FC<ChessGameProps> = ({
  showLegalHints,
  onRecordResult,
  onlineRoom,
  onlineUserId,
  opponentPresent = true,
}) => {
  const isOnline = Boolean(onlineRoom && onlineUserId);
  const onlineMyColor: PieceColor =
    isOnline && onlineRoom?.host_id === onlineUserId ? 'w' : 'b';

  const [mode, setMode] = useState<ChessMode>(isOnline ? 'online' : 'vs_ai');
  const [difficulty, setDifficulty] = useState<ChessDifficulty>(2);
  const [playerSide, setPlayerSide] = useState<PieceColor>('w');
  const [flipped, setFlipped] = useState<boolean>(
    isOnline ? onlineMyColor === 'b' : false
  );
  const [timeControl, setTimeControl] = useState<TimeControlId>('rapid');

  const [historyStack, setHistoryStack] = useState<ChessState[]>(() => {
    if (isOnline && onlineRoom?.state && Array.isArray((onlineRoom.state as unknown as ChessState).board)) {
      return [onlineRoom.state as unknown as ChessState];
    }
    return [createInitialChessState()];
  });

  const currentState = historyStack[historyStack.length - 1];
  const [selectedSq, setSelectedSq] = useState<number | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<{
    from: number;
    to: number;
    moves: ChessMove[];
  } | null>(null);

  const [whiteSec, setWhiteSec] = useState<number>(TIME_CONTROLS.rapid.initialSec);
  const [blackSec, setBlackSec] = useState<number>(TIME_CONTROLS.rapid.initialSec);
  const [timeoutWinner, setTimeoutWinner] = useState<PieceColor | null>(null);
  const [aiThinking, setAiThinking] = useState<boolean>(false);

  const recordedEndRef = useRef<boolean>(false);

  // Sync incoming online room state
  useEffect(() => {
    if (!onlineRoom) return;
    setMode('online');
    setFlipped(onlineMyColor === 'b');
    const incoming = onlineRoom.state as unknown as ChessState | undefined;
    if (incoming && Array.isArray(incoming.board)) {
      setHistoryStack([incoming]);
      setSelectedSq(null);
      setPendingPromotion(null);
    }
  }, [onlineRoom, onlineMyColor]);

  const effectiveGameOver =
    Boolean(timeoutWinner) ||
    currentState.status === 'checkmate' ||
    currentState.status === 'stalemate' ||
    currentState.status === 'draw_50' ||
    currentState.status === 'draw_insufficient' ||
    currentState.status === 'draw_repetition';

  // Record finished match once
  useEffect(() => {
    if (!effectiveGameOver) {
      recordedEndRef.current = false;
      return;
    }
    if (recordedEndRef.current) return;
    recordedEndRef.current = true;

    const finalWinner = timeoutWinner ?? currentState.winner;
    if (finalWinner === 'draw') {
      soundFX.checkAlert();
      onRecordResult('draw');
    } else if (finalWinner) {
      const myColor = mode === 'online' ? onlineMyColor : playerSide;
      if (mode === 'local_2p' || finalWinner === myColor) {
        soundFX.winFanfare();
        onRecordResult('win');
      } else {
        soundFX.loseTone();
        onRecordResult('loss');
      }
    }
  }, [
    effectiveGameOver,
    timeoutWinner,
    currentState.winner,
    mode,
    onlineMyColor,
    playerSide,
    onRecordResult,
  ]);

  // Active chess clock
  useEffect(() => {
    if (timeControl === 'none' || mode === 'online') return;
    if (effectiveGameOver || currentState.history.length === 0) return;

    const timer = window.setInterval(() => {
      if (currentState.turn === 'w') {
        setWhiteSec((prev) => {
          if (prev <= 1) {
            setTimeoutWinner('b');
            return 0;
          }
          return prev - 1;
        });
      } else {
        setBlackSec((prev) => {
          if (prev <= 1) {
            setTimeoutWinner('w');
            return 0;
          }
          return prev - 1;
        });
      }
    }, 1000);

    return () => window.clearInterval(timer);
  }, [timeControl, mode, effectiveGameOver, currentState.turn, currentState.history.length]);

  const legalMovesForSelected = useMemo(() => {
    if (selectedSq === null || effectiveGameOver) return [];
    return getLegalMoves(currentState, selectedSq);
  }, [currentState, selectedSq, effectiveGameOver]);

  const commitMove = async (move: ChessMove) => {
    const next = applyChessMove(currentState, move);
    setHistoryStack((prev) => [...prev, next]);
    setSelectedSq(null);
    setPendingPromotion(null);

    if (move.captured || move.isEnPassant) {
      soundFX.capturePiece();
    } else {
      soundFX.movePiece();
    }
    if (next.status === 'check' || next.status === 'checkmate') {
      setTimeout(() => soundFX.checkAlert(), 80);
    }

    // Add increment
    if (timeControl !== 'none') {
      const inc = TIME_CONTROLS[timeControl].incrementSec;
      if (inc > 0) {
        if (currentState.turn === 'w') setWhiteSec((s) => s + inc);
        else setBlackSec((s) => s + inc);
      }
    }

    if (mode === 'online' && onlineRoom) {
      const isFinished = Boolean(next.winner);
      await pushRoomStateUpdate({
        roomId: onlineRoom.id,
        state: next as unknown as Record<string, unknown>,
        currentTurn: next.turn,
        status: isFinished ? 'finished' : 'playing',
      });
    }
  };

  // AI Turn trigger
  useEffect(() => {
    if (mode !== 'vs_ai' || effectiveGameOver) return;
    if (currentState.turn === playerSide) return;

    setAiThinking(true);
    const delay = difficulty === 1 ? 220 : difficulty === 2 ? 320 : 380;
    const handle = window.setTimeout(() => {
      const aiMove = chooseBestChessMove(currentState, difficulty);
      setAiThinking(false);
      if (aiMove) {
        commitMove(aiMove);
      }
    }, delay);

    return () => {
      window.clearTimeout(handle);
      setAiThinking(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, currentState, playerSide, difficulty, effectiveGameOver]);

  const startNewGame = (
    nextMode: ChessMode = mode,
    nextSide: PieceColor = playerSide,
    nextTc: TimeControlId = timeControl
  ) => {
    soundFX.click();
    const fresh = createInitialChessState();
    setHistoryStack([fresh]);
    setSelectedSq(null);
    setPendingPromotion(null);
    setTimeoutWinner(null);
    setAiThinking(false);
    setWhiteSec(TIME_CONTROLS[nextTc].initialSec);
    setBlackSec(TIME_CONTROLS[nextTc].initialSec);
    if (nextMode === 'vs_ai') {
      setFlipped(nextSide === 'b');
    }
  };

  const handleUndo = () => {
    if (mode === 'online' || aiThinking) return;
    if (historyStack.length <= 1) return;
    soundFX.click();
    setTimeoutWinner(null);
    setSelectedSq(null);
    setPendingPromotion(null);
    if (mode === 'vs_ai') {
      // Revert back to player's turn (usually 2 plies)
      const stepsBack =
        currentState.turn === playerSide && historyStack.length >= 3 ? 2 : 1;
      setHistoryStack((prev) => prev.slice(0, Math.max(1, prev.length - stepsBack)));
    } else {
      setHistoryStack((prev) => prev.slice(0, -1));
    }
  };

  const handleSquareClick = (sq: number) => {
    if (effectiveGameOver || aiThinking || pendingPromotion) return;

    if (mode === 'vs_ai' && currentState.turn !== playerSide) return;
    if (mode === 'online') {
      if (onlineRoom?.status === 'waiting') return;
      if (currentState.turn !== onlineMyColor) return;
    }

    // Check if clicking a legal destination for selected piece
    if (selectedSq !== null) {
      const matchingMoves = legalMovesForSelected.filter((m) => m.to === sq);
      if (matchingMoves.length > 0) {
        if (matchingMoves.length > 1 && matchingMoves.some((m) => m.promotion)) {
          setPendingPromotion({
            from: selectedSq,
            to: sq,
            moves: matchingMoves,
          });
          return;
        }
        commitMove(matchingMoves[0]);
        return;
      }
    }

    // Otherwise select own piece
    const clickedPiece = currentState.board[sq];
    if (clickedPiece && clickedPiece.color === currentState.turn) {
      setSelectedSq(sq === selectedSq ? null : sq);
    } else {
      setSelectedSq(null);
    }
  };

  // Compute captured material
  const capturedSummary = useMemo(() => {
    const startCounts: Record<PieceColor, Record<PieceType, number>> = {
      w: { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 },
      b: { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 },
    };
    const currentCounts: Record<PieceColor, Record<PieceType, number>> = {
      w: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 },
      b: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 },
    };
    let wMat = 0;
    let bMat = 0;
    for (const p of currentState.board) {
      if (!p) continue;
      currentCounts[p.color][p.type]++;
      if (p.color === 'w') wMat += PIECE_MATERIAL[p.type];
      else bMat += PIECE_MATERIAL[p.type];
    }
    const lostWhite: PieceType[] = [];
    const lostBlack: PieceType[] = [];
    for (const t of ['q', 'r', 'b', 'n', 'p'] as PieceType[]) {
      for (let i = 0; i < Math.max(0, startCounts.w[t] - currentCounts.w[t]); i++) {
        lostWhite.push(t);
      }
      for (let i = 0; i < Math.max(0, startCounts.b[t] - currentCounts.b[t]); i++) {
        lostBlack.push(t);
      }
    }
    return { lostWhite, lostBlack, advantage: wMat - bMat };
  }, [currentState.board]);

  const statusText = useMemo(() => {
    if (timeoutWinner) {
      return timeoutWinner === 'w'
        ? 'Время вышло — победили Белые'
        : 'Время вышло — победили Чёрные';
    }
    switch (currentState.status) {
      case 'checkmate':
        return currentState.winner === 'w'
          ? 'Мат! Победили Белые'
          : 'Мат! Победили Чёрные';
      case 'stalemate':
        return 'Пат — ничья';
      case 'draw_50':
        return 'Ничья по правилу 50 ходов';
      case 'draw_insufficient':
        return 'Ничья — недостаточно материала';
      case 'draw_repetition':
        return 'Ничья — троекратное повторение';
      case 'check':
        return currentState.turn === 'w' ? 'Шах Белым!' : 'Шах Чёрным!';
      default:
        if (mode === 'online' && onlineRoom?.status === 'waiting') {
          return `Ожидание соперника (код: ${onlineRoom.code})`;
        }
        if (aiThinking) return 'Компьютер рассчитывает ход...';
        return currentState.turn === 'w' ? 'Ход Белых' : 'Ход Чёрных';
    }
  }, [currentState.status, currentState.turn, currentState.winner, timeoutWinner, aiThinking, mode, onlineRoom]);

  // Move pairs for history table
  const movePairs = useMemo(() => {
    const pairs: { num: number; w?: string; b?: string }[] = [];
    for (const rec of currentState.history) {
      if (rec.color === 'w') {
        pairs.push({ num: rec.moveNumber, w: rec.san });
      } else {
        const last = pairs[pairs.length - 1];
        if (last && last.num === rec.moveNumber) {
          last.b = rec.san;
        } else {
          pairs.push({ num: rec.moveNumber, b: rec.san });
        }
      }
    }
    return pairs;
  }, [currentState.history]);

  const displayIndices = useMemo(() => {
    const arr: number[] = [];
    for (let i = 0; i < 64; i++) {
      arr.push(flipped ? 63 - i : i);
    }
    return arr;
  }, [flipped]);

  const topColor: PieceColor = flipped ? 'w' : 'b';
  const bottomColor: PieceColor = flipped ? 'b' : 'w';

  const renderPlayerBar = (color: PieceColor) => {
    const isTurn = !effectiveGameOver && currentState.turn === color;
    const isWhite = color === 'w';
    const capturedByThisSide = isWhite
      ? capturedSummary.lostBlack
      : capturedSummary.lostWhite;
    const adv = isWhite ? capturedSummary.advantage : -capturedSummary.advantage;
    const sec = isWhite ? whiteSec : blackSec;

    let label = isWhite ? 'Белые' : 'Чёрные';
    if (mode === 'vs_ai') {
      label =
        color === playerSide
          ? `Вы (${isWhite ? 'Белые' : 'Чёрные'})`
          : `ИИ · Ур. ${difficulty} (${isWhite ? 'Белые' : 'Чёрные'})`;
    } else if (mode === 'online' && onlineRoom) {
      label = isWhite
        ? `${onlineRoom.host_name} (Белые)`
        : `${onlineRoom.guest_name || 'Ожидание...'} (Чёрные)`;
    }

    return (
      <div
        className={`flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-lg border transition-colors ${
          isTurn
            ? 'bg-[#161E2E] border-cyan-500/60'
            : 'bg-[#111622] border-white/8'
        }`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className={`w-3.5 h-3.5 rounded-sm shrink-0 border ${
              isWhite
                ? 'bg-slate-100 border-slate-300'
                : 'bg-slate-800 border-slate-500'
            }`}
          />
          <span className="text-sm font-semibold text-slate-100 truncate">
            {label}
          </span>
          {capturedByThisSide.length > 0 && (
            <div className="hidden sm:flex items-center -space-x-1 ml-1">
              {capturedByThisSide.slice(0, 8).map((pt, idx) => (
                <span key={idx} className="w-4 h-4 inline-block opacity-85">
                  <ChessPieceSvg
                    type={pt}
                    color={isWhite ? 'b' : 'w'}
                    className="w-full h-full"
                  />
                </span>
              ))}
            </div>
          )}
          {adv > 0 && (
            <span className="text-xs font-mono-num text-cyan-400 font-semibold">
              +{adv}
            </span>
          )}
        </div>

        {timeControl !== 'none' && mode !== 'online' && (
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md font-mono-num text-sm font-semibold ${
              isTurn
                ? 'bg-cyan-500/15 text-cyan-300'
                : 'bg-white/5 text-slate-400'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>{formatClock(sec)}</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,580px)_340px] gap-6 items-start justify-center w-full max-w-5xl mx-auto">
      {/* Left Column: Board & Player Clocks */}
      <div className="flex flex-col gap-3 w-full">
        {mode === 'online' && !opponentPresent && onlineRoom?.status === 'playing' && (
          <div className="px-4 py-2.5 rounded-lg bg-amber-500/15 border border-amber-500/40 text-amber-200 text-sm">
            Соперник временно отключился. Ожидаем переподключения...
          </div>
        )}

        {renderPlayerBar(topColor)}

        {/* Board Container */}
        <div className="relative aspect-square w-full rounded-xl overflow-hidden border border-white/12 bg-[#111622] shadow-2xl">
          <div
            className="grid grid-cols-8 grid-rows-8 w-full h-full"
            role="grid"
            aria-label="Шахматная доска"
          >
            {displayIndices.map((sq) => {
              const r = Math.floor(sq / 8);
              const c = sq % 8;
              const isDark = (r + c) % 2 === 1;
              const piece = currentState.board[sq];
              const isSelected = selectedSq === sq;
              const isLastFrom = currentState.lastMove?.from === sq;
              const isLastTo = currentState.lastMove?.to === sq;
              const isCheckedKing = currentState.checkedKingSq === sq;
              const legalMove = legalMovesForSelected.find((m) => m.to === sq);
              const isLegalTarget = showLegalHints && Boolean(legalMove);

              const fileLabel = 'abcdefgh'[c];
              const rankLabel = '87654321'[r];
              const showRank = flipped ? c === 7 : c === 0;
              const showFile = flipped ? r === 0 : r === 7;

              let bgClass = isDark ? 'bg-[#283447]' : 'bg-[#9BA8BC]';
              if (isLastFrom || isLastTo) {
                bgClass = isDark ? 'bg-[#364F6B]' : 'bg-[#BFD4E4]';
              }
              if (isSelected) {
                bgClass = 'bg-cyan-500/50';
              }
              if (isCheckedKing) {
                bgClass = 'bg-rose-600/80';
              }

              return (
                <button
                  key={sq}
                  type="button"
                  onClick={() => handleSquareClick(sq)}
                  aria-label={`Клетка ${sqToCoord(sq)}${
                    piece
                      ? `, ${piece.color === 'w' ? 'белая' : 'чёрная'} ${
                          PIECE_NAMES_RU[piece.type]
                        }`
                      : ''
                  }`}
                  className={`relative flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 transition-colors duration-100 ${bgClass}`}
                >
                  {showRank && (
                    <span
                      className={`absolute top-0.5 left-1 text-[10px] font-mono-num font-bold leading-none pointer-events-none ${
                        isDark ? 'text-slate-400' : 'text-slate-700'
                      }`}
                    >
                      {rankLabel}
                    </span>
                  )}
                  {showFile && (
                    <span
                      className={`absolute bottom-0.5 right-1 text-[10px] font-mono-num font-bold leading-none pointer-events-none ${
                        isDark ? 'text-slate-400' : 'text-slate-700'
                      }`}
                    >
                      {fileLabel}
                    </span>
                  )}

                  {piece && <ChessPieceSvg type={piece.type} color={piece.color} />}

                  {isLegalTarget && !piece && (
                    <span className="w-3.5 h-3.5 rounded-full bg-cyan-400/70 ring-2 ring-cyan-950/40 pointer-events-none" />
                  )}
                  {isLegalTarget && piece && (
                    <span className="absolute inset-1 rounded-full border-[3px] border-cyan-400/80 pointer-events-none" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Pawn Promotion Picker Modal */}
          {pendingPromotion && (
            <div className="absolute inset-0 bg-black/75 flex items-center justify-center p-4 z-20">
              <div className="bg-[#131822] border border-white/15 rounded-xl p-5 max-w-xs w-full text-center">
                <p className="text-sm font-semibold text-slate-100 mb-3">
                  Выберите фигуру для превращения
                </p>
                <div className="grid grid-cols-4 gap-2">
                  {(['q', 'r', 'b', 'n'] as const).map((promoType) => {
                    const move = pendingPromotion.moves.find(
                      (m) => m.promotion === promoType
                    );
                    if (!move) return null;
                    return (
                      <button
                        key={promoType}
                        type="button"
                        onClick={() => commitMove(move)}
                        aria-label={`Превратить в ${PIECE_NAMES_RU[promoType]}`}
                        className="aspect-square rounded-lg bg-[#1C2434] hover:bg-cyan-500/20 border border-white/10 hover:border-cyan-400 flex items-center justify-center transition-colors"
                      >
                        <ChessPieceSvg
                          type={promoType}
                          color={currentState.turn}
                          className="w-10 h-10"
                        />
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {renderPlayerBar(bottomColor)}
      </div>

      {/* Right Column: Controls, Status & Notation */}
      <div className="flex flex-col gap-4 bg-[#111622] border border-white/8 rounded-xl p-4 w-full">
        {/* Live Status Banner */}
        <div
          className={`px-3.5 py-2.5 rounded-lg border text-sm font-semibold flex items-center justify-between ${
            effectiveGameOver
              ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
              : currentState.status === 'check'
              ? 'bg-rose-500/15 border-rose-500/40 text-rose-200'
              : 'bg-[#171E2E] border-white/10 text-slate-100'
          }`}
          data-testid="chess-status"
        >
          <span>{statusText}</span>
          <span className="font-mono-num text-xs text-slate-400">
            Ход {currentState.fullMoveNumber}
          </span>
        </div>

        {/* Mode & Settings (hidden in active online room) */}
        {mode !== 'online' ? (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-1.5 p-1 bg-[#0B0F17] rounded-lg">
              <button
                type="button"
                onClick={() => {
                  setMode('vs_ai');
                  startNewGame('vs_ai', playerSide, timeControl);
                }}
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
                onClick={() => {
                  setMode('local_2p');
                  startNewGame('local_2p', playerSide, timeControl);
                }}
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

            {mode === 'vs_ai' && (
              <>
                <div>
                  <span className="block text-xs text-slate-400 mb-1.5">
                    Сила бота
                  </span>
                  <div className="grid grid-cols-3 gap-1.5">
                    {([
                      { id: 1, label: 'Новичок' },
                      { id: 2, label: 'Любитель' },
                      { id: 3, label: 'Мастер' },
                    ] as const).map((lvl) => (
                      <button
                        key={lvl.id}
                        type="button"
                        onClick={() => {
                          soundFX.click();
                          setDifficulty(lvl.id);
                        }}
                        className={`py-1.5 px-2 rounded-md text-xs font-medium border transition-colors whitespace-nowrap ${
                          difficulty === lvl.id
                            ? 'bg-cyan-500/15 border-cyan-400 text-cyan-300'
                            : 'bg-[#171E2E] border-white/8 text-slate-300 hover:border-white/20'
                        }`}
                      >
                        {lvl.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <span className="block text-xs text-slate-400 mb-1.5">
                    Ваш цвет
                  </span>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(['w', 'b'] as const).map((side) => (
                      <button
                        key={side}
                        type="button"
                        onClick={() => {
                          setPlayerSide(side);
                          startNewGame('vs_ai', side, timeControl);
                        }}
                        className={`py-1.5 px-3 rounded-md text-xs font-medium border transition-colors whitespace-nowrap ${
                          playerSide === side
                            ? 'bg-cyan-500/15 border-cyan-400 text-cyan-300'
                            : 'bg-[#171E2E] border-white/8 text-slate-300 hover:border-white/20'
                        }`}
                      >
                        {side === 'w' ? 'Белые (1-й ход)' : 'Чёрные'}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            <div>
              <span className="block text-xs text-slate-400 mb-1.5">
                Контроль времени
              </span>
              <div className="grid grid-cols-3 gap-1.5">
                {(['rapid', 'blitz', 'none'] as const).map((tc) => (
                  <button
                    key={tc}
                    type="button"
                    onClick={() => {
                      setTimeControl(tc);
                      startNewGame(mode, playerSide, tc);
                    }}
                    className={`py-1.5 px-2 rounded-md text-xs font-medium border transition-colors whitespace-nowrap ${
                      timeControl === tc
                        ? 'bg-cyan-500/15 border-cyan-400 text-cyan-300'
                        : 'bg-[#171E2E] border-white/8 text-slate-300 hover:border-white/20'
                    }`}
                  >
                    {TIME_CONTROLS[tc].label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs text-cyan-300 bg-cyan-500/10 border border-cyan-500/30 rounded-lg px-3 py-2">
            <Globe className="w-4 h-4 shrink-0" />
            <span>
              Онлайн-комната <strong className="font-mono-num">{onlineRoom?.code}</strong> · Вы
              играете за {onlineMyColor === 'w' ? 'Белых' : 'Чёрных'}
            </span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={handleUndo}
            disabled={mode === 'online' || historyStack.length <= 1 || aiThinking}
            className="flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg bg-[#1A2233] hover:bg-[#222D42] disabled:opacity-40 disabled:pointer-events-none text-xs font-semibold text-slate-100 border border-white/8 transition-colors whitespace-nowrap"
          >
            <Undo2 className="w-3.5 h-3.5" />
            <span>Отменить</span>
          </button>
          <button
            type="button"
            onClick={() => {
              soundFX.click();
              setFlipped((f) => !f);
            }}
            className="flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg bg-[#1A2233] hover:bg-[#222D42] text-xs font-semibold text-slate-100 border border-white/8 transition-colors whitespace-nowrap"
          >
            <ArrowUpDown className="w-3.5 h-3.5" />
            <span>Переворот</span>
          </button>
          <button
            type="button"
            onClick={() => startNewGame()}
            disabled={mode === 'online'}
            className="flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 disabled:pointer-events-none text-xs font-bold text-slate-950 transition-colors whitespace-nowrap"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Новая</span>
          </button>
        </div>

        {/* Move History */}
        <div className="border-t border-white/8 pt-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-300">
              История ходов
            </span>
            <span className="text-xs font-mono-num text-slate-500">
              {currentState.history.length} полуходов
            </span>
          </div>
          <div className="h-44 overflow-y-auto rounded-lg bg-[#0B0F17] border border-white/6 p-2">
            {movePairs.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-12">
                Сделайте первый ход на доске
              </p>
            ) : (
              <table className="w-full text-xs font-mono-num">
                <tbody>
                  {movePairs.map((pair) => (
                    <tr key={pair.num} className="border-b border-white/4 last:border-none">
                      <td className="py-1 px-1.5 text-slate-500 w-9">{pair.num}.</td>
                      <td className="py-1 px-1.5 text-slate-100 font-medium">{pair.w ?? ''}</td>
                      <td className="py-1 px-1.5 text-slate-300">{pair.b ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
