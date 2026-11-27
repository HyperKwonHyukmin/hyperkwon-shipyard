/**
 * 조선소 월드 — 1단계: 밤의 빈 드라이 도크.
 * 단위는 m. x = 도크 길이 방향(+x 쪽이 바다·게이트), z = 폭 방향, y = 위. 안벽 상면이 y = 0.
 * 배는 ship.ts(2단계). 블록 탑재 애니메이션(3단계)은 아직 없다.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { buildBulkCarrier, SHIP } from './ship';
import { createErection } from './erection';
import { createWelding } from './welding';
import { createFog, lightBeam } from './atmosphere';
import { createSound, nearness } from './sound';
import { STATIONS } from './content/stations';
import { buildYard } from './yard';
import { createTour, type Experience } from './tour';
import { createCutting } from './factory/cutting';
import { createAssembly } from './factory/assembly';
import { createPE } from './factory/pe';
import { createPaint } from './factory/paint';
import { createDayNight } from './daynight';
import { createTraffic } from './traffic';
import { createLaunch } from './launch';
import { createLaunchTry } from './launch-try';
import { createQuay } from './quay';
import { createTrial } from './trial';
import { createDelivery } from './delivery';
import { createHistory, ERAS } from './history';
import { createDesign } from './design';
import { createLift } from './lift';
import { createLightPool } from './lightpool';
import { createWalk } from './walk';
import { createProps } from './props';
import { mergeStatic } from './merge';
import { createScenery, BACK_SHEDS } from './scenery';
import { createClutter } from './clutter';
import { createOperate } from './operate';
import { createQuickTour } from './quicktour';
import { fillFactories } from './factory/fill';
import { createCrowd } from './crowd';
import { createNet, HELMETS, nameOf, randomName, type Helmet } from './net';
import { createPeers } from './peers';
import { createDockWork } from './dockwork';
import { createOpening } from './opening';
import { createBackdrop } from './backdrop';
import { createForces } from './forces';
import { createMiniMap } from './minimap';
import { createPhoto } from './photo';
import { createTurnover } from './turnover';
import { createBuild } from './build';
import { createTries } from './try-frame';
import { yardTries } from './tries-yard';
import { seaTries } from './tries-sea';
import { concreteTexture, shedWallTextures } from './textures';

const DOCK = { length: 220, width: 48, depth: 14, gate: 8 };
const HALF_L = DOCK.length / 2;
const HALF_W = DOCK.width / 2;
const SEA_Y = -3;
const CRANE_RAIL_Z = HALF_W + 8;

const canvas = document.getElementById('scene') as HTMLCanvasElement;
let renderer: THREE.WebGLRenderer;
// ── 품질 단계(성능) ─────────────────────────────────────
// 2026-11-13 실측: 그리기 호출을 줄여도 fps 가 안 올랐다 → 병목은 픽셀 계산(GPU). 느리면 픽셀당 일을 단계적으로 줄인다.
//   0 전부 켬(해상도 1.5배 — 계단 현상이 줄어듦, 부드러운 그림자, 하늘빛 반사)   1 해상도 1.25배   2 해상도 1.0
//   3 그림자 단순하게(1024)   4 하늘빛 반사 끔   5 그림자 끔   6 해상도 0.75
// 느리면 한 단계 내리고, 여유가 크면(약 75fps 이상이 이어지면) 한 단계 올려 본다. 올렸다가 느려지면 되돌리고
// 그 단계를 '이 PC 의 한계'로 저장해 다시 시도하지 않는다(2026-11-13 사용자: "그래픽이 떨어져 보인다" — 82fps 로 여유가 있었음).
// 단계는 브라우저에 저장한다. ?q=0~6 으로 직접 정할 수 있다(이때는 자동 조절을 하지 않음).
const QUALITY_KEY = 'ulsan-story:quality:v2';
const QUALITY_FLOOR_KEY = 'ulsan-story:quality-floor:v2';
const QUALITY_MAX = 6;
const RATIOS = [1.5, 1.25, 1, 1, 1, 1, 0.75];
/** 그래픽 장치 이름(내장 그래픽이면 안티에일리어싱을 처음부터 끈다 — 픽셀당 비용이 가장 큰 항목이고 실행 중에는 못 바꿈) */
const gpuName = (() => {
  try {
    const gl = document.createElement('canvas').getContext('webgl');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    return String((ext && gl?.getParameter(ext.UNMASKED_RENDERER_WEBGL)) || '');
  } catch {
    return '';
  }
})();
// 'Radeon(TM) Graphics'(뒤에 모델 번호 없음)는 AMD 내장 그래픽이다(2026-11-13 사용자 집 PC)
const weakGpu = /Intel|SwiftShader|Mali|Adreno|PowerVR|Basic Render|Radeon\(TM\) Graphics/i.test(gpuName);
let quality = (() => {
  const q = new URLSearchParams(location.search).get('q');
  if (q !== null && /^[0-6]$/.test(q)) return Number(q);
  try {
    const raw = localStorage.getItem(QUALITY_KEY);
    const saved = Number(raw);
    if (raw !== null && Number.isInteger(saved) && saved >= 0 && saved <= QUALITY_MAX) return saved;
  } catch {
    /* 저장이 막혀도 그대로 진행 */
  }
  return weakGpu ? 3 : 0; // 내장 그래픽은 가볍게 시작해서 여유가 있으면 올라간다
})();
/** 올려 봤다가 느려서 되돌린 단계 + 1(이보다 좋은 화질은 다시 시도하지 않음) */
let qualityFloor = (() => {
  try {
    const v = Number(localStorage.getItem(QUALITY_FLOOR_KEY));
    return Number.isInteger(v) && v >= 0 && v <= QUALITY_MAX ? v : 0;
  } catch {
    return 0;
  }
})();
// 내장 그래픽은 MSAA 대신 해상도 배율(위 표의 0~1 단계)로 계단 현상을 줄인다
const useMsaa = !weakGpu && quality < 3;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: useMsaa, powerPreference: 'high-performance' });
} catch {
  document.body.insertAdjacentHTML('beforeend', '<div class="error">이 브라우저에서는 3D 화면(WebGL)을 열 수 없습니다.</div>');
  throw new Error('WebGL unavailable');
}
// 화면 해상도 배율은 품질 단계가 정한다(applyQuality)
let pixelRatio = Math.min(window.devicePixelRatio, 1.5);
renderer.setPixelRatio(pixelRatio);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.35;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false; // 그림자 그림은 두 프레임에 한 번만 새로 그린다(아래 반복문)

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x0b1424, 0.0016);
scene.background = skyTexture();

const camera = new THREE.PerspectiveCamera(45, 1, 1, 4000);
camera.position.set(-190, 95, 170);

const controls = new OrbitControls(camera, canvas);
controls.target.set(0, -6, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 15; // 장소마다 가까이 볼 수 있게
controls.maxDistance = 900;
controls.maxPolarAngle = Math.PI * 0.47;
// 자동 회전은 기본으로 끄고 '회전' 버튼으로만 켠다(2026-11-13 사용자 요청)
controls.autoRotate = false;
controls.autoRotateSpeed = 0.6;
// 조작(2026-11-13 사용자: "회전 중심이 어색하고 불편하다")
// - 휠 확대는 마우스가 가리키는 곳으로(회전 중심도 그쪽으로 따라감)
// - 옮기기(오른쪽 끌기)는 화면이 아니라 땅을 따라 → 회전 중심이 늘 땅 위에 있다
// - 두 번 누르면 그 자리가 회전 중심(아래 dblclick)
controls.zoomToCursor = true;
controls.screenSpacePanning = false;
// ?cam=x,y,z,tx,ty,tz — 시점을 고정해 캡처할 때(확인용). 자동 회전도 끈다.
{
  const v = new URLSearchParams(location.search).get('cam')?.split(',').map(Number);
  if (v?.length === 6 && v.every(Number.isFinite)) {
    camera.position.set(v[0], v[1], v[2]);
    controls.target.set(v[3], v[4], v[5]);
    controls.minDistance = 5;
    controls.autoRotate = false;
  }
}
const spinBtn = document.getElementById('spin');
function setSpin(on: boolean) {
  controls.autoRotate = on;
  spinBtn?.setAttribute('aria-pressed', String(on));
}
spinBtn?.addEventListener('click', () => setSpin(!controls.autoRotate));
controls.addEventListener('start', () => {
  setSpin(false);
  const hint = document.getElementById('hint');
  if (hint) hint.style.opacity = '0';
});

// ── 재질 ────────────────────────────────────────────────
const mat = {
  concrete: new THREE.MeshStandardMaterial({ color: 0x5d6168, roughness: 0.92 }),
  floor: new THREE.MeshStandardMaterial({ color: 0x4a4d52, roughness: 0.85 }),
  apron: new THREE.MeshStandardMaterial({ color: 0x454a52, roughness: 0.95 }),
  timber: new THREE.MeshStandardMaterial({ color: 0x6b4a2e, roughness: 0.8 }),
  steel: new THREE.MeshStandardMaterial({ color: 0x3a3f46, roughness: 0.6, metalness: 0.6 }),
  crane: new THREE.MeshStandardMaterial({ color: 0xd9a21b, roughness: 0.55, metalness: 0.3 }),
  craneDark: new THREE.MeshStandardMaterial({ color: 0x8a6a1a, roughness: 0.6, metalness: 0.3 }),
  safety: new THREE.MeshStandardMaterial({ color: 0xe0b020, roughness: 0.6 }),
  gate: new THREE.MeshStandardMaterial({ color: 0x5a3b33, roughness: 0.7, metalness: 0.4 }),
  lamp: new THREE.MeshStandardMaterial({ color: 0xfff1d0, emissive: 0xffe2a8, emissiveIntensity: 3 }),
  red: new THREE.MeshStandardMaterial({ color: 0xff2a1a, emissive: 0xff2a1a, emissiveIntensity: 2 }),
};

function box(w: number, h: number, d: number, m: THREE.Material | THREE.Material[], x: number, y: number, z: number, shadow = true) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  mesh.castShadow = shadow;
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}
/** 두 점 사이에 원통(케이블·트러스 부재)을 놓는다 */
function strut(a: THREE.Vector3, b: THREE.Vector3, r: number, m: THREE.Material, parent: THREE.Object3D = scene) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, dir.length(), 8), m);
  mesh.position.copy(a).addScaledVector(dir, 0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

// ── 안벽과 도크 구덩이 ────────────────────────────────────
// 구덩이를 비워 두고 둘레를 큰 상자 4개로 메운다. 상자의 안쪽 면이 곧 도크 벽이다.
const BASE = -DOCK.depth - 2;
const H = -BASE;
const FAR = 1800;

// 야드 바닥: 콘크리트 슬래브 질감(한 장 20 m)을 상자 크기에 맞춰 반복
const groundTex = concreteTexture();
function quay(x0: number, x1: number, z0: number, z1: number) {
  const tex = groundTex.clone();
  tex.repeat.set((x1 - x0) / 20, (z1 - z0) / 20);
  const top = new THREE.MeshStandardMaterial({ map: tex, color: 0xb2b1ac, roughness: 0.95 }); // W5: 푸른 기운을 뺀 중립 회색
  box(x1 - x0, H, z1 - z0, [mat.apron, mat.apron, top, mat.apron, mat.apron, mat.apron], (x0 + x1) / 2, BASE / 2, (z0 + z1) / 2, false);
}
const X_SEA = HALF_L + DOCK.gate;
quay(-FAR, X_SEA, -FAR, -HALF_W); // 왼쪽 안벽
quay(-FAR, X_SEA, HALF_W, FAR); // 오른쪽 안벽
quay(-FAR, -HALF_L, -HALF_W, HALF_W); // 도크 뒤쪽

// 도크 벽면(안쪽만 콘크리트 색으로 보이도록 얇은 판을 덧댐)
box(DOCK.length, DOCK.depth, 0.6, mat.concrete, 0, -DOCK.depth / 2, -HALF_W + 0.3, false);
box(DOCK.length, DOCK.depth, 0.6, mat.concrete, 0, -DOCK.depth / 2, HALF_W - 0.3, false);
box(0.6, DOCK.depth, DOCK.width, mat.concrete, -HALF_L + 0.3, -DOCK.depth / 2, 0, false);
// 바닥
box(DOCK.length, 1, DOCK.width, mat.floor, 0, -DOCK.depth - 0.5, 0, false);
// 벽의 단(알타)을 두 줄: 실제 도크처럼 계단식 벽면
for (const side of [-1, 1]) {
  box(DOCK.length, 0.8, 1.6, mat.concrete, 0, -DOCK.depth * 0.66, side * (HALF_W - 1.1), false);
  box(DOCK.length, 0.8, 1.6, mat.concrete, 0, -DOCK.depth * 0.33, side * (HALF_W - 1.1), false);
}

// 게이트(케이슨)
// 진수 때 떠서 비켜나도록 묶어 둔다(launch.ts)
const gate = new THREE.Group();
scene.add(gate);
gate.add(
  box(DOCK.gate, DOCK.depth + 1, DOCK.width + 4, mat.gate, HALF_L + DOCK.gate / 2, -DOCK.depth / 2 + 0.5, 0),
  box(DOCK.gate + 0.4, 0.4, DOCK.width + 4.4, mat.safety, HALF_L + DOCK.gate / 2, 1.2, 0),
);
// 게이트 손질(2026-11-22: 매끈한 갈색 상자였다): 양면의 세로 보강재, 가로 보강 띠, 위 통로 난간
{
  const gx = HALF_L + DOCK.gate / 2;
  const gw = DOCK.width + 4;
  for (const face of [-1, 1]) {
    for (let z = -gw / 2 + 2; z <= gw / 2 - 2; z += 4) gate.add(box(0.35, DOCK.depth + 0.6, 0.5, mat.steel, gx + face * (DOCK.gate / 2 + 0.17), -DOCK.depth / 2 + 0.5, z));
    for (const y of [-10, -5.5, -1]) gate.add(box(0.25, 0.5, gw, mat.steel, gx + face * (DOCK.gate / 2 + 0.12), y, 0));
    gate.add(box(0.08, 0.08, gw, mat.safety, gx + face * (DOCK.gate / 2 - 0.3), 2.5, 0, false));
    for (let z = -gw / 2 + 1; z <= gw / 2 - 1; z += 3) gate.add(box(0.08, 1.1, 0.08, mat.safety, gx + face * (DOCK.gate / 2 - 0.3), 1.95, z, false));
  }
}

// 도크 가장자리 안전 난간(노란 띠)과 바다 쪽 계선주
for (const side of [-1, 1]) box(DOCK.length, 0.5, 0.3, mat.safety, 0, 0.6, side * (HALF_W + 0.4), false);
box(0.3, 0.5, DOCK.width, mat.safety, -HALF_L - 0.4, 0.6, 0, false);
for (let z = -240; z < 240; z += 18) {
  if (Math.abs(z) < HALF_W + 4) continue;
  const b = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 1.2, 10), mat.steel);
  b.position.set(X_SEA - 1.5, 0.6, z);
  scene.add(b);
}

