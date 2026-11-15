/**
 * 골리앗 크레인 운전 체험(2026-11-14, 검토 추천 ①). 자동 탑재를 멈추고 지금 차례의 블록을 사용자가 직접 올린다.
 * 1) 훅을 적치장 트랜스포터 위 블록으로 옮겨 걸기 → 2) 들어 올려 도크의 녹색 표시 위로 → 3) 흔들림을 잡으며 천천히 내려 앉히기.
 * 결과는 점수가 아니라 현장에서 보는 숫자(수평 오차, 닿을 때 하강 속도, 걸린 시간)로만 보여 준다(놀이 요소 없음 원칙).
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
  let phase: 'approach' | 'hooked' | 'done' = 'approach';
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
    } else if (k === 'c') toggleView();
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
        say('아직 공중입니다. 받침에 닿을 때까지 내리세요(F).');
        return;
      }
      const fit = fitCheck(off, h.sway, true);
      if (!fit.ok) {
        say(fit.why, 3);
        return;
      }
      o.erection.landed();
      phase = 'done';
      showResult(off);
    }
  }

  function showResult(off: number) {
    const hard = touchSpeed > FIT.softTouch;
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
    if (!hand) {
      say('26개를 모두 올렸습니다. 도크 패널의 건조 시점 막대로 되돌린 뒤 다시 해 볼 수 있습니다.', 8);
      marks.visible = false;
      return;
    }
    const b = hand.box;
    outline.position.copy(b.getCenter(new THREE.Vector3()));
    outline.scale.copy(b.getSize(new THREE.Vector3()));
    marks.visible = true;
    say(`${hand.name}: 적치장의 트랜스포터 위 블록으로 훅을 옮기세요`, 4);
  }

  // ── 카메라 ──
  const focus = new THREE.Vector3();
  /**
   * 카메라는 주행 방향 뒤(−x) 위에서 비스듬히(약 58°) 본다. 거더 바로 위에서 내려다보면 거더·다리가 블록과 목표를 가린다(2026-11-14 캡처).
   * 화면 위 = +x(도크 쪽 주행), 오른쪽 = +z(횡행). 보는 점을 훅보다 화면 아래(−x)로 당겨 훅이 위쪽에 오게 → 아래 운전 안내판에 안 가림
   */
  const FOCUS_DX = -16;
  const CAM_OFF = new THREE.Vector3(-45, 72, 0);
  function placeFollowCamera() {
    const h = hookXZ();
    focus.set(h.x + FOCUS_DX, Math.max(0, hoist.pos - 6), h.z);
    controls.target.copy(focus);
    camera.position.copy(focus).add(CAM_OFF);
  }

  function enter() {
    if (active) return;
    active = true;
    saved.min = controls.minDistance;
    saved.max = controls.maxDistance;
    saved.pan = controls.enablePan;
    saved.zoom = controls.zoomToCursor;
    saved.polar = controls.maxPolarAngle;
    controls.enablePan = false;
    controls.zoomToCursor = false;
    controls.autoRotate = false;
    controls.minDistance = 12;
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
    // 감속 구간: 매단 블록이 받침 가까이 오면 내리는 속도를 저절로 줄인다(실제 권상 장치의 저속 구간을 대신)
    if (lift < 0 && hand && phase === 'hooked') {
      const hp = hookXZ();
      const gap = hoist.pos - hand.height - supportAt(hp.x, hp.z);
      const cap = Math.max(FIT.softTouch * 0.6, Math.min(LIMIT.hoist, gap * 0.7));
      lift = -cap / LIMIT.hoist;
    }

    const prev = { x: travel.pos, z: trol.pos, y: hoist.pos };
    const ax = drive(travel, wx, LIMIT.travel, LIMIT.accel, dt, o.travel[0], o.travel[1], LIMIT.brake);
    const az = drive(trol, wz, LIMIT.trolley, LIMIT.accel, dt, -o.trolleyZ, o.trolleyZ, LIMIT.brake);
    drive(hoist, lift, LIMIT.hoist, LIMIT.hoistAccel, dt, -Infinity, rig.hookTop);
    const L = Math.max(4, rig.trolleyY - hoist.pos);
    swing(sway, ax, az, L, dt);

    // 자석 맞춤: 이동 키를 놓은 채 목표 반경 안이면 크레인이 목표 쪽으로 천천히 다가간다
    if (hand && !wx && !wz && phase !== 'done') {
      const t = phase === 'approach' ? { x: hand.pickup.x, z: hand.pickup.z } : rectOf(hand.box);
      const hp = hookXZ();
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
        // 받침에 앉아 있으면 흔들림이 빨리 잦아든다
        const k = Math.exp(-dt * 3);
        sway.ax *= k;
        sway.az *= k;
        sway.wx *= k;
        sway.wz *= k;
      } else if (bottom > support + 0.3) touchSpeed = -1;
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
                : '2/3 들어 올려 녹색 윤곽 위로'
              : '받침에 닿음 — 맞으면 Space 로 내려놓기'
            : '안착 완료';
      actBtn.textContent = phase === 'approach' ? 'Space 걸기' : 'Space 내려놓기';
      actBtn.hidden = phase === 'done';
    }
    noteTime -= dt;
    const text = noteTime > 0 ? note : '';
    if (noteEl.textContent !== text) noteEl.textContent = text;

    // ── 카메라 ──
    if (view === 'follow') {
      focus.set(p.x + FOCUS_DX, Math.max(0, hoist.pos - 6), p.z);
      const d = focus.clone().sub(controls.target);
      controls.target.add(d);
      camera.position.add(d);
    } else {
      cabWorld.copy(rig.cab).add(rig.crane.position);
      camera.position.copy(cabWorld);
      camera.lookAt(p.x, hoist.pos - 4, p.z);
    }
  }

  /** 확인용(?operate 일 때 main.ts 가 window.__op 로 내놓음): 자동 시험이 훅을 몰 때 읽는 값 */
  function debug() {
    const p = hookXZ();
    camera.getWorldDirection(fwd).setY(0).normalize();
    const t = hand ? rectOf(hand.box) : null;
    return {
      phase,
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
    get active() {
      return active;
    },
    /** 운전실 시점이면 OrbitControls 를 쓰지 않는다 */
    get cabView() {
      return active && view === 'cab';
    },
  };
}

