/**
 * 벌크선 한 척을 블록 단위로 만든다(수프라막스급, 길이 190 × 폭 32 × 깊이 18 m).
 * 좌표: 배의 기선(바닥) y = 0, 중심선 z = 0, x = 길이 방향(+x 가 선수).
 *
 * 블록 구성(26개)
 * - 화물창 5개 × (이중저, 좌현 측벽, 우현 측벽, 갑판) = 20
 * - 선미 하부·상부, 선수 하부·상부 = 4  (곡면은 단면을 이어 붙인 로프트)
 * - 거주구, 연돌 = 2
 * order 는 탑재 순서(3단계 애니메이션에서 이 순서로 올린다).
 */
import * as THREE from 'three';
import { mergeStatic } from './merge';

export const SHIP = {
  beam: 32,
  depth: 18,
  aftEnd: -95,
  holdStart: -55,
  holdLen: 24,
  holds: 5,
  foreEnd: 95,
  /** 하부 블록과 상부 블록이 나뉘는 높이(흘수선 근처) */
  split: 7,
};
const HB = SHIP.beam / 2;
const D = SHIP.depth;
const FORE_START = SHIP.holdStart + SHIP.holdLen * SHIP.holds; // 65

export interface Block {
  id: string;
  name: string;
  order: number;
  object: THREE.Group;
}

function std(color: number, roughness: number, metalness = 0.15) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness, side: THREE.DoubleSide });
}
const M = {
  antifouling: std(0x8c3027, 0.7),
  hull: std(0x2c4268, 0.5, 0.2),
  deck: std(0x4d6a46, 0.85),
  hatch: std(0x3b5b77, 0.6, 0.2),
  primer: std(0x7b8087, 0.8, 0.2),
  house: std(0xe6e6df, 0.6),
  funnel: std(0x2a2e35, 0.6, 0.2),
  band: std(0xdedcd2, 0.6),
  bronze: std(0xb08a3e, 0.35, 0.8),
  mast: std(0xd9d6cc, 0.6),
};
const EDGE = new THREE.LineBasicMaterial({ color: 0x0b0f16, transparent: true, opacity: 0.55 });

/** 면이 꺾이는 곳과 블록 경계에 선을 그어 블록 단위가 보이게 한다 */
function withEdges(mesh: THREE.Mesh) {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 28), EDGE));
  return mesh;
}
function boxIn(g: THREE.Group, w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number) {
  const mesh = withEdges(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m));
  mesh.position.set(x, y, z);
  g.add(mesh);
  return mesh;
}

// ── 평행부: 단면을 길이 방향으로 밀어낸 각기둥 ──────────────────
/** pts 는 (z, y) 단면 꼭짓점. x0~x1 로 밀어낸다 */
function prism(pts: [number, number][], x0: number, x1: number, m: THREE.Material) {
  // Shape 의 u 축을 -z 로 두면 rotateY(90°) 뒤에 z 가 제자리로 온다
  const shape = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(-z, y)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: x1 - x0, bevelEnabled: false, curveSegments: 1 });
  g.rotateY(Math.PI / 2);
  g.translate(x0, 0, 0);
  return withEdges(new THREE.Mesh(g, m));
}

/** 중앙부 반폭: 바닥 모서리(빌지)는 반지름 3 m 원호 */
const BILGE = 3;
function hbMid(y: number) {
  if (y >= BILGE) return HB;
  return HB - BILGE + Math.sqrt(Math.max(0, BILGE * BILGE - (BILGE - y) ** 2));
}
function bilgeArc(): [number, number][] {
  const out: [number, number][] = [];
  for (let a = -90; a <= 0; a += 15) {
    const r = (a * Math.PI) / 180;
    out.push([HB - BILGE + BILGE * Math.cos(r), BILGE + BILGE * Math.sin(r)]);
  }
  return out;
}

