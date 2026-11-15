/**
 * P2-5 블록 흐름 연결(가벼운 연결, 2026-11-13 사용자 결정).
 * 장소의 out 흐름마다 트랜스포터 한 대가 도로를 따라 오간다: 출발 장소 앞 → 도로 차선 → 도착 장소 앞(도크는 도크 뒤 적치장 앞).
 * 공장 안 순환과 시간을 맞추지는 않는다(흐름이 이어진다는 것만 보여 줌). 블록 기록(생애주기)은 만들지 않는다.
 * 경로는 layout.ts 의 도로망에서 나온다(가운데 선을 진행 방향 오른쪽 차선으로 6 m 옮김).
 */
import * as THREE from 'three';
import type { Station } from './content/stations';
import { routeBetween } from './layout';
import { doubleBottom, sideShell, BM, seams } from './blockgen';

const SPEED = 9; // m/s
const LANE = 6;
const DECK = 2.0;

function std(color: number, roughness = 0.7, metalness = 0.2) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}
const M = {
  truck: std(0xe0a91c, 0.6, 0.2),
  dark: std(0x1c1f24, 0.9),
  lamp: new THREE.MeshStandardMaterial({ color: 0xffa020, emissive: 0xffa020, emissiveIntensity: 3 }),
  primer: std(0x6f6a62, 0.8, 0.3),
  primer2: std(0x7d776c, 0.8, 0.3),
  painted: seams(std(0x4f6a88, 0.55, 0.3)),
  antifoul: seams(std(0x8c3027, 0.7, 0.15)),
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
  } else {
    // 2026-11-14 W1: 상자 → blockgen 구조 블록(판·늑판·늑골)
    const painted = from === 'paint' || (from === 'pe' && to !== 'paint');
    const w = from === 'assembly' ? 8 : from === 'pe' && to !== 'paint' ? 12 : 7.5;
    const l = from === 'assembly' ? 12 : 14;
    g.add(doubleBottom({ l, w, h: 3, shell: painted ? a : BM.primer, inner: painted ? M.painted : BM.primer, frame: painted ? M.painted : BM.primerDark }).build());
    const sides: [number, 1 | -1][] = from === 'assembly' ? [] : from === 'pe' && to !== 'paint' ? [[-5.2, -1], [5.2, 1]] : [[-2.75, -1]];
    for (const [z, s] of sides) {
      const sd = sideShell({ l, h: 7, w: from === 'pe' && to !== 'paint' ? 1.6 : 2, side: s, shell: painted ? M.painted : BM.primer, frame: painted ? M.painted : BM.primerDark }).build();
      sd.position.set(0, 3, z);
      g.add(sd);
    }
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
      const toDock = f.to === 'dock';
      // 길 가운데 선 경로(layout.ts)를 진행 방향 오른쪽 차선으로 옮긴다. 처음과 끝(장소 앞)은 그대로
      const path = routeBetween(s.at, toDock ? null : to.at);
      const lastRoad = toDock ? path.length - 1 : path.length - 2; // 길 위에 있는 마지막 점
      const normal = (i: number): [number, number] | null => {
        // i 번째 구간(path[i] → path[i+1])의 오른쪽 방향. 길 위 구간만
        if (i < 1 || i + 1 > lastRoad) return null;
        const dx = path[i + 1][0] - path[i][0];
        const dz = path[i + 1][1] - path[i][1];
        const len = Math.hypot(dx, dz);
        return len < 0.01 ? null : [dz / len, -dx / len];
      };
      const pts = path.map(([x, z], j) => {
        if (j < 1 || j > lastRoad) return new THREE.Vector3(x, 0, z);
        const n0 = normal(j - 1);
        const n1 = normal(j);
        let ox = (n0?.[0] ?? 0) + (n1?.[0] ?? 0);
        let oz = (n0?.[1] ?? 0) + (n1?.[1] ?? 0);
        // 같은 방향 구간 둘이 만나면 한 번만
        if (n0 && n1 && Math.abs(n0[0] - n1[0]) + Math.abs(n0[1] - n1[1]) < 0.01) {
          ox = n0[0];
          oz = n0[1];
        }
        return new THREE.Vector3(x + ox * LANE, 0, z + oz * LANE);
      });
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
  /** 지금 다니는 트랜스포터의 자리와 속도(걷기 모드의 충돌용). 짐까지 덮는 사각형 */
  const prev = new Map<Run, THREE.Vector3>();
  function movers(dt: number) {
    const out: { x: number; z: number; hx: number; hz: number; vx: number; vz: number }[] = [];
    for (const r of runs) {
      if (!r.obj.visible) {
        prev.delete(r);
        continue;
      }
      const p = prev.get(r);
      const vx = p && dt > 0 ? (r.obj.position.x - p.x) / dt : 0;
      const vz = p && dt > 0 ? (r.obj.position.z - p.z) / dt : 0;
      if (p) p.copy(r.obj.position);
      else prev.set(r, r.obj.position.clone());
      out.push({ x: r.obj.position.x, z: r.obj.position.z, hx: 9.6, hz: 6.2, vx, vz });
    }
    return out;
  }
  return { update, movers };
}
