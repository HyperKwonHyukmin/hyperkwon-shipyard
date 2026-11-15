/**
 * 사람 한 명의 모습. 조작(walk.ts)과 떼어 둔다 — 나중에 다른 접속자도 이 모듈로 그린다.
 * 모양은 기본 도형(캡슐·구)으로 만든 둥근 작업자: 안전모(챙과 능선), 반사띠 조끼, 장갑, 안전화, 얼굴.
 * 2026-11-13 경과: 상자 사람 → 이 둥근 사람 → 외부 모델 두 가지(꼬마 체형, 어른 체형)를 차례로 써 봤고,
 *   사용자가 "차라리 처음에서 두 번째 그걸로"라고 해서 이 모양으로 돌아왔다. 외부 모델 파일은 쓰지 않는다.
 * - 상태(state)를 바꾸면 동작이 바뀐다: 서 있기(숨쉬기), 걷기, 달리기(몸을 기울임), 손 들기, 자전거(페달·멈춤).
 * - 겉모습(look)은 안전모 색.
 * 앞 = +x, 좌우 = z. 몸통·머리·팔은 body 그룹(걸을 때 들썩임), 다리는 따로.
 * 알아 둘 것: 한 사람이 메시 약 25개다(그리기 호출도 그만큼). 접속자가 많아지면 재질별로 합쳐야 한다.
 */
import * as THREE from 'three';

/** ride = 자전거 페달 밟기, coast = 자전거에 앉아 멈춤 */
export type AvatarState = 'idle' | 'walk' | 'run' | 'greet' | 'ride' | 'coast';
export interface Look {
  helmet?: 'yellow' | 'white' | 'orange' | 'blue';
}
const HELMET: Record<NonNullable<Look['helmet']>, number> = { yellow: 0xf2c21a, white: 0xf1f1ec, orange: 0xe2661c, blue: 0x2f62a8 };
/** 모양은 키 약 2.25 로 만들어져 있다. 실제 사람 키에 가깝게 줄인다(야드와 배가 실제 크기) */
const SCALE = 0.9;

function std(color: number, roughness = 0.7) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.05 });
}

function buildPerson(helmet: number, suit: number) {
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const M = {
    suit: std(suit, 0.8),
    suitDark: std(new THREE.Color(suit).multiplyScalar(0.72).getHex(), 0.8),
    skin: std(0xf2cfae, 0.75),
    helmet: std(helmet, 0.35),
    boot: std(0x2b2622, 0.6),
    vest: std(0xf0641e, 0.7),
    band: new THREE.MeshStandardMaterial({ color: 0xf3f0c8, roughness: 0.3, metalness: 0.4 }),
    glove: std(0xf1eee6, 0.8),
    eye: std(0x23201e, 0.4),
    cheek: std(0xf0a694, 0.9),
  };
  const add = (parent: THREE.Object3D, geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  };
  // 다리(엉덩이에서 흔들림): 바지 + 안전화
  const legs = [-0.16, 0.16].map((z) => {
    const pivot = new THREE.Group();
    pivot.position.set(0, 0.62, z);
    add(pivot, new THREE.CapsuleGeometry(0.125, 0.3, 4, 10), M.suitDark, 0, -0.27, 0);
    const boot = add(pivot, new THREE.SphereGeometry(0.15, 12, 8), M.boot, 0.06, -0.54, 0);
    boot.scale.set(1.45, 0.75, 1);
    g.add(pivot);
    return pivot;
  });
  // 몸통: 작업복 + 조끼 + 반사띠 2줄
  const torso = add(body, new THREE.CapsuleGeometry(0.27, 0.3, 6, 14), M.suit, 0, 0.98, 0);
  torso.scale.set(0.9, 1, 1.08);
  const vest = add(body, new THREE.CylinderGeometry(0.3, 0.32, 0.46, 16), M.vest, 0, 1.02, 0);
  vest.scale.set(0.92, 1, 1.1);
  for (const y of [0.92, 1.1]) {
    const band = add(body, new THREE.CylinderGeometry(0.315, 0.325, 0.055, 16), M.band, 0, y, 0);
    band.scale.set(0.92, 1, 1.1);
  }
  // 팔(어깨에서 흔들림): 소매 + 장갑
  const arms = [-0.38, 0.38].map((z) => {
    const pivot = new THREE.Group();
    pivot.position.set(0, 1.24, z);
    const sleeve = add(pivot, new THREE.CapsuleGeometry(0.095, 0.3, 4, 10), M.suit, 0, -0.22, 0);
    sleeve.rotation.x = z > 0 ? -0.12 : 0.12; // 살짝 벌어진 팔
    add(pivot, new THREE.SphereGeometry(0.105, 10, 8), M.glove, 0, -0.47, z > 0 ? 0.05 : -0.05);
    body.add(pivot);
    return pivot;
  });
  // 머리: 얼굴, 볼, 눈, 귀
  const head = new THREE.Group();
  head.position.set(0, 1.72, 0);
  body.add(head);
  const face = add(head, new THREE.SphereGeometry(0.36, 20, 16), M.skin, 0, 0, 0);
  face.scale.set(0.96, 0.94, 1.02);
  for (const z of [-0.36, 0.36]) add(head, new THREE.SphereGeometry(0.07, 8, 6), M.skin, 0, -0.02, z);
  for (const z of [-0.13, 0.13]) {
    const eye = add(head, new THREE.SphereGeometry(0.048, 10, 8), M.eye, 0.315, 0.02, z);
    eye.scale.set(0.5, 1.25, 1);
    const cheek = add(head, new THREE.SphereGeometry(0.06, 8, 6), M.cheek, 0.29, -0.1, z * 1.75);
    cheek.scale.set(0.3, 0.7, 1);
  }
  const mouth = add(head, new THREE.SphereGeometry(0.035, 8, 6), M.eye, 0.335, -0.13, 0);
  mouth.scale.set(0.4, 0.5, 1.6);
  // 안전모: 둥근 껍데기 + 둘레 테 + 앞 챙 + 가운데 능선
  const shell = add(head, new THREE.SphereGeometry(0.4, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.52), M.helmet, 0, 0.06, 0);
  shell.scale.set(1.02, 1.02, 1.04);
  add(head, new THREE.CylinderGeometry(0.415, 0.425, 0.05, 20), M.helmet, 0, 0.07, 0);
  const brim = add(head, new THREE.SphereGeometry(0.3, 14, 8), M.helmet, 0.3, 0.06, 0);
  brim.scale.set(0.85, 0.07, 1.15); // 앞으로 내민 납작한 챙
  const ridge = add(head, new THREE.CapsuleGeometry(0.035, 0.42, 3, 6), M.helmet, 0, 0.44, 0);
  ridge.rotation.z = Math.PI / 2;
  g.scale.setScalar(SCALE);
  return { g, body, head, legs, arms };
}

