/**
 * 규모감을 위한 배경(2026-11-22 사용자: "들어왔을 때 흥미로운 느낌"). 지금 도크 하나·골리앗 둘뿐이라
 * 전체를 보면 빈 콘크리트 판이었다. 야드 남북으로 배경 도크와 건조 단계가 다른 선체, 골리앗 크레인 열,
 * 안벽에 붙은 의장선과 지브 크레인, 앞바다에 닻을 내린 배를 둔다.
 * - 전부 움직이지 않고 재질별로 합친다(그리기 호출은 재질 수만큼). 조명은 만들지 않고 등은 발광 재질로만.
 * - 도크 구덩이를 실제로 파지 않는다: 어두운 바닥 판 위에 선체의 땅 위로 보이는 부분만 올린다(멀리서만 보는 배경).
 * - 실제 배치가 아니다(공개 자료 원칙). 개수도 실제 도크 수에 맞추지 않았다 — '도크가 줄지어 있다'는 인상만.
 * - 걷기 모드의 충돌은 없다(야드 경계 나무 밖).
 */
import * as THREE from 'three';
import { mergeStatic } from './merge';

const std = (color: number, roughness = 0.75, metalness = 0.15) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
const glow = (color: number, k: number) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: k });

export function createBackdrop(scene: THREE.Scene, o: { seaY: number; coastX: number }) {
  const root = new THREE.Group();
  const M = {
    pit: std(0x23262b, 0.95, 0),
    rail: std(0xd9b021, 0.6),
    gate: std(0x5a3b33, 0.7, 0.4),
    crane: std(0xd9a21b, 0.55, 0.3),
    craneDark: std(0x8a6a1a, 0.6, 0.3),
    jib: std(0xb9bcc0, 0.6, 0.3),
    steel: std(0x3a3f46, 0.6, 0.5),
    navy: std(0x2c4268, 0.5, 0.2),
    black: std(0x23272e, 0.5, 0.2),
    oxide: std(0x7a3a2c, 0.7),
    green: std(0x2f5a4a, 0.55, 0.2),
    primer: std(0x8a8f96, 0.8, 0.2),
    primerRed: std(0x8b4a3a, 0.8, 0.2),
    hold: std(0x3c4046, 0.9, 0),
    deck: std(0x4d6a46, 0.85),
    deckRed: std(0x7d4034, 0.85),
    hatch: std(0x3b5b77, 0.6, 0.2),
    house: std(0xe6e6df, 0.6),
    funnel: std(0x2a2e35, 0.6, 0.2),
    boot: std(0x8c3027, 0.7),
    pier: std(0x565a61, 0.95, 0),
    window: glow(0xffd58a, 1.6),
    lamp: glow(0xffe2a8, 3),
    red: glow(0xff2a1a, 2),
  };
  const box = (parent: THREE.Object3D, w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, shadow = true) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z);
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };

  /** 위에서 본 선체 윤곽을 높이 h 만큼 세운 기둥. x1 이 선수 시작(60)보다 작으면 거기서 잘린 건조 중 선체 */
  function hullGeo(x1: number, h: number, inset = 0) {
    const hb = 16 - inset;
    const pts: [number, number][] = [[-95 + inset, 12 - inset], [-88, hb]];
    if (x1 >= 95) pts.push([60, hb], [80, 11 - inset], [91 - inset, 5 - inset * 0.5], [95 - inset, 0]);
    else pts.push([x1 - inset, hb]);
    const shape = new THREE.Shape();
    pts.forEach(([x, z], i) => (i ? shape.lineTo(x, z) : shape.moveTo(x, z)));
    for (let i = pts.length - 1; i >= 0; i--) if (pts[i][1] !== 0) shape.lineTo(pts[i][0], -pts[i][1]);
    const g = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, curveSegments: 1 });
    g.rotateX(-Math.PI / 2);
    return g;
  }
  interface ShipLook {
    /** 선체가 어디까지 올라갔나(선미 -95 기준 x, 95 면 완성) */
    to: number;
    /** 땅(또는 물) 위로 보이는 선체 높이 */
    h: number;
    side: THREE.Material;
    deck?: THREE.Material;
    house?: boolean;
    /** 물에 뜬 배: 흘수선의 붉은 띠 */
    boot?: boolean;
  }
  function ship(look: ShipLook) {
    const g = new THREE.Group();
    const add = (geo: THREE.BufferGeometry, m: THREE.Material, y: number) => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.y = y;
      mesh.castShadow = mesh.receiveShadow = true;
      g.add(mesh);
    };
    add(hullGeo(look.to, look.h), look.side, 0);
    if (look.boot) add(hullGeo(look.to, 1.4, -0.12), M.boot, -0.3);
    if (look.deck) {
      add(hullGeo(look.to, 0.25, 0.9), look.deck, look.h);
      for (let i = 0; i < 5; i++) if (-43 + i * 24 + 9 < look.to) box(g, 17, 1.5, 17, M.hatch, -43 + i * 24, look.h + 1, 0);
    } else {
      // 건조 중: 갑판이 없어 화물창 안이 어둡게 보이고, 횡격벽이 칸을 나눈다
      add(hullGeo(look.to, 0.2, 1.6), M.hold, look.h - 0.5);
      for (let x = -55; x < look.to - 2; x += 24) box(g, 1, 1.6, 28, M.primer, x, look.h + 0.3, 0);
    }
    if (look.house) {
      box(g, 13, 14, 25, M.house, -79, look.h + 7, 0);
      box(g, 9, 4, 19, M.house, -79, look.h + 16, 0);
      box(g, 13.2, 0.9, 21, M.window, -79, look.h + 16.4, 0, false);
      for (const y of [4, 8, 11.5]) box(g, 13.2, 0.7, 23, M.window, -79, look.h + y, 0, false);
      box(g, 6, 9, 5.5, M.funnel, -88.5, look.h + 6, 0);
    }
    return g;
  }

  /** 골리앗 크레인(배경용: 다리 넷, 거더 둘, 대차, 트롤리, 장애등) */
  function goliath(x: number, z: number, span = 32, H = 66) {
    const g = new THREE.Group();
    for (const s of [-1, 1]) {
      for (const dx of [-9, 9]) {
        const leg = box(g, 2.2, H, 2.2, M.crane, dx * 0.72, H / 2, s * span);
        leg.rotation.z = -Math.atan2(dx * 0.55, H);
      }
      box(g, 24, 2.4, 3.2, M.craneDark, 0, 1.2, s * span);
      box(g, 16, 1, 1, M.crane, 0, 20, s * span);
    }
    for (const dx of [-2.6, 2.6]) box(g, 3.4, 6, span * 2 + 14, M.crane, dx, H + 3, 0);
    box(g, 8, 2.4, 6, M.craneDark, 0, H + 7.8, span * 0.3);
    box(g, 0.25, 26, 0.25, M.steel, 0, H - 7, span * 0.3, false);
    box(g, 3.4, 2.2, 1.6, M.rail, 0, H - 21, span * 0.3);
    box(g, 3, 1, 1.2, M.lamp, 0, H - 0.6, span * 0.6, false);
    for (const s of [-1, 1]) box(g, 1.2, 1.2, 1.2, M.red, 0, H + 6.8, s * (span + 6), false);
    g.position.set(x, 0, z);
    root.add(g);
  }

  /** 안벽 지브 크레인: 탑 + 선회부 + 비스듬한 붐 */
  function jib(x: number, z: number, turn: number) {
    const g = new THREE.Group();
    box(g, 7, 2, 7, M.steel, 0, 1, 0);
    box(g, 3, 34, 3, M.jib, 0, 19, 0);
    box(g, 6, 4.5, 5, M.jib, 0, 38, 0);
    const boom = box(g, 44, 1.6, 1.6, M.jib, 17, 51, 0);
    boom.rotation.z = 0.52;
    box(g, 9, 3.5, 4, M.steel, -6, 38.5, 0);
    box(g, 1.4, 0.8, 1.4, M.lamp, 3, 36, 0, false);
    g.rotation.y = turn;
    g.position.set(x, 0, z);
    root.add(g);
  }

  // ── 배경 도크: 지금 도크와 나란히(길이 방향 x, 바다 쪽 끝이 해안선) ──
  const X1 = o.coastX - 8; // 게이트 안쪽
  const DOCKS: { z: number; look: ShipLook; cranes: number[] }[] = [
    { z: -420, look: { to: 95, h: 6, side: M.navy, deck: M.deck, house: true }, cranes: [-70] },
    { z: -545, look: { to: 30, h: 6, side: M.primer }, cranes: [-20, 70] },
    { z: -670, look: { to: 95, h: 6, side: M.oxide, deck: M.deckRed, house: true }, cranes: [40] },
    { z: -800, look: { to: -20, h: 6, side: M.primerRed }, cranes: [-50] },
    { z: 460, look: { to: 10, h: 6, side: M.primerRed }, cranes: [-40, 60] },
    { z: 585, look: { to: 95, h: 6, side: M.black, deck: M.deck, house: true }, cranes: [-80] },
    { z: 710, look: { to: 60, h: 6, side: M.primer }, cranes: [10] },
  ];
  for (const d of DOCKS) {
    box(root, 224, 0.12, 52, M.pit, 0, 0.07, d.z, false);
    for (const s of [-1, 1]) box(root, 224, 0.5, 0.3, M.rail, 0, 0.6, d.z + s * 26.2, false);
    box(root, 8, 3, 54, M.gate, X1 + 4, 1.5, d.z);
    for (const s of [-1, 1]) box(root, 264, 0.3, 0.5, M.steel, -20, 0.15, d.z + s * 32, false);
    const s = ship(d.look);
    s.position.set(-2, 0.1, d.z);
    root.add(s);
    for (const cx of d.cranes) goliath(cx, d.z);
    // 도크 옆 투광등 탑(등만 빛난다)
    for (const [tx, side] of [[-60, -1], [55, 1]] as const) {
      box(root, 1, 36, 1, M.steel, tx, 18, d.z + side * 42);
      box(root, 5, 1.4, 1.2, M.lamp, tx, 36.6, d.z + side * 41.4, false);
    }
    // 대기 블록 몇 개(도크 뒤)
    for (let i = 0; i < 3; i++) box(root, 16, 6 + (i % 2) * 3, 12, i % 2 ? M.primerRed : M.primer, -150 - i * 26, 4.2 + (i % 2) * 1.5, d.z + (i - 1) * 9);
  }

  // ── 해안선을 따라 붙은 의장선과 지브 크레인 ──
  const QUAY_SHIPS: { z: number; look: ShipLook; scale: number }[] = [
    { z: -285, look: { to: 95, h: 10, side: M.green, deck: M.deck, house: true, boot: true }, scale: 0.8 },
    { z: 312, look: { to: 95, h: 11, side: M.navy, deck: M.deckRed, house: true, boot: true }, scale: 0.8 },
    { z: -940, look: { to: 95, h: 12, side: M.black, deck: M.deck, house: true, boot: true }, scale: 1.1 },
    { z: 850, look: { to: 95, h: 10, side: M.oxide, deck: M.deck, house: true, boot: true }, scale: 0.9 },
  ];
  for (const q of QUAY_SHIPS) {
    const s = ship(q.look);
    s.scale.setScalar(q.scale);
    s.rotation.y = Math.PI / 2; // 해안선(z 방향)과 나란히
    s.position.set(o.coastX + 4 + 16 * q.scale, o.seaY, q.z);
    root.add(s);
    jib(o.coastX - 12, q.z - 40 * q.scale, -0.5);
    jib(o.coastX - 12, q.z + 45 * q.scale, 0.4);
  }
  for (const z of [-360, -480, -610, -735, 390, 520, 650]) jib(o.coastX - 12, z, z % 3 ? 0.9 : -0.7);

  // ── 앞바다: 닻을 내리고 기다리는 배(시운전 해역 x 450~1000, z ±300 밖) ──
  const ANCHORED: [number, number, number, number, THREE.Material][] = [
    [980, -640, 0.35, 1.15, M.black],
    [1320, 420, -0.25, 1.3, M.navy],
    [1560, -160, 0.12, 1.2, M.oxide],
    [900, 780, 1.1, 1, M.green],
    [1420, -940, 0.6, 1.4, M.black],
    [1750, 700, -0.5, 1.1, M.navy],
  ];
  for (const [x, z, rot, scale, side] of ANCHORED) {
    const s = ship({ to: 95, h: 9, side, deck: side === M.oxide ? M.deck : M.deckRed, house: true, boot: true });
    s.scale.setScalar(scale);
    s.rotation.y = rot;
    s.position.set(x, o.seaY, z);
    root.add(s);
  }

  scene.add(root);
  mergeStatic(root);
  return { group: root };
}
