/**
 * 3단계: 블록 탑재 애니메이션.
 * 블록 하나마다: 트랜스포터가 도크 뒤 안벽의 적치장으로 실어 옴 → 크레인이 와서 훅을 내림 → 들어 올림
 * → 레일을 따라 자리로 이동 → 천천히 내려 앉힘 → 훅을 올리고 다음 블록. 26개를 다 올리면 잠시 뒤 처음부터.
 */
import * as THREE from 'three';
import type { Block } from './ship';

export interface Rig {
  crane: THREE.Object3D;
  trolley: THREE.Object3D;
  /** 훅 끝(블록 윗면이 닿는 점)의 높이를 월드 y 로 맞춘다 */
  setHookPoint: (y: number) => void;
  getHookPoint: () => number;
}
export interface ErectionOptions {
  stageX: number;
  groundY: number;
  /** 훅이 블록을 들고 이동할 때의 높이(월드 y) */
  safeY: number;
  /** 처음부터 앉아 있을 블록 수 */
  placed: number;
  /** 탑재 상태가 바뀔 때. placed = 지금까지 자리에 앉은 블록 수 */
  onStatus: (text: string, placed: number) => void;
  /** true 면 다 쌓은 뒤 저절로 다시 시작하지 않고 기다린다(진수가 끝나면 밖에서 setPlaced(0)) */
  holdAtEnd?: boolean;
  /** 블록이 자리에 앉은 순간(용접 시작 등). box 는 제자리에서의 월드 경계 상자 */
  onPlaced?: (box: THREE.Box3) => void;
}

const DECK_TOP = 2.2; // 트랜스포터 적재면 높이
const TRUCK_FROM = -150; // 트랜스포터가 적치장에서 이만큼 떨어진 곳에서 출발

interface Step {
  dur: number;
  carry: 'truck' | 'hook' | 'placed';
  apply: (k: number) => void;
}

const lerp = THREE.MathUtils.lerp;
const inOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const out = (t: number) => 1 - (1 - t) ** 3;

function transporter() {
  const g = new THREE.Group();
  const yellow = new THREE.MeshStandardMaterial({ color: 0xe0a91c, roughness: 0.6, metalness: 0.2 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1c1f24, roughness: 0.9 });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(34, 1.0, 11), yellow);
  deck.position.y = DECK_TOP - 0.5;
  g.add(deck);
  const wheel = new THREE.CylinderGeometry(0.55, 0.55, 0.6, 12);
  for (let x = -15; x <= 15; x += 2.5)
    for (const z of [-5, -2, 2, 5]) {
      const w = new THREE.Mesh(wheel, dark);
      w.rotation.x = Math.PI / 2;
      w.position.set(x, 0.55, z);
      g.add(w);
    }
  const cab = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.2, 3), yellow);
  cab.position.set(18, DECK_TOP + 0.6, -3.5);
  g.add(cab);
  const lamp = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.3, 0.8),
    new THREE.MeshStandardMaterial({ color: 0xffa020, emissive: 0xffa020, emissiveIntensity: 3 }),
  );
  lamp.position.set(18, DECK_TOP + 1.9, -3.5);
  g.add(lamp);
  g.traverse((o) => {
    (o as THREE.Mesh).castShadow = true;
    (o as THREE.Mesh).receiveShadow = true;
  });
  return g;
}

