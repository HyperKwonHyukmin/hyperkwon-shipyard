/**
 * P3-3 시운전(공식 공정 11 시운전). 바다로 나간 배가 속력, 선회, 지그재그, 긴급 정지를 시험한다.
 *  해역에 들어옴 → 속력 시험(표지 부표 두 개 사이를 최고 속력으로) → 선회 시험(키를 끝까지 돌려 1바퀴 반)
 *  → 지그재그 시험(키를 좌우 20도씩 번갈아, 돌아오는 방향) → 긴급 정지(전속 후진) → 돌아감. 한 순환 약 165초.
 * 움직임은 간단한 운동 모델: 속력은 목표값으로 서서히, 회두 각속도 = 속력 × 키각 / 선회 반경. 돌 때 바깥으로 기운다.
 * 배는 도크, 안벽의 배와 따로 둔 한 척. 시간은 실제보다 압축했다(속력 12 m/s, 선회 반경 75 m 는 보기 좋게 줄인 값).
 * 좌표: three.js 에서 rotation.y(ψ)가 커지면 뱃머리가 +x 에서 -z 쪽(좌현)으로 돈다. 우현 = +z.
 */
import * as THREE from 'three';
import { buildBulkCarrier, SHIP } from './ship';
import { sequence, glowTexture, type Step } from './factory/shed';

interface Options {
  seaY: number;
  draft: number;
}

const R_FULL = 75; // 키를 끝까지(35도) 돌렸을 때 선회 반경
const RUDDER_MAX = 35;
const START_X = 560; // 항적 범위 x 약 500~910, z 약 -155~0(모의 계산, 화면 폭 안에 들게)
const DEG = Math.PI / 180;

