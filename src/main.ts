/**
 * 조선소 월드 — 1단계: 밤의 빈 드라이 도크.
 * 단위는 m. x = 도크 길이 방향(+x 쪽이 바다·게이트), z = 폭 방향, y = 위. 안벽 상면이 y = 0.
 * 배는 ship.ts(2단계). 블록 탑재 애니메이션(3단계)은 아직 없다.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { buildBulkCarrier } from './ship';
import { createErection } from './erection';
import { createWelding } from './welding';
import { createFog, lightBeam } from './atmosphere';
import { createSound, nearness } from './sound';
import { STATIONS } from './content/stations';
import { buildYard } from './yard';
import { createTour } from './tour';

const DOCK = { length: 220, width: 48, depth: 14, gate: 8 };
const HALF_L = DOCK.length / 2;
const HALF_W = DOCK.width / 2;
const SEA_Y = -3;
const CRANE_RAIL_Z = HALF_W + 8;

const canvas = document.getElementById('scene') as HTMLCanvasElement;
let renderer: THREE.WebGLRenderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
} catch {
  document.body.insertAdjacentHTML('beforeend', '<div class="error">이 브라우저에서는 3D 화면(WebGL)을 열 수 없습니다.</div>');
  throw new Error('WebGL unavailable');
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.35;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

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
controls.autoRotate = !matchMedia('(prefers-reduced-motion: reduce)').matches;
controls.autoRotateSpeed = 0.25;
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
controls.addEventListener('start', () => {
  controls.autoRotate = false;
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

function box(w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, shadow = true) {
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

function quay(x0: number, x1: number, z0: number, z1: number) {
  box(x1 - x0, H, z1 - z0, mat.apron, (x0 + x1) / 2, BASE / 2, (z0 + z1) / 2, false);
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
box(DOCK.gate, DOCK.depth + 1, DOCK.width + 4, mat.gate, HALF_L + DOCK.gate / 2, -DOCK.depth / 2 + 0.5, 0);
box(DOCK.gate + 0.4, 0.4, DOCK.width + 4.4, mat.safety, HALF_L + DOCK.gate / 2, 1.2, 0);

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
  cab.position.set(-6, CRANE_H - 2, -CRANE_RAIL_Z + 4);
  crane.add(cab);
  const cabWin = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 1.4), mat.lamp);
  cabWin.position.set(-7.75, CRANE_H - 1.6, -CRANE_RAIL_Z + 4);
  cabWin.rotation.y = -Math.PI / 2;
  crane.add(cabWin);
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
function setHookPoint(worldY: number) {
  const y = Math.min(-4, worldY + HOOK_DROP - TROLLEY_Y);
  hook.position.y = y;
  for (const c of cables) {
    c.position.y = y / 2;
    c.scale.y = -y;
  }
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
scene.add(new THREE.HemisphereLight(0x5a6f9c, 0x1e1a16, 1.3));
const moon = new THREE.DirectionalLight(0x9fb4e0, 0.9);
moon.position.set(300, 400, -200);
scene.add(moon);

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
  if (shadow) {
    spot.castShadow = true;
    spot.shadow.mapSize.set(1024, 1024);
    spot.shadow.camera.near = 10;
    spot.shadow.camera.far = 220;
    spot.shadow.bias = -0.0005;
  }
  scene.add(spot, spot.target);
  // 안개 속에서 보이는 빛줄기(실제 조명보다 좁게 그려야 자연스럽다)
  scene.add(lightBeam(new THREE.Vector3(x, 37.8, z - side * 0.8), spot.target.position, 0.3, 0xffc98a));
}
// 도크 바닥 작업등: 선체와 도크 벽 사이 통로에 두어 선체 옆면을 아래에서 비춘다
for (let x = -HALF_L + 25; x < HALF_L; x += 50)
  for (const z of [-20, 20]) {
    const p = new THREE.PointLight(0xffd9a0, 260, 55, 2);
    p.position.set(x, -DOCK.depth + 6, z);
    scene.add(p);
  }

// ── 배 ────────────────────────────────────────────────────
// 반목 위에 앉힌다. 빈 도크에서 시작해 크레인이 블록을 하나씩 탑재한다.
// ?blocks=N: N개가 이미 앉은 상태에서 시작 · ?still: 애니메이션 없이 멈춤(기본은 전부 탑재된 모습)
const { ship, blocks } = buildBulkCarrier();
ship.position.y = -DOCK.depth + 1.8;
scene.add(ship);
const params = new URLSearchParams(location.search);
const still = params.has('still');
const startPlaced = (() => {
  const n = Number(params.get('blocks'));
  if (Number.isInteger(n) && n >= 0 && n <= blocks.length && params.has('blocks')) return n;
  return still ? blocks.length : 0;
})();
const hudStatus = document.getElementById('hud-status');
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
    onStatus: (text, placed) => {
      if (hudStatus) hudStatus.textContent = `도크: ${text}`;
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
speedBtn?.addEventListener('click', () => {
  speed = speed >= 16 ? 1 : speed * 4;
  speedBtn.textContent = `×${speed}`;
});
if (still && speedBtn) speedBtn.hidden = true;
// ── 조선소 배치와 장소 둘러보기(P1) ─────────────────────────
buildYard(scene, STATIONS);
/** 건조 시점 막대 옆 글: 지금까지 앉은 블록 수와 단계 이름 */
function updateTimelineLabel(n: number) {
  const out = document.getElementById('tl-out');
  if (!out) return;
  const stage =
    n === 0 ? '착공 전' : n <= 7 ? '이중저·선수미 하부' : n <= 17 ? '측벽' : n <= 19 ? '선수미 상부' : n < 24 ? '갑판' : n < blocks.length ? '거주구·연돌' : '선체 완성';
  out.textContent = `${n}/${blocks.length} 블록 · ${stage}`;
}
const tour = createTour({
  camera,
  controls,
  stations: STATIONS,
  placeCamera: !params.has('cam'),
  renderExtra: (s, el) => {
    if (s.id !== 'dock') return;
    el.innerHTML = `<label class="tl">건조 시점 <output id="tl-out"></output>
      <input type="range" id="tl" min="0" max="${blocks.length}" step="1" value="${erection.placed()}"></label>
      <div class="tl-marks"><span>착공</span><span>이중저</span><span>측벽</span><span>갑판</span><span>완성</span></div>`;
    const tl = el.querySelector('#tl') as HTMLInputElement;
    tl.addEventListener('input', () => updateTimelineLabel(Number(tl.value)));
    tl.addEventListener('change', () => erection.setPlaced(Number(tl.value)));
    updateTimelineLabel(erection.placed());
  },
});
// ?t=초: 애니메이션을 그만큼 미리 진행(특정 순간을 캡처할 때)
{
  const warm = Number(params.get('t'));
  if (!still && warm > 0)
    for (let x = 0; x < Math.min(warm, 3600); x += 0.05) {
      erection.update(0.05);
      welding.update(0.05);
    }
}

