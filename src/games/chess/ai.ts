import {
  ChessMove,
  ChessState,
  PieceType,
  applyChessMove,
  findKingSquare,
  getLegalMoves,
  isSquareAttacked,
  oppositeColor,
} from './engine';

export type ChessDifficulty = 1 | 2 | 3;

const PIECE_VALUES: Record<PieceType, number> = {
  p: 100,
  n: 320,
  b: 335,
  r: 500,
  q: 900,
  k: 20000,
};

// Piece-square tables from White's perspective (rank 8 at index 0 .. rank 1 at index 63)
const PAWN_PST = [
  0,  0,  0,  0,  0,  0,  0,  0,
  50, 50, 50, 50, 50, 50, 50, 50,
  12, 14, 22, 32, 32, 22, 14, 12,
  6,  6, 12, 28, 28, 12,  6,  6,
  2,  0,  4, 24, 24,  4,  0,  2,
  4, -4,-10,  0,  0,-10, -4,  4,
  4, 10, 10,-22,-22, 10, 10,  4,
  0,  0,  0,  0,  0,  0,  0,  0,
];

const KNIGHT_PST = [
  -50,-40,-30,-30,-30,-30,-40,-50,
  -40,-20,  0,  0,  0,  0,-20,-40,
  -30,  0, 12, 16, 16, 12,  0,-30,
  -30,  6, 16, 22, 22, 16,  6,-30,
  -30,  0, 16, 22, 22, 16,  0,-30,
  -30,  6, 12, 16, 16, 12,  6,-30,
  -40,-20,  0,  6,  6,  0,-20,-40,
  -50,-40,-30,-30,-30,-30,-40,-50,
];

const BISHOP_PST = [
  -20,-10,-10,-10,-10,-10,-10,-20,
  -10,  0,  0,  0,  0,  0,  0,-10,
  -10,  0,  8, 12, 12,  8,  0,-10,
  -10,  6,  6, 12, 12,  6,  6,-10,
  -10,  0, 12, 12, 12, 12,  0,-10,
  -10, 10, 10, 10, 10, 10, 10,-10,
  -10,  6,  0,  0,  0,  0,  6,-10,
  -20,-10,-10,-10,-10,-10,-10,-20,
];

const ROOK_PST = [
   0,  0,  0,  0,  0,  0,  0,  0,
   6, 12, 12, 12, 12, 12, 12,  6,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
   0,  0,  0,  6,  6,  0,  0,  0,
];

const QUEEN_PST = [
  -20,-10,-10, -5, -5,-10,-10,-20,
  -10,  0,  0,  0,  0,  0,  0,-10,
  -10,  0,  6,  6,  6,  6,  0,-10,
   -5,  0,  6,  6,  6,  6,  0, -5,
    0,  0,  6,  6,  6,  6,  0, -5,
  -10,  5,  6,  6,  6,  6,  0,-10,
  -10,  0,  5,  0,  0,  0,  0,-10,
  -20,-10,-10, -5, -5,-10,-10,-20,
];

const KING_MID_PST = [
  -30,-40,-40,-50,-50,-40,-40,-30,
  -30,-40,-40,-50,-50,-40,-40,-30,
  -30,-40,-40,-50,-50,-40,-40,-30,
  -30,-40,-40,-50,-50,-40,-40,-30,
  -20,-30,-30,-40,-40,-30,-30,-20,
  -10,-20,-20,-20,-20,-20,-20,-10,
   20, 20,  0,  0,  0,  0, 20, 20,
   20, 32, 10,  0,  0, 10, 32, 20,
];

const KING_END_PST = [
  -50,-40,-30,-20,-20,-30,-40,-50,
  -30,-20,-10,  0,  0,-10,-20,-30,
  -30,-10, 20, 30, 30, 20,-10,-30,
  -30,-10, 30, 40, 40, 30,-10,-30,
  -30,-10, 30, 40, 40, 30,-10,-30,
  -30,-10, 20, 30, 30, 20,-10,-30,
  -30,-30,  0,  0,  0,  0,-30,-30,
  -50,-30,-30,-30,-30,-30,-30,-50,
];

