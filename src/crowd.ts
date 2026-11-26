/**
 * W3 작업자 무리(2026-11-15, PLAN.md 6장). 사용자: "안이 텅 비어 있다" — 장소마다 사람이 0~1명이라 빈 창고처럼 보였다.
 * 한 사람 = 주인공과 같은 모양의 부품(몸+머리 두 벌 중 하나, 안전모, 팔 둘, 다리 둘, 용접면, 용접 불빛). 부품마다 InstancedMesh 하나로 모든 작업자를 그린다
 * → 사람이 수십 명이어도 그리기 호출은 부품 수만큼(CLAUDE.md: 사람 한 명당 그리기 호출을 늘리지 않는다).
 * 다중 접속의 '다른 접속자'도 같은 방식으로 그릴 생각이다(주인공 avatar.ts 를 사람 수만큼 만들지 않음).
 * 동작: weld(쪼그려 앉아 팔을 앞으로, 손끝 불빛 깜빡임), walk(두 점 사이 왕복), signal(한 팔을 들어 흔듦), stand(살짝 흔들림).
 * 지금 보는 장소의 작업자만 움직인다(나머지는 멈춘 자세로 그대로). 앞 = +x(avatar.ts 와 같음).
 * 자리는 장소 중심 바닥 기준(factory/fill.ts 와 같은 좌표). 고정 난수만 쓴다(누가 열어도 같은 야드).
 */
import * as THREE from 'three';
import { avatarParts } from './avatar';

type Action = 'weld' | 'walk' | 'signal' | 'stand';
interface Spec {
  /** 장소 기준 x, z */
  at: [number, number];
  /** 바라보는 점(장소 기준). 각도 대신 점으로 적어 방향 실수를 막는다 */
  look?: [number, number];
  act: Action;
  /** walk: 반대쪽 끝(장소 기준) */
  to?: [number, number];
  /** 발 높이(월드 y). 없으면 장소 높이(0 아래면 0) — 도크 바닥·비계 위 사람 */
  y?: number;
  /** 묶음 이름: setTag 로 함께 숨기고 보인다(진수 중 도크 바닥, 블록이 앉기 전 비계 위) */
  tag?: string;
}
interface Worker extends Spec {
  station: string;
  x: number;
  z: number;
  y: number;
  dir: number;
  phase: number;
  /** walk: 0 → 1 → 0 왕복 진행도, 방향 */
  k: number;
  sign: 1 | -1;
  len: number;
  ax: number;
  az: number;
  bx: number;
  bz: number;
  hidden: boolean;
}

