// 水槽の正面から見た 2D の水流シミュレーション（Stam の Stable Fluids を簡略化）
import { TANK, NOZZLES, FLOOR_PROFILE } from './config.js';

export class Fluid {
  constructor() {
    this.h = 0.2;
    this.x0 = -TANK.halfW;
    this.y0 = 0;
    this.nx = Math.round((TANK.halfW * 2) / this.h);
    this.ny = Math.ceil(TANK.height / this.h); // ひっくり返しても水があるよう、天井まで
    const n = (this.nx + 2) * (this.ny + 2);
    this.u = new Float32Array(n);
    this.v = new Float32Array(n);
    this.u0 = new Float32Array(n);
    this.v0 = new Float32Array(n);
    this.p = new Float32Array(n);
    this.div = new Float32Array(n);
    this.curl = new Float32Array(n);
    this.solid = new Uint8Array(n);
    this.jetForce = 1000;
    this.damp = 0.9;
    this.markFloor();
  }

  IX(i, j) { return i + (this.nx + 2) * j; }

  floorAt(x) {
    const P = FLOOR_PROFILE;
    for (let k = 0; k < P.length - 1; k++) {
      const [ax, ay] = P[k], [bx, by] = P[k + 1];
      if (x >= ax && x <= bx) return ay + (by - ay) * ((x - ax) / (bx - ax));
    }
    return P[0][1];
  }

  markFloor() {
    const { nx, ny, h } = this;
    for (let j = 0; j <= ny + 1; j++) {
      for (let i = 0; i <= nx + 1; i++) {
        const x = this.x0 + (i - 0.5) * h;
        const y = this.y0 + (j - 0.5) * h;
        const border = i === 0 || j === 0 || i === nx + 1 || j === ny + 1;
        this.solid[this.IX(i, j)] = border || y < this.floorAt(x) - 0.04 ? 1 : 0;
      }
    }
  }

  // jets: [0..1] の強さの配列
  step(dt, jets) {
    const { nx, ny, h, u, v } = this;
    // ジェットの力
    for (let k = 0; k < NOZZLES.length; k++) {
      const s = jets[k];
      if (s <= 0.001) continue;
      const nz = NOZZLES[k];
      const len = Math.hypot(nz.dir[0], nz.dir[1]);
      const dx = nz.dir[0] / len, dy = nz.dir[1] / len;
      const cx = nz.x + dx * 0.35, cy = nz.y + dy * 0.35;
      const sig2 = 0.34 * 0.34;
      for (let j = 1; j <= Math.min(ny, 8); j++) {
        for (let i = 1; i <= nx; i++) {
          const id = this.IX(i, j);
          if (this.solid[id]) continue;
          const x = this.x0 + (i - 0.5) * h, y = this.y0 + (j - 0.5) * h;
          const d2 = (x - cx) * (x - cx) + (y - cy) * (y - cy);
          if (d2 > 0.9) continue;
          const g = Math.exp(-d2 / sig2) * this.jetForce * s * dt;
          u[id] += dx * g;
          v[id] += dy * g;
        }
      }
    }
    this.vorticity(dt, 2.2);
    const decay = Math.exp(-this.damp * dt);
    for (let i = 0; i < u.length; i++) { u[i] *= decay; v[i] *= decay; }
    this.project();
    this.u0.set(u); this.v0.set(v);
    this.advect(u, this.u0, dt);
    this.advect(v, this.v0, dt);
    this.project();
    // 速度の上限（数値の暴走防止）
    for (let i = 0; i < u.length; i++) {
      const sp = Math.hypot(u[i], v[i]);
      if (!(sp < 14)) {
        const k = sp > 0 && isFinite(sp) ? 14 / sp : 0;
        u[i] *= k; v[i] *= k;
      }
    }
  }

  vorticity(dt, eps) {
    const { nx, ny, h, u, v, curl, solid } = this;
    for (let j = 1; j <= ny; j++) {
      for (let i = 1; i <= nx; i++) {
        const id = this.IX(i, j);
        curl[id] = ((v[id + 1] - v[id - 1]) - (u[id + nx + 2] - u[id - nx - 2])) / (2 * h);
      }
    }
    for (let j = 2; j < ny; j++) {
      for (let i = 2; i < nx; i++) {
        const id = this.IX(i, j);
        if (solid[id]) continue;
        const gx = (Math.abs(curl[id + 1]) - Math.abs(curl[id - 1])) / (2 * h);
        const gy = (Math.abs(curl[id + nx + 2]) - Math.abs(curl[id - nx - 2])) / (2 * h);
        const len = Math.hypot(gx, gy) + 1e-5;
        const w = curl[id];
        u[id] += eps * h * (gy / len) * w * dt;
        v[id] += -eps * h * (gx / len) * w * dt;
      }
    }
  }

