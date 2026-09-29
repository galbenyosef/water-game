// Rapier による剛体シミュレーションと、水の力（浮力・抗力・水流）
import * as THREE from 'three';
import { TANK, FLOOR_PROFILE, PEG, BASKET } from './config.js';
import { getShape, insideHole } from './shapes.js';

const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _p = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _qi = new THREE.Quaternion();
const _flow = [0, 0];

export class Physics {
  constructor(RAPIER) {
    this.R = RAPIER;
    this.world = null;
    this.items = [];
    this.pegs = [];
    this.baskets = [];
    this.gravityLocal = new THREE.Vector3(0, -1, 0);
    this.surfaceTilt = 0; // 水面の傾き（ケースから見た角度）
    this.visc = { drag: 3.2, damp: 0.9, gravity: 2.4 };
    this.time = 0;
  }

  build(pegs, baskets) {
    const R = this.R;
    if (this.world) this.world.free();
    this.world = new R.World({ x: 0, y: -this.visc.gravity, z: 0 });
    this.world.timestep = 1 / 120;
    this.world.integrationParameters.numSolverIterations = 6;
    this.items = [];
    this._stack = [0.9, 0.9];
    this.pegs = pegs;
    this.baskets = baskets;
    const fixed = this.world.createRigidBody(R.RigidBodyDesc.fixed());
    const add = (desc) => this.world.createCollider(desc.setFriction(0.35).setRestitution(0.15), fixed);
    const { halfW, height, halfD } = TANK;
    const t = 0.5;
    // 壁・天井
    add(R.ColliderDesc.cuboid(t, height, halfD + t).setTranslation(-halfW - t, height / 2, 0));
    add(R.ColliderDesc.cuboid(t, height, halfD + t).setTranslation(halfW + t, height / 2, 0));
    add(R.ColliderDesc.cuboid(halfW + t, height, t).setTranslation(0, height / 2, -halfD - t));
    add(R.ColliderDesc.cuboid(halfW + t, height, t).setTranslation(0, height / 2, halfD + t));
    add(R.ColliderDesc.cuboid(halfW + t, t, halfD + t).setTranslation(0, height + t, 0));
    // W 字の床
    for (let k = 0; k < FLOOR_PROFILE.length - 1; k++) {
      const [ax, ay] = FLOOR_PROFILE[k], [bx, by] = FLOOR_PROFILE[k + 1];
      const pts = [];
      for (const z of [-halfD - 0.2, halfD + 0.2]) {
        pts.push(ax, ay, z, bx, by, z, ax, -0.6, z, bx, -0.6, z);
      }
      add(R.ColliderDesc.convexHull(new Float32Array(pts)));
    }
    // ペグ（台座の下は円すいにして、下から押し上げられたアイテムが横へ逃げるようにする）
    _q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI);
    const flip = { x: _q.x, y: _q.y, z: _q.z, w: _q.w };
    for (const pg of pegs) {
      const top = pg.y + PEG.pedestalH / 2;
      add(R.ColliderDesc.cylinder(PEG.pedestalH / 2, PEG.pedestalR).setTranslation(pg.x, pg.y, 0));
      add(R.ColliderDesc.cone(PEG.coneH / 2, PEG.pedestalR).setTranslation(pg.x, pg.y - PEG.pedestalH / 2 - PEG.coneH / 2, 0).setRotation(flip));
      add(R.ColliderDesc.cuboid(0.07, 0.05, (halfD - PEG.pedestalR) / 2 + 0.05).setTranslation(pg.x, pg.y - 0.02, -(halfD + PEG.pedestalR) / 2));
      add(R.ColliderDesc.capsule(PEG.height / 2, PEG.radius).setTranslation(pg.x, top + PEG.height / 2, 0));
      add(R.ColliderDesc.ball(PEG.tipR).setTranslation(pg.x, top + PEG.height, 0));
      pg.base = top;
      pg.tip = top + PEG.height + PEG.tipR;
    }
    // バスケット
    for (const bk of baskets) {
      const r = BASKET.innerR, h = BASKET.height;
      add(R.ColliderDesc.cylinder(0.04, r + 0.04).setTranslation(bk.x, bk.y, 0));
      const n = 14;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        _q.setFromAxisAngle(_up, -a);
        add(R.ColliderDesc.cuboid(0.03, h / 2, (Math.PI * r) / n + 0.02)
          .setTranslation(bk.x + Math.cos(a) * (r + 0.03), bk.y + h / 2, Math.sin(a) * (r + 0.03))
          .setRotation({ x: _q.x, y: _q.y, z: _q.z, w: _q.w }));
      }
      add(R.ColliderDesc.cone(PEG.coneH / 2, r + 0.04).setTranslation(bk.x, bk.y - 0.04 - PEG.coneH / 2, 0).setRotation(flip));
    }
  }

  addItem(kind, index, total) {
    const R = this.R;
    const shape = getShape(kind);
    const [x, y] = this.spawnPoint(shape.boundR, index);
    _q.setFromEuler(new THREE.Euler(Math.PI / 2 + (Math.random() - 0.5) * 0.8, Math.random() * Math.PI, (Math.random() - 0.5) * 0.8));
    const body = this.world.createRigidBody(
      R.RigidBodyDesc.dynamic()
        .setTranslation(x, y, (Math.random() - 0.5) * 0.1)
        .setRotation({ x: _q.x, y: _q.y, z: _q.z, w: _q.w })
        .setLinearDamping(0.05)
        .setAngularDamping(0.8)
        .setCcdEnabled(true)
        .setCanSleep(true)
    );
    if (shape.isBall) {
      this.world.createCollider(R.ColliderDesc.ball(shape.radius).setDensity(1).setFriction(0.3).setRestitution(0.3), body);
    } else {
      for (const s of shape.segments) {
        const dir = _v.copy(s.b).sub(s.a).normalize();
        _q.setFromUnitVectors(_up, dir);
        this.world.createCollider(
          R.ColliderDesc.capsule(s.len / 2, shape.tubeR)
            .setTranslation(s.mid.x, s.mid.y, s.mid.z)
            .setRotation({ x: _q.x, y: _q.y, z: _q.z, w: _q.w })
            .setDensity(1).setFriction(0.3).setRestitution(0.1),
          body
        );
      }
    }
    const item = {
      kind, shape, body, index,
      pos: new THREE.Vector3(), quat: new THREE.Quaternion(),
      hookedOn: -1, hookTimer: 0, offTimer: 0, scored: false, flash: 0,
    };
    this.items.push(item);
    return item;
  }

  // 出現位置：吹き出し口の上の左右の列に積む（ペグの真上を通らないので、勝手に入らない）
  spawnPoint(r, index) {
    this._stack = this._stack || [0.9, 0.9];
    const side = index % 2;
    const x = (side ? 1 : -1) * (1.55 + Math.random() * 0.45);
    const y = this._stack[side] + r;
    this._stack[side] += r * 1.5;
    return [x, Math.min(y, TANK.water - r)];
  }

  // 置いた直後に少しだけ動かして、底に落ち着かせる
  settle(fluid, secs = 2.5) {
    for (let t = 0; t < secs; t += 1 / 60) this.step(1 / 60, fluid);
    for (const it of this.items) { it.hookTimer = 0; it.scored = false; }
  }

  setGravityAngle(angle) {
    // ケースが angle だけ傾いたとき、ケースから見た重力と水面
    this.gravityLocal.set(-Math.sin(angle), -Math.cos(angle), 0);
    this.surfaceTilt = -angle;
    const g = this.visc.gravity;
    this.world.gravity = { x: this.gravityLocal.x * g, y: this.gravityLocal.y * g, z: 0 };
  }

  surfaceY(x) { return TANK.water + Math.tan(this.surfaceTilt) * x; }

  step(dt, fluid) {
    const steps = Math.min(4, Math.max(1, Math.round(dt / (1 / 120))));
    for (let s = 0; s < steps; s++) {
      this.applyWater(1 / 120, fluid);
      this.world.step();
      this.time += 1 / 120;
    }
    for (const it of this.items) {
      const t = it.body.translation(), r = it.body.rotation();
      it.pos.set(t.x, t.y, t.z);
      it.quat.set(r.x, r.y, r.z, r.w);
      // 水槽の外に出てしまったら戻す（念のため）
      if (!isFinite(t.x) || Math.abs(t.x) > TANK.halfW + 0.5 || t.y < -0.5 || t.y > TANK.height + 0.5 || Math.abs(t.z) > TANK.halfD + 0.5) {
        it.body.setTranslation({ x: 0, y: 2, z: 0 }, true);
        it.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      }
    }
  }

  applyWater(dt, fluid) {
    const { drag } = this.visc;
    const gFull = 14;
    const T = this.time;
    for (const it of this.items) {
      const b = it.body;
      const t = b.translation();
      fluid.sample(t.x, t.y, _flow);
      const flowSp = Math.hypot(_flow[0], _flow[1]);
      if (b.isSleeping() && flowSp < 0.35) continue;
      const r = b.rotation();
      _q.set(r.x, r.y, r.z, r.w);
      const lv = b.linvel(), av = b.angvel();
      const com = b.worldCom();
      const m = b.mass();
      const samples = it.shape.samples;
      const n = samples.length;
      const mPer = m / n;
      _n.copy(_up).applyQuaternion(_q); // 面の法線
      for (let k = 0; k < n; k++) {
        _p.copy(samples[k]).applyQuaternion(_q).add(t);
        // 点の速度 = v + ω × r
        const rx = _p.x - com.x, ry = _p.y - com.y, rz = _p.z - com.z;
        const vx = lv.x + (av.y * rz - av.z * ry);
        const vy = lv.y + (av.z * rx - av.x * rz);
        const vz = lv.z + (av.x * ry - av.y * rx);
        const surf = this.surfaceY(_p.x);
        if (_p.y > surf) {
          // 水面より上：水の支えがないので本来の重さで落ちる
          const extra = mPer * (gFull - this.visc.gravity) * dt;
          b.applyImpulseAtPoint({ x: this.gravityLocal.x * extra, y: this.gravityLocal.y * extra, z: 0 }, _p, true);
          continue;
        }
        fluid.sample(_p.x, _p.y, _flow);
        const sp = Math.hypot(_flow[0], _flow[1]);
        // 奥行き方向の乱れ（2D の水流では表せないので擬似的に）
        const wz = sp * 0.55 * Math.sin(_p.x * 2.3 + T * 1.7 + it.index) * Math.cos(_p.y * 1.9 - T * 1.3);
        let rvx = _flow[0] - vx, rvy = _flow[1] - vy, rvz = wz - vz;
        let ix, iy, iz;
        if (it.shape.isBall) {
          const k2 = mPer * drag * 1.1 * dt;
          ix = rvx * k2; iy = rvy * k2; iz = rvz * k2;
        } else {
          // 板状の物体は面に垂直な方向の抵抗が大きい（ひらひら落ちる）
          const dn = rvx * _n.x + rvy * _n.y + rvz * _n.z;
          const kn = mPer * drag * 1.7 * dt, kt = mPer * drag * 0.55 * dt;
          ix = kt * rvx + (kn - kt) * dn * _n.x;
          iy = kt * rvy + (kn - kt) * dn * _n.y;
          iz = kt * rvz + (kn - kt) * dn * _n.z;
        }
        b.applyImpulseAtPoint({ x: ix, y: iy, z: iz }, _p, true);
      }
    }
  }

  // ランダムに揺さぶる
  shake(power = 1) {
    for (const it of this.items) {
      const m = it.body.mass();
      it.body.applyImpulse({ x: (Math.random() - 0.5) * 3 * m * power, y: (1 + Math.random() * 2) * m * power, z: (Math.random() - 0.5) * 0.6 * m * power }, true);
      it.body.applyTorqueImpulse({ x: (Math.random() - 0.5) * 0.3 * m * power, y: (Math.random() - 0.5) * 0.3 * m * power, z: (Math.random() - 0.5) * 0.3 * m * power }, true);
    }
  }

  // どのペグ／バスケットに入っているか
  checkHooks(dt) {
    const events = [];
    for (const it of this.items) {
      let on = -1;
      if (it.shape.isBall) {
        for (let k = 0; k < this.baskets.length; k++) {
          const bk = this.baskets[k];
          const dx = it.pos.x - bk.x, dz = it.pos.z;
          if (dx * dx + dz * dz < BASKET.innerR * BASKET.innerR && it.pos.y > bk.y && it.pos.y < bk.y + BASKET.height + 0.05) { on = k; break; }
        }
      } else {
        _n.copy(_up).applyQuaternion(it.quat);
        // 一度入ったものは少しゆるく判定する（ちらつき防止）
        const minNy = it.scored ? 0.06 : 0.15;
        if (Math.abs(_n.y) > minNy) {
          _qi.copy(it.quat).invert();
          for (let k = 0; k < this.pegs.length; k++) {
            const pg = this.pegs[k];
            // ペグの軸（x=pg.x, z=0 の縦線）とアイテム平面の交点を、アイテムのローカル座標で調べる
            const y = it.pos.y + ((it.pos.x - pg.x) * _n.x + it.pos.z * _n.z) / _n.y;
            if (y < pg.base - (it.scored ? 0.35 : 0.12) || y > pg.tip) continue;
            _v.set(pg.x - it.pos.x, y - it.pos.y, -it.pos.z).applyQuaternion(_qi);
            const margin = it.shape.tubeR + (it.scored ? 0 : PEG.radius * 0.5);
            if (insideHole(it.shape, _v.x, _v.z, margin)) { on = k; break; }
          }
        }
      }
      if (on >= 0) {
        it.hookTimer += dt;
        it.offTimer = 0;
        if (!it.scored && it.hookTimer > 0.45) {
          it.scored = true; it.hookedOn = on; it.flash = 1;
          events.push({ type: 'hook', item: it });
        }
      } else {
        it.hookTimer = 0;
        it.offTimer += dt;
        if (it.scored && it.offTimer > 0.5) {
          it.scored = false; it.hookedOn = -1;
          events.push({ type: 'unhook', item: it });
        }
      }
    }
    return events;
  }
}
