/**
 * P2-5 블록 흐름 연결(가벼운 연결, 2026-11-13 사용자 결정).
 * 장소의 out 흐름마다 트랜스포터 한 대가 도로를 따라 오간다: 출발 장소 앞 → 도로 차선 → 도착 장소 앞(도크는 도크 뒤 적치장 앞).
 * 공장 안 순환과 시간을 맞추지는 않는다(흐름이 이어진다는 것만 보여 줌). 블록 기록(생애주기)은 만들지 않는다.
 * 좌표: 도로는 z = 0 을 따라 x 로 뻗고 반폭 20. +x 로 가는 차는 z = -7 차선, -x 로 가는 차는 z = +7 차선.
 */
import * as THREE from 'three';
import type { Station } from './content/stations';

const SPEED = 9; // m/s
const EDGE = 26; // 장소 앞(도로 가장자리 밖) z 거리
const LANE = 7;
const DECK = 2.0;
const DOCK_END_X = -205; // 도크로 가는 차는 도크 뒤 적치장 앞에서 멈춘다

function std(color: number, roughness = 0.7, metalness = 0.2) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}
const M = {
  truck: std(0xe0a91c, 0.6, 0.2),
  dark: std(0x1c1f24, 0.9),
  lamp: new THREE.MeshStandardMaterial({ color: 0xffa020, emissive: 0xffa020, emissiveIntensity: 3 }),
  primer: std(0x6f6a62, 0.8, 0.3),
  primer2: std(0x7d776c, 0.8, 0.3),
  painted: std(0x4f6a88, 0.55, 0.3),
  antifoul: std(0x8c3027, 0.7, 0.15),
  pallet: std(0x3d4148, 0.8, 0.4),
};

function box(g: THREE.Object3D, w: number, h: number, d: number, m: THREE.Material | THREE.Material[], x: number, y: number, z: number) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  g.add(mesh);
  return mesh;
}

function truck() {
  const g = new THREE.Group();
  box(g, 16, 0.7, 8, M.truck, 0, DECK - 0.35, 0);
  const wheel = new THREE.CylinderGeometry(0.55, 0.55, 0.6, 12);
  for (let x = -7; x <= 7; x += 2)
    for (const z of [-3.2, -1.1, 1.1, 3.2]) {
      const w = new THREE.Mesh(wheel, M.dark);
      w.rotation.x = Math.PI / 2;
      w.position.set(x, 0.55, z);
      g.add(w);
    }
  box(g, 2, 1.6, 2.2, M.truck, 8.6, DECK + 0.4, 2.6);
  box(g, 0.3, 0.3, 0.8, M.lamp, 8.6, DECK + 1.4, 2.6);
  return g;
}

/** 흐름마다 싣는 것: 출발 → 도착 장소로 고른다 */
function cargo(from: string, to: string) {
  const g = new THREE.Group();
  const a = M.antifoul;
  if (from === 'cutting') {
    // 팔레트에 쌓은 부재
    box(g, 12, 0.4, 6, M.pallet, 0, 0.2, 0);
    for (let i = 0; i < 4; i++) box(g, 10 - i * 1.2, 0.35, 5 - i * 0.6, M.primer, (i % 2) * 0.6, 0.6 + i * 0.37, 0);
  } else if (from === 'assembly') {
    box(g, 12, 3, 8, M.primer, 0, 1.5, 0);
  } else if (from === 'pe' && to === 'paint') {
    box(g, 14, 3, 7.5, M.primer, 0, 1.5, 0);
    box(g, 14, 7, 2, M.primer2, 0, 6.5, -2.75);
  } else if (from === 'paint') {
    box(g, 14, 3, 7.5, [a, a, M.painted, a, a, a], 0, 1.5, 0);
    box(g, 14, 7, 2, M.painted, 0, 6.5, -2.75);
  } else {
    // PE장 → 도크: U자 단면 큰 블록
    box(g, 14, 3, 12, [a, a, M.painted, a, a, a], 0, 1.5, 0);
    for (const z of [-5.2, 5.2]) box(g, 14, 7, 1.6, M.painted, 0, 6.5, z);
  }
  g.position.y = DECK;
  return g;
}

interface Run {
  pts: THREE.Vector3[];
  /** 꼭짓점까지의 누적 거리 */
  acc: number[];
  len: number;
  obj: THREE.Group;
  t: number;
  /** 다음 출발까지 쉬는 시간 */
  wait: number;
}

export function createTraffic(scene: THREE.Scene, stations: Station[]) {
  const byId = new Map(stations.map((s) => [s.id, s]));
  const runs: Run[] = [];
  for (const s of stations)
    for (const f of s.flow ?? []) {
      if (f.dir !== 'out') continue;
      const to = byId.get(f.to);
      if (!to) continue;
      const [x0, , z0] = s.at;
      const toDock = f.to === 'dock';
      const x1 = toDock ? DOCK_END_X : to.at[0];
      const lane = x1 > x0 ? -LANE : LANE;
      const pts = [
        new THREE.Vector3(x0, 0, Math.sign(z0) * EDGE),
        new THREE.Vector3(x0, 0, lane),
        new THREE.Vector3(x1, 0, lane),
        new THREE.Vector3(x1, 0, toDock ? lane : Math.sign(to.at[2]) * EDGE),
      ];
      const acc = [0];
      for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + pts[i].distanceTo(pts[i - 1]));
      const obj = truck();
      obj.add(cargo(s.id, f.to));
      obj.visible = false;
      scene.add(obj);
      // 처음 출발을 엇갈리게
      runs.push({ pts, acc, len: acc[acc.length - 1], obj, t: 0, wait: runs.length * 7 + 2 });
    }

  const dir = new THREE.Vector3();
  function place(r: Run, s: number) {
    let i = 1;
    while (i < r.acc.length - 1 && s > r.acc[i]) i++;
    const a = r.pts[i - 1];
    const b = r.pts[i];
    const k = THREE.MathUtils.clamp((s - r.acc[i - 1]) / (r.acc[i] - r.acc[i - 1] || 1), 0, 1);
    r.obj.position.lerpVectors(a, b, k);
    dir.subVectors(b, a);
    // 트랜스포터 긴 축(x)을 가는 방향으로. 옆으로 갈 때(z)는 옆걸음처럼 돌리지 않는다(실제 트랜스포터도 옆으로 감)
    if (Math.abs(dir.x) > Math.abs(dir.z)) r.obj.rotation.y = dir.x > 0 ? 0 : Math.PI;
  }

  function update(dt: number) {
    for (const r of runs) {
      if (r.wait > 0) {
        r.wait -= dt;
        if (r.wait <= 0) {
          r.t = 0;
          r.obj.visible = true;
        }
        continue;
      }
      r.t += dt;
      const s = r.t * SPEED;
      place(r, Math.min(s, r.len));
      if (s >= r.len + SPEED * 3) {
        // 도착해서 3초 머문 뒤 사라지고, 잠시 뒤 다시 출발
        r.obj.visible = false;
        r.wait = 8 + Math.random() * 10;
      }
    }
  }
  return { update };
}
