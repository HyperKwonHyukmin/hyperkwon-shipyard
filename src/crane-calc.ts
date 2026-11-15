/**
 * 골리앗 크레인 운전 체험의 계산(2026-11-14). 3D 코드와 떼어 둔 순수 함수다(CLAUDE.md: 계산이 들어가는 체험).
 * - 주행(x, 레일 방향)·횡행(z, 트롤리)·권상(훅 높이)은 목표 속도로 서서히 붙는다(관성)
 * - 매달린 블록은 진자: 트롤리·크레인이 가속하면 반대로 흔들리고, 공기 저항으로 천천히 잦아든다
 *   θ'' = −(g/L)·θ − a/L − c·θ'  (작은 각도, x·z 따로). 흔들림 거리 = L·θ
 * 교육용 예시다. 속도는 화면에서 지루하지 않게 실제(주행 약 0.5~1 m/s)보다 빠르게 잡았다.
 */

export const LIMIT = {
  travel: 7, // 주행 최고 속도 m/s
  trolley: 4, // 횡행 m/s
  hoist: 3.5, // 권상 m/s
  accel: 1.6, // 주행·횡행 가속 m/s²
  brake: 5, // 키를 놓거나 반대로 누를 때 감속 m/s²(7 m/s 에서 약 5 m 에 멈춤. 가속과 같으면 15 m 를 미끄러져 목표를 지나침 — 2026-11-14 자동 시험)
  hoistAccel: 2.5,
};
/**
 * 안착 기준(교육용): 수평 오차와 흔들림이 이보다 작아야 내려놓을 수 있다.
 * 2026-11-14 사용자 "어렵고 불편하다" → 30 cm·25 cm 에서 넓힘. 마지막 맞춤은 MAGNET 이 돕는다
 */
export const FIT = { offset: 0.8, sway: 0.6, softTouch: 0.5 };
/** 블록을 들고 목표 근처(반경 m)에 오면, 이동 키를 놓았을 때 목표 쪽으로 끌려간다(실제의 가이드·체인블록 맞춤을 대신) */
export const MAGNET = { radius: 3, speed: 1.5 };
const G = 9.81;
/**
 * 흔들림 방지 장치(anti-sway)를 켠 크레인처럼: 가속이 진자를 미는 힘을 줄이고(FORCE), 감쇠를 임계 감쇠 가까이(DAMP).
 * 줄 30 m(고유 각진동수 약 0.57 rad/s)면 임계 감쇠가 약 1.1 → 멈춘 뒤 3~4초에 잦아든다(2026-11-14 재조정, 이전 0.35 는 약 20초)
 */
const DAMP = 1.1;
const FORCE = 0.35;

export interface Axis {
  pos: number;
  vel: number;
}
export interface Sway {
  /** 각도(rad)와 각속도 */
  ax: number;
  wx: number;
  az: number;
  wz: number;
}

/** 목표 속도(입력 −1·0·1 × 최고 속도)로 가속 한도 안에서 다가간다(줄일 때는 brake). 돌려주는 값 = 이번 가속도 */
export function drive(a: Axis, input: number, vmax: number, accel: number, dt: number, min: number, max: number, brake = accel) {
  if (!(dt > 0)) return 0; // 시간이 흐르지 않은 프레임(0 으로 나누기 방지)
  const target = input * vmax;
  const slowing = Math.abs(target) < Math.abs(a.vel) || target * a.vel < 0;
  const lim = (slowing ? brake : accel) * dt;
  const dv = Math.max(-lim, Math.min(lim, target - a.vel));
  a.vel += dv;
  a.pos += a.vel * dt;
  if (a.pos < min || a.pos > max) {
    a.pos = Math.max(min, Math.min(max, a.pos));
    const acc = -a.vel / dt;
    a.vel = 0;
    return acc;
  }
  return dv / dt;
}

/** 진자 한 걸음. ax_, az_ = 매단 점(트롤리)의 가속도, L = 줄 길이. 잘게 나눠 적분해 ×16 에서도 같게 */
export function swing(s: Sway, accX: number, accZ: number, L: number, dt: number) {
  const n = Math.max(1, Math.ceil(dt / 0.01));
  const h = dt / n;
  const k = G / Math.max(4, L);
  // 흔들림 방지 장치: 제동이 세도 진자를 미는 가속은 주행 가속 크기까지만
  accX = Math.max(-LIMIT.accel, Math.min(LIMIT.accel, accX));
  accZ = Math.max(-LIMIT.accel, Math.min(LIMIT.accel, accZ));
  for (let i = 0; i < n; i++) {
    s.wx += (-k * s.ax - (FORCE * accX) / L - DAMP * s.wx) * h;
    s.wz += (-k * s.az - (FORCE * accZ) / L - DAMP * s.wz) * h;
    s.ax += s.wx * h;
    s.az += s.wz * h;
  }
}

/** 흔들림 거리(m): 블록이 매단 점 바로 아래에서 얼마나 벗어났나 */
export const swayOffset = (s: Sway, L: number) => ({ x: L * s.ax, z: L * s.az, r: L * Math.hypot(s.ax, s.az) });

/** 수평 사각형(중심, 반크기)이 겹치는가 */
export interface Rect {
  x: number;
  z: number;
  hx: number;
  hz: number;
}
export const overlap = (a: Rect, b: Rect, shrink = 0.25) =>
  Math.abs(a.x - b.x) < a.hx + b.hx - shrink && Math.abs(a.z - b.z) < a.hz + b.hz - shrink;

/**
 * 블록 바닥이 내려갈 수 있는 가장 낮은 높이.
 * floor = 블록 아래 땅(도크 안이면 도크 바닥), solids = 이미 앉은 블록들(사각형 + 윗면 높이),
 * target = 제자리(맞으면 제자리 바닥까지 내려갈 수 있음)
 */
export function lowest(me: Rect, floor: number, solids: { r: Rect; top: number }[], target: { r: Rect; bottom: number }) {
  let y = floor;
  for (const s of solids) if (overlap(me, s.r)) y = Math.max(y, s.top);
  // 제자리와 거의 맞으면 제자리 바닥이 받침. 어긋났으면 반목·이웃 블록에 걸린다
  const off = Math.hypot(me.x - target.r.x, me.z - target.r.z);
  if (off <= FIT.offset) y = Math.max(y, target.bottom);
  else if (overlap(me, target.r, 0.4)) y = Math.max(y, target.bottom + 0.6);
  return y;
}

/** 안착 판정에 쓸 값 */
export function fitCheck(off: number, sway: number, touching: boolean) {
  if (!touching) return { ok: false, why: '' };
  if (off > FIT.offset) return { ok: false, why: `자리에서 ${(off * 100).toFixed(0)} cm 어긋남 — 조금 들어 올려 맞추세요` };
  if (sway > FIT.sway) return { ok: false, why: `흔들림 ${(sway * 100).toFixed(0)} cm — 잦아들 때까지 기다리세요` };
  return { ok: true, why: '' };
}