// 크레인 레일
for (const side of [-1, 1]) box(DOCK.length + 40, 0.3, 0.5, mat.steel, -20, 0.15, side * CRANE_RAIL_Z, false);

// 반목(킬 블록): 중심선 한 줄 + 양옆 빌지 블록
{
  const geo = new THREE.BoxGeometry(1.6, 1.8, 2.6);
  const xs: number[] = [];
  for (let x = -HALF_L + 18; x <= HALF_L - 18; x += 4) xs.push(x);
  const side: number[] = [];
  for (let x = -HALF_L + 30; x <= HALF_L - 30; x += 10) side.push(x);
  const count = xs.length + side.length * 2;
  const inst = new THREE.InstancedMesh(geo, mat.timber, count);
  const m4 = new THREE.Matrix4();
  let i = 0;
  for (const x of xs) inst.setMatrixAt(i++, m4.makeTranslation(x, -DOCK.depth + 0.9, 0));
  for (const x of side) for (const z of [-9, 9]) inst.setMatrixAt(i++, m4.makeTranslation(x, -DOCK.depth + 0.9, z));
  inst.castShadow = true;
  inst.receiveShadow = true;
  scene.add(inst);
}

// ── 골리앗 크레인 ─────────────────────────────────────────
const CRANE_H = 68;
const cabPosition = new THREE.Vector3(-6, CRANE_H - 2, -CRANE_RAIL_Z + 4);
const crane = new THREE.Group();
crane.position.x = -30;
scene.add(crane);
{
  const legW = 2.2;
  for (const side of [-1, 1]) {
    const z = side * CRANE_RAIL_Z;
    // 다리(A형): 아래로 벌어진 두 기둥
    for (const dx of [-9, 9]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(legW, CRANE_H, legW), mat.crane);
      const tilt = Math.atan2(dx * 0.55, CRANE_H);
      leg.position.set(dx * 0.72, CRANE_H / 2, z);
      leg.rotation.z = -tilt;
      leg.castShadow = true;
      crane.add(leg);
    }
    // 주행 대차
    const bogie = new THREE.Mesh(new THREE.BoxGeometry(24, 2.4, 3.2), mat.craneDark);
    bogie.position.set(0, 1.2, z);
    bogie.castShadow = true;
    crane.add(bogie);
    // 다리 사이 가로 보강재
    strut(new THREE.Vector3(-7.5, 20, z), new THREE.Vector3(7.5, 20, z), 0.5, mat.crane, crane);
    strut(new THREE.Vector3(-7.5, 20, z), new THREE.Vector3(5.5, 44, z), 0.4, mat.crane, crane);
  }
  // 거더 두 줄(상자형)과 위아래 연결
  for (const dx of [-2.6, 2.6]) {
    const g = new THREE.Mesh(new THREE.BoxGeometry(3.4, 6, CRANE_RAIL_Z * 2 + 14), mat.crane);
    g.position.set(dx, CRANE_H + 3, 0);
    g.castShadow = true;
    crane.add(g);
  }
  for (let z = -CRANE_RAIL_Z; z <= CRANE_RAIL_Z; z += 8) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.6, 0.8), mat.craneDark);
    t.position.set(0, CRANE_H + 6.3, z);
    crane.add(t);
  }
  // 운전실
  const cab = new THREE.Mesh(new THREE.BoxGeometry(3.4, 3, 3.4), mat.craneDark);
  cab.position.copy(cabPosition);
  crane.add(cab);
  const cabWin = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 1.4), mat.lamp);
  cabWin.position.set(-7.75, CRANE_H - 1.6, -CRANE_RAIL_Z + 4);
  cabWin.rotation.y = -Math.PI / 2;
  crane.add(cabWin);
  // 사람 크기의 디테일(화질 1차, 2026-11-14): 사다리·중간 발판·난간이 있어야 68 m 높이가 실감난다.
  // 전부 움직이지 않으므로 아래 mergeStatic(crane)에서 재질별로 합쳐진다.
  {
    const rail = (x: number, y: number, z: number, sx: number, sy: number, sz: number, m: THREE.Material = mat.crane) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m);
      b.position.set(x, y, z);
      crane.add(b);
    };
    for (const side of [-1, 1]) {
      const z = side * CRANE_RAIL_Z;
      const out = z + side * 1.9; // 다리 바깥쪽 면
      // 중간 발판 두 층(다리 사이 가로 보강재 높이 20 m, 그 위 44 m) + 바깥 난간
      for (const y of [20, 44]) {
        rail(0, y + 0.6, out, y === 20 ? 17 : 10, 0.25, 1.6, mat.craneDark);
        for (let x = -(y === 20 ? 8 : 4.5); x <= (y === 20 ? 8 : 4.5) + 0.01; x += 1.5) rail(x, y + 1.3, out + side * 0.75, 0.08, 1.1, 0.08);
        rail(0, y + 1.85, out + side * 0.75, y === 20 ? 17 : 10, 0.08, 0.08);
        rail(0, y + 1.25, out + side * 0.75, y === 20 ? 17 : 10, 0.06, 0.06);
      }
      // 사다리(대차 위 → 발판 → 발판 → 거더): 세로 레일 둘, 0.45 m 마다 디딤대, 2 m 마다 등받이 테
      const lx = side < 0 ? 3 : -3;
      const lz = out + side * 0.35;
      for (const [y0, y1] of [[2.4, 20.6], [20.6, 44.6], [44.6, CRANE_H]]) {
        const h = y1 - y0;
        for (const dx of [-0.3, 0.3]) rail(lx + dx, y0 + h / 2, lz, 0.07, h, 0.07, mat.steel);
        for (let y = y0 + 0.3; y < y1; y += 0.45) rail(lx, y, lz, 0.6, 0.05, 0.05, mat.steel);
        for (let y = y0 + 2.2; y < y1 - 0.5; y += 2) {
          rail(lx, y, lz + side * 0.75, 0.9, 0.05, 0.05, mat.steel);
          for (const dx of [-0.45, 0.45]) rail(lx + dx, y, lz + side * 0.38, 0.05, 0.05, 0.75, mat.steel);
        }
      }
    }
    // 거더 위 점검 통로의 난간(양쪽 바깥 모서리)
    const len = CRANE_RAIL_Z * 2 + 14;
    for (const x of [-4.4, 4.4]) {
      for (let z = -len / 2 + 0.5; z <= len / 2; z += 2.5) rail(x, CRANE_H + 6.85, z, 0.08, 1.1, 0.08);
      rail(x, CRANE_H + 7.4, 0, 0.08, 0.08, len);
      rail(x, CRANE_H + 6.9, 0, 0.06, 0.06, len);
    }
  }
  // 항공 장애등
  for (const z of [-CRANE_RAIL_Z - 6, CRANE_RAIL_Z + 6]) {
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 8), mat.red);
    light.position.set(0, CRANE_H + 7, z);
    crane.add(light);
  }
}
// 트롤리와 훅(3단계 애니메이션에서 움직일 부분)
const trolley = new THREE.Group();
trolley.position.set(0, CRANE_H + 6.6, 6);
crane.add(trolley);
{
  const body = new THREE.Mesh(new THREE.BoxGeometry(8, 2.4, 6), mat.craneDark);
  body.position.y = 1.2;
  body.castShadow = true;
  trolley.add(body);
}
const hook = new THREE.Group();
trolley.add(hook);
// 와이어: 길이 1 짜리 원통을 늘려 훅 높이에 맞춘다
const cables = [-1.2, 1.2].map((dx) => {
  const c = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1, 8), mat.steel);
  c.position.x = dx;
  c.castShadow = true;
  trolley.add(c);
  return c;
});
/** 훅 끝(블록 윗면이 닿는 점)이 훅 원점보다 이만큼 아래 */
const HOOK_DROP = 3.2;
const TROLLEY_Y = CRANE_H + 6.6;
/** 흔들림(크레인 운전 체험): 훅이 트롤리 바로 아래에서 벗어난 거리. 와이어도 그 방향으로 기운다 */
const swayAt = { x: 0, z: 0 };
const cableDir = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
function placeCables() {
  const y = hook.position.y;
  hook.position.x = swayAt.x;
  hook.position.z = swayAt.z;
  cables.forEach((c, i) => {
    c.position.set((i ? 1.2 : -1.2) + swayAt.x / 2, y / 2, swayAt.z / 2);
    cableDir.set(-swayAt.x, -y, -swayAt.z);
    c.scale.y = cableDir.length();
    c.quaternion.setFromUnitVectors(UP, cableDir.normalize());
  });
}
function setHookPoint(worldY: number) {
  hook.position.y = Math.min(-4, worldY + HOOK_DROP - TROLLEY_Y);
  placeCables();
}
function setSway(x: number, z: number) {
  swayAt.x = x;
  swayAt.z = z;
  placeCables();
}
const getHookPoint = () => TROLLEY_Y + hook.position.y - HOOK_DROP;
setHookPoint(TROLLEY_Y - 36 - HOOK_DROP);
{
  const block = new THREE.Mesh(new THREE.BoxGeometry(3.6, 2.4, 1.6), mat.safety);
  hook.add(block);
  const h = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.3, 8, 16, Math.PI * 1.4), mat.steel);
  h.position.y = -2.2;
  h.rotation.z = Math.PI * 0.8;
  hook.add(h);
}

