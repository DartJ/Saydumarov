export type PieceColor = 'w' | 'b';
export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';

export interface Piece {
  type: PieceType;
  color: PieceColor;
}

export interface CastlingRights {
  wK: boolean;
  wQ: boolean;
  bK: boolean;
  bQ: boolean;
}

export interface ChessMove {
  from: number;
  to: number;
  promotion?: 'q' | 'r' | 'b' | 'n';
  isCastle?: 'K' | 'Q';
  isEnPassant?: boolean;
  captured?: Piece | null;
}

export interface MoveRecord {
  moveNumber: number;
  color: PieceColor;
  san: string;
  from: number;
  to: number;
  captured?: Piece | null;
  promotion?: 'q' | 'r' | 'b' | 'n';
}

export type ChessStatus =
  | 'playing'
  | 'check'
  | 'checkmate'
  | 'stalemate'
  | 'draw_50'
  | 'draw_insufficient'
  | 'draw_repetition';

export interface ChessState {
  board: (Piece | null)[];
  turn: PieceColor;
  castling: CastlingRights;
  enPassant: number | null;
  halfMoveClock: number;
  fullMoveNumber: number;
  history: MoveRecord[];
  positionCounts: Record<string, number>;
  status: ChessStatus;
  winner: PieceColor | 'draw' | null;
  lastMove: { from: number; to: number } | null;
  checkedKingSq: number | null;
}

const FILES = 'abcdefgh';
const RANKS = '87654321';

export function sqToCoord(sq: number): string {
  const r = Math.floor(sq / 8);
  const c = sq % 8;
  return `${FILES[c]}${RANKS[r]}`;
}

export function oppositeColor(color: PieceColor): PieceColor {
  return color === 'w' ? 'b' : 'w';
}

function positionKey(
  board: (Piece | null)[],
  turn: PieceColor,
  castling: CastlingRights,
  enPassant: number | null
): string {
  let b = '';
  for (let i = 0; i < 64; i++) {
    const p = board[i];
    b += p ? (p.color === 'w' ? p.type.toUpperCase() : p.type) : '.';
  }
  const c = `${castling.wK ? 'K' : ''}${castling.wQ ? 'Q' : ''}${castling.bK ? 'k' : ''}${castling.bQ ? 'q' : ''}`;
  return `${b}|${turn}|${c}|${enPassant ?? '-'}`;
}

export function createInitialChessState(): ChessState {
  const board: (Piece | null)[] = new Array(64).fill(null);
  const backRank: PieceType[] = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];

  for (let c = 0; c < 8; c++) {
    board[c] = { type: backRank[c], color: 'b' };
    board[8 + c] = { type: 'p', color: 'b' };
    board[48 + c] = { type: 'p', color: 'w' };
    board[56 + c] = { type: backRank[c], color: 'w' };
  }

  const castling: CastlingRights = { wK: true, wQ: true, bK: true, bQ: true };
  const key = positionKey(board, 'w', castling, null);

  return {
    board,
    turn: 'w',
    castling,
    enPassant: null,
    halfMoveClock: 0,
    fullMoveNumber: 1,
    history: [],
    positionCounts: { [key]: 1 },
    status: 'playing',
    winner: null,
    lastMove: null,
    checkedKingSq: null,
  };
}

export function findKingSquare(board: (Piece | null)[], color: PieceColor): number {
  for (let i = 0; i < 64; i++) {
    const p = board[i];
    if (p && p.color === color && p.type === 'k') return i;
  }
  return -1;
}

export function isSquareAttacked(
  board: (Piece | null)[],
  sq: number,
  byColor: PieceColor
): boolean {
  const r = Math.floor(sq / 8);
  const c = sq % 8;

  // Pawn attacks
  const pawnRow = byColor === 'w' ? r + 1 : r - 1;
  if (pawnRow >= 0 && pawnRow < 8) {
    for (const dc of [-1, 1]) {
      const pc = c + dc;
      if (pc >= 0 && pc < 8) {
        const p = board[pawnRow * 8 + pc];
        if (p && p.color === byColor && p.type === 'p') return true;
      }
    }
  }

  // Knight attacks
  const knightOffsets = [
    [-2, -1], [-2, 1], [-1, -2], [-1, 2],
    [1, -2], [1, 2], [2, -1], [2, 1],
  ];
  for (const [dr, dc] of knightOffsets) {
    const nr = r + dr;
    const nc = c + dc;
    if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
      const p = board[nr * 8 + nc];
      if (p && p.color === byColor && p.type === 'n') return true;
    }
  }

  // King attacks
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const kr = r + dr;
      const kc = c + dc;
      if (kr >= 0 && kr < 8 && kc >= 0 && kc < 8) {
        const p = board[kr * 8 + kc];
        if (p && p.color === byColor && p.type === 'k') return true;
      }
    }
  }

  // Orthogonal rays (Rook / Queen)
  const orthoDirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  for (const [dr, dc] of orthoDirs) {
    let nr = r + dr;
    let nc = c + dc;
    while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
      const p = board[nr * 8 + nc];
      if (p) {
        if (p.color === byColor && (p.type === 'r' || p.type === 'q')) return true;
        break;
      }
      nr += dr;
      nc += dc;
    }
  }

  // Diagonal rays (Bishop / Queen)
  const diagDirs = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  for (const [dr, dc] of diagDirs) {
    let nr = r + dr;
    let nc = c + dc;
    while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
      const p = board[nr * 8 + nc];
      if (p) {
        if (p.color === byColor && (p.type === 'b' || p.type === 'q')) return true;
        break;
      }
      nr += dr;
      nc += dc;
    }
  }

  return false;
}

