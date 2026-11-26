export type Mark = 'X' | 'O';
export type GridSize = 3 | 5;

export interface TicTacToeState {
  size: GridSize;
  winLength: number;
  cells: (Mark | null)[];
  turn: Mark;
  winner: Mark | 'draw' | null;
  winningLine: number[] | null;
}

export function createTicTacToeState(size: GridSize = 3): TicTacToeState {
  return {
    size,
    winLength: size === 3 ? 3 : 4,
    cells: new Array(size * size).fill(null),
    turn: 'X',
    winner: null,
    winningLine: null,
  };
}

function getWinningLines(size: GridSize, winLen: number): number[][] {
  const lines: number[][] = [];
  const dirs = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      for (const [dr, dc] of dirs) {
        const endR = r + dr * (winLen - 1);
        const endC = c + dc * (winLen - 1);
        if (endR >= 0 && endR < size && endC >= 0 && endC < size) {
          const line: number[] = [];
          for (let k = 0; k < winLen; k++) {
            line.push((r + dr * k) * size + (c + dc * k));
          }
          lines.push(line);
        }
      }
    }
  }
  return lines;
}

const LINES_3 = getWinningLines(3, 3);
const LINES_5 = getWinningLines(5, 4);

export function checkTicTacToeWinner(
  cells: (Mark | null)[],
  size: GridSize
): { winner: Mark | 'draw' | null; winningLine: number[] | null } {
  const lines = size === 3 ? LINES_3 : LINES_5;
  for (const line of lines) {
    const first = cells[line[0]];
    if (first && line.every((idx) => cells[idx] === first)) {
      return { winner: first, winningLine: line };
    }
  }
  if (cells.every((c) => c !== null)) {
    return { winner: 'draw', winningLine: null };
  }
  return { winner: null, winningLine: null };
}

export function applyTicTacToeMove(
  state: TicTacToeState,
  index: number
): TicTacToeState {
  if (state.winner || state.cells[index] !== null) return state;
  const cells = state.cells.slice();
  cells[index] = state.turn;
  const { winner, winningLine } = checkTicTacToeWinner(cells, state.size);
  return {
    ...state,
    cells,
    turn: state.turn === 'X' ? 'O' : 'X',
    winner,
    winningLine,
  };
}

function evaluateFiveByFive(cells: (Mark | null)[], aiMark: Mark): number {
  const opp: Mark = aiMark === 'X' ? 'O' : 'X';
  let score = 0;
  for (const line of LINES_5) {
    let aiCount = 0;
    let oppCount = 0;
    for (const idx of line) {
      if (cells[idx] === aiMark) aiCount++;
      else if (cells[idx] === opp) oppCount++;
    }
    if (aiCount > 0 && oppCount > 0) continue;
    if (aiCount === 3) score += 90;
    else if (aiCount === 2) score += 16;
    else if (aiCount === 1) score += 3;
    else if (oppCount === 3) score -= 110;
    else if (oppCount === 2) score -= 18;
    else if (oppCount === 1) score -= 3;
  }
  return score;
}

function minimax3(
  cells: (Mark | null)[],
  turn: Mark,
  aiMark: Mark,
  depth: number
): number {
  const { winner } = checkTicTacToeWinner(cells, 3);
  if (winner === aiMark) return 100 - depth;
  if (winner === 'draw') return 0;
  if (winner !== null) return depth - 100;

  const isMax = turn === aiMark;
  let best = isMax ? -Infinity : Infinity;
  const nextTurn: Mark = turn === 'X' ? 'O' : 'X';

  for (let i = 0; i < 9; i++) {
    if (cells[i] !== null) continue;
    cells[i] = turn;
    const score = minimax3(cells, nextTurn, aiMark, depth + 1);
    cells[i] = null;
    if (isMax ? score > best : score < best) best = score;
  }
  return best;
}

function alphaBeta5(
  cells: (Mark | null)[],
  turn: Mark,
  aiMark: Mark,
  depth: number,
  alpha: number,
  beta: number
): number {
  const { winner } = checkTicTacToeWinner(cells, 5);
  if (winner === aiMark) return 10000 + depth * 10;
  if (winner === 'draw') return 0;
  if (winner !== null) return -10000 - depth * 10;
  if (depth <= 0) return evaluateFiveByFive(cells, aiMark);

  const isMax = turn === aiMark;
  const nextTurn: Mark = turn === 'X' ? 'O' : 'X';
  let best = isMax ? -Infinity : Infinity;

  for (let i = 0; i < 25; i++) {
    if (cells[i] !== null) continue;
    cells[i] = turn;
    const val = alphaBeta5(cells, nextTurn, aiMark, depth - 1, alpha, beta);
    cells[i] = null;
    if (isMax) {
      if (val > best) best = val;
      if (val > alpha) alpha = val;
      if (beta <= alpha) break;
    } else {
      if (val < best) best = val;
      if (val < beta) beta = val;
      if (beta <= alpha) break;
    }
  }
  return best;
}

export function chooseTicTacToeAiMove(state: TicTacToeState): number {
  const empty: number[] = [];
  for (let i = 0; i < state.cells.length; i++) {
    if (state.cells[i] === null) empty.push(i);
  }
  if (empty.length === 0) return -1;

  const aiMark = state.turn;
  const cells = state.cells.slice();

  if (state.size === 3) {
    if (empty.length === 9) return 4;
    let bestIdx = empty[0];
    let bestVal = -Infinity;
    for (const idx of empty) {
      cells[idx] = aiMark;
      const val = minimax3(cells, aiMark === 'X' ? 'O' : 'X', aiMark, 0);
      cells[idx] = null;
      if (val > bestVal) {
        bestVal = val;
        bestIdx = idx;
      }
    }
    return bestIdx;
  }

  // 5x5 tactical AI
  if (empty.length === 25) return 12;
  let bestIdx = empty[0];
  let bestVal = -Infinity;
  for (const idx of empty) {
    cells[idx] = aiMark;
    const val = alphaBeta5(
      cells,
      aiMark === 'X' ? 'O' : 'X',
      aiMark,
      2,
      -Infinity,
      Infinity
    );
    cells[idx] = null;
    if (val > bestVal) {
      bestVal = val;
      bestIdx = idx;
    }
  }
  return bestIdx;
}
