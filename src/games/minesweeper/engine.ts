export type MinesweeperDifficulty = 'beginner' | 'intermediate' | 'expert';

export interface MinesweeperPreset {
  id: MinesweeperDifficulty;
  label: string;
  rows: number;
  cols: number;
  mines: number;
}

export const MINESWEEPER_PRESETS: Record<MinesweeperDifficulty, MinesweeperPreset> = {
  beginner: { id: 'beginner', label: 'Новичок (9×9)', rows: 9, cols: 9, mines: 10 },
  intermediate: { id: 'intermediate', label: 'Любитель (16×16)', rows: 16, cols: 16, mines: 40 },
  expert: { id: 'expert', label: 'Профессионал (30×16)', rows: 16, cols: 30, mines: 99 },
};

export interface MineCell {
  row: number;
  col: number;
  isMine: boolean;
  isRevealed: boolean;
  isFlagged: boolean;
  adjacentMines: number;
}

export type MinesweeperStatus = 'idle' | 'playing' | 'won' | 'lost';

export interface MinesweeperState {
  difficulty: MinesweeperDifficulty;
  rows: number;
  cols: number;
  totalMines: number;
  minesPlaced: boolean;
  status: MinesweeperStatus;
  cells: MineCell[];
  flagsUsed: number;
  revealedCount: number;
  explodedKey: string | null;
}

export function createMinesweeperState(difficulty: MinesweeperDifficulty): MinesweeperState {
  const preset = MINESWEEPER_PRESETS[difficulty];
  const cells: MineCell[] = [];
  for (let r = 0; r < preset.rows; r++) {
    for (let c = 0; c < preset.cols; c++) {
      cells.push({
        row: r,
        col: c,
        isMine: false,
        isRevealed: false,
        isFlagged: false,
        adjacentMines: 0,
      });
    }
  }

  return {
    difficulty,
    rows: preset.rows,
    cols: preset.cols,
    totalMines: preset.mines,
    minesPlaced: false,
    status: 'idle',
    cells,
    flagsUsed: 0,
    revealedCount: 0,
    explodedKey: null,
  };
}

function getNeighborIndices(rows: number, cols: number, r: number, c: number): number[] {
  const res: number[] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
        res.push(nr * cols + nc);
      }
    }
  }
  return res;
}

function placeMinesSafely(
  state: MinesweeperState,
  safeRow: number,
  safeCol: number
): MineCell[] {
  const { rows, cols, totalMines } = state;
  const cells = state.cells.map((c) => ({ ...c }));

  const forbidden = new Set<number>();
  forbidden.add(safeRow * cols + safeCol);
  for (const nIdx of getNeighborIndices(rows, cols, safeRow, safeCol)) {
    forbidden.add(nIdx);
  }

  const candidates: number[] = [];
  for (let i = 0; i < cells.length; i++) {
    if (!forbidden.has(i)) candidates.push(i);
  }

  // Fallback if board is super small
  if (candidates.length < totalMines) {
    for (let i = 0; i < cells.length; i++) {
      if (i !== safeRow * cols + safeCol && !candidates.includes(i)) {
        candidates.push(i);
      }
    }
  }

  // Fisher-Yates partial shuffle
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }

  for (let m = 0; m < Math.min(totalMines, candidates.length); m++) {
    cells[candidates[m]].isMine = true;
  }

  // Compute adjacent mine counts
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      if (cells[idx].isMine) continue;
      let count = 0;
      for (const nIdx of getNeighborIndices(rows, cols, r, c)) {
        if (cells[nIdx].isMine) count++;
      }
      cells[idx].adjacentMines = count;
    }
  }

  return cells;
}

export function revealMinesweeperCell(
  state: MinesweeperState,
  row: number,
  col: number
): MinesweeperState {
  if (state.status === 'won' || state.status === 'lost') return state;

  const { rows, cols, totalMines } = state;
  const startIdx = row * cols + col;
  const target = state.cells[startIdx];
  if (!target || target.isRevealed || target.isFlagged) return state;

  let cells = state.minesPlaced
    ? state.cells.map((c) => ({ ...c }))
    : placeMinesSafely(state, row, col);

  const clicked = cells[startIdx];
  if (clicked.isMine) {
    // Lost: reveal all mines
    cells = cells.map((c) => (c.isMine ? { ...c, isRevealed: true } : c));
    return {
      ...state,
      cells,
      minesPlaced: true,
      status: 'lost',
      explodedKey: `${row}-${col}`,
    };
  }

  // BFS Flood fill
  const queue: number[] = [startIdx];
  const visited = new Set<number>([startIdx]);
  let newlyRevealed = 0;

  while (queue.length > 0) {
    const idx = queue.shift()!;
    const cell = cells[idx];
    if (cell.isRevealed || cell.isFlagged || cell.isMine) continue;

    cell.isRevealed = true;
    newlyRevealed++;

    if (cell.adjacentMines === 0) {
      for (const nIdx of getNeighborIndices(rows, cols, cell.row, cell.col)) {
        if (!visited.has(nIdx) && !cells[nIdx].isRevealed && !cells[nIdx].isFlagged) {
          visited.add(nIdx);
          queue.push(nIdx);
        }
      }
    }
  }

  const totalRevealed = state.revealedCount + newlyRevealed;
  const safeTotal = rows * cols - totalMines;
  const won = totalRevealed >= safeTotal;

  if (won) {
    // Auto-flag remaining mines on win
    cells = cells.map((c) => (c.isMine ? { ...c, isFlagged: true } : c));
  }

  return {
    ...state,
    cells,
    minesPlaced: true,
    revealedCount: totalRevealed,
    flagsUsed: won ? totalMines : state.flagsUsed,
    status: won ? 'won' : 'playing',
  };
}

export function toggleMinesweeperFlag(
  state: MinesweeperState,
  row: number,
  col: number
): MinesweeperState {
  if (state.status === 'won' || state.status === 'lost') return state;
  const idx = row * state.cols + col;
  const cell = state.cells[idx];
  if (!cell || cell.isRevealed) return state;

  const cells = state.cells.map((c, i) =>
    i === idx ? { ...c, isFlagged: !c.isFlagged } : c
  );
  const delta = cell.isFlagged ? -1 : 1;

  return {
    ...state,
    cells,
    flagsUsed: state.flagsUsed + delta,
  };
}

export function chordMinesweeperCell(
  state: MinesweeperState,
  row: number,
  col: number
): MinesweeperState {
  if (state.status !== 'playing') return state;
  const idx = row * state.cols + col;
  const cell = state.cells[idx];
  if (!cell || !cell.isRevealed || cell.adjacentMines === 0) return state;

  const neighbors = getNeighborIndices(state.rows, state.cols, row, col);
  const flagCount = neighbors.filter((nIdx) => state.cells[nIdx].isFlagged).length;
  if (flagCount !== cell.adjacentMines) return state;

  let next = state;
  for (const nIdx of neighbors) {
    const nCell = next.cells[nIdx];
    if (!nCell.isRevealed && !nCell.isFlagged) {
      next = revealMinesweeperCell(next, nCell.row, nCell.col);
      if (next.status === 'lost' || next.status === 'won') break;
    }
  }
  return next;
}