function generatePseudoMoves(state: ChessState, onlyFrom?: number): ChessMove[] {
  const moves: ChessMove[] = [];
  const { board, turn, castling, enPassant } = state;
  const enemy = oppositeColor(turn);

  const startSq = onlyFrom !== undefined ? onlyFrom : 0;
  const endSq = onlyFrom !== undefined ? onlyFrom : 63;

  for (let sq = startSq; sq <= endSq; sq++) {
    const piece = board[sq];
    if (!piece || piece.color !== turn) continue;

    const r = Math.floor(sq / 8);
    const c = sq % 8;

    if (piece.type === 'p') {
      const dir = turn === 'w' ? -1 : 1;
      const startRow = turn === 'w' ? 6 : 1;
      const promoRow = turn === 'w' ? 0 : 7;

      const oneStepR = r + dir;
      if (oneStepR >= 0 && oneStepR < 8) {
        const oneSq = oneStepR * 8 + c;
        if (!board[oneSq]) {
          if (oneStepR === promoRow) {
            for (const promo of ['q', 'r', 'b', 'n'] as const) {
              moves.push({ from: sq, to: oneSq, promotion: promo });
            }
          } else {
            moves.push({ from: sq, to: oneSq });
            if (r === startRow) {
              const twoSq = (r + dir * 2) * 8 + c;
              if (!board[twoSq]) {
                moves.push({ from: sq, to: twoSq });
              }
            }
          }
        }

        // Captures
        for (const dc of [-1, 1]) {
          const nc = c + dc;
          if (nc < 0 || nc >= 8) continue;
          const capSq = oneStepR * 8 + nc;
          const target = board[capSq];
          if (target && target.color === enemy) {
            if (oneStepR === promoRow) {
              for (const promo of ['q', 'r', 'b', 'n'] as const) {
                moves.push({ from: sq, to: capSq, promotion: promo, captured: target });
              }
            } else {
              moves.push({ from: sq, to: capSq, captured: target });
            }
          } else if (enPassant === capSq) {
            const epCapturedSq = r * 8 + nc;
            const epTarget = board[epCapturedSq];
            if (epTarget && epTarget.color === enemy && epTarget.type === 'p') {
              moves.push({
                from: sq,
                to: capSq,
                isEnPassant: true,
                captured: epTarget,
              });
            }
          }
        }
      }
    } else if (piece.type === 'n') {
      const offsets = [
        [-2, -1], [-2, 1], [-1, -2], [-1, 2],
        [1, -2], [1, 2], [2, -1], [2, 1],
      ];
      for (const [dr, dc] of offsets) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
          const to = nr * 8 + nc;
          const target = board[to];
          if (!target || target.color === enemy) {
            moves.push({ from: sq, to, captured: target });
          }
        }
      }
    } else if (piece.type === 'b' || piece.type === 'r' || piece.type === 'q') {
      const dirs: [number, number][] = [];
      if (piece.type === 'b' || piece.type === 'q') {
        dirs.push([-1, -1], [-1, 1], [1, -1], [1, 1]);
      }
      if (piece.type === 'r' || piece.type === 'q') {
        dirs.push([-1, 0], [1, 0], [0, -1], [0, 1]);
      }
      for (const [dr, dc] of dirs) {
        let nr = r + dr;
        let nc = c + dc;
        while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
          const to = nr * 8 + nc;
          const target = board[to];
          if (!target) {
            moves.push({ from: sq, to });
          } else {
            if (target.color === enemy) {
              moves.push({ from: sq, to, captured: target });
            }
            break;
          }
          nr += dr;
          nc += dc;
        }
      }
    } else if (piece.type === 'k') {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = r + dr;
          const nc = c + dc;
          if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
            const to = nr * 8 + nc;
            const target = board[to];
            if (!target || target.color === enemy) {
              moves.push({ from: sq, to, captured: target });
            }
          }
        }
      }

      // Castling
      if (turn === 'w' && sq === 60) {
        if (
          castling.wK &&
          !board[61] &&
          !board[62] &&
          board[63]?.type === 'r' &&
          board[63]?.color === 'w' &&
          !isSquareAttacked(board, 60, 'b') &&
          !isSquareAttacked(board, 61, 'b') &&
          !isSquareAttacked(board, 62, 'b')
        ) {
          moves.push({ from: 60, to: 62, isCastle: 'K' });
        }
        if (
          castling.wQ &&
          !board[59] &&
          !board[58] &&
          !board[57] &&
          board[56]?.type === 'r' &&
          board[56]?.color === 'w' &&
          !isSquareAttacked(board, 60, 'b') &&
          !isSquareAttacked(board, 59, 'b') &&
          !isSquareAttacked(board, 58, 'b')
        ) {
          moves.push({ from: 60, to: 58, isCastle: 'Q' });
        }
      } else if (turn === 'b' && sq === 4) {
        if (
          castling.bK &&
          !board[5] &&
          !board[6] &&
          board[7]?.type === 'r' &&
          board[7]?.color === 'b' &&
          !isSquareAttacked(board, 4, 'w') &&
          !isSquareAttacked(board, 5, 'w') &&
          !isSquareAttacked(board, 6, 'w')
        ) {
          moves.push({ from: 4, to: 6, isCastle: 'K' });
        }
        if (
          castling.bQ &&
          !board[3] &&
          !board[2] &&
          !board[1] &&
          board[0]?.type === 'r' &&
          board[0]?.color === 'b' &&
          !isSquareAttacked(board, 4, 'w') &&
          !isSquareAttacked(board, 3, 'w') &&
          !isSquareAttacked(board, 2, 'w')
        ) {
          moves.push({ from: 4, to: 2, isCastle: 'Q' });
        }
      }
    }
  }

  return moves;
}

