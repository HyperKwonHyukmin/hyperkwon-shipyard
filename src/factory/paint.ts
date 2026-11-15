/**
 * P2-4 도장공장(공식 공정 6 도장작업).
 * 한 순환(약 60초): PE장 1차를 마친 L자 블록이 트랜스포터에 실려 들어옴
 *  → 표면처리 부스: 분사 머리가 지나가며 녹과 이물질을 벗김(먼지, 프라이머 색 → 밝은 강판색)
 *  → 도장 부스: 분사 머리가 지나가며 칠함(바닥 블록 바깥은 선저 도료 빨강, 내저판과 옆 블록은 회청색) → 건조(부스 히터가 붉게)
 *  → 반출(PE장 2차로).
 * 색이 바뀌는 모습은 블록을 길이 방향 7조각으로 나눠, 분사 머리가 지나간 조각부터 색을 바꿔 보여 준다.
 * 좌표는 건물 중심 바닥이 원점. 열린 면은 -z(도로 쪽). 도로에서 보면 +x 가 왼쪽이라 표면처리 부스를 +x 에 둔다.
 * 조명 부담을 줄이려고 점광원은 건물 1개뿐, 부스 조명은 발광 재질로만.
 */
import * as THREE from 'three';
import { doubleBottom, sideShell, lugs, Parts, seams } from '../blockgen';
import { buildShed, part, boxG, FM, std, sequence, lerp, inOut, sparks, type Step } from './shed';

const L = 66;
const W = 38;
const H = 20;

const BL = 14;
const BOT = { h: 3, w: 10 };
const SIDE = { h: 7, w: 2.5 };
const SLICES = 7;
const DECK = 2.0;

const BOOTH1 = 16; // 표면처리
const BOOTH2 = -16; // 도장
const BOOTH = { l: 22, h: 15, back: 9 };
const ROAD = -42;

const C = {
  primer: new THREE.Color(0x7d6e60),
  bare: new THREE.Color(0xa3a8ad),
  outer: new THREE.Color(0x8c3027),
  inner: new THREE.Color(0x4f6a88),
};
const EDGE = new THREE.LineBasicMaterial({ color: 0x0b0f16, transparent: true, opacity: 0.5 });

interface Slice {
  outer: THREE.MeshStandardMaterial;
  inner: THREE.MeshStandardMaterial;
  x: number;
}

/** 조각으로 나눈 L자 블록(바닥 블록 + -z 쪽 옆 블록). 원점은 바닥 가운데 */
function slicedBlock() {
  const g = new THREE.Group();
  const slices: Slice[] = [];
  const sl = BL / SLICES;
  const sideZ = -(BOT.w / 2 - SIDE.w / 2);
  for (let i = 0; i < SLICES; i++) {
    const x = -BL / 2 + sl / 2 + i * sl;
    const outer = seams(std(0x7d6e60, 0.75, 0.3));
    const inner = seams(std(0x7d6e60, 0.75, 0.3));
    // 2026-11-14 W1: 상자 → 판·늑판·늑골 구조. 선저판(outer)과 안쪽(inner) 재질을 조각마다 따로 둬 칠해지는 순서가 보인다
    const db = doubleBottom({ l: sl, w: BOT.w, h: BOT.h, shell: outer, inner, frame: inner, lug: false, spacing: 1.2 }).build();
    db.position.x = x;
    const sd = sideShell({ l: sl, h: SIDE.h, w: SIDE.w, side: -1, shell: inner, frame: inner, lug: false }).build();
    sd.position.set(x, BOT.h, sideZ);
    g.add(db, sd);
    slices.push({ outer, inner, x });
  }
  const lp = new Parts();
  lugs(lp, BL, BOT.w, BOT.h);
  lp.build(g);
  // 조각 경계선 없이 블록 둘레에만 선
  const e1 = new THREE.LineSegments(new THREE.EdgesGeometry(boxG(BL, BOT.h, BOT.w)), EDGE);
  e1.position.y = BOT.h / 2;
  const e2 = new THREE.LineSegments(new THREE.EdgesGeometry(boxG(BL, SIDE.h, SIDE.w)), EDGE);
  e2.position.set(0, BOT.h + SIDE.h / 2, sideZ);
  g.add(e1, e2);
  return { g, slices };
}

