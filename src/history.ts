/**
 * P4-1: 정문·역사관. 열린 전시관 안에 미포만 모형(디오라마)과 연혁 벽.
 * - 모형은 세 시점을 오간다: 1972 백사장(기공식) → 1974 준공(1·2도크, 첫 VLCC) → 지금(도크 10개, 골리앗 9개).
 *   시설은 바닥에서 솟아오르거나 내려앉아 바뀐다. 배치는 개념도이고 실제 배치가 아니다(공개 자료 원칙).
 * - 뒤 벽에는 연혁 카드 10장, 지금 시점의 카드에 녹색 테두리.
 * - 패널 버튼으로 시점을 고르면 자동 순환을 멈춘다.
 * 좌표: 전시관 중심 바닥이 원점, 열린 면이 +z(도로 쪽). 모형 안에서는 +x 가 바다.
 */
import * as THREE from 'three';
import { buildShed, part, boxG, std, lerp } from './factory/shed';

export const ERAS = [
  { key: '1972', label: '1972 백사장', status: '1972년 3월 — 미포만 백사장에서 기공식' },
  { key: '1974', label: '1974 준공', status: '1974년 6월 — 1·2도크 준공, 첫 VLCC 명명식' },
  { key: 'now', label: '지금', status: '오늘날 — 대형 도크 10개, 골리앗 크레인 9개(공식 사이트 기준)' },
] as const;

/** 연혁 벽 카드(PLAN.md 3장 연혁, 출처는 그 표와 설명 패널). era = 이 카드를 강조할 모형 시점 */
const CARDS: { year: string; text: string; era?: number }[] = [
  { year: '1972', text: '미포만 기공식', era: 0 },
  { year: '1974', text: '준공 · 첫 VLCC', era: 1 },
  { year: '1979', text: '국산 엔진 1호기' },
  { year: '1983', text: '건조량 세계 1위' },
  { year: '1994', text: '국내 첫 LNG선' },
  { year: '2009', text: 'T도크 · H도크' },
  { year: '2012', text: '누적 1억 GT' },
  { year: '2015', text: '선박 2,000척' },
  { year: '2023', text: 'HD현대중공업' },
  { year: '2025', text: '5,000척 인도', era: 2 },
];

const AUTO_SEC = 8; // 자동 순환 간격
const L = 50; // 전시관 길이(x)
const W = 30; // 폭(z)
const H = 14;

