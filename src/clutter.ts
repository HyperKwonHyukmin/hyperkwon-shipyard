/**
 * 화질 1차(2026-11-14 검토: "넓은 회색 바닥이 비어 장난감 같다"): 야드 바닥을 채우는 현장 자재.
 * 실제 조선소는 강판·파이프·가스통·현장 사무소·케이블 드럼이 빽빽하다. 사람 크기의 물건이 있어야 크레인과 블록의 크기도 느껴진다.
 * - 작업 구역 하나 = 미리 정한 배치 하나(강판 적치, 파이프 랙, 현장 사무소, 드럼·자재 상자)
 * - 전부 움직이지 않고, 모양 4가지를 InstancedMesh 로 그린다(그리기 호출 4개)
 * - 자리는 고정 난수(누가 열어도 같은 야드). 걷기 모드는 구역 하나를 사각형 하나로 피한다
 * 실제 배치가 아니라 분위기를 위한 것이다(공개 자료 원칙).
 */
import * as THREE from 'three';
import { FOOTPRINT, onRoad, doorOf } from './layout';
import { VIEWPOINT } from './walk';
import { BACK_SHEDS } from './scenery';
import type { Station } from './content/stations';

let seed = 20261114;
function rnd() {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const rand = (a: number, b: number) => a + rnd() * (b - a);
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];

type Box4 = [number, number, number, number];
/** 놓을 물건 하나(구역 기준 좌표). kind: 상자, 원통(세움), 원통(눕힘, x 방향), 현장 사무소 */
interface Item {
  kind: 'box' | 'cyl' | 'lie' | 'office';
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  color: number;
}

const STEEL = [0x7d848c, 0x6e747b, 0x8a9097];
const PRIMER = [0x8b4a3a, 0x7a4334, 0x94573f];
const TIMBER = 0x5a4632;

/** 강판 적치: 받침목 위에 강판 묶음 3~4더미 */
function plates(): Item[] {
  const out: Item[] = [];
  const n = 3 + Math.floor(rnd() * 2);
  for (let i = 0; i < n; i++) {
    const z = (i - (n - 1) / 2) * 3.4;
    const l = rand(8, 12);
    const h = rand(0.3, 1.3);
    for (const x of [-l * 0.3, l * 0.3]) out.push({ kind: 'box', x, y: 0.15, z, sx: 0.3, sy: 0.3, sz: 2.8, color: TIMBER });
    out.push({ kind: 'box', x: 0, y: 0.3 + h / 2, z, sx: l, sy: h, sz: 2.4, color: pick(rnd() < 0.6 ? STEEL : PRIMER) });
  }
  return out;
}

/** 파이프 랙: 받침목 위에 파이프를 4·3·2 단으로 쌓음 */
function pipes(): Item[] {
  const out: Item[] = [];
  const r = rand(0.25, 0.45);
  const l = rand(7, 10);
  const color = pick([0x9aa1a8, 0x8b4a3a, 0xb8bcc0, 0x5f6c78]);
  for (const x of [-l * 0.32, l * 0.32]) out.push({ kind: 'box', x, y: 0.15, z: 0, sx: 0.3, sy: 0.3, sz: 4.2, color: TIMBER });
  const rows = [4, 3, 2];
  rows.forEach((cnt, row) => {
    for (let k = 0; k < cnt; k++) {
      const z = (k - (cnt - 1) / 2) * r * 2.05;
      out.push({ kind: 'lie', x: 0, y: 0.3 + r + row * r * 1.75, z, sx: l, sy: r * 2, sz: r * 2, color });
    }
  });
  // 옆에 짧은 배관 토막 몇 개(곧 블록에 들어갈 의장품)
  for (let k = 0; k < 3; k++)
    out.push({ kind: 'lie', x: rand(-3, 3), y: 0.2, z: 3.2 + k * 0.5, sx: rand(1.5, 3), sy: 0.4, sz: 0.4, color: 0x9aa1a8 });
  return out;
}

/** 현장 사무소(컨테이너) + 가스통 보관대 + 용접기 */
function office(): Item[] {
  const out: Item[] = [];
  out.push({ kind: 'office', x: 0, y: 1.3, z: 0, sx: 6, sy: 2.6, sz: 2.4, color: pick([0xe6e8ea, 0xdfe3e6, 0x3d6aa3]) });
  // 가스통 보관대: 철망 틀(어두운 상자 테두리 대신 낮은 받침 + 위 지붕) + 세운 통 6개
  out.push({ kind: 'box', x: 4.6, y: 0.08, z: 0, sx: 2.2, sy: 0.16, sz: 1.2, color: 0x3a3f45 });
  out.push({ kind: 'box', x: 4.6, y: 1.75, z: 0, sx: 2.3, sy: 0.08, sz: 1.3, color: 0x3a3f45 });
  for (const sx of [-1, 1]) out.push({ kind: 'box', x: 4.6 + sx * 1.1, y: 0.9, z: -0.6, sx: 0.08, sy: 1.8, sz: 0.08, color: 0x3a3f45 });
  for (let k = 0; k < 6; k++) {
    const gas = [0x2e7d32, 0x2e7d32, 0x9e9e9e, 0x37474f, 0xc62828, 0x1565c0][k];
    out.push({ kind: 'cyl', x: 3.8 + (k % 3) * 0.75, y: 0.86, z: k < 3 ? -0.25 : 0.3, sx: 0.24, sy: 1.4, sz: 0.24, color: gas });
  }
  // 용접기 3대
  for (let k = 0; k < 3; k++)
    out.push({ kind: 'box', x: -2 + k * 1.3, y: 0.4, z: 2.2, sx: 0.9, sy: 0.8, sz: 0.6, color: pick([0x1f5fae, 0xd4a017, 0x1f5fae]) });
  return out;
}

