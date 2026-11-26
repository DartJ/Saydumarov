import React, { useCallback, useEffect, useState } from 'react';
import {
  Check,
  Copy,
  Database,
  Globe,
  KeyRound,
  LogIn,
  Plus,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { GameId, OnlineRoom } from '../types/arcade';
import {
  SUPABASE_SQL_SCHEMA,
  createOnlineRoom,
  ensureGuestAuth,
  isSupabaseConfigured,
  joinOnlineRoomByCode,
  listOpenRooms,
  resetSupabaseClientCache,
} from '../services/supabaseClient';
import { loadSupabaseConfig, saveSupabaseConfig } from '../utils/storage';
import { soundFX } from '../utils/sound';

interface OnlineLobbyProps {
  nickname: string;
  onEnterRoom: (room: OnlineRoom, userId: string) => void;
}

const ONLINE_GAME_NAMES: Record<string, string> = {
  chess: 'Шахматы',
  checkers: 'Русские шашки',
  tictactoe: 'Крестики-нолики Pro',
};

export const OnlineLobby: React.FC<OnlineLobbyProps> = ({
  nickname,
  onEnterRoom,
}) => {
  const [selectedGame, setSelectedGame] = useState<GameId>('chess');
  const [roomCodeInput, setRoomCodeInput] = useState<string>('');
  const [rooms, setRooms] = useState<OnlineRoom[]>([]);
  const [loadingRooms, setLoadingRooms] = useState<boolean>(false);
  const [busyAction, setBusyAction] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [guestId, setGuestId] = useState<string>('');
  const [authReady, setAuthReady] = useState<boolean>(false);

  const initialCfg = loadSupabaseConfig();
  const [supaUrl, setSupaUrl] = useState<string>(initialCfg.url);
  const [supaAnonKey, setSupaAnonKey] = useState<string>(initialCfg.anonKey);
  const [configured, setConfigured] = useState<boolean>(isSupabaseConfigured());
  const [showSetup, setShowSetup] = useState<boolean>(!isSupabaseConfigured());
  const [copiedSql, setCopiedSql] = useState<boolean>(false);
  const [cfgSavedNote, setCfgSavedNote] = useState<string | null>(null);

  const refreshRooms = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setRooms([]);
      return;
    }
    setLoadingRooms(true);
    setErrorMsg(null);
    const auth = await ensureGuestAuth();
    setGuestId(auth.userId);
    setAuthReady(auth.isSupabaseAuth);

    const res = await listOpenRooms();
    if (res.error) setErrorMsg(res.error);
    setRooms(res.rooms);
    setLoadingRooms(false);
  }, []);

  useEffect(() => {
    ensureGuestAuth().then((auth) => {
      setGuestId(auth.userId);
      setAuthReady(auth.isSupabaseAuth);
    });
    if (isSupabaseConfigured()) {
      refreshRooms();
    }
  }, [refreshRooms]);

  const handleSaveSupabaseConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    soundFX.click();
    saveSupabaseConfig({ url: supaUrl, anonKey: supaAnonKey });
    resetSupabaseClientCache();
    const ok = isSupabaseConfigured({ url: supaUrl, anonKey: supaAnonKey });
    setConfigured(ok);
    if (ok) {
      setCfgSavedNote('Конфигурация сохранена. Проверка подключения...');
      await refreshRooms();
      setCfgSavedNote('Подключено к Supabase.');
    } else {
      setCfgSavedNote('Укажите корректный HTTPS URL проекта и публичный Anon Key.');
    }
  };

  const handleCreateRoom = async () => {
    soundFX.click();
    setErrorMsg(null);
    if (!configured) {
      setShowSetup(true);
      setErrorMsg('Сначала подключите проект Supabase ниже (URL и публичный Anon Key).');
      return;
    }
    setBusyAction(true);

    let initialState: Record<string, unknown> = {};
    if (selectedGame === 'chess') {
      const { createInitialChessState } = await import('../games/chess/engine');
      initialState = createInitialChessState() as unknown as Record<string, unknown>;
    } else if (selectedGame === 'checkers') {
      const { createInitialCheckersState } = await import('../games/checkers/engine');
      initialState = createInitialCheckersState() as unknown as Record<string, unknown>;
    } else {
      const { createTicTacToeState } = await import('../games/tictactoe/engine');
      initialState = createTicTacToeState(3) as unknown as Record<string, unknown>;
    }

    const res = await createOnlineRoom({
      gameId: selectedGame,
      hostName: nickname,
      initialState,
    });
    setBusyAction(false);
    if (res.error || !res.room) {
      setErrorMsg(res.error || 'Не удалось создать комнату.');
      return;
    }
    const auth = await ensureGuestAuth();
    onEnterRoom(res.room, auth.userId);
  };

  const handleJoinByCode = async (codeOverride?: string) => {
    soundFX.click();
    const code = (codeOverride ?? roomCodeInput).trim().toUpperCase();
    if (code.length < 4) {
      setErrorMsg('Введите 6-значный код комнаты.');
      return;
    }
    if (!configured) {
      setShowSetup(true);
      setErrorMsg('Подключите проект Supabase для входа в онлайн-комнату.');
      return;
    }
    setErrorMsg(null);
    setBusyAction(true);
    const res = await joinOnlineRoomByCode({
      code,
      guestName: nickname,
    });
    setBusyAction(false);
    if (res.error || !res.room) {
      setErrorMsg(res.error || 'Не удалось войти в комнату.');
      return;
    }
    const auth = await ensureGuestAuth();
    onEnterRoom(res.room, auth.userId);
  };

  const handleCopySql = async () => {
    try {
      await navigator.clipboard.writeText(SUPABASE_SQL_SCHEMA);
      setCopiedSql(true);
      setTimeout(() => setCopiedSql(false), 2000);
    } catch {
      // Fallback ignored
    }
  };

  return (
    <div className="flex flex-col gap-6 w-full max-w-5xl mx-auto">
      {/* Guest Session Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-[#111622] border border-white/8 rounded-xl p-5">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-bold text-white">
            Онлайн-комнаты
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Гостевой вход без паролей и регистрации через Supabase Anonymous Auth
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-xs">
          <div className="text-right">
            <div className="text-slate-400">Ваш никнейм</div>
            <div className="font-semibold text-slate-100">{nickname}</div>
          </div>
          <span aria-hidden="true" className="text-slate-700">|</span>
          <div className="text-right">
            <div className="text-slate-400">Гостевой ID</div>
            <div className="font-mono-num text-cyan-300">
              {guestId ? guestId.slice(0, 8) : '...'} ·{' '}
              {configured
                ? authReady
                  ? 'Supabase готов'
                  : 'Ожидание Auth'
                : 'Локальный'}
            </div>
          </div>
        </div>
      </div>

      {errorMsg && (
        <div className="px-4 py-3 rounded-xl bg-rose-500/15 border border-rose-500/40 text-sm text-rose-200">
          {errorMsg}
        </div>
      )}

      {/* Create & Join Split */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Create Room */}
        <div className="bg-[#111622] border border-white/8 rounded-xl p-5 flex flex-col gap-4">
          <div className="flex items-center gap-2 text-slate-100 font-semibold">
            <Plus className="w-4 h-4 text-cyan-400" />
            <h2>Создать комнату</h2>
          </div>

          <div>
            <span className="block text-xs text-slate-400 mb-2">Выберите дисциплину</span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {(['chess', 'checkers', 'tictactoe'] as const).map((gid) => (
                <button
                  key={gid}
                  type="button"
                  onClick={() => {
                    soundFX.click();
                    setSelectedGame(gid);
                  }}
                  className={`py-2 px-3 rounded-lg text-xs font-semibold border transition-colors whitespace-nowrap ${
                    selectedGame === gid
                      ? 'bg-cyan-500/15 border-cyan-400 text-cyan-200'
                      : 'bg-[#171E2E] border-white/8 text-slate-300 hover:border-white/20'
                  }`}
                >
                  {ONLINE_GAME_NAMES[gid]}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            disabled={busyAction}
            onClick={handleCreateRoom}
            className="mt-auto flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 text-sm font-bold transition-colors"
          >
            <Globe className="w-4 h-4" />
            <span>Создать и получить код</span>
          </button>
        </div>

        {/* Join by Code */}
        <div className="bg-[#111622] border border-white/8 rounded-xl p-5 flex flex-col gap-4">
          <div className="flex items-center gap-2 text-slate-100 font-semibold">
            <KeyRound className="w-4 h-4 text-emerald-400" />
            <h2>Войти по коду друга</h2>
          </div>

          <div>
            <label htmlFor="room-code-input" className="block text-xs text-slate-400 mb-2">
              Код комнаты (6 символов)
            </label>
            <input
              id="room-code-input"
              type="text"
              maxLength={8}
              value={roomCodeInput}
              onChange={(e) => setRoomCodeInput(e.target.value.toUpperCase())}
              placeholder="Например: A7K9P2"
              className="w-full px-3.5 py-2.5 rounded-lg bg-[#0B0F17] border border-white/12 text-slate-100 font-mono-num tracking-widest uppercase text-sm focus:outline-none focus:border-cyan-400"
            />
          </div>

          <button
            type="button"
            disabled={busyAction}
            onClick={() => handleJoinByCode()}
            className="mt-auto flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 text-sm font-bold transition-colors"
          >
            <LogIn className="w-4 h-4" />
            <span>Подключиться к комнате</span>
          </button>
        </div>
      </div>

      {/* Open Rooms List */}
      <div className="bg-[#111622] border border-white/8 rounded-xl p-5">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="text-base font-semibold text-white">
            Открытые комнаты ожидания
          </h2>
          <button
            type="button"
            onClick={refreshRooms}
            disabled={loadingRooms || !configured}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#19202F] hover:bg-[#232D42] disabled:opacity-40 text-xs font-semibold text-slate-200 border border-white/8 transition-colors whitespace-nowrap"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingRooms ? 'animate-spin' : ''}`} />
            <span>Обновить</span>
          </button>
        </div>

        {!configured ? (
          <p className="text-sm text-slate-400 py-4">
            Для загрузки списка живых комнат подключите ваш бесплатный проект Supabase в
            панели ниже. Все одиночные и локальные режимы (ИИ, 2 игрока, Сапёр,
            Бильярд) работают сразу без настройки.
          </p>
        ) : rooms.length === 0 ? (
          <p className="text-sm text-slate-400 py-6 text-center">
            Сейчас нет свободных комнат. Создайте новую и отправьте код другу.
          </p>
        ) : (
          <div className="divide-y divide-white/6">
            {rooms.map((room) => (
              <div
                key={room.id}
                className="py-3 flex flex-wrap items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 text-sm">
                  <span className="font-mono-num font-bold text-cyan-300">
                    {room.code}
                  </span>
                  <span aria-hidden="true" className="text-slate-600">·</span>
                  <span className="font-medium text-slate-100">
                    {ONLINE_GAME_NAMES[room.game_id] || room.game_id}
                  </span>
                  <span aria-hidden="true" className="text-slate-600">·</span>
                  <span className="text-slate-400 text-xs">
                    Хост: {room.host_name}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleJoinByCode(room.code)}
                  className="px-3.5 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold transition-colors whitespace-nowrap"
                >
                  Войти
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Supabase Configuration & SQL Setup Panel */}
      <div className="bg-[#111622] border border-white/8 rounded-xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Database className="w-4 h-4 text-cyan-400" />
            <h2 className="text-base font-semibold text-white">
              Настройка Supabase и SQL-схема (RLS + Anonymous Auth)
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setShowSetup((s) => !s)}
            className="text-xs font-semibold text-cyan-300 hover:text-cyan-200 underline underline-offset-4"
          >
            {showSetup ? 'Свернуть инструкцию' : 'Открыть параметры и SQL'}
          </button>
        </div>

        {showSetup && (
          <div className="mt-5 flex flex-col gap-5 border-t border-white/8 pt-5">
            <div className="flex items-start gap-2.5 text-xs text-emerald-200 bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3">
              <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
              <span>
                Безопасность: используйте только публичный <strong>Anon / Publishable Key</strong>{' '}
                и включённый RLS. Никогда не вставляйте <code>service_role</code> ключ в
                браузерный код.
              </span>
            </div>

            <form
              onSubmit={handleSaveSupabaseConfig}
              className="grid grid-cols-1 md:grid-cols-2 gap-4"
            >
              <div>
                <label htmlFor="supa-url" className="block text-xs text-slate-400 mb-1.5">
                  Supabase Project URL
                </label>
                <input
                  id="supa-url"
                  type="url"
                  value={supaUrl}
                  onChange={(e) => setSupaUrl(e.target.value)}
                  placeholder="https://xxxxx.supabase.co"
                  className="w-full px-3 py-2 rounded-lg bg-[#0B0F17] border border-white/12 text-xs text-slate-100 font-mono-num focus:outline-none focus:border-cyan-400"
                />
              </div>
              <div>
                <label htmlFor="supa-anon" className="block text-xs text-slate-400 mb-1.5">
                  Supabase Anon Public Key
                </label>
                <input
                  id="supa-anon"
                  type="text"
                  value={supaAnonKey}
                  onChange={(e) => setSupaAnonKey(e.target.value)}
                  placeholder="eyJhbGciOi..."
                  className="w-full px-3 py-2 rounded-lg bg-[#0B0F17] border border-white/12 text-xs text-slate-100 font-mono-num focus:outline-none focus:border-cyan-400"
                />
              </div>
              <div className="md:col-span-2 flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold transition-colors"
                >
                  Сохранить и подключиться
                </button>
                {cfgSavedNote && (
                  <span className="text-xs text-slate-300">{cfgSavedNote}</span>
                )}
              </div>
            </form>

            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-200">
                  SQL-запрос для Supabase SQL Editor (таблица, RLS и Realtime):
                </span>
                <button
                  type="button"
                  onClick={handleCopySql}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#19202F] hover:bg-[#232D42] text-xs text-cyan-300 border border-white/10"
                >
                  {copiedSql ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Скопировано</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Копировать SQL</span>
                    </>
                  )}
                </button>
              </div>
              <pre className="p-3.5 rounded-lg bg-[#07090E] border border-white/10 text-[11px] font-mono-num text-slate-300 overflow-x-auto max-h-60 leading-relaxed">
                {SUPABASE_SQL_SCHEMA}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