export function createErection(scene: THREE.Scene, rig: Rig, blocks: Block[], opt: ErectionOptions) {
  scene.updateMatrixWorld(true);
  // 각 블록이 제자리에 있을 때의 윗면 중심(훅이 잡는 점)과 높이
  const info = blocks.map((b) => {
    b.object.position.set(0, 0, 0);
    const box = new THREE.Box3().setFromObject(b.object);
    const c = box.getCenter(new THREE.Vector3());
    return { box, cx: c.x, cz: c.z, top: box.max.y, h: box.max.y - box.min.y };
  });

  const truck = transporter();
  truck.position.set(opt.stageX + TRUCK_FROM, opt.groundY, 0);
  truck.visible = false;
  scene.add(truck);

  let index = 0;
  let steps: Step[] = [];
  let s = 0;
  let elapsed = 0;
  let holdDone = 0;

  function reset(placed: number) {
    blocks.forEach((b, i) => {
      b.object.visible = i < placed;
      b.object.position.set(0, 0, 0);
    });
    index = placed;
    holdDone = 0;
    begin();
  }

  function status() {
    const n = blocks.length;
    if (index >= n) opt.onStatus(`${n}/${n} 탑재 완료 · ${opt.holdAtEnd ? '진수 준비' : '곧 다음 배'}`, n);
    else opt.onStatus(`${index}/${n} 탑재 · 지금 ${blocks[index].name}`, index);
  }

  function begin() {
    s = 0;
    elapsed = 0;
    status();
    if (index >= blocks.length) {
      steps = [];
      truck.visible = false;
      return;
    }
    const f = info[index];
    const stageHook = opt.groundY + DECK_TOP + f.h;
    const cx0 = rig.crane.position.x;
    const tz0 = rig.trolley.position.z;
    const hy0 = rig.getHookPoint();
    const truckFrom = opt.stageX + TRUCK_FROM;
    truck.visible = true;
    truck.position.set(truckFrom, opt.groundY, f.cz);
    blocks[index].object.visible = true;

    steps = [
      {
        // 블록 도착 + 크레인이 적치장으로
        dur: Math.max(8, Math.abs(opt.stageX - cx0) / 20),
        carry: 'truck',
        apply: (k) => {
          rig.crane.position.x = lerp(cx0, opt.stageX, inOut(k));
          rig.trolley.position.z = lerp(tz0, f.cz, inOut(k));
          rig.setHookPoint(lerp(hy0, opt.safeY, inOut(Math.min(1, k * 2))));
          truck.position.x = lerp(truckFrom, opt.stageX, out(k));
        },
      },
      { dur: 4, carry: 'truck', apply: (k) => rig.setHookPoint(lerp(opt.safeY, stageHook, inOut(k))) },
      { dur: 1, carry: 'hook', apply: () => {} },
      { dur: 5, carry: 'hook', apply: (k) => rig.setHookPoint(lerp(stageHook, opt.safeY, inOut(k))) },
      {
        // 레일을 따라 자리로. 트랜스포터는 돌아간다
        dur: 4 + Math.abs(f.cx - opt.stageX) / 16,
        carry: 'hook',
        apply: (k) => {
          rig.crane.position.x = lerp(opt.stageX, f.cx, inOut(k));
          truck.position.x = lerp(opt.stageX, truckFrom, inOut(Math.min(1, k * 1.4)));
        },
      },
      { dur: 7, carry: 'hook', apply: (k) => rig.setHookPoint(lerp(opt.safeY, f.top, out(k))) },
      { dur: 3, carry: 'placed', apply: (k) => rig.setHookPoint(lerp(f.top, f.top + 10, inOut(k))) },
    ];
    steps[0].apply(0);
  }

  /** 블록을 지금 들고 있는 곳(트랜스포터 위·훅 아래·제자리)에 놓는다 */
  function carry(mode: Step['carry']) {
    const b = blocks[index];
    const f = info[index];
    if (mode === 'placed') {
      b.object.position.set(0, 0, 0);
      return;
    }
    const p =
      mode === 'truck'
        ? new THREE.Vector3(truck.position.x, opt.groundY + DECK_TOP + f.h, f.cz)
        : new THREE.Vector3(rig.crane.position.x, rig.getHookPoint(), rig.trolley.position.z);
    b.object.position.set(p.x - f.cx, p.y - f.top, p.z - f.cz);
  }

  function update(dt: number) {
    if (index >= blocks.length) {
      if (opt.holdAtEnd) return;
      holdDone += dt;
      if (holdDone > 12) reset(0);
      return;
    }
    const step = steps[s];
    elapsed += dt;
    const k = Math.min(1, elapsed / step.dur);
    step.apply(k);
    carry(step.carry);
    if (k >= 1) {
      elapsed = 0;
      s++;
      if (step.carry === 'hook' && steps[s]?.carry === 'placed') opt.onPlaced?.(info[index].box);
      if (s >= steps.length) {
        index++;
        if (index >= blocks.length) truck.visible = false;
        begin();
      }
    }
  }

  reset(Math.min(Math.max(0, opt.placed), blocks.length));

  // ── 직접 운전(operate.ts, 2026-11-14): 자동 탑재를 멈추고 지금 블록을 사용자에게 넘긴다 ──
  /** 지금 블록을 트랜스포터에 실어 적치장에 세워 두고 넘긴다. 다 쌓았으면 null */
  function hand() {
    if (index >= blocks.length) return null;
    const f = info[index];
    truck.visible = true;
    truck.position.set(opt.stageX, opt.groundY, f.cz);
    blocks[index].object.visible = true;
    carry('truck');
    return {
      name: blocks[index].name,
      /** 제자리의 경계 상자(월드) */
      box: f.box,
      /** 트랜스포터 위에서의 윗면 중심 */
      pickup: new THREE.Vector3(opt.stageX, opt.groundY + DECK_TOP + f.h, f.cz),
      height: f.h,
    };
  }
  /** 블록 윗면 중심을 이 점에 둔다(훅에 매달린 동안) */
  function carryAt(x: number, top: number, z: number) {
    const f = info[index];
    blocks[index].object.position.set(x - f.cx, top - f.top, z - f.cz);
  }
  /** 제자리에 앉힘: 용접을 시작하고 다음 블록으로(자동 탑재는 밖에서 update 를 다시 부르면 이어짐) */
  function landed() {
    blocks[index].object.position.set(0, 0, 0);
    opt.onPlaced?.(info[index].box);
    index++;
    if (index >= blocks.length) truck.visible = false;
    begin();
  }
  /** 이미 앉은 블록들의 경계 상자 */
  const placedBoxes = () => info.slice(0, index).map((f) => f.box);

  return {
    hand,
    carryAt,
    landed,
    placedBoxes,
    /** 직접 운전을 그만둘 때: 지금 블록을 처음부터 다시 자동으로 */
    resume: () => reset(index),
    update,
    /** 지금까지 앉은 블록 수 */
    placed: () => index,
    /** 건조 시점 막대: n 개가 앉은 상태로 옮기고 다음 블록부터 이어서 탑재 */
    setPlaced: (n: number) => reset(Math.min(Math.max(0, Math.round(n)), blocks.length)),
  };
}