// ── 조명 ──────────────────────────────────────────────────
const hemi = new THREE.HemisphereLight(0x5a6f9c, 0x1e1a16, 1.3);
scene.add(hemi);
/** 밤에만 보일 것(낮/밤 전환에서 숨김) */
const nightOnly: THREE.Object3D[] = [];
const moon = new THREE.DirectionalLight(0x9fb4e0, 0.9);
moon.position.set(300, 400, -200);
// 그림자는 해·달 하나만 만든다. 그림자 범위(±230 m)는 보는 곳을 따라 옮긴다(아래 반복문)
moon.castShadow = true;
moon.shadow.mapSize.set(2048, 2048);
moon.shadow.camera.left = moon.shadow.camera.bottom = -230;
moon.shadow.camera.right = moon.shadow.camera.top = 230;
moon.shadow.camera.near = 50;
moon.shadow.camera.far = 1200;
moon.shadow.bias = -0.0004;
moon.shadow.normalBias = 0.6;
scene.add(moon, moon.target);

// 투광등 탑 4개(두 개만 그림자) — 나트륨등 같은 따뜻한 색
const towers: [number, number, boolean][] = [
  [-70, -1, true],
  [50, 1, true],
  [-70, 1, false],
  [50, -1, false],
];
for (const [x, side, shadow] of towers) {
  const z = side * (CRANE_RAIL_Z + 10);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, 38, 10), mat.steel);
  pole.position.set(x, 19, z);
  scene.add(pole);
  const head = new THREE.Mesh(new THREE.BoxGeometry(5, 1.4, 1.2), mat.lamp);
  head.position.set(x, 38.5, z - side * 0.8);
  scene.add(head);
  const spot = new THREE.SpotLight(0xffc98a, 9000, 260, Math.PI / 4.2, 0.55, 2);
  spot.position.set(x, 38, z);
  spot.target.position.set(x + 10, -DOCK.depth, 0);
  void shadow; // 그림자는 해·달이 맡는다(lightpool.ts)
  scene.add(spot, spot.target);
  // 안개 속에서 보이는 빛줄기(실제 조명보다 좁게 그려야 자연스럽다)
  const beam = lightBeam(new THREE.Vector3(x, 37.8, z - side * 0.8), spot.target.position, 0.3, 0xffc98a);
  scene.add(beam);
  nightOnly.push(beam);
}
// 도크 바닥 작업등: 선체와 도크 벽 사이 통로에 두어 선체 옆면을 아래에서 비춘다
for (let x = -HALF_L + 25; x < HALF_L; x += 50)
  for (const z of [-20, 20]) {
    const p = new THREE.PointLight(0xffd9a0, 260, 55, 2);
    p.position.set(x, -DOCK.depth + 6, z);
    scene.add(p);
  }

// 성능: 여기까지 장면에 바로 붙인 움직이지 않는 것(도크 벽·난간·계선주·레일·투광등 기둥)과 크레인 몸체를 재질별로 합친다.
// 게이트·트롤리·훅은 그룹이라 건드리지 않는다
mergeStatic(scene, false);
mergeStatic(crane, false);

// ── 배 ────────────────────────────────────────────────────
// 반목 위에 앉힌다. 빈 도크에서 시작해 크레인이 블록을 하나씩 탑재한다.
// ?blocks=N: N개가 이미 앉은 상태에서 시작 · ?still: 애니메이션 없이 멈춤(기본은 전부 탑재된 모습)
const { ship, blocks } = buildBulkCarrier();
ship.position.y = -DOCK.depth + 1.8;
scene.add(ship);
// 도크 비계·대기 블록(W4, 2026-11-15). 블록이 제자리에 있을 때 경계를 재야 하므로 탑재 애니메이션보다 먼저
const dockWork = createDockWork(scene, blocks, { floorY: -DOCK.depth });
const params = new URLSearchParams(location.search);
const still = params.has('still');
// 2026-11-26 사용자: "시작은 무조건 0번에서" — 확인용 옵션(?cam=·?walk 등)이 없는 주소로 들어오면
// 지난번에 보던 장소(#id, 둘러보기가 써 넣음)를 버리고 0번 역사관부터 시작한다
if (!location.search && location.hash) history.replaceState(null, '', location.pathname);
/** 처음 연 주소의 #장소(둘러보기가 곧 #id 를 써 넣으므로 먼저 기억) */
const firstHash = location.hash;
const startPlaced = (() => {
  const n = Number(params.get('blocks'));
  if (Number.isInteger(n) && n >= 0 && n <= blocks.length && params.has('blocks')) return n;
  // 처음 보는 도크가 비어 있지 않게, 반쯤 올라간 선체에서 시작한다(2026-11-22: 빈 도크가 첫인상이었다)
  return still ? blocks.length : 13; // 오프닝 장면이 맞추는 수와 같게(12 로 시작하는 진입과 13 으로 시작하는 진입이 섞여 숫자가 오가 보였다)
})();
const hudStatus = document.getElementById('hud-status');
/** 크레인을 직접 운전하는 중인가(상태줄 문구용) */
let operating = false;
const welding = createWelding(scene);
const fog = createFog(scene);
const sound = createSound();
// 소리 버튼: 브라우저는 사용자가 누른 뒤에만 소리를 낼 수 있다
const soundBtn = document.getElementById('sound');
soundBtn?.addEventListener('click', async () => {
  const on = await sound.toggle();
  soundBtn.textContent = on ? '소리 끄기' : '소리 켜기';
  soundBtn.setAttribute('aria-pressed', String(on));
});
const erection = createErection(
  scene,
  { crane, trolley, setHookPoint, getHookPoint },
  blocks,
  {
    stageX: -140,
    groundY: 0,
    safeY: 60,
    placed: startPlaced,
    holdAtEnd: true,
    onStatus: (text, placed) => {
      // 직접 운전 중에는 자동 탑재 문구가 아니라 지금 직접 올리는 블록임을 밝힌다
      if (hudStatus) hudStatus.textContent = `도크: ${operating ? '직접 운전 · ' : ''}${text}`;
      // 도크 장소의 건조 시점 막대를 따라 움직인다(사용자가 끄는 중이면 건드리지 않음)
      const tl = document.getElementById('tl') as HTMLInputElement | null;
      if (tl && document.activeElement !== tl) {
        tl.value = String(placed);
        updateTimelineLabel(placed);
      }
    },
    onPlaced: (box) => {
      welding.start(box);
      sound.thump(nearness(camera.position.distanceTo(box.getCenter(new THREE.Vector3()))));
    },
  },
);
// 속도 버튼: ×1 → ×4 → ×16
let speed = 1;
const speedBtn = document.getElementById('speed');
speedBtn?.addEventListener('click', () => setSpeed(speed >= 16 ? 1 : speed * 4));
function setSpeed(n: number) {
  speed = n;
  if (speedBtn) {
    speedBtn.textContent = `장면 속도 ×${n}`;
    speedBtn.title = '공정 장면(탑재·공장·진수)이 진행되는 빠르기입니다. 빠른 견학 중에는 장소마다 저절로 바뀝니다.';
  }
}
if (still && speedBtn) speedBtn.hidden = true;
// ── 조선소 배치와 장소 둘러보기(P1) ─────────────────────────
const yard = buildYard(scene, STATIONS);
// ── 공장 장면(P2) — 카메라가 바라보는 곳 근처의 공장만 움직인다 ──
const stationAt = (id: string) => STATIONS.find((s) => s.id === id)!.at;
const factories: Record<string, { update: (machineDt: number, dt: number) => void; status: () => string }> = {
  cutting: createCutting(scene, stationAt('cutting')),
  assembly: createAssembly(scene, stationAt('assembly')),
  pe: createPE(scene, stationAt('pe')),
  paint: createPaint(scene, stationAt('paint')),
};
// 공장 사이 도로를 오가는 트랜스포터(블록 흐름)
const traffic = createTraffic(scene, STATIONS);
// 공장 네 곳의 동시 진행 블록과 현장 설비(W2, 2026-11-15) — 움직이지 않으므로 장소마다 합친 메시
const fillObstacles = fillFactories(scene, stationAt);
// 작업자 무리(W3, 2026-11-15): 부품별 InstancedMesh, 지금 보는 장소만 움직임
const crowd = createCrowd(scene, stationAt);
// ── 진수(P3-1): 탑재가 끝나면 물 채우기 → 게이트 열기 → 예인선 ──
let park0: number | null = null;
const launch = createLaunch({
  scene,
  ship,
  gate,
  dock: { x0: -HALF_L, x1: X_SEA, halfW: HALF_W, floorY: -DOCK.depth },
  seaY: SEA_Y,
  draft: 7,
  parkCrane: (k) => {
    if (park0 === null) park0 = crane.position.x;
    crane.position.x = THREE.MathUtils.lerp(park0, -140, k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);
    setHookPoint(THREE.MathUtils.lerp(getHookPoint(), 60, 0.08));
    if (k >= 1) park0 = null;
  },
  isComplete: () => erection.placed() >= blocks.length,
  restart: () => erection.setPlaced(0),
});
factories.launch = { update: () => {}, status: launch.status };
// ── 힘 보기(2026-11-22): 받침 반력 막대, 훅 하중, 진수 때 부력 몫(forces.ts) ──
const forceBtn = document.getElementById('force');
const forces = createForces({
  scene,
  camera,
  keelX: (() => {
    const xs: number[] = [];
    for (let x = -HALF_L + 18; x <= HALF_L - 18; x += 4) xs.push(x);
    return xs;
  })(),
  // 막대는 도크 옆 안벽 위(도크 가장자리와 크레인 레일 사이)에 세운다. 도크 안 통로에 두면 벽과 선체에 가려 안 보인다
  aisleZ: HALF_W + 3.6,
  floorY: 0.1,
  boxes: erection.boxes(),
  names: blocks.map((b) => b.name),
  placed: () => erection.placed(),
  hooked: () => (operate?.active ? -1 : erection.hooked()),
  hookPoint: (out) => out.set(crane.position.x, getHookPoint(), trolley.position.z),
  level: () => launch.level,
  keelY: -DOCK.depth + 1.8,
  draft: 7,
  hud: document.getElementById('force-hud')!,
  tag: document.getElementById('force-tag')!,
});
function setForces(v: boolean) {
  if (v && !forces.on) track('s:forces');
  forces.setOn(v);
  forceBtn?.setAttribute('aria-pressed', String(v));
  document.body.classList.toggle('forces', v);
  document.querySelector('#acts [data-act="force"]')?.setAttribute('aria-pressed', String(v));
  // 다른 장소에서 켜면 힘이 보이는 도크로 간다
  if (v && !['dock', 'launch'].includes(STATIONS[tour.current]?.id ?? '')) tour.go(DOCK_INDEX);
}
forceBtn?.addEventListener('click', () => setForces(!forces.on));
let dockFloorViewActive = false;

/** 3번 화물창 안으로 들어가 본다. 측벽이 아직이면 측벽까지 쌓은 상태로 옮긴다 */
function holdView() {
  dockFloorViewActive = false;
  const need = blocks.findIndex((b) => b.id === 'H3-P') + 1; // 3번 화물창 양쪽 측벽까지
  if (erection.placed() < need || launch.active) {
    launch.abort();
    erection.setPlaced(Math.max(need, 12));
  }
  tour.flyTo([-4, 5, -11], [9, -5, 14]);
  if (actsEl) {
    actsEl.innerHTML =
      '<p class="hold-cap"><b>3번 화물창 안</b> 옆 벽의 세로 뼈대가 측벽 늑골, 아래 비스듬한 판이 호퍼 탱크, 위 비스듬한 판이 톱사이드 탱크입니다.</p><button class="btn primary" type="button" id="hold-out">화물창에서 나가기</button>';
    actsEl.querySelector('#hold-out')!.addEventListener('click', () => {
      drawActs('dock');
      tour.go(DOCK_INDEX);
    });
  }
}

function gantryView() {
  dockFloorViewActive = false;
  const direction = crane.position.x <= 0 ? 1 : -1;
  // 거더 중심(±2.6m) 위에서 트롤리 상단(+9m)을 넘고, 거더 바깥으로 내려다본다.
  tour.flyTo([crane.position.x + direction * 2.6, CRANE_H + 12, -15], [direction * 55, -4, 0]);
}