/** 장소별 작업자(장소 기준 좌표). 공장 파일·fill.ts 의 애니메이션 경로와 정지 블록 자리를 보고 정함 */
const LAYOUT: Record<string, Spec[]> = {
  // 가공(열린 면 +z): 절단대 x -17~0, 강판 더미(-30,-12)(-30,-1.5), 팔레트(17,-10), 프레스 x 31, 통로선 z 15.5~17.5
  cutting: [
    { at: [-9, 6], look: [-9, 0], act: 'stand' },
    { at: [-3, 6.5], look: [-3, 0], act: 'stand' },
    { at: [-22, -7], look: [-30, -12], act: 'signal' },
    { at: [27, 7.5], look: [31, 0], act: 'stand' },
    { at: [11, -15], look: [17, -10], act: 'stand' },
    { at: [-6, 9.8], look: [-6, 12], act: 'stand' },
    { at: [-32, 16.5], to: [32, 16.5], act: 'walk' },
    { at: [20, 16.5], to: [-25, 16.5], act: 'walk' },
  ],
  // 조립(열린 면 -z): 정반 x 28, 대조립 x 0(블록 x -6~6, z -4~4), 의장 x -28, 트랜스포터 길 x≈-28·z 0→-48.
  // 판넬 블록(33,15: x 27~39, z 11~19), 대기 블록(12,-14: x 6~18, z -18~-10), 핀 지그(38,-13)
  assembly: [
    { at: [28.5, 10.5], look: [28.5, 15], act: 'weld' },
    { at: [34.5, 10.5], look: [34.5, 15], act: 'weld' },
    { at: [39.6, 14], look: [33, 14], act: 'weld' },
    { at: [5.4, -14], look: [12, -14], act: 'weld' },
    { at: [15, -9.4], look: [15, -14], act: 'weld' },
    { at: [38, -8.6], look: [38, -13], act: 'stand' },
    { at: [35.4, -8.8], look: [37, -13], act: 'stand' },
    { at: [28, -6.5], look: [28, 0], act: 'stand' },
    { at: [-6.6, -4.8], look: [0, 0], act: 'weld' },
    { at: [6.6, 4.8], look: [0, 0], act: 'weld' },
    { at: [10, -7], look: [10, 0], act: 'signal' },
    { at: [-20, 9], look: [-28, 0], act: 'stand' },
    { at: [-40, -19], to: [40, -19], act: 'walk' },
    { at: [30, -18.2], to: [-20, -18.2], act: 'walk' },
  ],
  // PE장(야외, 카메라 +z): 1차 A(-20,-6: x -27~-13, z -11~-1), 2차 B(18,-6), 트랜스포터 x -20·18 에서 z 62→14.
  // 뒷줄 정지 블록 이중저(-26,-19: z -24~-14), 측벽(-2,-20: z -22~-18), 도장 L(30,-18)
  pe: [
    { at: [-31, -13.3], look: [-31, -19], act: 'weld' },
    { at: [-22, -13.3], look: [-22, -19], act: 'weld' },
    { at: [-2, -17.4], look: [-2, -20], act: 'weld' },
    { at: [26, -12], look: [30, -18], act: 'stand' },
    { at: [33, -12.3], look: [30, -18], act: 'stand' },
    { at: [-29, 9], look: [-20, 14], act: 'signal' },
    { at: [27, 9], look: [18, 14], act: 'signal' },
    { at: [-28.6, -1], look: [-20, -6], act: 'stand' }, // 받침 A·B 의 블록은 순환 중 비는 때가 있어 용접 대신 지켜봄
    { at: [9.4, 0.4], look: [18, -6], act: 'stand' },
    { at: [26.6, 0.4], look: [18, -6], act: 'stand' },
    { at: [-38, 17.5], look: [-38, 12], act: 'stand' },
    { at: [-40, -23.5], to: [40, -23.5], act: 'walk' },
    { at: [42, 20], to: [42, -20], act: 'walk' },
  ],
  // 도크(장소 중심 = 도크 가운데, 바닥 y -14, 선체 폭 ±16, 도크 벽 ±24, 크레인 레일 ±32, 적치장 트랜스포터 (-140, 0)).
  // 바닥 사람은 'dockfloor'(진수 중 숨김), 비계 위 사람은 'blk:<블록>'(그 블록 비계가 설 때만)
  dock: [
    { at: [-7, 17.2], look: [-7, 10], y: -14, act: 'weld', tag: 'dockfloor' },
    { at: [-7, -17.2], look: [-7, -10], y: -14, act: 'weld', tag: 'dockfloor' },
    { at: [17, 17.2], look: [17, 10], y: -14, act: 'weld', tag: 'dockfloor' },
    { at: [-60, 20], to: [60, 20], y: -14, act: 'walk', tag: 'dockfloor' },
    { at: [-70, -20.5], look: [-70, 0], y: -14, act: 'stand', tag: 'dockfloor' },
    { at: [1, 17.3], look: [1, 10], y: -8, act: 'weld', tag: 'blk:H3-S' },
    { at: [9, 17.3], look: [9, 10], y: -2, act: 'weld', tag: 'blk:H3-S' },
    { at: [4, -17.3], look: [4, -10], y: -6, act: 'weld', tag: 'blk:H3-P' },
    { at: [-20, 17.3], look: [-20, 10], y: -4, act: 'stand', tag: 'blk:H4-S' },
    { at: [28, -17.3], look: [28, -10], y: -10, act: 'weld', tag: 'blk:H2-P' },
    { at: [-100, 28], to: [100, 28], act: 'walk' },
    { at: [60, -28], to: [-80, -28], act: 'walk' },
    { at: [-127, 22], look: [-140, 0], act: 'signal' },
    { at: [-153, -23], look: [-140, 0], act: 'stand' },
    { at: [-135, 41], look: [-146, 47], act: 'stand' },
  ],
  // 도장(열린 면 -z): 부스 x ±16, 블록 길 z ±5(x 16 → -16), 트랜스포터 출입 x ±16·z 0→-42. 건조 대기 블록(0,-13)
  paint: [
    { at: [-7.6, -12], look: [0, -13], act: 'stand' },
    { at: [7.6, -15], look: [0, -13], act: 'stand' },
    { at: [-7, -8.6], look: [0, -13], act: 'stand' },
    { at: [4.2, 6.6], look: [0, 7.5], act: 'stand' },
    { at: [-27, -16], to: [27, -16], act: 'walk' },
  ],
};

