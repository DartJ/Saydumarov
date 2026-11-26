export type GameId =
  | 'chess'
  | 'minesweeper'
  | 'billiards'
  | 'checkers'
  | 'tictactoe'
  | 'city_driver'
  | 'tactical_fps'
  | 'color_block';

export type GameCategory = 'action' | 'strategy' | 'logic' | 'physics';

export interface GameManifest {
  id: GameId;
  title: string;
  subtitle: string;
  description: string;
  category: GameCategory;
  categoryLabel: string;
  playersLabel: string;
  supportsOnline: boolean;
  supportsAi: boolean;
  coverImage: string;
  accentColor: string;
  controlsHint: string;
}

export type PortalTab = 'hall' | 'online' | 'records' | 'settings';

export type AccentTheme = 'cyan' | 'emerald' | 'amber';

export interface UserSettings {
  nickname: string;
  soundEnabled: boolean;
  soundVolume: number;
  showLegalHints: boolean;
  accentTheme: AccentTheme;
  boardTheme: 'slate' | 'walnut' | 'emerald';
}

export interface ChessRecord {
  played: number;
  wins: number;
  draws: number;
  losses: number;
}

export interface MinesweeperRecord {
  beginnerBestSec: number | null;
  intermediateBestSec: number | null;
  expertBestSec: number | null;
  gamesWon: number;
  gamesPlayed: number;
}

export interface BilliardsRecord {
  gamesPlayed: number;
  winsVsAi: number;
  ballsPocketed: number;
  bestRun: number;
}

export interface CheckersRecord {
  played: number;
  wins: number;
}

export interface TicTacToeRecord {
  played: number;
  wins: number;
  draws: number;
}

export interface CityDriverRecord {
  totalCashEarned: number;
  missionsCompleted: number;
  maxWantedStars: number;
}

export interface TacticalFpsRecord {
  kills: number;
  deaths: number;
  headshots: number;
  roundsWon: number;
}

export interface ColorBlockRecord {
  bestScore: number;
  totalLinesCleared: number;
  bestCombo: number;
}

export interface GameRecords {
  chess: ChessRecord;
  minesweeper: MinesweeperRecord;
  billiards: BilliardsRecord;
  checkers: CheckersRecord;
  tictactoe: TicTacToeRecord;
  cityDriver: CityDriverRecord;
  tacticalFps: TacticalFpsRecord;
  colorBlock: ColorBlockRecord;
}

export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

export interface OnlineRoom {
  id: string;
  code: string;
  game_id: GameId;
  host_id: string;
  guest_id: string | null;
  host_name: string;
  guest_name: string | null;
  status: 'waiting' | 'playing' | 'finished';
  current_turn: string | null;
  state: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}
