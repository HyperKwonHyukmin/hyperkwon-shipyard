/**
 * 걷기 모드의 작은 지도(2026-11-22 사용자: "걸어서 견학할 때 내가 어디 있는지 알 수가 없다").
 * 걷는 동안 늘 떠 있다: 야드 전체(길, 도크, 안벽, 장소 번호) 위에 내 자리와 보는 방향을 화살표로 그린다.
 * 누르면 큰 지도(tour.ts)가 열리고, 거기서 장소를 고르면 그 앞으로 옮겨진다.
 * 배치 그림은 큰 지도와 같은 자료(layout.ts 의 ROADS, 장소 좌표)에서 나온다.
 */
import type { Station } from './content/stations';
import { ROADS } from './layout';

/** 큰 지도(tour.ts)와 같은 범위 */
const VB = { x0: -760, x1: 780, z0: -300, z1: 300 };

export function createMiniMap(o: { el: HTMLElement; stations: Station[]; onOpen: () => void; marks?: [number, number][] }) {
  const rect = (x0: number, z0: number, x1: number, z1: number, cls: string) => `<rect x="${x0}" y="${z0}" width="${x1 - x0}" height="${z1 - z0}" class="${cls}"/>`;
  let html = rect(VB.x0, VB.z0, 118, VB.z1, 'm-land') + rect(118, VB.z0, VB.x1, VB.z1, 'm-sea');
  for (const r of ROADS) html += r.h ? rect(r.from, r.at - r.half, r.to, r.at + r.half, 'm-road') : rect(r.at - r.half, r.from, r.at + r.half, r.to, 'm-road');
  html += rect(-110, -24, 110, 24, 'm-dock') + rect(130, 139, 430, 165, 'm-pier') + rect(130, -165, 430, -139, 'm-pier');
  o.stations.forEach((s, i) => {
    html += `<g class="mm-st" data-i="${i}"><circle cx="${s.at[0]}" cy="${s.at[2]}" r="34"/><text x="${s.at[0]}" y="${s.at[2] + 2}">${i}</text></g>`;
  });
  // 직접 해 볼 수 있는 곳: 노란 마름모(누르면 열리는 큰 지도에 이름이 있다)
  for (const [x, z] of o.marks ?? []) html += `<path class="mm-ex" d="M${x} ${z - 26}L${x + 26} ${z}L${x} ${z + 26}L${x - 26} ${z}z"/>`;
  // 나: 보는 방향을 가리키는 화살표(앞 = +x)와 둘레 원
  html += '<g id="mm-me"><circle r="46" class="mm-ring"/><path d="M40 0L-24 -26L-10 0L-24 26z" class="mm-arrow"/></g>';
  o.el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VB.x0} ${VB.z0} ${VB.x1 - VB.x0} ${VB.z1 - VB.z0}" aria-hidden="true">${html}</svg><span class="mm-where" id="mm-where"></span>`;
  const me = o.el.querySelector<SVGGElement>('#mm-me')!;
  const where = o.el.querySelector<HTMLElement>('#mm-where')!;
  const marks = [...o.el.querySelectorAll<SVGGElement>('.mm-st')];
  o.el.addEventListener('click', () => o.onOpen());
  let last = '';
  let lastNear = -1;

  /** 내 자리(x, z), 보는 방향(라디안, +x 가 0 이고 왼쪽으로 돌면 커짐) */
  function update(x: number, z: number, heading: number) {
    const cx = Math.min(VB.x1 - 30, Math.max(VB.x0 + 30, x));
    const cz = Math.min(VB.z1 - 30, Math.max(VB.z0 + 30, z));
    const key = `${cx.toFixed(0)},${cz.toFixed(0)},${heading.toFixed(2)}`;
    if (key === last) return;
    last = key;
    // 화면은 z 가 아래로 커지므로 도는 방향이 반대다
    me.setAttribute('transform', `translate(${cx.toFixed(1)} ${cz.toFixed(1)}) rotate(${((-heading * 180) / Math.PI).toFixed(1)})`);
    // 가장 가까운 장소와 거리
    let near = 0;
    let best = Infinity;
    o.stations.forEach((s, i) => {
      const d = Math.hypot(s.at[0] - x, s.at[2] - z);
      if (d < best) {
        best = d;
        near = i;
      }
    });
    if (near !== lastNear) {
      marks.forEach((m, i) => m.classList.toggle('near', i === near));
      lastNear = near;
    }
    const text = `${near}. ${o.stations[near].short ?? o.stations[near].name} 가까이 · ${Math.round(best / 10) * 10} m`;
    if (where.textContent !== text) where.textContent = text;
  }
  return { update };
}
