/**
 * P3-1 진수(공식 공정 10 진수). 도크에서 탑재가 끝나면 이어서 시작한다.
 *  준비(크레인이 물러남) → 도크에 바닷물 채우기(배가 뜸) → 게이트(케이슨)가 떠서 비켜남
 *  → 예인선 두 척이 배를 바다로 끌어냄 → 물을 빼고 게이트를 닫음 → 다음 배 탑재 시작.
 * 탑재 애니메이션은 끝나면 멈춰 기다리고(holdAtEnd), 진수가 끝나면 restart() 로 처음부터 다시 쌓는다.
 * 건조 시점 막대를 움직이면 진수를 멈추고 모든 것을 제자리로 돌린다(abort).
 */
import * as THREE from 'three';
import { sequence, lerp, inOut, type Step } from './factory/shed';
import { buoyShare, towStep, KN, SAFE_KN, TIME_X } from './launch-calc';

/** 직접 진수 단계: 크레인 비킴 → 물 채우기(사용자) → 게이트(자동) → 예인(사용자) → 떠남(자동) */
export type ManualPhase = 'park' | 'fill' | 'gate' | 'tow' | 'leave';
export interface ManualResult {
  sec: number;
  vmaxKn: number;
  overSec: number;
  fillM3: number;
}

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

  // ── 직접 진수(2026-11-15): 물 채우기와 예인을 사용자가 한다 ──
  const TOW_END = 215; // 배 꼬리(x - 95)가 게이트(약 x 110)를 넉넉히 빠져나간 자리
  let man: {
    phase: ManualPhase;
    k: number;
    valve: boolean;
    pull: number;
    v: number;
    t: number;
    vmax: number;
    over: number;
    seq?: ReturnType<typeof sequence>;
  } | null = null;
  let result: ManualResult | null = null;
  const sternInDock = () => o.ship.position.x - 95 < o.dock.x1 + 4;
  const leaveSteps = (): Step[] => [
    {
      dur: 6,
      label: '예인선이 배를 의장 안벽 쪽으로 데려감',
      apply: (k) => {
        o.ship.position.x = lerp(TOW_END, OUT_X, k * k);
        placeTugs(40, true);
      },
    },
    { dur: 0.5, label: '배가 떠남', enter: () => ((o.ship.visible = false), placeTugs(40, false)) },
    { dur: 4, label: '게이트를 닫음', apply: (k) => o.gate.position.lerpVectors(gateAside(), gate0, inOut(k)) },
    { dur: 5, label: '도크 물을 뺌 — 다음 배 준비', apply: (k) => setLevel(lerp(o.seaY, o.dock.floorY, k)) },
    { dur: 0.1, label: '다음 배 탑재 시작', enter: () => (finish(), o.restart()) },
  ];
  function manualUpdate(dt: number) {
    const m = man!;
    if (m.phase !== 'leave') m.t += dt;
    if (m.phase === 'park') {
      m.k = Math.min(1, m.k + dt / 3);
      o.parkCrane(m.k);
      label = '크레인이 물러나는 중';
      if (m.k >= 1) ((m.phase = 'fill'), (m.k = 0));
    } else if (m.phase === 'fill') {
      // 11 m 를 약 14 초에(실제로는 몇 시간)
      if (m.valve) setLevel(Math.min(o.seaY, level + dt * 0.8));
      label = m.valve ? '바닷물을 채우는 중' : '급수 밸브를 여세요';
    } else if (m.phase === 'gate') {
      m.k = Math.min(1, m.k + dt / 8);
      const a = Math.min(1, m.k * 2);
      const b = Math.max(0, m.k * 2 - 1);
      if (b <= 0) o.gate.position.lerpVectors(gate0, gateOut(), inOut(a));
      else o.gate.position.lerpVectors(gateOut(), gateAside(), inOut(b));
      placeTugs(lerp(160, 40, inOut(a)), true);
      label = '게이트를 띄워 비키는 중 — 예인선이 줄을 잡음';
      if (m.k >= 1) ((m.phase = 'tow'), (m.k = 0));
    } else if (m.phase === 'tow') {
      m.v = towStep(m.v, m.pull, dt * TIME_X);
      o.ship.position.x = Math.max(0, o.ship.position.x + m.v * dt * TIME_X);
      placeTugs(40, true);
      const kn = m.v * KN;
      m.vmax = Math.max(m.vmax, kn);
      if (kn > SAFE_KN && sternInDock()) m.over += dt;
      label = sternInDock() ? '배를 도크 밖으로 끌어내는 중' : '도크를 빠져나왔습니다';
      if (o.ship.position.x >= TOW_END) {
        result = { sec: m.t, vmaxKn: m.vmax, overSec: m.over, fillM3: (o.dock.x1 - o.dock.x0) * o.dock.halfW * 2 * (o.seaY - o.dock.floorY) };
        m.phase = 'leave';
        m.seq = sequence(leaveSteps);
      }
    } else {
      m.seq!.update(dt);
      if (man) label = m.seq!.label();
    }
  }
  const manual = {
    start() {
      finish();
      man = { phase: 'park', k: 0, valve: false, pull: 0, v: 0, t: 0, vmax: 0, over: 0 };
      result = null;
      active = true;
    },
    get on() {
      return man !== null;
    },
    get phase() {
      return man?.phase ?? null;
    },
    setValve(on: boolean) {
      if (man?.phase === 'fill') man.valve = on;
    },
    get valve() {
      return man?.valve ?? false;
    },
    /** 게이트 열기. 열 수 없으면 까닭을 돌려준다 */
    openGate(): string | null {
      if (!man || man.phase !== 'fill') return null;
      const gap = o.seaY - level;
      if (gap > 0.05) return `안팎 수위가 같아야 게이트를 열 수 있습니다. 바다보다 ${gap.toFixed(1)} m 낮음 — 열면 바닷물이 쏟아져 들어옵니다.`;
      man.valve = false;
      man.phase = 'gate';
      man.k = 0;
      return null;
    },
    setPull(p: number) {
      if (man) man.pull = p;
    },
    /** 화면 숫자 */
    read() {
      return {
        depth: level - o.dock.floorY,
        full: o.seaY - o.dock.floorY,
        share: buoyShare(level, keelY, o.draft), // 용골이 반목 위에 있으므로 용골 높이부터
        kn: (man?.v ?? 0) * KN,
        stern: sternInDock(),
        dist: o.ship.position.x,
        towEnd: TOW_END,
      };
    },
    get result() {
      return result;
    },
  };

  /** 모든 것을 제자리로(배는 도크 바닥, 물 없음, 게이트 닫힘) */
  function finish() {
    man = null;
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

  function update(dt: number, realDt = dt) {
    if (man) {
      manualUpdate(realDt);
      return;
    }
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
    manual,
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
