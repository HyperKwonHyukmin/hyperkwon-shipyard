/**
 * 진수 직접 해보기(2026-11-15 사용자: "각 과정에서 재미를 더 느낄 수 있게")의 계산. 3D 코드와 떼어 둔 순수 함수.
 * 교육용 예시 값이다(실제 설계·공정 값 아님). 화면에도 그렇게 적는다.
 */

/** 진수 때 배 무게(경하중량, 예시) */
export const LIGHT_SHIP_T = 12000;
/** 이 이하 속력으로 도크를 빠져나가라는 안내(노트) */
export const SAFE_KN = 3;
/** 화면 진행 배속(실제로는 수 시간 걸리는 일을 줄였다) */
export const TIME_X = 4;
export const KN = 1.9438; // m/s → 노트
/** 올림픽 수영장 한 개(50 × 25 × 2 m) */
export const POOL_M3 = 2500;

/** 물이 floor 에서 level 까지 찼을 때 배 무게 가운데 부력이 받는 몫(0~1). 상자형으로 보고 잠긴 깊이에 비례 */
export function buoyShare(level: number, floor: number, draft: number) {
  return Math.min(1, Math.max(0, (level - floor) / draft));
}

/** 반목(도크 바닥 받침)이 받는 무게(톤) */
export function blockLoad(share: number, weight = LIGHT_SHIP_T) {
  return weight * (1 - share);
}

/**
 * 예인선이 끄는 배의 속력 한 걸음. pull: 1 끌기, -1 잡기(뒤 예인선), 0 놓기.
 * 배가 무거워 천천히 붙고, 놓아도 한참 미끄러진다(물 저항은 속력의 제곱).
 * 끌기만 계속하면 약 2.2 m/s(4.3 노트)에서 멈춘다 — 3 노트를 넘기지 않으려면 중간에 놓아야 한다.
 */
export function towStep(v: number, pull: number, dt: number) {
  const A = 0.05; // m/s² 예인선 힘 / 배 질량
  const C = 0.0103; // 물 저항 계수(1/m): A / C ≈ 2.2² 에서 끄는 힘과 저항이 같아짐
  const drag = C * v * Math.abs(v);
  let nv = v + (A * pull - drag) * dt;
  // 잡기로 멈추면 뒤로 가지 않게
  if (pull <= 0 && v >= 0 && nv < 0) nv = 0;
  return nv;
}