function dockCabView() {
  if (operate.active) return;
  dockFloorViewActive = false;
  const eye = crane.localToWorld(cabPosition.clone());
  // 운전실 안쪽 벽(중심 +1.7m) 너머, 거더 하단(y=68m) 아래에서 도크 내 훅과 선체 사이를 본다.
  eye.z += 2.2;
  const load = hook.getWorldPosition(new THREE.Vector3());
  const hullX = THREE.MathUtils.clamp(load.x, SHIP.aftEnd + 20, SHIP.foreEnd - 20);
  const look = new THREE.Vector3(hullX, ship.position.y + SHIP.split, 0);
  if (erection.hooked() >= 0 && Math.abs(load.x) <= HALF_L && Math.abs(load.z) < HALF_W) {
    load.y -= HOOK_DROP / 2;
    const hullSight = look.clone().sub(eye);
    const distance = hullSight.length();
    const sight = load.sub(eye).normalize().add(hullSight.normalize());
    look.copy(eye).addScaledVector(sight, distance / 2);
  }
  tour.flyTo([eye.x, eye.y, eye.z], [look.x, look.y, look.z]);
}

function dockFloorView() {
  if (launch.active || launch.level > -DOCK.depth) launch.abort();
  dockFloorViewActive = true;
  // 반폭 16m 외판과 반폭 24m 도크 벽 사이에서 바닥 +1.7m에 서서 반지름 3m 빌지의 45° 꼭짓점을 비스듬히 본다.
  const halfBeam = SHIP.beam / 2;
  const bilgeOffset = 3 * Math.SQRT1_2;
  tour.flyTo(
    [-26, -DOCK.depth + 1.7, (halfBeam + HALF_W) / 2],
    [-12, ship.position.y + 3 - bilgeOffset, halfBeam - 3 + bilgeOffset],
  );
}
// ── 장소별 '해 볼 것' 단추(2026-11-22): 설명 패널을 접어 두므로 직접 해 보는 것은 화면 아래에 꺼내 둔다 ──
const ACTS: Record<string, { label: string; act: string; primary?: boolean; run: () => void }[]> = {
  dock: [
    { label: '크레인 운전해 보기', act: 'operate', primary: true, run: () => startOperate() },
    { label: '블록 세우기', act: 'turn', run: () => startTurn() },
    { label: '힘 보기', act: 'force', run: () => setForces(!forces.on) },
    { label: '화물창 안으로', act: 'hold', run: () => holdView() },
    { label: '골리앗 위에서', act: 'gantry-view', run: gantryView },
    { label: '운전실에서', act: 'cab-view', run: dockCabView },
    { label: '도크 바닥에서', act: 'dock-floor-view', run: dockFloorView },
  ],
  launch: [
    { label: '직접 진수해 보기', act: 'launchtry', primary: true, run: () => startLaunchTry() },
    { label: '자동 진수 바로 보기', act: 'launchnow', run: () => { launch.abort(); erection.setPlaced(blocks.length); } },
    { label: '힘 보기', act: 'force', run: () => setForces(!forces.on) },
  ],
  design: [{ label: '선체 굽힘 체험 열기', act: 'panel', primary: true, run: () => showExtra() }],
  gate: [{ label: '연혁과 모형 시점 보기', act: 'panel', run: () => showExtra() }],
};
/** 설명 패널을 펼치고 그 장소의 체험 칸으로 내려간다(이미 펼쳐져 있으면 누른 표시가 나게 잠깐 강조) */
function showExtra() {
  tour.setCollapsed(false);
  const el = document.getElementById('p-extra');
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  el.classList.remove('flash');
  void el.offsetWidth;
  el.classList.add('flash');
}
/** 화면 가운데 잠깐 뜨는 알림 */
let noticeTimer = 0;
function notice(text: string, sec = 4.5) {
  let el = document.getElementById('notice');
  if (!el) {
    el = document.body.appendChild(Object.assign(document.createElement('div'), { id: 'notice', className: 'tp-toast' }));
    el.setAttribute('role', 'status');
    el.style.whiteSpace = 'normal';
    el.style.textAlign = 'center';
  }
  el.textContent = text;
  el.classList.remove('out');
  window.clearTimeout(noticeTimer);
  noticeTimer = window.setTimeout(() => el!.classList.add('out'), sec * 1000);
}
const actsEl = document.getElementById('acts');
function drawActs(id: string) {
  if (!actsEl) return;
  const list = ACTS[id] ?? [];
  actsEl.innerHTML = list
    .map((a, i) => `<button class="btn${a.primary ? ' primary' : ''}" type="button" data-i="${i}" data-act="${a.act}"${a.act === 'force' ? ` aria-pressed="${forces.on}"` : ''}>${a.label}</button>`)
    .join('');
  actsEl.querySelectorAll<HTMLButtonElement>('button').forEach((b) => b.addEventListener('click', () => list[Number(b.dataset.i)].run()));
}
// ── 의장 안벽(P3-2): 진수한 배가 안벽에서 후행의장을 마치고 시운전 해역으로 ──
factories.quay = createQuay(scene, stationAt('quay'), { seaY: SEA_Y, draft: 7 });
// ── 시운전(P3-3): 속력, 선회, 지그재그, 긴급 정지 ──
factories.trial = createTrial(scene, { seaY: SEA_Y, draft: 7 });
// ── 명명식과 인도(P3-4): 병 깨기, 오색 종이, 뱃고동, 선주 깃발, 첫 항해 ──
factories.delivery = createDelivery(scene, stationAt('delivery'), { seaY: SEA_Y, draft: 7, onHorn: () => sound.horn() });
// ── 역사관(P4-1): 미포만 모형이 1972 → 1974 → 지금으로 바뀜 ──
const historyHall = createHistory(scene, stationAt('gate'));
factories.gate = historyHall;
// ── 설계동(P4-2): 수조의 배 모형으로 선체 거더 종굽힘 체험 ──
const designExp = createDesign(scene, [stationAt('design')[0], 0, 33]);
factories.design = designExp;
// ── 블록 인양 학습(P4-3): 도크 옆 빈 땅의 문형 크레인 ──
const liftLab = createLift(scene, [-30, 0, 80]);
// ── 블록 세우기(2026-11-22): 도크 옆 문형 크레인의 훅 두 개가 블록을 세우며 하중이 옮겨 가는 것을 보여 준다 ──
const turnover = createTurnover(scene, [42, 0, 88], document.getElementById('turn-hud')!, {
  onClose: () => {
    document.body.classList.remove('turning');
    tour.go(DOCK_INDEX);
  },
});
function startTurn() {
  track('s:turn');
  quick.stop();
  setWalk(false);
  tour.select(DOCK_INDEX);
  tour.flyTo(turnover.view.cam, turnover.view.look);
  document.body.classList.add('turning');
  turnover.open();
}
/** 지금 보는 장소만 움직인다(다른 장소는 멈춰 있다가 돌아오면 이어서). 2026-11-13 사용자: "모든 곳이 계속 움직이는 건 낭비" */
function updateFactories(id: string, machineDt: number, dt: number) {
  factories[id]?.update(machineDt, dt);
}
/** 도로 트랜스포터가 보이는 장소(정문 ~ 도크) */
const ROAD_STATIONS = new Set(['gate', 'design', 'cutting', 'assembly', 'pe', 'paint', 'dock']);
/** 건조 시점 막대 옆 글: 지금까지 앉은 블록 수와 단계 이름 */
function updateTimelineLabel(n: number) {
  const out = document.getElementById('tl-out');
  if (!out) return;
  const stage =
    n === 0 ? '착공 전' : n <= 7 ? '이중저·선수미 하부' : n <= 17 ? '측벽' : n <= 19 ? '선수미 상부' : n < 24 ? '갑판' : n < blocks.length ? '거주구·연돌' : '선체 완성';
  out.textContent = `${n}/${blocks.length} 블록 · ${stage}`;
}
// ── 통계(2026-11-27, 대시보드 /stats.html): 체험 시작과 끝냄, 견학 단계, 설명 깊이, 공유, 장소별 직접 본 시간 ──
// 이름 규칙은 서버 worker/index.ts 의 EV_KEY(s 시작, e 끝냄, q 견학 단계, lv 설명 깊이, sh 공유). 새 체험을 더하면 stats.html 의 이름표도
/** 시작했고 아직 끝내지 않은 체험(끝냄은 시작 하나에 한 번만 센다) */
const runs = new Set<string>();
function track(k: string) {
  try {
    net.track(k);
  } catch {
    /* 연결을 만들기 전 */
  }
}
function begin(id: string) {
  runs.add(id);
  track(`s:${id}`);
}
function done(id: string) {
  if (runs.delete(id)) track(`e:${id}`);
}
/** 빠른 견학 이번 바퀴에 이미 센 장소 */
const quickLegs = new Set<string>();
// 걷기 모드(아래에서 만든다. 둘러보기가 먼저 만들어져야 해서 변수만 먼저)
let walk: ReturnType<typeof createWalk> | null = null;
// ── 도크 밖 장소의 직접 해 보기(2026-11-22): 선상가열·용접 순서·블록 수평·스프레이 도장·경사 시험·조타·명명식 ──
// 장면을 만들므로 낮/밤 전환(createDayNight)보다 먼저 만든다
const tries = createTries({
  scene,
  camera,
  controls,
  el: document.getElementById('try-hud')!,
  defs: [...yardTries(stationAt), ...seaTries(stationAt)],
  sound: { thump: (v) => sound.thump(v), horn: () => sound.horn() },
  seaY: SEA_Y,
  cut: (fn) => cut(fn),
  onEnter: (d) => {
    begin(d.id);
    quick.stop();
    setWalk(false);
    tour.select(STATIONS.findIndex((s) => s.id === d.station));
    tour.stop();
    document.body.classList.add('operating', 'trying');
    yard.showLabels(false);
  },
  onExit: (d) => {
    document.body.classList.remove('operating', 'trying');
    yard.showLabels(true);
    tour.go(STATIONS.findIndex((s) => s.id === d.station));
  },
  onResult: (d) => done(d.id),
});
for (const d of tries.defs) (ACTS[d.station] ??= []).unshift({ label: d.label, act: 'try', primary: true, run: () => tries.start(d.id) });
/**
 * 직접 해 볼 수 있는 것과 그 자리(2026-11-22 사용자: "지금 어떤 체험이 가능한지 판단이 안 된다").
 * 지도에 노란 마름모(A, B, …)로 찍히고 지도 아래 목록에서 바로 시작한다. 걷기의 작은 지도와 단계 바 칩에도 표시된다.
 * 체험을 더하면 여기에 한 줄: 장소 id, 지도 위 자리 [x, z](다른 표시와 50 m 쯤 띄운다), 시작 함수.
 */
