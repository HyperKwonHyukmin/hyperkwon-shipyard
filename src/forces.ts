/**
 * 힘 보기(2026-11-22 사용자: "누가 만들었지 하는 생각이 들게"). 조선소에서 눈에 안 보이는 힘을 그림으로 꺼낸다.
 * 설계동에만 있던 구조 이야기를 현장(도크·진수)으로 가져온 것이다.
 * - 받침 반력 그림: 도크 옆 안벽 위에 막대를 줄지어 세운다(도크 안은 벽과 선체에 가려 안 보인다). 막대 높이·색 = 그 자리 반목이 받는 무게.
 *   블록이 앉을 때마다 그 아래 막대가 자라고, 진수 때 물이 차면 부력이 넘겨받는 만큼 줄어 0 이 된다.
 * - 훅 하중: 크레인이 블록을 들고 있는 동안 훅 옆에 블록 이름과 무게.
 * - 왼쪽 숫자판: 앉은 블록 무게 합, 가장 큰 받침 반력, 진수 중에는 부력 몫.
 * 계산은 교육용 예시다(실제 설계 값 아님, 화면에도 적는다): 블록 무게는 경하중량(launch-calc 의 12,000 t)을
 * 블록 부피에 비례해 나눈 값이고, 블록 무게는 그 블록 길이 안의 받침에 고르게 실린다고 본다(선체 강성에 의한 재분배 무시).
 */
import * as THREE from 'three';
import { LIGHT_SHIP_T, buoyShare } from './launch-calc';

export interface ForcesOptions {
  scene: THREE.Scene;
  camera: THREE.Camera;
  /** 받침(반목) 자리의 x 들 */
  keelX: number[];
  /** 막대를 세울 자리: 줄의 z 와 바닥 y */
  aisleZ: number;
  floorY: number;
  /** 블록이 제자리에 있을 때의 경계 상자(탑재 순서대로)와 이름 */
  boxes: THREE.Box3[];
  names: string[];
  placed: () => number;
  /** 지금 훅에 매달린 블록 번호(없으면 -1)와 훅 끝의 자리 */
  hooked: () => number;
  hookPoint: (out: THREE.Vector3) => THREE.Vector3;
  /** 도크 물 높이, 용골 높이, 흘수 */
  level: () => number;
  keelY: number;
  draft: number;
  hud: HTMLElement;
  tag: HTMLElement;
}

/** 막대가 가장 높을 때의 반력(t)과 높이(m) */
const REF_T = 520;
const MAX_H = 13;
const fmt = (n: number) => Math.round(n).toLocaleString('ko-KR');

