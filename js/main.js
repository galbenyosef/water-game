// ウォーターゲーム：全体の組み立てとゲームループ
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import RAPIER from 'rapier';
import {
  PALETTES, WATERS, VISCOSITY, BODY_COLORS, PEG_LAYOUTS, BASKET_LAYOUT, SHAPES,
  loadSettings, saveSettings, setupKey, loadBest, saveBest,
} from './config.js';
import { Fluid } from './fluid.js';
import { Physics } from './physics.js';
import { Toy } from './toy.js';
import { shared, makeItemMaterial } from './materials.js';
import { Bubbles, Glitter, Sparks } from './effects.js';
import { Sfx } from './audio.js';
import { SettingsPanel } from './ui.js';
import { makeBackgroundTexture, makeWoodTexture } from './textures.js';

const $ = (id) => document.getElementById(id);

// ---------- レンダラーとシーン ----------
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.9;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = makeBackgroundTexture();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.6;

const camera = new THREE.PerspectiveCamera(30, 1, 0.5, 200);

scene.add(new THREE.HemisphereLight('#d6ecff', '#8a6a4a', 0.4));
const key = new THREE.DirectionalLight('#fff3df', 2.2);
key.position.set(-6, 15, 11);
key.target.position.set(0, 4, 0);
key.shadow.camera.left = -8; key.shadow.camera.right = 8;
key.shadow.camera.top = 13; key.shadow.camera.bottom = -4;
key.shadow.camera.near = 2; key.shadow.camera.far = 45;
key.shadow.bias = -0.0005;
key.shadow.normalBias = 0.02;
scene.add(key, key.target);
const rim = new THREE.DirectionalLight('#9fd8ff', 0.9);
rim.position.set(7, 9, -9);
scene.add(rim);

const table = new THREE.Mesh(
  new THREE.PlaneGeometry(90, 90),
  new THREE.MeshStandardMaterial({ map: makeWoodTexture(), roughness: 0.55, metalness: 0 })
);
table.rotation.x = -Math.PI / 2;
table.receiveShadow = true;
scene.add(table);

// ---------- おもちゃ ----------
const PIVOT = 3.0;          // ケースを傾けるときの回転中心（ケース原点からの高さ）
const HOLD_Y = 2.12 + PIVOT; // 台座の足がテーブルに乗る高さ
const holder = new THREE.Group();
holder.position.set(0, HOLD_Y, 0);
scene.add(holder);
const toy = new Toy();
toy.group.position.set(0, -PIVOT, 0);
holder.add(toy.group);

const fluid = new Fluid();
const bubbles = new Bubbles(520);
const glitter = new Glitter(300);
const sparks = new Sparks(360);
const itemsGroup = new THREE.Group();
toy.group.add(itemsGroup, bubbles.mesh, glitter.points, sparks.points);

const sfx = new Sfx();
let physics = null;
let settings = loadSettings();

// ---------- 画質 ----------
let composer = null, bloom = null;
function setupQuality(q) {
  const dprMax = q === 'high' ? 2 : q === 'medium' ? 1.5 : 1;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dprMax));
  const shadows = q !== 'low';
  if (renderer.shadowMap.enabled !== shadows) {
    renderer.shadowMap.enabled = shadows;
    scene.traverse(o => { if (o.material) [].concat(o.material).forEach(m => { m.needsUpdate = true; }); });
  }
  key.castShadow = shadows;
  const size = q === 'high' ? 2048 : 1024;
  if (key.shadow.mapSize.x !== size) {
    key.shadow.mapSize.set(size, size);
    if (key.shadow.map) { key.shadow.map.dispose(); key.shadow.map = null; }
  }
  if (composer) { composer.dispose(); composer = null; }
  if (q !== 'low') {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.32, 0.55, 0.88);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
  }
  resize();
}

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  if (composer) { composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(w, h); }
  camera.aspect = w / h;
  const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const halfW = 3.5, halfH = 5.6;
  cam.dist = Math.max(halfH / t, halfW / (t * camera.aspect));
  camera.updateProjectionMatrix();
  glitter.uniforms.uPR.value = renderer.getPixelRatio();
  sparks.uniforms.uPR.value = renderer.getPixelRatio();
}
const cam = { dist: 25, px: 0, py: 0, tx: 0, ty: 0, shake: 0 };
window.addEventListener('resize', resize);

// ---------- アイテム ----------
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