  project() {
    const { nx, ny, h, u, v, p, div, solid } = this;
    const W = nx + 2;
    for (let j = 1; j <= ny; j++) {
      for (let i = 1; i <= nx; i++) {
        const id = i + W * j;
        if (solid[id]) { u[id] = 0; v[id] = 0; }
      }
    }
    for (let j = 1; j <= ny; j++) {
      for (let i = 1; i <= nx; i++) {
        const id = i + W * j;
        div[id] = solid[id] ? 0 : -0.5 * h * (u[id + 1] - u[id - 1] + v[id + W] - v[id - W]);
        p[id] = 0;
      }
    }
    for (let it = 0; it < 24; it++) {
      for (let j = 1; j <= ny; j++) {
        for (let i = 1; i <= nx; i++) {
          const id = i + W * j;
          if (solid[id]) continue;
          const pc = p[id];
          const l = solid[id - 1] ? pc : p[id - 1];
          const r = solid[id + 1] ? pc : p[id + 1];
          const b = solid[id - W] ? pc : p[id - W];
          const t = solid[id + W] ? pc : p[id + W];
          p[id] = (div[id] + l + r + b + t) / 4;
        }
      }
    }
    for (let j = 1; j <= ny; j++) {
      for (let i = 1; i <= nx; i++) {
        const id = i + W * j;
        if (solid[id]) continue;
        const pc = p[id];
        const l = solid[id - 1] ? pc : p[id - 1];
        const r = solid[id + 1] ? pc : p[id + 1];
        const b = solid[id - W] ? pc : p[id - W];
        const t = solid[id + W] ? pc : p[id + W];
        u[id] -= 0.5 * (r - l) / h;
        v[id] -= 0.5 * (t - b) / h;
      }
    }
  }

  advect(d, d0, dt) {
    const { nx, ny, h, u0, v0, solid } = this;
    const W = nx + 2;
    for (let j = 1; j <= ny; j++) {
      for (let i = 1; i <= nx; i++) {
        const id = i + W * j;
        if (solid[id]) { d[id] = 0; continue; }
        let x = i - (dt * u0[id]) / h;
        let y = j - (dt * v0[id]) / h;
        x = Math.min(Math.max(x, 0.5), nx + 0.5);
        y = Math.min(Math.max(y, 0.5), ny + 0.5);
        const i0 = Math.floor(x), j0 = Math.floor(y);
        const s1 = x - i0, t1 = y - j0, s0 = 1 - s1, t0 = 1 - t1;
        const a = i0 + W * j0;
        d[id] = s0 * (t0 * d0[a] + t1 * d0[a + W]) + s1 * (t0 * d0[a + 1] + t1 * d0[a + W + 1]);
      }
    }
  }

  // 任意の点での流速（ケースのローカル座標）。out = [vx, vy]
  sample(x, y, out) {
    const { nx, ny, h, u, v } = this;
    const W = nx + 2;
    let fx = (x - this.x0) / h + 0.5;
    let fy = (y - this.y0) / h + 0.5;
    fx = Math.min(Math.max(fx, 0.5), nx + 0.5);
    fy = Math.min(Math.max(fy, 0.5), ny + 0.5);
    const i0 = Math.floor(fx), j0 = Math.floor(fy);
    const s1 = fx - i0, t1 = fy - j0, s0 = 1 - s1, t0 = 1 - t1;
    const a = i0 + W * j0;
    out[0] = s0 * (t0 * u[a] + t1 * u[a + W]) + s1 * (t0 * u[a + 1] + t1 * u[a + W + 1]);
    out[1] = s0 * (t0 * v[a] + t1 * v[a + W]) + s1 * (t0 * v[a + 1] + t1 * v[a + W + 1]);
    return out;
  }

  // シェイク：ランダムな渦をいくつか入れる
  stir(power = 1) {
    const { nx, ny, h, u, v } = this;
    for (let n = 0; n < 5; n++) {
      const cx = this.x0 + Math.random() * TANK.halfW * 2;
      const cy = 1 + Math.random() * (TANK.water - 1.5);
      const s = (Math.random() < 0.5 ? -1 : 1) * (4 + Math.random() * 4) * power;
      for (let j = 1; j <= ny; j++) {
        for (let i = 1; i <= nx; i++) {
          const id = this.IX(i, j);
          if (this.solid[id]) continue;
          const x = this.x0 + (i - 0.5) * h - cx, y = this.y0 + (j - 0.5) * h - cy;
          const g = Math.exp(-(x * x + y * y) / 1.2);
          u[id] += -y * s * g;
          v[id] += x * s * g;
        }
      }
    }
  }

  clear() { this.u.fill(0); this.v.fill(0); }
}