export function createForces(o: ForcesOptions) {
  // 블록 무게: 부피에 비례(10 t 단위)
  const size = new THREE.Vector3();
  const vol = o.boxes.map((b) => {
    b.getSize(size);
    return size.x * size.y * size.z;
  });
  const total = vol.reduce((s, v) => s + v, 0);
  const weight = vol.map((v) => Math.max(10, Math.round(((v / total) * LIGHT_SHIP_T) / 10) * 10));
  /** 블록마다 그 길이 안에 있는 받침 번호들 */
  const under = o.boxes.map((b) => {
    const ks: number[] = [];
    o.keelX.forEach((x, k) => {
      if (x >= b.min.x - 1 && x <= b.max.x + 1) ks.push(k);
    });
    if (!ks.length) {
      // 받침 사이에 든 짧은 블록은 가장 가까운 받침 하나에
      const c = (b.min.x + b.max.x) / 2;
      ks.push(o.keelX.reduce((best, x, k) => (Math.abs(x - c) < Math.abs(o.keelX[best] - c) ? k : best), 0));
    }
    return ks;
  });

  const bars = new THREE.InstancedMesh(
    new THREE.BoxGeometry(2.6, 1, 1.2).translate(0, 0.5, 0),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.9 }),
    o.keelX.length,
  );
  bars.visible = false;
  bars.frustumCulled = false;
  o.scene.add(bars);
  const m4 = new THREE.Matrix4();
  const col = new THREE.Color();
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scl = new THREE.Vector3();
  /** 파랑(가벼움) → 초록 → 노랑 → 빨강(무거움) */
  const RAMP: [number, number][] = [[0, 0x3d7fd0], [0.4, 0x3fae5a], [0.7, 0xe2b324], [1, 0xdc3b2a]];
  const a = new THREE.Color();
  const b = new THREE.Color();
  function ramp(k: number) {
    for (let i = 1; i < RAMP.length; i++)
      if (k <= RAMP[i][0]) return col.copy(a.setHex(RAMP[i - 1][1])).lerp(b.setHex(RAMP[i][1]), (k - RAMP[i - 1][0]) / (RAMP[i][0] - RAMP[i - 1][0]));
    return col.setHex(RAMP[RAMP.length - 1][1]);
  }

  o.hud.innerHTML = `
    <strong>힘 보기</strong>
    <p id="fc-sum"></p>
    <p id="fc-max"></p>
    <p id="fc-buoy" hidden></p>
    <div class="fc-bm">
      <p id="fc-bm-t"></p>
      <svg viewBox="0 0 200 64" aria-hidden="true"><line x1="4" y1="32" x2="196" y2="32" class="fc-ax"/><path id="fc-bm-c"/></svg>
    </div>
    <div class="fc-legend" aria-hidden="true"><i></i><span>가벼움</span><span>무거움</span></div>
    <small>막대 = 그 자리 받침(반목)이 받는 무게. 교육용 예시이며 실제 설계 값이 아닙니다.</small>`;
  const sumEl = o.hud.querySelector<HTMLElement>('#fc-sum')!;
  const maxEl = o.hud.querySelector<HTMLElement>('#fc-max')!;
  const buoyEl = o.hud.querySelector<HTMLElement>('#fc-buoy')!;
  const bmText = o.hud.querySelector<HTMLElement>('#fc-bm-t')!;
  const bmCurve = o.hud.querySelector<SVGPathElement>('#fc-bm-c')!;
  /**
   * 지금까지 앉은 블록만으로 배를 띄운다면 선체(긴 보)에 걸리는 정수 중 굽힘 모멘트.
   * 무게: 블록 무게를 그 블록 길이에 고르게. 부력: 길이 방향 일차식(힘과 모멘트가 무게와 평형 — 트림한 상자형으로 본 것).
   * 하중(무게 − 부력)을 두 번 적분해 굽힘 모멘트를 구한다. 교육용 예시(실제 종강도 계산 아님).
   */
  function stillWater(n: number) {
    const N = 96;
    const x0 = Math.min(...o.boxes.map((b) => b.min.x));
    const x1 = Math.max(...o.boxes.map((b) => b.max.x));
    const dx = (x1 - x0) / N;
    const wgt = new Float64Array(N);
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < n; i++) {
      const b = o.boxes[i];
      lo = Math.min(lo, b.min.x);
      hi = Math.max(hi, b.max.x);
      const per = weight[i] / Math.max(1, b.max.x - b.min.x);
      for (let k = 0; k < N; k++) {
        const c = x0 + (k + 0.5) * dx;
        if (c >= b.min.x && c <= b.max.x) wgt[k] += per * dx;
      }
    }
    if (n === 0 || hi - lo < 20) return null;
    // 부력은 선체가 있는 구간(lo~hi)에만: b(x) = p + q·(x − 가운데)
    let Wt = 0;
    let Mw = 0;
    const mid = (lo + hi) / 2;
    const L = hi - lo;
    for (let k = 0; k < N; k++) {
      Wt += wgt[k];
      Mw += wgt[k] * (x0 + (k + 0.5) * dx - mid);
    }
    const p = Wt / L;
    const q = (12 * Mw) / L ** 3;
    const M = new Float64Array(N + 1);
    let V = 0;
    for (let k = 0; k < N; k++) {
      const c = x0 + (k + 0.5) * dx;
      const buoy = c >= lo && c <= hi ? Math.max(0, p + q * (c - mid)) * dx : 0;
      V += wgt[k] - buoy;
      M[k + 1] = M[k] + V * dx;
    }
    // 끝에서 0 이 되게 남은 오차를 고르게 뺀다
    for (let k = 0; k <= N; k++) M[k] -= (M[N] * k) / N;
    let peak = 0;
    for (const v of M) if (Math.abs(v) > Math.abs(peak)) peak = v;
    return { M, peak };
  }
  function drawBM(n: number) {
    const r = stillWater(n);
    if (!r) {
      bmText.textContent = '';
      bmCurve.setAttribute('d', '');
      return;
    }
    // 부호: 하중(무게 − 부력, 아래가 +)을 그대로 두 번 적분했으므로 + 가 호깅이다(양 끝이 무거우면 +). 그림은 호깅을 위로 그린다
    const scale = 26 / Math.max(1, Math.abs(r.peak));
    bmCurve.setAttribute('d', [...r.M].map((v, k) => `${k ? 'L' : 'M'}${(4 + (192 * k) / (r.M.length - 1)).toFixed(1)} ${(32 - v * scale).toFixed(1)}`).join(' '));
    // t·m → MN·m (1 t·m ≈ 9.81 kN·m)
    bmText.textContent = `지금 띄운다면 선체 굽힘 최대 약 ${fmt((Math.abs(r.peak) * 9.81) / 1000)} MN·m · ${r.peak > 0 ? '호깅(가운데가 솟음)' : '새깅(가운데가 처짐)'}`;
  }

  let on = false;
  let timer = 0;
  let lastKey = '';
  const load = new Float32Array(o.keelX.length);

  function redraw() {
    const n = o.placed();
    const share = buoyShare(o.level(), o.keelY, o.draft);
    const key = `${n}|${share.toFixed(3)}`;
    if (key === lastKey) return;
    lastKey = key;
    load.fill(0);
    let sum = 0;
    for (let i = 0; i < n; i++) {
      sum += weight[i];
      for (const k of under[i]) load[k] += (weight[i] / under[i].length) * (1 - share);
    }
    let max = 0;
    o.keelX.forEach((x, k) => {
      max = Math.max(max, load[k]);
      // 무게가 없는 자리도 낮은 회색 받침으로 남겨 막대 그림의 축이 보이게 한다
      const h = Math.max(0.3, Math.min(1.15, load[k] / REF_T) * MAX_H);
      bars.setMatrixAt(k, m4.compose(pos.set(x, o.floorY, o.aisleZ), quat, scl.set(1, h, 1)));
      bars.setColorAt(k, load[k] < 1 ? col.setHex(0x5a6472) : ramp(Math.min(1, load[k] / REF_T)));
    });
    bars.instanceMatrix.needsUpdate = true;
    if (bars.instanceColor) bars.instanceColor.needsUpdate = true;
    drawBM(n);
    sumEl.textContent = n ? `앉은 블록 ${n}개 · 약 ${fmt(sum)} t` : '아직 앉은 블록이 없습니다';
    maxEl.textContent = max > 1 ? `받침 하나가 받는 가장 큰 무게 약 ${fmt(max)} t` : share >= 1 ? '배가 떠서 받침이 받는 무게가 없습니다' : '';
    buoyEl.hidden = share <= 0;
    if (share > 0) buoyEl.textContent = `부력이 넘겨받은 몫 ${Math.round(share * 100)}% · 받침에 남은 무게 약 ${fmt(sum * (1 - share))} t`;
  }

  const p = new THREE.Vector3();
  function update(dt: number, here: boolean) {
    const show = on && here;
    if (bars.visible !== show) {
      bars.visible = show;
      o.hud.hidden = !show;
      if (!show) o.tag.hidden = true;
      lastKey = '';
    }
    if (!show) return;
    timer -= dt;
    if (timer <= 0) {
      timer = 0.25;
      redraw();
    }
    // 훅 하중 꼬리표: 훅 끝을 화면 좌표로
    const i = o.hooked();
    if (i < 0) {
      o.tag.hidden = true;
      return;
    }
    o.hookPoint(p).project(o.camera);
    const off = p.z > 1 || Math.abs(p.x) > 1.05 || Math.abs(p.y) > 1.05;
    o.tag.hidden = off;
    if (off) return;
    // 숫자판과 겹치면(좁은 화면) 숫자판 아래로 내린다
    const hudBox = o.hud.getBoundingClientRect();
    const tx = Math.min(((p.x + 1) / 2) * window.innerWidth + 14, window.innerWidth - 8 - o.tag.offsetWidth);
    let ty = ((1 - p.y) / 2) * window.innerHeight - 12;
    if (tx < hudBox.right + 4 && ty < hudBox.bottom + 6) ty = hudBox.bottom + 6;
    o.tag.style.transform = `translate(${Math.max(4, tx)}px, ${ty}px)`;
    const text = `훅 하중 약 ${fmt(weight[i])} t · ${o.names[i]}`;
    if (o.tag.textContent !== text) o.tag.textContent = text;
  }

  return {
    update,
    setOn(v: boolean) {
      on = v;
    },
    get on() {
      return on;
    },
    /** 확인용 */
    debug: () => ({ weight, load: [...load] }),
  };
}
