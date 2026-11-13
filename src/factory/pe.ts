/**
 * P2-3 선행탑재장(PE장, 공식 공정 5 블록 1차 선행탑재, 7 블록 2차 선행탑재). 야외 마당.
 * 한 순환(약 170초):
 *  1차: 트랜스포터가 조립공장에서 온 바닥 블록과 옆 블록을 차례로 실어 오고, 마당 크레인이 받침 위에서 합쳐
 *       L자 블록을 만든다 → 이음매 용접 → 도장공장으로 보낸다(공식 순서: 1차 선행탑재 → 도장 → 2차)
 *  2차: 도장을 마친 L자 블록 두 개(하나는 거울 모양)를 실어 와 마주 붙이면 U자 단면의 큰 블록 → 용접 → 도크로 보낸다
 * 좌표는 마당 중심 바닥이 원점. +z 가 도로 쪽(트랜스포터가 드나드는 쪽), 도로에서 보면 +x 가 오른쪽.
 */
import * as THREE from 'three';
import { overheadCrane, craneSteps, part, boxG, FM, std, sequence, lerp, inOut, sparks, type Step } from './shed';

const YARD_L = 90;
const YARD_W = 50;
const SPAN = 46; // 크레인 다리 사이
const RAIL_Y = 30;
const SAFE = 24;
const DROP = 2.2;

const BL = 14; // 블록 길이(x)
const BOT = { h: 3, w: 10 }; // 바닥 블록
const SIDE = { h: 7, w: 2.5 }; // 옆 블록
const STOOL = 1.2;

const A = { x: -20, z: -6 }; // 1차 받침
const B = { x: 18, z: -6 }; // 2차 받침(U자 가운데)
const HAND = 14; // 트랜스포터가 서는 z
const ROAD = 62; // 트랜스포터가 나타나고 사라지는 z(도로)
const DECK = 2.0;

const M = {
  ground: std(0x3a4049, 0.9),
  primer: std(0x6f6a62, 0.8, 0.3),
  primer2: std(0x7d776c, 0.8, 0.3),
  painted: std(0x4f6a88, 0.55, 0.3),
  antifoul: std(0x8c3027, 0.7, 0.15),
  truck: std(0xe0a91c, 0.6, 0.2),
};
const EDGE = new THREE.LineBasicMaterial({ color: 0x0b0f16, transparent: true, opacity: 0.5 });

/** 모서리 선이 있는 상자(블록 경계가 보이게) */
function edged(parent: THREE.Object3D, w: number, h: number, d: number, m: THREE.Material | THREE.Material[], x: number, y: number, z: number) {
  const mesh = part(parent, boxG(w, h, d), m, x, y, z);
  mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), EDGE));
  return mesh;
}
function bottomBlock(m: THREE.Material | THREE.Material[]) {
  const g = new THREE.Group();
  edged(g, BL, BOT.h, BOT.w, m, 0, BOT.h / 2, 0);
  return g;
}
function sideBlock(m: THREE.Material) {
  const g = new THREE.Group();
  edged(g, BL, SIDE.h, SIDE.w, m, 0, SIDE.h / 2, 0);
  return g;
}
/** 도장을 마친 L자 블록. mirror 면 옆 블록이 +z 쪽 */
function paintedL(mirror: boolean) {
  // 선저 도료(빨강)는 바깥 면에만, 윗면(내저판)은 일반 도장색. 상자 면 순서: +x, -x, +y, -y, +z, -z
  const a = M.antifoul;
  const g = bottomBlock([a, a, M.painted, a, a, a]);
  const s = sideBlock(M.painted);
  s.position.set(0, BOT.h, (mirror ? 1 : -1) * (BOT.w / 2 - SIDE.w / 2));
  g.add(s);
  return g;
}
const SIDE_DZ = -(BOT.w / 2 - SIDE.w / 2); // 1차에서 옆 블록이 앉는 z(바닥 블록 기준)

