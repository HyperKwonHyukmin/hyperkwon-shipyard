/**
 * W4 도크 깊이(2026-11-15, PLAN.md 6장). 사용자: "안이 텅 비어 있다".
 * - 비계: 화물창 측벽 블록이 탑재되면 그 바깥 외판과 도크 벽 사이에 비계(수직관·수평관·발판)가 선다.
 *   블록마다 따로 두고, 그 블록이 앉은 뒤에만 보인다. 진수(물 채움) 중에는 걷는다(실제로도 물 채우기 전에 철거).
 * - 대기 블록: 도크 뒤 적치장(크레인 레일 바깥)에 다음 차례를 기다리는 블록.
 * 비계는 블록마다 부재를 합친 메시(재질 2개)라 그리기 호출은 비계 수 × 2.
 */
import * as THREE from 'three';
import type { Block } from './ship';
import { Parts } from './blockgen';
import { blockOnStools } from './factory/fill';

const PIPE = new THREE.MeshStandardMaterial({ color: 0xaab0b6, roughness: 0.5, metalness: 0.6 });
const PLANK = new THREE.MeshStandardMaterial({ color: 0x8a6a3e, roughness: 0.9 });

/** 외판(면 z = face, 바깥 방향 side)에 붙인 비계: x0~x1, 높이 y0~y1 */
function scaffold(x0: number, x1: number, y0: number, y1: number, face: number, side: 1 | -1) {
  const p = new Parts();
  const zi = face + side * 0.6; // 안쪽 줄(외판에서 0.6 m)
  const zo = face + side * 1.9; // 바깥 줄
  const zm = (zi + zo) / 2;
  const h = y1 - y0;
  for (let x = x0; x <= x1 + 0.01; x += 2.4)
    for (const z of [zi, zo]) p.box(PIPE, 0.08, h, 0.08, x, y0 + h / 2, z);
  for (let y = y0 + 2; y < y1; y += 2) {
    for (const z of [zi, zo]) p.box(PIPE, x1 - x0, 0.07, 0.07, (x0 + x1) / 2, y + 1.0, z); // 난간
    p.box(PLANK, x1 - x0, 0.06, 1.2, (x0 + x1) / 2, y, zm); // 발판
  }
  // 가새: 바깥 줄에 대각선(4.8 m 마다)
  for (let x = x0; x < x1 - 2; x += 4.8) {
    const len = Math.hypot(2.4, Math.min(4, h));
    const g = new THREE.BoxGeometry(len, 0.06, 0.06);
    g.rotateZ(Math.atan2(Math.min(4, h), 2.4));
    g.translate(x + 1.2, y0 + Math.min(4, h) / 2 + 1, zo);
    p.add(PIPE, g);
  }
  return p.build();
}

export interface DockWorkOptions {
  /** 도크 바닥 높이(월드 y) */
  floorY: number;
}

export function createDockWork(scene: THREE.Scene, blocks: Block[], o: DockWorkOptions) {
  const box = new THREE.Box3();
  const scaffolds: { id: string; index: number; g: THREE.Group }[] = [];
  blocks.forEach((b, index) => {
    if (!/^H\d-[SP]$/.test(b.id)) return; // 화물창 측벽만(선수·선미는 곡면이라 뺌)
    b.object.updateWorldMatrix(true, true);
    box.setFromObject(b.object);
    const side: 1 | -1 = b.id.endsWith('S') ? 1 : -1;
    const face = side > 0 ? box.max.z : box.min.z;
    const g = scaffold(box.min.x + 0.6, box.max.x - 0.6, o.floorY, box.max.y - 0.5, face, side);
    g.visible = false;
    scene.add(g);
    scaffolds.push({ id: b.id, index, g });
  });

  // 대기 블록: 도크 뒤 적치장(x -140 은 중앙로 위라 크레인 레일 z ±32 바깥에)
  const wait = new THREE.Group();
  const put = (g: THREE.Object3D, x: number, z: number) => {
    g.position.set(x, 0, z);
    wait.add(g);
  };
  put(blockOnStools('paintedL', 14, 10), -146, 47);
  put(blockOnStools('paintedDB', 14, 10), -124, 47);
  put(blockOnStools('paintedL', 14, 10), -136, -47);
  scene.add(wait);

  const up = new Set<string>();
  /** placed = 앉은 블록 수, launching = 진수 중 */
  function update(placed: number, launching: boolean) {
    for (const s of scaffolds) {
      const on = !launching && placed > s.index;
      s.g.visible = on;
      if (on) up.add(s.id);
      else up.delete(s.id);
    }
  }
  return { update, isUp: (id: string) => up.has(id), ids: scaffolds.map((s) => s.id) };
}
