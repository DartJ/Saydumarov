export type CheckersColor = 'w' | 'b';

export interface CheckerPiece {
  color: CheckersColor;
  king: boolean;
}

export interface CheckersMove {
  from: number;
  to: number;
  capturedSq?: number;
  promoted?: boolean;
}

export interface CheckersState {
  board: (CheckerPiece | null)[];
  turn: CheckersColor;
  mustContinueFrom: number | null;
  winner: CheckersColor | 'draw' | null;
  moveCount: number;
  lastMove: { from: number; to: number } | null;
}

export function createInitialCheckersState(): CheckersState {
  const board: (CheckerPiece | null)[] = new Array(64).fill(null);
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if ((r + c) % 2 === 1) {
        if (r < 3) board[r * 8 + c] = { color: 'b', king: false };
        else if (r > 4) board[r * 8 + c] = { color: 'w', king: false };
      }
    }
  }
  return {
    board,
    turn: 'w',
    mustContinueFrom: null,
    winner: null,
    moveCount: 0,
    lastMove: null,
  };
}

function getPieceCaptures(
  board: (CheckerPiece | null)[],
  sq: number,
  piece: CheckerPiece
): CheckersMove[] {
  const moves: CheckersMove[] = [];
  const r = Math.floor(sq / 8);
  const c = sq % 8;
  const enemy: CheckersColor = piece.color === 'w' ? 'b' : 'w';
  const dirs = [[-1, -1], [-1, 1], [1, -1], [1, 1]];

  if (!piece.king) {
    // Russian checkers: regular pieces can capture both forward and backward
    for (const [dr, dc] of dirs) {
      const mr = r + dr;
      const mc = c + dc;
      const lr = r + dr * 2;
      const lc = c + dc * 2;
      if (lr >= 0 && lr < 8 && lc >= 0 && lc < 8) {
        const midSq = mr * 8 + mc;
        const landSq = lr * 8 + lc;
        const mid = board[midSq];
        if (mid && mid.color === enemy && !board[landSq]) {
          const promoted =
            (piece.color === 'w' && lr === 0) || (piece.color === 'b' && lr === 7);
          moves.push({ from: sq, to: landSq, capturedSq: midSq, promoted });
        }
      }
    }
  } else {
    // Flying king capture along diagonals
    for (const [dr, dc] of dirs) {
      let nr = r + dr;
      let nc = c + dc;
      let foundEnemySq: number | null = null;
      while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
        const curSq = nr * 8 + nc;
        const occupant = board[curSq];
        if (foundEnemySq === null) {
          if (occupant) {
            if (occupant.color === piece.color) break;
            foundEnemySq = curSq;
          }
        } else {
          if (occupant) break;
          moves.push({ from: sq, to: curSq, capturedSq: foundEnemySq });
        }
        nr += dr;
        nc += dc;
      }
    }
  }
  return moves;
}

function getPieceQuietMoves(
  board: (CheckerPiece | null)[],
  sq: number,
  piece: CheckerPiece
): CheckersMove[] {
  const moves: CheckersMove[] = [];
  const r = Math.floor(sq / 8);
  const c = sq % 8;

  if (!piece.king) {
    const dr = piece.color === 'w' ? -1 : 1;
    for (const dc of [-1, 1]) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
        const to = nr * 8 + nc;
        if (!board[to]) {
          const promoted =
            (piece.color === 'w' && nr === 0) || (piece.color === 'b' && nr === 7);
          moves.push({ from: sq, to, promoted });
        }
      }
    }
  } else {
    const dirs = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
    for (const [dr, dc] of dirs) {
      let nr = r + dr;
      let nc = c + dc;
      while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
        const to = nr * 8 + nc;
        if (board[to]) break;
        moves.push({ from: sq, to });
        nr += dr;
        nc += dc;
      }
    }
  }
  return moves;
}

export function getLegalCheckersMoves(
  state: CheckersState,
  onlyFrom?: number
): CheckersMove[] {
  if (state.winner) return [];

  if (state.mustContinueFrom !== null) {
    if (onlyFrom !== undefined && onlyFrom !== state.mustContinueFrom) return [];
    const p = state.board[state.mustContinueFrom];
    if (!p || p.color !== state.turn) return [];
    return getPieceCaptures(state.board, state.mustContinueFrom, p);
  }

  const allCaptures: CheckersMove[] = [];
  const allQuiet: CheckersMove[] = [];

  for (let sq = 0; sq < 64; sq++) {
    const p = state.board[sq];
    if (!p || p.color !== state.turn) continue;
    allCaptures.push(...getPieceCaptures(state.board, sq, p));
    if (allCaptures.length === 0) {
      allQuiet.push(...getPieceQuietMoves(state.board, sq, p));
    }
  }

  const pool = allCaptures.length > 0 ? allCaptures : allQuiet;
  if (onlyFrom !== undefined) {
    return pool.filter((m) => m.from === onlyFrom);
  }
  return pool;
}

