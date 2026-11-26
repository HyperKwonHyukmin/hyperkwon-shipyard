/**
 * 골리앗 크레인 운전 체험(2026-11-14, 검토 추천 ①). 자동 탑재를 멈추고 지금 차례의 블록을 사용자가 직접 올린다.
 * 1) 훅을 적치장 트랜스포터 위 블록으로 옮겨 걸기 → 2) 들어 올려 도크의 녹색 표시 위로 → 3) 흔들림을 잡으며 천천히 내려 앉히기.
 * 결과는 점수가 아니라 현장에서 보는 숫자(수평 오차, 닿을 때 하강 속도, 걸린 시간)로만 보여 준다(놀이 요소 없음 원칙).
 * quick 모드(한 척 짓기): 블록을 건 채 제자리 앞에서 시작 → 내려 앉히면 같은 장면에서 이음 맞추기(세팅) → 가용접. 아래 quick 주석 참고.
 * 계산은 crane-calc.ts(순수 함수). 키: 방향키·WASD 이동(화면 기준), R 올림, F 내림, Space 걸기·내려놓기, C 시점, Esc 끝.
 * 2026-11-14 사용자 "어렵고 불편하다"로 고침: 기본 시점을 주행 방향 뒤 위에서 내려다보게(85 m 대각선 → 약 58°), 방향키는 화면에서 가장 가까운
 * 크레인 축 하나로만(대각선으로 미끄러지지 않게), 목표 근처에서 키를 놓으면 자석처럼 맞춰 줌, 목표까지 화면 방향 안내와 바닥 안내선.
 */
import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { LIMIT, FIT, MAGNET, drive, swing, swayOffset, lowest, fitCheck, type Axis, type Sway, type Rect } from './crane-calc';

export interface OperateRig {
  crane: THREE.Object3D;
  trolley: THREE.Object3D;
  setHookPoint: (y: number) => void;
  getHookPoint: () => number;
  /** 훅(과 매단 블록)을 트롤리 바로 아래에서 이만큼 옮김(흔들림) */
  setSway: (x: number, z: number) => void;
  /** 트롤리 매단 점의 월드 높이 */
  trolleyY: number;
  /** 훅이 올라갈 수 있는 가장 높은 곳(월드 y) */
  hookTop: number;
  /** 운전실 위치(크레인 기준) */
  cab: THREE.Vector3;
}
interface Hand {
  name: string;
  box: THREE.Box3;
  pickup: THREE.Vector3;
  height: number;
}
export interface OperateOptions {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  rig: OperateRig;
  erection: {
    hand: () => Hand | null;
    carryAt: (x: number, top: number, z: number) => void;
    landed: () => void;
    placedBoxes: () => THREE.Box3[];
    resume: () => void;
  };
  /** 도크 구덩이(x 범위, 반폭, 바닥 높이)와 크레인이 다닐 수 있는 범위 */
  dock: { x0: number; x1: number; halfW: number; floorY: number };
  travel: [number, number];
  trolleyZ: number;
  /** 트랜스포터 적재면(적치장) — 블록을 내려놓을 수 있는 받침 */
  truck: { x: number; hx: number; hz: number; top: number };
  hud: HTMLElement;
  onExit: () => void;
  /** 블록이 앉은 순간의 결과(한 척 짓기가 받는다) */
  onLanded?: (r: { name: string; off: number; touch: number; hard: boolean; sway: number; sec: number; fit: [number, number, number] | null }) => void;
  /** 블록이 받침에 처음 닿은 순간(소리용) */
  onImpact?: (speed: number, hard: boolean) => void;
  /** quick 모드: 블록이 앉아 이음 맞추기로 넘어간 순간 */
  onSeated?: (hard: boolean) => void;
  /** quick 모드: 더 올릴 블록이 없을 때 */
  onEmpty?: () => void;
  /** quick 모드: 그 블록의 세팅 시작 오차(mm) [앞뒤 틈, 좌우 어긋남, 단차] */
  fitStart?: (name: string) => [number, number, number];
  /** quick 모드: 바람 세기(매단 점에 더하는 가속도 진폭 m/s²) */
  wind?: () => number;
}

const rectOf = (b: THREE.Box3): Rect => ({
  x: (b.min.x + b.max.x) / 2,
  z: (b.min.z + b.max.z) / 2,
  hx: (b.max.x - b.min.x) / 2,
  hz: (b.max.z - b.min.z) / 2,
});

