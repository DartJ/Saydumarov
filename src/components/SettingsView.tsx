import React from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { AccentTheme, UserSettings } from '../types/arcade';
import { soundFX } from '../utils/sound';

interface SettingsViewProps {
  settings: UserSettings;
  onUpdate: (next: UserSettings) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  onUpdate,
}) => {
  const update = (patch: Partial<UserSettings>) => {
    const next = { ...settings, ...patch };
    soundFX.enabled = next.soundEnabled;
    soundFX.volume = next.soundVolume;
    onUpdate(next);
  };

  return (
    <div className="flex flex-col gap-6 w-full max-w-3xl mx-auto">
      <div className="bg-[#111622] border border-white/8 rounded-xl p-5">
        <h1 className="font-display text-xl sm:text-2xl font-bold text-white">
          Настройки портала
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Все параметры мгновенно сохраняются в локальном хранилище браузера
        </p>
      </div>

      <div className="bg-[#111622] border border-white/8 rounded-xl p-5 flex flex-col gap-6">
        {/* Nickname */}
        <div>
          <label
            htmlFor="settings-nickname"
            className="block text-sm font-semibold text-slate-100 mb-1.5"
          >
            Имя игрока (для локального зала и онлайн-комнат)
          </label>
          <input
            id="settings-nickname"
            type="text"
            maxLength={20}
            value={settings.nickname}
            onChange={(e) => update({ nickname: e.target.value })}
            className="w-full max-w-sm px-3.5 py-2.5 rounded-lg bg-[#0B0F17] border border-white/12 text-sm text-white focus:outline-none focus:border-cyan-400"
          />
        </div>

        <div className="border-t border-white/8 pt-5 flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-semibold text-slate-100">
                Звуковые эффекты (Web Audio)
              </div>
              <div className="text-xs text-slate-400">
                Синтезированные звуки ходов, шаров и побед
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={settings.soundEnabled}
              onClick={() => {
                const nextVal = !settings.soundEnabled;
                update({ soundEnabled: nextVal });
                if (nextVal) soundFX.winFanfare();
              }}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-colors ${
                settings.soundEnabled
                  ? 'bg-cyan-500 text-slate-950'
                  : 'bg-[#19202F] text-slate-300 border border-white/10'
              }`}
            >
              {settings.soundEnabled ? (
                <>
                  <Volume2 className="w-4 h-4" />
                  <span>Включены</span>
                </>
              ) : (
                <>
                  <VolumeX className="w-4 h-4" />
                  <span>Отключены</span>
                </>
              )}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <label htmlFor="settings-volume" className="text-xs text-slate-300">
              Громкость:
            </label>
            <input
              id="settings-volume"
              type="range"
              min={0.1}
              max={1}
              step={0.05}
              value={settings.soundVolume}
              onChange={(e) => update({ soundVolume: Number(e.target.value) })}
              className="w-48 accent-cyan-500"
            />
            <span className="font-mono-num text-xs text-slate-300 w-10">
              {Math.round(settings.soundVolume * 100)}%
            </span>
            <button
              type="button"
              onClick={() => soundFX.winFanfare()}
              className="px-3 py-1.5 rounded-lg bg-[#19202F] hover:bg-[#232D42] text-xs font-semibold text-slate-200 border border-white/10"
            >
              Проверить звук
            </button>
          </div>
        </div>

        {/* Legal move hints */}
        <div className="border-t border-white/8 pt-5 flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-semibold text-slate-100">
              Подсветка допустимых ходов
            </div>
            <div className="text-xs text-slate-400">
              Показывать доступные клетки в Шахматах и Шашках
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={settings.showLegalHints}
            onClick={() => {
              soundFX.click();
              update({ showLegalHints: !settings.showLegalHints });
            }}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-colors ${
              settings.showLegalHints
                ? 'bg-emerald-500 text-slate-950'
                : 'bg-[#19202F] text-slate-300 border border-white/10'
            }`}
          >
            {settings.showLegalHints ? 'Показывать' : 'Скрывать'}
          </button>
        </div>

        {/* Accent Theme */}
        <div className="border-t border-white/8 pt-5">
          <span className="block text-sm font-semibold text-slate-100 mb-2">
            Неоновый акцент интерфейса
          </span>
          <div className="flex flex-wrap gap-2">
            {([
              { id: 'cyan', label: 'Электрик-циан', dot: 'bg-cyan-400' },
              { id: 'emerald', label: 'Изумрудный', dot: 'bg-emerald-400' },
              { id: 'amber', label: 'Янтарный', dot: 'bg-amber-400' },
            ] as { id: AccentTheme; label: string; dot: string }[]).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  soundFX.click();
                  update({ accentTheme: t.id });
                }}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                  settings.accentTheme === t.id
                    ? 'bg-white/10 border-white/40 text-white'
                    : 'bg-[#171E2E] border-white/8 text-slate-300 hover:border-white/20'
                }`}
              >
                <span className={`w-2.5 h-2.5 rounded-full ${t.dot}`} />
                <span>{t.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