export function evaluateBoard(state: ChessState): number {
  if (state.status === 'checkmate') {
    return state.winner === 'w' ? 99000 : -99000;
  }
  if (
    state.status === 'stalemate' ||
    state.status === 'draw_50' ||
    state.status === 'draw_insufficient' ||
    state.status === 'draw_repetition'
  ) {
    return 0;
  }

  let wScore = 0;
  let bScore = 0;
  let nonPawnMaterial = 0;
  let wBishops = 0;
  let bBishops = 0;

  for (let i = 0; i < 64; i++) {
    const p = state.board[i];
    if (!p) continue;
    if (p.type !== 'p' && p.type !== 'k') {
      nonPawnMaterial += PIECE_VALUES[p.type];
    }
    if (p.type === 'b') {
      if (p.color === 'w') wBishops++;
      else bBishops++;
    }
  }

  const isEndgame = nonPawnMaterial <= 2600;

  for (let sq = 0; sq < 64; sq++) {
    const p = state.board[sq];
    if (!p) continue;

    const r = Math.floor(sq / 8);
    const c = sq % 8;
    const idx = p.color === 'w' ? sq : (7 - r) * 8 + c;

    let pst = 0;
    switch (p.type) {
      case 'p':
        pst = PAWN_PST[idx];
        break;
      case 'n':
        pst = KNIGHT_PST[idx];
        break;
      case 'b':
        pst = BISHOP_PST[idx];
        break;
      case 'r':
        pst = ROOK_PST[idx];
        break;
      case 'q':
        pst = QUEEN_PST[idx];
        break;
      case 'k':
        pst = isEndgame ? KING_END_PST[idx] : KING_MID_PST[idx];
        break;
    }

    const val = PIECE_VALUES[p.type] + pst;
    if (p.color === 'w') wScore += val;
    else bScore += val;
  }

  if (wBishops >= 2) wScore += 30;
  if (bBishops >= 2) bScore += 30;

  // Mild bonus for check
  if (state.status === 'check') {
    if (state.turn === 'w') bScore += 25;
    else wScore += 25;
  }

  return wScore - bScore;
}

function orderMoves(state: ChessState, moves: ChessMove[]): ChessMove[] {
  return moves.slice().sort((a, b) => {
    const scoreA = moveOrderScore(state, a);
    const scoreB = moveOrderScore(state, b);
    return scoreB - scoreA;
  });
}

function moveOrderScore(state: ChessState, move: ChessMove): number {
  let score = 0;
  const mover = state.board[move.from];
  if (move.captured) {
    score += 10 * PIECE_VALUES[move.captured.type] - (mover ? PIECE_VALUES[mover.type] : 0);
  }
  if (move.promotion) {
    score += PIECE_VALUES[move.promotion];
  }
  if (move.isCastle) {
    score += 65;
  }
  // Center control heuristic
  const toR = Math.floor(move.to / 8);
  const toC = move.to % 8;
  if (toR >= 2 && toR <= 5 && toC >= 2 && toC <= 5) {
    score += 12;
  }
  return score;
}

function quiescence(
  state: ChessState,
  alpha: number,
  beta: number,
  maximizing: boolean,
  qDepth: number,
  deadline: number
): number {
  const standPat = evaluateBoard(state);
  if (qDepth <= 0 || performance.now() > deadline) return standPat;

  if (maximizing) {
    if (standPat >= beta) return beta;
    if (alpha < standPat) alpha = standPat;

    const captures = orderMoves(
      state,
      getLegalMoves(state).filter((m) => m.captured || m.promotion)
    );
    for (const move of captures) {
      const next = applyChessMove(state, move);
      const score = quiescence(next, alpha, beta, false, qDepth - 1, deadline);
      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
    }
    return alpha;
  } else {
    if (standPat <= alpha) return alpha;
    if (beta > standPat) beta = standPat;

    const captures = orderMoves(
      state,
      getLegalMoves(state).filter((m) => m.captured || m.promotion)
    );
    for (const move of captures) {
      const next = applyChessMove(state, move);
      const score = quiescence(next, alpha, beta, true, qDepth - 1, deadline);
      if (score <= alpha) return alpha;
      if (score < beta) beta = score;
    }
    return beta;
  }
}

