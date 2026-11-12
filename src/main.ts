/**
 * 조선소 월드 — 1단계: 밤의 빈 드라이 도크.
 * 단위는 m. x = 도크 길이 방향(+x 쪽이 바다·게이트), z = 폭 방향, y = 위. 안벽 상면이 y = 0.
 * 배와 블록(2단계), 블록 탑재 애니메이션(3단계)은 아직 없다.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

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
controls.minDistance = 50;
controls.maxDistance = 520;
controls.maxPolarAngle = Math.PI * 0.47;
controls.autoRotate = !matchMedia('(prefers-reduced-motion: reduce)').matches;
controls.autoRotateSpeed = 0.25;
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
hook.position.y = -36;
trolley.add(hook);
for (const dx of [-1.2, 1.2]) strut(new THREE.Vector3(dx, 0, 0), new THREE.Vector3(dx, -36, 0), 0.12, mat.steel, trolley);
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
}
// 도크 바닥 작업등(작은 점광원들)
for (let x = -HALF_L + 25; x < HALF_L; x += 50) {
  const p = new THREE.PointLight(0xffd9a0, 300, 60, 2);
  p.position.set(x, -DOCK.depth + 6, 0);
  scene.add(p);
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
const sheds: [number, number, number, number, number][] = [
  // x, z, 길이, 높이, 폭
  [-210, -120, 120, 32, 50],
  [-200, 110, 90, 26, 44],
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
renderer.setAnimationLoop(() => {
  const t = clock.getElapsedTime();
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
