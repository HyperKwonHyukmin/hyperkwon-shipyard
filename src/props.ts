/**
 * 걷기 모드의 부딪히는 물건(2026-11-13 사용자: "부딪히는 물리 효과도 필요").
 * 야드 곳곳의 안전 고깔, 드럼통, 나무 상자. 주인공이나 자전거, 트랜스포터가 치면 밀려나고 튀고 구르고 넘어진다.
 * 물리 엔진을 들이지 않고 필요한 만큼만 직접 계산한다:
 * - 물건은 바닥 위의 원(반지름 r)으로 본다. 미는 쪽(주인공, 트랜스포터)은 속도를 가진 사각형.
 * - 부딪히면 겹침을 풀고, 다가오던 속도만큼 튕겨 나간다. 살짝 뜨고(중력으로 다시 떨어짐), 굴러간다.
 * - 벽·건물·도크·바다는 걷기 모드와 같은 판정(blocked)을 써서 넘어가지 못한다. 물건끼리도 부딪힌다.
 * - 멈추면 가까운 자세(선 자세 또는 누운 자세)로 자리를 잡는다.
 * 그리기는 종류별 InstancedMesh 3개(그리기 호출 3번).
 */
import * as THREE from 'three';
import type { Station } from './content/stations';
import { doorOf, FOOTPRINT } from './layout';

/** 미는 것: 가운데와 반크기, 속도(m/s) */
export interface Pusher {
  x: number;
  z: number;
  hx: number;
  hz: number;
  vx: number;
  vz: number;
}

interface Kind {
  r: number; // 바닥에서 본 반지름
  up: number; // 서 있을 때 중심 높이
  lie: number; // 누웠을 때 중심 높이
  roll: boolean; // 구르는가(아니면 미끄러짐)
  friction: number;
}
const KINDS: Record<'cone' | 'drum' | 'crate', Kind> = {
  cone: { r: 0.36, up: 0.4, lie: 0.3, roll: true, friction: 2.2 },
  drum: { r: 0.46, up: 0.56, lie: 0.46, roll: true, friction: 0.9 },
  crate: { r: 0.62, up: 0.5, lie: 0.5, roll: false, friction: 3.2 },
};
type KindName = keyof typeof KINDS;

interface Item {
  kind: KindName;
  slot: number;
  p: THREE.Vector3;
  v: THREE.Vector3;
  q: THREE.Quaternion;
  w: THREE.Vector3; // 각속도
  rest: boolean;
}