export function createPE(scene: THREE.Scene, at: [number, number, number]) {
  const root = new THREE.Group();
  root.position.set(at[0], 0, at[2]);
  scene.add(root);

  // ── 마당, 받침, 크레인 레일 ──
  part(root, boxG(YARD_L, 0.2, YARD_W), M.ground, 0, 0.1, 0, false);
  for (const p of [A, { x: B.x, z: B.z - BOT.w / 2 }, { x: B.x, z: B.z + BOT.w / 2 }])
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) part(root, boxG(1, STOOL, 1), FM.steel, p.x + sx * 5, STOOL / 2, p.z + sz * 3.5);
  for (const z of [-SPAN / 2, SPAN / 2]) part(root, boxG(YARD_L + 10, 0.3, 0.6), FM.steel, 0, 0.15, z, false);
  // 마당 둘레 투광등(불빛만)과 점광원 1개
  for (const x of [-40, 40])
    for (const z of [-24, 24]) {
      part(root, new THREE.CylinderGeometry(0.3, 0.45, 20, 8), FM.steel, x, 10, z, false);
      part(root, boxG(2.6, 0.6, 1.2), FM.lamp, x, 20, z, false);
    }
  const yardLight = new THREE.PointLight(0xfff0d8, 3200, 110, 2);
  yardLight.position.set(0, 26, 6);
  root.add(yardLight);

  // ── 마당 크레인(골리앗형): 천장 크레인 거더에 다리를 붙인다 ──
  const crane = overheadCrane(SPAN, RAIL_Y);
  root.add(crane.bridge);
  for (const z of [-SPAN / 2, SPAN / 2]) {
    for (const dx of [-4, 4]) {
      const leg = part(crane.bridge, boxG(0.8, RAIL_Y, 0.8), FM.crane, dx * 0.7, RAIL_Y / 2, z);
      leg.rotation.z = (dx > 0 ? -1 : 1) * 0.12;
    }
    part(crane.bridge, boxG(10, 1.6, 2), FM.craneDark, 0, 0.8, z);
  }
  part(crane.hook, boxG(12, 0.4, 0.8), FM.crane, 0, -1.0, 0);
  for (const dx of [-5.6, 5.6]) part(crane.hook, new THREE.CylinderGeometry(0.06, 0.06, 1.2, 6), FM.steel, dx, -1.75, 0, false);
  const { craneTo, hookTo, grab, release } = craneSteps(root, crane);
  crane.setHook(SAFE);

  // ── 트랜스포터 ──
  const truck = new THREE.Group();
  part(truck, boxG(16, 0.7, 9), M.truck, 0, DECK - 0.35, 0);
  for (let x = -7; x <= 7; x += 2)
    for (const z of [-3.6, -1.2, 1.2, 3.6]) {
      const w = part(truck, new THREE.CylinderGeometry(0.55, 0.55, 0.6, 12), FM.dark, x, 0.55, z);
      w.rotation.x = Math.PI / 2;
    }
  part(truck, boxG(2, 1.6, 2.2), M.truck, 8.6, DECK + 0.4, 3);
  truck.visible = false;
  root.add(truck);

  // ── 용접 ──
  const fx = sparks(root, 500, [0.85, 0.92, 1]);
  const weldLight = new THREE.PointLight(0xbcd6ff, 0, 40, 2);
  root.add(weldLight);
  let welds: THREE.Vector3[] = [];
  const weld = (pts: () => THREE.Vector3[], dur: number, label: string): Step => ({
    dur,
    label,
    enter: () => (welds = pts()),
    apply: (k) => {
      if (k >= 1) welds = [];
    },
  });

  // ── 순환마다 새로 만드는 블록 ──
  let cargo: THREE.Group | null = null; // 트랜스포터에 실린 것
  let blockA: THREE.Group = new THREE.Group(); // 1차 받침 위
  let blockB: THREE.Group = new THREE.Group(); // 2차 받침 위
  let p2: THREE.Group = new THREE.Group();
  const dispose = (o: THREE.Object3D | null) => {
    if (!o) return;
    o.parent?.remove(o);
    o.traverse((c) => (c as THREE.Mesh).geometry?.dispose());
  };

  /** 트랜스포터가 도로에서 짐을 싣고(또는 빈 채로) 마당으로 들어옴 */
  const truckIn = (x: number, load: (() => THREE.Group) | null, label: string): Step => ({
    dur: 6,
    label,
    enter: () => {
      truck.visible = true;
      truck.position.set(x, 0, ROAD);
      if (load) {
        cargo = load();
        cargo.position.set(0, DECK, 0);
        truck.add(cargo);
      }
    },
    apply: (k) => (truck.position.z = lerp(ROAD, HAND, inOut(k))),
  });
  /** 트랜스포터가 도로로 나감(실린 것이 있으면 같이 사라짐) */
  const truckOut = (label: string): Step => ({
    dur: 5,
    label,
    apply: (k) => {
      truck.position.z = lerp(HAND, ROAD, inOut(k));
      if (k >= 1) {
        truck.visible = false;
        for (const c of [...truck.children]) if (c.userData.cargo) dispose(c);
      }
    },
  });
  const markCargo = (o: THREE.Object3D) => ((o.userData.cargo = true), o);

  /** 크레인 한 번: (x0, z0) 에서 topFrom 높이의 물건을 잡아 (x1, z1) 의 bottom 높이에 놓기 */
  function lift(
    what: () => THREE.Object3D,
    from: { x: number; z: number; top: () => number },
    to: { x: number; z: number; top: () => number; parent: () => THREE.Object3D },
    label: string,
  ): Step[] {
    return [
      craneTo(from.x, from.z, 3.5, label),
      hookTo(() => from.top() + DROP, 2.5, label),
      grab(what, label),
      hookTo(() => SAFE, 2.5, label),
      craneTo(to.x, to.z, 3.5, label),
      hookTo(() => to.top() + DROP, 2.5, label),
      release(what, to.parent, label),
      hookTo(() => SAFE, 2, label),
    ];
  }

  const L1 = '1차 선행탑재 — 조립공장에서 온 바닥 블록을 받침에 올림';
  const L2 = '1차 선행탑재 — 옆 블록을 얹어 L자 블록으로';
  const L3 = '1차 선행탑재 — 이음매 용접';
  const L4 = '도장공장으로 — 합친 블록을 보냄';
  const L5 = '2차 선행탑재 — 도장을 마친 블록 둘을 받침에 올림';
  const L6 = '2차 선행탑재 — 마주 붙여 용접';
  const L7 = '도크로 — 큰 블록을 탑재하러 보냄';

  const onTruck = () => DECK;
  const main = sequence(() => [
    {
      dur: 1,
      label: L1,
      enter: () => {
        dispose(blockA);
        dispose(blockB);
        // 받침 자리 묶음은 먼저 장면에 붙여야 놓기(attach)가 월드 위치를 제대로 계산한다
        blockA = new THREE.Group();
        blockB = new THREE.Group();
        root.add(blockA, blockB);
      },
    },
    truckIn(A.x, () => markCargo(bottomBlock(M.primer)) as THREE.Group, L1),
    ...lift(
      () => cargo!,
      { x: A.x, z: HAND, top: () => DECK + BOT.h },
      { x: A.x, z: A.z, top: () => STOOL + BOT.h, parent: () => blockA },
      L1,
    ),
    {
      dur: 0.1,
      label: L1,
      enter: () => delete cargo!.userData.cargo,
    },
    truckOut(L1),
    truckIn(A.x, () => markCargo(sideBlock(M.primer2)) as THREE.Group, L2),
    ...lift(
      () => cargo!,
      { x: A.x, z: HAND, top: () => DECK + SIDE.h },
      { x: A.x, z: A.z + SIDE_DZ, top: () => STOOL + BOT.h + SIDE.h, parent: () => blockA },
      L2,
    ),
    { dur: 0.1, label: L2, enter: () => delete cargo!.userData.cargo },
    truckOut(L2),
    weld(
      () =>
        [-6, -2, 2, 6].map((x) => new THREE.Vector3(A.x + x, STOOL + BOT.h + 0.1, A.z + SIDE_DZ + SIDE.w / 2 + 0.15)),
      6,
      L3,
    ),
    truckIn(A.x, null, L4),
    ...lift(
      () => blockA,
      { x: A.x, z: A.z, top: () => STOOL + BOT.h + SIDE.h },
      { x: A.x, z: HAND, top: () => onTruck() + BOT.h + SIDE.h, parent: () => truck },
      L4,
    ),
    { dur: 0.1, label: L4, enter: () => markCargo(blockA) },
    truckOut(L4),
    // 2차
    truckIn(B.x, () => markCargo(paintedL(false)) as THREE.Group, L5),
    ...lift(
      () => cargo!,
      { x: B.x, z: HAND, top: () => DECK + BOT.h + SIDE.h },
      { x: B.x, z: B.z - BOT.w / 2, top: () => STOOL + BOT.h + SIDE.h, parent: () => blockB },
      L5,
    ),
    { dur: 0.1, label: L5, enter: () => delete cargo!.userData.cargo },
    truckOut(L5),
    truckIn(
      B.x,
      () => {
        p2 = markCargo(paintedL(true)) as THREE.Group;
        return p2;
      },
      L5,
    ),
    ...lift(
      () => p2,
      { x: B.x, z: HAND, top: () => DECK + BOT.h + SIDE.h },
      { x: B.x, z: B.z + BOT.w / 2, top: () => STOOL + BOT.h + SIDE.h, parent: () => blockB },
      L5,
    ),
    { dur: 0.1, label: L5, enter: () => delete p2.userData.cargo },
    truckOut(L5),
    weld(
      () => [-6, -2, 2, 6].map((x) => new THREE.Vector3(B.x + x, STOOL + BOT.h + 0.1, B.z)),
      6,
      L6,
    ),
    truckIn(B.x, null, L7),
    ...lift(
      () => blockB,
      { x: B.x, z: B.z, top: () => STOOL + BOT.h + SIDE.h },
      { x: B.x, z: HAND, top: () => onTruck() + BOT.h + SIDE.h, parent: () => truck },
      L7,
    ),
    { dur: 0.1, label: L7, enter: () => markCargo(blockB) },
    truckOut(L7),
  ]);

  // blockA, blockB: 마당 원점에 둔 빈 묶음. 받침에 놓은 블록이 여기에 붙어 한꺼번에 들린다
  root.add(blockA, blockB);

  const tmp = new THREE.Vector3();
  function update(machineDt: number, dt: number) {
    main.update(machineDt);
    if (welds.length) {
      tmp.set(0, 0, 0);
      for (const p of welds) {
        if (Math.random() < 0.7) fx.emit(p, Math.ceil(dt * 90), 0.7);
        tmp.add(p);
      }
      weldLight.position.copy(tmp.multiplyScalar(1 / welds.length)).y += 2;
      weldLight.intensity = 200 + Math.random() * 450;
    } else weldLight.intensity = 0;
    fx.update(dt);
  }
  return { update, status: () => main.label() };
}
