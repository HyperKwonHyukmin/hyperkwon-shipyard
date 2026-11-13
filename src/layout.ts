/**
 * 야드 배치(2026-11-13 사용자: "직선 길 좌우에 공장이 늘어선 게 너무 단순하다").
 * 길 하나가 아니라 격자 도로망: 중앙로(정문 → 도크) + 북쪽 길 + 남쪽 길, 이를 잇는 세로 길 둘.
 * 도로 그리기(yard.ts), 트랜스포터 경로(traffic.ts), 지도(tour.ts), 적치장·나무 자리(scenery.ts)가 모두 여기서 나온다.
 * 장소 좌표는 stations.ts 에 있고, 여기에는 길과 장소가 차지하는 자리만 둔다.
 * 실제 조선소 배치가 아니라 둘러보기 좋게 만든 것이다(공개 자료 원칙).
 * 좌표: x 가 클수록 바다(도크) 쪽, 가로 길은 x 방향, 세로 길은 z 방향.
 */

export interface Road {
  /** 가로 길이면 true(x 방향으로 뻗음) */
  h: boolean;
  /** 가로 길의 z, 세로 길의 x */
  at: number;
  from: number;
  to: number;
  /** 반폭 */
  half: number;
}

export const ROADS: Road[] = [
  { h: true, at: 0, from: -720, to: -110, half: 20 }, // 중앙로
  { h: true, at: 170, from: -574, to: -161, half: 14 }, // 북쪽 길(가공·조립)
  { h: true, at: -170, from: -574, to: -161, half: 14 }, // 남쪽 길(적치장·창고)
  { h: false, at: -560, from: -184, to: 184, half: 14 }, // 서쪽 세로 길
  { h: false, at: -175, from: -184, to: 184, half: 14 }, // 동쪽 세로 길(도크 뒤)
];

/** 장소가 차지하는 자리(중심에서 x·z 반크기, 중심 치우침). 적치 블록과 나무가 여기를 피한다 */
export const FOOTPRINT: Record<string, { hx: number; hz: number; dz?: number }> = {
  gate: { hx: 34, hz: 24 },
  design: { hx: 44, hz: 36, dz: -10 }, // 사무동 + 앞 수조
  cutting: { hx: 50, hz: 30 },
  assembly: { hx: 54, hz: 32 },
  pe: { hx: 58, hz: 36 },
  paint: { hx: 42, hz: 28 },
};

/** 벽이 있는 건물(걷기 모드의 충돌용): 길이 l(x), 폭 w(z), 열린 면 open(+1 이면 +z 쪽이 뚫림) */
export const SHEDS: Record<string, { l: number; w: number; open: 1 | -1 }> = {
  gate: { l: 50, w: 30, open: 1 },
  cutting: { l: 80, w: 40, open: 1 },
  assembly: { l: 90, w: 44, open: -1 },
  paint: { l: 66, w: 38, open: -1 },
};

/** 도크로 가는 트랜스포터가 서는 곳(중앙로 동쪽 끝, 도크 뒤 적치장 앞) */
export const DOCK_STOP: [number, number] = [-140, 0];

type P = [number, number]; // [x, z]

/** 점이 도로 위(여유 pad 포함)인가 */
export function onRoad(x: number, z: number, pad = 0) {
  return ROADS.some((r) => {
    const along = r.h ? x : z;
    const across = r.h ? z : x;
    return along >= r.from - pad && along <= r.to + pad && Math.abs(across - r.at) <= r.half + pad;
  });
}

/** 장소 앞 길: 가장 가까운 가로 길과, 그 길 위의 문 앞 점 */
export function doorOf(at: [number, number, number]) {
  let best: Road | null = null;
  for (const r of ROADS) {
    if (!r.h || at[0] < r.from || at[0] > r.to) continue;
    if (!best || Math.abs(at[2] - r.at) < Math.abs(at[2] - best.at)) best = r;
  }
  const road = best ?? ROADS[0];
  const side = Math.sign(at[2] - road.at) || 1;
  return {
    road,
    /** 길 가운데 선 위의 점 */
    door: [at[0], road.at] as P,
    /** 길 가장자리 밖, 장소 쪽으로 6 m */
    front: [at[0], road.at + side * (road.half + 6)] as P,
  };
}

/** 도로망 위 최단 경로(가운데 선). a, b 는 길 위의 점 */
export function route(a: P, b: P): P[] {
  const nodes: P[] = [a, b];
  for (const h of ROADS)
    for (const v of ROADS) {
      if (!h.h || v.h) continue;
      if (v.at >= h.from - 1 && v.at <= h.to + 1 && h.at >= v.from - 1 && h.at <= v.to + 1) nodes.push([v.at, h.at]);
    }
  const n = nodes.length;
  const adj: [number, number][][] = nodes.map(() => []);
  for (const r of ROADS) {
    const on = nodes
      .map((p, i) => ({ i, along: r.h ? p[0] : p[1], across: r.h ? p[1] : p[0] }))
      .filter((q) => Math.abs(q.across - r.at) < 0.5 && q.along >= r.from - 1 && q.along <= r.to + 1)
      .sort((p, q) => p.along - q.along);
    for (let k = 1; k < on.length; k++) {
      const d = on[k].along - on[k - 1].along;
      adj[on[k].i].push([on[k - 1].i, d]);
      adj[on[k - 1].i].push([on[k].i, d]);
    }
  }
  // 점이 몇 개뿐이라 단순한 다익스트라
  const dist = Array(n).fill(Infinity);
  const prev = Array(n).fill(-1);
  const done = Array(n).fill(false);
  dist[0] = 0;
  for (;;) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!done[i] && (u < 0 || dist[i] < dist[u])) u = i;
    if (u < 0 || dist[u] === Infinity || u === 1) break;
    done[u] = true;
    for (const [v, d] of adj[u])
      if (dist[u] + d < dist[v]) {
        dist[v] = dist[u] + d;
        prev[v] = u;
      }
  }
  if (dist[1] === Infinity) return [a, b];
  const path: P[] = [];
  for (let u = 1; u >= 0; u = prev[u]) path.unshift(nodes[u]);
  // 한 직선 위의 가운데 점은 뺀다(꺾이는 곳만 남김)
  return path.filter((p, i) => {
    if (i === 0 || i === path.length - 1) return true;
    const [q, r] = [path[i - 1], path[i + 1]];
    return !((q[0] === p[0] && p[0] === r[0]) || (q[1] === p[1] && p[1] === r[1]));
  });
}

/** 장소 id 두 곳(또는 도크) 사이의 길: [출발 장소 앞, 길 위 점들…, 도착 장소 앞] */
export function routeBetween(from: [number, number, number], to: [number, number, number] | null): P[] {
  const a = doorOf(from);
  if (!to) return [a.front, ...route(a.door, DOCK_STOP)];
  const b = doorOf(to);
  return [a.front, ...route(a.door, b.door), b.front];
}
