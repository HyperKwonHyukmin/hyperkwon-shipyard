/**
 * 디자인 고도화(2026-11-13): 장소 밖을 채우는 풍경. 전부 움직이지 않고, 같은 모양은 InstancedMesh 한 번에 그린다.
 * - 하늘빛 반사(환경 맵): 금속·페인트 면이 하늘을 받아 덜 밋밋해진다
 * - 먼 산 3겹(멀수록 옅게), 낮 구름
 * - 블록 적치장(공장 뒤 빈 땅에 받침 위 블록들), 경계 나무
 * 실제 배치가 아니라 분위기를 위한 것이다(공개 자료 원칙: 배치도는 쓰지 않는다).
 */
import * as THREE from 'three';
import { unitBlockGeometry, seams } from './blockgen';
import { cloudTexture } from './textures';
import { FOOTPRINT, onRoad } from './layout';
import type { Station } from './content/stations';

/**
 * 고정 난수(mulberry32). 적치 블록·나무·구름 자리는 무작위처럼 보이지만 열 때마다, 누가 열어도 같아야 한다 —
 * 여러 사람이 접속했을 때 서로 다른 야드를 보면 다른 사람이 블록을 뚫고 지나가는 것처럼 보인다.
 */
let seed = 20261113;
function rnd() {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const rand = (a: number, b: number) => a + rnd() * (b - a);

function skyEnvironment(renderer: THREE.WebGLRenderer) {
  const c = document.createElement('canvas');
  c.width = 8;
  c.height = 256;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#4f86c6');
  grad.addColorStop(0.45, '#a9cbe8');
  grad.addColorStop(0.5, '#dfe9f1');
  grad.addColorStop(0.52, '#8c8f93');
  grad.addColorStop(1, '#5d6064');
  g.fillStyle = grad;
  g.fillRect(0, 0, 8, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sky = new THREE.Scene();
  sky.add(new THREE.Mesh(new THREE.SphereGeometry(10, 24, 16), new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide })));
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(sky, 0.03).texture;
  pmrem.dispose();
  tex.dispose();
  return env;
}