const EXPERIENCES: Experience[] = [
  { label: '한 척 짓기', hint: '블록을 올리고 이음을 맞춰 배 짓기', station: 'dock', at: [-62, 0], run: () => build.offer() },
  { label: '크레인 운전', hint: '적치장에서 블록을 걸어 직접 탑재', station: 'dock', at: [-140, -36], run: () => startOperate() },
  { label: '블록 세우기', hint: '훅 두 개의 하중이 옮겨 가는 것', station: 'dock', at: [42, 88], run: () => startTurn() },
  {
    label: '블록 인양 학습',
    hint: '와이어 각도와 장력',
    station: 'dock',
    at: [-30, 80],
    run: () => {
      track('s:lift');
      visit('dock');
      window.setTimeout(() => tour.flyTo(liftLab.view.cam, liftLab.view.look), 1800);
    },
  },
  { label: '힘 보기', hint: '받침 반력·훅 하중·선체 굽힘', station: 'dock', at: [62, -42], run: () => setForces(true) },
  { label: '직접 진수', hint: '물 채우기·게이트·예인', station: 'launch', at: [168, 0], run: () => startLaunchTry() },
  { label: '선체 굽힘 체험', hint: '파도와 화물에 따른 응력', station: 'design', at: [-588, 34], run: () => visit('design') },
  { label: '역사관 모형', hint: '1972 → 1974 → 지금', station: 'gate', at: [-588, -56], run: () => visit('gate') },
  ...tries.experiences,
];
/** 그 장소로 가서 설명 패널의 체험 칸을 연다 */
function visit(id: string) {
  quick.stop();
  setWalk(false);
  tour.go(STATIONS.findIndex((s) => s.id === id));
  showExtra();
}
const tour = createTour({
  experiences: EXPERIENCES,
  camera,
  controls,
  stations: STATIONS,
  placeCamera: !params.has('cam'),
  onLevel: (n) => track(`lv:${n}`),
  // 걷기 모드에서는 장소를 골라도 카메라를 날리지 않고 주인공을 그 장소 앞으로 옮긴다(-1 = 걷는 중인지 묻기만)
  intercept: (i) => {
    // 크레인 운전 중에는 방향키가 크레인 조작에 쓰인다
    if (i < 0 && document.body.classList.contains('operating')) return true;
    if (!walk?.active) return false;
    if (i >= 0) walk.teleport(i);
    return true;
  },
  renderExtra: (s, el) => {
    dockFloorViewActive = false;
    drawActs(s.id);
    if (factories[s.id]) {
      el.innerHTML = '<p class="live"><span>지금</span> <output id="live"></output></p>';
      if (s.id === 'gate') {
        // 모형의 시점 고르기(누르면 자동 순환을 멈춤)
        el.insertAdjacentHTML(
          'beforeend',
          `<div class="eras" role="group" aria-label="모형 시점">${ERAS.map(
            (e, i) => `<button class="btn" type="button" data-era="${i}" aria-pressed="${i === historyHall.era}">${e.label}</button>`,
          ).join('')}</div>`,
        );
        const btns = [...el.querySelectorAll<HTMLButtonElement>('[data-era]')];
        btns.forEach((b) => b.addEventListener('click', () => historyHall.setEra(Number(b.dataset.era), true)));
        historyHall.onEra((e) => btns.forEach((b, i) => b.setAttribute('aria-pressed', String(i === e))));
      }
      if (s.id === 'design') designExp.renderPanel(el);
      if (s.id === 'launch') {
        // 진수 직접 해보기(2026-11-15): 물 채우기·게이트·예인을 직접(launch-try.ts)
        el.insertAdjacentHTML(
          'beforeend',
          `<div class="op-entry"><h3>직접 진수해 보기</h3><p>급수 밸브를 열어 도크에 바닷물을 채우고, 배가 뜨면 게이트를 열어 예인선으로 끌어냅니다. 부력이 배 무게를 넘겨받는 과정을 숫자로 봅니다.</p>
          <button class="btn primary" id="ln-start" type="button">직접 진수해 보기</button></div>`,
        );
        el.querySelector('#ln-start')!.addEventListener('click', () => startLaunchTry());
        // 탑재를 다 기다리지 않고 진수를 보는 버튼(×1 로 26개를 쌓으면 17분쯤 걸림)
        el.insertAdjacentHTML('beforeend', '<button class="btn" id="launch-now" type="button">자동 진수 바로 보기</button>');
        el.querySelector('#launch-now')!.addEventListener('click', () => {
          launch.abort();
          erection.setPlaced(blocks.length);
        });
      }
      return;
    }
    if (s.id !== 'dock') return;
    el.innerHTML = `<label class="tl">건조 시점 <output id="tl-out"></output>
      <input type="range" id="tl" min="0" max="${blocks.length}" step="1" value="${erection.placed()}"></label>
      <div class="tl-marks"><span>착공</span><span>이중저</span><span>측벽</span><span>갑판</span><span>완성</span></div>`;
    const tl = el.querySelector('#tl') as HTMLInputElement;
    // 크레인 운전 체험(2026-11-14): 지금 차례의 블록을 직접 올린다
    el.insertAdjacentHTML(
      'beforeend',
      `<div class="op-entry"><h3>크레인 운전</h3><p>골리앗 크레인을 직접 몰아 다음 블록을 올립니다. 흔들림을 잡으며 녹색 윤곽에 맞춰 내려놓으세요.</p>
      <button class="btn primary" id="op-start" type="button">크레인 운전해 보기</button></div>`,
    );
    el.querySelector('#op-start')!.addEventListener('click', () => startOperate());
    // 선체 안 들여다보기(W4, 2026-11-15): 보통 시점에서는 횡격벽에 가려 화물창 늑골이 안 보인다
    el.insertAdjacentHTML(
      'beforeend',
      `<div class="op-entry"><h3>선체 안 들여다보기</h3><p>3번 화물창 안으로 들어가 측벽 늑골, 아래 호퍼 경사판, 위 톱사이드 탱크를 봅니다. 측벽이 아직이면 측벽까지 쌓은 상태로 옮깁니다.</p>
      <button class="btn" id="hold-view" type="button">화물창 안으로</button></div>`,
    );
    el.querySelector('#hold-view')!.addEventListener('click', () => holdView());
    liftLab.renderPanel(el, () => tour.flyTo(liftLab.view.cam, liftLab.view.look));
    tl.addEventListener('input', () => updateTimelineLabel(Number(tl.value)));
    tl.addEventListener('change', () => {
      launch.abort();
      erection.setPlaced(Number(tl.value));
    });
    updateTimelineLabel(erection.placed());
  },
});
// 두 번 누른 땅 위의 점을 회전 중심으로(카메라는 같은 만큼 따라 옮겨 보는 각도를 지킨다)
{
  const ray = new THREE.Raycaster();
  const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit = new THREE.Vector3();
  canvas.addEventListener('dblclick', (e) => {
    const r = canvas.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
    if (walk?.active || !ray.ray.intersectPlane(ground, hit)) return;
    const d = hit.clone().sub(controls.target);
    const cam = camera.position.clone().add(d);
    tour.flyTo([cam.x, cam.y, cam.z], [hit.x, hit.y, hit.z], 0.6);
  });
  // 전체 보기: 정문에서 안벽까지 한눈에
  document.getElementById('overview')?.addEventListener('click', () => {
    setWalk(false);
    tour.flyTo([-470, 430, 560], [-230, 0, 40]);
  });
}
// ?t=초: 애니메이션을 그만큼 미리 진행(특정 순간을 캡처할 때)
{
  const warm = Number(params.get('t'));
  if (!still && warm > 0)
    for (let x = 0; x < Math.min(warm, 3600); x += 0.05) {
      erection.update(0.05);
      welding.update(0.05);
      for (const f of Object.values(factories)) f.update(0.05, 0.05);
      traffic.update(0.05);
      launch.update(0.05);
    }
}

// ── 바다 ──────────────────────────────────────────────────
const sea = new THREE.Mesh(
  new THREE.PlaneGeometry(4000, 4000, 128, 128),
  new THREE.MeshStandardMaterial({ color: 0x16324f, roughness: 0.2, metalness: 0.3 }),
);
sea.rotation.x = -Math.PI / 2;
sea.position.set(X_SEA + 2000, SEA_Y, 0);
sea.receiveShadow = true;
scene.add(sea);
// 파도는 꼭짓점 셰이더에서 만든다(매 프레임 CPU 로 꼭짓점 2만여 개와 법선을 다시 계산하던 것을 없앰)
const seaTime = { value: 0 };
(sea.material as THREE.MeshStandardMaterial).onBeforeCompile = (sh) => {
  sh.uniforms.uTime = seaTime;
  sh.vertexShader =
    'uniform float uTime;\n' +
    sh.vertexShader
      .replace(
        '#include <beginnormal_vertex>',
        `float wx = position.x * 0.05 + uTime * 0.9;
         float wy = position.y * 0.07 + uTime * 1.3;
         vec3 objectNormal = normalize(vec3(-0.0175 * cos(wx), -0.0175 * cos(wy), 1.0));`,
      )
      .replace('#include <begin_vertex>', 'vec3 transformed = vec3(position.xy, position.z + sin(wx) * 0.35 + sin(wy) * 0.25);');
};

// ── 배경: 공장 건물, 먼 불빛, 별 ────────────────────────────
function windowTexture(cols: number, rows: number) {
  const c = document.createElement('canvas');
  c.width = cols * 8;
  c.height = rows * 12;
  const g = c.getContext('2d')!;
  g.fillStyle = '#23262c';
  g.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < cols; i++)
    for (let j = 0; j < rows; j++) {
      if (Math.random() < 0.35) continue;
      g.fillStyle = Math.random() < 0.8 ? '#ffd58a' : '#bfe0ff';
      g.globalAlpha = 0.5 + Math.random() * 0.5;
      g.fillRect(i * 8 + 2, j * 12 + 3, 4, 6);
    }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
// 배경 공장(장소 건물은 yard.ts). 장소 시야를 가리지 않게 도로에서 먼 곳에만 둔다
// 높이는 순서대로 30, 22, 22. 자리는 scenery.ts 의 BACK_SHEDS(적치 블록이 피해 가는 자리와 같은 값)
const sheds: [number, number, number, number, number][] = BACK_SHEDS.map(([x, z, l, w], i) => [x, z, l, i === 0 ? 30 : 22, w]);
for (const [x, z, l, h, w] of sheds) {
  // 골강판 벽 + 박공지붕
  const wall = (cols: number) => {
    const t = shedWallTextures(cols, '#7a8794');
    return new THREE.MeshStandardMaterial({ map: t.map, emissive: 0xffffff, emissiveMap: t.emissive, emissiveIntensity: 0.9, roughness: 0.6, metalness: 0.35 });
  };
  const long = wall(Math.round(l / 6));
  const short = wall(Math.round(w / 6));
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(l, h, w), [short, short, mat.apron, mat.apron, long, long]);
  mesh.position.set(x, h / 2, z);
  mesh.castShadow = mesh.receiveShadow = true;
  scene.add(mesh);
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.58, w * 0.58, l + 2, 3, 1), new THREE.MeshStandardMaterial({ color: 0x5f6b78, roughness: 0.6, metalness: 0.4, flatShading: true }));
  roof.rotation.z = Math.PI / 2;
  roof.rotation.y = 0;
  roof.scale.set(0.42, 1, 1);
  roof.position.set(x, h + w * 0.58 * 0.21 - 0.05, z);
  roof.castShadow = true;
  scene.add(roof);
}
{
  // 수평선 너머 도시 불빛
  const n = 900;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = (Math.random() - 0.5) * Math.PI * 0.9;
    const r = 1300 + Math.random() * 200;
    pos.set([X_SEA + Math.cos(a) * r, SEA_Y + 2 + Math.random() * Math.random() * 30, Math.sin(a) * r], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const city = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffcf8a, size: 3, sizeAttenuation: false, fog: false }));
  scene.add(city);
  nightOnly.push(city);
}
{
  const n = 1200;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const v = new THREE.Vector3().randomDirection();
    v.y = Math.abs(v.y) * 0.9 + 0.08;
    v.normalize().multiplyScalar(2500);
    pos.set([v.x, v.y, v.z], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const stars = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xdde6ff, size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.8 }));
  stars.userData.deepNight = true; // 노을에는 숨김(daynight.ts)
  scene.add(stars);
  nightOnly.push(stars);
}