export function applyCheckersMove(
  state: CheckersState,
  move: CheckersMove
): CheckersState {
  const piece = state.board[move.from];
  if (!piece) return state;

  const nextBoard = state.board.slice();
  nextBoard[move.from] = null;
  if (move.capturedSq !== undefined) {
    nextBoard[move.capturedSq] = null;
  }

  const nextPiece: CheckerPiece = {
    color: piece.color,
    king: piece.king || Boolean(move.promoted),
  };
  nextBoard[move.to] = nextPiece;

  // Check multi-jump continuation
  if (move.capturedSq !== undefined) {
    const moreCaptures = getPieceCaptures(nextBoard, move.to, nextPiece);
    if (moreCaptures.length > 0) {
      return {
        ...state,
        board: nextBoard,
        mustContinueFrom: move.to,
        lastMove: { from: move.from, to: move.to },
      };
    }
  }

  const nextTurn: CheckersColor = state.turn === 'w' ? 'b' : 'w';
  const nextState: CheckersState = {
    board: nextBoard,
    turn: nextTurn,
    mustContinueFrom: null,
    winner: null,
    moveCount: state.moveCount + 1,
    lastMove: { from: move.from, to: move.to },
  };

  const oppMoves = getLegalCheckersMoves(nextState);
  if (oppMoves.length === 0) {
    nextState.winner = state.turn;
  } else if (nextState.moveCount >= 160) {
    nextState.winner = 'draw';
  }

  return nextState;
}

function evaluateCheckers(state: CheckersState): number {
  if (state.winner === 'w') return 10000;
  if (state.winner === 'b') return -10000;
  if (state.winner === 'draw') return 0;

  let score = 0;
  for (let sq = 0; sq < 64; sq++) {
    const p = state.board[sq];
    if (!p) continue;
    const r = Math.floor(sq / 8);
    const c = sq % 8;
    const centerBonus = c >= 2 && c <= 5 && r >= 2 && r <= 5 ? 12 : 0;
    const advanceBonus = p.king ? 0 : (p.color === 'w' ? 7 - r : r) * 5;
    const val = (p.king ? 340 : 100) + centerBonus + advanceBonus;
    score += p.color === 'w' ? val : -val;
  }
  return score;
}

function checkersAlphaBeta(
  state: CheckersState,
  depth: number,
  alpha: number,
  beta: number
): number {
  if (state.winner || depth <= 0) return evaluateCheckers(state);
  const moves = getLegalCheckersMoves(state);
  if (moves.length === 0) return evaluateCheckers(state);

  const maximizing = state.turn === 'w';
  if (maximizing) {
    let best = -Infinity;
    for (const m of moves) {
      const next = applyCheckersMove(state, m);
      const nextDepth = next.turn === state.turn ? depth : depth - 1;
      const val = checkersAlphaBeta(next, nextDepth, alpha, beta);
      if (val > best) best = val;
      if (val > alpha) alpha = val;
      if (beta <= alpha) break;
    }
    return best;
  } else {
    let best = Infinity;
    for (const m of moves) {
      const next = applyCheckersMove(state, m);
      const nextDepth = next.turn === state.turn ? depth : depth - 1;
      const val = checkersAlphaBeta(next, nextDepth, alpha, beta);
      if (val < best) best = val;
      if (val < beta) beta = val;
      if (beta <= alpha) break;
    }
    return best;
  }
}

export function chooseCheckersAiMove(state: CheckersState): CheckersMove | null {
  const moves = getLegalCheckersMoves(state);
  if (moves.length === 0) return null;
  if (moves.length === 1) return moves[0];

  const maximizing = state.turn === 'w';
  let bestMove = moves[0];
  let bestVal = maximizing ? -Infinity : Infinity;

  for (const m of moves) {
    const next = applyCheckersMove(state, m);
    const val = checkersAlphaBeta(next, 3, -Infinity, Infinity);
    if (maximizing ? val > bestVal : val < bestVal) {
      bestVal = val;
      bestMove = m;
    }
  }
  return bestMove;
}
