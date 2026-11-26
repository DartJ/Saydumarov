import { createClient, RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { GameId, OnlineRoom, SupabaseConfig } from '../types/arcade';
import { getOrCreateGuestId, loadSupabaseConfig } from '../utils/storage';

let cachedClient: SupabaseClient | null = null;
let cachedKeySignature = '';

export function isSupabaseConfigured(cfg?: SupabaseConfig): boolean {
  const active = cfg ?? loadSupabaseConfig();
  return (
    active.url.startsWith('https://') &&
    active.anonKey.length > 20
  );
}

export function getSupabaseClient(): SupabaseClient | null {
  const cfg = loadSupabaseConfig();
  if (!isSupabaseConfigured(cfg)) return null;

  const sig = `${cfg.url}|${cfg.anonKey}`;
  if (cachedClient && cachedKeySignature === sig) {
    return cachedClient;
  }

  cachedClient = createClient(cfg.url, cfg.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
    realtime: {
      params: { eventsPerSecond: 10 },
    },
  });
  cachedKeySignature = sig;
  return cachedClient;
}

export function resetSupabaseClientCache(): void {
  cachedClient = null;
  cachedKeySignature = '';
}

export async function ensureGuestAuth(): Promise<{
  userId: string;
  isSupabaseAuth: boolean;
  error?: string;
}> {
  const client = getSupabaseClient();
  const fallbackId = getOrCreateGuestId();
  if (!client) {
    return { userId: fallbackId, isSupabaseAuth: false };
  }

  try {
    const { data: sessionData } = await client.auth.getSession();
    if (sessionData.session?.user?.id) {
      return { userId: sessionData.session.user.id, isSupabaseAuth: true };
    }
    const { data, error } = await client.auth.signInAnonymously();
    if (error) {
      return { userId: fallbackId, isSupabaseAuth: false, error: error.message };
    }
    if (data.user?.id) {
      return { userId: data.user.id, isSupabaseAuth: true };
    }
    return { userId: fallbackId, isSupabaseAuth: false };
  } catch (err) {
    return {
      userId: fallbackId,
      isSupabaseAuth: false,
      error: err instanceof Error ? err.message : 'Ошибка подключения к Supabase Auth',
    };
  }
}

export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export async function listOpenRooms(): Promise<{
  rooms: OnlineRoom[];
  error?: string;
}> {
  const client = getSupabaseClient();
  if (!client) {
    return { rooms: [], error: 'Supabase не подключён' };
  }

  const { data, error } = await client
    .from('arcade_rooms')
    .select('*')
    .eq('status', 'waiting')
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    return { rooms: [], error: error.message };
  }
  return { rooms: (data ?? []) as OnlineRoom[] };
}

export async function createOnlineRoom(params: {
  gameId: GameId;
  hostName: string;
  initialState: Record<string, unknown>;
}): Promise<{ room: OnlineRoom | null; error?: string }> {
  const client = getSupabaseClient();
  if (!client) {
    return { room: null, error: 'Настройте URL и Anon Key Supabase во вкладке «Онлайн-комнаты».' };
  }

  const auth = await ensureGuestAuth();
  if (!auth.isSupabaseAuth) {
    return {
      room: null,
      error:
        auth.error ||
        'Включите Anonymous Sign-Ins в настройках Supabase Authentication.',
    };
  }

  const code = generateRoomCode();
  const { data, error } = await client
    .from('arcade_rooms')
    .insert({
      code,
      game_id: params.gameId,
      host_id: auth.userId,
      host_name: params.hostName,
      status: 'waiting',
      current_turn: 'w',
      state: params.initialState,
    })
    .select('*')
    .single();

  if (error) {
    return { room: null, error: error.message };
  }
  return { room: data as OnlineRoom };
}

