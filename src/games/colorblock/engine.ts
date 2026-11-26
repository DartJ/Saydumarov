export const COLOR_GRID_SIZE = 8;

export type BlockColor = 'cyan' | 'amber' | 'rose' | 'emerald' | 'violet' | 'sky';

export interface BlockShape {
  id: string;
  cells: [number, number][]; // [rowOffset, colOffset]
  color: BlockColor;
  width: number;
  height: number;
}

export interface ColorBlockState {
  grid: (BlockColor | null)[][]; // 8x8
  tray: (BlockShape | null)[]; // 3 pieces
  score: number;
  linesCleared: number;
  streak: number;
  bestCombo: number;
  gameOver: boolean;
}

export interface PlacementPreview {
  valid: boolean;
  cells: [number, number][];
  clearingRows: number[];
  clearingCols: number[];
}

const COLORS: BlockColor[] = ['cyan', 'amber', 'rose', 'emerald', 'violet', 'sky'];

const SHAPE_TEMPLATES: { id: string; cells: [number, number][] }[] = [
  { id: 'dot', cells: [[0, 0]] },
  { id: 'h2', cells: [[0, 0], [0, 1]] },
  { id: 'v2', cells: [[0, 0], [1, 0]] },
  { id: 'h3', cells: [[0, 0], [0, 1], [0, 2]] },
  { id: 'v3', cells: [[0, 0], [1, 0], [2, 0]] },
  { id: 'h4', cells: [[0, 0], [0, 1], [0, 2], [0, 3]] },
  { id: 'v4', cells: [[0, 0], [1, 0], [2, 0], [3, 0]] },
  { id: 'sq2', cells: [[0, 0], [0, 1], [1, 0], [1, 1]] },
  { id: 'sq3', cells: [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2], [2, 0], [2, 1], [2, 2]] },
  { id: 'l3a', cells: [[0, 0], [1, 0], [1, 1]] },
  { id: 'l3b', cells: [[0, 1], [1, 0], [1, 1]] },
  { id: 'l3c', cells: [[0, 0], [0, 1], [1, 0]] },
  { id: 'l3d', cells: [[0, 0], [0, 1], [1, 1]] },
  { id: 'l4', cells: [[0, 0], [1, 0], [2, 0], [2, 1]] },
  { id: 'j4', cells: [[0, 1], [1, 1], [2, 0], [2, 1]] },
  { id: 't4', cells: [[0, 0], [0, 1], [0, 2], [1, 1]] },
  { id: 'z4', cells: [[0, 0], [0, 1], [1, 1], [1, 2]] },
  { id: 's4', cells: [[0, 1], [0, 2], [1, 0], [1, 1]] },
];

function makeShape(tplIdx: number, colorIdx: number): BlockShape {
  const tpl = SHAPE_TEMPLATES[tplIdx % SHAPE_TEMPLATES.length];
  let maxR = 0;
  let maxC = 0;
  for (const [r, c] of tpl.cells) {
    if (r > maxR) maxR = r;
    if (c > maxC) maxC = c;
  }
  return {
    id: `${tpl.id}_${Math.random().toString(36).slice(2, 6)}`,
    cells: tpl.cells.map(([r, c]) => [r, c]),
    color: COLORS[colorIdx % COLORS.length],
    height: maxR + 1,
    width: maxC + 1,
  };
}

export function createEmptyGrid(): (BlockColor | null)[][] {
  return Array.from({ length: COLOR_GRID_SIZE }, () =>
    Array.from({ length: COLOR_GRID_SIZE }, () => null)
  );
}

export function canPlaceShape(
  grid: (BlockColor | null)[][],
  shape: BlockShape,
  anchorRow: number,
  anchorCol: number
): boolean {
  for (const [dr, dc] of shape.cells) {
    const r = anchorRow + dr;
    const c = anchorCol + dc;
    if (r < 0 || r >= COLOR_GRID_SIZE || c < 0 || c >= COLOR_GRID_SIZE) {
      return false;
    }
    if (grid[r][c] !== null) {
      return false;
    }
  }
  return true;
}

export function canShapeFitAnywhere(
  grid: (BlockColor | null)[][],
  shape: BlockShape
): boolean {
  for (let r = 0; r < COLOR_GRID_SIZE; r++) {
    for (let c = 0; c < COLOR_GRID_SIZE; c++) {
      if (canPlaceShape(grid, shape, r, c)) return true;
    }
  }
  return false;
}

