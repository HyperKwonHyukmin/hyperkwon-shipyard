/**
 * P3-1 진수(공식 공정 10 진수). 도크에서 탑재가 끝나면 이어서 시작한다.
 *  준비(크레인이 물러남) → 도크에 바닷물 채우기(배가 뜸) → 게이트(케이슨)가 떠서 비켜남
 *  → 예인선 두 척이 배를 바다로 끌어냄 → 물을 빼고 게이트를 닫음 → 다음 배 탑재 시작.
 * 탑재 애니메이션은 끝나면 멈춰 기다리고(holdAtEnd), 진수가 끝나면 restart() 로 처음부터 다시 쌓는다.
 * 건조 시점 막대를 움직이면 진수를 멈추고 모든 것을 제자리로 돌린다(abort).
 */
import * as THREE from 'three';
import { sequence, lerp, inOut, type Step } from './factory/shed';

interface Options {
  scene: THREE.Scene;
  ship: THREE.Object3D;
  gate: THREE.Object3D;
  /** 도크 안쪽 범위(물을 채울 곳) */
  dock: { x0: number; x1: number; halfW: number; floorY: number };
  seaY: number;
  /** 뜬 배의 흘수(기선에서 수면까지) */
  draft: number;
  /** 크레인을 비킬 때 */
  parkCrane: (k: number) => void;
  isComplete: () => boolean;
  restart: () => void;
}

const HOLD = 6; // 탑재가 끝나고 진수를 시작하기까지
const OUT_X = 460; // 배가 사라지는 곳

export function tug() {
  const g = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(16, 3, 6), new THREE.MeshStandardMaterial({ color: 0x1d2a3a, roughness: 0.6 }));
  hull.position.y = 1;
  const band = new THREE.Mesh(new THREE.BoxGeometry(16.2, 0.6, 6.2), new THREE.MeshStandardMaterial({ color: 0xc8261b, roughness: 0.6 }));
  band.position.y = 0.2;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(5, 3, 4), new THREE.MeshStandardMaterial({ color: 0xe6e6df, roughness: 0.6 }));
  cabin.position.set(2, 4, 0);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 3, 6), new THREE.MeshStandardMaterial({ color: 0x2a2e35 }));
  mast.position.set(2.5, 7, 0);
  g.add(hull, band, cabin, mast);
  g.traverse((o) => ((o as THREE.Mesh).castShadow = true));
  return g;
}

export function createLaunch(o: Options) {
  const keelY = o.ship.position.y;
  const floatY = o.seaY - o.draft;
  const gate0 = o.gate.position.clone();

  // 도크 안 물(바다와 같은 색, 반투명)
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(o.dock.x1 - o.dock.x0, o.dock.halfW * 2),
    new THREE.MeshStandardMaterial({ color: 0x2d5f86, roughness: 0.25, metalness: 0.3, transparent: true, opacity: 0.85 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set((o.dock.x0 + o.dock.x1) / 2, o.dock.floorY, 0);
  water.visible = false;
  o.scene.add(water);
  let level = o.dock.floorY;
  function setLevel(y: number) {
    level = y;
    water.position.y = y;
    water.visible = y > o.dock.floorY + 0.05;
    // 물이 흘수보다 높아지면 배가 뜬다
    o.ship.position.y = Math.max(keelY, y - o.draft);
  }

  // 예인선 두 척과 줄
  const tugs = [tug(), tug()];
  const lines = tugs.map(() => {
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1, 6), new THREE.MeshStandardMaterial({ color: 0xd9d6cc }));
    o.scene.add(l);
    return l;
  });
  for (const t of tugs) o.scene.add(t);
  const TUG_Z = [-9, 9];
  const bow = () => o.ship.position.x + 95;
  function placeTugs(lead: number, visible: boolean) {
    tugs.forEach((t, i) => {
      t.visible = visible;
      lines[i].visible = visible;
      t.position.set(bow() + lead, o.seaY - 1.6, TUG_Z[i]);
      // 줄: 배 이물 갑판(뜬 배 기준) → 예인선 고물
      const a = new THREE.Vector3(bow(), floatY + 16, TUG_Z[i] * 0.3);
      const b = new THREE.Vector3(t.position.x - 8, o.seaY + 1, TUG_Z[i]);
      const d = new THREE.Vector3().subVectors(b, a);
      lines[i].position.copy(a).addScaledVector(d, 0.5);
      lines[i].scale.y = d.length();
      lines[i].quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    });
  }
  placeTugs(40, false);

  const gateOut = () => new THREE.Vector3(gate0.x + 24, gate0.y + 1.5, gate0.z);
  const gateAside = () => new THREE.Vector3(gate0.x + 24, gate0.y + 1.5, gate0.z + 70);

  let label = '';
  let active = false;
  let wait = 0;
  let seq: ReturnType<typeof sequence> | null = null;

  const build = (): Step[] => [
    { dur: 5, label: '선체 완성 — 크레인이 물러나고 진수 준비', apply: (k) => o.parkCrane(k) },
    { dur: 14, label: '도크에 바닷물을 채움 — 물이 차오르면 배가 뜸', apply: (k) => setLevel(lerp(o.dock.floorY, o.seaY, k)) },
    {
      dur: 5,
      label: '게이트를 띄워 바다 쪽으로 뺌',
      apply: (k) => {
        o.gate.position.lerpVectors(gate0, gateOut(), inOut(k));
        placeTugs(lerp(160, 40, inOut(k)), true);
      },
    },
    { dur: 5, label: '게이트를 옆으로 비킴', apply: (k) => o.gate.position.lerpVectors(gateOut(), gateAside(), inOut(k)) },
    {
      dur: 26,
      label: '예인선이 배를 끌어냄',
      apply: (k) => {
        o.ship.position.x = lerp(0, OUT_X, k * k);
        placeTugs(40, true);
      },
    },
    {
      dur: 4,
      label: '배가 의장 안벽으로 떠남',
      enter: () => {
        o.ship.visible = false;
        placeTugs(40, false);
      },
    },
    { dur: 5, label: '게이트를 닫음', apply: (k) => o.gate.position.lerpVectors(gateAside(), gate0, inOut(k)) },
    { dur: 8, label: '도크 물을 뺌 — 다음 배 준비', apply: (k) => setLevel(lerp(o.seaY, o.dock.floorY, k)) },
    {
      dur: 0.1,
      label: '다음 배 탑재 시작',
      enter: () => {
        finish();
        o.restart();
      },
    },
  ];

  /** 모든 것을 제자리로(배는 도크 바닥, 물 없음, 게이트 닫힘) */
  function finish() {
    active = false;
    seq = null;
    wait = 0;
    label = '';
    setLevel(o.dock.floorY);
    o.ship.position.set(0, keelY, 0);
    o.ship.visible = true;
    o.gate.position.copy(gate0);
    placeTugs(40, false);
  }

  function update(dt: number) {
    if (!active) {
      if (!o.isComplete()) {
        wait = 0;
        return;
      }
      wait += dt;
      label = `탑재 완료 — ${Math.max(0, Math.ceil(HOLD - wait))}초 뒤 진수 시작`;
      if (wait < HOLD) return;
      active = true;
      seq = sequence(build);
    }
    seq!.update(dt);
    if (active && seq) label = seq.label();
  }

  return {
    update,
    /** 막대를 움직이거나 '진수 바로 보기'를 누를 때: 진수를 멈추고 제자리로 */
    abort: finish,
    get active() {
      return active;
    },
    status: () => label || '도크에서 블록 탑재가 끝나면 진수가 시작됩니다',
    get level() {
      return level;
    },
  };
}