function wallTexture() {
  const cw = 200;
  const c = document.createElement('canvas');
  c.width = cw * CARDS.length;
  c.height = 260;
  const g = c.getContext('2d')!;
  g.fillStyle = '#0d1b33';
  g.fillRect(0, 0, c.width, c.height);
  // 시간 줄
  g.fillStyle = '#008233';
  g.fillRect(0, 70, c.width, 6);
  CARDS.forEach((card, i) => {
    const x = i * cw + cw / 2;
    g.fillStyle = '#00ad1d';
    g.beginPath();
    g.arc(x, 73, 14, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#ffffff';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = '700 46px Pretendard, system-ui, sans-serif';
    g.fillText(card.year, x, 140);
    g.fillStyle = '#c9d6e8';
    g.font = '500 25px Pretendard, system-ui, sans-serif';
    g.fillText(card.text, x, 200);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function createHistory(scene: THREE.Scene, at: [number, number, number]) {
  const root = new THREE.Group();
  root.position.set(at[0], 0, at[2]);
  scene.add(root);

  const shed = buildShed(L, W, H, 1, 1, false); // 전시관에는 천장 크레인이 없다(레일도 없음)
  root.add(shed.group);
  shed.lights[0].position.set(0, H - 3, 2);

  // ── 연혁 벽(뒤 벽 안쪽). 낮/밤 전환이 창 그림으로 착각하지 않게 MeshBasic 으로 ──
  const wallW = 44;
  const wallH = wallW * (260 / (200 * CARDS.length));
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(wallW, wallH), new THREE.MeshBasicMaterial({ map: wallTexture() }));
  // 천장 크레인 레일(높이 약 8.2~9 m, 벽 바로 앞) 아래에 둔다
  wall.position.set(0, 2 + wallH / 2 + 0.3, -W / 2 + 0.6);
  root.add(wall);
  const cardW = wallW / CARDS.length;
  // 카드 하나를 덮는 반투명 녹색 판 + 테두리
  const frame = new THREE.Mesh(
    new THREE.PlaneGeometry(cardW - 0.2, wallH - 0.2),
    new THREE.MeshBasicMaterial({ color: 0x00e600, transparent: true, opacity: 0.25, depthWrite: false }),
  );
  const border = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.PlaneGeometry(cardW - 0.2, wallH - 0.2)),
    new THREE.LineBasicMaterial({ color: 0x00e600 }),
  );
  frame.add(border);
  frame.position.set(0, wall.position.y, wall.position.z + 0.05);
  root.add(frame);
  const cardX = (i: number) => -wallW / 2 + cardW * (i + 0.5);

  // ── 모형 받침대 ──
  const TABLE = { l: 32, w: 15, h: 1.1 };
  const table = new THREE.Group();
  table.position.set(0, 0, 1.5);
  root.add(table);
  part(table, boxG(TABLE.l + 1, TABLE.h, TABLE.w + 1), std(0x2a2f36, 0.7, 0.2), 0, TABLE.h / 2, 0);
  // 받침대 둘레 낮은 난간(관람선)
  for (const sz of [-1, 1]) part(table, boxG(TABLE.l + 5, 0.9, 0.15), std(0x8a939e, 0.4, 0.7), 0, 0.45, sz * (TABLE.w / 2 + 2.2), false);

  const top = TABLE.h;
  const COAST = 5; // 모형 안 해안선(x)
  const landMat = std(0xc8b27c, 0.95);
  const LAND = { sand: new THREE.Color(0xc8b27c), concrete: new THREE.Color(0x6c7178) };
  part(table, boxG(COAST + TABLE.l / 2, 0.3, TABLE.w), landMat, (COAST - TABLE.l / 2) / 2, top + 0.15, 0, false);
  const seaMat = new THREE.MeshStandardMaterial({ color: 0x2d6a96, roughness: 0.25, metalness: 0.2 });
  part(table, boxG(TABLE.l / 2 - COAST, 0.12, TABLE.w), seaMat, (TABLE.l / 2 + COAST) / 2, top + 0.06, 0, false);
  // 뒤쪽 산(모든 시점)
  const hill = std(0x4f6b3e, 0.95);
  for (const [x, z, r, h] of [
    [-14, -5, 2.2, 2.4],
    [-14.5, -1, 2.6, 3],
    [-13.8, 3.5, 2.3, 2.2],
    [-12.5, 6, 1.6, 1.6],
  ])
    part(table, new THREE.ConeGeometry(r, h, 7), hill, x, top + 0.3 + h / 2, z);

  // 시점마다 보일 것. 바닥에서 솟아오르게 기하를 밑면 기준으로 옮겨 둔다
  interface Piece {
    obj: THREE.Object3D;
    eras: number[];
    k: number;
    /** 원래 높이(공중에 얹힌 부재는 솟을 때 같이 올라온다) */
    y0: number;
  }
  const pieces: Piece[] = [];
  function piece(geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, eras: number[], ry = 0) {
    geo.computeBoundingBox();
    geo.translate(0, -geo.boundingBox!.min.y, 0);
    const mesh = part(table, geo, m, x, y, z, false);
    mesh.rotation.y = ry;
    pieces.push({ obj: mesh, eras, k: 1, y0: y });
    return mesh;
  }
  const M = {
    sand: std(0xe6d3a0, 0.95),
    tent: std(0xf2f2ee, 0.8),
    flag: new THREE.MeshStandardMaterial({ color: 0xd8342a, roughness: 0.8 }),
    dock: std(0x0f1620, 0.9),
    water: new THREE.MeshStandardMaterial({ color: 0x24567c, roughness: 0.3 }),
    crane: std(0xd9a21b, 0.55, 0.3),
    shed: std(0x6f7a87, 0.7, 0.3),
    hull: std(0x8c2b22, 0.7, 0.2),
    deck: std(0x3d5a3a, 0.8),
    quay: std(0x9da3aa, 0.9),
  };
  const top2 = top + 0.3; // 땅 윗면

  // 1972: 백사장 띠와 기공식 천막·깃발
  piece(boxG(2.4, 0.06, TABLE.w - 0.4), M.sand, COAST - 1.2, top2, 0, [0]);
  piece(boxG(1.6, 0.7, 1.1), M.tent, COAST - 3.2, top2, -1.5, [0]);
  for (const z of [-3.4, 0.4]) {
    piece(new THREE.CylinderGeometry(0.03, 0.03, 1.6, 5), M.tent, COAST - 3.2, top2, z, [0]);
    piece(boxG(0.02, 0.35, 0.55), M.flag, COAST - 3.2, top2 + 1.25, z + 0.28, [0]);
  }

  // 1974 이후: 안벽(해안선이 콘크리트로)
  piece(boxG(0.5, 0.32, TABLE.w - 0.4), M.quay, COAST - 0.25, top + 0.02, 0, [1, 2]);

  // 도크: 해안선에 입을 대고 육지 쪽으로 판다. 1974 = 1·2도크(z 음수 쪽 두 개)
  const docks: { z: number; len: number; w: number; eras: number[] }[] = [
    { z: -5.4, len: 6.5, w: 1.1, eras: [1, 2] },
    { z: -3.9, len: 6.5, w: 1.1, eras: [1, 2] },
    { z: -2.2, len: 9.5, w: 1.9, eras: [2] }, // 가장 큰 3도크
    { z: -0.3, len: 6, w: 1.0, eras: [2] },
    { z: 1.0, len: 6, w: 1.0, eras: [2] },
    { z: 2.3, len: 7, w: 1.2, eras: [2] },
    { z: 3.7, len: 7, w: 1.2, eras: [2] },
    { z: 5.0, len: 5.5, w: 0.9, eras: [2] },
    { z: 6.1, len: 5.5, w: 0.9, eras: [2] },
    { z: 7.0, len: 4.5, w: 0.6, eras: [2] },
  ];
  for (const d of docks) {
    const cx = COAST - d.len / 2;
    piece(boxG(d.len, 0.38, d.w), M.dock, cx, top + 0.01, d.z, d.eras); // 땅보다 조금 높게(어두운 구덩이처럼 보임)
  }
  // 골리앗: 도크를 가로지르는 문형 크레인. 1974 = 1기, 지금 = 9기
  const goliath = (x: number, z: number, span: number, eras: number[]) => {
    const h = 2 + span * 0.25;
    for (const s of [-1, 1]) piece(boxG(0.14, h, 0.14), M.crane, x, top2, z + (s * span) / 2, eras);
    piece(boxG(0.3, 0.22, span + 0.5), M.crane, x, top2 + h, z, eras); // 다리 위 거더
  };
  goliath(COAST - 3.6, -4.65, 3.4, [1, 2]);
  for (const [i, d] of docks.entries()) {
    if (i < 2 || i === 9) continue; // 1·2도크는 위에서 1기로 같이 걸침, 10도크는 소형
    goliath(COAST - d.len * 0.45, d.z, d.w + 0.9, [2]);
  }
  goliath(COAST - 2.4, -4.65, 3.4, [2]); // 1·2도크 쪽 두 번째(지금)

  // 공장: 1974 = 3동, 지금 = 길게 늘어선 공장
  const sheds: [number, number, number, number, number, number[]][] = [
    // x, z, 길이, 폭, 높이, 시점
    [-7.5, -5, 3.2, 1.6, 0.9, [1, 2]],
    [-7.5, -2.6, 3.2, 1.6, 0.9, [1, 2]],
    [-11, -4, 2.2, 2.6, 1.1, [1, 2]],
    [-7.5, 0, 3.2, 1.6, 0.9, [2]],
    [-7.5, 2.4, 3.2, 1.6, 0.9, [2]],
    [-7.5, 4.8, 3.2, 1.6, 0.9, [2]],
    [-11, 0.5, 2.2, 2.6, 1.1, [2]],
    [-11, 4, 2.2, 2.6, 1.1, [2]],
    [-4.8, 6.6, 2, 1.2, 0.7, [2]],
    [-10.6, -6.6, 1.6, 1.0, 1.6, [2]], // 사무동
  ];
  for (const [x, z, l, w, h, eras] of sheds) piece(boxG(l, h, w), M.shed, x, top2, z, eras);

  // 배: 1974 = 1도크의 첫 VLCC, 지금 = 도크와 안벽 여러 척
  const hull = (x: number, z: number, len: number, w: number, eras: number[]) => {
    const y = top + 0.12;
    piece(boxG(len, 0.36, w), M.hull, x, y, z, eras);
    piece(boxG(len * 0.92, 0.04, w * 0.9), M.deck, x, y + 0.36, z, eras);
    piece(boxG(len * 0.1, 0.42, w * 0.8), M.tent, x - len * 0.42, y + 0.4, z, eras);
  };
  hull(COAST - 3.3, -5.4, 4.6, 0.75, [1, 2]);
  hull(COAST - 4.2, -2.2, 6.5, 1.0, [2]);
  hull(COAST - 2.5, -2.2, 2.6, 1.0, [2]);
  hull(COAST - 3, 2.3, 4.6, 0.8, [2]);
  hull(COAST - 2.8, 5.0, 3.6, 0.6, [2]);
  hull(COAST + 2.4, 3.2, 5, 0.8, [2]); // 안벽에 댄 배
  hull(COAST + 2.4, 5.6, 4.6, 0.75, [2]);
  hull(COAST + 6, -4, 5, 0.85, [1, 2]); // 1974: 첫 배가 바다로

  let era = 0;
  let auto = true;
  let timer = 0;
  /** 패널 버튼 표시를 맞출 콜백(패널을 다시 그릴 때마다 바꿔 끼움) */
  let onEra: ((e: number) => void) | null = null;
  function setEra(e: number, byUser = false) {
    era = e;
    if (byUser) auto = false;
    timer = 0;
    onEra?.(e);
  }

  function update(machineDt: number, dt: number) {
    if (auto) {
      timer += machineDt;
      if (timer >= AUTO_SEC) setEra((era + 1) % ERAS.length);
    }
    // 솟아오르기 / 내려앉기
    const rate = Math.min(1, dt * 2.5);
    for (const p of pieces) {
      const want = p.eras.includes(era) ? 1 : 0;
      p.k = lerp(p.k, want, rate);
      if (Math.abs(p.k - want) < 0.002) p.k = want;
      p.obj.visible = p.k > 0.01;
      p.obj.scale.y = Math.max(0.01, p.k);
      p.obj.position.y = top + (p.y0 - top) * p.k;
    }
    landMat.color.lerp(era === 0 ? LAND.sand : LAND.concrete, rate);
    // 카드 강조: 이 시점의 카드로 미끄러짐
    const ci = CARDS.findIndex((c) => c.era === era);
    frame.position.x = lerp(frame.position.x, cardX(ci), rate);
  }
  // 처음 상태로 바로 맞춤
  for (const p of pieces) {
    p.k = p.eras.includes(era) ? 1 : 0;
    p.obj.visible = p.k > 0;
    p.obj.scale.y = Math.max(0.01, p.k);
    p.obj.position.y = top + (p.y0 - top) * p.k;
  }
  frame.position.x = cardX(0);

  return {
    update,
    status: () => `${ERAS[era].status}${auto ? ' · 자동으로 넘어감' : ''}`,
    setEra,
    get era() {
      return era;
    },
    onEra: (f: (e: number) => void) => (onEra = f),
  };
}