export function createOperate(o: OperateOptions) {
  const { camera, controls, rig } = o;
  let active = false;
  let view: 'follow' | 'cab' = 'follow';
  let phase: 'approach' | 'hooked' | 'fit' | 'done' = 'approach';
  /**
   * quick 모드(한 척 짓기, 2026-11-22 재검토): 걸고 옮기는 긴 구간을 건너뛰고 블록을 건 채 제자리 앞에서 시작한다.
   * 앉으면 같은 장면에서 이음을 맞춘다(세팅): 잭·체인블록으로 mm 단위로 밀어 세 눈금을 허용 오차 안에 넣고 가용접.
   * 세게·어긋나게 내려놓으면 이음이 더 벌어진 채 시작한다(실수가 글자가 아니라 할 일로 돌아온다).
   */
  let quick = false;
  const FITQ = { tol: 3, speed: 9, accel: 40, brake: 18, range: 40, draw: 20 }; // mm, mm/s, mm/s². draw = 화면에서 과장해 그리는 배율
  const fx: Axis = { pos: 0, vel: 0 };
  const fz: Axis = { pos: 0, vel: 0 };
  const fy: Axis = { pos: 0, vel: 0 };
  /** 크레인이 내려놓은 자리에서 제자리로 미끄러져 들어가는 남은 거리 */
  const settle = { x: 0, z: 0 };
  let landOff = 0;
  let hardHit = false;
  let resting = false;
  let restT = 0;
  let askT = 0;
  let fly: { k: number; p0: THREE.Vector3; t0: THREE.Vector3; p1: THREE.Vector3; t1: THREE.Vector3 } | null = null;
  let hand: Hand | null = null;
  const travel: Axis = { pos: 0, vel: 0 };
  const trol: Axis = { pos: 0, vel: 0 };
  const hoist: Axis = { pos: 0, vel: 0 };
  const sway: Sway = { ax: 0, wx: 0, az: 0, wz: 0 };
  let clock = 0;
  let touchSpeed = -1;
  let maxSway = 0;
  let note = '';
  let noteTime = 0;
  const saved = { min: 0, max: 0, pan: true, zoom: true, polar: 0 };

  // ── 표시: 제자리 윤곽, 블록 아래 받침 표시 ──
  const marks = new THREE.Group();
  marks.visible = false;
  o.scene.add(marks);
  const outlineMat = new THREE.LineBasicMaterial({ color: 0x00e600, transparent: true, opacity: 0.9, depthTest: false });
  const outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), outlineMat);
  outline.renderOrder = 10;
  marks.add(outline);
  // 세팅: 블록이 지금 놓인 자리의 테두리(어긋났으면 주황, 맞으면 초록). 제자리 테두리(outline)에 겹치게 밀어 넣는다
  const ghostMat = new THREE.LineBasicMaterial({ color: 0xff7a3c, transparent: true, opacity: 0.95, depthTest: false });
  const ghost = new THREE.LineSegments(outline.geometry, ghostMat);
  ghost.renderOrder = 11;
  ghost.visible = false;
  marks.add(ghost);
  const ringGeo = new THREE.RingGeometry(0.8, 1.2, 32);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffd400, transparent: true, opacity: 0.85, depthTest: false });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.renderOrder = 10;
  marks.add(ring);
  // 블록 아래로 내린 수직선(높이 감각)
  const dropGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, -1, 0)]);
  const drop = new THREE.Line(dropGeo, new THREE.LineDashedMaterial({ color: 0xffd400, dashSize: 0.8, gapSize: 0.5, depthTest: false }));
  drop.renderOrder = 10;
  marks.add(drop);
  // 훅 아래 → 목표 가운데로 바닥 안내선(어느 쪽으로 가야 하는지)
  const guideGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(1, 0, 0)]);
  const guide = new THREE.Line(guideGeo, new THREE.LineDashedMaterial({ color: 0x7fe08f, dashSize: 1.2, gapSize: 0.8, depthTest: false }));
  guide.renderOrder = 10;
  guide.frustumCulled = false;
  marks.add(guide);
  // 닿는 순간·가용접 순간에 바닥으로 퍼지는 고리
  const pulseGeo = new THREE.RingGeometry(0.86, 1, 48);
  pulseGeo.rotateX(-Math.PI / 2);
  const pulseMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthTest: false, side: THREE.DoubleSide });
  const pulse = new THREE.Mesh(pulseGeo, pulseMat);
  pulse.renderOrder = 11;
  pulse.visible = false;
  pulse.frustumCulled = false;
  marks.add(pulse);
  let pulseT = 0;
  let pulseSize = 1;
  function pulseAt(x: number, y: number, z: number, color: number, size: number) {
    pulse.position.set(x, y + 0.25, z);
    pulseMat.color.setHex(color);
    pulseT = 0.7;
    pulseSize = size;
    pulse.visible = true;
  }
  // 충격 착지: 화면 흔들림(움직임 줄이기 설정이면 흔들지 않는다)
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const shakeOff = new THREE.Vector3();
  let shakeT = 0;
  let shakeAmp = 0;
  function shake(amp: number) {
    if (calm) return;
    shakeT = 0.45;
    shakeAmp = amp;
  }
  /** 효과 한 걸음(고리, 흔들림). 카메라 자리를 정한 뒤에 부른다 */
  function tickFx(dt: number) {
    if (pulseT > 0) {
      pulseT -= dt;
      const k = 1 - Math.max(0, pulseT) / 0.7;
      const s = (3 + 20 * k) * pulseSize;
      pulse.scale.set(s, 1, s);
      pulseMat.opacity = (1 - k) * 0.9;
      if (pulseT <= 0) pulse.visible = false;
    }
    camera.position.sub(shakeOff);
    if (shakeT > 0) {
      shakeT -= dt;
      const a = shakeAmp * Math.max(0, shakeT / 0.45);
      shakeOff.set((Math.random() - 0.5) * a, (Math.random() - 0.5) * a, (Math.random() - 0.5) * a);
    } else shakeOff.set(0, 0, 0);
    camera.position.add(shakeOff);
  }

  // ── 안내 화면 ──
  o.hud.innerHTML = `
    <div class="op-top">
      <strong id="op-title">크레인 운전</strong>
      <span id="op-step"></span>
      <button type="button" class="btn" id="op-view">C 운전실 시점</button>
      <button type="button" class="btn" id="op-exit">Esc 그만</button>
    </div>
    <dl class="op-read">
      <div><dt>목표까지(화면 방향)</dt><dd id="op-off">–</dd></div>
      <div><dt>아래 받침까지</dt><dd id="op-gap">–</dd></div>
      <div><dt>흔들림</dt><dd id="op-sway">–</dd></div>
      <div><dt>권상 속도</dt><dd id="op-hv">–</dd></div>
    </dl>
    <div class="op-fit" id="op-fit" hidden>
      <div class="fg"><span>앞뒤 틈</span><div class="fg-bar"><i></i><b id="fg-x"></b></div><output id="fo-x"></output></div>
      <div class="fg"><span>좌우 어긋남</span><div class="fg-bar"><i></i><b id="fg-z"></b></div><output id="fo-z"></output></div>
      <div class="fg"><span>단차(높이)</span><div class="fg-bar"><i></i><b id="fg-y"></b></div><output id="fo-y"></output></div>
      <small>방향키로 밀고 R·F 로 올리고 내립니다. 놓아도 조금 더 밀립니다. 주황 테두리(지금 자리)를 초록 테두리(제자리)에 겹치세요. 어긋남은 화면에서 20배 과장해 그렸고, 교육용 예시입니다.</small>
    </div>
    <p class="op-note" id="op-note" role="status"></p>
    <div class="op-pad" aria-label="운전 버튼">
      <button type="button" class="btn" data-k="left" aria-label="왼쪽">◀</button>
      <button type="button" class="btn" data-k="up" aria-label="앞">▲</button>
      <button type="button" class="btn" data-k="down" aria-label="뒤">▼</button>
      <button type="button" class="btn" data-k="right" aria-label="오른쪽">▶</button>
      <button type="button" class="btn" data-k="raise">R 올림</button>
      <button type="button" class="btn" data-k="lower">F 내림</button>
      <button type="button" class="btn primary" id="op-act">Space 걸기</button>
    </div>
    <div class="op-result" id="op-result" hidden></div>
    <p class="op-keys">방향키·WASD 이동 · R 올림 · F 내림 · Space 걸기·내려놓기 · 목표 근처에서 키를 놓으면 저절로 맞춰짐 · 교육용 예시, 속도는 실제보다 빠르게 함</p>`;
  const $ = (id: string) => o.hud.querySelector<HTMLElement>('#' + id)!;
  const stepEl = $('op-step');
  const offEl = $('op-off');
  const gapEl = $('op-gap');
  const swayEl = $('op-sway');
  const hvEl = $('op-hv');
  const noteEl = $('op-note');
  const actBtn = $('op-act') as HTMLButtonElement;
  const resultEl = $('op-result');
  const viewBtn = $('op-view');
  const fitEl = $('op-fit');
  const gauges = (['x', 'z', 'y'] as const).map((k) => ({ dot: $('fg-' + k), out: $('fo-' + k), row: $('fg-' + k).closest<HTMLElement>('.fg')! }));
  function setFitHud(on: boolean) {
    fitEl.hidden = !on;
    o.hud.classList.toggle('fitting', on);
    if (!on) ghost.visible = false;
  }
  o.hud.hidden = true;

  // ── 입력 ──
  const held = new Set<string>();
  const KEYMAP: Record<string, string> = {
    arrowleft: 'left', a: 'left', arrowright: 'right', d: 'right', arrowup: 'up', w: 'up', arrowdown: 'down', s: 'down', r: 'raise', f: 'lower',
  };
  window.addEventListener('keydown', (e) => {
    if (!active || (e.target as Element | null)?.closest?.('input, textarea, select')) return;
    const k = e.key.toLowerCase();
    if (KEYMAP[k]) {
      held.add(KEYMAP[k]);
      e.preventDefault();
    } else if (k === ' ') {
      act();
      e.preventDefault();
    } else if (k === 'c' && !quick) toggleView();
    else if (k === 'escape') o.onExit();
  });
  window.addEventListener('keyup', (e) => {
    const k = KEYMAP[e.key.toLowerCase()];
    if (k) held.delete(k);
  });
  window.addEventListener('blur', () => held.clear());
  o.hud.querySelectorAll<HTMLButtonElement>('[data-k]').forEach((b) => {
    const k = b.dataset.k!;
    b.addEventListener('pointerdown', (e) => {
      held.add(k);
      b.setPointerCapture(e.pointerId);
    });
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ev, () => held.delete(k));
  });
  actBtn.addEventListener('click', act);
  viewBtn.addEventListener('click', toggleView);
  $('op-exit').addEventListener('click', () => o.onExit());

  function say(text: string, sec = 2.5) {
    note = text;
    noteTime = sec;
  }
  function toggleView() {
    view = view === 'follow' ? 'cab' : 'follow';
    viewBtn.textContent = view === 'cab' ? 'C 바깥 시점' : 'C 운전실 시점';
    controls.enabled = view === 'follow';
    if (view === 'follow') placeFollowCamera();
  }

  // ── 상태 계산 ──
  const hookXZ = () => {
    const L = Math.max(4, rig.trolleyY - hoist.pos);
    const s = swayOffset(sway, L);
    return { x: travel.pos + s.x, z: trol.pos + s.z, sway: s.r };
  };
  /** 지금 블록이 차지하는 사각형(훅에 매달린 동안) */
  const myRect = (x: number, z: number): Rect => {
    const r = rectOf(hand!.box);
    return { x, z, hx: r.hx, hz: r.hz };
  };
  function floorUnder(me: Rect) {
    const d = o.dock;
    const inside = me.x - me.hx > d.x0 && me.x + me.hx < d.x1 && Math.abs(me.z) + me.hz < d.halfW;
    return inside ? d.floorY : 0;
  }
  function solids() {
    const list = o.erection.placedBoxes().map((b) => ({ r: rectOf(b), top: b.max.y }));
    list.push({ r: { x: o.truck.x, z: hand!.pickup.z, hx: o.truck.hx, hz: o.truck.hz }, top: o.truck.top });
    return list;
  }
  /** 블록 바닥이 내려갈 수 있는 높이 */
  function supportAt(x: number, z: number) {
    const me = myRect(x, z);
    const target = rectOf(hand!.box);
    return lowest(me, floorUnder(me), solids(), { r: target, bottom: hand!.box.min.y });
  }
  /** 옆으로 움직이다 부딪히나: 바닥이 이미 내려간 곳보다 받침이 높으면, 또는 지상 밖으로 도크 벽을 뚫으면 */
  function sideHit(x: number, z: number, bottom: number) {
    const me = myRect(x, z);
    if (bottom < -0.2 && floorUnder(me) === 0) return '도크 벽에 부딪힘 — 더 들어 올린 뒤 옮기세요';
    if (supportAt(x, z) > bottom + 0.15) return '다른 블록에 부딪힘 — 더 들어 올린 뒤 옮기세요';
    return '';
  }

  function act() {
    if (!active || !hand) return;
    if (phase === 'fit') {
      const worst = Math.max(Math.abs(fx.pos), Math.abs(fz.pos), Math.abs(fy.pos));
      if (worst > FITQ.tol && askT <= 0) {
        askT = 3;
        say(`아직 ${worst.toFixed(0)} mm 어긋나 있습니다. 한 번 더 누르면 이대로 가용접합니다(재작업이 생깁니다).`, 3);
        return;
      }
      finishFit();
      return;
    }
    if (phase === 'approach') {
      const h = hookXZ();
      const dist = Math.hypot(h.x - hand.pickup.x, h.z - hand.pickup.z);
      const dy = rig.getHookPoint() - hand.pickup.y;
      if (dist < 2.5 && dy > -0.6 && dy < 4) {
        phase = 'hooked';
        hoist.pos = hand.pickup.y;
        hoist.vel = 0;
        touchSpeed = -1;
        maxSway = 0;
        say('걸었습니다. 천천히 들어 올리세요(R).');
      } else if (dist >= 2.5) say(`훅이 블록 가운데에서 ${dist.toFixed(1)} m 떨어져 있습니다 — 초록 안내선을 따라가세요`);
      else say(`훅을 블록 윗면 가까이 ${dy > 0 ? '내리세요(F)' : '올리세요(R)'} — ${Math.abs(dy).toFixed(1)} m`);
      return;
    }
    if (phase === 'hooked') {
      const h = hookXZ();
      const bottom = hoist.pos - hand.height;
      const touching = bottom <= supportAt(h.x, h.z) + 0.03;
      const target = rectOf(hand.box);
      const off = Math.hypot(h.x - target.x, h.z - target.z);
      if (!touching) {
        const gapNow = bottom - supportAt(h.x, h.z);
        // 받침 바로 위(0.4 m 안)면 마저 내려 앉힌다(2026-11-22 검토: 0.2 m 앞에서 Space 가 반응이 없어 보였다 — 쉬운 조작이 먼저)
        if (quick || gapNow > 0.4) {
          say(`아직 공중입니다. 받침까지 ${gapNow.toFixed(1)} m — 더 내리세요(F).`, 3);
          return;
        }
        hoist.pos -= gapNow;
        hoist.vel = 0;
        if (touchSpeed < 0) touchSpeed = 0;
      }
      const fit = fitCheck(off, h.sway, true);
      if (!fit.ok) {
        say(fit.why, 3);
        return;
      }
      if (quick) {
        beginFit();
        return;
      }
      o.erection.landed();
      phase = 'done';
      showResult(off);
    }
  }

  function showResult(off: number, fit: [number, number, number] | null = null) {
    const hard = hardHit || touchSpeed > FIT.softTouch;
    o.onLanded?.({ name: hand!.name, off, touch: touchSpeed, hard, sway: maxSway, sec: clock, fit });
    if (quick) return; // 한 척 짓기에서는 그쪽 카드가 결과를 보여 준다
    resultEl.hidden = false;
    resultEl.innerHTML = `
      <h3>${hand!.name} 안착</h3>
      <table>
        <tr><th>수평 오차</th><td>${(off * 100).toFixed(0)} cm</td></tr>
        <tr><th>닿을 때 하강 속도</th><td>${Math.max(0, touchSpeed).toFixed(2)} m/s${hard ? ' · 충격 착지' : ''}</td></tr>
        <tr><th>가장 큰 흔들림</th><td>${(maxSway * 100).toFixed(0)} cm</td></tr>
        <tr><th>걸린 시간</th><td>${Math.floor(clock / 60)}분 ${Math.round(clock % 60)}초</td></tr>
      </table>
      <p class="op-why">${hard ? `닿기 직전에는 ${FIT.softTouch} m/s 보다 천천히 내립니다. 큰 블록이 세게 닿으면 반목과 이음부가 상합니다.` : '실제 탑재에서는 마지막 수 cm 를 가이드와 체인블록으로 맞춘 뒤 용접합니다.'}</p>
      <div class="op-next"><button type="button" class="btn primary" id="op-again">다음 블록도 운전</button><button type="button" class="btn" id="op-auto">자동 탑재로 돌아가기</button></div>`;
    resultEl.querySelector('#op-again')!.addEventListener('click', () => next());
    resultEl.querySelector('#op-auto')!.addEventListener('click', () => o.onExit());
  }

  /** 다음 차례 블록을 받아 처음 단계로 */
  function next() {
    resultEl.hidden = true;
    hand = o.erection.hand();
    phase = 'approach';
    clock = 0;
    setFitHud(false);
    hardHit = false;
    resting = false;
    fly = null;
    if (!hand) {
      if (quick) o.onEmpty?.();
      say('26개를 모두 올렸습니다. 도크 패널의 건조 시점 막대로 되돌린 뒤 다시 해 볼 수 있습니다.', 8);
      marks.visible = false;
      return;
    }
    const b = hand.box;
    outline.position.copy(b.getCenter(new THREE.Vector3()));
    outline.scale.copy(b.getSize(new THREE.Vector3()));
    marks.visible = true;
    if (quick) startQuick();
    else say(`${hand.name}: 적치장의 트랜스포터 위 블록으로 훅을 옮기세요`, 4);
  }

  /** quick 모드의 시작: 블록을 건 채 제자리 22 m 앞, 이미 앉은 블록들보다 4 m 위에 와 있다 */
  function startQuick() {
    const b = hand!.box;
    const t = rectOf(b);
    let clear = Math.max(4, b.min.y + 8);
    for (const p of o.erection.placedBoxes()) clear = Math.max(clear, p.max.y + 4);
    travel.pos = THREE.MathUtils.clamp(t.x - 22, o.travel[0], o.travel[1]);
    trol.pos = THREE.MathUtils.clamp(t.z + (t.z > 0 ? -6 : 6), -o.trolleyZ, o.trolleyZ);
    hoist.pos = Math.min(rig.hookTop, clear + hand!.height);
    travel.vel = trol.vel = hoist.vel = 0;
    sway.ax = sway.az = sway.wx = sway.wz = 0;
    phase = 'hooked';
    touchSpeed = -1;
    maxSway = 0;
    restT = 0;
    held.clear();
    apply();
    placeFollowCamera();
    say(`${hand!.name}: 윤곽선 위로 옮겨 내리세요. 받침 가까이에서는 F 를 끊어 눌러 살살`, 6);
  }

  /** 블록이 앉았다 → 같은 장면에서 이음 맞추기. 시작 오차 = 그 블록의 제작 오차 × (세게·어긋나게 내려놓은 만큼) */
  function beginFit() {
    if (!hand) return;
    const b = hand.box;
    const t = rectOf(b);
    const p = hookXZ();
    const f0 = o.fitStart?.(hand.name) ?? [12, -9, 6];
    const k = (hardHit ? 1.6 : 1) * (1 + Math.min(1, landOff / 0.5));
    const lim = FITQ.range - 4;
    fx.pos = THREE.MathUtils.clamp(f0[0] * k, -lim, lim);
    fz.pos = THREE.MathUtils.clamp(f0[1] * k, -lim, lim);
    fy.pos = THREE.MathUtils.clamp(f0[2] * (hardHit ? 1.6 : 1), -lim, lim);
    fx.vel = fz.vel = fy.vel = 0;
    settle.x = p.x - t.x;
    settle.z = p.z - t.z;
    phase = 'fit';
    askT = 0;
    held.clear();
    travel.vel = trol.vel = hoist.vel = 0;
    sway.ax = sway.az = sway.wx = sway.wz = 0;
    rig.setSway(0, 0);
    setFitHud(true);
    o.onSeated?.(hardHit);
    // 이음 가까이로: 이미 앉은 블록들 쪽 끝을, 선체 안쪽 위에서 내려다본다
    const placed = o.erection.placedBoxes();
    const cx = placed.length ? placed.reduce((s, q) => s + (q.min.x + q.max.x) / 2, 0) / placed.length : t.x - 1;
    const ex = cx < t.x ? b.min.x : b.max.x;
    const into = cx < t.x ? 1 : -1;
    const side = Math.abs(t.z) < 1 ? 1 : Math.sign(t.z);
    const look = new THREE.Vector3(ex, b.max.y - Math.min((b.max.y - b.min.y) * 0.5, 2), t.z);
    const cam = new THREE.Vector3(ex + into * 8, b.max.y + 8, t.z - side * 12);
    fly = { k: 0, p0: camera.position.clone(), t0: controls.target.clone(), p1: cam, t1: look };
    say(hardHit ? '충격 착지 — 블록이 밀려 이음이 더 벌어졌습니다. 세 눈금을 초록 안에 넣으세요.' : '앉았습니다. 세 눈금을 초록 안에 넣고 Space 로 가용접하세요.', 7);
  }

  /** 가용접: 블록을 제자리에 붙이고(용접 불꽃) 결과를 알린다 */
  function finishFit() {
    if (!hand) return;
    const res: [number, number, number] = [Math.round(fx.pos), Math.round(fz.pos), Math.round(fy.pos)];
    const ok = res.every((v) => Math.abs(v) <= FITQ.tol);
    const t = rectOf(hand.box);
    pulseAt(t.x, hand.box.max.y, t.z, ok ? 0x7cf08a : 0xffd400, 0.7);
    setFitHud(false);
    noteTime = 0;
    o.erection.landed();
    phase = 'done';
    showResult(landOff, res);
  }

  /** 세팅 한 걸음: 잭·체인블록으로 블록을 mm 단위로 민다(관성이 있어 놓아도 조금 더 밀린다) */
  function updateFit(dt: number, wx: number, wz: number, lift: number) {
    clock += dt;
    askT -= dt;
    drive(fx, wx, FITQ.speed, FITQ.accel, dt, -FITQ.range, FITQ.range, FITQ.brake);
    drive(fz, wz, FITQ.speed, FITQ.accel, dt, -FITQ.range, FITQ.range, FITQ.brake);
    drive(fy, lift, FITQ.speed, FITQ.accel, dt, -FITQ.range, FITQ.range, FITQ.brake);
    const k = Math.exp(-dt * 7);
    settle.x *= k;
    settle.z *= k;
    const b = hand!.box;
    const t = rectOf(b);
    const s = FITQ.draw / 1000;
    o.erection.carryAt(t.x + settle.x + fx.pos * s, b.max.y + fy.pos * s, t.z + settle.z + fz.pos * s);
    let ok = true;
    [fx, fz, fy].forEach((a, i) => {
      const g = gauges[i];
      const inside = Math.abs(a.pos) <= FITQ.tol;
      if (!inside) ok = false;
      g.dot.style.left = `${50 + THREE.MathUtils.clamp(a.pos / FITQ.range, -1, 1) * 50}%`;
      g.row.classList.toggle('ok', inside);
      const v = Math.round(a.pos);
      const text = `${v > 0 ? '+' : ''}${v} mm`;
      if (g.out.textContent !== text) g.out.textContent = text;
    });
    outlineMat.color.setHex(0x00e600);
    ghost.visible = true;
    ghost.scale.copy(outline.scale);
    ghost.position.set(outline.position.x + settle.x + fx.pos * s, outline.position.y + fy.pos * s, outline.position.z + settle.z + fz.pos * s);
    ghostMat.color.setHex(ok ? 0x00e600 : 0xff7a3c);
    ring.visible = drop.visible = guide.visible = false;
    stepEl.textContent = ok ? '이음이 맞았습니다 — Space 로 가용접' : '이음 맞추기 — 세 눈금을 초록 안으로';
    actBtn.textContent = 'Space 가용접';
    actBtn.hidden = false;
    noteTime -= dt;
    const text = noteTime > 0 ? note : '';
    if (noteEl.textContent !== text) noteEl.textContent = text;
    // 카메라: 이음 가까이로 날아간 뒤에는 그대로 둔다(끌어서 돌려 볼 수 있다)
    if (fly) {
      fly.k = Math.min(1, fly.k + dt / 0.8);
      const e = fly.k * fly.k * (3 - 2 * fly.k);
      camera.position.lerpVectors(fly.p0, fly.p1, e);
      controls.target.lerpVectors(fly.t0, fly.t1, e);
      shakeOff.set(0, 0, 0);
      if (fly.k >= 1) fly = null;
    }
    tickFx(dt);
  }

  // ── 카메라 ──
  const focus = new THREE.Vector3();
  /**
   * 카메라는 주행 방향 뒤(−x) 위에서 비스듬히(약 58°) 본다. 거더 바로 위에서 내려다보면 거더·다리가 블록과 목표를 가린다(2026-11-14 캡처).
   * 화면 위 = +x(도크 쪽 주행), 오른쪽 = +z(횡행). 보는 점을 훅보다 화면 아래(−x)로 당겨 훅이 위쪽에 오게 → 아래 운전 안내판에 안 가림
   */
  const FOCUS_DX = -16;
  const CAM_OFF = new THREE.Vector3(-45, 72, 0);
  /** quick 모드: 블록 바로 뒤 위에서 가까이. 흔들림이 보이도록 훅이 아니라 트롤리를 따라간다 */
  const CAM_OFF_Q = new THREE.Vector3(-30, 19, 11);
  function setFocus() {
    if (quick) focus.set(travel.pos + 4, hoist.pos - (hand ? hand.height / 2 : 6), trol.pos);
    else {
      const h = hookXZ();
      focus.set(h.x + FOCUS_DX, Math.max(0, hoist.pos - 6), h.z);
    }
  }
  /* 휴대폰(2026-11-26 점검: 한 척 짓기 시점이 블록에 붙어 윤곽선이 조작판 뒤로 숨었다):
     try-frame 의 phoneBack 처럼 뒤로 빼고, 보는 점을 내려 블록이 조작판 위쪽에 오게 한다 */
  const aimDrop = new THREE.Vector3();
  function placeFollowCamera() {
    setFocus();
    const off = (quick ? CAM_OFF_Q : CAM_OFF).clone();
    aimDrop.set(0, 0, 0);
    if (window.innerWidth < 700) {
      off.multiplyScalar(quick ? 2 : 1.3);
      aimDrop.y = off.length() * 0.15;
    }
    controls.target.copy(focus).sub(aimDrop);
    camera.position.copy(focus).add(off);
  }

  function enter(opt: { quick?: boolean } = {}) {
    if (active) return;
    active = true;
    quick = !!opt.quick;
    o.hud.classList.toggle('quick', quick);
    saved.min = controls.minDistance;
    saved.max = controls.maxDistance;
    saved.pan = controls.enablePan;
    saved.zoom = controls.zoomToCursor;
    saved.polar = controls.maxPolarAngle;
    controls.enablePan = false;
    controls.zoomToCursor = false;
    controls.autoRotate = false;
    controls.minDistance = quick ? 5 : 12;
    controls.maxDistance = 180;
    controls.maxPolarAngle = Math.PI * 0.48;
    controls.enabled = true;
    view = 'follow';
    viewBtn.textContent = 'C 운전실 시점';
    travel.pos = rig.crane.position.x;
    trol.pos = rig.trolley.position.z;
    hoist.pos = Math.max(rig.getHookPoint(), 20);
    travel.vel = trol.vel = hoist.vel = 0;
    sway.ax = sway.az = sway.wx = sway.wz = 0;
    o.hud.hidden = false;
    next();
    apply();
    placeFollowCamera();
  }
  function exit() {
    if (!active) return;
    active = false;
    held.clear();
    o.hud.hidden = true;
    marks.visible = false;
    setFitHud(false);
    quick = false;
    o.hud.classList.remove('quick', 'idle');
    pulse.visible = false;
    camera.position.sub(shakeOff);
    shakeOff.set(0, 0, 0);
    shakeT = 0;
    fly = null;
    rig.setSway(0, 0);
    controls.enabled = true;
    controls.enablePan = saved.pan;
    controls.zoomToCursor = saved.zoom;
    controls.minDistance = saved.min;
    controls.maxDistance = saved.max;
    controls.maxPolarAngle = saved.polar;
    o.erection.resume();
  }

  /** 크레인·트롤리·훅·블록 자리를 지금 값으로 */
  function apply() {
    rig.crane.position.x = travel.pos;
    rig.trolley.position.z = trol.pos;
    rig.setHookPoint(hoist.pos);
    const L = Math.max(4, rig.trolleyY - hoist.pos);
    const s = swayOffset(sway, L);
    rig.setSway(s.x, s.z);
    if (phase === 'hooked' && hand) o.erection.carryAt(travel.pos + s.x, hoist.pos, trol.pos + s.z);
  }

  const fwd = new THREE.Vector3();
  const cabWorld = new THREE.Vector3();
  /** 수평 방향(x, z)에 가장 가까운 크레인 축 */
  const axisOf = (x: number, z: number) =>
    Math.abs(x) >= Math.abs(z) ? { axis: 'x' as const, sign: Math.sign(x) || 1 } : { axis: 'z' as const, sign: Math.sign(z) || 1 };
  /** 목표까지의 수평 거리를 화면 방향(→ ← ↑ ↓)으로 */
  function screenDir(dx: number, dz: number) {
    if (Math.hypot(dx, dz) < 0.05) return '맞음';
    camera.getWorldDirection(fwd).setY(0).normalize();
    const up = dx * fwd.x + dz * fwd.z;
    const right = dx * -fwd.z + dz * fwd.x;
    const part = (val: number, pos: string, neg: string) => (Math.abs(val) < 0.05 ? '' : `${val > 0 ? pos : neg} ${Math.abs(val).toFixed(1)}`);
    return [part(right, '→', '←'), part(up, '↑', '↓')].filter(Boolean).join('  ') + ' m';
  }
  function update(dt: number) {
    if (!active || !(dt > 0)) return;
    if (phase !== 'done') clock += dt;
    // 화면 기준 입력을 주행(x)·횡행(z)으로 나눈다
    const h = (held.has('right') ? 1 : 0) - (held.has('left') ? 1 : 0);
    const v = (held.has('up') ? 1 : 0) - (held.has('down') ? 1 : 0);
    camera.getWorldDirection(fwd).setY(0);
    if (fwd.lengthSq() < 1e-6) fwd.set(1, 0, 0);
    fwd.normalize();
    // 화면 위·오른쪽을 각각 가장 가까운 크레인 축(x 주행, z 횡행) 하나로 맞춘다 → 키 하나는 늘 한 축으로만 움직임
    const upAx = axisOf(fwd.x, fwd.z);
    const rightAx = axisOf(-fwd.z, fwd.x);
    let wx = 0;
    let wz = 0;
    for (const [key, ax] of [[v, upAx], [h, rightAx]] as const) {
      if (!key) continue;
      if (ax.axis === 'x') wx = key * ax.sign;
      else wz = key * ax.sign;
    }
    let lift = (held.has('raise') ? 1 : 0) - (held.has('lower') ? 1 : 0);
    if (phase === 'fit' && hand) {
      updateFit(dt, wx, wz, lift);
      return;
    }
    // 감속 구간: 매단 블록이 받침 가까이 오면 내리는 속도를 저절로 줄인다(실제 권상 장치의 저속 구간을 대신)
    if (lift < 0 && hand && phase === 'hooked') {
      const hp = hookXZ();
      const gap = hoist.pos - hand.height - supportAt(hp.x, hp.z);
      // quick 모드는 덜 도와준다: F 를 누른 채 닿으면 0.8 m/s 로 충격 착지가 된다 → 받침 가까이에서는 끊어 눌러(촌동) 살살 내려야 한다
      const cap = quick ? Math.max(0.8, Math.min(LIMIT.hoist, gap * 0.9)) : Math.max(FIT.softTouch * 0.6, Math.min(LIMIT.hoist, gap * 0.7));
      lift = -cap / LIMIT.hoist;
    }

    const prev = { x: travel.pos, z: trol.pos, y: hoist.pos };
    const ax = drive(travel, wx, LIMIT.travel, LIMIT.accel, dt, o.travel[0], o.travel[1], LIMIT.brake);
    const az = drive(trol, wz, LIMIT.trolley, LIMIT.accel, dt, -o.trolleyZ, o.trolleyZ, LIMIT.brake);
    drive(hoist, lift, LIMIT.hoist, LIMIT.hoistAccel, dt, -Infinity, rig.hookTop);
    const L = Math.max(4, rig.trolleyY - hoist.pos);
    // quick 모드의 바람: 돌풍이 몰려왔다 잦아든다(잦아든 틈에 내리면 덜 어긋난다)
    let gx = 0;
    let gz = 0;
    if (quick && phase === 'hooked') {
      const w = o.wind?.() ?? 0;
      const env = Math.max(0, Math.sin(clock * 0.45 + 1)) ** 2;
      gx = w * env * Math.sin(clock * 0.9);
      gz = w * env * Math.cos(clock * 0.7) * 0.8;
    }
    swing(sway, ax + gx, az + gz, L, dt);

    // 자석 맞춤: 이동 키를 놓은 채 목표 반경 안이면 크레인이 목표 쪽으로 천천히 다가간다
    if (hand && !wx && !wz && phase !== 'done') {
      const t = phase === 'approach' ? { x: hand.pickup.x, z: hand.pickup.z } : rectOf(hand.box);
      const hp = quick ? { x: travel.pos, z: trol.pos } : hookXZ();
      const dx = t.x - hp.x;
      const dz = t.z - hp.z;
      const d = Math.hypot(dx, dz);
      if (d < MAGNET.radius && d > 0.01 && Math.abs(travel.vel) < 0.5 && Math.abs(trol.vel) < 0.5) {
        const step = Math.min(d, MAGNET.speed * dt) / d;
        travel.pos += dx * step;
        trol.pos += dz * step;
      }
    }

    if (hand && phase === 'hooked') {
      let p = hookXZ();
      // 옆으로 부딪힘: 움직이기 전 자리로 되돌리고 멈춤
      const hit = sideHit(p.x, p.z, prev.y - hand.height);
      if (hit) {
        travel.pos = prev.x;
        trol.pos = prev.z;
        travel.vel = trol.vel = 0;
        sway.wx *= -0.3;
        sway.wz *= -0.3;
        say(hit);
        p = hookXZ();
      }
      // 아래 받침에 닿으면 더 못 내려감. 처음 닿는 순간의 하강 속도를 기록
      const support = supportAt(p.x, p.z);
      const bottom = hoist.pos - hand.height;
      if (bottom <= support + 0.001) {
        if (touchSpeed < 0 || prev.y - hand.height > support + 0.02) touchSpeed = Math.max(0, (prev.y - hoist.pos) / dt);
        hoist.pos = support + hand.height;
        hoist.vel = Math.max(0, hoist.vel);
        if (!resting) {
          // 처음 닿는 순간: 소리·고리·흔들림. 세게 닿으면 이음이 더 벌어진다(세팅에서 드러남)
          resting = true;
          restT = 0;
          const tg = rectOf(hand.box);
          landOff = Math.hypot(p.x - tg.x, p.z - tg.z);
          const hard = touchSpeed > FIT.softTouch;
          if (hard) hardHit = true;
          o.onImpact?.(touchSpeed, hard);
          pulseAt(p.x, support, p.z, hard ? 0xff5a3c : 0x7cf08a, hard ? 1.5 : 0.8);
          if (hard) {
            shake(1.1);
            document.body.classList.add('op-impact');
            window.setTimeout(() => document.body.classList.remove('op-impact'), 420);
          } else if (touchSpeed > 0.2) shake(0.25);
        }
        // 받침에 앉아 있으면 흔들림이 빨리 잦아든다
        const k = Math.exp(-dt * 3);
        sway.ax *= k;
        sway.az *= k;
        sway.wx *= k;
        sway.wz *= k;
      } else {
        if (bottom > support + 0.3) touchSpeed = -1;
        if (bottom > support + 0.05) resting = false;
      }
      // quick 모드: 제자리 받침에 앉아 흔들림이 잦아들면 바로 세팅으로 넘어간다
      if (quick && resting && phase === 'hooked') {
        const tg = rectOf(hand.box);
        // 받침 높이가 제자리 바닥과 꼭 같을 필요는 없다(측벽 블록은 경계 상자가 이중저와 겹쳐 이중저 윗면에 걸친다)
        const seated = Math.hypot(p.x - tg.x, p.z - tg.z) <= FIT.offset && p.sway <= FIT.sway;
        restT = seated ? restT + dt : 0;
        if (restT > 0.35) beginFit();
      }
      maxSway = Math.max(maxSway, hookXZ().sway);
    } else {
      // 빈 훅: 땅 1 m 위, 블록 위에서는 블록 윗면까지
      const p = hookXZ();
      let floor = 1;
      if (hand && Math.abs(p.x - hand.pickup.x) < 3 && Math.abs(p.z - hand.pickup.z) < 3) floor = hand.pickup.y;
      else if (p.x > o.dock.x0 && p.x < o.dock.x1 && Math.abs(p.z) < o.dock.halfW) floor = o.dock.floorY + 1;
      if (hoist.pos < floor) {
        hoist.pos = floor;
        hoist.vel = 0;
      }
    }
    apply();

    // ── 표시 갱신 ──
    const p = hookXZ();
    if (hand) {
      const target = rectOf(hand.box);
      const tx = phase === 'approach' ? hand.pickup.x : target.x;
      const tz = phase === 'approach' ? hand.pickup.z : target.z;
      const off = Math.hypot(p.x - tx, p.z - tz);
      const support = phase === 'hooked' ? supportAt(p.x, p.z) : phase === 'approach' ? (off < 3 ? hand.pickup.y : 0) : 0;
      const bottom = phase === 'hooked' ? hoist.pos - hand.height : hoist.pos;
      const gap = Math.max(0, bottom - support);
      offEl.textContent = phase === 'done' ? '–' : screenDir(tx - p.x, tz - p.z);
      guide.position.set(p.x, support + 0.2, p.z);
      guide.scale.set(1, 1, 1);
      const gp = guideGeo.attributes.position as THREE.BufferAttribute;
      gp.setXYZ(1, tx - p.x, (phase === 'hooked' ? hand.box.min.y : hand.pickup.y) - support, tz - p.z);
      gp.needsUpdate = true;
      guide.computeLineDistances();
      guide.visible = phase !== 'done' && off > 0.3;
      gapEl.textContent = phase === 'done' ? '–' : `${gap.toFixed(1)} m`;
      swayEl.textContent = `${Math.round(p.sway * 100)} cm`;
      swayEl.classList.toggle('warn', phase === 'hooked' && p.sway > FIT.sway);
      hvEl.textContent = `${hoist.vel >= 0 ? '↑' : '↓'} ${Math.abs(hoist.vel).toFixed(2)} m/s`;
      hvEl.classList.toggle('warn', phase === 'hooked' && gap < 3 && -hoist.vel > FIT.softTouch);
      const aligned = phase === 'hooked' && off <= FIT.offset;
      outlineMat.color.setHex(aligned ? 0x00e600 : 0xe0b020);
      outline.visible = phase === 'hooked';
      ring.position.set(p.x, support + 0.15, p.z);
      ring.visible = phase !== 'done';
      ringMat.color.setHex(phase === 'approach' && off < 1 ? 0x00e600 : 0xffd400);
      drop.position.set(p.x, bottom, p.z);
      drop.scale.y = Math.max(0.01, gap);
      drop.computeLineDistances();
      drop.visible = phase !== 'done' && gap > 0.5;
      stepEl.textContent =
        phase === 'approach'
          ? '1/3 훅을 블록 위로 옮겨 내린 뒤 걸기'
          : phase === 'hooked'
            ? gap > 0.05
              ? aligned
                ? '3/3 천천히 내려 앉히기'
                : '2/3 들어 올려 윤곽선 위로'
              : aligned
                ? '받침에 닿음 — 맞으면 Space 로 내려놓기'
                : '2/3 R 로 들어 올려 윤곽선 위로' // 건 직후(아직 트랜스포터 위)에는 내려놓기가 아니라 들어 올리기다
            : '안착 완료';
      actBtn.textContent = phase === 'approach' ? 'Space 걸기' : 'Space 내려놓기';
      actBtn.hidden = phase === 'done' || (quick && phase === 'hooked');
      // quick 모드: 가용접한 뒤에는 조작판을 걷어 용접 불꽃이 보이게 한다(다음 할 일은 위 카드에)
      o.hud.classList.toggle('idle', quick && phase === 'done');
      if (quick && phase === 'hooked')
        stepEl.textContent =
          gap <= 0.05
            ? aligned
              ? '앉는 중…'
              : '걸렸습니다 — R 로 들어 올려 다시 맞추기'
            : !aligned
              ? '윤곽선 위로 옮기기(맞으면 초록)'
              : gap > 2.5
                ? '내리기(F)'
                : '살살 — F 를 끊어 눌러 앉히기';
      else if (quick && phase === 'fit') stepEl.textContent = '이음 맞추기';
    }
    noteTime -= dt;
    const text = noteTime > 0 ? note : '';
    if (noteEl.textContent !== text) noteEl.textContent = text;

    // ── 카메라 ──
    if (quick && phase !== 'hooked') {
      /* 세팅으로 넘어가는 프레임, 가용접한 뒤: 이음을 보던 자리에 머문다 */
    } else if (view === 'follow') {
      setFocus();
      const d = focus.clone().sub(aimDrop).sub(controls.target);
      // quick 모드는 조금 늦게 따라가 움직임이 느껴지게 한다
      if (quick) d.multiplyScalar(1 - Math.exp(-dt * 7));
      controls.target.add(d);
      camera.position.add(d);
    } else {
      cabWorld.copy(rig.cab).add(rig.crane.position);
      camera.position.copy(cabWorld);
      camera.lookAt(p.x, hoist.pos - 4, p.z);
    }
    tickFx(dt);
  }

  /** 확인용(?operate 일 때 main.ts 가 window.__op 로 내놓음): 자동 시험이 훅을 몰 때 읽는 값 */
  function debug() {
    const p = hookXZ();
    camera.getWorldDirection(fwd).setY(0).normalize();
    const t = hand ? rectOf(hand.box) : null;
    return {
      phase,
      quick,
      fit: [fx.pos, fz.pos, fy.pos],
      clock,
      hook: { x: p.x, y: hoist.pos, z: p.z, sway: p.sway, vx: travel.vel, vz: trol.vel, vy: hoist.vel },
      pickup: hand ? { x: hand.pickup.x, y: hand.pickup.y, z: hand.pickup.z } : null,
      target: t && hand ? { x: t.x, z: t.z, top: hand.box.max.y } : null,
      fwd: { x: fwd.x, z: fwd.z },
      note: noteEl.textContent,
      result: resultEl.hidden ? '' : resultEl.textContent,
    };
  }

  return {
    debug,
    enter,
    exit,
    update,
    /** quick 모드: 다음 블록을 건 채로 시작 */
    nextBlock: () => next(),
    get active() {
      return active;
    },
    /** 운전실 시점이면 OrbitControls 를 쓰지 않는다 */
    get cabView() {
      return active && view === 'cab';
    },
  };
}

