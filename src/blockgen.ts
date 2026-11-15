/**
 * 블록 형상 생성기(2026-11-14 W1, PLAN.md 6장). 사용자: "건조 과정은 그냥 장난감 블록이 지나가는 수준".
 * 매끈한 상자 대신 실제 블록처럼 판 + 보강재 + 늑판(구멍) + 거더 + 들어 올리는 러그로 만든다. 끝이 열려 있어 안 구조가 보인다.
 * 부재는 상자로 쌓되 재질별로 메시 하나로 합친다(부재 수백 개라도 그리기 호출은 재질 수만큼).
 * 좌표: 블록 바닥 가운데가 원점, x = 길이, z = 폭, y = 위.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * 판 이음선 셰이더(2026-11-14 W1). 블록 면에 강판 이음선(길이 8 m × 높이 2.6 m × 폭 3 m 격자 — 2.4 × 1.8 m 는 타일처럼 보였음)을 긋고 판마다 명암을 조금씩 달리한다.
 * 매끈한 면이 '플라스틱 상자'가 아니라 '강판을 이어 붙인 블록'으로 읽히게 하는 가장 싼 방법(텍스처·UV 없음).
 * 좌표는 메시 자기 좌표(InstancedMesh 면 인스턴스 변환까지) — 블록이 움직여도 선이 미끄러지지 않는다.
 * 선은 화면에서 약 1 px, 멀어서 격자가 촘촘해지면 저절로 흐려진다(물결무늬 방지).
 */
export function seams<T extends THREE.Material>(m: T): T {
  const mm = m as unknown as THREE.MeshStandardMaterial;
  mm.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
varying vec3 vSeamPos;
varying vec3 vSeamN;`)
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec4 seamP = vec4(transformed, 1.0);
        vec3 seamN = normal;
        #ifdef USE_INSTANCING
          seamP = instanceMatrix * seamP;
          seamN = mat3(instanceMatrix) * seamN;
        #endif
        vSeamPos = seamP.xyz;
        vSeamN = seamN;`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vSeamPos;
varying vec3 vSeamN;`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          vec3 q = vSeamPos / vec3(8.0, 2.6, 3.0);
          vec3 fw = max(fwidth(q), vec3(1e-4));
          vec3 d = abs(fract(q - 0.5) - 0.5) / fw;
          vec3 l = 1.0 - clamp(d - 0.5, 0.0, 1.0);
          vec3 an = abs(normalize(vSeamN));
          float line = max(max(l.x * (1.0 - an.x), l.y * (1.0 - an.y)), l.z * (1.0 - an.z));
          line *= 1.0 - smoothstep(0.12, 0.35, max(max(fw.x, fw.y), fw.z));
          vec3 cell = floor(q + an * 0.5);
          float h = fract(sin(dot(cell, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
          diffuseColor.rgb *= (0.95 + 0.1 * h) * (1.0 - 0.26 * line);
        }`,
      );
  };
  mm.customProgramCacheKey = () => 'seams1';
  return m;
}

const std = (color: number, roughness: number, metalness = 0.2) =>
  seams(new THREE.MeshStandardMaterial({ color, roughness, metalness, side: THREE.DoubleSide }));

/** 블록 색. 공장에서 막 나온 블록은 숍 프라이머(회갈색), 도장을 마치면 선저는 빨강·안쪽은 밝은 회색 */
export const BM = {
  primer: std(0x7d6e60, 0.8),
  primerDark: std(0x5f554b, 0.85),
  hold: std(0xa9a7a0, 0.7),
  antifoul: std(0x8c3027, 0.7, 0.15),
  hull: std(0x2c4268, 0.5),
  deck: std(0x4d6a46, 0.85),
  lug: std(0xd8b04a, 0.6, 0.3),
};
export type Mat = THREE.Material;

/** 상자 부재를 재질별로 모았다가 한 번에 합친다 */
export class Parts {
  private lists = new Map<Mat, THREE.BufferGeometry[]>();
  box(m: Mat, w: number, h: number, d: number, x: number, y: number, z: number, rotX = 0) {
    if (w <= 0 || h <= 0 || d <= 0) return;
    const g = new THREE.BoxGeometry(w, h, d);
    if (rotX) g.rotateX(rotX);
    g.translate(x, y, z);
    this.add(m, g);
  }
  add(m: Mat, g: THREE.BufferGeometry) {
    let l = this.lists.get(m);
    if (!l) this.lists.set(m, (l = []));
    l.push(g.index ? g.toNonIndexed() : g);
  }
  /** 합친 메시들을 group 에 붙인다(그림자 켬) */
  build(group = new THREE.Group()) {
    for (const [m, list] of this.lists) {
      const geo = mergeGeometries(list, false);
      for (const g of list) g.dispose();
      const mesh = new THREE.Mesh(geo, m);
      mesh.castShadow = mesh.receiveShadow = true;
      group.add(mesh);
    }
    this.lists.clear();
    return group;
  }
  /** 모든 재질을 무시하고 하나의 형상으로(InstancedMesh 용) */
  geometry() {
    const all = [...this.lists.values()].flat();
    const geo = mergeGeometries(all, false);
    for (const g of all) g.dispose();
    this.lists.clear();
    return geo;
  }
}