export function createAvatar(look: Look = {}) {
  const p = buildPerson(HELMET[look.helmet ?? 'yellow'], 0x3d5a80);
  let state: AvatarState = 'idle';
  let phase = 0;
  let t = 0;
  let amp = 0; // 팔다리 흔들림 크기(상태가 바뀔 때 부드럽게)
  let lean = 0;
  let raise = 0; // 손 들기(0~1)

  function update(dt: number) {
    t += dt;
    if (state === 'ride' || state === 'coast') {
      // 자전거 자세: 상체를 앞으로 숙이고 두 손은 핸들, 다리는 페달을 돌린다(엉덩이 축 기준 앞 = +z 회전)
      if (state === 'ride') phase += dt * 9;
      const s = Math.sin(phase) * 0.42;
      p.legs[0].rotation.z = 0.85 + s;
      p.legs[1].rotation.z = 0.85 - s;
      for (const arm of p.arms) arm.rotation.z = 1.05;
      p.body.rotation.z = -0.3;
      p.body.position.y = 0;
      p.head.rotation.x = 0;
      amp = lean = raise = 0;
      return;
    }
    const moving = state === 'walk' || state === 'run';
    const running = state === 'run';
    const k = Math.min(1, dt * 10);
    amp += ((moving ? (running ? 0.95 : 0.62) : 0) - amp) * k;
    lean += ((running ? -0.2 : moving ? -0.06 : 0) - lean) * k;
    raise += ((state === 'greet' ? 1 : 0) - raise) * Math.min(1, dt * 6);
    if (moving) phase += dt * (running ? 15 : 8.5);
    const swing = Math.sin(phase) * amp;
    p.legs[0].rotation.z = swing;
    p.legs[1].rotation.z = -swing;
    p.arms[0].rotation.z = -swing * 0.85;
    // 오른팔: 걷는 흔들림과 손 들기(들고 살짝 흔든다)를 섞는다
    p.arms[1].rotation.z = swing * 0.85 * (1 - raise) + (2.5 + Math.sin(t * 6) * 0.25) * raise;
    p.body.position.y = moving ? Math.abs(Math.cos(phase)) * (running ? 0.07 : 0.04) : Math.sin(t * 2.2) * 0.012;
    p.body.rotation.z = lean;
    p.head.rotation.x = moving ? Math.sin(phase) * 0.04 : Math.sin(t * 0.7) * 0.05;
  }

  return {
    group: p.g,
    set(next: AvatarState) {
      state = next;
    },
    get state() {
      return state;
    },
    update,
  };
}

export type Avatar = ReturnType<typeof createAvatar>;