function makeBoardWithMove(board: (Piece | null)[], move: ChessMove): (Piece | null)[] {
  const next = board.slice();
  const piece = next[move.from]!;
  next[move.from] = null;

  if (move.isEnPassant) {
    const fromRow = Math.floor(move.from / 8);
    const toCol = move.to % 8;
    next[fromRow * 8 + toCol] = null;
  }

  if (move.isCastle) {
    const baseRow = piece.color === 'w' ? 56 : 0;
    if (move.isCastle === 'K') {
      next[baseRow + 5] = next[baseRow + 7];
      next[baseRow + 7] = null;
    } else {
      next[baseRow + 3] = next[baseRow + 0];
      next[baseRow + 0] = null;
    }
  }

  if (move.promotion) {
    next[move.to] = { type: move.promotion, color: piece.color };
  } else {
    next[move.to] = piece;
  }

  return next;
}

export function getLegalMoves(state: ChessState, onlyFrom?: number): ChessMove[] {
  if (
    state.status === 'checkmate' ||
    state.status === 'stalemate' ||
    state.status === 'draw_50' ||
    state.status === 'draw_insufficient' ||
    state.status === 'draw_repetition'
  ) {
    return [];
  }
  const pseudo = generatePseudoMoves(state, onlyFrom);
  const enemy = oppositeColor(state.turn);
  return pseudo.filter((move) => {
    const nextBoard = makeBoardWithMove(state.board, move);
    const kingSq = findKingSquare(nextBoard, state.turn);
    return kingSq !== -1 && !isSquareAttacked(nextBoard, kingSq, enemy);
  });
}

export function hasInsufficientMaterial(board: (Piece | null)[]): boolean {
  const pieces: { type: PieceType; color: PieceColor; sq: number }[] = [];
  for (let i = 0; i < 64; i++) {
    const p = board[i];
    if (p && p.type !== 'k') {
      pieces.push({ type: p.type, color: p.color, sq: i });
    }
  }
  if (pieces.length === 0) return true;
  if (pieces.length === 1 && (pieces[0].type === 'n' || pieces[0].type === 'b')) return true;
  if (
    pieces.length === 2 &&
    pieces[0].type === 'b' &&
    pieces[1].type === 'b' &&
    pieces[0].color !== pieces[1].color
  ) {
    const sq0Color = (Math.floor(pieces[0].sq / 8) + (pieces[0].sq % 8)) % 2;
    const sq1Color = (Math.floor(pieces[1].sq / 8) + (pieces[1].sq % 8)) % 2;
    return sq0Color === sq1Color;
  }
  return false;
}

