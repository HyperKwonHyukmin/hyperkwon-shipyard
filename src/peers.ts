/**
 * 다른 접속자 그리기(2026-11-17). 연결은 net.ts, 규칙은 CLAUDE.md '다중 접속'.
 * - 모습은 주인공과 같다(avatar.ts 의 `avatarParts`): 몸+머리, 안전모, 다리 둘, 팔 둘을 부품별 InstancedMesh 로.
 *   자전거까지 그리기 호출 7번이고 사람 수와 무관하다. 처음엔 캡슐 하나였는데 사용자가 "이따위로 나온다"고 해서 바꿨다.
 * - 동작: 움직이면 팔다리를 흔들며 걷고(빠르면 달리기), 자전거면 앉아서 페달, 손 흔들기는 오른팔을 든다.
 * - 조감 견학 중인 사람은 위치가 없으므로 자기가 보는 장소 앞 '견학 자리'에 줄지어 선다. 걷는 사람은 실제 자리.
 * - 방은 조선소 전체 하나라 모든 접속자가 대상이고, 카메라에서 가까운 30명만 그린다.
 * - 이름표와 핑 글자는 DOM(가까운 8명만) — 그리기 호출을 늘리지 않는다.
 */
import * as THREE from 'three';
import type { Station } from './content/stations';
import { doorOf } from './layout';
import { BIKE_SEAT, buildBike, VIEWPOINT } from './walk';
import { avatarParts, bakeMeshes } from './avatar';
import { nameOf, type Net, type Peer } from './net';

const MAX = 30;
const LABELS = 8;
const PINGS = 4;
const HELMET: Record<string, number> = { yellow: 0xf2c21a, white: 0xf1f1ec, orange: 0xe2661c, blue: 0x2f62a8 };

interface Shown {
  x: number;
  z: number;
  d: number;
  /** 손 흔들기 남은 시간 */
  wave: number;
  /** 손 든 정도(0~1) */
  raise: number;
  /** 빠르기(m/s, 부드럽게) */
  sp: number;
  phase: number;
  amp: number;
}