/** 산 한 겹: 육지 쪽(−x 반원)에 둘러선 능선 띠 */
function ridge(radius: number, base: number, amp: number, seed: number) {
  const N = 140;
  const pos: number[] = [];
  const idx: number[] = [];
  const A0 = Math.PI * 0.42;
  const A1 = Math.PI * 1.58;
  for (let i = 0; i <= N; i++) {
    const k = i / N;
    const a = A0 + (A1 - A0) * k;
    const h =
      base +
      amp * (0.55 + 0.45 * Math.sin(k * 9 + seed)) * (0.6 + 0.4 * Math.sin(k * 23 + seed * 2.3)) +
      amp * 0.15 * Math.sin(k * 61 + seed * 5);
    // 양 끝(바다 쪽)으로 갈수록 낮아져 수평선으로 사라짐
    const fade = Math.min(1, Math.min(k, 1 - k) * 6);
    const x = Math.cos(a) * radius;
    const z = Math.sin(a) * radius;
    pos.push(x, -6, z, x, Math.max(2, h * fade), z);
    if (i < N) {
      const p = i * 2;
      idx.push(p, p + 2, p + 1, p + 1, p + 2, p + 3);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  return geo;
}

/** 배경 공장 자리(main.ts 의 sheds 와 같은 값: x, z, 길이, 폭) */
export const BACK_SHEDS: [number, number, number, number][] = [
  [-300, -222, 100, 40],
  [-440, -222, 70, 36],
  [-60, -150, 70, 36],
];

export function createScenery(scene: THREE.Scene, renderer: THREE.WebGLRenderer, stations: Station[]) {
  /** 그 자리가 비었는가: 길, 장소, 배경 공장을 pad 만큼 피한다 */
  const free = (x: number, z: number, pad: number) => {
    if (onRoad(x, z, pad)) return false;
    for (const s of stations) {
      const f = FOOTPRINT[s.id];
      if (f && Math.abs(x - s.at[0]) < f.hx + pad && Math.abs(z - (s.at[2] + (f.dz ?? 0))) < f.hz + pad) return false;
    }
    return !BACK_SHEDS.some(([sx, sz, l, w]) => Math.abs(x - sx) < l / 2 + pad && Math.abs(z - sz) < w / 2 + pad);
  };
  const env = skyEnvironment(renderer);
  scene.environment = env;

  // ── 먼 산 3겹 ──
  const RIDGES = [
    { r: 1250, base: 40, amp: 150, day: 0x58735f, dusk: 0x3b3a4e, night: 0x0a1016 },
    { r: 1650, base: 70, amp: 230, day: 0x7d968f, dusk: 0x6b5a72, night: 0x0c131b },
    { r: 2150, base: 110, amp: 320, day: 0xa3b7bd, dusk: 0xa98490, night: 0x0e1620 },
  ];
  const ridges = RIDGES.map((r, i) => {
    const m = new THREE.MeshBasicMaterial({ color: r.day, side: THREE.DoubleSide, fog: false });
    const mesh = new THREE.Mesh(ridge(r.r, r.base, r.amp, 1.7 + i * 2.1), m);
    mesh.renderOrder = -3 + i * -1;
    scene.add(mesh);
    return { m, ...r };
  });

  // ── 낮 구름 ──
  const clouds = new THREE.Group();
  const cTex = cloudTexture();
  for (let i = 0; i < 16; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: cTex, fog: false, depthWrite: false, transparent: true, opacity: rand(0.55, 0.9) }));
    const a = rand(0, Math.PI * 2);
    const r = rand(1200, 2600);
    const w = rand(500, 1000);
    s.scale.set(w, w * rand(0.28, 0.4), 1);
    s.position.set(Math.cos(a) * r, rand(420, 760), Math.sin(a) * r);
    s.renderOrder = -1;
    clouds.add(s);
  }
  scene.add(clouds);

  /** 걷기 모드가 피해 갈 자리(적치 블록): [x0, x1, z0, z1] */
  const obstacles: [number, number, number, number][] = [];
  // ── 블록 적치장: 공장 뒤 빈 땅(z = ±105 ~ ±180)에 받침 위 블록 ──
  {
    const spots: { x: number; z: number; l: number; w: number; h: number }[] = [];
    // 야드 전체를 36 m 격자로 훑어, 길·장소·배경 공장을 피한 칸에만 놓는다(layout.ts)
    for (let x = -700; x < -150; x += 36)
      for (let z = -262; z <= 300; z += 34) {
        if (rnd() < 0.38 || !free(x, z, 16)) continue;
        spots.push({ x: x + rand(-4, 4), z: z + rand(-4, 4), l: rand(12, 22), w: rand(9, 15), h: rand(4, 9) });
      }
    const unit = new THREE.BoxGeometry(1, 1, 1);
    // 2026-11-14 W1: 매끈한 상자 → 판·늑판·거더·러그가 있는 블록 형상(blockgen, 크기만 바꿔 씀)
    const blocks = new THREE.InstancedMesh(unitBlockGeometry(), seams(new THREE.MeshStandardMaterial({ roughness: 0.75, metalness: 0.2, side: THREE.DoubleSide })), spots.length);
    const stands = new THREE.InstancedMesh(unit, new THREE.MeshStandardMaterial({ color: 0x4a3a2c, roughness: 0.9 }), spots.length * 2);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const col = new THREE.Color();
    const PAINT = [0x8a9099, 0x8b4a3a, 0x7f9a86, 0xa7abb0, 0x8b4a3a, 0x6f7a87];
    spots.forEach((s, i) => {
      const turned = rnd() >= 0.8;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), turned ? Math.PI / 2 : 0);
      const [hx, hz] = turned ? [s.w / 2, s.l / 2] : [s.l / 2, s.w / 2];
      obstacles.push([s.x - hx, s.x + hx, s.z - hz, s.z + hz]);
      blocks.setMatrixAt(i, m4.compose(new THREE.Vector3(s.x, 1.2 + s.h / 2, s.z), q, new THREE.Vector3(s.l, s.h, s.w)));
      blocks.setColorAt(i, col.setHex(PAINT[Math.floor(rnd() * PAINT.length)]).offsetHSL(0, 0, rand(-0.04, 0.04)));
      for (const k of [0, 1])
        stands.setMatrixAt(i * 2 + k, m4.compose(new THREE.Vector3(s.x + (k ? 1 : -1) * s.l * 0.3, 0.6, s.z), q, new THREE.Vector3(1.4, 1.2, s.w * 0.9)));
    });
    blocks.castShadow = blocks.receiveShadow = true;
    stands.castShadow = true;
    scene.add(blocks, stands);
  }

  // ── 나무: 야드 경계(z = ±200)와 정문 앞 ──
  {
    const at: [number, number][] = [];
    for (const zEdge of [-296, 334]) for (let x = -740; x < -120; x += rand(13, 20)) at.push([x, zEdge + rand(-5, 5)]);
    for (let z = -290; z <= 330; z += rand(12, 18)) if (Math.abs(z) > 34) at.push([rand(-748, -738), z]);
    const crown = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 7), new THREE.MeshStandardMaterial({ roughness: 0.95, flatShading: true }), at.length);
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.35, 0.45, 1, 6), new THREE.MeshStandardMaterial({ color: 0x4d3b2a, roughness: 0.95 }), at.length);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const col = new THREE.Color();
    at.forEach(([x, z], i) => {
      const h = rand(9, 15);
      const r = h * rand(0.26, 0.34);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand(0, 6));
      crown.setMatrixAt(i, m4.compose(new THREE.Vector3(x, 3 + h / 2, z), q, new THREE.Vector3(r, h, r)));
      crown.setColorAt(i, col.setHSL(rand(0.27, 0.36), rand(0.3, 0.45), rand(0.15, 0.23)));
      trunk.setMatrixAt(i, m4.compose(new THREE.Vector3(x, 2, z), q, new THREE.Vector3(1, 4, 1)));
    });
    crown.castShadow = trunk.castShadow = true;
    scene.add(crown, trunk);
  }

  /** 낮/노을/밤에 맞춰 하늘빛 반사 세기, 산 색, 구름을 바꾼다 */
  function setTime(t: 'day' | 'dusk' | 'night') {
    scene.environmentIntensity = t === 'day' ? 0.55 : t === 'dusk' ? 0.3 : 0.05;
    for (const r of ridges) r.m.color.setHex(r[t]);
    clouds.visible = t !== 'night';
    for (const c of clouds.children) (c as THREE.Sprite).material.color.setHex(t === 'dusk' ? 0xffb89a : 0xffffff);
  }
  /** 하늘빛 반사 켜고 끄기(품질 단계 3 이상에서 끔 — 픽셀마다 환경 맵을 읽는 비용) */
  const setReflection = (on: boolean) => {
    scene.environment = on ? env : null;
  };
  return { setTime, setReflection, obstacles };
}
