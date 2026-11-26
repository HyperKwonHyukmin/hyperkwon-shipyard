/**
 * 블록 세우기(90° 턴오버)의 계산. 3D 코드와 떼어 둔 순수 함수(CLAUDE.md '계산이 들어가는 체험').
 * 눕혀서 만든 블록을 훅 두 개로 세운다: 주 훅은 한쪽 끝 러그 A, 보조 훅은 반대쪽 끝 러그 B.
 * 가정(교육용 예시, 실제 인양 계획 값 아님): 두 와이어는 수직, 정적 평형, 와이어·슬링 무게와 동하중 제외.
 *
 * 블록 좌표(무게중심 원점, 길이 방향 x, 두께 방향 y): A = (−a, e), B = (+a, e).
 *   a = 러그 사이 거리의 절반, e = 러그가 무게중심보다 위에 있는 높이.
 * 블록을 θ 만큼 세우면(A 쪽이 올라감) 러그의 수평 위치는
 *   xA = −a·cosθ + e·sinθ,  xB = a·cosθ + e·sinθ
 * 수직 힘의 합 = W, 무게중심 둘레 모멘트 = 0 에서
 *   주 훅 TA = W·xB / (xB − xA) = W/2 · (1 + (e/a)·tanθ),  보조 훅 TB = W − TA
 * tanθ = a/e 가 되면 무게중심이 러그 A 바로 아래에 와서 TA = W, TB = 0 — 보조 훅이 느슨해지고 블록은 주 훅에만 매달린다.
 */
export interface TurnResult {
  /** 주 훅·보조 훅 하중(t) */
  main: number;
  aux: number;
  /** 러그의 수평·수직 위치(무게중심 기준, m) */
  ax: number;
  ay: number;
  bx: number;
  by: number;
}

/** 보조 훅이 느슨해지는 각도(rad) */
export const slackAngle = (a: number, e: number) => Math.atan(a / e);

export function solveTurn(theta: number, W: number, a: number, e: number): TurnResult {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const ax = -a * c + e * s;
  const bx = a * c + e * s;
  // 느슨해지는 각도를 넘으면 주 훅이 전부 든다(그 뒤는 블록이 그 각도로 매달려 있다)
  const main = ax >= 0 ? W : Math.min(W, (W * bx) / (bx - ax));
  return { main, aux: W - main, ax, ay: a * s + e * c, bx, by: -a * s + e * c };
}