function buildWorld() {
  const visc = VISCOSITY[settings.viscosity];
  physics.visc = { ...visc };
  fluid.damp = visc.damp;
  fluid.clear();
  const pegs = PEG_LAYOUTS[settings.pegs].map(([x, y]) => ({ x, y }));
  const hasBall = (settings.counts.ball || 0) > 0;
  const hasRing = Object.entries(settings.counts).some(([k, v]) => k !== 'ball' && v > 0);
  const baskets = hasBall ? BASKET_LAYOUT.map(([x, y]) => ({ x, y })) : [];
  physics.build(hasRing || !hasBall ? pegs : [], baskets);
  toy.buildPegs(physics.pegs, baskets, BODY_COLORS[settings.body]);

  for (const m of [...itemsGroup.children]) { itemsGroup.remove(m); m.material.map?.dispose(); m.material.dispose(); }
  const kinds = [];
  for (const k of Object.keys(SHAPES)) for (let i = 0; i < (settings.counts[k] || 0); i++) kinds.push(k);
  shuffle(kinds);
  const colors = PALETTES[settings.palette].colors;
  const offset = Math.floor(Math.random() * colors.length);
  kinds.forEach((kind, i) => {
    const item = physics.addItem(kind, i, kinds.length);
    const color = colors[(i + offset) % colors.length];
    const mesh = new THREE.Mesh(item.shape.geometry, makeItemMaterial(kind, color, settings.material));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    itemsGroup.add(mesh);
    item.mesh = mesh;
    item.color = color;
  });
  physics.setGravityAngle(tilt.phys);
  physics.settle(fluid);
  $('total').textContent = String(kinds.length);
}

function applySettings(s, { rebuild = true } = {}) {
  const prevQuality = settings.quality;
  settings = s;
  saveSettings(settings);
  toy.setWater(WATERS[settings.water]);
  toy.setBody(BODY_COLORS[settings.body]);
  glitter.points.visible = settings.glitter;
  sfx.setEnabled(settings.sound);
  $('btn-sound').classList.toggle('muted', !settings.sound);
  if (prevQuality !== settings.quality || !composerReady) { setupQuality(settings.quality); composerReady = true; }
  if (!settings.tilt) stopSensors();
  if (rebuild) { buildWorld(); resetGame(); }
}
let composerReady = false;

// ---------- ゲームの状態 ----------
const game = {
  phase: 'title', score: 0, running: false, start: 0, elapsed: 0,
  completed: false, clearHold: 0, pressedEver: false,
};

function resetGame() {
  game.score = 0; game.running = false; game.elapsed = 0; game.completed = false; game.clearHold = 0;
  $('score').textContent = '0';
  $('clear').classList.add('hidden');
  const timed = settings.mode === 'time';
  $('timer-box').classList.toggle('hidden', !timed);
  $('timer').textContent = fmt(0);
  const best = loadBest(setupKey(settings));
  $('best').textContent = best != null ? `ベスト ${fmt(best)}` : 'ベスト --';
}

function respawn() {
  if (!physics) return;
  buildWorld();
  resetGame();
  toast('リセットしました');
}