function skyTexture() {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#03060f');
  grad.addColorStop(0.55, '#0b1426');
  grad.addColorStop(0.8, '#1a2338');
  grad.addColorStop(1, '#2a2730');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ── 풍경(디자인 고도화): 하늘빛 반사, 먼 산, 구름, 블록 적치장, 나무 ──
const scenery = createScenery(scene, renderer, STATIONS);
// ── 현장 자재(화질 1차): 강판·파이프·현장 사무소·가스통·케이블 드럼. 적치 블록 자리는 피한다 ──
const clutter = createClutter(scene, STATIONS, scenery.obstacles);
// ── 규모감(2026-11-22): 배경 도크·골리앗 열·의장선·앞바다의 배. 낮/밤 전환이 훑기 전에 만든다 ──
createBackdrop(scene, { seaY: SEA_Y, coastX: X_SEA });
// ── 걷기 모드: 주인공이 야드를 걸어서 견학 ──
const walkBtn = document.getElementById('walk');
walk = createWalk({
  scene,
  camera,
  controls,
  canvas,
  stations: STATIONS,
  obstacles: [...scenery.obstacles, ...clutter.obstacles, ...fillObstacles],
  hud: document.getElementById('walk-hud')!,
  dynamic: () => movers,
  onNear: (i) => tour.select(i),
  onArrive: (here) => {
    if (!document.body.classList.contains('walk-info')) tour.setCollapsed(!here || matchMedia('(max-width: 700px)').matches);
  },
  // E: 그 장소를 위에서 본다. '걸어서 견학'을 다시 누르면 선 자리로 돌아온다
  onLook: (i) => {
    setWalk(false);
    tour.go(i);
  },
  // 휴대폰: 걷는 동안 숨긴 설명 패널을 펼쳐 보여 준다. 패널의 '접기'나 다른 장소로 가면 닫힌다
  onInfo: (open) => {
    document.body.classList.toggle('walk-info', open);
    if (open) tour.setCollapsed(false);
  },
});
// 걷는 동안의 작은 지도(2026-11-22): 내 자리와 방향. 누르면 큰 지도(장소를 고르면 그 앞으로 옮겨짐)
const miniMap = createMiniMap({
  el: document.getElementById('minimap')!,
  stations: STATIONS,
  onOpen: () => document.getElementById('map-btn')?.click(),
  marks: EXPERIENCES.map((e) => e.at),
});
// ── 다중 접속(2026-11-17): 접속한 사람은 어느 장소에 있든 서로 보이고 핑·손 흔들기. 서버가 없으면 아무것도 안 보인다 ──
const mpEl = document.getElementById('mp');
const mpN = document.getElementById('mp-n');
/** 접속 수 글자와 단계 바 칩의 인원 표시(칩은 장소를 옮길 때 다시 그려지므로 0.3초마다도 맞춘다) */
function mpDraw() {
  if (!mpEl || !mpN) return;
  mpEl.hidden = !net.online;
  // 처음 들어온 사람: 서버에 붙으면 별명 창을 한 번 띄운다(임의로 지은 별명이 채워져 있고 고칠 수 있다)
  if (net.online && !net.me.name && !mpAsked && !document.body.classList.contains('opening-on')) {
    mpAsked = true;
    mpAsk?.();
  }
  const hereN = net.countAt(STATIONS[tour.current]?.id ?? '');
  const text = (net.all > 1 ? `접속 ${net.all}명` : '지금은 나 혼자') + (hereN ? ` · 이 장소에 ${hereN + 1}명` : '') + (peers.extra ? ` · 화면에는 가까운 30명` : '');
  if (mpN.textContent !== text) mpN.textContent = text;
  document.querySelectorAll<HTMLButtonElement>('#steps button[data-i]').forEach((b) => {
    const n = net.online ? net.countAt(STATIONS[Number(b.dataset.i)]?.id ?? '') : 0;
    if (n) b.dataset.n = String(n);
    else delete b.dataset.n;
  });
}
let mpAsked = false;
let mpAsk: (() => void) | null = null;
const net = createNet({
  onChange: mpDraw,
  onPing: (p, x, z) => peers.ping(nameOf(p), x, z),
  onWave: (p) => peers.wave(p.id),
});
const peers = createPeers(scene, camera, STATIONS, net);
if (params.has('mp')) Object.assign(window, { __net: net, __peers: peers });
document.getElementById('mp-ping')?.addEventListener('click', () => {
  // 걷는 중이면 내가 선 자리, 조감이면 내가 보는 곳
  const at = walk?.active ? walk.position : controls.target;
  net.ping(at.x, at.z);
  peers.ping('나', at.x, at.z);
});
document.getElementById('mp-wave')?.addEventListener('click', () => net.wave());
{
  const box = document.getElementById('mp-set');
  const name = document.getElementById('mp-name') as HTMLInputElement | null;
  const hel = document.getElementById('mp-helmets');
  const COLOR: Record<Helmet, [string, string]> = { yellow: ['#f2c21a', '노랑'], white: ['#f1f1ec', '하양'], orange: ['#e2661c', '주황'], blue: ['#2f62a8', '파랑'] };
  let pick: Helmet = net.me.helmet;
  if (box && name && hel) {
    hel.innerHTML = HELMETS.map((h) => `<button type="button" data-h="${h}" style="background:${COLOR[h][0]}" aria-label="${COLOR[h][1]}" aria-pressed="false"></button>`).join('');
    const mark = () => hel.querySelectorAll<HTMLButtonElement>('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.h === pick)));
    hel.addEventListener('click', (e) => {
      const h = (e.target as HTMLElement).dataset?.h as Helmet | undefined;
      if (h) {
        pick = h;
        mark();
      }
    });
    const head = document.getElementById('mp-head');
    const show = (first: boolean) => {
      name.value = net.me.name || randomName();
      pick = net.me.helmet;
      mark();
      if (head) head.textContent = first ? '다른 견학자에게 보일 별명을 정해 주세요' : '별명과 안전모 색';
      box.hidden = false;
    };
    mpAsk = () => show(true);
    document.getElementById('mp-me')?.addEventListener('click', () => show(false));
    document.getElementById('mp-roll')?.addEventListener('click', () => (name.value = randomName()));
    // 닫기: 별명이 아직 없으면 지어 준 별명을 그대로 쓴다(다시 묻지 않게). 있으면 바꾸지 않는다
    document.getElementById('mp-cancel')?.addEventListener('click', () => {
      if (!net.me.name) net.setMe(name.value || randomName(), pick);
      box.hidden = true;
    });
    document.getElementById('mp-ok')?.addEventListener('click', () => {
      net.setMe(name.value.trim() || randomName(), pick);
      box.hidden = true;
    });
    // 이름을 치는 동안 방향키·단축키가 화면으로 새지 않게
    name.addEventListener('keydown', (e) => e.stopPropagation());
  }
}
// 부딪히는 물건(고깔·드럼통·상자): 주인공, 자전거, 트랜스포터가 치면 밀려나고 구른다
const props = createProps(scene, STATIONS, walk.blocked);
/** 이번 프레임의 트랜스포터 자리와 속도(걷는 동안만 채움) */
let movers: ReturnType<typeof traffic.movers> = [];
function setWalk(on: boolean, at?: [number, number]) {
  if (!walk || walk.active === on) return;
  if (on) {
    quick.stop();
    tour.stop();
    walk.enter(at);
    // 보던 장소 앞에서 걷기 시작한다(2026-11-22 검토: 도크를 보다 눌러도 정문에 섰다). 이미 그 근처에 서 있었으면 그대로
    const st = STATIONS[tour.current];
    if (!at && st && Math.hypot(walk.position.x - st.at[0], walk.position.z - st.at[2]) > 160) walk.teleport(tour.current);
  } else {
    walk.exit();
    document.body.classList.remove('walk-info');
  }
  walkBtn?.setAttribute('aria-pressed', String(on));
  if (walkBtn) walkBtn.textContent = on ? '걷기 끝내기' : '걸어서 견학';
  if (!on) tour.go(tour.current); // 걷기를 끝내면 지금 장소의 조감 시점으로
}
walkBtn?.addEventListener('click', () => setWalk(!walk!.active));
document.getElementById('p-toggle')?.addEventListener('click', () => document.body.classList.remove('walk-info'));
// 휴대폰: 접힌 패널은 보이지 않고, '설명' 단추로 연다(2026-11-17)
document.getElementById('info-btn')?.addEventListener('click', () => tour.setCollapsed(false));
// ── 휴대폰 메뉴(2026-11-15 사용자: "휴대폰에서 각 메뉴가 직관적이지 않다"): 자주 안 쓰는 단추는 '메뉴' 안으로 ──
{
  const ctl = document.querySelector('.controls')!;
  const more = document.getElementById('more')!;
  const setOpen = (o: boolean) => {
    ctl.classList.toggle('open', o);
    more.setAttribute('aria-expanded', String(o));
    more.textContent = o ? '닫기' : '메뉴';
  };
  more.addEventListener('click', () => setOpen(!ctl.classList.contains('open')));
  // 2026-11-26 휴대폰 점검: 메뉴를 연 채 걷기·짓기에 들어가면 메뉴 단추가 조이스틱·걷기 단추 밑에 겹쳐 남았다 → 다른 모드로 가면 닫는다
  new MutationObserver(() => {
    if (ctl.classList.contains('open') && /\b(walking|operating|building|trying|turning|photo)\b/.test(document.body.className)) setOpen(false);
  }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  // 메뉴 안 단추를 누르면 닫는다(속도·소리처럼 여러 번 누르는 것은 그대로 둔다)
  for (const id of ['overview', 'menu-map', 'time']) document.getElementById(id)?.addEventListener('click', () => setOpen(false));
  document.getElementById('menu-map')?.addEventListener('click', () => document.getElementById('map-btn')?.click());
}
// ── 휴대폰(손가락): 단추 글자 앞 키 이름(Esc·Space·R·F·E·C)은 숨긴다(2026-11-26 휴대폰 점검: 키보드가 없는데 'Space 가열'·'R 올림') ──
if (matchMedia('(pointer: coarse)').matches) {
  const KEY = /^(Esc|Space|[A-Z])(\s·)?\s+(?=\S)/;
  const fix = (b: Element) => {
    const t = b.textContent ?? '';
    if (b.children.length === 0 && KEY.test(t)) b.textContent = t.replace(KEY, '');
  };
  // 안내 문장의 키보드 말도 단추 말로(2026-11-26: "이음 위에서 Space 를 누르고 있으면"). 단추 이름(가열·올림·내림…)과 맞춘다
  const WORDS: [RegExp, string][] = [
    [/방향키·WASD 이동 · R 올림 · F 내림 · Space 걸기·내려놓기 · 목표 근처에서 키를 놓으면/g, '화살표 단추로 이동 · 목표 근처에서 손을 떼면'],
    [/방향키로 밀고 R·F 로 올리고 내립니다/g, '화살표 단추로 밀고 올림·내림으로 올리고 내립니다'],
    [/방향키로/g, '화살표 단추로'],
    [/방향키 /g, '화살표 단추로 '],
    [/Space 를 누르고 있으면/g, '단추를 누르고 있으면'],
    [/\bR 로 /g, '올림으로 '],
    [/\bF 로 /g, '내림으로 '],
    [/\bF 를 /g, '내림을 '],
    [/Space 로 /g, ''],
    [/Space /g, ''],
  ];
  const words = (n: Node) => {
    const t = n.textContent ?? '';
    if (!/Space|방향키|[RF] [로를]/.test(t)) return;
    let s = t;
    for (const [re, to] of WORDS) s = s.replace(re, to);
    if (s !== t) n.textContent = s;
  };
  const walkText = (root: Node) => {
    if (root.nodeType === Node.TEXT_NODE) return words(root); // el.textContent = … 는 글자 마디 하나를 새로 붙인다
    const it = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = it.nextNode(); n; n = it.nextNode()) words(n);
  };
  document.querySelectorAll('button').forEach(fix);
  walkText(document.body);
  new MutationObserver((ms) => {
    for (const m of ms) {
      const el = m.target instanceof Element ? m.target : m.target.parentElement;
      const b = el?.closest('button');
      if (b) fix(b);
      if (m.type === 'characterData') words(m.target);
      for (const n of m.addedNodes) {
        if (n instanceof Element) n.querySelectorAll('button').forEach(fix);
        walkText(n);
      }
    }
  }).observe(document.body, { subtree: true, childList: true, characterData: true });
}
// 제목 띠 아래 끝(휴대폰에서 접속자 줄이 두 줄로 늘면 걷기 작은 지도를 그만큼 내린다)
{
  const hud = document.querySelector<HTMLElement>('.hud');
  if (hud) new ResizeObserver(() => document.body.style.setProperty('--hud-b', hud.getBoundingClientRect().bottom + 'px')).observe(hud);
}
// ── 크레인 운전 체험(2026-11-14): 자동 탑재를 멈추고 다음 블록을 직접 올린다(operate.ts) ──
const operate = createOperate({
  scene,
  camera,
  controls,
  rig: {
    crane,
    trolley,
    setHookPoint,
    getHookPoint,
    setSway,
    trolleyY: TROLLEY_Y,
    hookTop: TROLLEY_Y - 4 - HOOK_DROP,
    cab: cabPosition,
  },
  erection,
  dock: { x0: -HALF_L, x1: HALF_L, halfW: HALF_W, floorY: -DOCK.depth },
  travel: [-140, HALF_L - 10],
  trolleyZ: CRANE_RAIL_Z - 6,
  truck: { x: -140, hx: 17, hz: 5.5, top: 2.2 },
  hud: document.getElementById('op-hud')!,
  // 한 척 짓기 중의 '그만'·Esc 는 그쪽이 받는다(올린 블록이 있으면 건조 기록으로)
  onExit: () => (build.step === 'crane' ? build.leave() : stopOperate()),
  onLanded: (r) => {
    if (build.step !== 'crane') done('crane');
    build.onLanded(r);
  },
  onImpact: (speed, hard) => sound.thump(hard ? 1 : Math.min(0.6, 0.25 + speed)),
  onEmpty: () => build.onEmpty(),
  onSeated: () => build.onSeated(),
  fitStart: (name) => build.fitStart(name),
  wind: () => build.wind,
});
const DOCK_INDEX = STATIONS.findIndex((s) => s.id === 'dock');
function startOperate(quickMode = false) {
  if (!quickMode) begin('crane');
  quick.stop();
  setWalk(false);
  tour.select(DOCK_INDEX);
  tour.stop();
  launch.abort();
  operating = true;
  erection.resume(); // 지금 차례의 블록으로 상태줄을 다시 쓴다(자동 탑재가 돌리던 문구가 남지 않게)
  operate.enter({ quick: quickMode });
  document.body.classList.add('operating');
}
function stopOperate() {
  operate.exit();
  operating = false;
  erection.resume();
  document.body.classList.remove('operating');
  tour.go(DOCK_INDEX);
}
// ── 진수 직접 해보기(2026-11-15) ──
const LAUNCH_INDEX = STATIONS.findIndex((s) => s.id === 'launch');
const launchTry = createLaunchTry({
  hud: document.getElementById('ln-hud')!,
  launch,
  onExit: () => (build.step === 'launch' ? build.leave() : stopLaunchTry()),
  onResult: (r) => {
    if (build.step !== 'launch') done('launch');
    build.onLaunched(r);
  },
  onHorn: () => sound.horn(),
  prepare: () => {
    if (erection.placed() < blocks.length) erection.setPlaced(blocks.length);
  },
});
function startLaunchTry() {
  if (build.step !== 'launch') begin('launch');
  quick.stop();
  setWalk(false);
  tour.select(LAUNCH_INDEX);
  // 도크 전체와 게이트 밖 예인 구간이 한 화면에 들어오는 자리(바다 쪽 위에서)
  // 휴대폰(세로 화면)은 좁아서 더 멀리·높이서 봐야 게이트와 예인선이 들어온다
  if (matchMedia('(max-width: 700px)').matches) tour.flyTo([175, 260, 330], [125, -4, 0]);
  else tour.flyTo([150, 95, 175], [95, -4, 0]);
  document.body.classList.add('operating');
  if (erection.placed() < blocks.length) notice('남은 블록 탑재는 건너뛰고, 선체가 완성된 시점으로 넘어갑니다.');
  launchTry.start();
}
function stopLaunchTry() {
  launchTry.exit();
  launch.abort();
  if (build.step === 'off' || build.step === 'offer') notice('진수한 배는 의장 안벽으로 갔습니다. 도크에서는 다음 배의 탑재가 처음부터 시작됩니다.');
  document.body.classList.remove('operating');
  tour.go(LAUNCH_INDEX);
}
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && launchTry.active) stopLaunchTry();
});
if (params.has('launchtry')) setTimeout(() => startLaunchTry(), 500);
(window as unknown as { __launch: unknown }).__launch = launch;
// ── 빠른 견학 한 바퀴(2026-11-14 방향 검토): 들어오면 바로 약 5분에 가공부터 인도까지 ──
const quick = createQuickTour({
  stations: STATIONS,
  el: document.getElementById('qt-hud')!,
  go: (i) => tour.go(i),
  setSpeed,
  prepare: (id) => {
    if (id === 'dock') {
      // 마지막 블록 몇 개 전부터: 머무는 동안 다 쌓이고 진수로 이어진다
      launch.abort();
      erection.setPlaced(Math.max(0, blocks.length - 3));
    } else if (id === 'launch' && !launch.active && erection.placed() < blocks.length) erection.setPlaced(blocks.length);
  },
  more: [
    { label: '내 배 한 척 지어 보기', run: () => build.offer() },
    { label: '크레인 운전해 보기', run: () => startOperate() },
    { label: '직접 진수해 보기', run: () => startLaunchTry() },
    { label: '설계동 — 선체 거더 굽힘', run: () => tour.go(STATIONS.findIndex((s) => s.id === 'design')) },
    { label: '블록 인양 학습', run: () => { tour.go(DOCK_INDEX); setTimeout(() => tour.flyTo(liftLab.view.cam, liftLab.view.look), 1800); } },
  ],
  onStart: () => {
    tour.setCollapsed(true);
    quickLegs.clear();
    begin('quick');
  },
  onStop: () => tour.restore(),
  onLeg: (id) => {
    if (quickLegs.has(id)) return;
    quickLegs.add(id);
    track(`q:${id}`);
  },
  onDone: () => done('quick'),
});
// 주소에 장소(#id)나 확인용 옵션이 없으면 들어오자마자 시작. ?qt 는 언제나 시작(자동 시험용 window.__qt)
const QT_SKIP = ['operate', 'launchtry', 'walk', 'cam', 'still', 't', 'map', 'blocks', 'forces', 'turn', 'try'];
// ── 한 척 짓기(2026-11-22): 조작 체험 셋을 내 배 한 척을 짓는 순서로 꿴다. 들어오면 견학 대신 이것을 먼저 권한다 ──
/** 짧은 암전 컷: 화면을 가린 사이에 장면을 바꾼다(단계 사이를 카메라 비행 대신 컷으로) */
function cut(fn: () => void) {
  const f = document.getElementById('fade');
  if (!f) return fn();
  f.classList.add('on');
  window.setTimeout(() => {
    fn();
    window.setTimeout(() => f.classList.remove('on'), 140);
  }, 420);
}
const build = createBuild({
  el: document.getElementById('build-hud')!,
  startCrane: () => cut(() => startOperate(true)),
  nextBlock: () => cut(() => operate.nextBlock()),
  stopCrane: () => stopOperate(),
  startLaunch: () => startLaunchTry(),
  stopLaunch: () => stopLaunchTry(),
  tour: () => quick.start(),
  progress: () => ({ placed: erection.placed(), total: blocks.length }),
  sound: { on: () => sound.on, toggle: () => soundBtn?.click() },
  onEvent: (what) => {
    if (what === 'start') {
      begin('build');
      runs.add('build-sea');
    } else if (what === 'landed') done('build');
    else done('build-sea');
  },
});
document.getElementById('build-btn')?.addEventListener('click', () => (build.active ? build.quit() : build.offer()));
if (params.has('build')) Object.assign(window, { __build: build, __op: operate });
const autoTour = !firstHash && !QT_SKIP.some((k) => params.has(k));
// 처음 들어오면 오프닝 장면(아래)을 먼저 보여 주고, 끝나면 빠른 견학을 시작한다. ?qt 는 오프닝 없이 바로(자동 시험), ?open 은 오프닝만 확인
// 조작 체험(?operate, ?launchtry)과 함께 주면 체험이 먼저다: 둘이 같은 장면·카메라를 덮어쓰지 않게
const wantOpening = (params.has('open') && !params.has('operate') && !params.has('launchtry')) || (autoTour && !params.has('qt'));
/** ?open=초: 그 순간에서 멈춘다(캡처용). 잘못된 값·너무 큰 값으로 미리 돌리기가 끝나지 않는 일을 막는다 */
const openHold = Math.min(10, Math.max(0, Number(params.get('open')) || 0));
if (!wantOpening && params.has('qt')) quick.start();
else if (!wantOpening && (autoTour || params.has('build'))) build.offer();
if (params.has('qt')) (window as unknown as { __qt: unknown }).__qt = quick;
if (params.has('operate')) {
  startOperate();
  (window as unknown as { __op: unknown }).__op = operate;
}
// ?walk 또는 ?walk=x,z: 걷기 모드로 시작(확인용, 좌표를 주면 그 자리에서)
if (params.has('walk')) {
  const v = (params.get('walk') ?? '').split(',').map(Number);
  setWalk(true, v.length === 2 && v.every(Number.isFinite) ? [v[0], v[1]] : undefined);
  (window as unknown as { __walk: unknown }).__walk = walk; // 자동 시험이 주인공 자리를 읽음
}

