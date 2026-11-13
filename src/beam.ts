/**
 * P4-2 설계동: 선체 거더 종굽힘 계산(교육용 단순 모델).
 * - 배를 상자형(길이 L, 폭 B, 깊이 D) 보로 보고, 무게 분포와 부력 분포의 차이로 전단력·굽힘 모멘트를 적분한다.
 * - 파도는 교과서의 정적 파도: 파장 = L, 파고 = L/20, 파정이 배 가운데(호깅) 또는 양 끝(새깅).
 * - 평형: 전체 부력 = 전체 무게, 부력 모멘트 = 무게 모멘트가 되게 평균 흘수와 트림을 정한다(상자형이라 식이 선형).
 * - 응력: σ = M·y / I (중립축은 깊이 가운데). 값은 설명을 위한 예시이고 실제 설계 값이 아니다.
 * 부호: 호깅(갑판 인장)을 +로 돌려준다. x = 0 이 선미.
 */

export const SHIP = {
  L: 190, // m
  B: 32,
  D: 18,
  I: 220, // m^4, 중앙 단면 2차 모멘트(예시 값)
  E: 206e6, // kN/m^2
};
const RHO_G = 1.025 * 9.81; // kN/m^3
const N = 101;

export type Wave = 'still' | 'hog' | 'sag';
export type Cargo = 'even' | 'middle' | 'ends';

/** 화물 5만 t을 놓는 구간(선미 기준 L 비율). 화물창은 0.12L ~ 0.9L */
const CARGO_ZONES: Record<Cargo, [number, number][]> = {
  even: [[0.12, 0.9]],
  middle: [[0.28, 0.74]],
  ends: [
    [0.12, 0.3],
    [0.72, 0.9],
  ],
};
const ENGINE_ZONE: [number, number] = [0.03, 0.12];
const LIGHTSHIP_T = 15000;
const ENGINE_T = 3000; // 기관실·거주구(선미 쪽)
const CARGO_T = 50000;

export interface BeamResult {
  x: number[];
  /** 굽힘 모멘트 kN·m(호깅 +) */
  M: number[];
  /** 처짐 m(위로 +, 실제 크기) */
  w: number[];
  /** 파면 높이 m(정수면 기준) */
  eta: number[];
  /** 평균 흘수 m, 트림 기울기(선수 쪽이 깊으면 +) */
  draft: number;
  trim: number;
  /** 가장 큰 |M| 과 그 위치, 갑판·선저 응력 MPa(인장 +) */
  maxM: number;
  maxAt: number;
  deck: number;
  bottom: number;
}

/**
 * wave: -1(새깅) ~ 0(잔잔) ~ +1(호깅) 사이 값도 받는다(전환할 때 부드럽게).
 * cargo: 세 적재 방식의 비율(합 1). 전환 중에는 섞인다.
 */
