// キャンバスで描く手続き的なテクスチャ
import * as THREE from 'three';

function tex(canvas, srgb = true) {
  const t = new THREE.CanvasTexture(canvas);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function rand(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

// 水槽の背面に印刷された海の絵
export function drawBackdrop(canvas, water) {
  const W = 640, H = 896;
  canvas.width = W; canvas.height = H;
  const g = canvas.getContext('2d');
  const r = rand(7);
  const grd = g.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, water.color);
  grd.addColorStop(1, water.deep);
  g.fillStyle = grd;
  g.fillRect(0, 0, W, H);
  // 光の筋
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 7; i++) {
    const x = r() * W;
    const w = 30 + r() * 70;
    const lg = g.createLinearGradient(0, 0, 0, H * 0.8);
    lg.addColorStop(0, 'rgba(255,255,255,0.16)');
    lg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = lg;
    g.beginPath();
    g.moveTo(x, 0); g.lineTo(x + w, 0); g.lineTo(x + w * 2.4 - 120, H * 0.8); g.lineTo(x - 120, H * 0.8);
    g.fill();
  }
  g.globalCompositeOperation = 'source-over';
  // 遠くの岩
  g.fillStyle = 'rgba(10,30,70,0.25)';
  for (let i = 0; i < 5; i++) {
    const x = r() * W, y = H - 90 - r() * 60;
    g.beginPath(); g.ellipse(x, y + 60, 90 + r() * 80, 70 + r() * 50, 0, 0, Math.PI * 2); g.fill();
  }
  // 海藻
  for (let i = 0; i < 14; i++) {
    const x = r() * W, h = 160 + r() * 330, sway = 20 + r() * 30;
    const hue = 110 + r() * 60;
    g.strokeStyle = `hsla(${hue}, 60%, ${28 + r() * 20}%, 0.85)`;
    g.lineWidth = 8 + r() * 10;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(x, H);
    for (let k = 1; k <= 12; k++) {
      const t = k / 12;
      g.lineTo(x + Math.sin(t * 7 + i) * sway * t, H - h * t);
    }
    g.stroke();
  }
  // サンゴ
  const coral = ['#ff7aa2', '#ffb347', '#ff6f61', '#ffd166', '#c77dff'];
  for (let i = 0; i < 7; i++) {
    const x = 40 + r() * (W - 80), y = H - 20;
    g.strokeStyle = coral[i % coral.length];
    g.lineCap = 'round';
    const branch = (bx, by, len, ang, wdt, depth) => {
      if (depth > 4) return;
      const ex = bx + Math.cos(ang) * len, ey = by + Math.sin(ang) * len;
      g.lineWidth = wdt;
      g.beginPath(); g.moveTo(bx, by); g.lineTo(ex, ey); g.stroke();
      branch(ex, ey, len * 0.72, ang - 0.45 - r() * 0.3, wdt * 0.72, depth + 1);
      branch(ex, ey, len * 0.72, ang + 0.45 + r() * 0.3, wdt * 0.72, depth + 1);
    };
    branch(x, y, 38 + r() * 30, -Math.PI / 2, 12, 0);
  }
  // 砂
  const sg = g.createLinearGradient(0, H - 70, 0, H);
  sg.addColorStop(0, '#f3dfb0'); sg.addColorStop(1, '#d9b779');
  g.fillStyle = sg;
  g.beginPath();
  g.moveTo(0, H);
  for (let x = 0; x <= W; x += 20) g.lineTo(x, H - 50 - Math.sin(x * 0.02) * 14 - r() * 6);
  g.lineTo(W, H); g.fill();
  // 小魚のシルエット
  for (let i = 0; i < 9; i++) {
    const x = r() * W, y = 120 + r() * (H - 380), s = 10 + r() * 14, dir = r() < 0.5 ? -1 : 1;
    g.fillStyle = `rgba(255,255,255,${0.25 + r() * 0.2})`;
    g.beginPath(); g.ellipse(x, y, s * 1.6, s * 0.8, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.moveTo(x - dir * s * 1.4, y); g.lineTo(x - dir * s * 2.6, y - s * 0.8); g.lineTo(x - dir * s * 2.6, y + s * 0.8); g.fill();
  }
  // 描かれた泡
  for (let i = 0; i < 40; i++) {
    const x = r() * W, y = r() * H * 0.85, rr = 3 + r() * 10;
    g.strokeStyle = 'rgba(255,255,255,0.45)'; g.lineWidth = 2;
    g.beginPath(); g.arc(x, y, rr, 0, Math.PI * 2); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.5)';
    g.beginPath(); g.arc(x - rr * 0.35, y - rr * 0.35, rr * 0.25, 0, Math.PI * 2); g.fill();
  }
}

export function makeBackdropTexture(water) {
  const c = document.createElement('canvas');
  drawBackdrop(c, water);
  return tex(c);
}

