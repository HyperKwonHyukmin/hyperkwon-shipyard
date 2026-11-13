/**
 * 조명 묶음(성능). 장면의 점광원·투광등이 20개를 넘으면 모든 재질의 셰이더가 그만큼 무거워진다.
 * 그래서 각 장소가 만든 조명은 '자리 표시'로만 두고(렌더링에서 뺌), 고정 개수의 실제 조명이
 * 지금 보는 곳에서 가까운 자리 표시의 위치·색·세기를 매 프레임 넘겨받는다.
 * - 개수가 늘 같아서 장소를 옮겨도 셰이더를 다시 만들지 않는다(다시 만들면 그 순간 끊김).
 * - 각 장소 코드는 그대로다: 자기 조명의 세기를 바꾸면(용접 깜빡임, 낮/밤) 그 값이 넘어온다.
 * - 투광등 묶음은 밤에만 켠다(낮에는 전부 0 이라 통째로 뺌 — 낮/밤 전환 때 한 번만 셰이더가 바뀜).
 * 그림자는 여기 조명이 아니라 해·달(방향광) 하나가 맡는다.
 */
import * as THREE from 'three';

export function createLightPool(scene: THREE.Scene, nPoints = 4, nSpots = 4) {
  const srcPoints: THREE.PointLight[] = [];
  const srcSpots: THREE.SpotLight[] = [];
  scene.traverse((o) => {
    if (o instanceof THREE.SpotLight) srcSpots.push(o);
    else if (o instanceof THREE.PointLight) srcPoints.push(o);
  });
  for (const l of [...srcPoints, ...srcSpots]) {
    l.visible = false;
    l.castShadow = false;
  }

  const points = Array.from({ length: nPoints }, () => {
    const l = new THREE.PointLight(0xffffff, 0, 50, 2);
    scene.add(l);
    return l;
  });
  const spots = Array.from({ length: nSpots }, () => {
    const l = new THREE.SpotLight(0xffffff, 0, 100, 0.6, 0.5, 2);
    scene.add(l, l.target);
    return l;
  });

  const p = new THREE.Vector3();
  const rank: { d: number; i: number }[] = [];
  /** 가까운 순으로 n 개의 원본 번호. 꺼진 것(세기 0)과 닿지 않는 것은 뺀다 */
  function nearest(src: THREE.Light[], focus: THREE.Vector3, n: number) {
    rank.length = 0;
    for (let i = 0; i < src.length; i++) {
      const l = src[i] as THREE.PointLight;
      if (l.intensity <= 0) continue;
      const d = l.getWorldPosition(p).distanceTo(focus);
      if (d > l.distance + 260) continue;
      rank.push({ d, i });
    }
    rank.sort((a, b) => a.d - b.d);
    return rank.slice(0, n);
  }

  function update(focus: THREE.Vector3) {
    if (!points[0].visible) return;
    const np = nearest(srcPoints, focus, nPoints);
    points.forEach((l, k) => {
      const s = np[k] ? srcPoints[np[k].i] : null;
      if (!s) {
        l.intensity = 0;
        return;
      }
      s.getWorldPosition(l.position);
      l.color.copy(s.color);
      l.intensity = s.intensity;
      l.distance = s.distance;
      l.decay = s.decay;
    });
    const ns = nearest(srcSpots, focus, nSpots);
    spots.forEach((l, k) => {
      const s = ns[k] ? srcSpots[ns[k].i] : null;
      if (!s) {
        l.intensity = 0;
        return;
      }
      s.getWorldPosition(l.position);
      s.target.getWorldPosition(l.target.position);
      l.color.copy(s.color);
      l.intensity = s.intensity;
      l.distance = s.distance;
      l.angle = s.angle;
      l.penumbra = s.penumbra;
      l.decay = s.decay;
    });
  }

  /** 조명 묶음은 밤에만 켠다. 낮에는 해와 하늘빛으로 충분하고, 꺼 두면 픽셀마다 도는 조명 계산이 통째로 빠진다 */
  function setNight(night: boolean) {
    for (const l of [...spots, ...points]) l.visible = night;
  }
  return { update, setNight };
}