export function createPeers(scene: THREE.Scene, camera: THREE.Camera, stations: Station[], net: Net) {
  const A = avatarParts();
  const painted = () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.05 });
  const inst = (geo: THREE.BufferGeometry, mat: THREE.Material, shadow = false) => {
    const m = new THREE.InstancedMesh(geo, mat, MAX);
    m.count = 0;
    m.frustumCulled = false; // 사람이 야드 곳곳에 흩어져 있어 묶음 경계로 걸러 내지 않는다
    m.castShadow = shadow;
    scene.add(m);
    return m;
  };
  const skin = painted();
  const body = inst(A.body, skin, true);
  const helmet = inst(A.helmet, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.05 }));
  const legs = [inst(A.leg, skin), inst(A.leg, skin)];
  const arms = [inst(A.arms[0], skin), inst(A.arms[1], skin)];
  // 자전거: 주인공 것과 같은 모양을 하나로 합쳐서(바퀴는 돌지 않는다)
  const bikeGeo = (() => {
    const b = buildBike();
    const list: THREE.Mesh[] = [];
    b.g.traverse((o) => (o as THREE.Mesh).isMesh && list.push(o as THREE.Mesh));
    return bakeMeshes(list, b.g);
  })();
  const bike = inst(bikeGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.4 }));
  const people = [body, helmet, ...legs, ...arms];

  // 핑: 바닥 고리 + 기둥(조감에서도 보이게)
  const pings = Array.from({ length: PINGS }, () => {
    const mat = new THREE.MeshBasicMaterial({ color: 0x00e600, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 32).rotateX(-Math.PI / 2), mat);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 16, 6).translate(0, 8, 0), mat);
    g.add(ring, pole);
    g.visible = false;
    scene.add(g);
    return { g, ring, mat, life: 0, text: '', el: null as HTMLElement | null };
  });

  const layer = document.createElement('div');
  layer.className = 'mp-labels';
  document.body.appendChild(layer);
  const mk = (cls: string) => {
    const el = document.createElement('div');
    el.className = cls;
    el.hidden = true;
    layer.appendChild(el);
    return el;
  };
  const labels = Array.from({ length: LABELS }, () => mk('mp-label'));
  for (const p of pings) p.el = mk('mp-label ping');

  const shown = new Map<number, Shown>();
  const spot = new Map<string, { x: number; z: number; side: number; at: [number, number, number] }>();
  for (const s of stations) {
    const [x, z] = VIEWPOINT[s.id] ?? doorOf(s.at).front;
    spot.set(s.id, { x, z, side: Math.sign(s.at[2] - z) || 1, at: s.at });
  }

  const col = new THREE.Color();
  const v = new THREE.Vector3();
  // 행렬 계산용(프레임마다 새로 만들지 않는다)
  const mRoot = new THREE.Matrix4();
  const mPerson = new THREE.Matrix4();
  const mBody = new THREE.Matrix4();
  const mTmp = new THREE.Matrix4();
  const mOut = new THREE.Matrix4();
  const mScale = new THREE.Matrix4().makeScale(A.scale, A.scale, A.scale);
  const mSeat = new THREE.Matrix4().makeTranslation(BIKE_SEAT.x, BIKE_SEAT.y, BIKE_SEAT.z);
  /** out = base · 옮김(at) · z축 회전(rot) */
  const joint = (base: THREE.Matrix4, at: THREE.Vector3, rot: number) =>
    mOut.multiplyMatrices(base, mTmp.makeRotationZ(rot).setPosition(at));
  let t = 0;

  /** 화면 좌표로(카메라 뒤면 숨김) */
  function place(el: HTMLElement, x: number, y: number, z: number) {
    v.set(x, y, z).project(camera);
    if (v.z > 1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    el.style.transform = `translate(-50%, -100%) translate(${((v.x + 1) / 2) * innerWidth}px, ${((1 - v.y) / 2) * innerHeight}px)`;
  }

  function update(dt: number) {
    t += dt;
    for (const id of shown.keys()) if (!net.peers.has(id)) shown.delete(id);
    // 1) 모든 사람의 설 자리(견학 자리는 번호순이라 누가 봐도 같은 줄)
    const slots = new Map<string, number>();
    const now = performance.now();
    const want: { p: Peer; x: number; z: number; d: number; dist: number }[] = [];
    if (net.online) {
      for (const p of [...net.peers.values()].sort((a, b) => a.id - b.id)) {
        // 걷는 사람: 마지막으로 받은 자리에서 그 속도로 이어 간 자리(소식이 0.9초 넘게 없으면 거기서 멈춤)
        const age = p.t ? Math.min(0.9, (now - p.t) / 1000) : 0;
        let x = p.x + (p.vx ?? 0) * age;
        let z = p.z + (p.vz ?? 0) * age;
        let d = p.d;
        if (p.m === 0) {
          const sp = spot.get(p.s);
          if (!sp) continue;
          const slot = slots.get(p.s) ?? 0;
          slots.set(p.s, slot + 1);
          // 견학 자리: 장소 앞에 여섯 명씩 줄지어, 장소를 바라본다
          x = sp.x + 4 + (slot % 6) * 1.6;
          z = sp.z - sp.side * Math.floor(slot / 6) * 1.5;
          d = Math.atan2(-(sp.at[2] - z), sp.at[0] - x);
        }
        want.push({ p, x, z, d, dist: camera.position.distanceToSquared(v.set(x, 1, z)) });
      }
    }
    // 2) 카메라에서 가까운 30명만 그린다
    want.sort((a, b) => a.dist - b.dist);
    const list = want.slice(0, MAX);
    const k = 1 - Math.exp(-dt * 9); // 목표 자리가 속도로 이어지므로 바짝 따라간다(소식이 올 때의 어긋남만 부드럽게)
    const k2 = Math.min(1, dt * 8);
    const near: { p: Peer; s: Shown; dist: number; y: number }[] = [];
    let riders = 0;
    list.forEach((w, i) => {
      let s = shown.get(w.p.id);
      if (!s) shown.set(w.p.id, (s = { x: w.x, z: w.z, d: w.d, wave: 0, raise: 0, sp: 0, phase: w.p.id % 7, amp: 0 }));
      const px = s.x;
      const pz = s.z;
      // 멀리 건너뛴 경우(순간 이동·견학 자리 ↔ 걷기·장소 옮김)는 바로 옮긴다
      const jumped = Math.hypot(w.x - s.x, w.z - s.z) > 40;
      if (jumped) {
        s.x = w.x;
        s.z = w.z;
        s.d = w.d;
      } else {
        s.x += (w.x - s.x) * k;
        s.z += (w.z - s.z) * k;
        s.d += Math.atan2(Math.sin(w.d - s.d), Math.cos(w.d - s.d)) * k;
      }
      const speed = jumped || dt <= 0 ? 0 : Math.hypot(s.x - px, s.z - pz) / dt;
      s.sp += (speed - s.sp) * k2;
      s.wave = Math.max(0, s.wave - dt);
      s.raise += ((s.wave > 0 ? 1 : 0) - s.raise) * Math.min(1, dt * 6);

      const riding = w.p.m === 2;
      const moving = s.sp > 0.6;
      const running = !riding && s.sp > 10;
      mRoot.makeRotationY(s.d).setPosition(s.x, 0, s.z);
      mPerson.copy(mRoot);
      if (riding) mPerson.multiply(mSeat);
      mPerson.multiply(mScale);

      let legA: number;
      let legB: number;
      let armA: number;
      let armB: number;
      let lean: number;
      let bob = 0;
      if (riding) {
        // 자전거 자세(avatar.ts 의 ride 와 같은 값): 숙인 상체, 두 손은 핸들, 다리는 페달
        if (moving) s.phase += dt * 9;
        const sw = Math.sin(s.phase) * 0.42;
        legA = 0.85 + sw;
        legB = 0.85 - sw;
        armA = armB = 1.05;
        lean = -0.3;
      } else {
        s.amp += ((moving ? (running ? 0.95 : 0.62) : 0) - s.amp) * k2;
        if (moving) s.phase += dt * (running ? 15 : 8.5);
        const sw = Math.sin(s.phase) * s.amp;
        legA = sw;
        legB = -sw;
        armA = -sw * 0.85;
        armB = sw * 0.85 * (1 - s.raise) + (2.5 + Math.sin(t * 6) * 0.25) * s.raise;
        lean = running ? -0.2 : moving ? -0.06 : 0;
        bob = moving ? Math.abs(Math.cos(s.phase)) * (running ? 0.07 : 0.04) : Math.sin(t * 2.2 + s.phase) * 0.012;
      }
      mBody.multiplyMatrices(mPerson, mTmp.makeRotationZ(lean).setPosition(0, bob, 0));
      body.setMatrixAt(i, mBody);
      helmet.setMatrixAt(i, mBody);
      helmet.setColorAt(i, col.setHex(HELMET[w.p.h] ?? HELMET.yellow));
      legs[0].setMatrixAt(i, joint(mPerson, A.legAt[0], legA));
      legs[1].setMatrixAt(i, joint(mPerson, A.legAt[1], legB));
      arms[0].setMatrixAt(i, joint(mBody, A.armAt[0], armA));
      arms[1].setMatrixAt(i, joint(mBody, A.armAt[1], armB));
      if (riding) bike.setMatrixAt(riders++, mRoot);
      near.push({ p: w.p, s, dist: w.dist, y: riding ? 2.75 : 2.3 });
    });
    for (const m of people) {
      m.count = list.length;
      m.instanceMatrix.needsUpdate = true;
    }
    bike.count = riders;
    bike.instanceMatrix.needsUpdate = true;
    if (helmet.instanceColor) helmet.instanceColor.needsUpdate = true;

    labels.forEach((el, i) => {
      const n = near[i];
      if (!n) {
        el.hidden = true;
        return;
      }
      const name = nameOf(n.p);
      if (el.textContent !== name) el.textContent = name;
      place(el, n.s.x, n.y, n.s.z);
    });

    for (const p of pings) {
      if (p.life <= 0) continue;
      p.life -= dt;
      const a = Math.max(0, p.life / 3);
      p.g.visible = p.life > 0;
      p.ring.scale.setScalar(1 + (1 - a) * 9);
      p.mat.opacity = a;
      if (p.el) {
        if (p.life > 0) place(p.el, p.g.position.x, 17, p.g.position.z);
        else p.el.hidden = true;
      }
    }
  }

  return {
    update,
    /** 핑을 그린다(내 것도 같이 보여 준다) */
    ping(who: string, x: number, z: number) {
      const p = pings.reduce((a, b) => (b.life < a.life ? b : a));
      p.life = 3;
      p.g.position.set(x, 0.15, z);
      p.g.visible = true;
      if (p.el) p.el.textContent = `${who} · 여기요`;
    },
    /** 손 흔들기: 오른팔을 든다 */
    wave(id: number) {
      const s = shown.get(id);
      if (s) s.wave = 2.2;
    },
    /** 그 사람이 지금 그려진 자리(자동 시험용: 움직임이 고른지 잰다) */
    at(id: number) {
      const s = shown.get(id);
      return s ? { x: s.x, z: s.z } : null;
    },
    /** 화면에 그리지 못한 사람 수 */
    get extra() {
      return Math.max(0, net.peers.size - MAX);
    },
  };
}
