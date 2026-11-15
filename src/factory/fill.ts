/**
 * W2 동시 진행과 밀도(2026-11-15, PLAN.md 6장). 사용자: "안이 텅 비어 있다".
 * 공장마다 애니메이션되는 블록 하나 말고도, 단계가 다른 블록 여러 개와 현장 설비(강판 더미, 형강 랙, 핀 지그, 용접기,
 * 가스통 랙, 도료 드럼)를 고정 배치한다. 실제 공장은 여러 블록이 서로 다른 단계에서 동시에 작업된다.
 * 애니메이션 파일은 건드리지 않고, 크레인 경로·트랜스포터 출입로를 피한 자리에만 둔다(각 장소 주석).
 * 모두 움직이지 않으므로 장소마다 mergeStatic 으로 재질별 메시 하나로 합친다(그리기 호출 거의 안 늘어남).
 * 좌표는 각 공장 파일과 같은 '장소 중심 바닥 원점'.
 */
import * as THREE from 'three';
import { doubleBottom, sideShell, Parts, BM, seams } from '../blockgen';
import { mergeStatic } from '../merge';

const std = (color: number, roughness = 0.8, metalness = 0.2) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
const M = {
  steel: std(0x8a9099, 0.6, 0.5),
  dark: std(0x2a2e35, 0.85, 0.3),
  rack: std(0x2f5f9e, 0.7, 0.3),
  welder: std(0xd9731f, 0.6, 0.3),
  welder2: std(0x2f5f9e, 0.6, 0.3),
  yellow: std(0xd8b04a, 0.6, 0.3),
  gasG: std(0x3a7a4a, 0.5, 0.3),
  gasR: std(0x9c2a22, 0.5, 0.3),
  gasW: std(0xc9ccd0, 0.5, 0.3),
  timber: std(0x6b4a2e, 0.95, 0),
  stool: std(0x9a968c, 0.9, 0.05),
  drumB: std(0x2f5f9e, 0.6, 0.3),
  drumR: std(0xa33a2a, 0.6, 0.3),
  pallet: std(0x7a5a3a, 0.95, 0),
  cabinet: std(0xb33a2e, 0.6, 0.3),
  line: new THREE.MeshStandardMaterial({ color: 0xe0b52a, roughness: 0.8 }),
  painted: seams(std(0x4f6a88, 0.55, 0.3)),
  antifoul: seams(std(0x8c3027, 0.7, 0.15)),
  plate: BM.primer,
};

/** 원점에 만든 부품 묶음을 (x, z, 회전)에 둔다 */
function put(parent: THREE.Object3D, g: THREE.Object3D, x: number, z: number, rotY = 0, y = 0) {
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  parent.add(g);
  return g;
}
function cyl(p: Parts, m: THREE.Material, r: number, h: number, x: number, y: number, z: number, lying = false) {
  const g = new THREE.CylinderGeometry(r, r, h, 10);
  if (lying) g.rotateZ(Math.PI / 2);
  g.translate(x, y, z);
  p.add(m, g);
}