// ── 바다 ──────────────────────────────────────────────────
const sea = new THREE.Mesh(
  new THREE.PlaneGeometry(4000, 4000, 160, 160),
  new THREE.MeshStandardMaterial({ color: 0x16324f, roughness: 0.2, metalness: 0.3 }),
);
sea.rotation.x = -Math.PI / 2;
sea.position.set(X_SEA + 2000, SEA_Y, 0);
sea.receiveShadow = true;
scene.add(sea);
const seaPos = sea.geometry.attributes.position as THREE.BufferAttribute;
const seaBase = Float32Array.from(seaPos.array as Float32Array);

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
const sheds: [number, number, number, number, number][] = [
  // x, z, 길이, 높이, 폭
  [-230, -140, 100, 30, 40],
  [-60, -150, 70, 22, 36],
];
for (const [x, z, l, h, w] of sheds) {
  const tex = windowTexture(Math.round(l / 3), Math.round(h / 4));
  const side = new THREE.MeshStandardMaterial({ color: 0xffffff, map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.9, roughness: 0.9 });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(l, h, w), [side, side, mat.apron, mat.apron, side, side]);
  mesh.position.set(x, h / 2, z);
  mesh.castShadow = true;
  scene.add(mesh);
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
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffcf8a, size: 3, sizeAttenuation: false, fog: false })));
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
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xdde6ff, size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.8 })));
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

const clock = new THREE.Clock();
const tmp = new THREE.Vector3();
let lastCraneX = crane.position.x;
let lastHook = getHookPoint();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1); // 탭을 오래 비웠다 돌아와도 한 번에 건너뛰지 않게
  const t = clock.elapsedTime;
  if (!still) {
    erection.update(dt * speed);
    welding.update(dt);
  }
  fog.update(dt, t);
  tour.update(dt);
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
  // 잔잔한 파도
  const arr = seaPos.array as Float32Array;
  for (let i = 0; i < arr.length; i += 3) {
    const x = seaBase[i];
    const y = seaBase[i + 1];
    arr[i + 2] = Math.sin(x * 0.05 + t * 0.9) * 0.35 + Math.sin(y * 0.07 + t * 1.3) * 0.25;
  }
  seaPos.needsUpdate = true;
  sea.geometry.computeVertexNormals();
  // 장애등 깜빡임
  mat.red.emissiveIntensity = Math.sin(t * 2.4) > 0.2 ? 2.4 : 0.15;
  // 훅이 바람에 살짝 흔들림
  hook.rotation.z = Math.sin(t * 0.7) * 0.02;
  controls.update();
  renderer.render(scene, camera);
});