function stripeTexture(stops: [number, string][]) {
  const c = document.createElement('canvas');
  c.width = 8;
  c.height = 64;
  const g = c.getContext('2d')!;
  let y = 0;
  for (const [h, col] of stops) {
    g.fillStyle = col;
    g.fillRect(0, y, 8, h);
    y += h;
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createProps(scene: THREE.Scene, stations: Station[], blocked: (x: number, z: number, r: number) => boolean) {
  // ── 놓을 자리 ──
  const want: { kind: KindName; x: number; z: number }[] = [];
  for (const s of stations) {
    if (!FOOTPRINT[s.id]) continue;
    const d = doorOf(s.at);
    const side = Math.sign(s.at[2] - d.road.at) || 1;
    const edge = d.road.at + side * (d.road.half + 1.2);
    // 횡단보도 양옆 고깔
    for (const dx of [30, 38]) for (const k of [0, 1.6]) want.push({ kind: 'cone', x: s.at[0] + dx, z: edge + side * k });
    // 장소 앞 드럼통 줄과 상자
    for (let i = 0; i < 4; i++) want.push({ kind: 'drum', x: d.front[0] - 14 - i * 1.15, z: d.front[1] + side * 2.5 });
    for (let i = 0; i < 3; i++) want.push({ kind: 'crate', x: d.front[0] + 12 + (i % 2) * 1.5, z: d.front[1] + side * (2 + Math.floor(i / 2) * 1.5) });
  }
  // 도크 뒤 가장자리 고깔 줄, 중앙로 가운데 드문드문
  for (let z = -21; z <= 21; z += 6) want.push({ kind: 'cone', x: -114, z });
  for (let x = -660; x < -200; x += 55) want.push({ kind: 'cone', x, z: 21.5 }, { kind: 'cone', x: x + 20, z: -21.5 });
  for (let i = 0; i < 6; i++) want.push({ kind: 'drum', x: -134 + (i % 3) * 1.1, z: 52 + Math.floor(i / 3) * 1.1 });
  for (let i = 0; i < 5; i++) want.push({ kind: 'crate', x: -684 + i * 1.5, z: -26 - (i % 2) * 1.4 });

  const items: Item[] = [];
  const count: Record<KindName, number> = { cone: 0, drum: 0, crate: 0 };
  for (const w of want) {
    const k = KINDS[w.kind];
    if (blocked(w.x, w.z, k.r)) continue;
    items.push({
      kind: w.kind,
      slot: count[w.kind]++,
      p: new THREE.Vector3(w.x, k.up, w.z),
      v: new THREE.Vector3(),
      q: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (items.length * 2.399) % 6.283), // 열 때마다 같은 방향
      w: new THREE.Vector3(),
      rest: true,
    });
  }

  // ── 모양(중심이 원점) ──
  const coneGeo = new THREE.LatheGeometry(
    [
      [0.36, 0],
      [0.36, 0.06],
      [0.25, 0.06],
      [0.05, 0.8],
      [0, 0.8],
    ].map(([x, y]) => new THREE.Vector2(x, y)),
    16,
  );
  coneGeo.translate(0, -0.4, 0);
  const drumGeo = new THREE.CylinderGeometry(0.46, 0.46, 1.12, 18);
  const crateGeo = new THREE.BoxGeometry(1, 1, 1);
  const meshes: Record<KindName, THREE.InstancedMesh> = {
    cone: new THREE.InstancedMesh(
      coneGeo,
      new THREE.MeshStandardMaterial({ map: stripeTexture([[14, '#f26a1b'], [10, '#f4f4f0'], [12, '#f26a1b'], [8, '#f4f4f0'], [20, '#f26a1b']]), roughness: 0.6 }),
      Math.max(1, count.cone),
    ),
    drum: new THREE.InstancedMesh(
      drumGeo,
      new THREE.MeshStandardMaterial({ map: stripeTexture([[6, '#e9e9e9'], [2, '#9a9a9a'], [18, '#e9e9e9'], [2, '#9a9a9a'], [18, '#e9e9e9'], [2, '#9a9a9a'], [16, '#e9e9e9']]), roughness: 0.45, metalness: 0.5 }),
      Math.max(1, count.drum),
    ),
    crate: new THREE.InstancedMesh(
      crateGeo,
      new THREE.MeshStandardMaterial({ map: stripeTexture([[2, '#6a4a2a'], [18, '#b98a55'], [2, '#6a4a2a'], [20, '#c1925c'], [2, '#6a4a2a'], [18, '#b98a55'], [2, '#6a4a2a']]), roughness: 0.85 }),
      Math.max(1, count.crate),
    ),
  };
  const DRUM_COLORS = [0x2f6fb5, 0xc23b2e, 0xe0b020, 0x2f6fb5];
  const col = new THREE.Color();
  const m4 = new THREE.Matrix4();
  const one = new THREE.Vector3(1, 1, 1);
  for (const k of Object.keys(meshes) as KindName[]) {
    meshes[k].count = count[k];
    meshes[k].castShadow = true;
    meshes[k].receiveShadow = true;
    meshes[k].frustumCulled = false; // 인스턴스가 야드 전체에 흩어져 있다
    scene.add(meshes[k]);
  }
  const write = (it: Item) => meshes[it.kind].setMatrixAt(it.slot, m4.compose(it.p, it.q, one));
  for (const it of items) {
    write(it);
    if (it.kind === 'drum') meshes.drum.setColorAt(it.slot, col.setHex(DRUM_COLORS[it.slot % DRUM_COLORS.length]));
  }
  for (const k of Object.keys(meshes) as KindName[]) {
    meshes[k].instanceMatrix.needsUpdate = true;
    if (meshes[k].instanceColor) meshes[k].instanceColor!.needsUpdate = true;
  }

  const UP = new THREE.Vector3(0, 1, 0);
  const axis = new THREE.Vector3();
  const dq = new THREE.Quaternion();
  const want2 = new THREE.Quaternion();
  const upNow = new THREE.Vector3();
  const G = 22;

  function kick(it: Item, nx: number, nz: number, speed: number) {
    it.v.x += nx * (speed * 1.25 + 0.8);
    it.v.z += nz * (speed * 1.25 + 0.8);
    if (it.p.y <= KINDS[it.kind].up + 0.05) it.v.y = Math.min(7, 1.2 + speed * 0.28);
    // 치인 방향으로 넘어가게 돌린다
    it.w.x += -nz * speed * 0.9;
    it.w.z += nx * speed * 0.9;
    it.w.y += (Math.random() - 0.5) * speed * 0.6;
    it.rest = false;
  }

  function update(dt: number, pushers: Pusher[]) {
    const dirty: Record<KindName, boolean> = { cone: false, drum: false, crate: false };
    // 1) 미는 것과 부딪힘
    for (const it of items) {
      const k = KINDS[it.kind];
      for (const pu of pushers) {
        const cx = THREE.MathUtils.clamp(it.p.x, pu.x - pu.hx, pu.x + pu.hx);
        const cz = THREE.MathUtils.clamp(it.p.z, pu.z - pu.hz, pu.z + pu.hz);
        let nx = it.p.x - cx;
        let nz = it.p.z - cz;
        let d = Math.hypot(nx, nz);
        if (d >= k.r) continue;
        if (it.p.y > 2.2) continue; // 높이 뜬 것은 지나감
        if (d < 1e-4) {
          // 완전히 안에 들어옴: 미는 쪽이 가는 방향으로 밀어낸다
          const sp = Math.hypot(pu.vx, pu.vz) || 1;
          nx = pu.vx / sp || 1;
          nz = pu.vz / sp;
          d = 0;
        } else {
          nx /= d;
          nz /= d;
        }
        it.p.x += nx * (k.r - d);
        it.p.z += nz * (k.r - d);
        const approach = (pu.vx - it.v.x) * nx + (pu.vz - it.v.z) * nz;
        if (approach > 0) kick(it, nx, nz, approach);
        it.rest = false;
      }
    }
    // 2) 물건끼리
    for (let i = 0; i < items.length; i++) {
      const a = items[i];
      for (let j = i + 1; j < items.length; j++) {
        const b = items[j];
        if (a.rest && b.rest) continue;
        const rr = KINDS[a.kind].r + KINDS[b.kind].r;
        const dx = b.p.x - a.p.x;
        const dz = b.p.z - a.p.z;
        const d2 = dx * dx + dz * dz;
        if (d2 >= rr * rr || d2 < 1e-8 || Math.abs(a.p.y - b.p.y) > 1) continue;
        const d = Math.sqrt(d2);
        const nx = dx / d;
        const nz = dz / d;
        const push = (rr - d) / 2;
        a.p.x -= nx * push;
        a.p.z -= nz * push;
        b.p.x += nx * push;
        b.p.z += nz * push;
        const rel = (a.v.x - b.v.x) * nx + (a.v.z - b.v.z) * nz;
        if (rel > 0) {
          const imp = rel * 0.8;
          a.v.x -= nx * imp;
          a.v.z -= nz * imp;
          b.v.x += nx * imp;
          b.v.z += nz * imp;
          b.w.x += -nz * imp * 0.6;
          b.w.z += nx * imp * 0.6;
        }
        a.rest = b.rest = false;
      }
    }
    // 3) 움직임
    for (const it of items) {
      if (it.rest) continue;
      const k = KINDS[it.kind];
      dirty[it.kind] = true;
      // 서 있는가 누웠는가(물건의 위쪽이 얼마나 서 있는지)
      upNow.set(0, 1, 0).applyQuaternion(it.q);
      const standing = Math.abs(upNow.y) > 0.72;
      const floor = it.kind === 'crate' ? k.up : standing ? k.up : k.lie;
      it.v.y -= G * dt;
      const nx = it.p.x + it.v.x * dt;
      const nz = it.p.z + it.v.z * dt;
      if (blocked(nx, it.p.z, k.r)) it.v.x *= -0.35;
      else it.p.x = nx;
      if (blocked(it.p.x, nz, k.r)) it.v.z *= -0.35;
      else it.p.z = nz;
      it.p.y += it.v.y * dt;
      const onGround = it.p.y <= floor;
      if (onGround) {
        it.p.y = floor;
        if (it.v.y < -2.5) it.v.y *= -0.32;
        else it.v.y = 0;
        const f = Math.exp(-k.friction * dt);
        it.v.x *= f;
        it.v.z *= f;
        const sp = Math.hypot(it.v.x, it.v.z);
        if (k.roll && !standing && sp > 0.2) {
          // 누운 것은 가는 방향으로 굴러간다
          it.w.x = THREE.MathUtils.lerp(it.w.x, it.v.z / k.r, 0.3);
          it.w.z = THREE.MathUtils.lerp(it.w.z, -it.v.x / k.r, 0.3);
          it.w.y *= 0.9;
        } else it.w.multiplyScalar(Math.exp(-(standing ? 9 : 5) * dt));
      }
      const ws = it.w.length();
      if (ws > 1e-3) {
        dq.setFromAxisAngle(axis.copy(it.w).divideScalar(ws), ws * dt);
        it.q.premultiply(dq).normalize();
      }
      // 멈추면 가까운 자세로 자리를 잡는다
      const slow = onGround && Math.hypot(it.v.x, it.v.z) < 0.25 && ws < 0.8;
      if (slow) {
        upNow.set(0, 1, 0).applyQuaternion(it.q);
        if (it.kind === 'crate' || Math.abs(upNow.y) > 0.72) {
          // 선 자세: 위쪽을 똑바로(상자는 가장 가까운 면으로 서는 것까지는 따지지 않고 위쪽만 맞춘다)
          dq.setFromUnitVectors(upNow, axis.set(0, Math.sign(upNow.y) || 1, 0));
        } else {
          // 누운 자세: 위쪽을 수평으로
          axis.set(upNow.x, 0, upNow.z).normalize();
          dq.setFromUnitVectors(upNow, axis);
        }
        want2.copy(dq).multiply(it.q);
        it.q.slerp(want2, Math.min(1, dt * 8));
        it.v.set(0, 0, 0);
        it.w.multiplyScalar(0.5);
        if (it.q.angleTo(want2) < 0.01 && Math.abs(it.p.y - floor) < 0.01) {
          it.q.copy(want2);
          it.w.set(0, 0, 0);
          it.rest = true;
        }
      }
      write(it);
    }
    for (const kd of Object.keys(dirty) as KindName[]) if (dirty[kd]) meshes[kd].instanceMatrix.needsUpdate = true;
  }
  void UP;
  return { update, count: items.length };
}
