// 泡・水中のラメ・得点時のきらめき
import * as THREE from 'three';
import { TANK, NOZZLES } from './config.js';
import { shared } from './materials.js';
import { makeSparkTexture } from './textures.js';

const _m = new THREE.Matrix4();
const _flow = [0, 0];

export class Bubbles {
  constructor(max = 500) {
    this.max = max;
    this.count = 0;
    this.x = new Float32Array(max); this.y = new Float32Array(max); this.z = new Float32Array(max);
    this.r = new Float32Array(max); this.ph = new Float32Array(max); this.life = new Float32Array(max);
    this.vx = new Float32Array(max); this.vy = new Float32Array(max);
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uTint: { value: new THREE.Color('#bfeaff') } },
      vertexShader: /* glsl */`
        varying vec3 vN; varying vec3 vV;
        void main() {
          vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
          vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal + vec3(1e-6));
          vV = normalize(cameraPosition - wp.xyz + vec3(1e-6));
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uTint;
        varying vec3 vN; varying vec3 vV;
        void main() {
          vec3 n = normalize(vN + vec3(1e-6));
          vec3 v = normalize(vV + vec3(1e-6));
          float ndv = clamp(abs(dot(n, v)), 0.0, 1.0);
          float rim = pow(max(1.0 - ndv, 0.0), 2.2);
          vec3 L = normalize(vec3(-0.4, 0.8, 0.6));
          vec3 H = normalize(L + v);
          float spec = pow(max(dot(n, H), 0.0), 70.0);
          vec3 col = mix(uTint, vec3(1.0), 0.5) * rim * 1.3 + vec3(spec * 2.0);
          gl_FragColor = vec4(col, clamp(rim * 0.8 + spec + 0.05, 0.0, 1.0));
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 14, 10), mat, max);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.renderOrder = 5;
    this.acc = [0, 0];
  }

  spawn(x, y, z, r, vx = 0, vy = 0) {
    if (this.count >= this.max) return;
    const i = this.count++;
    this.x[i] = x; this.y[i] = y; this.z[i] = z; this.r[i] = r;
    this.ph[i] = Math.random() * 10; this.life[i] = 0;
    this.vx[i] = vx; this.vy[i] = vy;
  }

  update(dt, fluid, jets, up, surfaceY) {
    // ジェットからの泡
    for (let k = 0; k < NOZZLES.length; k++) {
      const s = jets[k];
      if (s < 0.04) continue;
      this.acc[k] += dt * s * 160;
      const nz = NOZZLES[k];
      while (this.acc[k] >= 1) {
        this.acc[k] -= 1;
        const r = 0.02 + Math.pow(Math.random(), 2.5) * 0.09;
        this.spawn(nz.x + (Math.random() - 0.5) * 0.3, nz.y + 0.05, (Math.random() - 0.5) * 0.35, r, nz.dir[0] * 3 * s, 3 + s * 4);
      }
    }
    // たまに底から小さな泡
    if (Math.random() < dt * 1.2) {
      const nz = NOZZLES[Math.random() < 0.5 ? 0 : 1];
      this.spawn(nz.x + (Math.random() - 0.5) * 0.2, nz.y + 0.05, (Math.random() - 0.5) * 0.3, 0.015 + Math.random() * 0.02);
    }
    let pops = 0;
    for (let i = 0; i < this.count; i++) {
      fluid.sample(this.x[i], this.y[i], _flow);
      const rise = 0.6 + this.r[i] * 9;
      const k = Math.min(1, dt * 3);
      this.vx[i] += (_flow[0] + up.x * rise - this.vx[i]) * k;
      this.vy[i] += (_flow[1] + up.y * rise - this.vy[i]) * k;
      this.life[i] += dt;
      const wob = Math.sin(this.life[i] * 9 + this.ph[i]) * 0.25 * (0.3 + this.r[i] * 8);
      this.x[i] += (this.vx[i] + wob) * dt;
      this.y[i] += this.vy[i] * dt;
      this.z[i] += Math.cos(this.life[i] * 7 + this.ph[i]) * 0.15 * dt;
      this.x[i] = Math.min(Math.max(this.x[i], -TANK.halfW + this.r[i]), TANK.halfW - this.r[i]);
      this.z[i] = Math.min(Math.max(this.z[i], -TANK.halfD + this.r[i]), TANK.halfD - this.r[i]);
      if (this.y[i] > surfaceY(this.x[i]) - this.r[i] * 0.6 || this.life[i] > 12) {
        if (this.life[i] <= 12 && this.r[i] > 0.05) pops++;
        const last = --this.count;
        this.x[i] = this.x[last]; this.y[i] = this.y[last]; this.z[i] = this.z[last];
        this.r[i] = this.r[last]; this.ph[i] = this.ph[last]; this.life[i] = this.life[last];
        this.vx[i] = this.vx[last]; this.vy[i] = this.vy[last];
        i--;
      }
    }
    for (let i = 0; i < this.count; i++) {
      const s = this.r[i] * (1 + Math.sin(this.life[i] * 20 + this.ph[i]) * 0.06);
      _m.makeScale(s, s * (1 - Math.min(0.2, this.r[i] * 2)), s);
      _m.setPosition(this.x[i], this.y[i], this.z[i]);
      this.mesh.setMatrixAt(i, _m);
    }
    this.mesh.count = this.count;
    this.mesh.instanceMatrix.needsUpdate = true;
    return pops;
  }
}

export class Glitter {
  constructor(n = 280) {
    this.n = n;
    const pos = new Float32Array(n * 3);
    const seed = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * TANK.halfW * 2;
      pos[i * 3 + 1] = 1 + Math.random() * (TANK.water - 1.5);
      pos[i * 3 + 2] = (Math.random() - 0.5) * TANK.halfD * 1.8;
      seed[i] = Math.random();
    }
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    this.pos = pos;
    this.seed = seed;
    this.uniforms = { uTime: shared.uTime, uPR: { value: 1 }, uHue: { value: new THREE.Color('#ffffff') }, uScale: { value: 1 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */`
        attribute float aSeed;
        uniform float uTime; uniform float uPR; uniform float uScale;
        varying float vTw; varying float vSeed;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float tw = 0.5 + 0.5 * sin(uTime * (2.0 + aSeed * 4.0) + aSeed * 97.0);
          vTw = pow(max(tw, 0.0), 14.0);
          vSeed = aSeed;
          gl_PointSize = uPR * uScale * (1.6 + 5.0 * vTw) * (18.0 / max(-mv.z, 0.1));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uHue;
        varying float vTw; varying float vSeed;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c);
          float core = smoothstep(0.5, 0.0, d);
          float cross = max(smoothstep(0.08, 0.0, abs(c.x)), smoothstep(0.08, 0.0, abs(c.y))) * smoothstep(0.5, 0.1, d) * vTw;
          vec3 hue = 0.5 + 0.5 * cos(6.2831 * (vSeed + vec3(0.0, 0.33, 0.67)));
          vec3 col = mix(uHue, hue, 0.45) * (0.35 + 2.2 * vTw);
          float a = clamp(core * (0.25 + vTw) + cross, 0.0, 1.0);
          gl_FragColor = vec4(col * a, a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 6;
  }

  update(dt, fluid, up, surfaceY) {
    const p = this.pos;
    const t = shared.uTime.value;
    for (let i = 0; i < this.n; i++) {
      const ix = i * 3;
      fluid.sample(p[ix], p[ix + 1], _flow);
      const s = this.seed[i];
      const sink = 0.05 + s * 0.06;
      p[ix] += (_flow[0] * 0.9 - up.x * sink + Math.sin(t * 0.7 + s * 40) * 0.05) * dt;
      p[ix + 1] += (_flow[1] * 0.9 - up.y * sink) * dt;
      p[ix + 2] += Math.sin(t * 0.5 + s * 70) * 0.06 * dt + (Math.hypot(_flow[0], _flow[1]) * Math.sin(p[ix] * 3 + t) * 0.12) * dt;
      p[ix] = Math.min(Math.max(p[ix], -TANK.halfW + 0.03), TANK.halfW - 0.03);
      p[ix + 2] = Math.min(Math.max(p[ix + 2], -TANK.halfD + 0.03), TANK.halfD - 0.03);
      const floor = fluid.floorAt(p[ix]) + 0.03;
      if (p[ix + 1] < floor) p[ix + 1] = floor;
      const top = surfaceY(p[ix]) - 0.05;
      if (p[ix + 1] > top) p[ix + 1] = top;
    }
    this.geo.attributes.position.needsUpdate = true;
  }
}

