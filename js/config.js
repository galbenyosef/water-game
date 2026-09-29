// ゲーム全体の定数・プリセット・設定の読み書き

// 水槽の内寸（ケースのローカル座標。原点は内側の底の中央）
export const TANK = {
  halfW: 2.5,
  height: 7.0,
  halfD: 0.6,
  water: 6.3,
};

// ジェット（ポンプの吹き出し口）
export const NOZZLES = [
  { x: -1.78, y: 0.28, dir: [0.05, 1] },
  { x: 1.78, y: 0.28, dir: [-0.05, 1] },
];

// 床の形（W字。アイテムが吹き出し口へ転がり落ちる）
export const FLOOR_PROFILE = [
  [-2.5, 0.78], [-2.02, 0.26], [-1.54, 0.26], [-0.3, 0.98],
  [0, 1.05], [0.3, 0.98], [1.54, 0.26], [2.02, 0.26], [2.5, 0.78],
];

export const PEG = {
  pedestalR: 0.42,
  coneH: 0.36,
  pedestalH: 0.16,
  radius: 0.062,
  height: 1.0,
  tipR: 0.085,
};

export const BASKET = { innerR: 0.43, height: 0.55 };

export const PEG_LAYOUTS = {
  2: [[-0.82, 3.0], [0.82, 3.0]],
  3: [[-0.88, 2.55], [0.88, 2.55], [0, 4.2]],
  4: [[-0.95, 2.35], [0.95, 2.35], [-0.55, 4.25], [0.55, 4.25]],
};
export const BASKET_LAYOUT = [[-1.02, 5.25], [1.02, 5.25]];

export const SHAPES = {
  ring:   { label: 'リング', icon: '◯' },
  star:   { label: 'スター', icon: '☆' },
  heart:  { label: 'ハート', icon: '♡' },
  hex:    { label: 'ヘキサ', icon: '⬡' },
  flower: { label: 'フラワー', icon: '✿' },
  ball:   { label: 'ボール', icon: '●' },
};

export const PALETTES = {
  vivid:  { label: 'ビビッド', colors: ['#ff3b5c', '#ffb400', '#22c55e', '#1e90ff', '#a855f7', '#ff7a1a'] },
  pastel: { label: 'パステル', colors: ['#ffadc6', '#ffe08a', '#a8f0c6', '#9fd3ff', '#d5b8ff', '#ffc9a3'] },
  candy:  { label: 'キャンディ', colors: ['#ff4fa3', '#ff8ad8', '#58e1ff', '#ffe066', '#7cff9e', '#ffffff'] },
  jewel:  { label: 'ジュエル', colors: ['#e0115f', '#0f52ba', '#50c878', '#9966cc', '#ffc30b', '#40e0d0'] },
  mono:   { label: 'モノトーン', colors: ['#ffffff', '#d9dde3', '#9aa3ad', '#4b5563', '#1f2328', '#f5e6c8'] },
};

export const MATERIALS = {
  plastic: 'プラスチック',
  glitter: 'ラメ',
  clear:   'クリア',
  metal:   'メタリック',
  pearl:   'パール',
};

export const WATERS = {
  aqua:     { label: 'アクア', color: '#3fb8ff', deep: '#0b4f9c', alpha: 0.2 },
  emerald:  { label: 'エメラルド', color: '#2fe0b4', deep: '#0a6b61', alpha: 0.22 },
  sakura:   { label: 'サクラ', color: '#ff9ccf', deep: '#a33a78', alpha: 0.2 },
  midnight: { label: 'ミッドナイト', color: '#4a5bff', deep: '#0b0f45', alpha: 0.3 },
  clear:    { label: 'とうめい', color: '#d8f2ff', deep: '#6aa7c7', alpha: 0.07 },
};

export const VISCOSITY = {
  light:  { label: 'さらさら', drag: 4.5, damp: 0.45, gravity: 3.4 },
  normal: { label: 'ふつう', drag: 6.5, damp: 0.8, gravity: 2.8 },
  thick:  { label: 'とろとろ', drag: 9.0, damp: 1.5, gravity: 1.8 },
};

export const BODY_COLORS = {
  red:    { label: 'レッド', color: '#ef3340', button: '#ffe14d' },
  blue:   { label: 'ブルー', color: '#2f6bff', button: '#ffffff' },
  yellow: { label: 'イエロー', color: '#ffc21a', button: '#ff4d6d' },
  green:  { label: 'グリーン', color: '#20b86a', button: '#fff2a8' },
  pink:   { label: 'ピンク', color: '#ff6fb1', button: '#ffffff' },
  white:  { label: 'ホワイト', color: '#dfe3ea', button: '#2f6bff' },
};

export const MODES = { free: 'フリー', time: 'タイムアタック' };
export const QUALITIES = { high: '高', medium: '標準', low: '軽量' };

export const MAX_ITEMS = 16;

const isMobile = matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad/i.test(navigator.userAgent);

export const DEFAULTS = {
  counts: { ring: 4, star: 2, heart: 2, hex: 0, flower: 0, ball: 0 },
  palette: 'vivid',
  material: 'plastic',
  pegs: 3,
  water: 'aqua',
  viscosity: 'normal',
  glitter: true,
  body: 'red',
  mode: 'free',
  quality: isMobile ? 'medium' : 'high',
  sound: true,
  tilt: false,
};

const KEY = 'water-game-settings-v1';

export function loadSettings() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULTS);
    const s = JSON.parse(raw);
    const merged = { ...structuredClone(DEFAULTS), ...s, counts: { ...DEFAULTS.counts, ...(s.counts || {}) } };
    merged.tilt = false; // センサー許可はページごとに取り直す
    return merged;
  } catch {
    return structuredClone(DEFAULTS);
  }
}

export function saveSettings(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* 保存できなくても遊べる */ }
}

export function setupKey(s) {
  const c = s.counts;
  return `${Object.keys(SHAPES).map(k => c[k] || 0).join('-')}_p${s.pegs}_${s.viscosity}`;
}

export function loadBest(key) {
  try { const v = parseFloat(localStorage.getItem('water-game-best-' + key)); return isFinite(v) ? v : null; } catch { return null; }
}
export function saveBest(key, t) {
  try { localStorage.setItem('water-game-best-' + key, String(t)); } catch { /* noop */ }
}
