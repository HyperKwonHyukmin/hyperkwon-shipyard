/**
 * P2-2 조립공장(공식 공정 2 소·중조립, 3 대조립, 4 선행의장).
 * 한 순환(약 110초)에 블록 하나(12 × 8 × 3 m, 이중저 모양)를 만든다.
 *  1 소조립: 정반 위 강판에 보강재 5개를 세우고 용접 로봇 5대가 따라가며 용접 → 판넬
 *  2 중·대조립: 크레인이 판넬을 대조립장으로 옮기고, 미리 짜 둔 늑판·거더 묶음과 위판을 차례로 덮어 용접
 *  3 선행의장: 블록을 의장장 받침대로 옮겨 배관 3줄과 받침을 단다
 *  4 반출: 트랜스포터가 밑으로 들어가 블록을 받쳐 들고 열린 면으로 나간다(다음 장소 PE장 쪽)
 * 좌표는 건물 중심 바닥이 원점. 열린 면은 -z(도로 쪽). 도로에서 보면 +x 가 왼쪽이라,
 * 작업이 화면 왼쪽에서 오른쪽으로 읽히도록 소조립을 +x 끝, 의장을 -x 끝에 둔다.
 */
import * as THREE from 'three';
import { buildShed, overheadCrane, craneSteps, part, boxG, FM, std, sequence, lerp, inOut, sparks, type Step } from './shed';

const L = 90;
const W = 44;
const H = 26;

const BL = 12; // 블록 길이(x)
const BW = 8; // 폭(z)
const PT = 0.3; // 판 두께
const WEB_H = 2.4;
const STIFF_Z = [-3, -1.5, 0, 1.5, 3];

const P1 = { x: 28, y: 0.8 }; // 소조립 정반
const P2 = { x: 0, y: 0.8 }; // 대조립 받침
const P3 = { x: -28, y: 2.6 }; // 의장 받침(트랜스포터가 밑으로 들어갈 높이)
const RACK_WEB = { x: 10, z: 13 };
const RACK_TOP = { x: -12, z: 13 };
const SAFE = 12;
const DROP = 2.2; // 훅에서 스프레더 아래 고리까지

const M = {
  plate: std(0x6f6a62, 0.8, 0.3),
  web: std(0x7d776c, 0.8, 0.3),
  pipeG: std(0x2f8f4e, 0.5, 0.3),
  pipeY: std(0xd8b04a, 0.5, 0.3),
  pipeS: std(0x8c96a0, 0.45, 0.5),
  robot: std(0xe07a1f, 0.5, 0.3),
  truck: std(0xe0a91c, 0.6, 0.2),
};

function webUnit() {
  const g = new THREE.Group();
  for (const x of [-4, 0, 4]) part(g, boxG(0.25, WEB_H, BW - 0.2), M.web, x, WEB_H / 2, 0);
  for (const z of [-2.25, 2.25]) part(g, boxG(BL - 0.2, WEB_H, 0.25), M.web, 0, WEB_H / 2, z);
  return g;
}
function topPanel() {
  const g = new THREE.Group();
  part(g, boxG(BL, PT, BW), M.plate, 0, PT / 2, 0);
  return g;
}