export class Sparks {
  constructor(max = 300) {
    this.max = max;
    this.list = [];
    const pos = new Float32Array(max * 3), col = new Float32Array(max * 3), size = new Float32Array(max);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    this.uniforms = { uMap: { value: makeSparkTexture() }, uPR: { value: 1 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, vertexColors: true,
      vertexShader: /* glsl */`
        attribute float aSize; uniform float uPR;
        varying vec3 vCol;
        void main() {
          vCol = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uPR * (18.0 / max(-mv.z, 0.1));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        uniform sampler2D uMap; varying vec3 vCol;
        void main() {
          vec4 t = texture2D(uMap, gl_PointCoord);
          gl_FragColor = vec4(vCol * t.a * 1.6, t.a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 20;
  }

  burst(pos, color, n = 40, speed = 2.2) {
    const c = new THREE.Color(color);
    for (let i = 0; i < n && this.list.length < this.max; i++) {
      const a = Math.random() * Math.PI * 2, e = (Math.random() - 0.3) * Math.PI;
      const sp = speed * (0.3 + Math.random() * 0.7);
      const mix = Math.random() < 0.4 ? new THREE.Color('#ffffff') : c;
      this.list.push({
        x: pos.x, y: pos.y, z: pos.z,
        vx: Math.cos(a) * Math.cos(e) * sp, vy: Math.sin(e) * sp + 0.8, vz: Math.sin(a) * Math.cos(e) * sp * 0.4,
        life: 0, max: 0.6 + Math.random() * 0.7, size: 4 + Math.random() * 7, r: mix.r, g: mix.g, b: mix.b,
      });
    }
  }

  update(dt) {
    const pos = this.geo.attributes.position.array, col = this.geo.attributes.color.array, size = this.geo.attributes.aSize.array;
    let n = 0;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const s = this.list[i];
      s.life += dt;
      if (s.life > s.max) { this.list.splice(i, 1); continue; }
      const drag = Math.exp(-dt * 3);
      s.vx *= drag; s.vy *= drag; s.vz *= drag;
      s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
    }
    for (const s of this.list) {
      const k = 1 - s.life / s.max;
      pos[n * 3] = s.x; pos[n * 3 + 1] = s.y; pos[n * 3 + 2] = s.z;
      col[n * 3] = s.r * k; col[n * 3 + 1] = s.g * k; col[n * 3 + 2] = s.b * k;
      size[n] = s.size * (0.5 + k * 0.8);
      n++;
    }
    this.geo.setDrawRange(0, n);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
    this.geo.attributes.aSize.needsUpdate = true;
  }
}