export function createPaint(scene: THREE.Scene, at: [number, number, number]) {
  const root = new THREE.Group();
  root.position.set(at[0], 0, at[2]);
  scene.add(root);
  const shed = buildShed(L, W, H, -1, 1);
  root.add(shed.group);
  // 부스 지붕이 천장 조명을 가려 블록 정면이 어두우므로, 조명을 부스 앞쪽 낮은 곳으로
  shed.lights[0].position.set(0, 11, -14);
  shed.lights[0].intensity = 1700;

  // ── 부스 2개: 뒤벽, 지붕, 천장 조명판, 벽 히터. 앞(도로 쪽)과 양 끝은 트여 있다 ──
  const boothWall = std(0x50606e, 0.85, 0.2);
  const heaterMat = new THREE.MeshStandardMaterial({ color: 0x40302a, emissive: 0xff5a1e, emissiveIntensity: 0 });
  const panelMat = new THREE.MeshStandardMaterial({ color: 0xf0f4ff, emissive: 0xe8f0ff, emissiveIntensity: 1.6 });
  for (const bx of [BOOTH1, BOOTH2]) {
    part(root, boxG(BOOTH.l, BOOTH.h, 0.4), boothWall, bx, BOOTH.h / 2, BOOTH.back, false);
    part(root, boxG(BOOTH.l, 0.4, BOOTH.back + 9), boothWall, bx, BOOTH.h, (BOOTH.back - 9) / 2, false);
    for (let x = -8; x <= 8; x += 4) part(root, boxG(2.4, 0.15, 5), panelMat, bx + x, BOOTH.h - 0.3, 0, false);
    // 이름 띠
    part(root, boxG(BOOTH.l, 1.2, 0.3), FM.craneDark, bx, BOOTH.h + 0.2, -9, false);
  }
  for (let x = -9; x <= 9; x += 3) part(root, boxG(2.2, 4, 0.3), heaterMat, BOOTH2 + x, 5, BOOTH.back - 0.4, false);

  // ── 분사 장치: 부스마다 위쪽 가로대가 x 로 움직이고, 앞뒤에 분사 머리가 매달림 ──
  function sprayer(bx: number) {
    const g = new THREE.Group();
    part(g, boxG(1, 0.8, 18), FM.crane, 0, 12.5, 0);
    const heads: THREE.Object3D[] = [];
    for (const z of [-6.8, 6.6]) {
      part(g, boxG(0.3, 6, 0.3), FM.steel, 0, 9.3, z, false);
      const h = part(g, boxG(0.8, 0.8, 0.8), FM.dark, 0, 6, z);
      heads.push(h);
    }
    g.position.x = bx + 8;
    root.add(g);
    return { g, heads };
  }
  const blaster = sprayer(BOOTH1);
  const painter = sprayer(BOOTH2);
  const dust = sparks(root, 500, [0.55, 0.52, 0.48]);
  const mist = sparks(root, 600, [0.45, 0.55, 0.7]);

  // ── 트랜스포터 ──
  const truck = new THREE.Group();
  part(truck, boxG(16, 0.7, 9), std(0xe0a91c, 0.6, 0.2), 0, DECK - 0.35, 0);
  for (let x = -7; x <= 7; x += 2)
    for (const z of [-3.6, -1.2, 1.2, 3.6]) {
      const w = part(truck, new THREE.CylinderGeometry(0.55, 0.55, 0.6, 12), FM.dark, x, 0.55, z);
      w.rotation.x = Math.PI / 2;
    }
  truck.visible = false;
  root.add(truck);

  let block = slicedBlock();
  function fresh() {
    block.g.parent?.remove(block.g);
    block.g.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
    });
    for (const s of block.slices) {
      s.outer.dispose();
      s.inner.dispose();
    }
    block = slicedBlock();
    block.g.position.y = DECK;
    truck.add(block.g);
  }

  /** 분사 머리가 블록 위를 +x → -x 로 지나가며(도로에서 보면 왼쪽 → 오른쪽) 지나간 조각의 색을 바꾼다 */
  function sweep(
    s: ReturnType<typeof sprayer>,
    bx: number,
    k: number,
    paint: (sl: Slice, t: number) => void,
    emit: (p: THREE.Vector3) => void,
  ) {
    const x = lerp(bx + BL / 2 + 1, bx - BL / 2 - 1, k);
    s.g.position.x = x;
    // 머리가 위아래로 오르내리며 칠한다
    for (const h of s.heads) h.position.y = 6 + Math.sin(k * Math.PI * 14) * 3;
    for (const sl of block.slices) {
      const passed = THREE.MathUtils.clamp((bx + sl.x + BL / SLICES / 2 - x) / (BL / SLICES), 0, 1);
      paint(sl, passed);
    }
    if (k < 1) for (const h of s.heads) emit(h.getWorldPosition(tmp).sub(root.position));
  }
  const tmp = new THREE.Vector3();

  const L1 = '반입 — 1차 선행탑재를 마친 블록';
  const L2 = '표면처리 — 녹과 이물질을 벗겨 도료가 잘 붙게';
  const L3 = '도장 부스로 옮김';
  const L4 = '도장 — 선저 바깥과 안쪽에 서로 다른 도료';
  const L5 = '건조';
  const L6 = '반출 — PE장 2차 선행탑재로';

  const main = sequence((): Step[] => [
    {
      dur: 6,
      label: L1,
      enter: () => {
        fresh();
        truck.visible = true;
        truck.position.set(BOOTH1, 0, ROAD);
      },
      apply: (k) => (truck.position.z = lerp(ROAD, 0, inOut(k))),
    },
    {
      dur: 13,
      label: L2,
      apply: (k) =>
        sweep(
          blaster,
          BOOTH1,
          k,
          (sl, t) => {
            sl.outer.color.lerpColors(C.primer, C.bare, t);
            sl.inner.color.lerpColors(C.primer, C.bare, t);
          },
          (p) => dust.emit(p, 3, 0.4),
        ),
    },
    { dur: 6, label: L3, apply: (k) => (truck.position.x = lerp(BOOTH1, BOOTH2, inOut(k))) },
    {
      dur: 16,
      label: L4,
      apply: (k) =>
        sweep(
          painter,
          BOOTH2,
          k,
          (sl, t) => {
            sl.outer.color.lerpColors(C.bare, C.outer, t);
            sl.inner.color.lerpColors(C.bare, C.inner, t);
          },
          (p) => mist.emit(p, 3, 0.3),
        ),
    },
    {
      dur: 7,
      label: L5,
      apply: (k) => {
        heaterMat.emissiveIntensity = Math.sin(k * Math.PI) * 1.6;
        painter.g.position.x = lerp(BOOTH2 - BL / 2 - 1, BOOTH2 + 8, inOut(k));
        blaster.g.position.x = lerp(BOOTH1 - BL / 2 - 1, BOOTH1 + 8, inOut(k));
      },
    },
    {
      dur: 6,
      label: L6,
      apply: (k) => {
        truck.position.z = lerp(0, ROAD, inOut(k));
        if (k >= 1) truck.visible = false;
      },
    },
  ]);

  function update(machineDt: number, dt: number) {
    main.update(machineDt);
    dust.update(dt);
    mist.update(dt);
  }
  return { update, status: () => main.label() };
}