/** 케이블 드럼·자재 상자·팔레트 */
function drums(): Item[] {
  const out: Item[] = [];
  for (let k = 0; k < 3; k++) {
    const r = rand(0.7, 1.0);
    // 드럼은 눕혀서(축이 z) 세움: 'lie'는 x 축이라 sx 를 폭으로 쓰고 회전은 구역 회전에 맡긴다
    out.push({ kind: 'lie', x: -4 + k * 2.2, y: r, z: -1.5, sx: 0.8, sy: r * 2, sz: r * 2, color: 0x6b4f35 });
  }
  for (let k = 0; k < 4; k++)
    out.push({ kind: 'box', x: -3.5 + k * 1.6, y: 0.55, z: 1.4, sx: 1.3, sy: 1.1, sz: 1.0, color: 0x2d5fa0 });
  for (let k = 0; k < 2; k++) {
    out.push({ kind: 'box', x: 3.4, y: 0.08 + k * 0.16, z: -1 + k * 0.1, sx: 1.2, sy: 0.14, sz: 1.0, color: 0x9a7b55 });
  }
  out.push({ kind: 'box', x: 3.4, y: 0.75, z: -1, sx: 1.0, sy: 1.0, sz: 0.9, color: 0x8b8f94 });
  return out;
}

const KINDS = [plates, pipes, office, drums];

/** 구역을 놓으면 안 되는 자리(도크·인양 학습장·장소 앞 선배 자리 등) */
const NO_GO: Box4[] = [
  [-112, 120, -40, 40], // 도크와 크레인 레일
  [-48, -12, 58, 102], // 인양 학습장
  [-160, -118, -28, 28], // 트랜스포터 정류장(DOCK_STOP)
];

