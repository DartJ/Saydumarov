import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Check,
  Copy,
  Gamepad2,
  Play,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { GAME_REGISTRY, getGameManifest } from './games/registry';
import {
  GameCategory,
  GameId,
  GameRecords,
  OnlineRoom,
  PortalTab,
  UserSettings,
} from './types/arcade';
import {
  loadRecords,
  loadSettings,
  resetAllRecords,
  saveRecords,
  saveSettings,
} from './utils/storage';
import { soundFX } from './utils/sound';
import { ChessGame } from './components/games/ChessGame';
import { MinesweeperGame } from './components/games/MinesweeperGame';
import { BilliardsGame } from './components/games/BilliardsGame';
import { CheckersGame } from './components/games/CheckersGame';
import { TicTacToeGame } from './components/games/TicTacToeGame';
import { CityDriverGame } from './components/games/CityDriverGame';
import { TacticalFpsGame } from './components/games/TacticalFpsGame';
import { OnlineLobby } from './components/OnlineLobby';
import { RecordsView } from './components/RecordsView';
import { SettingsView } from './components/SettingsView';
import { MinesweeperDifficulty } from './games/minesweeper/engine';
import { subscribeToRoom } from './services/supabaseClient';

const ACCENT_CLASSES = {
  cyan: {
    btn: 'bg-cyan-500 hover:bg-cyan-400 text-slate-950',
    text: 'text-cyan-400',
    ring: 'hover:border-cyan-500/50',
  },
  emerald: {
    btn: 'bg-emerald-500 hover:bg-emerald-400 text-slate-950',
    text: 'text-emerald-400',
    ring: 'hover:border-emerald-500/50',
  },
  amber: {
    btn: 'bg-amber-500 hover:bg-amber-400 text-slate-950',
    text: 'text-amber-400',
    ring: 'hover:border-amber-500/50',
  },
};