/**
 * 판 한 장을 열린 꺾은선 path(단면 (z, y) 점들)를 따라 x0~x1 로 밀어낸 얇은 면. 끝은 막지 않는다.
 * 선체 블록을 '속이 찬 각기둥' 대신 판으로 만들 때 쓴다(양면 재질이라 안쪽에서도 보임).
 */
export function strip(path: [number, number][], x0: number, x1: number) {
  const pos: number[] = [];
  for (let i = 0; i < path.length - 1; i++) {
    const [za, ya] = path[i];
    const [zb, yb] = path[i + 1];
    pos.push(x0, ya, za, x1, ya, za, x1, yb, zb, x0, ya, za, x1, yb, zb, x0, yb, zb);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  g.computeVertexNormals();
  return g;
}

/**
 * 늑판(가로 칸막이) 한 장: z0~z1, y0~y1 칸에 가운데 구멍(경감공·통행구)이 뚫린 판. 상자 4개.
 * 구멍이 있어야 '속이 빈 강구조'로 읽힌다.
 */
export function floorWithHole(p: Parts, m: Mat, x: number, z0: number, z1: number, y0: number, y1: number, t = 0.14) {
  const w = z1 - z0;
  const h = y1 - y0;
  const hw = Math.min(w * 0.55, 1.6);
  const hh = Math.min(h * 0.45, 1.0);
  const zc = (z0 + z1) / 2;
  const yc = (y0 + y1) / 2;
  const band = (h - hh) / 2;
  p.box(m, t, band, w, x, y0 + band / 2, zc);
  p.box(m, t, band, w, x, y1 - band / 2, zc);
  const side = (w - hw) / 2;
  p.box(m, t, hh, side, x, yc, z0 + side / 2);
  p.box(m, t, hh, side, x, yc, z1 - side / 2);
}

/** 들어 올리는 러그 4개(블록 윗면 네 귀퉁이 안쪽) */
export function lugs(p: Parts, l: number, w: number, top: number, m: Mat = BM.lug) {
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      p.box(m, 0.7, 0.6, 0.08, sx * l * 0.32, top + 0.3, sz * w * 0.32);
      p.box(m, 0.9, 0.06, 0.5, sx * l * 0.32, top + 0.03, sz * w * 0.32); // 받침판
    }
}

export interface DBOptions {
  l: number;
  w: number;
  h: number;
  /** 바깥 판(선저). 도장 전이면 프라이머, 뒤면 빨강 */
  shell?: Mat;
  /** 내저판(윗판) */
  inner?: Mat;
  /** 안 구조(늑판·거더) */
  frame?: Mat;
  /** 윗판 없이 안이 보이는 상태(조립 중) */
  openTop?: boolean;
  /** 늑판 간격 m */
  spacing?: number;
  lug?: boolean;
}
/** 이중저형 블록: 선저판, 내저판, 거더(세로), 구멍 뚫린 늑판(가로), 끝은 열림 */
export function doubleBottom(o: DBOptions, p = new Parts()) {
  const { l, w, h } = o;
  const t = 0.16;
  const shell = o.shell ?? BM.primer;
  const inner = o.inner ?? BM.primer;
  const frame = o.frame ?? BM.primerDark;
  p.box(shell, l, t, w, 0, t / 2, 0);
  for (const s of [-1, 1]) p.box(shell, l, h, t, 0, h / 2, (s * (w - t)) / 2); // 옆 판
  if (!o.openTop) p.box(inner, l, t, w, 0, h - t / 2, 0);
  // 거더: 가운데 + 양쪽(폭 4~5 m 마다)
  const nG = Math.max(1, Math.round(w / 4.5));
  const gz: number[] = [];
  for (let i = 1; i < nG; i++) gz.push(-w / 2 + (w * i) / nG);
  for (const z of gz) p.box(frame, l, h - 2 * t, 0.14, 0, h / 2, z);
  // 늑판: 거더 사이 칸마다 구멍
  const sp = o.spacing ?? 2.4;
  const n = Math.max(2, Math.round(l / sp));
  const edges = [-w / 2 + t, ...gz, w / 2 - t];
  for (let i = 0; i <= n; i++) {
    const x = -l / 2 + 0.2 + ((l - 0.4) * i) / n;
    for (let k = 0; k < edges.length - 1; k++) floorWithHole(p, frame, x, edges[k] + 0.07, edges[k + 1] - 0.07, t, h - t);
  }
  // 윗판이 열려 있으면 늑판 위에 종보강재(판넬 상태)
  if (o.openTop) for (let z = -w / 2 + 0.8; z < w / 2 - 0.5; z += 0.8) p.box(frame, l - 0.3, 0.35, 0.1, 0, t + 0.18, z);
  if (o.lug !== false) lugs(p, l, w, o.openTop ? h : h);
  return p;
}