export function createClutter(scene: THREE.Scene, stations: Station[], avoid: Box4[]) {
  const taken: Box4[] = [];
  // 걷기 모드의 장소 앞 자리(선배와 바닥 표시)는 비워 둔다
  const spots: Box4[] = stations.map((s) => {
    const [x, z] = VIEWPOINT[s.id] ?? doorOf(s.at).front;
    return [x - 10, x + 10, z - 10, z + 10];
  });
  const hit = (b: Box4, list: Box4[], pad: number) =>
    list.some(([x0, x1, z0, z1]) => b[0] < x1 + pad && b[1] > x0 - pad && b[2] < z1 + pad && b[3] > z0 - pad);
  const free = (b: Box4) => {
    const cx = (b[0] + b[1]) / 2;
    const cz = (b[2] + b[3]) / 2;
    const hx = (b[1] - b[0]) / 2;
    const hz = (b[3] - b[2]) / 2;
    // 길(모서리 네 점과 가운데) — 6 m 띄움
    for (const [x, z] of [[cx, cz], [b[0], b[2]], [b[0], b[3]], [b[1], b[2]], [b[1], b[3]]]) if (onRoad(x, z, 6)) return false;
    for (const s of stations) {
      const f = FOOTPRINT[s.id];
      if (f && Math.abs(cx - s.at[0]) < f.hx + hx + 4 && Math.abs(cz - (s.at[2] + (f.dz ?? 0))) < f.hz + hz + 4) return false;
    }
    if (BACK_SHEDS.some(([sx, sz, l, w]) => Math.abs(cx - sx) < l / 2 + hx + 4 && Math.abs(cz - sz) < w / 2 + hz + 4)) return false;
    // 걸을 수 있는 땅 안(walk.ts 의 ground 와 같은 범위)
    if (b[0] < -744 || b[1] > 112 || b[2] < -288 || b[3] > 326) return false;
    return !hit(b, NO_GO, 0) && !hit(b, spots, 0) && !hit(b, avoid, 3) && !hit(b, taken, 4);
  };

  const placed: { items: Item[]; x: number; z: number; rot: number }[] = [];
  // 1) 도크 양옆 안벽(크레인 레일 바깥): 탑재를 기다리는 자재가 늘어선 곳
  for (const side of [-1, 1])
    for (let x = -96; x <= 100; x += 22) if (rnd() < 0.75) placed.push({ items: pick(KINDS)(), x: x + rand(-3, 3), z: side * rand(50, 58), rot: 0 });
  // 2) 야드 전체: 30 m 격자에서 빈 칸에 구역
  for (let x = -720; x < 100; x += 30)
    for (let z = -276; z <= 316; z += 30) if (rnd() < 0.42) placed.push({ items: pick(KINDS)(), x: x + rand(-6, 6), z: z + rand(-6, 6), rot: rnd() < 0.5 ? 0 : Math.PI / 2 });

  const boxes: Item[] = [];
  const cyls: Item[] = [];
  const lies: Item[] = [];
  const offices: Item[] = [];
  const zones: { items: Item[]; x: number; z: number; rot: number }[] = [];
  for (const p of placed) {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    const c = Math.cos(p.rot), s = Math.sin(p.rot);
    for (const it of p.items)
      for (const [dx, dz] of [[-it.sx / 2, -it.sz / 2], [it.sx / 2, it.sz / 2], [-it.sx / 2, it.sz / 2], [it.sx / 2, -it.sz / 2]]) {
        const wx = p.x + (it.x + dx) * c + (it.z + dz) * s;
        const wz = p.z - (it.x + dx) * s + (it.z + dz) * c;
        x0 = Math.min(x0, wx); x1 = Math.max(x1, wx); z0 = Math.min(z0, wz); z1 = Math.max(z1, wz);
      }
    const b: Box4 = [x0 - 0.5, x1 + 0.5, z0 - 0.5, z1 + 0.5];
    if (!free(b)) continue;
    taken.push(b);
    zones.push(p);
    for (const it of p.items) (it.kind === 'box' ? boxes : it.kind === 'cyl' ? cyls : it.kind === 'lie' ? lies : offices).push(it);
  }

  // ── 그리기: 모양별 InstancedMesh ──
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const qLie = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
  const up = new THREE.Vector3(0, 1, 0);
  const col = new THREE.Color();
  const make = (geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], n: number) => {
    const m = new THREE.InstancedMesh(geo, mat, Math.max(1, n));
    m.count = n;
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
    return m;
  };
  const boxMesh = make(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0.15 }), boxes.length);
  const cylMesh = make(new THREE.CylinderGeometry(0.5, 0.5, 1, 12), new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.3 }), cyls.length + lies.length);
  const officeMesh = make(new THREE.BoxGeometry(1, 1, 1), officeMaterials(), offices.length);

  const counters = { box: 0, cyl: 0, office: 0 };
  for (const z of zones) {
    const c = Math.cos(z.rot), s = Math.sin(z.rot);
    const zq = new THREE.Quaternion().setFromAxisAngle(up, z.rot);
    for (const it of z.items) {
      const pos = new THREE.Vector3(z.x + it.x * c + it.z * s, it.y, z.z - it.x * s + it.z * c);
      if (it.kind === 'lie') {
        // 원통의 축(y)을 x 로 눕힌 뒤 구역 회전. 길이 = sx, 지름 = sy
        q.copy(zq).multiply(qLie);
        m4.compose(pos, q, new THREE.Vector3(it.sy, it.sx, it.sz));
      } else m4.compose(pos, zq, new THREE.Vector3(it.sx, it.sy, it.sz));
      col.setHex(it.color).offsetHSL(0, 0, rand(-0.03, 0.03));
      const [mesh, i] =
        it.kind === 'box' ? [boxMesh, counters.box++] : it.kind === 'office' ? [officeMesh, counters.office++] : [cylMesh, counters.cyl++];
      mesh.setMatrixAt(i, m4);
      mesh.setColorAt(i, col);
    }
  }
  return { obstacles: taken };
}

/** 현장 사무소 겉면: 긴 면은 창 둘과 문, 짧은 면은 창 하나. 색은 인스턴스 색과 곱해진다 */
function officeMaterials() {
  const side = (door: boolean) => {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 112;
    const g = c.getContext('2d')!;
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 256, 112);
    // 골판 줄
    g.fillStyle = 'rgba(0,0,0,0.07)';
    for (let x = 0; x < 256; x += 8) g.fillRect(x, 0, 3, 112);
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(0, 104, 256, 8);
    const win = (x: number, w: number) => {
      g.fillStyle = '#2f3b47';
      g.fillRect(x, 30, w, 34);
      g.strokeStyle = '#d8dde2';
      g.lineWidth = 3;
      g.strokeRect(x, 30, w, 34);
    };
    if (door) {
      win(24, 52);
      win(176, 52);
      g.fillStyle = '#5b6672';
      g.fillRect(110, 26, 34, 78);
    } else win(14, 40);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.7, metalness: 0.1 });
  };
  const long = side(true);
  const short = side(false);
  const roof = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.8 });
  // BoxGeometry 면 순서: +x, −x, +y, −y, +z, −z
  return [short, short, roof, roof, long, long];
}