export function createAssembly(scene: THREE.Scene, at: [number, number, number]) {
  const root = new THREE.Group();
  root.position.set(at[0], 0, at[2]);
  scene.add(root);
  const shed = buildShed(L, W, H, -1);
  root.add(shed.group);

  // ── 고정 설비: 정반, 대조립 받침, 의장 받침, 자재 받침, 배관 받침대 ──
  part(root, boxG(BL + 2, P1.y, BW + 2), FM.dark, P1.x, P1.y / 2, 0, false);
  for (let x = P1.x - 6; x <= P1.x + 6; x += 2) part(root, boxG(0.15, 0.05, BW + 2), FM.steel, x, P1.y + 0.02, 0, false);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) part(root, boxG(1, P2.y, 1), FM.steel, P2.x + sx * 4.5, P2.y / 2, sz * 3);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) part(root, boxG(1, P3.y, 1), FM.column, P3.x + sx * 5.4, P3.y / 2, sz * 3);
  for (const r of [RACK_WEB, RACK_TOP]) part(root, boxG(BL + 1, 0.4, BW + 1), std(0x3d4148, 0.8, 0.4), r.x, 0.2, r.z, false);
  // 배관 받침대(뒤쪽)와 쌓인 관
  part(root, boxG(14, 1.2, 3), FM.steel, -30, 0.6, 15);
  for (let i = 0; i < 6; i++) {
    const p = part(root, new THREE.CylinderGeometry(0.25, 0.25, 12, 10), [M.pipeG, M.pipeY, M.pipeS][i % 3], -30, 1.45 + Math.floor(i / 3) * 0.5, 14 + (i % 3) * 0.6);
    p.rotation.z = Math.PI / 2;
  }

  // ── 천장 크레인 + 스프레더(네 귀퉁이 고리) ──
  const crane = overheadCrane(W, shed.railY);
  root.add(crane.bridge);
  crane.bridge.position.x = 10;
  crane.trolley.position.z = 8;
  part(crane.hook, boxG(10, 0.35, 0.6), FM.crane, 0, -1.0, 0);
  for (const dx of [-4.6, 4.6])
    for (const dz of [-0.25, 0.25]) {
      const c = part(crane.hook, new THREE.CylinderGeometry(0.05, 0.05, 1.2, 6), FM.steel, dx, -1.75, dz, false);
      c.rotation.x = dz * 0.6;
    }

  // ── 용접 로봇 5대(소조립 보강재마다 하나) ──
  const robots = STIFF_Z.map((z) => {
    const r = new THREE.Group();
    part(r, boxG(0.8, 0.5, 0.6), M.robot, 0, 0.25, 0);
    const arm = part(r, boxG(0.18, 0.9, 0.18), M.robot, 0.2, 0.75, 0);
    arm.rotation.z = -0.5;
    r.position.set(P1.x - 5.5, P1.y + PT, z + 0.55);
    r.visible = false;
    root.add(r);
    return r;
  });
  const fx = sparks(root, 600, [0.85, 0.92, 1]);
  const weldLight = new THREE.PointLight(0xbcd6ff, 0, 40, 2);
  root.add(weldLight);
  let welds: THREE.Vector3[] = [];

  // ── 트랜스포터(작은 것, 블록 받침 사이로 들어감) ──
  const truck = new THREE.Group();
  part(truck, boxG(9, 0.7, 5), M.truck, 0, 1.65, 0);
  for (let x = -3.6; x <= 3.6; x += 1.8)
    for (const z of [-2, 2]) {
      const w = part(truck, new THREE.CylinderGeometry(0.55, 0.55, 0.6, 12), FM.dark, x, 0.55, z);
      w.rotation.x = Math.PI / 2;
    }
  part(truck, boxG(1.2, 1.2, 1.6), M.truck, 0, 2.6, -3.2);
  truck.visible = false;
  root.add(truck);
  const TRUCK_OUT = -48; // 열린 면 밖 도로 쪽

  // ── 순환마다 새로 만드는 것 ──
  let block = new THREE.Group();
  let stiffs: THREE.Mesh[] = [];
  let web = webUnit();
  let top = topPanel();
  let pipes: THREE.Mesh[] = [];
  let blockTop = PT;

  function disposeTree(o: THREE.Object3D) {
    o.parent?.remove(o);
    o.traverse((c) => (c as THREE.Mesh).geometry?.dispose());
  }
  function fresh() {
    disposeTree(block);
    disposeTree(web);
    disposeTree(top);
    block = new THREE.Group();
    part(block, boxG(BL, PT, BW), M.plate, 0, PT / 2, 0);
    block.position.set(P1.x, P1.y, 0);
    root.add(block);
    stiffs = STIFF_Z.map((z) => {
      const s = part(block, boxG(BL - 0.4, 0.5, 0.2), M.web, 0, PT + 0.25, z);
      s.visible = false;
      return s;
    });
    pipes = [
      [-2.2, 0.3, M.pipeG],
      [0, 0.22, M.pipeY],
      [2.2, 0.26, M.pipeS],
    ].map(([z, r, m]) => {
      const p = part(block, new THREE.CylinderGeometry(r as number, r as number, BL - 1, 12), m as THREE.Material, 0, 99, z as number);
      p.rotation.z = Math.PI / 2;
      p.visible = false;
      return p;
    });
    web = webUnit();
    web.position.set(RACK_WEB.x, 0.4, RACK_WEB.z);
    root.add(web);
    top = topPanel();
    top.position.set(RACK_TOP.x, 0.4, RACK_TOP.z);
    root.add(top);
    blockTop = PT;
  }

  // ── 단계 도우미 ──
  const { craneTo, hookTo, grab, release } = craneSteps(root, crane);
  const weld = (pts: () => THREE.Vector3[], dur: number, label: string, apply?: (k: number) => void): Step => ({
    dur,
    label,
    enter: () => (welds = pts()),
    apply: (k) => {
      apply?.(k);
      if (k >= 1) welds = [];
    },
  });

  const L1 = '소조립 — 강판 위에 보강재를 세움';
  const L2 = '소조립 — 용접 로봇 5대가 보강재를 따라 용접';
  const L3 = '중조립 — 판넬을 대조립장으로 옮김';
  const L4 = '대조립 — 미리 짜 둔 늑판·거더 묶음을 올림';
  const L5 = '대조립 — 이음매 용접';
  const L6 = '대조립 — 위판(내저판)을 덮음';
  const L7 = '선행의장 — 블록을 의장장으로 옮김';
  const L8 = '선행의장 — 배관과 받침을 미리 닮';
  const L9 = '반출 — 트랜스포터가 블록을 싣고 PE장으로';

  fresh();
  const main = sequence(() => {
    const steps: Step[] = [{ dur: 2, label: L1, enter: fresh }];
    // 보강재를 하나씩 내려 세움
    STIFF_Z.forEach((_, i) => {
      steps.push({
        dur: 1.1,
        label: L1,
        enter: () => (stiffs[i].visible = true),
        apply: (k) => (stiffs[i].position.y = PT + 0.25 + (1 - inOut(k)) * 2.5),
      });
    });
    steps.push(
      { dur: 0.6, label: L2, enter: () => robots.forEach((r) => (r.visible = true)) },
      weld(
        () => robots.map((r) => r.position.clone()),
        9,
        L2,
        (k) => {
          robots.forEach((r, i) => {
            r.position.x = P1.x - 5.5 + 11 * k;
            welds[i]?.set(r.position.x + 0.5, r.position.y + 0.1, r.position.z - 0.45);
          });
        },
      ),
      {
        dur: 0.6,
        label: L3,
        enter: () => {
          robots.forEach((r) => (r.visible = false));
          blockTop = PT + 0.5;
        },
      },
      craneTo(P1.x, 0, 4, L3),
      hookTo(() => P1.y + blockTop + DROP, 3, L3),
      grab(() => block, L3),
      hookTo(() => SAFE, 3, L3),
      craneTo(P2.x, 0, 4, L3),
      hookTo(() => P2.y + blockTop + DROP, 3, L3),
      release(() => block, () => root, L3),
      // 늑판·거더 묶음
      hookTo(() => SAFE, 2, L4),
      craneTo(RACK_WEB.x, RACK_WEB.z, 4, L4),
      hookTo(() => 0.4 + WEB_H + DROP, 3, L4),
      grab(() => web, L4),
      hookTo(() => SAFE, 3, L4),
      craneTo(P2.x, 0, 4, L4),
      hookTo(() => P2.y + PT + WEB_H + DROP, 3, L4),
      {
        ...release(() => web, () => block, L4),
        enter: () => {
          root.updateMatrixWorld(true);
          block.attach(web);
          blockTop = PT + WEB_H;
        },
      },
      hookTo(() => SAFE, 2, L5),
      weld(
        () =>
          [-4, 0, 4].flatMap((x) => [
            new THREE.Vector3(P2.x + x + 0.2, P2.y + PT + 0.1, -2.25 - 0.2),
            new THREE.Vector3(P2.x + x - 0.2, P2.y + PT + 0.1, 2.25 + 0.2),
          ]),
        6,
        L5,
      ),
      // 위판
      craneTo(RACK_TOP.x, RACK_TOP.z, 4, L6),
      hookTo(() => 0.4 + PT + DROP, 3, L6),
      grab(() => top, L6),
      hookTo(() => SAFE, 3, L6),
      craneTo(P2.x, 0, 4, L6),
      hookTo(() => P2.y + PT + WEB_H + PT + DROP, 3, L6),
      {
        dur: 0.8,
        label: L6,
        enter: () => {
          root.updateMatrixWorld(true);
          block.attach(top);
          blockTop = PT + WEB_H + PT;
        },
      },
      hookTo(() => SAFE - 3, 2, L5),
      weld(
        () =>
          [-5.8, 0, 5.8].flatMap((x) => [
            new THREE.Vector3(P2.x + x, P2.y + blockTop + 0.05, -BW / 2 + 0.1),
            new THREE.Vector3(P2.x + x * 0.6, P2.y + blockTop + 0.05, BW / 2 - 0.1),
          ]),
        6,
        L5,
      ),
      // 선행의장
      hookTo(() => P2.y + blockTop + DROP, 2.5, L7),
      grab(() => block, L7),
      hookTo(() => SAFE + 2, 3, L7),
      craneTo(P3.x, 0, 5, L7),
      hookTo(() => P3.y + blockTop + DROP, 3, L7),
      release(() => block, () => root, L7),
      hookTo(() => SAFE + 4, 2, L7),
    );
    // 배관: 받침대 쪽에서 들고 와 내려놓는 모습(작업자가 다는 일을 짧게)
    for (let i = 0; i < 3; i++) {
      const y1 = PT + WEB_H + PT + 0.6;
      steps.push({
        dur: 2.4,
        label: L8,
        enter: () => (pipes[i].visible = true),
        apply: (k) => (pipes[i].position.y = lerp(y1 + 5, y1, inOut(k))),
      });
    }
    steps.push(
      weld(
        () =>
          [-4, 0, 4].map((x, i) => new THREE.Vector3(P3.x + x, P3.y + PT + WEB_H + PT + 0.3, [-2.2, 0, 2.2][i])),
        4,
        L8,
      ),
      // 반출
      {
        dur: 5,
        label: L9,
        enter: () => {
          truck.visible = true;
          truck.position.set(P3.x, 0, TRUCK_OUT);
        },
        apply: (k) => (truck.position.z = lerp(TRUCK_OUT, 0, inOut(k))),
      },
      {
        dur: 1.5,
        label: L9,
        apply: (k) => {
          truck.position.y = lerp(0, P3.y - 2.0 + 0.05, k);
          block.position.y = Math.max(P3.y, truck.position.y + 2.0);
        },
      },
      {
        dur: 6,
        label: L9,
        enter: () => {
          root.updateMatrixWorld(true);
          truck.attach(block);
        },
        apply: (k) => (truck.position.z = lerp(0, TRUCK_OUT, inOut(k))),
      },
      {
        dur: 1,
        label: L9,
        enter: () => {
          truck.visible = false;
          block.visible = false;
        },
      },
    );
    return steps;
  });

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
