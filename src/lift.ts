/**
 * P4-3: 도크 옆 블록 인양 학습장. 문형 크레인이 200 t 블록을 와이어 4줄로 들고 있다.
 * - 패널에서 와이어 각도와 무게중심 치우침을 바꾸면 훅 높이와 블록 위치가 바뀌고,
 *   와이어 색(초록 → 노랑 → 빨강)과 머리 위 숫자가 장력을 보여 준다.
 * - 계산은 lift-calc.ts(교육용 단순 모델). 훅은 늘 무게중심 위에 오게 블록을 옮겨 단다.
 * 좌표: 학습장 중심 바닥이 원점, 블록 길이 방향 = x(+x 가 앞), 크레인 다리는 ±z.
 */
import * as THREE from 'three';
import { part, boxG, std, lerp } from './factory/shed';
import { LIFT, solveLift, type LiftResult } from './lift-calc';

const BLOCK = { l: 16, h: 6, w: 12 };
const LIFT_Y = 1.6; // 블록 밑면 높이(받침대 위로 살짝 들림)
const TOP = LIFT_Y + BLOCK.h;
const SPAN = 32; // 크레인 다리 간격(z)
const CRANE_H = 44;
export const ANGLE = { min: 30, max: 75, start: 60 };
export const OFFSET = { min: -2.5, max: 2.5 };

const C_OK = new THREE.Color(0x2fbf4f);
const C_MID = new THREE.Color(0xf0c419);
const C_HI = new THREE.Color(0xd8342a);
function tensionColor(ratio: number, out: THREE.Color) {
  // 1배(수직) = 초록, 1.5배 = 노랑, 2배 이상 = 빨강
  const k = THREE.MathUtils.clamp((ratio - 1) / 1, 0, 1);
  return k < 0.5 ? out.copy(C_OK).lerp(C_MID, k * 2) : out.copy(C_MID).lerp(C_HI, (k - 0.5) * 2);
}

function textSprite() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 96;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
  s.scale.set(5.4, 2, 1);
  s.renderOrder = 10;
  let last = '';
  function set(text: string, color: string) {
    if (text + color === last) return;
    last = text + color;
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, c.width, c.height);
    g.fillStyle = 'rgba(0,37,84,0.88)';
    g.beginPath();
    g.roundRect(4, 4, 248, 88, 20);
    g.fill();
    g.fillStyle = color;
    g.fillRect(16, 30, 16, 36);
    g.fillStyle = '#ffffff';
    g.font = '700 54px Pretendard, system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, 140, 52);
    t.needsUpdate = true;
  }
  return { sprite: s, set };
}

