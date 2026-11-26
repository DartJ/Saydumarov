import { GameManifest } from '../types/arcade';

export const GAME_REGISTRY: GameManifest[] = [
  {
    id: 'chess',
    title: 'Шахматы',
    subtitle: 'Классика с сильным ИИ и онлайн-дуэлями',
    description:
      'Официальные правила ФИДЕ: рокировка, взятие на проходе, превращение пешки, таймеры, нотация и 3 уровня ИИ с просчётом комбинаций.',
    category: 'strategy',
    categoryLabel: 'Стратегия',
    playersLabel: 'ИИ / 2 игрока / Онлайн',
    supportsOnline: true,
    supportsAi: true,
    coverImage: '/src/assets/images/arcade_chess_cover_1795686860953.jpg',
    accentColor: '#06B6D4',
    controlsHint: 'Клик по фигуре для выбора и подсветки ходов',
  },
  {
    id: 'billiards',
    title: 'Бильярд 8-Ball',
    subtitle: 'Реалистичная физика стола и игра против бота',
    description:
      'Полноценный стол с шестью лузами, упругими столкновениями без туннелирования, оттяжкой кия, линией прицеливания и режимом тренировки.',
    category: 'physics',
    categoryLabel: 'Физика',
    playersLabel: 'Тренировка / Против ИИ / 2 игрока',
    supportsOnline: false,
    supportsAi: true,
    coverImage: '/src/assets/images/arcade_billiards_cover_1795686862434.jpg',
    accentColor: '#10B981',
    controlsHint: 'Наведите прицел, зажмите и оттяните кий назад для удара',
  },
  {
    id: 'minesweeper',
    title: 'Сапёр',
    subtitle: 'Тактическая классика с рекордами',
    description:
      'Безопасный первый клик, мгновенное каскадное раскрытие пустых зон, установка флагов, быстрый аккорд и таблица личных рекордов.',
    category: 'logic',
    categoryLabel: 'Головоломка',
    playersLabel: 'Соло · 3 сложности',
    supportsOnline: false,
    supportsAi: false,
    coverImage: '/src/assets/images/arcade_minesweeper_cover_1795686861275.jpg',
    accentColor: '#F59E0B',
    controlsHint: 'ЛКМ — открыть · ПКМ или режим флага — пометить мину',
  },
  {
    id: 'checkers',
    title: 'Русские шашки',
    subtitle: 'Обязательные взятия, серии боёв и дамки',
    description:
      'Традиционные правила русских шашек: дальнобойная дамка, цепочки взятий и превращение в дамку прямо в бою. Игра с ИИ или по сети.',
    category: 'strategy',
    categoryLabel: 'Стратегия',
    playersLabel: 'ИИ / 2 игрока / Онлайн',
    supportsOnline: true,
    supportsAi: true,
    coverImage: '/src/assets/images/arcade_checkers_cover_1795686863293.jpg',
    accentColor: '#38BDF8',
    controlsHint: 'Выберите шашку и следуйте подсвеченным ходам',
  },
  {
    id: 'tictactoe',
    title: 'Крестики-нолики Pro',
    subtitle: 'Режимы 3×3 и тактический 5×5 (4 в ряд)',
    description:
      'Быстрые раунды против непобедимого алгоритма Минимакс на поле 3×3 или глубокая тактика 4-в-ряд на сетке 5×5 и в онлайн-комнатах.',
    category: 'logic',
    categoryLabel: 'Быстрая дуэль',
    playersLabel: 'ИИ / 2 игрока / Онлайн',
    supportsOnline: true,
    supportsAi: true,
    coverImage: '/src/assets/images/arcade_tictactoe_cover_1795686862850.jpg',
    accentColor: '#F43F5E',
    controlsHint: 'Клик по свободной клетке для хода',
  },
  {
    id: 'city_driver',
    title: 'Мегаполис Drive 3D',
    subtitle: 'Открытый 3D-город, дрифт и погони полиции',
    description:
      'Свободная езда по ночному прибрежному мегаполису: физика дрифта, выход из авто и перехват транспорта, контракты на время и звёзды розыска полиции.',
    category: 'action',
    categoryLabel: 'Экшн 3D',
    playersLabel: 'Соло · Открытый мир WebGL',
    supportsOnline: false,
    supportsAi: true,
    coverImage: '/src/assets/images/arcade_city_cover_1795688251657.jpg',
    accentColor: '#F59E0B',
    controlsHint: 'WASD — движение · Space — дрифт · F — выйти/сесть в авто',
  },
  {
    id: 'tactical_fps',
    title: 'Tactical Strike 3D',
    subtitle: 'Тактический 3D-шутер 5×5 с закупкой и C4',
    description:
      'Командный шутер от первого лица в духе классики: раунды CT против T, магазин оружия (AK-47, M4A1-S, AWP с оптикой), хедшоты и бомба C4 на точках A и B.',
    category: 'action',
    categoryLabel: 'Экшн 3D',
    playersLabel: '5×5 с ботами · 1×5 Соло',
    supportsOnline: false,
    supportsAi: true,
    coverImage: '/src/assets/images/arcade_fps_cover_1795688251311.jpg',
    accentColor: '#38BDF8',
    controlsHint: 'Клик — прицел/огонь · B — магазин · R — перезаряд · E — C4',
  },
];

export function getGameManifest(id: string): GameManifest | undefined {
  return GAME_REGISTRY.find((g) => g.id === id);
}