function alphabeta(
  state: ChessState,
  depth: number,
  alpha: number,
  beta: number,
  maximizing: boolean,
  useQuiescence: boolean,
  deadline: number
): number {
  if (
    state.status === 'checkmate' ||
    state.status === 'stalemate' ||
    state.status === 'draw_50' ||
    state.status === 'draw_insufficient' ||
    state.status === 'draw_repetition'
  ) {
    const base = evaluateBoard(state);
    if (state.status === 'checkmate') {
      return base > 0 ? base + depth * 10 : base - depth * 10;
    }
    return 0;
  }

  if (depth <= 0 || performance.now() > deadline) {
    return useQuiescence
      ? quiescence(state, alpha, beta, maximizing, 2, deadline)
      : evaluateBoard(state);
  }

  const moves = orderMoves(state, getLegalMoves(state));
  if (moves.length === 0) return evaluateBoard(state);

  if (maximizing) {
    let best = -Infinity;
    for (const move of moves) {
      const next = applyChessMove(state, move);
      const val = alphabeta(next, depth - 1, alpha, beta, false, useQuiescence, deadline);
      if (val > best) best = val;
      if (val > alpha) alpha = val;
      if (beta <= alpha) break;
    }
    return best;
  } else {
    let best = Infinity;
    for (const move of moves) {
      const next = applyChessMove(state, move);
      const val = alphabeta(next, depth - 1, alpha, beta, true, useQuiescence, deadline);
      if (val < best) best = val;
      if (val < beta) beta = val;
      if (beta <= alpha) break;
    }
    return best;
  }
}

function tryOpeningBook(state: ChessState): ChessMove | null {
  if (state.history.length > 4) return null;
  const moves = getLegalMoves(state);
  const sanSeq = state.history.map((h) => h.san).join(' ');

  const bookMap: Record<string, string[]> = {
    '': ['e4', 'd4', 'Nf3', 'c4'],
    'e4': ['e5', 'c5', 'e6', 'c6'],
    'd4': ['d5', 'Nf6'],
    'c4': ['e5', 'Nf6', 'c5'],
    'Nf3': ['d5', 'Nf6', 'c5'],
    'e4 e5': ['Nf3', 'Bc4'],
    'e4 e5 Nf3': ['Nc6', 'Nf6'],
    'e4 c5': ['Nf3', 'Nc3'],
    'd4 d5': ['c4', 'Nf3'],
    'd4 Nf6': ['c4', 'Nf3'],
  };

  const candidates = bookMap[sanSeq];
  if (!candidates) return null;

  const targetSan = candidates[Math.floor(Math.random() * candidates.length)];
  for (const m of moves) {
    const next = applyChessMove(state, m);
    const lastSan = next.history[next.history.length - 1]?.san.replace(/[+#]/g, '');
    if (lastSan === targetSan) return m;
  }
  return null;
}

export function chooseBestChessMove(
  state: ChessState,
  difficulty: ChessDifficulty
): ChessMove | null {
  const moves = getLegalMoves(state);
  if (moves.length === 0) return null;
  if (moves.length === 1) return moves[0];

  // Use opening book on Amateur & Master difficulties
  if (difficulty >= 2) {
    const bookMove = tryOpeningBook(state);
    if (bookMove) return bookMove;
  }

  const maximizing = state.turn === 'w';
  const ordered = orderMoves(state, moves);

  if (difficulty === 1) {
    // Novice: depth 1 + slight noise
    const scored = ordered.map((m) => {
      const next = applyChessMove(state, m);
      const val = evaluateBoard(next) + (Math.random() * 70 - 35);
      return { move: m, val };
    });
    scored.sort((a, b) => (maximizing ? b.val - a.val : a.val - b.val));
    return scored[0].move;
  }

  const depth = difficulty === 2 ? 2 : 3;
  const useQuiescence = difficulty === 3;
  const deadline = performance.now() + (difficulty === 2 ? 220 : 480);

  let bestMove = ordered[0];
  let bestVal = maximizing ? -Infinity : Infinity;
  let alpha = -Infinity;
  let beta = Infinity;

  for (const move of ordered) {
    const next = applyChessMove(state, move);
    const val = alphabeta(next, depth - 1, alpha, beta, !maximizing, useQuiescence, deadline);

    if (maximizing) {
      if (val > bestVal) {
        bestVal = val;
        bestMove = move;
      }
      if (val > alpha) alpha = val;
    } else {
      if (val < bestVal) {
        bestVal = val;
        bestMove = move;
      }
      if (val < beta) beta = val;
    }

    if (performance.now() > deadline) break;
  }

  // Ensure bot never hangs king into check (already filtered by legal moves)
  const nextKing = findKingSquare(state.board, oppositeColor(state.turn));
  if (nextKing === -1 && isSquareAttacked(state.board, 0, state.turn)) {
    return ordered[0];
  }
  return bestMove;
}