export function createLift(scene: THREE.Scene, center: [number, number, number]) {
  const root = new THREE.Group();
  root.position.set(...center);
  scene.add(root);

  // ── 문형 크레인(다리 2쌍 + 거더) ──
  const yellow = std(0xd9a21b, 0.55, 0.3);
  const dark = std(0x8a6a1a, 0.6, 0.3);
  for (const sz of [-1, 1]) {
    for (const sx of [-1, 1]) part(root, boxG(1.4, CRANE_H, 1.4), yellow, sx * 5, CRANE_H / 2, sz * (SPAN / 2));
    part(root, boxG(14, 1.6, 2.2), dark, 0, 0.8, sz * (SPAN / 2));
    part(root, boxG(10, 0.8, 0.8), yellow, 0, CRANE_H * 0.45, sz * (SPAN / 2));
  }
  for (const sx of [-1.4, 1.4]) part(root, boxG(1.6, 3, SPAN + 4), yellow, sx, CRANE_H + 1.5, 0);
  const trolley = part(root, boxG(5, 1.6, 4), dark, 0, CRANE_H + 3.8, 0);
  // 받침대(블록이 내려앉을 자리)
  for (const sx of [-5, 5]) for (const sz of [-4, 4]) part(root, boxG(1.4, 1.2, 1.4), std(0x6b4a2e, 0.8), sx, 0.6, sz);

  // ── 블록과 러그 ──
  const block = new THREE.Group();
  root.add(block);
  part(block, boxG(BLOCK.l, BLOCK.h, BLOCK.w), std(0x7d8791, 0.75, 0.25), 0, LIFT_Y + BLOCK.h / 2, 0);
  // 블록 옆면의 늑골 표시(크기 감)
  for (let x = -BLOCK.l / 2 + 2; x < BLOCK.l / 2; x += 2) part(block, boxG(0.12, BLOCK.h - 0.4, 0.1), std(0x5c6670, 0.8), x, LIFT_Y + BLOCK.h / 2, BLOCK.w / 2 + 0.05, false);
  const lugM = std(0xe0b020, 0.6, 0.3);
  const lugs: THREE.Vector3[] = [];
  for (const sx of [1, -1])
    for (const sz of [-1, 1]) {
      const p = new THREE.Vector3(sx * LIFT.a, TOP + 0.5, sz * LIFT.b);
      part(block, boxG(0.5, 1, 0.9), lugM, p.x, TOP + 0.5, p.z);
      lugs.push(p);
    }
  // 무게중심 표시(앞면에 빨간 원 + 'G'), 블록 안에서 e 만큼 옮겨 둔다
  const gMark = new THREE.Group();
  block.add(gMark);
  gMark.add(new THREE.Mesh(new THREE.CircleGeometry(0.7, 24), new THREE.MeshBasicMaterial({ color: 0xd8342a })));
  gMark.add(new THREE.Mesh(new THREE.RingGeometry(0.7, 0.95, 24), new THREE.MeshBasicMaterial({ color: 0xffffff })));
  gMark.position.set(0, LIFT_Y + BLOCK.h / 2, BLOCK.w / 2 + 0.12);

  // ── 훅, 와이어, 장력 숫자 ──
  const hook = new THREE.Group();
  root.add(hook);
  part(hook, boxG(2.2, 1.6, 1.4), yellow, 0, 0.8, 0);
  const steel = std(0x3a3f46, 0.6, 0.6);
  const hoist = part(root, new THREE.CylinderGeometry(0.12, 0.12, 1, 8), steel, 0, 0, 0, false);
  const slings = lugs.map(() => {
    const m = new THREE.MeshStandardMaterial({ color: 0x2fbf4f, roughness: 0.5, emissive: 0x000000 });
    const mesh = part(root, new THREE.CylinderGeometry(0.11, 0.11, 1, 8), m, 0, 0, 0, false);
    const label = textSprite();
    root.add(label.sprite);
    return { mesh, m, label };
  });

  // 밤에 학습장을 비추는 등 하나(점광원은 장소당 1개 이하)
  const lamp = new THREE.PointLight(0xfff0d8, 2600, 80, 2);
  lamp.position.set(0, 30, 14);
  root.add(lamp);

  // ── 상태 ──
  let angle = ANGLE.start;
  let offset = 0;
  let angleNow = angle;
  let offsetNow = offset;
  let result: LiftResult = solveLift(1, 0);
  const R = Math.hypot(LIFT.a, LIFT.b);
  const col = new THREE.Color();
  const up = new THREE.Vector3(0, 1, 0);
  const tmp = new THREE.Vector3();
  const lugW = new THREE.Vector3();

  function place() {
    const h = Math.tan((angleNow * Math.PI) / 180) * R; // 치우침이 없을 때 이 각도가 되는 훅 높이
    result = solveLift(h, offsetNow);
    // 훅은 원점 위에 두고, 무게중심(블록 안 x = e)이 그 아래 오게 블록을 −e 옮긴다
    block.position.x = -offsetNow;
    gMark.position.x = offsetNow;
    const hookY = TOP + 0.5 + h;
    hook.position.set(0, hookY, 0);
    const trolleyY = CRANE_H + 3;
    hoist.position.set(0, (hookY + 1.6 + trolleyY) / 2, 0);
    hoist.scale.y = Math.max(0.1, trolleyY - hookY - 1.6);
    const hookPt = new THREE.Vector3(0, hookY, 0);
    slings.forEach((s, i) => {
      lugW.copy(lugs[i]).add(block.position);
      tmp.subVectors(hookPt, lugW);
      s.mesh.position.copy(lugW).addScaledVector(tmp, 0.5);
      s.mesh.scale.y = tmp.length();
      s.mesh.quaternion.setFromUnitVectors(up, tmp.normalize());
      const fore = i < 2;
      const t = fore ? result.fore : result.aft;
      tensionColor(t / (LIFT.weight / 4), col);
      s.m.color.copy(col);
      s.m.emissive.copy(col).multiplyScalar(0.25);
      // 숫자는 러그 쪽 1/3 지점 위, 앞뒤 쌍마다 바깥쪽 와이어에만(겹치지 않게)
      const show = lugs[i].z > 0;
      s.label.sprite.visible = show;
      if (show) {
        s.label.sprite.position.copy(lugW).lerp(hookPt, 0.35).add(new THREE.Vector3(0, 1.6, 2.2));
        s.label.set(`${Math.round(t)} t`, `#${col.getHexString()}`);
      }
    });
    trolley.position.x = 0;
  }

  let panel: HTMLElement | null = null;
  function update(dt: number) {
    const rate = Math.min(1, dt * 4);
    if (Math.abs(angleNow - angle) < 0.01 && Math.abs(offsetNow - offset) < 0.001) return;
    angleNow = lerp(angleNow, angle, rate);
    offsetNow = lerp(offsetNow, offset, rate);
    if (Math.abs(angleNow - angle) < 0.01) angleNow = angle;
    if (Math.abs(offsetNow - offset) < 0.001) offsetNow = offset;
    place();
    drawPanel();
  }

  const f1 = (v: number) => v.toFixed(1).replace('-', '−');
  function drawPanel() {
    if (!panel) return;
    if (!panel.isConnected) {
      panel = null;
      return;
    }
    const r = result;
    const set = (sel: string, v: string) => {
      const el = panel!.querySelector(sel);
      if (el) el.textContent = v;
    };
    set('#lf-angle-out', `${Math.round(angle)}°`);
    set('#lf-off-out', offset === 0 ? '가운데' : `${offset > 0 ? '앞쪽' : '뒤쪽'} ${f1(Math.abs(offset))} m`);
    set('#lf-fore', `${Math.round(r.fore)} t`);
    set('#lf-aft', `${Math.round(r.aft)} t`);
    set('#lf-ratio', `${r.ratio.toFixed(2)}배`);
    set('#lf-squeeze', `${Math.round(r.squeeze)} t`);
  }
  /** 도크 패널 아래에 붙이는 학습 화면. onFocus = '가까이 보기' 눌렀을 때 */
  function renderPanel(el: HTMLElement, onFocus: () => void) {
    el.insertAdjacentHTML(
      'beforeend',
      `<div class="lf">
        <h3>블록 인양 학습</h3>
        <p class="lf-p">${LIFT.weight} t 블록을 와이어 4줄로 듭니다. 와이어를 눕히거나 무게중심이 한쪽으로 치우치면 한 줄이 받는 힘이 커집니다.</p>
        <button class="btn" type="button" id="lf-focus">가까이 보기</button>
        <label class="tl">와이어 각도 <output id="lf-angle-out"></output>
          <input type="range" id="lf-angle" min="${ANGLE.min}" max="${ANGLE.max}" step="1" value="${angle}"></label>
        <label class="tl">무게중심 <output id="lf-off-out"></output>
          <input type="range" id="lf-off" min="${OFFSET.min}" max="${OFFSET.max}" step="0.1" value="${offset}"></label>
        <table class="lf-t">
          <tr><th>앞쪽 와이어 한 줄</th><td id="lf-fore"></td></tr>
          <tr><th>뒤쪽 와이어 한 줄</th><td id="lf-aft"></td></tr>
          <tr><th>가장 큰 줄 ÷ 수직으로 들 때(${LIFT.weight / 4} t)</th><td id="lf-ratio"></td></tr>
          <tr><th>블록을 안쪽으로 조이는 힘(가장 큰 줄)</th><td id="lf-squeeze"></td></tr>
        </table>
        <p class="bm-legend">와이어 색: 초록 = 수직과 비슷, 노랑 = 1.5배, 빨강 = 2배 이상.<br>와이어 무게·늘어남·흔들림(동하중)은 뺀 교육용 예시입니다.</p>
      </div>`,
    );
    panel = el;
    const a = el.querySelector<HTMLInputElement>('#lf-angle')!;
    const o = el.querySelector<HTMLInputElement>('#lf-off')!;
    a.addEventListener('input', () => {
      angle = Number(a.value);
      drawPanel();
    });
    o.addEventListener('input', () => {
      offset = Math.abs(Number(o.value)) < 0.05 ? 0 : Number(o.value);
      drawPanel();
    });
    el.querySelector('#lf-focus')!.addEventListener('click', onFocus);
    drawPanel();
  }

  // ?lift=각도,치우침 — 그 값으로 시작(캡처 확인용). 예) ?lift=30,2
  {
    const [av, ov] = (new URLSearchParams(location.search).get('lift') ?? '').split(',').map(Number);
    if (Number.isFinite(av) && av >= ANGLE.min && av <= ANGLE.max) angle = angleNow = av;
    if (Number.isFinite(ov) && ov >= OFFSET.min && ov <= OFFSET.max) offset = offsetNow = ov;
  }
  place();

  return {
    update,
    renderPanel,
    /** '가까이 보기' 시점: 앞쪽(+x)·도크 반대편(+z) 비스듬히. 크레인 다리 사이로 블록과 무게중심 표시가 보임 */
    view: {
      cam: [center[0] + 42, 24, center[2] + 38] as [number, number, number],
      look: [center[0] + 6, 9, center[2] + 2] as [number, number, number],
    },
    status: () =>
      `인양 학습: 와이어 ${Math.round(angle)}° · 한 줄 최대 ${Math.round(Math.max(result.fore, result.aft))} t(수직의 ${result.ratio.toFixed(2)}배)`,
  };
}