export default function App() {
  const [settings, setSettings] = useState<UserSettings>(() => {
    const s = loadSettings();
    soundFX.enabled = s.soundEnabled;
    soundFX.volume = s.soundVolume;
    return s;
  });
  const [records, setRecords] = useState<GameRecords>(() => loadRecords());

  const [activeTab, setActiveTab] = useState<PortalTab>('hall');
  const [activeGame, setActiveGame] = useState<GameId | null>(() => {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    const g = params.get('game') as GameId | null;
    if (g && getGameManifest(g)) return g;
    if (params.get('autostart') === '1') return 'chess';
    return null;
  });

  const [categoryFilter, setCategoryFilter] = useState<'all' | GameCategory>('all');
  const [brokenImages, setBrokenImages] = useState<Record<string, boolean>>({});

  // Online Room active state
  const [onlineRoom, setOnlineRoom] = useState<OnlineRoom | null>(null);
  const [onlineUserId, setOnlineUserId] = useState<string | null>(null);
  const [onlinePresenceIds, setOnlinePresenceIds] = useState<string[]>([]);
  const [copiedRoomCode, setCopiedRoomCode] = useState<boolean>(false);

  // Sync body dataset.state for testability & lifecycle
  useEffect(() => {
    document.body.dataset.state = activeGame ? 'playing' : 'lobby';
  }, [activeGame]);

  // Subscribe to online room realtime updates when in an online match
  useEffect(() => {
    if (!onlineRoom || !onlineUserId) return;
    const unsub = subscribeToRoom({
      roomId: onlineRoom.id,
      roomCode: onlineRoom.code,
      userId: onlineUserId,
      userName: settings.nickname,
      onRoomChange: (updated) => {
        setOnlineRoom(updated);
      },
      onPresenceChange: (ids) => {
        setOnlinePresenceIds(ids);
      },
    });
    return unsub;
  }, [onlineRoom?.id, onlineRoom?.code, onlineUserId, settings.nickname]);

  const handleUpdateSettings = useCallback((next: UserSettings) => {
    setSettings(next);
    saveSettings(next);
  }, []);

  const updateRecords = useCallback((updater: (prev: GameRecords) => GameRecords) => {
    setRecords((prev) => {
      const next = updater(prev);
      saveRecords(next);
      return next;
    });
  }, []);

  const launchGame = (id: GameId) => {
    soundFX.click();
    setOnlineRoom(null);
    setOnlineUserId(null);
    setActiveGame(id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleEnterOnlineRoom = (room: OnlineRoom, userId: string) => {
    setOnlineRoom(room);
    setOnlineUserId(userId);
    setActiveGame(room.game_id);
  };

  const exitGameToHall = () => {
    soundFX.click();
    setActiveGame(null);
    setOnlineRoom(null);
    setOnlineUserId(null);
  };

  const accent = ACCENT_CLASSES[settings.accentTheme];

  const filteredGames = useMemo(() => {
    if (categoryFilter === 'all') return GAME_REGISTRY;
    return GAME_REGISTRY.filter((g) => g.category === categoryFilter);
  }, [categoryFilter]);

  const opponentPresent = useMemo(() => {
    if (!onlineRoom || !onlineUserId) return true;
    const opponentId =
      onlineRoom.host_id === onlineUserId ? onlineRoom.guest_id : onlineRoom.host_id;
    if (!opponentId) return true;
    return onlinePresenceIds.length === 0 || onlinePresenceIds.includes(opponentId);
  }, [onlineRoom, onlineUserId, onlinePresenceIds]);

  const activeManifest = activeGame ? getGameManifest(activeGame) : null;

  // Render Game Stage View when a game is active
  if (activeGame && activeManifest) {
    return (
      <div className="min-h-screen flex flex-col bg-[#090B10] text-slate-100">
        <header className="sticky top-0 z-30 bg-[#090B10]/95 border-b border-white/8 px-4 sm:px-8 py-3 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={exitGameToHall}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#131822] hover:bg-[#1C2434] border border-white/10 text-xs font-semibold text-slate-100 transition-colors whitespace-nowrap shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>В зал</span>
          </button>

          <div className="flex items-center gap-3 min-w-0">
            <h1 className="font-display text-sm sm:text-base font-bold text-white truncate">
              {activeManifest.title}
            </h1>
            {onlineRoom && (
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(onlineRoom.code);
                    setCopiedRoomCode(true);
                    setTimeout(() => setCopiedRoomCode(false), 1800);
                  } catch {
                    // ignore
                  }
                }}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-cyan-500/15 border border-cyan-500/35 text-xs font-mono-num text-cyan-200 whitespace-nowrap"
              >
                <span>Код: {onlineRoom.code}</span>
                {copiedRoomCode ? (
                  <Check className="w-3.5 h-3.5" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() =>
              handleUpdateSettings({
                ...settings,
                soundEnabled: !settings.soundEnabled,
              })
            }
            aria-label={settings.soundEnabled ? 'Выключить звук' : 'Включить звук'}
            className="p-2 rounded-lg bg-[#131822] hover:bg-[#1C2434] border border-white/10 text-slate-200 transition-colors shrink-0"
          >
            {settings.soundEnabled ? (
              <Volume2 className="w-4 h-4" />
            ) : (
              <VolumeX className="w-4 h-4 text-slate-500" />
            )}
          </button>
        </header>

        <main className="flex-1 px-4 sm:px-8 py-6">
          {activeGame === 'chess' && (
            <ChessGame
              showLegalHints={settings.showLegalHints}
              onlineRoom={onlineRoom}
              onlineUserId={onlineUserId}
              opponentPresent={opponentPresent}
              onRecordResult={(outcome) =>
                updateRecords((prev) => ({
                  ...prev,
                  chess: {
                    played: prev.chess.played + 1,
                    wins: prev.chess.wins + (outcome === 'win' ? 1 : 0),
                    draws: prev.chess.draws + (outcome === 'draw' ? 1 : 0),
                    losses: prev.chess.losses + (outcome === 'loss' ? 1 : 0),
                  },
                }))
              }
            />
          )}

          {activeGame === 'minesweeper' && (
            <MinesweeperGame
              record={records.minesweeper}
              onRecordFinish={(diff: MinesweeperDifficulty, won: boolean, sec: number) =>
                updateRecords((prev) => {
                  const ms = prev.minesweeper;
                  const bestKey =
                    diff === 'beginner'
                      ? 'beginnerBestSec'
                      : diff === 'intermediate'
                      ? 'intermediateBestSec'
                      : 'expertBestSec';
                  const currentBest = ms[bestKey];
                  const nextBest =
                    won && (currentBest === null || sec < currentBest)
                      ? sec
                      : currentBest;
                  return {
                    ...prev,
                    minesweeper: {
                      ...ms,
                      [bestKey]: nextBest,
                      gamesPlayed: ms.gamesPlayed + 1,
                      gamesWon: ms.gamesWon + (won ? 1 : 0),
                    },
                  };
                })
              }
            />
          )}

          {activeGame === 'billiards' && (
            <BilliardsGame
              onRecordUpdate={(stats) =>
                updateRecords((prev) => ({
                  ...prev,
                  billiards: {
                    gamesPlayed: prev.billiards.gamesPlayed + stats.playedDelta,
                    winsVsAi: prev.billiards.winsVsAi + stats.winAiDelta,
                    ballsPocketed: prev.billiards.ballsPocketed + stats.pocketedDelta,
                    bestRun: Math.max(prev.billiards.bestRun, stats.runCount),
                  },
                }))
              }
            />
          )}

          {activeGame === 'checkers' && (
            <CheckersGame
              showLegalHints={settings.showLegalHints}
              onlineRoom={onlineRoom}
              onlineUserId={onlineUserId}
              opponentPresent={opponentPresent}
              onRecordResult={(won) =>
                updateRecords((prev) => ({
                  ...prev,
                  checkers: {
                    played: prev.checkers.played + 1,
                    wins: prev.checkers.wins + (won ? 1 : 0),
                  },
                }))
              }
            />
          )}

          {activeGame === 'tictactoe' && (
            <TicTacToeGame
              onlineRoom={onlineRoom}
              onlineUserId={onlineUserId}
              onRecordResult={(outcome) =>
                updateRecords((prev) => ({
                  ...prev,
                  tictactoe: {
                    played: prev.tictactoe.played + 1,
                    wins: prev.tictactoe.wins + (outcome === 'win' ? 1 : 0),
                    draws: prev.tictactoe.draws + (outcome === 'draw' ? 1 : 0),
                  },
                }))
              }
            />
          )}

          {activeGame === 'city_driver' && (
            <CityDriverGame
              onRecordUpdate={(stats) =>
                updateRecords((prev) => ({
                  ...prev,
                  cityDriver: {
                    totalCashEarned: prev.cityDriver.totalCashEarned + stats.cashEarned,
                    missionsCompleted: prev.cityDriver.missionsCompleted + stats.missionsCompleted,
                    maxWantedStars: Math.max(prev.cityDriver.maxWantedStars, stats.maxWanted),
                  },
                }))
              }
            />
          )}

          {activeGame === 'tactical_fps' && (
            <TacticalFpsGame
              onRecordUpdate={(stats) =>
                updateRecords((prev) => ({
                  ...prev,
                  tacticalFps: {
                    kills: prev.tacticalFps.kills + stats.killsDelta,
                    deaths: prev.tacticalFps.deaths + stats.deathsDelta,
                    headshots: prev.tacticalFps.headshots + stats.headshotsDelta,
                    roundsWon: prev.tacticalFps.roundsWon + stats.roundsWonDelta,
                  },
                }))
              }
            />
          )}
        </main>
      </div>
    );
  }

  // Main Portal Hall Shell (Zero login/registration barrier)
  const featuredChess = GAME_REGISTRY[0];

  return (
    <div className="min-h-screen flex flex-col bg-[#090B10] text-slate-100">
      {/* 3-Zone Contract Top Bar */}
      <header className="sticky top-0 z-30 bg-[#090B10]/95 border-b border-white/8 px-4 sm:px-8 py-3.5">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-8">
          {/* Zone 1: Single Wordmark */}
          <button
            type="button"
            onClick={() => {
              soundFX.click();
              setActiveTab('hall');
            }}
            className="font-display text-lg font-bold tracking-wider text-white whitespace-nowrap shrink-0 focus:outline-none"
          >
            ARCADE
          </button>

          {/* Zone 2: Clean Single-Line Text Navigation */}
          <nav className="hidden md:flex items-center gap-7 text-sm font-medium">
            {([
              { id: 'hall', label: 'Игровой зал' },
              { id: 'online', label: 'Онлайн-комнаты' },
              { id: 'records', label: 'Рекорды' },
              { id: 'settings', label: 'Настройки' },
            ] as { id: PortalTab; label: string }[]).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  soundFX.click();
                  setActiveTab(item.id);
                }}
                className={`whitespace-nowrap shrink-0 transition-colors pb-0.5 border-b-2 ${
                  activeTab === item.id
                    ? 'text-white border-cyan-400'
                    : 'text-slate-400 border-transparent hover:text-slate-100'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>

          {/* Zone 3: Single Primary Action */}
          <button
            type="button"
            data-start="true"
            onClick={() => launchGame('chess')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors whitespace-nowrap shrink-0 ${accent.btn}`}
          >
            Быстрая игра
          </button>
        </div>

        {/* Mobile Compact Nav Row */}
        <nav className="md:hidden flex items-center justify-between gap-2 mt-2.5 pt-2.5 border-t border-white/6 overflow-x-auto">
          {([
            { id: 'hall', label: 'Зал' },
            { id: 'online', label: 'Онлайн' },
            { id: 'records', label: 'Рекорды' },
            { id: 'settings', label: 'Настройки' },
          ] as { id: PortalTab; label: string }[]).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                soundFX.click();
                setActiveTab(item.id);
              }}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold whitespace-nowrap shrink-0 ${
                activeTab === item.id
                  ? 'bg-white/10 text-white'
                  : 'text-slate-400'
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="flex-1 px-4 sm:px-8 py-8">
        {activeTab === 'hall' && (
          <div className="max-w-6xl mx-auto flex flex-col gap-10">
            {/* Featured Game Hero */}
            <section className="grid grid-cols-1 lg:grid-cols-[1.15fr_1fr] gap-8 items-stretch bg-[#111622] border border-white/8 rounded-2xl overflow-hidden">
              <div className="p-6 sm:p-9 flex flex-col justify-between gap-6">
                <div className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-400">
                    <span className={`${accent.text} whitespace-nowrap`}>Без регистрации</span>
                    <span aria-hidden="true">·</span>
                    <span className="whitespace-nowrap">Мгновенный запуск</span>
                    <span aria-hidden="true">·</span>
                    <span className="whitespace-nowrap">ИИ и онлайн-дуэли</span>
                  </div>
                  <h1 className="font-display text-2xl sm:text-4xl font-bold text-white leading-tight [text-wrap:balance]">
                    Игровой зал ARCADE
                  </h1>
                  <p className="text-sm sm:text-base text-slate-300 leading-relaxed max-w-xl">
                    Полноценные браузерные игры без паролей и очередей: 3D-экшн в открытом
                    городе, тактический шутер 5×5, турнирные шахматы, бильярд 8-Ball,
                    сапёр, русские шашки и сетевые комнаты по коду.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => launchGame(featuredChess.id)}
                    className={`flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-bold transition-colors whitespace-nowrap ${accent.btn}`}
                  >
                    <Play className="w-4 h-4 fill-current" />
                    <span>Играть в Шахматы</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => launchGame('billiards')}
                    className="px-5 py-3 rounded-xl bg-[#19202F] hover:bg-[#232D42] border border-white/10 text-sm font-semibold text-slate-100 transition-colors whitespace-nowrap"
                  >
                    Открыть Бильярд
                  </button>
                </div>
              </div>

              <div className="relative min-h-[240px] lg:min-h-full bg-[#0D1119]">
                {!brokenImages[featuredChess.id] ? (
                  <img
                    src={featuredChess.coverImage}
                    alt={featuredChess.title}
                    referrerPolicy="no-referrer"
                    onError={() =>
                      setBrokenImages((prev) => ({
                        ...prev,
                        [featuredChess.id]: true,
                      }))
                    }
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800">
                    <Gamepad2 className="w-16 h-16 text-cyan-400/50" />
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-[#111622] via-transparent to-transparent lg:bg-gradient-to-r lg:from-[#111622]/70 lg:via-transparent lg:to-transparent" />
              </div>
            </section>

            {/* Library Section with Category Filter */}
            <section className="flex flex-col gap-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="font-display text-lg sm:text-xl font-bold text-white">
                    Библиотека игр
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Выберите дисциплину — игра запустится прямо в окне браузера
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-1 p-1 bg-[#111622] border border-white/8 rounded-lg">
                  {([
                    { id: 'all', label: 'Все' },
                    { id: 'action', label: 'Экшн 3D' },
                    { id: 'strategy', label: 'Стратегия' },
                    { id: 'physics', label: 'Физика' },
                    { id: 'logic', label: 'Головоломки' },
                  ] as const).map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => {
                        soundFX.click();
                        setCategoryFilter(tab.id);
                      }}
                      className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap ${
                        categoryFilter === tab.id
                          ? 'bg-[#222B3E] text-white'
                          : 'text-slate-400 hover:text-slate-100'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredGames.map((game) => (
                  <article
                    key={game.id}
                    className={`bg-[#111622] border border-white/8 ${accent.ring} rounded-xl overflow-hidden flex flex-col transition-colors`}
                  >
                    <div className="aspect-[4/3] w-full bg-[#0C1018] overflow-hidden relative">
                      {!brokenImages[game.id] ? (
                        <img
                          src={game.coverImage}
                          alt={game.title}
                          referrerPolicy="no-referrer"
                          onError={() =>
                            setBrokenImages((prev) => ({
                              ...prev,
                              [game.id]: true,
                            }))
                          }
                          className="w-full h-full object-cover transition-transform duration-300 hover:scale-[1.03]"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800">
                          <Gamepad2 className="w-12 h-12 text-slate-500" />
                        </div>
                      )}
                    </div>

                    <div className="p-5 flex-1 flex flex-col gap-3">
                      <div className="flex items-center gap-2 text-xs text-slate-400">
                        <span>{game.categoryLabel}</span>
                        <span aria-hidden="true">·</span>
                        <span>{game.playersLabel}</span>
                      </div>

                      <h3 className="font-display text-lg font-bold text-white">
                        {game.title}
                      </h3>

                      <p className="text-xs sm:text-sm text-slate-300 leading-relaxed flex-1">
                        {game.description}
                      </p>

                      <div className="pt-2 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => launchGame(game.id)}
                          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${accent.btn}`}
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                          <span>Играть</span>
                        </button>
                        {game.supportsOnline && (
                          <button
                            type="button"
                            onClick={() => {
                              soundFX.click();
                              setActiveTab('online');
                            }}
                            className="py-2.5 px-3 rounded-lg bg-[#19202F] hover:bg-[#232D42] border border-white/10 text-xs font-semibold text-slate-200 transition-colors whitespace-nowrap"
                          >
                            Онлайн
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </div>
        )}

        {activeTab === 'online' && (
          <OnlineLobby
            nickname={settings.nickname}
            onEnterRoom={handleEnterOnlineRoom}
          />
        )}

        {activeTab === 'records' && (
          <RecordsView
            records={records}
            onResetRecords={() => setRecords(resetAllRecords())}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsView settings={settings} onUpdate={handleUpdateSettings} />
        )}
      </main>

      <footer className="border-t border-white/6 px-4 sm:px-8 py-5 text-xs text-slate-500">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <span>ARCADE — браузерная игровая платформа без регистрации</span>
          <span>Рекорды и настройки сохраняются локально · Онлайн через Supabase</span>
        </div>
      </footer>
    </div>
  );
}