// ── 조명 묶음(성능): 장소들이 만든 조명 20여 개를 고정 8개로 돌려 쓴다 ──
const lightPool = createLightPool(scene);
// ── 낮 / 밤 ─────────────────────────────────────────────
const dayNight = createDayNight({
  scene,
  renderer,
  hemi,
  moon,
  sea: sea.material as THREE.MeshStandardMaterial,
  nightOnly,
  setFog: fog.setVisible,
});
const timeBtn = document.getElementById('time');
function timeLabel() {
  if (!timeBtn) return;
  const next = dayNight.mode === 'day' ? '노을' : dayNight.mode === 'dusk' ? '밤' : '낮';
  timeBtn.textContent = `${next}${next === '노을' ? '로' : '으로'}`;
  timeBtn.setAttribute('aria-label', `${next} 장면으로 바꾸기`);
}
/** 해·달이 비추는 방향(낮/밤 전환이 정한 위치를 원점 기준 방향으로 기억) */
const sunOffset = new THREE.Vector3();
function timeChanged() {
  sunOffset.copy(moon.position).normalize().multiplyScalar(600);
  lightPool.setNight(dayNight.mode !== 'day');
  scenery.setTime(dayNight.mode);
  timeLabel();
}
timeBtn?.addEventListener('click', () => {
  dayNight.toggle();
  timeChanged();
});
timeChanged();

// ── 사진 모드와 시점 공유(2026-11-22, photo.ts) ──
const photo = createPhoto({
  bar: document.getElementById('photo-bar')!,
  canvas,
  render: () => renderer.render(scene, camera),
  link: () => {
    const r = (n: number) => String(Math.round(n * 10) / 10);
    const cam = [camera.position.x, camera.position.y, camera.position.z, controls.target.x, controls.target.y, controls.target.z].map(r).join(',');
    return `${location.origin}${location.pathname}?${dayNight.mode}&blocks=${erection.placed()}&cam=${cam}#${STATIONS[tour.current]?.id ?? 'dock'}`;
  },
  // 사진에는 장소 팻말을 넣지 않는다
  onToggle: (on) => yard.showLabels(!on),
  onShare: (how) => track(`sh:${how}`),
});
document.getElementById('photo')?.addEventListener('click', () => {
  quick.stop();
  photo.toggle();
});
if (params.has('forces')) setForces(true);
// ?try=이름: 그 체험을 연 채로 시작(heat weld level spray heel helm bottle). window.__tries.debug() 로 상태를 읽는다(자동 시험용)
if (params.has('try')) {
  Object.assign(window, { __tries: tries });
  window.setTimeout(() => tries.start(params.get('try') ?? ''), 600);
}
// ?turn: 블록 세우기를 연 채로 시작. ?turn=0~1 은 그 기울기에서 멈춤(확인용)
if (params.has('turn'))
  setTimeout(() => {
    startTurn();
    const v = params.get('turn');
    if (v) {
      turnover.hold(Number(v));
      // 캡처용: 카메라를 날리지 않고 바로 그 자리에
      tour.stop();
      camera.position.set(...turnover.view.cam);
      controls.target.set(...turnover.view.look);
      controls.update();
    }
  }, 300); // 확인용: 힘 보기를 켠 채로 시작