export interface SideOptions {
  l: number;
  /** 높이(y) */
  h: number;
  /** 두께 방향 깊이(z) */
  w: number;
  /** 외판이 +z 쪽(1) 인지 −z 쪽(−1) 인지 */
  side: 1 | -1;
  shell?: Mat;
  frame?: Mat;
  lug?: boolean;
}
/** 측벽형 블록: 외판 + 늑골(세로, 0.8 m 마다) + 종통재(가로 띠) + 특설늑골(웨브, 구멍) */
export function sideShell(o: SideOptions, p = new Parts()) {
  const { l, h, w, side } = o;
  const shell = o.shell ?? BM.primer;
  const frame = o.frame ?? BM.primerDark;
  const zs = (side * (w - 0.16)) / 2;
  p.box(shell, l, h, 0.16, 0, h / 2, zs);
  // 늑골: 외판 안쪽으로 0.5 m
  for (let x = -l / 2 + 0.4; x < l / 2 - 0.2; x += 0.8) p.box(frame, 0.1, h - 0.2, 0.5, x, h / 2, zs - side * 0.3);
  // 종통재(스트링거): 높이 2.5 m 마다 안쪽으로 깊게
  for (let y = 2.4; y < h - 0.5; y += 2.6) p.box(frame, l, 0.14, w - 0.3, 0, y, zs - (side * (w - 0.3)) / 2);
  // 특설늑골: 4 m 마다, 구멍 뚫린 판
  for (let x = -l / 2 + 2; x < l / 2 - 1; x += 4) floorWithHole(p, frame, x, -w / 2 + 0.12, w / 2 - 0.12, 0.1, h - 0.1);
  p.box(shell, l, 0.14, w, 0, h - 0.07, 0); // 윗면 판(갑판 일부)
  if (o.lug !== false) lugs(p, l, w, h);
  return p;
}

/**
 * 적치장·원경용 블록 하나의 형상(16 × 6 × 12 m 기준, InstancedMesh 로 크기만 바꿔 씀).
 * 가까이 볼 일이 없어 이중저형 하나로 충분하다. 늑판 간격은 넓게(꼭짓점 수 줄임).
 */
export function unitBlockGeometry() {
  const p = new Parts();
  doubleBottom({ l: 16, w: 12, h: 6, spacing: 8, lug: true }, p); // 닫힌 상자라 안 늑판은 끝에서만 보임 → 3장
  const g = p.geometry();
  g.scale(1 / 16, 1 / 6, 1 / 12);
  g.translate(0, -0.5, 0); // 상자(가운데 원점)와 같은 자리
  return g;
}

/**
 * 웨브(가로 칸막이 판): 볼록한 단면 pts((z, y) 점들)를 두께 t 로, x 자리에. 가운데에 단면을 줄인 구멍.
 * 선체 블록의 탱크(호퍼·톱사이드) 안 특설늑골. 볼록 다각형만(구멍을 무게중심 쪽으로 줄여 만듦).
 */
export function webPlate(pts: [number, number][], x: number, t = 0.14, hole = 0.55) {
  const cz = pts.reduce((a, q) => a + q[0], 0) / pts.length;
  const cy = pts.reduce((a, q) => a + q[1], 0) / pts.length;
  const shape = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(-z, y)));
  shape.holes.push(new THREE.Path(pts.map(([z, y]) => new THREE.Vector2(-(cz + (z - cz) * hole), cy + (y - cy) * hole))));
  const g = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false, curveSegments: 1 });
  g.rotateY(Math.PI / 2);
  g.translate(x - t / 2, 0, 0);
  return g;
}