export async function joinOnlineRoomByCode(params: {
  code: string;
  guestName: string;
}): Promise<{ room: OnlineRoom | null; error?: string }> {
  const client = getSupabaseClient();
  if (!client) {
    return { room: null, error: 'Supabase не настроен.' };
  }

  const auth = await ensureGuestAuth();
  if (!auth.isSupabaseAuth) {
    return { room: null, error: auth.error || 'Не удалось выполнить гостевой вход.' };
  }

  const cleanCode = params.code.trim().toUpperCase();
  const { data: existing, error: fetchErr } = await client
    .from('arcade_rooms')
    .select('*')
    .eq('code', cleanCode)
    .maybeSingle();

  if (fetchErr || !existing) {
    return { room: null, error: 'Комната с таким кодом не найдена.' };
  }

  const room = existing as OnlineRoom;
  if (room.host_id === auth.userId || room.guest_id === auth.userId) {
    return { room };
  }

  if (room.status !== 'waiting' || room.guest_id) {
    return { room: null, error: 'Комната уже заполнена или игра завершена.' };
  }

  const { data: updated, error: updateErr } = await client
    .from('arcade_rooms')
    .update({
      guest_id: auth.userId,
      guest_name: params.guestName,
      status: 'playing',
      updated_at: new Date().toISOString(),
    })
    .eq('id', room.id)
    .eq('status', 'waiting')
    .select('*')
    .single();

  if (updateErr) {
    return { room: null, error: updateErr.message };
  }

  return { room: updated as OnlineRoom };
}

export async function pushRoomStateUpdate(params: {
  roomId: string;
  state: Record<string, unknown>;
  currentTurn: string;
  status?: 'waiting' | 'playing' | 'finished';
}): Promise<{ error?: string }> {
  const client = getSupabaseClient();
  if (!client) return { error: 'Нет подключения к Supabase' };

  const payload: Record<string, unknown> = {
    state: params.state,
    current_turn: params.currentTurn,
    updated_at: new Date().toISOString(),
  };
  if (params.status) payload.status = params.status;

  const { error } = await client
    .from('arcade_rooms')
    .update(payload)
    .eq('id', params.roomId);

  return error ? { error: error.message } : {};
}

export function subscribeToRoom(params: {
  roomId: string;
  roomCode: string;
  userId: string;
  userName: string;
  onRoomChange: (room: OnlineRoom) => void;
  onPresenceChange: (onlineUserIds: string[]) => void;
}): () => void {
  const client = getSupabaseClient();
  if (!client) return () => {};

  const channel: RealtimeChannel = client.channel(`arcade_room_${params.roomCode}`, {
    config: { presence: { key: params.userId } },
  });

  channel
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'arcade_rooms',
        filter: `id=eq.${params.roomId}`,
      },
      (payload) => {
        if (payload.new) {
          params.onRoomChange(payload.new as OnlineRoom);
        }
      }
    )
    .on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState();
      const ids = Object.keys(state);
      params.onPresenceChange(ids);
    })
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({
          user_id: params.userId,
          name: params.userName,
          joined_at: new Date().toISOString(),
        });
      }
    });

  return () => {
    client.removeChannel(channel);
  };
}

export const SUPABASE_SQL_SCHEMA = `-- 1. Создайте таблицу игровых комнат ARCADE
create table if not exists public.arcade_rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  game_id text not null check (game_id in ('chess', 'checkers', 'tictactoe')),
  host_id uuid not null,
  guest_id uuid,
  host_name text not null,
  guest_name text,
  status text not null default 'waiting' check (status in ('waiting', 'playing', 'finished')),
  current_turn text,
  state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_arcade_rooms_status on public.arcade_rooms (status, created_at desc);
create index if not exists idx_arcade_rooms_code on public.arcade_rooms (code);

-- 2. Включите Row Level Security (RLS)
alter table public.arcade_rooms enable row level security;

-- 3. Политики доступа для анонимных гостей (Supabase Anonymous Auth)
-- Чтение открытых комнат или комнат, где пользователь является участником
create policy "Read waiting or joined rooms"
  on public.arcade_rooms
  for select
  to authenticated
  using (
    status = 'waiting'
    or auth.uid() = host_id
    or auth.uid() = guest_id
  );

-- Создание комнаты только от своего auth.uid()
create policy "Host can create room"
  on public.arcade_rooms
  for insert
  to authenticated
  with check (auth.uid() = host_id);

-- Обновление: подключение гостя к ожидающей комнате или ход участника
create policy "Participants or joining guest can update room"
  on public.arcade_rooms
  for update
  to authenticated
  using (
    auth.uid() = host_id
    or auth.uid() = guest_id
    or (status = 'waiting' and guest_id is null)
  )
  with check (
    auth.uid() = host_id
    or auth.uid() = guest_id
  );

-- Удаление комнаты разрешено только создателю
create policy "Host can delete room"
  on public.arcade_rooms
  for delete
  to authenticated
  using (auth.uid() = host_id);

-- 4. Включите Realtime для мгновенной синхронизации ходов
alter publication supabase_realtime add table public.arcade_rooms;`;