export function solveBeam(wave: number, cargo: Record<Cargo, number>): BeamResult {
  const { L, B, D, I, E } = SHIP;
  const dx = L / (N - 1);
  const x = Array.from({ length: N }, (_, i) => i * dx);
  const a = (L / 20 / 2) * wave; // 파 진폭(+ 면 가운데가 파정)
  const eta = x.map((xi) => a * Math.cos((2 * Math.PI * (xi - L / 2)) / L));

  const integ = (f: number[]) => f.reduce((s, v, i) => s + (i === 0 || i === N - 1 ? v / 2 : v) * dx, 0);
  // 무게 분포 kN/m. 구간 하나씩 만들어 이산 적분이 목표 무게와 같게 맞춘다(경계 점 때문에 생기는 오차 제거)
  const zone = (zones: [number, number][], tonnes: number) => {
    const f = x.map((xi) => (zones.some(([s0, e0]) => xi >= s0 * L && xi <= e0 * L) ? 1 : 0));
    const k = (tonnes * 9.81) / integ(f);
    return f.map((v) => v * k);
  };
  const parts = [zone([[0, 1]], LIGHTSHIP_T), zone([ENGINE_ZONE], ENGINE_T)];
  for (const k of Object.keys(CARGO_ZONES) as Cargo[]) if (cargo[k] > 0) parts.push(zone(CARGO_ZONES[k], cargo[k] * CARGO_T));
  const w = x.map((_, i) => parts.reduce((s, p) => s + p[i], 0));
  const W = integ(w);
  const Mw = integ(w.map((v, i) => v * (x[i] - L / 2)));
  // 수선면 폭 비율: 평행 중앙부(0.25L~0.75L)는 1, 선수·선미로 갈수록 가늘어짐(양 끝 0.3).
  // 상자형 그대로면 양 끝 부력이 너무 커서 잔잔한 물에서도 새깅이 과하게 나온다
  const f = x.map((xi) => {
    const r = xi / L;
    const t = r < 0.25 ? r / 0.25 : r > 0.75 ? (1 - r) / 0.25 : 1;
    return 0.3 + 0.7 * Math.sin((Math.PI / 2) * t);
  });
  // 평형: ∫f(T + sξ + η) = W/ρgB, ∫fξ(T + sξ + η) = Mw/ρgB 를 T, s 에 대해 푼다(ξ = x - L/2)
  const xi = x.map((v) => v - L / 2);
  const k0 = integ(f);
  const k1 = integ(f.map((v, i) => v * xi[i]));
  const k2 = integ(f.map((v, i) => v * xi[i] ** 2));
  const e0 = integ(f.map((v, i) => v * eta[i]));
  const e1 = integ(f.map((v, i) => v * xi[i] * eta[i]));
  const r0 = W / (RHO_G * B) - e0;
  const r1 = Mw / (RHO_G * B) - e1;
  const det = k0 * k2 - k1 * k1;
  const draft = (r0 * k2 - r1 * k1) / det;
  const trim = (k0 * r1 - k1 * r0) / det;
  const b = x.map((_, i) => RHO_G * B * f[i] * Math.min(D, Math.max(0, draft + trim * xi[i] + eta[i])));

  // q = 부력 - 무게, V = ∫q, M = ∫V (사다리꼴 누적)
  const q = b.map((v, i) => v - w[i]);
  const cum = (f: number[]) => {
    const out = [0];
    for (let i = 1; i < N; i++) out.push(out[i - 1] + ((f[i - 1] + f[i]) / 2) * dx);
    return out;
  };
  const V = cum(q);
  let M = cum(V);
  // 이산화와 흘수 상한으로 남는 끝값을 선형으로 덜어 양 끝 M = 0
  const endM = M[N - 1];
  M = M.map((m, i) => -(m - (endM * i) / (N - 1))); // 부호 뒤집어 호깅 +

  // 처짐: w'' = M/EI (호깅이면 가운데가 올라감), 양 끝 0
  const kappa = M.map((m) => m / (E * I));
  const slope = cum(kappa);
  let defl = cum(slope);
  const endW = defl[N - 1];
  defl = defl.map((v, i) => -(v - (endW * i) / (N - 1)));

  let maxAt = 0;
  for (let i = 1; i < N; i++) if (Math.abs(M[i]) > Math.abs(M[maxAt])) maxAt = i;
  const mMid = M[maxAt];
  const toMPa = (m: number, y: number) => (m * y) / I / 1000;
  return {
    x,
    M,
    w: defl,
    eta,
    draft,
    trim,
    maxM: mMid,
    maxAt: x[maxAt],
    deck: toMPa(mMid, D / 2),
    bottom: toMPa(mMid, -D / 2),
  };
}

/** 위치 x(m)에서 값 보간 */
export function sample(xs: number[], ys: number[], x: number) {
  const dx = xs[1] - xs[0];
  const f = Math.max(0, Math.min(xs.length - 1.0001, x / dx));
  const i = Math.floor(f);
  return ys[i] + (ys[i + 1] - ys[i]) * (f - i);
}
