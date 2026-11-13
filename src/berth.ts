/**
 * 안벽에 배를 대는 공용 부품(의장 안벽 quay.ts, 명명식과 인도 delivery.ts).
 * - 계류 위치: 부두(yard.ts, 폭 26 m)의 바다 쪽 가장자리에서 배 반폭 + 1.5 m
 * - 계류줄 4가닥(배 갑판 가장자리 → 부두 계선주), 예인선 두 척(옆구리를 미는 자리 / 앞에서 끄는 자리)
 * d = 부두에서 배 쪽 방향(z 부호). 의장 안벽은 -1(배가 부두의 -z 쪽), 인도 안벽은 +1.
 */
import * as THREE from 'three';
import { SHIP } from './ship';
import { tug } from './launch';
import { std, part } from './factory/shed';

interface Options {
  /** 부두 중심 */
  ax: number;
  az: number;
  d: 1 | -1;
  seaY: number;
  draft: number;
}

export function createBerth(root: THREE.Object3D, ship: THREE.Object3D, o: Options) {
  const keelY = o.seaY - o.draft;
  const deckY = keelY + SHIP.depth;
  const edgeZ = o.az + o.d * 13; // 부두의 바다 쪽 가장자리(계선주 줄)
  const moorZ = edgeZ + o.d * (SHIP.beam / 2 + 1.5); // 계류했을 때 배 중심선
  const offZ = moorZ + o.d * 70; // 들어오기 전, 떠난 뒤

  // 계류줄(배 길이 방향 ±45, ±80 m 자리 → 바깥쪽 12 m 계선주)
  const ropeMat = std(0xd9d6cc, 0.8);
  const ropes = [-80, -45, 45, 80].map((lx) => ({
    lx,
    mesh: part(root, new THREE.CylinderGeometry(0.1, 0.1, 1, 6), ropeMat, 0, 0, 0, false),
    bollard: new THREE.Vector3(o.ax + lx + Math.sign(lx) * 12, 1.1, edgeZ),
  }));
  const UP = new THREE.Vector3(0, 1, 0);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const dir = new THREE.Vector3();
  /** k = 0 이면 줄 없음, 1 이면 계선주까지 다 걸림 */
  function setRopes(k: number) {
    for (const r of ropes) {
      r.mesh.visible = k > 0;
      if (k <= 0) continue;
      a.set(ship.position.x + r.lx, deckY + 0.5, ship.position.z - o.d * (SHIP.beam / 2 - 1.5));
      b.copy(a).lerp(r.bollard, k);
      dir.subVectors(b, a);
      r.mesh.position.copy(a).addScaledVector(dir, 0.5);
      r.mesh.scale.y = Math.max(0.01, dir.length());
      r.mesh.quaternion.setFromUnitVectors(UP, dir.normalize());
    }
  }

  // 예인선 두 척
  const tugs = [tug(), tug()];
  for (const t of tugs) root.add(t);
  /** side: 바다 쪽에서 배 옆구리를 부두 쪽으로 미는 자리 / ahead: 뱃머리 앞에서 끄는 자리 / hide */
  function placeTugs(mode: 'side' | 'ahead' | 'hide') {
    const psi = ship.rotation.y;
    tugs.forEach((t, i) => {
      t.visible = mode !== 'hide';
      if (mode === 'side') {
        t.position.set(ship.position.x + (i ? 45 : -45), o.seaY - 1.6, ship.position.z + o.d * (SHIP.beam / 2 + 9));
        t.rotation.y = (o.d * Math.PI) / 2; // 예인선 뱃머리가 배(부두) 쪽
      } else {
        // 배가 향한 방향(ψ)으로 이물 앞 40 m, 좌우 9 m
        const fx = Math.cos(psi);
        const fz = -Math.sin(psi);
        const ahead = SHIP.foreEnd + 40;
        const side = i ? 9 : -9;
        t.position.set(ship.position.x + fx * ahead - fz * side, o.seaY - 1.6, ship.position.z + fz * ahead + fx * side);
        t.rotation.y = psi;
      }
    });
  }
  placeTugs('hide');

  return { keelY, deckY, edgeZ, moorZ, offZ, setRopes, placeTugs };
}
