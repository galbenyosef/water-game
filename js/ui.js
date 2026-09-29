// カスタマイズ画面
import {
  SHAPES, PALETTES, MATERIALS, WATERS, VISCOSITY, BODY_COLORS, MODES, QUALITIES, MAX_ITEMS, DEFAULTS,
} from './config.js';

const $ = (id) => document.getElementById(id);

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}

export class SettingsPanel {
  constructor({ onApply, onTilt }) {
    this.onApply = onApply;
    this.onTilt = onTilt;
    this.draft = null;
    $('btn-close').addEventListener('click', () => this.close());
    $('panel').addEventListener('pointerdown', (e) => { if (e.target.id === 'panel') this.close(); });
    $('btn-apply').addEventListener('click', () => { this.close(); this.onApply(this.draft); });
    $('btn-defaults').addEventListener('click', () => {
      const keep = { sound: this.draft.sound, quality: this.draft.quality, tilt: this.draft.tilt };
      this.draft = { ...structuredClone(DEFAULTS), ...keep };
      this.render();
    });
  }

  get isOpen() { return !$('panel').classList.contains('hidden'); }

  open(settings) {
    this.draft = structuredClone(settings);
    this.render();
    $('panel').classList.remove('hidden');
  }

  close() { $('panel').classList.add('hidden'); }

  total() { return Object.values(this.draft.counts).reduce((a, b) => a + b, 0); }

  render() {
    const d = this.draft;
    const body = $('panel-body');
    body.innerHTML = '';

    // アイテム
    const secItems = el('div', 'sec');
    const title = el('div', 'sec-title', `<span>水の中のアイテム</span><span>${this.total()} / ${MAX_ITEMS}</span>`);
    secItems.appendChild(title);
    const grid = el('div', 'items-grid');
    for (const [k, s] of Object.entries(SHAPES)) {
      const card = el('div', 'item-card');
      card.appendChild(el('span', 'ico', s.icon));
      card.appendChild(el('span', 'nm', `${s.label}<small>${k === 'ball' ? 'カゴに入れる' : 'ペグに入れる'}</small>`));
      const st = el('div', 'stepper');
      const minus = el('button', '', '−');
      const val = el('span', 'val', String(d.counts[k] || 0));
      const plus = el('button', '', '+');
      minus.setAttribute('aria-label', `${s.label}を減らす`);
      plus.setAttribute('aria-label', `${s.label}を増やす`);
      minus.onclick = () => { d.counts[k] = Math.max(0, (d.counts[k] || 0) - 1); this.render(); };
      plus.onclick = () => { if (this.total() < MAX_ITEMS) { d.counts[k] = (d.counts[k] || 0) + 1; this.render(); } };
      st.append(minus, val, plus);
      card.appendChild(st);
      grid.appendChild(card);
    }
    secItems.appendChild(grid);
    if (this.total() === 0) secItems.appendChild(el('div', 'note', 'アイテムを1つ以上えらんでね。'));
    body.appendChild(secItems);

    const chips = (label, key, options, render) => {
      const sec = el('div', 'sec');
      sec.appendChild(el('div', 'sec-title', `<span>${label}</span>`));
      const wrap = el('div', 'chips');
      for (const [k, v] of Object.entries(options)) {
        const c = el('button', 'chip' + (String(d[key]) === String(k) ? ' on' : ''), render ? render(k, v) : v);
        c.onclick = () => {
          const t = typeof DEFAULTS[key];
          const v = t === 'number' ? Number(k) : t === 'boolean' ? k === 'true' : k;
          if (key === 'tilt' && v && !d.tilt) {
            // iOS では許可ダイアログをタップの直後に出す必要がある
            this.onTilt().then(ok => { d.tilt = ok; this.render(); });
            return;
          }
          d[key] = v;
          this.render();
        };
        wrap.appendChild(c);
      }
      sec.appendChild(wrap);
      body.appendChild(sec);
      return sec;
    };

    chips('アイテムの色', 'palette', PALETTES, (k, v) => `<span class="pal">${v.colors.slice(0, 5).map(c => `<i style="background:${c}"></i>`).join('')}</span>${v.label}`);
    chips('アイテムの素材', 'material', MATERIALS);
    chips('ペグの数', 'pegs', { 2: '2本', 3: '3本', 4: '4本' });
    chips('水の色', 'water', WATERS, (k, v) => `<span class="sw" style="background:${v.color}"></span>${v.label}`);
    chips('水のとろみ', 'viscosity', VISCOSITY, (k, v) => v.label);
    chips('水の中のラメ', 'glitter', { true: 'あり', false: 'なし' });
    chips('本体の色', 'body', BODY_COLORS, (k, v) => `<span class="sw" style="background:${v.color}"></span>${v.label}`);
    chips('モード', 'mode', MODES);
    chips('画質', 'quality', QUALITIES);
    if (matchMedia('(pointer: coarse)').matches) {
      const tilt = chips('スマホの傾きセンサー', 'tilt', { true: 'つかう', false: 'つかわない' });
      tilt.appendChild(el('div', 'note', 'スマホをかたむけると中の水もかたむきます。ふるとアイテムがまい上がります。'));
    } else {
      body.appendChild(el('div', 'note', 'キーボードの Q / E でケースをかたむけられます。'));
    }
  }
}
