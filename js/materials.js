// マテリアルとシェーダーのパッチ（水中のコースティクス、ラメのきらめき）
import * as THREE from 'three';
import { TANK } from './config.js';

export const shared = {
  uTime: { value: 0 },
  uWaterInv: { value: new THREE.Matrix4() },
  uSurfN: { value: new THREE.Vector3(0, 1, 0) }, // 水面の法線（上向き）
  uSurfC: { value: TANK.water },                 // dot(uSurfN, p) がこれより大きい側が空気
  uCausticColor: { value: new THREE.Color(0.75, 0.95, 1.0) },
};

export const CAUSTIC_GLSL = /* glsl */`
float causticLayer(vec2 p, float t) {
  vec2 i = p;
  float c = 1.0;
  float inten = 0.005;
  for (int n = 0; n < 4; n++) {
    float tt = t * (1.0 - (3.5 / float(n + 1)));
    i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
    vec2 d = vec2(sin(i.x + tt), cos(i.y + tt));
    d = mix(d, vec2(1e-3), step(abs(d), vec2(1e-3)));
    c += 1.0 / max(length(vec2(p.x * inten / d.x, p.y * inten / d.y)), 1e-3);
  }
  c /= 4.0;
  c = 1.17 - pow(max(c, 0.0), 1.4);
  return pow(clamp(abs(c), 0.0, 1.0), 8.0);
}
float causticAt(vec3 lp, float t) {
  vec2 p = vec2(lp.x * 1.25 + lp.z * 0.4, lp.y * 1.25) - 250.0;
  return causticLayer(p, t * 0.55);
}
`;

// material に水中のコースティクス（とラメ）を足す
export function patchMaterial(material, { caustic = 1, sparkle = false } = {}) {
  const uCausticMul = { value: caustic };
  material.userData.uCausticMul = uCausticMul;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = shared.uTime;
    shader.uniforms.uWaterInv = shared.uWaterInv;
    shader.uniforms.uSurfN = shared.uSurfN;
    shader.uniforms.uSurfC = shared.uSurfC;
    shader.uniforms.uCausticColor = shared.uCausticColor;
    shader.uniforms.uCausticMul = uCausticMul;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCWorld;\nvarying vec3 vObjPos;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        vec4 cwp = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          cwp = instanceMatrix * cwp;
        #endif
        vCWorld = (modelMatrix * cwp).xyz;
        vObjPos = transformed;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vCWorld;
        varying vec3 vObjPos;
        uniform float uTime;
        uniform mat4 uWaterInv;
        uniform vec3 uSurfN;
        uniform float uSurfC;
        uniform vec3 uCausticColor;
        uniform float uCausticMul;
        ${CAUSTIC_GLSL}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          vec3 lp = (uWaterInv * vec4(vCWorld, 1.0)).xyz;
          float dep = uSurfC - dot(uSurfN, lp);
          float inW = smoothstep(-0.03, 0.1, dep) * step(abs(lp.x), 2.62) * step(-0.1, lp.y) * step(lp.y, ${(TANK.height + 0.1).toFixed(2)}) * step(abs(lp.z), 0.72);
          float depthK = mix(1.0, 0.55, clamp(dep / ${TANK.height.toFixed(2)}, 0.0, 1.0));
          float cst = causticAt(lp, uTime) + 0.5 * causticAt(lp * 1.7 + vec3(3.1, 1.3, 0.0), uTime * 1.3);
          totalEmissiveRadiance += uCausticColor * cst * uCausticMul * 0.6 * inW * depthK * (0.15 + 0.85 * diffuseColor.rgb);
          ${sparkle ? `
          vec3 cell = floor(vObjPos * 55.0);
          float rnd = fract(sin(dot(cell, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
          float rnd2 = fract(rnd * 91.7);
          vec3 vd = normalize(vViewPosition + vec3(1e-5));
          float tw = pow(max(0.5 + 0.5 * sin(uTime * 2.5 + rnd * 60.0 + dot(vd, vec3(rnd, rnd2, 1.0 - rnd)) * 25.0), 0.0), 18.0);
          totalEmissiveRadiance += step(0.78, rnd2) * tw * 2.4 * mix(vec3(1.0), diffuseColor.rgb, 0.35);
          ` : ''}
        }`);
  };
  material.customProgramCacheKey = () => `wg-${sparkle ? 's' : 'n'}`;
  return material;
}

function stripeTexture(color) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  const cols = [color, '#ffffff', color, '#ffffff', color, '#ffffff'];
  for (let i = 0; i < 6; i++) {
    g.fillStyle = cols[i];
    g.fillRect((i * 256) / 6, 0, 256 / 6 + 1, 128);
  }
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 256, 10);
  g.fillRect(0, 118, 256, 10);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function makeItemMaterial(kind, colorHex, type) {
  const color = new THREE.Color(colorHex);
  const isBall = kind === 'ball';
  let m;
  switch (type) {
    case 'glitter':
      m = new THREE.MeshPhysicalMaterial({ color, roughness: 0.38, metalness: 0.3, clearcoat: 1, clearcoatRoughness: 0.05 });
      patchMaterial(m, { caustic: 0.8, sparkle: true });
      break;
    case 'clear':
      m = new THREE.MeshPhysicalMaterial({
        color, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.58,
        clearcoat: 1, iridescence: 0.7, iridescenceIOR: 1.35, iridescenceThicknessRange: [180, 520],
        emissive: color.clone().multiplyScalar(0.12), specularIntensity: 1,
      });
      patchMaterial(m, { caustic: 0.6 });
      break;
    case 'metal':
      m = new THREE.MeshPhysicalMaterial({ color, roughness: 0.2, metalness: 1, clearcoat: 0.6, clearcoatRoughness: 0.1 });
      patchMaterial(m, { caustic: 0.7 });
      break;
    case 'pearl':
      m = new THREE.MeshPhysicalMaterial({
        color: color.clone().lerp(new THREE.Color('#ffffff'), 0.35), roughness: 0.28, metalness: 0.05,
        sheen: 1, sheenColor: new THREE.Color('#ffffff'), sheenRoughness: 0.4,
        iridescence: 1, iridescenceIOR: 1.6, iridescenceThicknessRange: [250, 600], clearcoat: 1,
      });
      patchMaterial(m, { caustic: 0.8 });
      break;
    default:
      m = new THREE.MeshPhysicalMaterial({ color, roughness: 0.3, metalness: 0, clearcoat: 0.9, clearcoatRoughness: 0.12 });
      patchMaterial(m, { caustic: 1 });
  }
  if (isBall && type !== 'metal' && type !== 'clear') {
    m.map = stripeTexture('#' + color.getHexString());
    m.color.set('#ffffff');
  }
  m.userData.baseEmissive = m.emissive.clone();
  m.userData.itemColor = color;
  return m;
}