// ── 선수·선미: 단면을 이어 붙인 로프트 ─────────────────────────
type HalfBreadth = (x: number, y: number) => number;
interface LoftMats {
  side: THREE.Material;
  bottom: THREE.Material;
  top: THREE.Material;
}
/** 격자 점 (스테이션 i, 높이 k) 로 면을 만든다 */
function grid(n: number, count: number, at: (i: number, k: number) => [number, number, number]) {
  const pos: number[] = [];
  for (let i = 0; i <= n; i++) for (let k = 0; k < count; k++) pos.push(...at(i, k));
  const idx: number[] = [];
  for (let i = 0; i < n; i++)
    for (let k = 0; k < count - 1; k++) {
      const a = i * count + k;
      const b = (i + 1) * count + k;
      idx.push(a, b, b + 1, a, b + 1, a + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
/**
 * end(y) 는 그 높이에서 폭이 0 이 되는 x(선수재·선미 끝). 그 너머의 점은 끝선으로 당겨
 * 폭 0 인 점들이 중심선에 얇은 판처럼 남지 않게 한다.
 */
function loft(
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  hb: HalfBreadth,
  ybot: (x: number) => number,
  clampX: (x: number, y: number) => number,
  mats: LoftMats,
) {
  const n = 28;
  const K = 12;
  const st = Array.from({ length: n + 1 }, (_, i) => {
    const x = x0 + ((x1 - x0) * i) / n;
    const yb = Math.min(Math.max(y0, ybot(x)), y1);
    const ys = Array.from({ length: K + 1 }, (_, k) => yb + ((y1 - yb) * k) / K);
    const xs = ys.map((y) => clampX(x, y));
    return { xs, ys, ws: ys.map((y, k) => hb(xs[k], y)) };
  });
  const group = new THREE.Group();
  const add = (g: THREE.BufferGeometry, m: THREE.Material) => group.add(withEdges(new THREE.Mesh(g, m)));
  add(grid(n, K + 1, (i, k) => [st[i].xs[k], st[i].ys[k], st[i].ws[k]]), mats.side); // 우현
  add(grid(n, K + 1, (i, k) => [st[i].xs[k], st[i].ys[k], -st[i].ws[k]]), mats.side); // 좌현
  add(grid(n, 2, (i, k) => [st[i].xs[0], st[i].ys[0], (k ? 1 : -1) * st[i].ws[0]]), mats.bottom);
  add(grid(n, 2, (i, k) => [st[i].xs[K], st[i].ys[K], (k ? 1 : -1) * st[i].ws[K]]), mats.top);
  // 양 끝 마구리(블록이 따로 놓여도 속이 비어 보이지 않게)
  for (const s of [st[0], st[n]]) {
    const ring: number[] = [];
    for (let k = 0; k <= K; k++) ring.push(s.xs[k], s.ys[k], s.ws[k]);
    for (let k = K; k >= 0; k--) ring.push(s.xs[k], s.ys[k], -s.ws[k]);
    const cy = (s.ys[0] + s.ys[K]) / 2;
    const pos = [s.xs[K >> 1], cy, 0, ...ring];
    const m = ring.length / 3;
    const idx: number[] = [];
    for (let j = 0; j < m; j++) idx.push(0, 1 + j, 1 + ((j + 1) % m));
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    add(g, mats.side);
  }
  return group;
}

/** 선수: 아래쪽일수록 일찍 좁아져 경사진 선수재가 생긴다 */
const FORE_LEN = SHIP.foreEnd - FORE_START;
const foreReach = (y: number) => 0.55 + 0.45 * (y / D);
const foreHb: HalfBreadth = (x, y) => {
  const t = THREE.MathUtils.clamp((x - FORE_START) / FORE_LEN, 0, 1);
  return hbMid(y) * THREE.MathUtils.clamp(1 - (t / foreReach(y)) ** 2, 0, 1);
};
/** 선수재 선: 높이 y 에서 폭이 0 이 되는 x 보다 앞으로 나가지 않는다 */
const foreClamp = (x: number, y: number) => Math.min(x, FORE_START + FORE_LEN * Math.min(1, foreReach(y)));
/** 선미: 바닥이 들려 올라가고(런), 위쪽은 넓은 트랜섬으로 끝난다 */
const AFT_LEN = SHIP.holdStart - SHIP.aftEnd;
const aftT = (x: number) => THREE.MathUtils.clamp((SHIP.holdStart - x) / AFT_LEN, 0, 1);
const aftReach = (y: number) => 0.5 + 1.0 * (y / D);
const aftHb: HalfBreadth = (x, y) => hbMid(y) * THREE.MathUtils.clamp(1 - (aftT(x) / aftReach(y)) ** 2, 0, 1);
const aftClamp = (x: number, y: number) => Math.max(x, SHIP.holdStart - AFT_LEN * Math.min(1, aftReach(y)));
const aftBottom = (x: number) => Math.max(0, aftT(x) - 0.35) * 14;

// ── 창 불빛 질감(거주구) ────────────────────────────────────
function houseTexture(windows: number) {
  const c = document.createElement('canvas');
  c.width = windows * 16;
  c.height = 32;
  const g = c.getContext('2d')!;
  g.fillStyle = '#e6e6df';
  g.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < windows; i++) {
    const lit = Math.random() < 0.45;
    g.fillStyle = lit ? '#ffd890' : '#2b3442';
    g.fillRect(i * 16 + 4, 10, 9, 10);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ── 조립 ────────────────────────────────────────────────────
/** whole = true 면 배 전체를 재질별로 합친다(블록을 따로 다루지 않는 안벽·시운전·인도의 배). 아니면 블록 안에서만 합친다 */
export function buildBulkCarrier(whole = false) {
  const ship = new THREE.Group();
  const blocks: Omit<Block, 'order'>[] = [];
  const block = (id: string, name: string) => {
    const g = new THREE.Group();
    g.name = id;
    ship.add(g);
    blocks.push({ id, name, object: g });
    return g;
  };

  // 화물창 단면
  const arc = bilgeArc();
  const bottomPts: [number, number][] = [
    ...arc,
    [HB, SHIP.split],
    [HB - 1, SHIP.split],
    [10, 2],
    [-10, 2],
    [-(HB - 1), SHIP.split],
    [-HB, SHIP.split],
    ...arc.map(([z, y]) => [-z, y] as [number, number]).reverse(),
  ];
  const sidePts = (s: 1 | -1): [number, number][] =>
    (
      [
        [HB, SHIP.split],
        [HB, D],
        [10, D],
        [HB - 1, 13],
        [HB - 1, SHIP.split],
      ] as [number, number][]
    ).map(([z, y]) => [s * z, y]);

  for (let r = 0; r < SHIP.holds; r++) {
    const no = SHIP.holds - r; // 1번 화물창이 선수 쪽
    const x0 = SHIP.holdStart + r * SHIP.holdLen;
    const x1 = x0 + SHIP.holdLen;
    const L = x1 - x0;
    const xm = (x0 + x1) / 2;

    const bottom = block(`H${no}-DB`, `${no}번 화물창 이중저`);
    bottom.add(prism(bottomPts, x0, x1, M.antifouling));
    boxIn(bottom, 0.8, 15.5, 27, M.primer, x0 + 0.4, 2 + 15.5 / 2, 0); // 횡격벽

    for (const s of [1, -1] as const) {
      const side = block(`H${no}-${s > 0 ? 'S' : 'P'}`, `${no}번 화물창 ${s > 0 ? '우현' : '좌현'} 측벽`);
      side.add(prism(sidePts(s), x0, x1, M.hull));
      boxIn(side, L, 0.06, 6, M.deck, xm, D + 0.03, s * 13); // 측벽 위 갑판면
    }

    const deck = block(`H${no}-DK`, `${no}번 화물창 갑판·해치`);
    for (const s of [1, -1]) boxIn(deck, L, 0.4, 3, M.deck, xm, D - 0.2, s * 8.5);
    for (const x of [x0 + 1.5, x1 - 1.5]) boxIn(deck, 3, 0.4, 14, M.deck, x, D - 0.2, 0);
    for (const s of [1, -1]) boxIn(deck, L - 6, 2, 0.4, M.deck, xm, D + 1, s * 7.2);
    for (const x of [x0 + 3.2, x1 - 3.2]) boxIn(deck, 0.4, 2, 14.8, M.deck, x, D + 1, 0);
    boxIn(deck, L - 5.6, 0.7, 7.5, M.hatch, xm, D + 2.35, 3.8);
    boxIn(deck, L - 5.6, 0.7, 7.5, M.hatch, xm, D + 2.35, -3.8);
  }

  // 선미
  const aftLow = block('AFT-L', '선미 하부(기관실·타·프로펠러)');
  aftLow.add(loft(SHIP.aftEnd, SHIP.holdStart, 0, SHIP.split, aftHb, aftBottom, aftClamp, { side: M.antifouling, bottom: M.antifouling, top: M.primer }));
  {
    // 프로펠러 축 보스, 프로펠러(4날개), 타
    const boss = withEdges(new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.4, 6, 16), M.antifouling));
    boss.rotation.z = Math.PI / 2;
    boss.position.set(-84, 4, 0);
    aftLow.add(boss);
    const prop = new THREE.Group();
    prop.position.set(-88, 4, 0);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 1.6, 16), M.bronze);
    hub.rotation.z = Math.PI / 2;
    prop.add(hub);
    for (let i = 0; i < 4; i++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.35, 3.0, 1.5), M.bronze);
      blade.position.y = 1.9;
      const arm = new THREE.Group();
      arm.rotation.x = (i * Math.PI) / 2;
      blade.rotation.y = 0.5;
      arm.add(blade);
      prop.add(arm);
    }
    prop.traverse((o) => ((o as THREE.Mesh).castShadow = true));
    aftLow.add(prop);
    const rudder = withEdges(new THREE.Mesh(new THREE.BoxGeometry(4, 8, 0.7), M.antifouling));
    rudder.position.set(-92.5, 5, 0);
    aftLow.add(rudder);
  }
  const aftUp = block('AFT-U', '선미 상부');
  aftUp.add(loft(SHIP.aftEnd, SHIP.holdStart, SHIP.split, D, aftHb, aftBottom, aftClamp, { side: M.hull, bottom: M.primer, top: M.deck }));

  // 선수
  const foreLow = block('FORE-L', '선수 하부(구상선수)');
  foreLow.add(loft(FORE_START, SHIP.foreEnd, 0, SHIP.split, foreHb, () => 0, foreClamp, { side: M.antifouling, bottom: M.antifouling, top: M.primer }));
  {
    const bulb = withEdges(new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), M.antifouling));
    bulb.scale.set(7, 3.4, 3);
    bulb.position.set(83.5, 4, 0);
    foreLow.add(bulb);
  }
  const foreUp = block('FORE-U', '선수 상부');
  foreUp.add(loft(FORE_START, SHIP.foreEnd, SHIP.split, D, foreHb, () => 0, foreClamp, { side: M.hull, bottom: M.primer, top: M.deck }));
  {
    const mast = withEdges(new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 12, 10), M.mast));
    mast.position.set(84, D + 6, 0);
    foreUp.add(mast);
  }

  // 거주구: 5층, 맨 위는 조타실과 날개
  const house = block('HOUSE', '거주구');
  {
    const front = -72;
    const tiers: [number, number][] = [
      [14, 11],
      [14, 11],
      [13, 11],
      [12, 10.5],
      [10, 11],
    ];
    tiers.forEach(([len, half], i) => {
      const tex = houseTexture(Math.round(len / 1.6));
      const side = new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.55, roughness: 0.6 });
      const tex2 = houseTexture(Math.round((half * 2) / 1.6));
      const face = new THREE.MeshStandardMaterial({ map: tex2, emissive: 0xffffff, emissiveMap: tex2, emissiveIntensity: 0.55, roughness: 0.6 });
      const mesh = withEdges(new THREE.Mesh(new THREE.BoxGeometry(len, 2.8, half * 2), [face, face, M.house, M.house, side, side]));
      mesh.position.set(front - len / 2, D + 1.4 + i * 2.8, 0);
      house.add(mesh);
    });
    boxIn(house, 4, 0.4, 30, M.house, front - 2, D + 4 * 2.8 + 2.6, 0); // 조타실 날개
    boxIn(house, 0.3, 4, 0.3, M.mast, front - 5, D + 5 * 2.8 + 2, 0); // 레이더 마스트
    boxIn(house, 0.3, 0.3, 4, M.mast, front - 5, D + 5 * 2.8 + 3.6, 0);
  }

  // 연돌
  const funnel = block('FUNNEL', '연돌');
  boxIn(funnel, 4.5, 17, 6, M.funnel, -89, D + 8.5, 0);
  boxIn(funnel, 4.6, 1.5, 6.1, M.band, -89, D + 13, 0);

  // 탑재 순서: 가운데 화물창 이중저(키 블록)부터 → 이중저 전부 → 선수·선미 하부 → 측벽 → 상부 → 갑판 → 거주구·연돌
  const sequence = [
    'H3-DB', 'H4-DB', 'H2-DB', 'H5-DB', 'H1-DB', 'AFT-L', 'FORE-L',
    'H3-S', 'H3-P', 'H4-S', 'H4-P', 'H2-S', 'H2-P', 'H5-S', 'H5-P', 'H1-S', 'H1-P',
    'AFT-U', 'FORE-U',
    'H3-DK', 'H4-DK', 'H2-DK', 'H5-DK', 'H1-DK',
    'HOUSE', 'FUNNEL',
  ];
  const ordered: Block[] = sequence.map((id, i) => {
    const b = blocks.find((x) => x.id === id);
    if (!b) throw new Error(`블록 ${id} 없음`);
    return { ...b, order: i + 1 };
  });
  if (ordered.length !== blocks.length) throw new Error('탑재 순서에 빠진 블록이 있음');
  // 성능: 부재와 외곽선을 재질별로 합친다(부재마다 그리기 호출 2번이던 것을 블록당 재질 수만큼으로)
  if (whole) mergeStatic(ship);
  else for (const b of ordered) mergeStatic(b.object);
  return { ship, blocks: ordered };
}
