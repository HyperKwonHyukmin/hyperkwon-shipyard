/**
 * 한 척 짓기에서 빼 둔 과제들의 계산(2026-11-22 재검토). 카드 안에서 단추로 하던 과제(용접 순서, 도장 시점)는
 * "폼은 퀴즈이지 조작이 아니다"라는 이유로 흐름에서 뺐다. 3D 장면 안에서 손으로 하는 형태로 다시 만들 때 이 계산을 쓴다.
 * 모두 교육용 예시다(실제 변형 계산·도장 기준서가 아님).
 */

/**
 * 용접 순서에 따른 판넬 변형(mm). 이음 5줄(0~4, 가운데 = 2).
 * 가운데에서 바깥으로, 좌우를 번갈아 용접하면 수축이 바깥으로 풀려 변형이 가장 작다(4 mm).
 * - 안쪽 이음이 아직인데 바깥을 먼저 용접하면 +6(안쪽이 구속된 채 수축해 뒤틀림)
 * - 같은 쪽을 연달아 용접하면 +3(한쪽으로 쏠림)
 */
export function weldDistortion(order: number[]) {
  let mm = 4;
  const done = new Set<number>();
  let prev = 0;
  for (const s of order) {
    const side = Math.sign(s - 2);
    if (side !== 0 && !done.has(s - side)) mm += 6;
    if (side !== 0 && side === prev) mm += 3;
    prev = side;
    done.add(s);
  }
  return mm;
}

/** 이슬점(℃, Magnus 식): 기온 t ℃, 상대습도 rh % */
export function dewPoint(t: number, rh: number) {
  const g = Math.log(rh / 100) + (17.62 * t) / (243.12 + t);
  return (243.12 * g) / (17.62 - g);
}
/** 도장해도 되는가: 강판 온도가 이슬점보다 3 ℃ 이상 높고 상대습도 85 % 이하(널리 쓰는 일반 도장 조건) */
export const paintOk = (air: number, rh: number, steel: number) => rh <= 85 && steel - dewPoint(air, rh) >= 3;