function buildSan(
  state: ChessState,
  move: ChessMove,
  nextInCheck: boolean,
  nextHasLegalMoves: boolean
): string {
  const piece = state.board[move.from]!;
  let san = '';

  if (move.isCastle === 'K') {
    san = 'O-O';
  } else if (move.isCastle === 'Q') {
    san = 'O-O-O';
  } else {
    const isCapture = Boolean(move.captured || move.isEnPassant);
    if (piece.type === 'p') {
      if (isCapture) {
        san += FILES[move.from % 8] + 'x';
      }
      san += sqToCoord(move.to);
      if (move.promotion) {
        san += '=' + move.promotion.toUpperCase();
      }
    } else {
      san += piece.type.toUpperCase();
      // Disambiguation
      const allSameType = getLegalMoves(state).filter(
        (m) =>
          m.from !== move.from &&
          m.to === move.to &&
          state.board[m.from]?.type === piece.type
      );
      if (allSameType.length > 0) {
        const sameFile = allSameType.some((m) => m.from % 8 === move.from % 8);
        const sameRank = allSameType.some(
          (m) => Math.floor(m.from / 8) === Math.floor(move.from / 8)
        );
        if (!sameFile) {
          san += FILES[move.from % 8];
        } else if (!sameRank) {
          san += RANKS[Math.floor(move.from / 8)];
        } else {
          san += sqToCoord(move.from);
        }
      }
      if (isCapture) san += 'x';
      san += sqToCoord(move.to);
    }
  }

  if (nextInCheck) {
    san += nextHasLegalMoves ? '+' : '#';
  }
  return san;
}

export function applyChessMove(state: ChessState, move: ChessMove): ChessState {
  const piece = state.board[move.from];
  if (!piece) return state;

  const nextBoard = makeBoardWithMove(state.board, move);
  const nextTurn = oppositeColor(state.turn);

  // Update castling rights
  const nextCastling: CastlingRights = { ...state.castling };
  if (piece.type === 'k') {
    if (piece.color === 'w') {
      nextCastling.wK = false;
      nextCastling.wQ = false;
    } else {
      nextCastling.bK = false;
      nextCastling.bQ = false;
    }
  }
  if (move.from === 63 || move.to === 63) nextCastling.wK = false;
  if (move.from === 56 || move.to === 56) nextCastling.wQ = false;
  if (move.from === 7 || move.to === 7) nextCastling.bK = false;
  if (move.from === 0 || move.to === 0) nextCastling.bQ = false;

  // En passant target
  let nextEnPassant: number | null = null;
  if (piece.type === 'p' && Math.abs(Math.floor(move.to / 8) - Math.floor(move.from / 8)) === 2) {
    nextEnPassant = (move.from + move.to) / 2;
  }

  const nextHalfMove =
    piece.type === 'p' || move.captured || move.isEnPassant ? 0 : state.halfMoveClock + 1;
  const nextFullMove = state.turn === 'b' ? state.fullMoveNumber + 1 : state.fullMoveNumber;

  const posKey = positionKey(nextBoard, nextTurn, nextCastling, nextEnPassant);
  const nextCounts = { ...state.positionCounts };
  nextCounts[posKey] = (nextCounts[posKey] || 0) + 1;

  const nextKingSq = findKingSquare(nextBoard, nextTurn);
  const nextInCheck = nextKingSq !== -1 && isSquareAttacked(nextBoard, nextKingSq, state.turn);

  // Build temp state to evaluate opponent legal moves
  const tempState: ChessState = {
    board: nextBoard,
    turn: nextTurn,
    castling: nextCastling,
    enPassant: nextEnPassant,
    halfMoveClock: nextHalfMove,
    fullMoveNumber: nextFullMove,
    history: state.history,
    positionCounts: nextCounts,
    status: 'playing',
    winner: null,
    lastMove: { from: move.from, to: move.to },
    checkedKingSq: nextInCheck ? nextKingSq : null,
  };

  const oppLegal = getLegalMoves(tempState);
  const hasLegal = oppLegal.length > 0;
  const san = buildSan(state, move, nextInCheck, hasLegal);

  let status: ChessStatus = 'playing';
  let winner: PieceColor | 'draw' | null = null;

  if (!hasLegal) {
    if (nextInCheck) {
      status = 'checkmate';
      winner = state.turn;
    } else {
      status = 'stalemate';
      winner = 'draw';
    }
  } else if (nextHalfMove >= 100) {
    status = 'draw_50';
    winner = 'draw';
  } else if (hasInsufficientMaterial(nextBoard)) {
    status = 'draw_insufficient';
    winner = 'draw';
  } else if (nextCounts[posKey] >= 3) {
    status = 'draw_repetition';
    winner = 'draw';
  } else if (nextInCheck) {
    status = 'check';
  }

  return {
    ...tempState,
    status,
    winner,
    history: [
      ...state.history,
      {
        moveNumber: state.fullMoveNumber,
        color: state.turn,
        san,
        from: move.from,
        to: move.to,
        captured: move.captured ?? null,
        promotion: move.promotion,
      },
    ],
  };
}
