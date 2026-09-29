// おもちゃ本体（ケース・水・ボタン・ペグ）の見た目
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { TANK, NOZZLES, FLOOR_PROFILE, PEG, BASKET } from './config.js';
import { patchMaterial, shared } from './materials.js';
import { makeBackdropTexture, makeLabelTexture, makeGlareTexture, makeNetTexture } from './textures.js';

const { halfW, height, halfD, water } = TANK;

function shadowy(mesh, cast = true, receive = true) {
  mesh.castShadow = cast; mesh.receiveShadow = receive;
  return mesh;
}

export class Toy {
  constructor() {
    this.group = new THREE.Group();
    this.buttons = [];
    this.pegGroup = new THREE.Group();
    this.group.add(this.pegGroup);
    this.buildFrame();
    this.buildInterior();
    this.buildWater();
    this.buildPanels();
  }

  buildFrame() {
    this.bodyMat = new THREE.MeshPhysicalMaterial({ color: '#ef3340', roughness: 0.35, clearcoat: 0.7, clearcoatRoughness: 0.2 });
    const g = this.group;
    for (const s of [-1, 1]) {
      const side = shadowy(new THREE.Mesh(new RoundedBoxGeometry(0.44, height + 0.5, 1.72, 4, 0.14), this.bodyMat));
      side.position.set(s * (halfW + 0.22), height / 2, 0);
      g.add(side);
    }
    const top = shadowy(new THREE.Mesh(new RoundedBoxGeometry(6.2, 0.62, 1.86, 5, 0.22), this.bodyMat));
    top.position.set(0, height + 0.31, 0);
    g.add(top);
    // 注水キャップ
    this.accentMat = new THREE.MeshPhysicalMaterial({ color: '#ffe14d', roughness: 0.3, clearcoat: 0.8 });
    const cap = shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.33, 0.24, 40), this.accentMat));
    cap.position.set(1.9, height + 0.72, 0);
    g.add(cap);
    for (let i = 0; i < 12; i++) {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.2, 0.05), this.accentMat);
      const a = (i / 12) * Math.PI * 2;
      rib.position.set(1.9 + Math.cos(a) * 0.32, height + 0.72, Math.sin(a) * 0.32);
      rib.rotation.y = -a;
      g.add(rib);
    }
    // 台座
    const base = shadowy(new THREE.Mesh(new RoundedBoxGeometry(6.5, 2.0, 2.5, 6, 0.4), this.bodyMat));
    base.position.set(0, -1.0, 0);
    g.add(base);
    // ゴム足
    const footMat = new THREE.MeshStandardMaterial({ color: '#333', roughness: 0.9 });
    for (const x of [-2.7, 2.7]) for (const z of [-0.9, 0.9]) {
      const f = shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.25, 0.12, 20), footMat));
      f.position.set(x, -2.04, z);
      g.add(f);
    }
    // ラベル
    this.labelMat = new THREE.MeshStandardMaterial({ roughness: 0.45, transparent: true });
    const label = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 0.9), this.labelMat);
    label.position.set(0, -0.95, 1.252);
    g.add(label);
    // ボタン
    this.buttonMat = new THREE.MeshPhysicalMaterial({ color: '#ffe14d', roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.08 });
    const bezelMat = new THREE.MeshPhysicalMaterial({ color: '#f5f5f5', roughness: 0.2, metalness: 0.6, clearcoat: 1 });
    const holeMat = new THREE.MeshStandardMaterial({ color: '#1a1a22', roughness: 0.7 });
    const capProfile = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      const a = t * Math.PI / 2;
      capProfile.push(new THREE.Vector2(Math.sin(a) * 0.5 + 0.0001, 0.18 + Math.cos(a) * 0.14));
    }
    capProfile.unshift(new THREE.Vector2(0.0001, 0.32));
    capProfile.push(new THREE.Vector2(0.52, -0.1));
    const capGeo = new THREE.LatheGeometry(capProfile.slice(1).reverse(), 48);
    for (const s of [-1, 1]) {
      const holder = new THREE.Group();
      holder.position.set(s * 1.85, -1.0, 1.25);
      holder.rotation.x = Math.PI / 2;
      const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.06, 48), holeMat);
      hole.position.y = -0.01;
      holder.add(hole);
      const bezel = shadowy(new THREE.Mesh(new THREE.TorusGeometry(0.64, 0.08, 16, 64), bezelMat));
      bezel.rotation.x = Math.PI / 2;
      bezel.position.y = 0.02;
      holder.add(bezel);
      const btn = shadowy(new THREE.Mesh(capGeo, this.buttonMat));
      btn.position.y = 0;
      holder.add(btn);
      this.group.add(holder);
      this.buttons.push(btn);
    }
  }

  buildInterior() {
    const g = this.group;
    // 背面の絵
    this.backdropMat = new THREE.MeshStandardMaterial({ roughness: 0.85 });
    patchMaterial(this.backdropMat, { caustic: 1.1 });
    const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(halfW * 2, height), this.backdropMat);
    backdrop.position.set(0, height / 2, -halfD + 0.004);
    backdrop.receiveShadow = true;
    g.add(backdrop);
    // W 字の床
    const shape = new THREE.Shape();
    shape.moveTo(-halfW, -0.02);
    for (const [x, y] of FLOOR_PROFILE) shape.lineTo(x, y);
    shape.lineTo(halfW, -0.02);
    shape.closePath();
    const floorGeo = new THREE.ExtrudeGeometry(shape, { depth: halfD * 2, bevelEnabled: false });
    floorGeo.translate(0, 0, -halfD);
    this.floorMat = new THREE.MeshPhysicalMaterial({ color: '#f2c77e', roughness: 0.55, clearcoat: 0.3 });
    patchMaterial(this.floorMat, { caustic: 0.8 });
    const floor = shadowy(new THREE.Mesh(floorGeo, this.floorMat), false, true);
    g.add(floor);
    // 吹き出し口
    const grillMat = new THREE.MeshStandardMaterial({ color: '#20242c', roughness: 0.6, metalness: 0.3 });
    const rimMat = new THREE.MeshPhysicalMaterial({ color: '#dfe6ee', roughness: 0.2, metalness: 0.7 });
    for (const nz of NOZZLES) {
      const d = new THREE.Mesh(new THREE.CircleGeometry(0.2, 32), grillMat);
      d.rotation.x = -Math.PI / 2;
      d.position.set(nz.x, 0.265, 0);
      g.add(d);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.035, 12, 40), rimMat);
      rim.rotation.x = -Math.PI / 2;
      rim.position.set(nz.x, 0.27, 0);
      g.add(rim);
      for (const k of [-1, 0, 1]) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.02, 0.025), rimMat);
        bar.position.set(nz.x, 0.275, k * 0.09);
        g.add(bar);
      }
    }
  }

  buildWater() {
    // 水の色（前面に貼った半透明の層）。水面より上は描かない
    this.waterUniforms = {
      uColor: { value: new THREE.Color('#3fb8ff') },
      uDeep: { value: new THREE.Color('#0b4f9c') },
      uAlpha: { value: 0.2 },
      uTime: shared.uTime,
      uSurfN: shared.uSurfN,
      uSurfC: shared.uSurfC,
    };
    const tintMat = new THREE.ShaderMaterial({
      uniforms: this.waterUniforms,
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */`
        varying vec3 vLocal;
        void main() {
          vLocal = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uColor; uniform vec3 uDeep; uniform float uAlpha; uniform float uTime;
        uniform vec3 uSurfN; uniform float uSurfC;
        varying vec3 vLocal;
        void main() {
          vec2 p = vLocal.xy + vec2(0.0, ${(height / 2).toFixed(3)});
          vec3 lp = vec3(p, ${halfD.toFixed(3)});
          float d = uSurfC - dot(uSurfN, lp);
          if (d < 0.0) discard;
          float h = clamp(1.0 - d / ${height.toFixed(3)}, 0.0, 1.0);
          vec3 col = mix(uDeep, uColor, pow(h, 0.8));
          vec2 q = vec2(dot(lp.xy, vec2(uSurfN.y, -uSurfN.x)), d);
          float rays = sin((q.x - q.y * 0.38) * 2.6 + uTime * 0.35) * sin((q.x * 0.8 + q.y * 0.22) * 4.3 - uTime * 0.23);
          rays = pow(max(rays, 0.0), 3.0) * 0.5 * h;
          float band = exp(-d * 14.0) * 0.55 + exp(-d * 90.0) * 0.9;
          col += vec3(0.85, 0.97, 1.0) * (rays + band);
          float a = uAlpha * (1.0 + 0.9 * (1.0 - h)) + rays * 0.12 + band * 0.35;
          gl_FragColor = vec4(col, clamp(a, 0.0, 0.85));
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const tint = new THREE.Mesh(new THREE.PlaneGeometry(halfW * 2, height), tintMat);
    tint.position.set(0, height / 2, halfD - 0.004);
    tint.renderOrder = 2;
    this.group.add(tint);
    this.tint = tint;

    // 水面：どの向きにもなれる大きな平面を、水槽の内側（6 枚のクリップ面）で切り抜く
    this.surfUniforms = { uJet0: { value: 0 }, uJet1: { value: 0 }, uTime: shared.uTime };
    const surfGeo = new THREE.PlaneGeometry(9.5, 9.5, 120, 120);
    surfGeo.rotateX(-Math.PI / 2);
    this.clipPlanes = Array.from({ length: 6 }, () => new THREE.Plane());
    this.surfMat = new THREE.MeshPhysicalMaterial({
      color: '#cdefff', roughness: 0.06, metalness: 0.2, transparent: true, opacity: 0.55,
      side: THREE.DoubleSide, depthWrite: false, clearcoat: 1, clippingPlanes: this.clipPlanes,
    });
    const su = this.surfUniforms;
    const nzx0 = NOZZLES[0].x.toFixed(3), nzx1 = NOZZLES[1].x.toFixed(3);
    this.surfMat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, su);
      const hfn = /* glsl */`
        uniform float uJet0; uniform float uJet1; uniform float uTime;
        float wh(vec2 p) {
          float h = 0.018 * sin(p.x * 3.7 + uTime * 1.9) + 0.012 * sin(p.x * 6.1 - uTime * 2.7 + p.y * 4.0)
                  + 0.008 * sin(p.x * 11.0 + uTime * 4.1);
          h += uJet0 * 0.16 * exp(-pow(p.x - (${nzx0} + 0.4), 2.0) * 2.2) * (0.8 + 0.2 * sin(uTime * 14.0));
          h += uJet1 * 0.16 * exp(-pow(p.x - (${nzx1} - 0.4), 2.0) * 2.2) * (0.8 + 0.2 * sin(uTime * 13.0));
          return h;
        }`;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\n' + hfn)
        .replace('#include <beginnormal_vertex>', `
          float e = 0.04;
          float hx = wh(position.xz + vec2(e, 0.0)) - wh(position.xz - vec2(e, 0.0));
          float hz = wh(position.xz + vec2(0.0, e)) - wh(position.xz - vec2(0.0, e));
          vec3 objectNormal = normalize(vec3(-hx / (2.0 * e), 1.0, -hz / (2.0 * e)));
          #ifdef USE_TANGENT
            vec3 objectTangent = vec3(1.0, 0.0, 0.0);
          #endif`)
        .replace('#include <begin_vertex>', 'vec3 transformed = position + vec3(0.0, wh(position.xz), 0.0);');
    };
    const surf = new THREE.Mesh(surfGeo, this.surfMat);
    surf.renderOrder = 3;
    surf.frustumCulled = false;
    this.surfPivot = new THREE.Group();
    this.surfPivot.position.set(0, water, 0);
    this.surfPivot.add(surf);
    this.group.add(this.surfPivot);
  }

  buildPanels() {
    // 拡散色を黒にして加算合成：映り込みのハイライトだけが乗り、白くかすまない
    const panelMat = new THREE.MeshPhysicalMaterial({
      color: '#000000', roughness: 0.04, metalness: 0, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, envMapIntensity: 1.4, specularIntensity: 1,
    });
    const front = new THREE.Mesh(new THREE.BoxGeometry(halfW * 2 + 0.1, height + 0.1, 0.06), panelMat);
    front.position.set(0, height / 2, halfD + 0.03);
    front.renderOrder = 10;
    this.group.add(front);
    const glare = new THREE.Mesh(
      new THREE.PlaneGeometry(halfW * 2, height),
      new THREE.MeshBasicMaterial({ map: makeGlareTexture(), transparent: true, opacity: 0.11, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    glare.position.set(0, height / 2, halfD + 0.065);
    glare.renderOrder = 11;
    this.group.add(glare);
    this.frontPanel = front;
  }

  setWater(w) {
    this.waterUniforms.uColor.value.set(w.color);
    this.waterUniforms.uDeep.value.set(w.deep);
    this.waterUniforms.uAlpha.value = w.alpha;
    this.surfMat.color.set(w.color).lerp(new THREE.Color('#ffffff'), 0.6);
    if (this.backdropMat.map) this.backdropMat.map.dispose();
    this.backdropMat.map = makeBackdropTexture(w);
    this.backdropMat.needsUpdate = true;
    shared.uCausticColor.value.set(w.color).lerp(new THREE.Color('#ffffff'), 0.65);
  }

  setBody(b) {
    this.bodyMat.color.set(b.color);
    this.buttonMat.color.set(b.button);
    this.accentMat.color.set(b.button);
    if (this.labelMat.map) this.labelMat.map.dispose();
    this.labelMat.map = makeLabelTexture(b.color);
    this.labelMat.needsUpdate = true;
    if (this.pegMat) this.pegMat.color.set(b.button);
  }

  buildPegs(pegs, baskets, body) {
    for (const c of [...this.pegGroup.children]) {
      this.pegGroup.remove(c);
      c.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    }
    this.pegMat = new THREE.MeshPhysicalMaterial({ color: body.button, roughness: 0.25, clearcoat: 1 });
    patchMaterial(this.pegMat, { caustic: 0.8 });
    const standMat = new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.3, clearcoat: 1 });
    patchMaterial(standMat, { caustic: 1 });
    const pedProfile = [];
    const R = PEG.pedestalR, H = PEG.pedestalH;
    // 下は円すい、上は丸いふちの台座（点は下から上へ並べる）
    pedProfile.push(new THREE.Vector2(0.0001, -H / 2 - PEG.coneH));
    pedProfile.push(new THREE.Vector2(R - 0.06, -H / 2 - 0.02));
    for (let i = 0; i <= 8; i++) {
      const a = -Math.PI / 2 + (i / 8) * Math.PI;
      pedProfile.push(new THREE.Vector2(R - 0.06 + Math.cos(a) * 0.06, Math.sin(a) * H / 2));
    }
    pedProfile.push(new THREE.Vector2(0.0001, H / 2));
    const pedGeo = new THREE.LatheGeometry(pedProfile, 48);
    for (const pg of pegs) {
      const grp = new THREE.Group();
      grp.position.set(pg.x, pg.y, 0);
      grp.add(shadowy(new THREE.Mesh(pedGeo, standMat)));
      const armLen = halfD - R + 0.1;
      const arm = shadowy(new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, armLen), standMat));
      arm.position.set(0, -0.02, -halfD + armLen / 2);
      grp.add(arm);
      const peg = shadowy(new THREE.Mesh(new THREE.CylinderGeometry(PEG.radius, PEG.radius * 1.25, PEG.height, 24), this.pegMat));
      peg.position.y = H / 2 + PEG.height / 2;
      grp.add(peg);
      const tip = shadowy(new THREE.Mesh(new THREE.SphereGeometry(PEG.tipR, 24, 16), this.pegMat));
      tip.position.y = H / 2 + PEG.height;
      grp.add(tip);
      // 台座の上の輪（得点の目印）
      const mark = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.018, 8, 48), this.pegMat);
      mark.rotation.x = Math.PI / 2;
      mark.position.y = H / 2 + 0.005;
      grp.add(mark);
      this.pegGroup.add(grp);
    }
    const netTex = makeNetTexture();
    for (const bk of baskets) {
      const grp = new THREE.Group();
      grp.position.set(bk.x, bk.y, 0);
      const netMat = new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.3, alphaMap: netTex, alphaTest: 0.5, side: THREE.DoubleSide, clearcoat: 0.6 });
      patchMaterial(netMat, { caustic: 0.8 });
      const wall = shadowy(new THREE.Mesh(new THREE.CylinderGeometry(BASKET.innerR + 0.03, BASKET.innerR, BASKET.height, 40, 1, true), netMat));
      wall.position.y = BASKET.height / 2;
      grp.add(wall);
      const bottom = shadowy(new THREE.Mesh(new THREE.CylinderGeometry(BASKET.innerR + 0.04, BASKET.innerR + 0.04, 0.08, 40), this.pegMat));
      grp.add(bottom);
      const rim = shadowy(new THREE.Mesh(new THREE.TorusGeometry(BASKET.innerR + 0.03, 0.035, 12, 48), this.pegMat));
      rim.rotation.x = Math.PI / 2;
      rim.position.y = BASKET.height;
      grp.add(rim);
      const cone = shadowy(new THREE.Mesh(new THREE.ConeGeometry(BASKET.innerR + 0.04, PEG.coneH, 40), standMat));
      cone.rotation.x = Math.PI;
      cone.position.y = -0.04 - PEG.coneH / 2;
      grp.add(cone);
      const bArmLen = halfD - BASKET.innerR + 0.06;
      const arm = shadowy(new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, bArmLen), standMat));
      arm.position.set(0, 0.02, -halfD + bArmLen / 2);
      grp.add(arm);
      this.pegGroup.add(grp);
    }
  }

  update(jets, press, surfN, surfC) {
    this.buttons.forEach((b, i) => { b.position.y = -press[i] * 0.2; });
    this.surfUniforms.uJet0.value = jets[0];
    this.surfUniforms.uJet1.value = jets[1];
    // 水面の平面：原点に近い点 n*c に置き、+Y を法線に向ける（ケースが直立なら回転なし）
    this.surfPivot.quaternion.setFromUnitVectors(_up, surfN);
    this.surfPivot.position.copy(surfN).multiplyScalar(surfC);
    // 水槽の内側だけ残すクリップ面（ワールド座標）
    const m = this.group.matrixWorld;
    const e = 0.004;
    const defs = [[1, 0, 0, halfW - e], [-1, 0, 0, halfW - e], [0, 1, 0, -e], [0, -1, 0, height - e], [0, 0, 1, halfD - e], [0, 0, -1, halfD - e]];
    defs.forEach(([x, y, z, c], i) => {
      // n·p + c >= 0 が残る側
      this.clipPlanes[i].set(_n3.set(x, y, z), c).applyMatrix4(m);
    });
  }
}

const _up = new THREE.Vector3(0, 1, 0);
const _n3 = new THREE.Vector3();