const std = (color: number, roughness = 0.8) => new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.05 });
const HELMET = [0xf2f2ee, 0xf2c230, 0xf2f2ee, 0x2f6fbf, 0xf2f2ee];

/** 고정 난수(작업자 색·흔들림 위상) */
function mulberry(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createCrowd(scene: THREE.Scene, stationAt: (id: string) => [number, number, number]) {
  const rnd = mulberry(20261115);
  const list: Worker[] = [];
  for (const [station, specs] of Object.entries(LAYOUT)) {
    const [sx, sy, sz] = stationAt(station);
    for (const sp of specs) {
      const ax = sx + sp.at[0];
      const az = sz + sp.at[1];
      const bx = sp.to ? sx + sp.to[0] : ax;
      const bz = sp.to ? sz + sp.to[1] : az;
      list.push({
        ...sp,
        station,
        x: ax,
        z: az,
        y: sp.y ?? Math.max(0, sy),
        hidden: false,
        dir: sp.to ? Math.atan2(-(bz - az), bx - ax) : sp.look ? Math.atan2(-(sz + sp.look[1] - az), sx + sp.look[0] - ax) : 0,
        phase: rnd() * 10,
        k: rnd(),
        sign: rnd() < 0.5 ? 1 : -1,
        len: Math.hypot(bx - ax, bz - az),
        ax,
        az,
        bx,
        bz,
      });
    }
  }
  const n = list.length;

  // ── 부품: 주인공과 같은 둥근 작업자(avatar.ts 의 avatarParts)를 부품별 InstancedMesh 로 ──
  // 2026-11-22 사용자: "NPC 들이 너무 성의 없이 대충 만들었다" — 상자를 이어 붙인 사람이라 주인공과 따로 놀았다.
  // 몸(몸통+머리)은 작업복·조끼 색이 다른 두 벌, 안전모는 흰색으로 구워 사람마다 색을 입힌다. 용접공은 얼굴 가리개를 쓴다.
  const A = avatarParts(0x2c3e66, 0xe8791f); // 남색 작업복 + 주황 조끼
  const B = avatarParts(0x55657c, 0xc6d22c); // 회청 작업복 + 형광 연두 조끼
  const SCALE = A.scale;
  const vmat = (roughness = 0.75) => new THREE.MeshStandardMaterial({ vertexColors: true, roughness, metalness: 0.05 });
  const parts = {
    bodyA: new THREE.InstancedMesh(A.body, vmat(), n),
    bodyB: new THREE.InstancedMesh(B.body, vmat(), n),
    helmet: new THREE.InstancedMesh(A.helmet, vmat(0.4), n),
    armL: new THREE.InstancedMesh(A.arms[0], vmat(), n),
    armR: new THREE.InstancedMesh(A.arms[1], vmat(), n),
    legL: new THREE.InstancedMesh(A.leg, vmat(0.85), n),
    legR: new THREE.InstancedMesh(A.leg, vmat(0.85), n),
    mask: new THREE.InstancedMesh(new THREE.BoxGeometry(0.07, 0.36, 0.44), std(0x1b1e22, 0.5), n),
  };
  const arc = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.2, 8, 6), // 기본 시점(약 70 m)에서 몇 화소는 되게
    new THREE.MeshBasicMaterial({ color: 0xd8ecff, toneMapped: false }),
    n,
  );
  const col = new THREE.Color();
  /** 사람마다 어느 옷(0 = A, 1 = B) */
  const suitOf: number[] = [];
  list.forEach((w, i) => {
    const v = rnd() < 0.6 ? 0 : 1;
    suitOf.push(v);
    // 팔·다리는 남색으로 구운 한 벌을 같이 쓰고, 회청 작업복은 밝게 입힌다
    const tint = v ? col.setRGB(1.75, 1.6, 1.45) : col.setRGB(1, 1, 1);
    for (const m of [parts.armL, parts.armR, parts.legL, parts.legR]) m.setColorAt(i, tint);
    const shade = 0.9 + rnd() * 0.2;
    parts.bodyA.setColorAt(i, col.setRGB(shade, shade, shade));
    parts.bodyB.setColorAt(i, col.setRGB(shade, shade, shade));
    parts.helmet.setColorAt(i, col.setHex(HELMET[Math.floor(rnd() * HELMET.length)]));
    void w;
  });
  for (const m of Object.values(parts)) {
    m.castShadow = true;
    m.frustumCulled = false; // 인스턴스가 야드 곳곳에 흩어져 있어 원본 형상의 경계로 자르면 사라진다
    scene.add(m);
  }
  arc.frustumCulled = false;
  scene.add(arc);

  // ── 자세 계산(좌표는 avatar.ts 의 사람 기준: 엉덩이 관절 y 0.62, 어깨 y 1.24, 앞 = +x) ──
  const HIP = A.legAt[0].y;
  const base = new THREE.Matrix4();
  const bodyM = new THREE.Matrix4();
  const m4 = new THREE.Matrix4();
  const tmp = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const size = new THREE.Vector3(SCALE, SCALE, SCALE);
  const zero = new THREE.Vector3(0, 0, 0);
  const none = new THREE.Vector3(0, 0, 0);
  const pos = new THREE.Vector3();
  const zAxis = new THREE.Vector3(0, 0, 1);
  /** ref 기준 (x, y, z) 관절에서 z 축으로 angle 만큼 돌린 부품(앞 = +x 이므로 z 축 회전 = 앞뒤로 흔듦) */
  function joint(mesh: THREE.InstancedMesh, i: number, ref: THREE.Matrix4, x: number, y: number, z: number, angle: number) {
    tmp.makeRotationAxis(zAxis, angle).setPosition(x, y, z);
    mesh.setMatrixAt(i, m4.multiplyMatrices(ref, tmp));
  }
  function hide(mesh: THREE.InstancedMesh, i: number) {
    mesh.setMatrixAt(i, m4.compose(zero, q.identity(), none));
  }

  function pose(w: Worker, i: number, t: number) {
    if (w.hidden) {
      for (const m of Object.values(parts)) hide(m, i);
      hide(arc, i);
      return;
    }
    const p = t + w.phase;
    let drop = 0; // 엉덩이를 낮춘 만큼
    let legA = 0;
    let legB = 0;
    let armA = 0;
    let armB = 0;
    let lean = 0;
    let glow = false;
    if (w.act === 'walk') {
      const s = Math.sin(p * 6.5);
      legA = s * 0.55;
      legB = -s * 0.55;
      armA = -s * 0.5;
      armB = s * 0.5;
      drop = -Math.abs(Math.cos(p * 6.5)) * 0.04;
      lean = -0.06;
    } else if (w.act === 'weld') {
      // 쪼그려 앉음: 허벅지를 앞으로 들어 엉덩이를 낮춤, 두 팔을 앞 아래로, 몸을 앞으로 숙임
      drop = 0.3;
      legA = legB = 1.3;
      armA = armB = 1.0 + Math.sin(p * 1.3) * 0.08;
      lean = -0.32;
      glow = Math.sin(p * 29) > -0.4 && Math.sin(p * 0.5) > -0.8; // 짧게 끊기며 대부분 켜짐
    } else if (w.act === 'signal') {
      armB = 2.5 + Math.sin(p * 3.2) * 0.3; // 오른팔을 들어 흔듦
      armA = 0.1;
    } else {
      // 서 있기: 숨쉬듯 살짝 흔들리고, 가끔 한 팔을 들어 가리킨다
      lean = Math.sin(p * 0.6) * 0.025;
      armA = Math.sin(p * 0.9) * 0.06;
      const point = Math.max(0, Math.sin(p * 0.23 + w.phase) - 0.86) / 0.14;
      armB = -armA + point * 1.15;
    }
    q.setFromAxisAngle(up, w.dir);
    pos.set(w.x, w.y, w.z);
    base.compose(pos, q, size);
    const hipY = HIP - drop;
    joint(parts.legL, i, base, 0, hipY, A.legAt[0].z, legA);
    joint(parts.legR, i, base, 0, hipY, A.legAt[1].z, legB);
    // 몸(몸통+머리)은 엉덩이 관절에서 앞으로 숙인다: 엉덩이로 옮김 → 숙임 → 몸 좌표의 엉덩이 높이만큼 되돌림
    tmp.makeRotationAxis(zAxis, lean).setPosition(0, hipY, 0);
    bodyM.multiplyMatrices(base, tmp);
    bodyM.multiply(tmp.makeTranslation(0, -HIP, 0));
    const mine = suitOf[i] ? parts.bodyB : parts.bodyA;
    mine.setMatrixAt(i, bodyM);
    hide(suitOf[i] ? parts.bodyA : parts.bodyB, i);
    parts.helmet.setMatrixAt(i, bodyM);
    joint(parts.armL, i, bodyM, A.armAt[0].x, A.armAt[0].y, A.armAt[0].z, armA);
    joint(parts.armR, i, bodyM, A.armAt[1].x, A.armAt[1].y, A.armAt[1].z, armB);
    if (w.act === 'weld') {
      // 용접면: 얼굴 앞을 가린다
      tmp.makeTranslation(0.37, 1.66, 0);
      parts.mask.setMatrixAt(i, m4.multiplyMatrices(bodyM, tmp));
    } else hide(parts.mask, i);
    if (glow) {
      // 손끝(어깨에서 팔 길이 0.5 를 armA 만큼 돌린 끝) 조금 앞
      tmp.makeTranslation(Math.sin(armA) * 0.5 + 0.18, A.armAt[0].y - Math.cos(armA) * 0.5, 0);
      arc.setMatrixAt(i, m4.multiplyMatrices(bodyM, tmp));
    } else hide(arc, i);
  }

  function flush() {
    for (const m of Object.values(parts)) m.instanceMatrix.needsUpdate = true;
    arc.instanceMatrix.needsUpdate = true;
  }

  let t = 0;
  list.forEach((w, i) => pose(w, i, 0));
  flush();

  /** here = 지금 장소 id. 그 장소 작업자만 움직인다 */
  function update(dt: number, here: string) {
    t += dt;
    let any = false;
    list.forEach((w, i) => {
      if (w.station !== here) return;
      any = true;
      if (w.act === 'walk' && w.len > 0) {
        w.k += (w.sign * dt * 1.2) / w.len;
        if (w.k > 1 || w.k < 0) {
          w.k = THREE.MathUtils.clamp(w.k, 0, 1);
          w.sign = (w.sign * -1) as 1 | -1;
        }
        w.x = w.ax + (w.bx - w.ax) * w.k;
        w.z = w.az + (w.bz - w.az) * w.k;
        const dx = (w.bx - w.ax) * w.sign;
        const dz = (w.bz - w.az) * w.sign;
        w.dir = Math.atan2(-dz, dx);
      }
      pose(w, i, t);
    });
    if (any) flush();
  }

  /** 묶음(tag)을 숨기거나 보인다. 바뀐 사람만 자세를 다시 잡는다 */
  function setTag(tag: string, visible: boolean) {
    let changed = false;
    list.forEach((w, i) => {
      if (w.tag !== tag || w.hidden === !visible) return;
      w.hidden = !visible;
      pose(w, i, t);
      changed = true;
    });
    if (changed) flush();
  }

  return { update, setTag, count: n };
}
