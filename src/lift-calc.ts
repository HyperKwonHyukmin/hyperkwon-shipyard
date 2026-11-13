/**
 * P4-3 블록 인양 학습: 와이어 4줄로 블록 하나를 드는 정역학(교육용 단순 모델).
 * - 러그 4개가 블록 윗면 (±a, ±b)에 있고, 훅은 무게중심 바로 위 높이 h 에 있다(블록이 수평으로 매달림).
 * - 무게중심이 길이 방향으로 e 만큼 치우치면 가까운 쪽 와이어가 더 많이 받는다.
 * - 훅에서 힘의 평형(z 대칭이라 미지수 2개): 앞쪽 쌍 장력 Tf, 뒤쪽 쌍 장력 Ta
 *     Tf/Lf·(a − e) = Ta/La·(a + e),  2h·(Tf/Lf + Ta/La) = W
 *   → Tf = W(a + e)·Lf / (4ha),  Ta = W(a − e)·La / (4ha)
 * - 와이어가 눕을수록(각도가 작을수록) 장력과 블록을 안쪽으로 조이는 수평력이 커진다.
 * 와이어 무게, 늘어남, 동하중 계수는 넣지 않는다. 값은 설명을 위한 예시다.
 */

export const LIFT = {
  weight: 200, // t
  a: 6, // 러그 길이 방향 반간격 m
  b: 4, // 러그 폭 방향 반간격 m
};

export interface LiftResult {
  /** 앞(+x)·뒤(−x) 와이어 한 줄의 장력 t */
  fore: number;
  aft: number;
  /** 와이어가 수평면과 이루는 각 ° */
  angleFore: number;
  angleAft: number;
  /** 수직으로 4줄이 똑같이 나눌 때(W/4) 대비 가장 큰 장력의 배수 */
  ratio: number;
  /** 가장 큰 와이어가 블록을 안쪽으로 당기는 수평력 t */
  squeeze: number;
}

/** h = 훅이 러그 면보다 높은 거리 m, e = 무게중심 치우침 m(+ 면 앞쪽) */
export function solveLift(h: number, e: number): LiftResult {
  const { weight: W, a, b } = LIFT;
  const lf = Math.hypot(a - e, b, h);
  const la = Math.hypot(a + e, b, h);
  const fore = (W * (a + e) * lf) / (4 * h * a);
  const aft = (W * (a - e) * la) / (4 * h * a);
  const deg = (v: number) => (v * 180) / Math.PI;
  const angleFore = deg(Math.asin(h / lf));
  const angleAft = deg(Math.asin(h / la));
  const big = Math.max(fore, aft);
  const bigL = fore >= aft ? lf : la;
  return { fore, aft, angleFore, angleAft, ratio: big / (W / 4), squeeze: (big * Math.sqrt(bigL ** 2 - h ** 2)) / bigL };
}