export function createTrial(scene: THREE.Scene, o: Options) {
  const root = new THREE.Group();
  scene.add(root);
  const { ship } = buildBulkCarrier(true);
  ship.rotation.order = 'YXZ';
  root.add(ship);
  const keelY = o.seaY - o.draft;

  // 항해등(발광 재질만): 좌현 빨강, 우현 초록, 마스트 흰색
  const navLamp = (color: number, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(1.2, 10, 8), // 멀리서 보는 장소라 실제보다 크게
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 3 }),
    );
    m.position.set(x, y, z);
    ship.add(m);
  };
  const deckH = SHIP.depth;
  navLamp(0xff2a1a, -74, deckH + 13.5, -15);
  navLamp(0x1aff5a, -74, deckH + 13.5, 15);
  navLamp(0xfff4dc, 84, deckH + 12.4, 0);
  navLamp(0xfff4dc, -77, deckH + 18.4, 0);

  // ── 항적(흰 물거품): 고물 자리에 원판을 떨어뜨려 퍼지며 흐려지게 ──
  // 가장자리가 흐린 그림이라 겹쳐도 판 모양 줄무늬가 보이지 않는다
  const foamGeo = new THREE.PlaneGeometry(2, 2);
  foamGeo.rotateX(-Math.PI / 2);
  const foamTex = glowTexture('rgba(240,246,248,0.7)', 'rgba(240,246,248,0)');
  const foam = Array.from({ length: 280 }, () => {
    const m = new THREE.Mesh(foamGeo, new THREE.MeshBasicMaterial({ map: foamTex, transparent: true, opacity: 0, depthWrite: false }));
    m.visible = false;
    m.renderOrder = 1;
    root.add(m);
    return { m, age: 0, life: 0, grow: 1 };
  });
  let foamNext = 0;
  function dropFoam(p: THREE.Vector3, size: number, life: number, grow: number) {
    const f = foam[foamNext];
    foamNext = (foamNext + 1) % foam.length;
    f.m.position.set(p.x, o.seaY + 0.9, p.z); // 파도 마루(약 ±0.6 m)가 뚫고 올라와 거품이 각지게 잘리지 않게
    f.m.scale.setScalar(size);
    f.m.visible = true;
    f.age = 0;
    f.life = life;
    f.grow = grow;
  }
  function updateFoam(dt: number) {
    for (const f of foam) {
      if (f.life <= 0) continue;
      f.age += dt;
      const k = f.age / f.life;
      if (k >= 1) {
        f.life = 0;
        f.m.visible = false;
        continue;
      }
      f.m.scale.setScalar(f.m.scale.x + f.grow * dt);
      (f.m.material as THREE.MeshBasicMaterial).opacity = 0.6 * (1 - k);
    }
  }

  // ── 운동 상태 ──
  const s = { x: START_X, z: 0, psi: 0, v: 6, r: 0, rudder: 0, vTarget: 8, tau: 5, heel: 0 };
  // 처음부터 시운전 해역에 둔다. 2026-11-14: update 에서만 자리를 잡아, 시운전 장소를 보기 전까지 원점(도크 한가운데)에 완성된 배가 떠 있었다
  ship.position.set(s.x, keelY, s.z);
  let zigFrom = 0;
  let zigMode = false;
  let foamTimer = 0;
  let t = 0;
  const fwd = new THREE.Vector3();
  const stern = new THREE.Vector3();

  function reset() {
    Object.assign(s, { x: START_X, z: 0, psi: 0, v: 6, r: 0, rudder: 0, vTarget: 8, tau: 5, heel: 0 });
    zigMode = false;
    ship.visible = true;
  }

  function integrate(dt: number) {
    if (zigMode) {
      // 처음 방향에서 20도 넘게 돌면 키를 반대로(지그재그 시험)
      const d = (s.psi - zigFrom) / DEG;
      if (d > 20) s.rudder = -20;
      else if (d < -20) s.rudder = 20;
    }
    s.v += ((s.vTarget - s.v) * dt) / s.tau;
    const rTarget = (Math.max(0, s.v) * (s.rudder / RUDDER_MAX)) / R_FULL;
    s.r += ((rTarget - s.r) * dt) / 3;
    s.psi += s.r * dt;
    fwd.set(Math.cos(s.psi), 0, -Math.sin(s.psi));
    s.x += fwd.x * s.v * dt;
    s.z += fwd.z * s.v * dt;
    // 돌 때 바깥(우현으로 돌면 좌현, 좌현으로 돌면 우현)으로 기움 — rotation.x 가 +면 우현(+z)이 내려감
    s.heel += (s.r * s.v * 0.35 - s.heel) * Math.min(1, dt / 2);
    t += dt;
    ship.position.set(s.x, keelY + Math.sin(t * 0.8) * 0.25, s.z);
    ship.rotation.set(THREE.MathUtils.clamp(s.heel, -0.08, 0.08), s.psi, Math.sin(t * 0.6) * 0.008);

    // 물거품: 고물 뒤에, 빠를수록 자주
    foamTimer -= dt;
    if (ship.visible && Math.abs(s.v) > 1.5 && foamTimer <= 0) {
      foamTimer = 0.22;
      stern.set(s.x, 0, s.z).addScaledVector(fwd, SHIP.aftEnd - 2);
      dropFoam(stern, 4 + Math.abs(s.v) * 0.3, 12, 1.2);
      // 뱃머리 양옆 물결
      for (const side of [-1, 1]) {
        const bow = new THREE.Vector3(s.x, 0, s.z).addScaledVector(fwd, SHIP.foreEnd - 6);
        bow.x += -fwd.z * side * 14;
        bow.z += fwd.x * side * 14;
        dropFoam(bow, 2, 5, 1.6);
      }
    }
  }

  const cmd = (dur: number, label: string, set: Partial<typeof s>, extra?: () => void): Step => ({
    dur,
    label,
    enter: () => {
      zigMode = false;
      Object.assign(s, set);
      extra?.();
    },
  });

  const build = (): Step[] => [
    cmd(10, '시운전 해역에 들어옴', { vTarget: 8, tau: 5, rudder: 0 }, reset),
    cmd(16, '속력 시험 — 표지 부표 사이를 최고 속력으로 달림', { vTarget: 12, tau: 5, rudder: 0 }),
    cmd(73, '선회 시험 — 키를 끝까지 돌려 큰 원을 그림', { vTarget: 10, tau: 5, rudder: RUDDER_MAX }),
    cmd(25, '지그재그 시험 — 키를 좌우 20도씩 번갈아 돌림', { vTarget: 9, tau: 5, rudder: 20 }, () => {
      zigFrom = s.psi;
      zigMode = true;
    }),
    {
      dur: 22,
      label: '긴급 정지 시험 — 전속 전진에서 전속 후진',
      enter: () => {
        zigMode = false;
        Object.assign(s, { vTarget: 0, tau: 6, rudder: 0 });
      },
      // 후진 프로펠러가 고물에서 물을 휘저음
      apply: (k) => {
        if (k < 0.8 && Math.random() < 0.3) {
          fwd.set(Math.cos(s.psi), 0, -Math.sin(s.psi));
          stern.set(s.x, 0, s.z).addScaledVector(fwd, SHIP.aftEnd + 4 + Math.random() * 10);
          dropFoam(stern, 3 + Math.random() * 3, 4, 3);
        }
      },
    },
    cmd(12, '시험을 마치고 돌아감', { vTarget: 8, tau: 4, rudder: 0 }),
    {
      dur: 4,
      label: '다음 배를 기다림',
      enter: () => {
        ship.visible = false;
      },
    },
  ];
  const main = sequence(build);

  function update(machineDt: number) {
    // 운동은 잘게 나눠 적분(×16 에서도 경로가 같게)
    let left = machineDt;
    while (left > 0) {
      const h = Math.min(0.05, left);
      main.update(h);
      integrate(h);
      left -= h;
    }
    updateFoam(machineDt);
  }
  return { update, status: () => main.label() };
}