export function makeLabelTexture(bodyColor) {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 400;
  const g = c.getContext('2d');
  const rr = (x, y, w, h, r) => { g.beginPath(); g.roundRect(x, y, w, h, r); };
  rr(8, 8, 1008, 384, 90);
  const bg = g.createLinearGradient(0, 0, 0, 400);
  bg.addColorStop(0, '#ffffff'); bg.addColorStop(1, '#e8f6ff');
  g.fillStyle = bg; g.fill();
  g.lineWidth = 14; g.strokeStyle = '#1b3a8c'; g.stroke();
  // 波の帯
  g.save();
  rr(8, 8, 1008, 384, 90); g.clip();
  g.fillStyle = '#39b6ff';
  g.beginPath(); g.moveTo(0, 400);
  for (let x = 0; x <= 1024; x += 8) g.lineTo(x, 318 + Math.sin(x * 0.03) * 14);
  g.lineTo(1024, 400); g.fill();
  g.fillStyle = '#1e88e5';
  g.beginPath(); g.moveTo(0, 400);
  for (let x = 0; x <= 1024; x += 8) g.lineTo(x, 345 + Math.sin(x * 0.025 + 2) * 12);
  g.lineTo(1024, 400); g.fill();
  g.restore();
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = '900 150px "M PLUS Rounded 1c", "Hiragino Maru Gothic ProN", sans-serif';
  g.lineJoin = 'round';
  g.lineWidth = 26; g.strokeStyle = '#1b3a8c';
  g.strokeText('WATER GAME', 512, 150);
  const tg = g.createLinearGradient(0, 80, 0, 220);
  tg.addColorStop(0, '#fff36b'); tg.addColorStop(1, bodyColor);
  g.fillStyle = tg;
  g.fillText('WATER GAME', 512, 150);
  g.font = '800 58px "M PLUS Rounded 1c", "Hiragino Maru Gothic ProN", sans-serif';
  g.fillStyle = '#1b3a8c';
  g.fillText('ウォーターゲーム', 512, 262);
  // 星
  const star = (x, y, s, col) => {
    g.fillStyle = col; g.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2, r = i % 2 ? s * 0.45 : s;
      g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    g.fill();
  };
  star(95, 150, 44, '#ffcf33'); star(930, 150, 44, '#ffcf33');
  star(150, 255, 22, '#ff6fb1'); star(875, 255, 22, '#5ee1ff');
  return tex(c);
}

export function makeWoodTexture() {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 1024;
  const g = c.getContext('2d');
  const r = rand(3);
  g.fillStyle = '#c89a6a';
  g.fillRect(0, 0, 1024, 1024);
  for (let p = 0; p < 6; p++) {
    const y0 = p * (1024 / 6);
    g.fillStyle = `hsl(${26 + r() * 6}, ${42 + r() * 10}%, ${52 + r() * 8}%)`;
    g.fillRect(0, y0, 1024, 1024 / 6);
    for (let i = 0; i < 60; i++) {
      const yy = y0 + r() * (1024 / 6);
      g.strokeStyle = `rgba(90,50,20,${0.05 + r() * 0.12})`;
      g.lineWidth = 1 + r() * 3;
      g.beginPath();
      g.moveTo(0, yy);
      for (let x = 0; x <= 1024; x += 32) g.lineTo(x, yy + Math.sin(x * 0.01 + i) * 4 + (r() - 0.5) * 2);
      g.stroke();
    }
    g.fillStyle = 'rgba(60,30,10,0.35)';
    g.fillRect(0, y0, 1024, 3);
  }
  const t = tex(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 3);
  return t;
}

export function makeBackgroundTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 1024;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 1024);
  grd.addColorStop(0, '#223a6b');
  grd.addColorStop(0.55, '#3d6fa8');
  grd.addColorStop(1, '#f2c79a');
  g.fillStyle = grd;
  g.fillRect(0, 0, 512, 1024);
  const r = rand(11);
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 26; i++) {
    const x = r() * 512, y = r() * 700, rad = 15 + r() * 60;
    const rg = g.createRadialGradient(x, y, 0, x, y, rad);
    const hue = [200, 45, 330, 180][i % 4];
    rg.addColorStop(0, `hsla(${hue},90%,75%,${0.08 + r() * 0.12})`);
    rg.addColorStop(1, 'hsla(0,0%,0%,0)');
    g.fillStyle = rg;
    g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
  }
  return tex(c);
}

export function makeGlareTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 512;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 256, 512);
  g.translate(128, 256);
  g.rotate(-0.5);
  const band = (x, w, a) => {
    const lg = g.createLinearGradient(x - w, 0, x + w, 0);
    lg.addColorStop(0, 'rgba(255,255,255,0)');
    lg.addColorStop(0.5, `rgba(255,255,255,${a})`);
    lg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = lg;
    g.fillRect(x - w, -600, w * 2, 1200);
  };
  band(-70, 40, 0.9);
  band(-10, 12, 0.7);
  band(90, 22, 0.35);
  return tex(c);
}

export function makeNetTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 256, 128);
  g.strokeStyle = '#fff'; g.lineWidth = 7;
  for (let i = -8; i < 24; i++) {
    g.beginPath(); g.moveTo(i * 20, 0); g.lineTo(i * 20 + 128, 128); g.stroke();
    g.beginPath(); g.moveTo(i * 20, 0); g.lineTo(i * 20 - 128, 128); g.stroke();
  }
  g.fillRect(0, 0, 256, 14);
  g.fillRect(0, 114, 256, 14);
  const t = tex(c, false);
  t.wrapS = THREE.RepeatWrapping;
  t.repeat.set(3, 1);
  return t;
}

export function makeSparkTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const g = c.getContext('2d');
  const rg = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  rg.addColorStop(0, 'rgba(255,255,255,1)');
  rg.addColorStop(0.25, 'rgba(255,255,255,0.6)');
  rg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = rg; g.fillRect(0, 0, 64, 64);
  g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(32, 2); g.lineTo(32, 62); g.moveTo(2, 32); g.lineTo(62, 32); g.stroke();
  return tex(c, false);
}