export function generateTray(grid: (BlockColor | null)[][]): BlockShape[] {
  const tray: BlockShape[] = [];
  for (let i = 0; i < 3; i++) {
    const tplIdx = Math.floor(Math.random() * SHAPE_TEMPLATES.length);
    const colIdx = Math.floor(Math.random() * COLORS.length);
    tray.push(makeShape(tplIdx, colIdx));
  }
  // Ensure at least one piece in the tray fits if any small shape can fit
  if (!tray.some((s) => canShapeFitAnywhere(grid, s))) {
    const fitting = SHAPE_TEMPLATES.map((t, idx) => makeShape(idx, Math.floor(Math.random() * COLORS.length))).filter(
      (s) => canShapeFitAnywhere(grid, s)
    );
    if (fitting.length > 0) {
      tray[0] = fitting[Math.floor(Math.random() * Math.min(4, fitting.length))];
    }
  }
  return tray;
}

export function createInitialColorBlockState(): ColorBlockState {
  const grid = createEmptyGrid();
  return {
    grid,
    tray: generateTray(grid),
    score: 0,
    linesCleared: 0,
    streak: 0,
    bestCombo: 0,
    gameOver: false,
  };
}

export function previewColorBlockPlacement(
  grid: (BlockColor | null)[][],
  shape: BlockShape,
  anchorRow: number,
  anchorCol: number
): PlacementPreview {
  const valid = canPlaceShape(grid, shape, anchorRow, anchorCol);
  const cells: [number, number][] = shape.cells.map(([dr, dc]) => [
    anchorRow + dr,
    anchorCol + dc,
  ]);
  if (!valid) {
    return { valid: false, cells, clearingRows: [], clearingCols: [] };
  }

  const temp = grid.map((row) => [...row]);
  for (const [r, c] of cells) {
    temp[r][c] = shape.color;
  }

  const clearingRows: number[] = [];
  const clearingCols: number[] = [];
  for (let r = 0; r < COLOR_GRID_SIZE; r++) {
    if (temp[r].every((cell) => cell !== null)) clearingRows.push(r);
  }
  for (let c = 0; c < COLOR_GRID_SIZE; c++) {
    let full = true;
    for (let r = 0; r < COLOR_GRID_SIZE; r++) {
      if (temp[r][c] === null) {
        full = false;
        break;
      }
    }
    if (full) clearingCols.push(c);
  }

  return { valid: true, cells, clearingRows, clearingCols };
}

export function applyColorBlockPlacement(
  state: ColorBlockState,
  trayIndex: number,
  anchorRow: number,
  anchorCol: number
): {
  nextState: ColorBlockState;
  placed: boolean;
  clearedCount: number;
  pointsGained: number;
  clearedCells: [number, number][];
} {
  const shape = state.tray[trayIndex];
  if (!shape || state.gameOver) {
    return { nextState: state, placed: false, clearedCount: 0, pointsGained: 0, clearedCells: [] };
  }

  const preview = previewColorBlockPlacement(state.grid, shape, anchorRow, anchorCol);
  if (!preview.valid) {
    return { nextState: state, placed: false, clearedCount: 0, pointsGained: 0, clearedCells: [] };
  }

  const nextGrid = state.grid.map((row) => [...row]);
  for (const [r, c] of preview.cells) {
    nextGrid[r][c] = shape.color;
  }

  const clearedCells: [number, number][] = [];
  const clearedSet = new Set<string>();
  for (const r of preview.clearingRows) {
    for (let c = 0; c < COLOR_GRID_SIZE; c++) {
      const k = `${r},${c}`;
      if (!clearedSet.has(k)) {
        clearedSet.add(k);
        clearedCells.push([r, c]);
      }
    }
  }
  for (const c of preview.clearingCols) {
    for (let r = 0; r < COLOR_GRID_SIZE; r++) {
      const k = `${r},${c}`;
      if (!clearedSet.has(k)) {
        clearedSet.add(k);
        clearedCells.push([r, c]);
      }
    }
  }

  for (const [r, c] of clearedCells) {
    nextGrid[r][c] = null;
  }

  const clearedCount = preview.clearingRows.length + preview.clearingCols.length;
  const nextStreak = clearedCount > 0 ? state.streak + 1 : 0;

  // Points: block cells + line clear quadratic combo + streak bonus
  const baseBlockPts = shape.cells.length * 10;
  const linePts = clearedCount > 0 ? clearedCount * clearedCount * 80 + nextStreak * 40 : 0;
  const pointsGained = baseBlockPts + linePts;

  let nextTray = state.tray.map((item, idx) => (idx === trayIndex ? null : item));
  if (nextTray.every((item) => item === null)) {
    nextTray = generateTray(nextGrid);
  }

  const anyFits = nextTray.some((s) => s !== null && canShapeFitAnywhere(nextGrid, s));

  return {
    nextState: {
      grid: nextGrid,
      tray: nextTray,
      score: state.score + pointsGained,
      linesCleared: state.linesCleared + clearedCount,
      streak: nextStreak,
      bestCombo: Math.max(state.bestCombo, clearedCount),
      gameOver: !anyFits,
    },
    placed: true,
    clearedCount,
    pointsGained,
    clearedCells,
  };
}
