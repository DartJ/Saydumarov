import React, { useState } from 'react';
import { Trash2, Trophy } from 'lucide-react';
import { GameRecords } from '../types/arcade';
import { soundFX } from '../utils/sound';

interface RecordsViewProps {
  records: GameRecords;
  onResetRecords: () => void;
}

export const RecordsView: React.FC<RecordsViewProps> = ({
  records,
  onResetRecords,
}) => {
  const [confirmReset, setConfirmReset] = useState(false);

  return (
    <div className="flex flex-col gap-6 w-full max-w-5xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-4 bg-[#111622] border border-white/8 rounded-xl p-5">
        <div className="flex items-center gap-3">
          <Trophy className="w-6 h-6 text-amber-400" />
          <div>
            <h1 className="font-display text-xl sm:text-2xl font-bold text-white">
              Личные рекорды
            </h1>
            <p className="text-sm text-slate-400">
              Статистика сохраняется локально в вашем браузере
            </p>
          </div>
        </div>

        {!confirmReset ? (
          <button
            type="button"
            onClick={() => {
              soundFX.click();
              setConfirmReset(true);
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#19202F] hover:bg-rose-500/20 text-xs font-semibold text-slate-300 hover:text-rose-200 border border-white/10 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Сбросить статистику</span>
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-xs text-rose-300">Удалить все рекорды?</span>
            <button
              type="button"
              onClick={() => {
                soundFX.click();
                onResetRecords();
                setConfirmReset(false);
              }}
              className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold"
            >
              Да, сбросить
            </button>
            <button
              type="button"
              onClick={() => setConfirmReset(false)}
              className="px-3 py-1.5 rounded-lg bg-[#19202F] text-slate-300 text-xs font-semibold"
            >
              Отмена
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {/* Chess */}
        <div className="bg-[#111622] border border-white/8 rounded-xl p-5 flex flex-col gap-3">
          <h2 className="text-base font-bold text-white">Шахматы</h2>
          <div className="grid grid-cols-2 gap-3 text-xs pt-1">
            <div>
              <div className="text-slate-400">Партий</div>
              <div className="font-mono-num text-xl font-bold text-slate-100">
                {records.chess.played}
              </div>
            </div>
            <div>
              <div className="text-slate-400">Побед</div>
              <div className="font-mono-num text-xl font-bold text-cyan-300">
                {records.chess.wins}
              </div>
            </div>
            <div>
              <div className="text-slate-400">Ничьих</div>
              <div className="font-mono-num text-lg font-semibold text-slate-300">
                {records.chess.draws}
              </div>
            </div>
            <div>
              <div className="text-slate-400">Поражений</div>
              <div className="font-mono-num text-lg font-semibold text-rose-300">
                {records.chess.losses}
              </div>
            </div>
          </div>
        </div>

        {/* Minesweeper */}
        <div className="bg-[#111622] border border-white/8 rounded-xl p-5 flex flex-col gap-3">
          <h2 className="text-base font-bold text-white">Сапёр</h2>
          <div className="flex flex-col gap-2 text-xs pt-1">
            <div className="flex justify-between">
              <span className="text-slate-400">Новичок (9×9)</span>
              <span className="font-mono-num font-bold text-amber-300">
                {records.minesweeper.beginnerBestSec !== null
                  ? `${records.minesweeper.beginnerBestSec}с`
                  : '—'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Любитель (16×16)</span>
              <span className="font-mono-num font-bold text-amber-300">
                {records.minesweeper.intermediateBestSec !== null
                  ? `${records.minesweeper.intermediateBestSec}с`
                  : '—'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Профи (30×16)</span>
              <span className="font-mono-num font-bold text-amber-300">
                {records.minesweeper.expertBestSec !== null
                  ? `${records.minesweeper.expertBestSec}с`
                  : '—'}
              </span>
            </div>
            <div className="border-t border-white/8 pt-2 mt-1 flex justify-between">
              <span className="text-slate-400">Побед / Всего</span>
              <span className="font-mono-num font-semibold text-slate-200">
                {records.minesweeper.gamesWon} / {records.minesweeper.gamesPlayed}
              </span>
            </div>
          </div>
        </div>

        {/* Billiards */}
        <div className="bg-[#111622] border border-white/8 rounded-xl p-5 flex flex-col gap-3">
          <h2 className="text-base font-bold text-white">Бильярд 8-Ball</h2>
          <div className="grid grid-cols-2 gap-3 text-xs pt-1">
            <div>
              <div className="text-slate-400">Матчей</div>
              <div className="font-mono-num text-xl font-bold text-slate-100">
                {records.billiards.gamesPlayed}
              </div>
            </div>
            <div>
              <div className="text-slate-400">Побед над ИИ</div>
              <div className="font-mono-num text-xl font-bold text-emerald-300">
                {records.billiards.winsVsAi}
              </div>
            </div>
            <div>
              <div className="text-slate-400">Забито шаров</div>
              <div className="font-mono-num text-lg font-semibold text-slate-200">
                {records.billiards.ballsPocketed}
              </div>
            </div>
            <div>
              <div className="text-slate-400">Лучшая серия</div>
              <div className="font-mono-num text-lg font-semibold text-cyan-300">
                {records.billiards.bestRun}
              </div>
            </div>
          </div>
        </div>

        {/* Checkers */}
        <div className="bg-[#111622] border border-white/8 rounded-xl p-5 flex flex-col gap-3">
          <h2 className="text-base font-bold text-white">Русские шашки</h2>
          <div className="grid grid-cols-2 gap-3 text-xs pt-1">
            <div>
              <div className="text-slate-400">Партий</div>
              <div className="font-mono-num text-xl font-bold text-slate-100">
                {records.checkers.played}
              </div>
            </div>
            <div>
              <div className="text-slate-400">Побед</div>
              <div className="font-mono-num text-xl font-bold text-sky-300">
                {records.checkers.wins}
              </div>
            </div>
          </div>
        </div>

        {/* TicTacToe */}
        <div className="bg-[#111622] border border-white/8 rounded-xl p-5 flex flex-col gap-3">
          <h2 className="text-base font-bold text-white">Крестики-нолики Pro</h2>
          <div className="grid grid-cols-3 gap-3 text-xs pt-1">
            <div>
              <div className="text-slate-400">Игр</div>
              <div className="font-mono-num text-xl font-bold text-slate-100">
                {records.tictactoe.played}
              </div>
            </div>
            <div>
              <div className="text-slate-400">Побед</div>
              <div className="font-mono-num text-xl font-bold text-rose-300">
                {records.tictactoe.wins}
              </div>
            </div>
            <div>
              <div className="text-slate-400">Ничьих</div>
              <div className="font-mono-num text-xl font-bold text-slate-300">
                {records.tictactoe.draws}
              </div>
            </div>
          </div>
        </div>

        {/* City Driver 3D */}
        <div className="bg-[#111622] border border-white/8 rounded-xl p-5 flex flex-col gap-3">
          <h2 className="text-base font-bold text-white">Мегаполис Drive 3D</h2>
          <div className="grid grid-cols-3 gap-3 text-xs pt-1">
            <div>
              <div className="text-slate-400">Контракты</div>
              <div className="font-mono-num text-xl font-bold text-slate-100">
                {records.cityDriver.missionsCompleted}
              </div>
            </div>
            <div>
              <div className="text-slate-400">Заработано</div>
              <div className="font-mono-num text-lg font-bold text-emerald-300">
                ${records.cityDriver.totalCashEarned}
              </div>
            </div>
            <div>
              <div className="text-slate-400">Макс. розыск</div>
              <div className="font-mono-num text-xl font-bold text-amber-300">
                {records.cityDriver.maxWantedStars}★
              </div>
            </div>
          </div>
        </div>

        {/* Tactical Strike 3D */}
        <div className="bg-[#111622] border border-white/8 rounded-xl p-5 flex flex-col gap-3">
          <h2 className="text-base font-bold text-white">Tactical Strike 3D</h2>
          <div className="grid grid-cols-2 gap-3 text-xs pt-1">
            <div>
              <div className="text-slate-400">Фраги</div>
              <div className="font-mono-num text-xl font-bold text-cyan-300">
                {records.tacticalFps.kills}
              </div>
            </div>
            <div>
              <div className="text-slate-400">В голову</div>
              <div className="font-mono-num text-xl font-bold text-amber-300">
                {records.tacticalFps.headshots}
              </div>
            </div>
            <div>
              <div className="text-slate-400">Раундов выиграно</div>
              <div className="font-mono-num text-lg font-semibold text-emerald-300">
                {records.tacticalFps.roundsWon}
              </div>
            </div>
            <div>
              <div className="text-slate-400">Смертей</div>
              <div className="font-mono-num text-lg font-semibold text-rose-300">
                {records.tacticalFps.deaths}
              </div>
            </div>
          </div>
        </div>

        {/* Color Block */}
        <div className="bg-[#111622] border border-white/8 rounded-xl p-5 flex flex-col gap-3">
          <h2 className="text-base font-bold text-white">Color Block</h2>
          <div className="grid grid-cols-3 gap-3 text-xs pt-1">
            <div>
              <div className="text-slate-400">Рекорд</div>
              <div className="font-mono-num text-xl font-bold text-cyan-300">
                {records.colorBlock.bestScore}
              </div>
            </div>
            <div>
              <div className="text-slate-400">Линий</div>
              <div className="font-mono-num text-xl font-bold text-slate-100">
                {records.colorBlock.totalLinesCleared}
              </div>
            </div>
            <div>
              <div className="text-slate-400">Макс. комбо</div>
              <div className="font-mono-num text-xl font-bold text-violet-300">
                ×{records.colorBlock.bestCombo}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