// ── 오프닝 장면(2026-11-22): 노을 진 도크에서 약 10초, 그다음 빠른 견학 ──
// ?open 은 언제나 오프닝, ?open=초 는 그 순간에서 멈춘다(캡처용)
const OPENING_SEC = 10;
const opening = createOpening({
  el: document.getElementById('opening')!,
  fade: document.getElementById('fade')!,
  sec: OPENING_SEC,
  hold: openHold > 0,
  onEnd: () => {
    dayNight.apply(openingBack, false);
    timeChanged();
    yard.showLabels(true);
    tour.stop();
    if (params.has('qt')) quick.start();
    else if (autoTour) {
      // 2026-11-26 휴대폰 점검: 첫 화면에 짓기 카드·체험 단추가 한꺼번에 떠 무엇부터 할지 몰랐다 →
      // 오프닝 다음은 0번부터 빠른 견학 하나만, '한 척 짓기'는 한 바퀴 끝에 권한다(단추로는 언제든)
      quick.start();
    }
    else tour.go(DOCK_INDEX, true);
  },
});
/** 오프닝이 끝나면 돌아갈 시간대(사용자가 고른 것, 없으면 낮) */
const openingBack = dayNight.mode;
if (wantOpening) {
  dayNight.apply('dusk', false);
  timeChanged();
  // 블록 하나가 훅에 매달려 자리로 가는 순간부터: 13개가 앉은 상태에서 다음 블록을 들어 올린 직후까지 미리 돌린다
  const hold = openHold;
  erection.setPlaced(13);
  for (let x = 0; x < 18.5 + hold; x += 0.05) erection.update(0.05);
  for (const b of erection.placedBoxes().slice(-3)) welding.start(b);
  for (let x = 0; x < 2; x += 0.05) welding.update(0.05);
  // 바다 쪽 게이트 옆 낮은 자리에서 선체를 올려다보다가, 도크 전체가 보이는 높이로 천천히 오른다
  camera.position.set(128, 7, 44);
  controls.target.set(20, 14, -4);
  controls.update();
  tour.flyTo([165, 62, 150], [-10, -4, 0], OPENING_SEC + 1.5);
  if (hold) {
    tour.update(hold);
    tour.stop();
  }
  yard.showLabels(false);
  opening.start();
}

// ── 화면 크기·반복 ────────────────────────────────────────
function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// ?stats: 성능 숫자(초당 프레임, 프레임당 계산 시간, 그리기 호출, 삼각형, 조명 수)를 화면 왼쪽 아래에
const statsEl = params.has('stats') ? document.body.appendChild(Object.assign(document.createElement('pre'), { id: 'stats' })) : null;
if (statsEl) statsEl.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:50;margin:0;padding:6px 8px;background:rgba(0,0,0,.7);color:#9f9;font:12px/1.4 monospace;pointer-events:none';
const stat = { frames: 0, js: 0, render: 0, since: performance.now() };

const clock = new THREE.Clock();
const tmp = new THREE.Vector3();
const shadowAt = new THREE.Vector3();
const slow = { sum: 0, n: 0 };
let qualityHold = 0;
/** 여유가 이어진 측정 횟수, 그리고 방금 올려 본 단계(시험 중이면 그 단계 번호) */
let fastRuns = 0;
let probing = -1;
/** 품질 단계를 적용한다(위 표). 단계가 높을수록 앞 단계의 것을 모두 포함 */
function applyQuality(level: number) {
  quality = level;
  pixelRatio = RATIOS[level];
  renderer.setPixelRatio(pixelRatio);
  resize();
  const type = level >= 3 ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
  const size = level >= 3 ? 1024 : 2048;
  let recompile = false;
  if (renderer.shadowMap.type !== type) {
    renderer.shadowMap.type = type;
    recompile = true;
  }
  if (moon.shadow.mapSize.x !== size) {
    moon.shadow.mapSize.set(size, size);
    moon.shadow.map?.dispose();
    moon.shadow.map = null;
  }
  moon.castShadow = level < 5;
  scenery.setReflection(level < 4);
  dayNight.setNoReflection(level >= 4);
  if (recompile)
    scene.traverse((o) => {
      const m = (o as THREE.Mesh).material;
      for (const x of Array.isArray(m) ? m : m ? [m] : []) x.needsUpdate = true;
    });
  try {
    localStorage.setItem(QUALITY_KEY, String(level));
  } catch {
    /* 저장이 막혀도 그대로 */
  }
}
applyQuality(quality);
/** 지금 장소에서 직접 본 초(장소를 옮기거나 60초가 차면 서버로) */
const dwell = { at: '', sec: 0 };
function dwellFlush(next = dwell.at) {
  if (dwell.at && dwell.sec >= 1) net.dwell(dwell.at, dwell.sec);
  dwell.at = next;
  dwell.sec = 0;
}
document.addEventListener('visibilitychange', () => document.hidden && dwellFlush());
window.addEventListener('pagehide', () => dwellFlush());
let frameNo = 0;
let lastCraneX = crane.position.x;
let lastHook = getHookPoint();
let liveTimer = 0;
renderer.setAnimationLoop(() => {
  const tFrame = performance.now();
  const rawDt = clock.getDelta();
  const dt = Math.min(rawDt, 0.1); // 탭을 오래 비웠다 돌아와도 한 번에 건너뛰지 않게
  const t = clock.elapsedTime;
  const here = STATIONS[tour.current]?.id ?? 'dock';
  const atDock = here === 'dock' || here === 'launch';
  if (!still) {
    // 도크의 탑재·용접·진수는 도크와 진수 장소에서만 진행
    if (operate.active) {
      operate.update(dt);
      welding.update(dt);
    } else if (atDock) {
      erection.update(dt * speed);
      welding.update(dt);
      launch.update(dt * speed, dt);
      launchTry.update(dt);
    }
    updateFactories(here, dt * speed, dt);
    crowd.update(dt, here);
    if (ROAD_STATIONS.has(here)) traffic.update(dt * speed);
  }
  liveTimer -= dt;
  if (liveTimer <= 0) {
    liveTimer = 0.3;
    mpDraw();
    if (launch.active && hudStatus) hudStatus.textContent = `도크: 진수 — ${launch.status()}`;
    // 도크 비계는 앉은 블록 옆에만, 진수 중에는 철거. 도크 바닥·비계 위 사람도 같이
    dockWork.update(erection.placed(), launch.active);
    crowd.setTag('dockfloor', !launch.active);
    for (const id of dockWork.ids) crowd.setTag(`blk:${id}`, dockWork.isUp(id));
    // 장소를 옮기면 둘러보기가 자동 회전을 끄므로 버튼 표시를 맞춘다
    if (spinBtn && spinBtn.getAttribute('aria-pressed') !== String(controls.autoRotate)) spinBtn.setAttribute('aria-pressed', String(controls.autoRotate));
    const live = document.getElementById('live');
    const f = factories[STATIONS[tour.current]?.id];
    if (live && f) live.textContent = f.status();
  }
  if (atDock) liftLab.update(dt);
  if (atDock) turnover.update(dt);
  tries.update(dt);
  forces.update(dt, atDock && !opening.active);
  if (dayNight.mode === 'night') fog.update(dt, t);
  // 다중 접속: 보고 있는 장소를 알리고, 걷는 동안만 자리를 보낸다
  net.setStation(here);
  // 통계: 사용자가 직접 본 장소의 시간(빠른 견학과 오프닝은 저절로 넘어가므로 뺀다)
  if (here !== dwell.at) dwellFlush(here);
  if (!quick.active && !opening.active && !document.hidden) {
    dwell.sec += Math.min(rawDt, 1); // 실제 시간(느린 기기는 프레임당 0.1초 제한 dt 가 실제보다 작다)
    if (dwell.sec >= 60) dwellFlush(here);
  }
  if (walk?.active) net.setPos(walk.position.x, walk.position.z, walk.heading, walk.riding ? 2 : 1);
  else net.setPos(0, 0, 0, 0);
  peers.update(dt);
  quick.update(dt);
  opening.update(dt);
  tour.update(dt);
  yard.fadeLabels(camera.position, tour.current);
  // 소리: 크레인이 움직이는 빠르기와 용접 아크까지의 거리로 크기를 정한다
  if (sound.on && dt > 0) {
    trolley.getWorldPosition(tmp);
    const move = Math.abs(crane.position.x - lastCraneX) + Math.abs(getHookPoint() - lastHook);
    const motor = Math.min(1, move / dt / 6) * nearness(camera.position.distanceTo(tmp) * 0.6);
    const arcs = welding.arcs();
    const nearest = arcs.reduce((m, p) => Math.min(m, camera.position.distanceTo(p)), Infinity);
    const weld = arcs.length ? nearness(nearest) * Math.min(1, 0.5 + arcs.length * 0.25) : 0;
    sound.update(dt, motor, weld);
  }
  lastCraneX = crane.position.x;
  lastHook = getHookPoint();
  seaTime.value = t; // 잔잔한 파도(셰이더)
  // 장애등 깜빡임
  mat.red.emissiveIntensity = Math.sin(t * 2.4) > 0.2 ? 2.4 : 0.15;
  // 훅이 바람에 살짝 흔들림
  hook.rotation.z = Math.sin(t * 0.7) * 0.02;
  if (walk?.active) {
    // 걷는 동안에는 길의 트랜스포터도 늘 움직이고, 물건이 부딪힌다
    if (!ROAD_STATIONS.has(here) && !still) traffic.update(dt * speed);
    movers = traffic.movers(dt);
    walk.update(dt);
    miniMap.update(walk.position.x, walk.position.z, walk.heading);
    const me = walk.pusher();
    props.update(dt, me ? [me, ...movers] : movers);
  }
  if (!operate.cabView) {
    const maxPolarAngle = controls.maxPolarAngle;
    if (dockFloorViewActive && !operate.active && !walk?.active && !launchTry.active) {
      controls.maxPolarAngle = Math.PI * 0.6;
    }
    controls.update();
    controls.maxPolarAngle = maxPolarAngle;
  }
  // 그림자 범위와 조명 묶음을 보는 곳으로. 그림자는 8 m 단위로만 옮겨 가장자리가 일렁이지 않게
  shadowAt.set(Math.round(controls.target.x / 8) * 8, 0, Math.round(controls.target.z / 8) * 8);
  moon.target.position.copy(shadowAt);
  moon.position.copy(shadowAt).add(sunOffset);
  lightPool.update(controls.target);
  if (++frameNo % 2 === 0) renderer.shadowMap.needsUpdate = true;
  // 품질 자동 조절: 최근 90프레임 평균으로 판단한다.
  // - 22 ms(약 45fps)보다 길면 한 단계 내린다. 방금 올려 본 단계였다면 그 단계를 한계로 저장한다.
  // - 13 ms(약 75fps)보다 짧은 측정이 3번 이어지면 한 단계 올려 본다(한계보다 좋게는 가지 않음).
  // 탭이 가려져 있을 때와 단계를 바꾼 직후(셰이더를 다시 만드는 동안)는 재지 않는다
  if (t > 3 && !document.hidden && t > qualityHold && !params.has('q')) {
    slow.sum += rawDt;
    if (++slow.n >= 90) {
      const avg = slow.sum / slow.n;
      if (avg > 0.022 && quality < QUALITY_MAX) {
        if (probing === quality) {
          qualityFloor = quality + 1;
          try {
            localStorage.setItem(QUALITY_FLOOR_KEY, String(qualityFloor));
          } catch {
            /* 저장이 막혀도 그대로 */
          }
        }
        probing = -1;
        fastRuns = 0;
        applyQuality(quality + 1);
        qualityHold = t + 2;
      } else if (avg < 0.013 && quality > qualityFloor) {
        if (++fastRuns >= 3) {
          fastRuns = 0;
          probing = quality - 1;
          applyQuality(quality - 1);
          qualityHold = t + 2;
        }
      } else {
        fastRuns = 0;
        if (avg <= 0.022) probing = -1; // 올려 본 단계가 버텼다
      }
      slow.sum = slow.n = 0;
    }
  }
  const tRender = performance.now();
  renderer.render(scene, camera);
  if (statsEl) {
    const now = performance.now();
    stat.frames++;
    stat.js += tRender - tFrame;
    stat.render += now - tRender;
    if (now - stat.since >= 1000) {
      let lights = 0;
      let meshes = 0;
      scene.traverseVisible((o) => {
        if ((o as THREE.Light).isLight && (o as THREE.Light).intensity > 0) lights++;
        if ((o as THREE.Mesh).isMesh) meshes++;
      });
      const i = renderer.info;
      statsEl.textContent = `fps ${((stat.frames * 1000) / (now - stat.since)).toFixed(0)} · 계산 ${(stat.js / stat.frames).toFixed(1)} ms · 그리기 ${(stat.render / stat.frames).toFixed(1)} ms
품질 ${quality}${useMsaa ? ' +AA' : ''} · 배율 ${pixelRatio} · ${gpuName.slice(0, 60)}
호출 ${i.render.calls} · 삼각형 ${i.render.triangles} · 조명 ${lights} · 메시 ${meshes} · 프로그램 ${i.programs?.length ?? 0}`;
      stat.frames = stat.js = stat.render = 0;
      stat.since = now;
    }
  }
});
