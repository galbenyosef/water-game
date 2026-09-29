// アイテムの形（輪郭）を作る。輪郭はローカル XZ 平面上の閉曲線で、面の法線はローカル +Y。
import * as THREE from 'three';

const TUBE_R = 0.085;

function closedCurve(pts2d, type = 'catmullrom', tension = 0.5) {
  const pts = pts2d.map(([x, z]) => new THREE.Vector3(x, 0, z));
  return new THREE.CatmullRomCurve3(pts, true, type, tension);
}

function polar(n, fn) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = fn(a);
    out.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return out;
}

function centerPoints(pts) {
  // 輪郭の重心（線の平均）を原点に寄せる
  let cx = 0, cz = 0;
  for (const [x, z] of pts) { cx += x; cz += z; }
  cx /= pts.length; cz /= pts.length;
  return pts.map(([x, z]) => [x - cx, z - cz]);
}

const builders = {
  ring: () => closedCurve(polar(32, () => 0.42), 'centripetal'),
  star: () => {
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const r = i % 2 === 0 ? 0.56 : 0.34;
      pts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    return closedCurve(pts, 'catmullrom', 0.12);
  },
  heart: () => {
    const pts = [];
    const n = 28;
    for (let i = 0; i < n; i++) {
      const t = (i / n) * Math.PI * 2;
      const x = 16 * Math.pow(Math.sin(t), 3);
      const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
      pts.push([x * 0.031, -y * 0.031]);
    }
    return closedCurve(centerPoints(pts), 'centripetal');
  },
  hex: () => {
    const pts = [];
    for (let i = 0; i < 6; i++) {
      const a0 = (i / 6) * Math.PI * 2;
      const a1 = ((i + 1) / 6) * Math.PI * 2;
      const p0 = [Math.cos(a0) * 0.5, Math.sin(a0) * 0.5];
      const p1 = [Math.cos(a1) * 0.5, Math.sin(a1) * 0.5];
      const k = 0.2;
      pts.push([p0[0] + (p1[0] - p0[0]) * k, p0[1] + (p1[1] - p0[1]) * k]);
      pts.push([p0[0] + (p1[0] - p0[0]) * (1 - k), p0[1] + (p1[1] - p0[1]) * (1 - k)]);
    }
    return closedCurve(pts, 'catmullrom', 0.5);
  },
  flower: () => closedCurve(polar(60, a => 0.42 + 0.085 * Math.cos(5 * a)), 'centripetal'),
};

const cache = new Map();

export function getShape(kind) {
  if (cache.has(kind)) return cache.get(kind);
  let shape;
  if (kind === 'ball') {
    const r = 0.21;
    shape = {
      kind, isBall: true, radius: r, boundR: r,
      geometry: new THREE.SphereGeometry(r, 40, 28),
      samples: [new THREE.Vector3()],
    };
  } else {
    const curve = builders[kind]();
    const geometry = new THREE.TubeGeometry(curve, 160, TUBE_R, 16, true);
    // 当たり判定用のカプセル列
    const segCount = kind === 'ring' ? 16 : 22;
    const pts = curve.getSpacedPoints(segCount).slice(0, segCount);
    const segments = [];
    for (let i = 0; i < segCount; i++) {
      const a = pts[i], b = pts[(i + 1) % segCount];
      segments.push({ a: a.clone(), b: b.clone(), mid: a.clone().add(b).multiplyScalar(0.5), len: a.distanceTo(b) });
    }
    let minR = Infinity, maxR = 0;
    for (const p of curve.getSpacedPoints(200)) {
      const r = Math.hypot(p.x, p.z);
      minR = Math.min(minR, r); maxR = Math.max(maxR, r);
    }
    const outline = curve.getSpacedPoints(96).slice(0, 96).map(p => [p.x, p.z]);
    shape = {
      kind, isBall: false, tubeR: TUBE_R, geometry, segments, outline,
      holeR: minR - TUBE_R,
      boundR: maxR + TUBE_R,
      samples: segments.map(s => s.mid),
    };
  }
  cache.set(kind, shape);
  return shape;
}

// 輪郭の内側にあり、かつ輪郭（チューブの中心線）から margin 以上離れているか
export function insideHole(shape, x, z, margin) {
  const P = shape.outline;
  let inside = false;
  let minD2 = Infinity;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [xi, zi] = P[i], [xj, zj] = P[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
    const dx = xj - xi, dz = zj - zi;
    const t = Math.max(0, Math.min(1, ((x - xi) * dx + (z - zi) * dz) / (dx * dx + dz * dz)));
    const ex = xi + dx * t - x, ez = zi + dz * t - z;
    minD2 = Math.min(minD2, ex * ex + ez * ez);
  }
  return inside && minD2 > margin * margin;
}
