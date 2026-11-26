import { GameRecords, SupabaseConfig, UserSettings } from '../types/arcade';

const SETTINGS_KEY = 'arcade_settings_v1';
const RECORDS_KEY = 'arcade_records_v1';
const SUPABASE_CFG_KEY = 'arcade_supabase_cfg_v1';
const GUEST_ID_KEY = 'arcade_guest_id_v1';

export const DEFAULT_SETTINGS: UserSettings = {
  nickname: 'Игрок-' + Math.floor(1000 + Math.random() * 9000),
  soundEnabled: true,
  soundVolume: 0.6,
  showLegalHints: true,
  accentTheme: 'cyan',
  boardTheme: 'slate',
};

export const DEFAULT_RECORDS: GameRecords = {
  chess: { played: 0, wins: 0, draws: 0, losses: 0 },
  minesweeper: {
    beginnerBestSec: null,
    intermediateBestSec: null,
    expertBestSec: null,
    gamesWon: 0,
    gamesPlayed: 0,
  },
  billiards: { gamesPlayed: 0, winsVsAi: 0, ballsPocketed: 0, bestRun: 0 },
  checkers: { played: 0, wins: 0 },
  tictactoe: { played: 0, wins: 0, draws: 0 },
  cityDriver: { totalCashEarned: 0, missionsCompleted: 0, maxWantedStars: 0 },
  tacticalFps: { kills: 0, deaths: 0, headshots: 0, roundsWon: 0 },
};

function safeGetItem(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetItem(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore storage quota or private browsing errors
  }
}

export function loadSettings(): UserSettings {
  const raw = safeGetItem(SETTINGS_KEY);
  if (!raw) {
    saveSettings(DEFAULT_SETTINGS);
    return DEFAULT_SETTINGS;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<UserSettings>;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      nickname:
        typeof parsed.nickname === 'string' && parsed.nickname.trim().length > 0
          ? parsed.nickname.trim().slice(0, 20)
          : DEFAULT_SETTINGS.nickname,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: UserSettings): void {
  safeSetItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function loadRecords(): GameRecords {
  const raw = safeGetItem(RECORDS_KEY);
  if (!raw) return DEFAULT_RECORDS;
  try {
    const parsed = JSON.parse(raw) as Partial<GameRecords>;
    return {
      chess: { ...DEFAULT_RECORDS.chess, ...parsed.chess },
      minesweeper: { ...DEFAULT_RECORDS.minesweeper, ...parsed.minesweeper },
      billiards: { ...DEFAULT_RECORDS.billiards, ...parsed.billiards },
      checkers: { ...DEFAULT_RECORDS.checkers, ...parsed.checkers },
      tictactoe: { ...DEFAULT_RECORDS.tictactoe, ...parsed.tictactoe },
      cityDriver: { ...DEFAULT_RECORDS.cityDriver, ...parsed.cityDriver },
      tacticalFps: { ...DEFAULT_RECORDS.tacticalFps, ...parsed.tacticalFps },
    };
  } catch {
    return DEFAULT_RECORDS;
  }
}

export function saveRecords(records: GameRecords): void {
  safeSetItem(RECORDS_KEY, JSON.stringify(records));
}

export function resetAllRecords(): GameRecords {
  saveRecords(DEFAULT_RECORDS);
  return DEFAULT_RECORDS;
}

export function getOrCreateGuestId(): string {
  const existing = safeGetItem(GUEST_ID_KEY);
  if (existing && existing.length >= 8) return existing;
  const generated =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : 'guest_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  safeSetItem(GUEST_ID_KEY, generated);
  return generated;
}

export function loadSupabaseConfig(): SupabaseConfig {
  const envUrl =
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL) || '';
  const envKey =
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_ANON_KEY) || '';
  if (envUrl && envKey) {
    return { url: envUrl, anonKey: envKey };
  }
  const raw = safeGetItem(SUPABASE_CFG_KEY);
  if (!raw) return { url: '', anonKey: '' };
  try {
    const parsed = JSON.parse(raw) as Partial<SupabaseConfig>;
    return {
      url: typeof parsed.url === 'string' ? parsed.url.trim() : '',
      anonKey: typeof parsed.anonKey === 'string' ? parsed.anonKey.trim() : '',
    };
  } catch {
    return { url: '', anonKey: '' };
  }
}

export function saveSupabaseConfig(cfg: SupabaseConfig): void {
  safeSetItem(
    SUPABASE_CFG_KEY,
    JSON.stringify({ url: cfg.url.trim(), anonKey: cfg.anonKey.trim() })
  );
}