function fmt(t) {
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(1)}`;
}

let toastTimer = 0;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1600);
}

function complete() {
  game.completed = true;
  const timed = settings.mode === 'time';
  if (game.running) { game.running = false; }
  sfx.fanfare();
  for (const it of physics.items) sparks.burst(it.pos, it.color, 26, 3);
  if (navigator.vibrate) navigator.vibrate([30, 60, 30, 60, 80]);
  setTimeout(() => {
    if (!game.completed) return;
    $('clear-time').textContent = timed ? fmt(game.elapsed) : `${physics.items.length} こ ぜんぶ入った!`;
    let bestMsg = '';
    if (timed) {
      const k = setupKey(settings);
      const best = loadBest(k);
      if (best == null || game.elapsed < best) {
        saveBest(k, game.elapsed);
        bestMsg = best == null ? 'はじめての記録!' : `ベスト更新! (${fmt(best)} → ${fmt(game.elapsed)})`;
        $('best').textContent = `ベスト ${fmt(game.elapsed)}`;
      } else {
        bestMsg = `ベスト ${fmt(best)}`;
      }
    } else {
      bestMsg = 'タイムアタックにも挑戦してみてね';
    }
    $('clear-best').textContent = bestMsg;
    $('clear').classList.remove('hidden');
  }, 1300);
}

// ---------- ポンプ（ボタン） ----------
const pumps = [0, 1].map(() => ({ held: false, t: 0, res: 1, out: 0, vis: 0, demo: 0 }));
const jets = [0, 0];

function setHeld(i, v, fromUser = true) {
  const p = pumps[i];
  if (v && !p.held) {
    p.t = 0;
    sfx.press();
    if (fromUser) {
      if (navigator.vibrate) navigator.vibrate(12);
      if (!game.pressedEver) { game.pressedEver = true; }
      if (settings.mode === 'time' && !game.running && !game.completed && game.phase === 'play') {
        game.running = true; game.start = performance.now() - game.elapsed * 1000;
      }
    }
  }
  p.held = v;
}

function updatePumps(dt) {
  pumps.forEach((p, i) => {
    let target = 0;
    if (p.held) {
      p.t += dt;
      const burst = Math.exp(-p.t / 0.35);
      p.res = Math.max(0, p.res - dt * 0.55);
      target = (0.3 + 1.2 * burst) * (0.3 + 0.7 * p.res);
    } else {
      p.res = Math.min(1, p.res + dt * 1.4);
    }
    p.out += (target - p.out) * Math.min(1, dt * (target > p.out ? 30 : 10));
    p.vis += ((p.held ? 1 : 0) - p.vis) * Math.min(1, dt * 22);
    jets[i] = p.out;
  });
}

// ---------- 入力 ----------
const pointers = new Map();
canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  sfx.unlock();
  if (game.phase !== 'play') return;
  const side = e.clientX < window.innerWidth / 2 ? 0 : 1;
  pointers.set(e.pointerId, side);
  try { canvas.setPointerCapture(e.pointerId); } catch { /* noop */ }
  setHeld(side, true);
});
const release = (e) => {
  const side = pointers.get(e.pointerId);
  if (side == null) return;
  pointers.delete(e.pointerId);
  if (![...pointers.values()].includes(side)) setHeld(side, false);
};
canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', release);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'mouse') {
    cam.tx = (e.clientX / window.innerWidth - 0.5) * 2;
    cam.ty = (e.clientY / window.innerHeight - 0.5) * 2;
  }
});
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());

const keysDown = new Set();
const KEYMAP = { KeyA: 0, ArrowLeft: 0, KeyF: 0, KeyD: 1, ArrowRight: 1, KeyJ: 1 };
window.addEventListener('keydown', (e) => {
  if (panel.isOpen) return;
  sfx.unlock();
  if (e.code in KEYMAP) {
    e.preventDefault();
    if (game.phase !== 'play') return;
    keysDown.add(e.code);
    if (!e.repeat) setHeld(KEYMAP[e.code], true);
  } else if (e.code === 'KeyQ') { tilt.key = 1; }
  else if (e.code === 'KeyE') { tilt.key = -1; }
  else if (e.code === 'Space') { e.preventDefault(); if (!e.repeat && game.phase === 'play') doShake(); }
  else if (e.code === 'KeyR') { if (game.phase === 'play') respawn(); }
  else if (e.code === 'KeyM') { toggleSound(); }
  else if (e.code === 'Enter' && game.phase === 'title' && physics) { startGame(); }
});
window.addEventListener('keyup', (e) => {
  if (e.code in KEYMAP) {
    keysDown.delete(e.code);
    const side = KEYMAP[e.code];
    const still = [...keysDown].some(k => KEYMAP[k] === side);
    if (!still && ![...pointers.values()].includes(side)) setHeld(side, false);
  } else if ((e.code === 'KeyQ' && tilt.key === 1) || (e.code === 'KeyE' && tilt.key === -1)) tilt.key = 0;
});
window.addEventListener('blur', () => {
  keysDown.clear(); pointers.clear(); tilt.key = 0;
  setHeld(0, false); setHeld(1, false);
});

// ---------- 傾き（キーボード／センサー） ----------
const tilt = { key: 0, sensor: 0, vis: 0, phys: 0, sensorOn: false };
let lastShake = 0;

function onOrientation(e) {
  if (e.gamma == null) return;
  const ang = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
  let g;
  if (ang === 90) g = e.beta;
  else if (ang === -90 || ang === 270) g = -e.beta;
  else g = e.gamma;
  tilt.sensor = THREE.MathUtils.clamp(THREE.MathUtils.degToRad(g || 0), -0.9, 0.9);
}
function onMotion(e) {
  const a = e.accelerationIncludingGravity;
  if (!a || a.x == null) return;
  const mag = Math.hypot(a.x, a.y, a.z);
  const now = performance.now();
  if (Math.abs(mag - 9.8) > 13 && now - lastShake > 900 && game.phase === 'play') { lastShake = now; doShake(0.8); }
}
async function enableSensors() {
  try {
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      const r = await DeviceOrientationEvent.requestPermission();
      if (r !== 'granted') { toast('センサーが許可されませんでした'); return false; }
      if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
        await DeviceMotionEvent.requestPermission().catch(() => {});
      }
    } else if (typeof DeviceOrientationEvent === 'undefined') {
      toast('この端末では傾きセンサーが使えません');
      return false;
    }
    window.addEventListener('deviceorientation', onOrientation);
    window.addEventListener('devicemotion', onMotion);
    tilt.sensorOn = true;
    return true;
  } catch {
    toast('センサーを有効にできませんでした');
    return false;
  }
}
function stopSensors() {
  window.removeEventListener('deviceorientation', onOrientation);
  window.removeEventListener('devicemotion', onMotion);
  tilt.sensorOn = false; tilt.sensor = 0;
}

function doShake(power = 1) {
  if (!physics) return;
  physics.shake(power);
  fluid.stir(power);
  sfx.shake();
  cam.shake = 0.5;
  for (let i = 0; i < 40; i++) {
    bubbles.spawn((Math.random() - 0.5) * 4.6, 0.6 + Math.random() * 4, (Math.random() - 0.5) * 0.9, 0.02 + Math.random() * 0.07);
  }
  if (navigator.vibrate) navigator.vibrate(40);
}

function toggleSound() {
  settings.sound = !settings.sound;
  saveSettings(settings);
  sfx.unlock();
  sfx.setEnabled(settings.sound);
  $('btn-sound').classList.toggle('muted', !settings.sound);
  toast(settings.sound ? 'サウンド オン' : 'サウンド オフ');
}

// ---------- UI ----------
const panel = new SettingsPanel({
  onApply: (d) => {
    if (Object.values(d.counts).reduce((a, b) => a + b, 0) === 0) d.counts.ring = 1;
    applySettings(d);
  },
  onTilt: () => enableSensors(),
});
$('btn-settings').addEventListener('click', () => { releaseAll(); panel.open(settings); });
$('btn-reset').addEventListener('click', () => respawn());
$('btn-shake').addEventListener('click', () => { sfx.unlock(); doShake(); });
$('btn-sound').addEventListener('click', () => toggleSound());
$('btn-again').addEventListener('click', () => respawn());
$('btn-continue').addEventListener('click', () => $('clear').classList.add('hidden'));
$('btn-play').addEventListener('click', () => startGame());

function releaseAll() { pointers.clear(); keysDown.clear(); setHeld(0, false); setHeld(1, false); }

function startGame() {
  sfx.unlock();
  releaseAll();
  $('start').classList.add('hidden');
  $('hud').classList.remove('hidden');
  game.phase = 'play';
  buildWorld();
  resetGame();
}

// ---------- ループ ----------
const clock = new THREE.Clock();
const up = new THREE.Vector3();
const _v = new THREE.Vector3();
let time = 0;
let demoTimer = 0;
const surfaceY = (x) => physics.surfaceY(x);
const hintEls = [$('hint-l'), $('hint-r')];

function frame() {
  const dt = Math.min(clock.getDelta(), 1 / 30);
  time += dt;
  shared.uTime.value = time;

  if (physics) {
    // タイトル画面では自動でボタンを押して見せる
    if (game.phase === 'title') {
      demoTimer -= dt;
      if (demoTimer <= 0) {
        const s = Math.random() < 0.5 ? 0 : 1;
        pumps.forEach(p => { p.held = false; });
        pumps[s].held = true; pumps[s].t = 0;
        demoTimer = 0.9 + Math.random() * 1.2;
        setTimeout(() => { pumps[s].held = false; }, 180 + Math.random() * 250);
      }
    }
    updatePumps(dt);

    // 傾き
    const target = tilt.sensorOn ? 0 : tilt.key * 0.28;
    tilt.vis += (target - tilt.vis) * Math.min(1, dt * 6);
    const physTarget = tilt.sensorOn ? THREE.MathUtils.clamp(-tilt.sensor, -0.34, 0.34) : tilt.vis;
    tilt.phys += (physTarget - tilt.phys) * Math.min(1, dt * 8);
    physics.setGravityAngle(tilt.phys);
    up.copy(physics.gravityLocal).negate();
    holder.rotation.z = tilt.vis;
    holder.position.y = HOLD_Y + Math.abs(Math.sin(tilt.vis)) * 3.4;
    cam.shake = Math.max(0, cam.shake - dt);
    holder.position.x = Math.sin(time * 60) * cam.shake * 0.12;
    holder.updateMatrixWorld(true);
    shared.uWaterInv.value.copy(toy.group.matrixWorld).invert();
    shared.uSurfTilt.value = -tilt.phys;

    fluid.step(dt, jets);
    physics.step(dt, fluid);
    for (const ev of physics.checkHooks(dt)) {
      if (game.phase !== 'play') continue;
      if (ev.type === 'hook') {
        sfx.hook(physics.items.filter(i => i.scored).length);
        sparks.burst(ev.item.pos, ev.item.color, 40);
        const box = document.querySelector('.score-box');
        box.classList.remove('bump'); void box.offsetWidth; box.classList.add('bump');
        if (navigator.vibrate) navigator.vibrate(20);
      } else {
        sfx.unhook();
      }
    }
    const score = physics.items.filter(i => i.scored).length;
    if (score !== game.score) { game.score = score; $('score').textContent = String(score); }
    if (game.phase === 'play' && !game.completed && score === physics.items.length && score > 0) {
      game.clearHold += dt;
      if (game.clearHold > 0.8) complete();
    } else game.clearHold = 0;

    for (const it of physics.items) {
      it.mesh.position.copy(it.pos);
      it.mesh.quaternion.copy(it.quat);
      const m = it.mesh.material;
      if (it.flash > 0) {
        it.flash = Math.max(0, it.flash - dt * 1.5);
        m.emissive.copy(m.userData.itemColor).multiplyScalar(it.flash * 1.4).add(m.userData.baseEmissive);
      }
    }

    const pops = bubbles.update(dt, fluid, jets, up, surfaceY);
    if (pops > 0 && Math.random() < 0.5) sfx.bubble();
    if (glitter.points.visible) glitter.update(dt, fluid, up, surfaceY);
    sparks.update(dt);
    toy.update(jets, pumps.map(p => p.vis), -tilt.phys);
    sfx.setFlow(jets[0] + jets[1]);

    if (game.running) {
      game.elapsed = (performance.now() - game.start) / 1000;
      $('timer').textContent = fmt(game.elapsed);
    }
  }

  // カメラ（マウスに合わせて少し回り込む）
  cam.px += (cam.tx - cam.px) * Math.min(1, dt * 3);
  cam.py += (cam.ty - cam.py) * Math.min(1, dt * 3);
  const cy = 5.0;
  const idle = game.phase === 'title' ? Math.sin(time * 0.3) * 0.12 : 0;
  const yaw = cam.px * 0.12 + idle, pitch = 0.14 - cam.py * 0.06;
  camera.position.set(Math.sin(yaw) * cam.dist, cy + Math.sin(pitch) * cam.dist, Math.cos(yaw) * Math.cos(pitch) * cam.dist);
  camera.lookAt(0, cy - 0.2, 0);

  if (composer) composer.render(); else renderer.render(scene, camera);

  // 押す場所のヒント
  const showHint = game.phase === 'play' && !game.pressedEver && !panel.isOpen;
  toy.buttons.forEach((b, i) => {
    const el = hintEls[i];
    el.classList.toggle('hidden', !showHint);
    if (!showHint) return;
    b.getWorldPosition(_v).project(camera);
    el.style.left = `${(_v.x * 0.5 + 0.5) * window.innerWidth}px`;
    el.style.top = `${(-_v.y * 0.5 + 0.5) * window.innerHeight}px`;
  });

  requestAnimationFrame(frame);
}

// ---------- 起動 ----------
async function boot() {
  applySettings(settings, { rebuild: false });
  requestAnimationFrame(frame);
  try {
    await RAPIER.init();
    physics = new Physics(RAPIER);
    buildWorld();
    resetGame();
    const btn = $('btn-play');
    btn.disabled = false;
    btn.textContent = 'あそぶ';
  } catch (err) {
    console.error(err);
    const el = $('load-error');
    el.classList.remove('hidden');
    el.textContent = '物理エンジンの読み込みに失敗しました。通信環境を確認して、ページを再読み込みしてください。';
  }
  document.fonts?.ready.then(() => toy.setBody(BODY_COLORS[settings.body]));
}
boot();

// デバッグ用
window.__wg = { get physics() { return physics; }, fluid, jets, pumps, game, setHeld, doShake, camera, renderer, toy, scene, bubbles, glitter };