/** 강판 더미: 받침목 2개 위에 n 장, 조금씩 어긋나게 */
function plateStack(l: number, w: number, n: number) {
  const p = new Parts();
  for (const sx of [-1, 1]) p.box(M.timber, 0.3, 0.25, w + 0.4, sx * l * 0.3, 0.125, 0);
  for (let i = 0; i < n; i++) p.box(M.plate, l - (i % 3) * 0.3, 0.12, w - (i % 2) * 0.2, ((i * 37) % 5) * 0.06 - 0.12, 0.25 + 0.06 + i * 0.13, ((i * 53) % 5) * 0.05 - 0.1);
  return p.build();
}
/** 형강 랙: 기둥 3개, 팔 3단, 단마다 형강 묶음(ㄱ자 단면을 상자 둘로) */
function profileRack(len: number) {
  const p = new Parts();
  for (const x of [-len / 2 + 0.3, 0, len / 2 - 0.3]) {
    p.box(M.rack, 0.25, 3.2, 0.25, x, 1.6, -0.6);
    for (let k = 0; k < 3; k++) p.box(M.rack, 0.18, 0.18, 1.5, x, 0.6 + k * 1.05, 0.1);
  }
  for (let k = 0; k < 3; k++)
    for (let i = 0; i < 6; i++) {
      const y = 0.75 + k * 1.05;
      const z = -0.35 + i * 0.22;
      p.box(M.plate, len - 0.4, 0.04, 0.18, 0, y, z);
      p.box(M.plate, len - 0.4, 0.18, 0.04, 0, y + 0.09, z - 0.07);
    }
  return p.build();
}
/** 용접기 + 송급 장치 + 바닥에 늘어진 케이블 */
function welder(blue = false) {
  const p = new Parts();
  const m = blue ? M.welder2 : M.welder;
  p.box(m, 0.6, 0.8, 0.9, 0, 0.45, 0);
  p.box(M.dark, 0.62, 0.08, 0.92, 0, 0.04, 0);
  p.box(M.dark, 0.4, 0.3, 0.32, 0, 1.0, 0.15);
  // 케이블: 바닥에 꺾인 선
  const pts: [number, number][] = [[0.3, 0], [1.2, 0.5], [2.1, 0.2], [3.0, 0.9], [3.6, 0.6]];
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, z0] = pts[i];
    const [x1, z1] = pts[i + 1];
    const len = Math.hypot(x1 - x0, z1 - z0);
    const g = new THREE.BoxGeometry(len, 0.05, 0.05);
    g.rotateY(-Math.atan2(z1 - z0, x1 - x0));
    g.translate((x0 + x1) / 2, 0.03, (z0 + z1) / 2);
    p.add(M.dark, g);
  }
  return p.build();
}
/** 가스통 랙(산소·CO2·아세틸렌) */
function gasRack() {
  const p = new Parts();
  for (const x of [-0.9, 0.9]) p.box(M.yellow, 0.08, 1.7, 0.7, x, 0.85, 0);
  p.box(M.yellow, 1.9, 0.08, 0.7, 0, 1.2, 0);
  p.box(M.yellow, 1.9, 0.06, 0.7, 0, 0.03, 0);
  const ms = [M.gasG, M.gasG, M.gasW, M.gasR, M.gasG, M.gasW];
  ms.forEach((m, i) => cyl(p, m, 0.12, 1.5, -0.65 + (i % 3) * 0.65 - 0.1, 0.8, -0.15 + Math.floor(i / 3) * 0.3));
  return p.build();
}
/** 핀 지그: 곡면 블록 받침(높이가 곡면을 따라 바뀌는 기둥 격자) + 올려 둔 곡판 */
function pinJig(nx: number, nz: number, gap = 1.2, plate = true) {
  const p = new Parts();
  const hAt = (i: number, k: number) => 0.8 + 1.6 * ((k / (nz - 1) - 0.5) * 2) ** 2 + 0.3 * (i / (nx - 1));
  for (let i = 0; i < nx; i++)
    for (let k = 0; k < nz; k++) {
      const h = hAt(i, k);
      p.box(M.steel, 0.14, h, 0.14, (i - (nx - 1) / 2) * gap, h / 2, (k - (nz - 1) / 2) * gap);
    }
  p.box(M.dark, nx * gap + 0.6, 0.15, nz * gap + 0.6, 0, 0.075, 0);
  if (plate)
    for (let k = 0; k < nz - 1; k++) {
      // 곡판 조각: 두 기둥 줄 사이를 기울인 판으로
      const z0 = (k - (nz - 1) / 2) * gap;
      const h0 = hAt((nx - 1) / 2, k);
      const h1 = hAt((nx - 1) / 2, k + 1);
      const g = new THREE.BoxGeometry((nx - 1) * gap + 0.4, 0.06, Math.hypot(gap, h1 - h0));
      g.rotateX(Math.atan2(h1 - h0, gap));
      g.translate(0, (h0 + h1) / 2 + 0.05, z0 + gap / 2);
      p.add(M.plate, g);
    }
  return p.build();
}
/** 블록 받침(콘크리트·강재 정반) 4개 */
function stools(l: number, w: number, h = 0.9) {
  const p = new Parts();
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.box(M.stool, 1, h, 1, sx * l * 0.33, h / 2, sz * w * 0.3);
  return p.build();
}
/** 받침 위의 블록(단계가 다른 정지 블록) */
export function blockOnStools(kind: 'panel' | 'db' | 'side' | 'paintedL' | 'paintedDB', l: number, w: number) {
  const g = new THREE.Group();
  const h0 = 0.9;
  g.add(stools(l, w, h0));
  let b: THREE.Group;
  if (kind === 'panel') b = doubleBottom({ l, w, h: 2.2, openTop: true, lug: false }).build();
  else if (kind === 'db') b = doubleBottom({ l, w, h: 3 }).build();
  else if (kind === 'side') b = sideShell({ l, h: 7, w: 2.5, side: -1 }).build();
  else if (kind === 'paintedDB') b = doubleBottom({ l, w, h: 3, shell: M.antifoul, inner: M.painted, frame: M.painted }).build();
  else {
    b = doubleBottom({ l, w, h: 3, shell: M.antifoul, inner: M.painted, frame: M.painted }).build();
    const s = sideShell({ l, h: 7, w: 2.5, side: -1, shell: M.painted, frame: M.painted }).build();
    s.position.set(0, 3, -(w / 2 - 1.25));
    b.add(s);
  }
  b.position.y = h0;
  g.add(b);
  return g;
}
/** 도료 드럼 팔레트 */
function drumPallet(red = false) {
  const p = new Parts();
  p.box(M.pallet, 1.3, 0.15, 1.3, 0, 0.075, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(p, red ? M.drumR : M.drumB, 0.29, 0.88, sx * 0.31, 0.6, sz * 0.31);
  return p.build();
}
function cabinet() {
  const p = new Parts();
  p.box(M.cabinet, 1.2, 1.8, 0.55, 0, 0.9, 0);
  p.box(M.dark, 1.22, 0.04, 0.57, 0, 0.95, 0);
  return p.build();
}
/** 바닥 통로선(노란 줄): 공장이 '정리된 현장'으로 읽히게 */
function walkway(x0: number, x1: number, z: number) {
  const p = new Parts();
  for (const dz of [-1, 1]) p.box(M.line, x1 - x0, 0.02, 0.12, (x0 + x1) / 2, 0.215, z + dz * 1.0);
  return p.build();
}

/** 장소별 배치. 반환하는 그룹은 장소 중심 바닥이 원점 */
const LAYOUT: Record<string, (g: THREE.Group) => void> = {
  // 가공공장(80 × 40, 열린 면 +z, 카메라 +z). 강판 더미(-30,-12), 절단대 x -17~0, 팔레트(17,-10), 스크랩 통(17,9), 프레스 x 31.
  // 뒷벽 줄(z ≈ -17)과 앞쪽 낮은 자리에 채운다
  cutting: (g) => {
    put(g, profileRack(14), 2, -17);
    put(g, profileRack(10), 24, -17.5);
    put(g, plateStack(14, 7, 6), -30, -1.5);
    put(g, plateStack(12, 3.5, 4), -6, 12);
    put(g, plateStack(8, 4, 3), 4, 13);
    put(g, gasRack(), -37, 14, Math.PI / 2);
    put(g, cabinet(), -37, -17);
    put(g, cabinet(), -35.5, -17);
    put(g, walkway(-38, 38, 16.5), 0, 0);
  },
  // 조립공장(90 × 44, 열린 면 -z, 카메라 -z). 정반 x 28, 대조립 x 0, 의장 x -28(z 0), 자재 받침 z 13(x 10, -12), 배관대(-30, 15).
  // 트랜스포터 길 x ≈ -28, z 0 → -48 은 비운다. 뒤쪽 오른편과 앞쪽(낮게)에 단계가 다른 블록
  assembly: (g) => {
    put(g, blockOnStools('panel', 12, 8), 33, 15);
    put(g, blockOnStools('db', 12, 8), 12, -14);
    put(g, pinJig(6, 7), 38, -13);
    put(g, plateStack(12, 3, 7), -6, -15);
    put(g, profileRack(12), -42, 6, Math.PI / 2);
    put(g, welder(), 22, -5, 0.4);
    put(g, welder(true), 4, 6, 2.6);
    put(g, welder(), -5, -6, -0.3);
    put(g, welder(true), 26, 18, 3);
    put(g, gasRack(), 43, 3, Math.PI / 2);
    put(g, gasRack(), -43, -14, Math.PI / 2);
    put(g, cabinet(), 43, -6, Math.PI / 2);
    put(g, walkway(-44, 44, -19), 0, 0);
  },
  // PE장(90 × 50 야외, 카메라 +z 도로 쪽). 1차 받침 A(-20,-6), 2차 B(18,-6), 트랜스포터는 x -20·18 에서 z 62 → 14.
  // 뒷줄(z ≤ -15)과 양 끝(|x| ≥ 32)에 단계가 다른 블록과 지그
  pe: (g) => {
    put(g, blockOnStools('db', 14, 10), -26, -19);
    put(g, blockOnStools('side', 14, 4), -2, -20);
    put(g, blockOnStools('paintedL', 14, 10), 30, -18);
    put(g, pinJig(7, 8), 38, 10, Math.PI / 2);
    put(g, plateStack(12, 3, 8), -38, 12, Math.PI / 2);
    put(g, welder(), -10, -14, 1.2);
    put(g, welder(true), 12, -15, 2);
    put(g, gasRack(), -42, -8, Math.PI / 2);
  },
  // 도장공장(66 × 38, 열린 면 -z, 카메라 -z). 부스 x ±16(폭 22), 트랜스포터 x 16 → -16 → 밖(z -42).
  // 부스 사이(x -4~4, 블록이 지나가는 z ±5 밖)와 앞쪽(블록 길 z 0 과 트랜스포터 출입로 x ±16 사이)에 도료·장비, 건조 대기 블록
  paint: (g) => {
    put(g, drumPallet(), 0, 6.6);
    put(g, drumPallet(true), 1.8, 7.9);
    put(g, drumPallet(), -1.6, 7.9);
    put(g, blockOnStools('paintedDB', 12, 8), 0, -13);
    put(g, welder(true), 7, -9, 1.2); // 공기 압축기 자리(같은 상자형)
    put(g, drumPallet(true), 30, -14);
    put(g, drumPallet(), 30, -11.5);
    put(g, cabinet(), -31, -14, Math.PI / 2);
    put(g, gasRack(), -31, -10, Math.PI / 2);
  },
};

/** 벽이 없어 걸어 들어갈 수 있는 장소(걷기 모드가 물건을 피해야 함). 공장 건물 안은 layout.ts 의 SHEDS 가 막는다 */
const OPEN_YARD = new Set(['pe']);

/** 공장 네 곳에 채운다. stationAt(id) = 장소 중심. 돌려주는 값 = 걷기 모드 장애물 [x0, x1, z0, z1] */
export function fillFactories(scene: THREE.Scene, stationAt: (id: string) => [number, number, number]) {
  const obstacles: [number, number, number, number][] = [];
  const box = new THREE.Box3();
  for (const [id, lay] of Object.entries(LAYOUT)) {
    const at = stationAt(id);
    const g = new THREE.Group();
    g.name = `fill-${id}`;
    g.position.set(at[0], 0, at[2]);
    lay(g);
    scene.add(g);
    if (OPEN_YARD.has(id)) {
      g.updateMatrixWorld(true);
      for (const c of g.children) {
        box.setFromObject(c);
        if (box.max.y > 0.5) obstacles.push([box.min.x, box.max.x, box.min.z, box.max.z]);
      }
    }
    mergeStatic(g);
  }
  return obstacles;
}
