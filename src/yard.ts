/**
 * P1: 압축한 조선소 배치. 도크 뒤(-x)로 난 중앙 도로 양옆에 공정 순서대로 건물 자리를 두고,
 * 바다 쪽(+x)에는 의장 안벽·인도 안벽과 시운전 부표를 둔다. 건물은 아직 빈 껍데기(P2 에서 채움).
 * 각 장소 위에는 번호와 이름 팻말을 띄운다.
 */
import * as THREE from 'three';
import type { Station } from './content/stations';

const ROAD_HALF = 20; // 중앙 도로 반폭(트랜스포터가 지나는 길)

function std(color: number, roughness = 0.85, metalness = 0.1) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}
const M = {
  road: std(0x26292e, 0.95),
  line: new THREE.MeshStandardMaterial({ color: 0xc9b25a, emissive: 0x6b5a1e, emissiveIntensity: 0.6 }),
  plate: std(0x3a4049, 0.9),
  roof: std(0x5b6470, 0.7, 0.3),
  pier: std(0x55595f, 0.9),
  steel: std(0x3a3f46, 0.6, 0.6),
  lamp: new THREE.MeshStandardMaterial({ color: 0xfff1d0, emissive: 0xffd9a0, emissiveIntensity: 2.5 }),
  block: std(0x7b8087, 0.8, 0.2),
  buoyRed: new THREE.MeshStandardMaterial({ color: 0xc8261b, emissive: 0x5a0d08, emissiveIntensity: 0.6 }),
  buoyWhite: std(0xdedcd2, 0.6),
};

function windowTexture(cols: number, rows: number) {
  const c = document.createElement('canvas');
  c.width = cols * 8;
  c.height = rows * 12;
  const g = c.getContext('2d')!;
  g.fillStyle = '#2b3038';
  g.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < cols; i++)
    for (let j = 0; j < rows; j++) {
      if (Math.random() < 0.4) continue;
      g.fillStyle = Math.random() < 0.8 ? '#ffd58a' : '#bfe0ff';
      g.globalAlpha = 0.45 + Math.random() * 0.5;
      g.fillRect(i * 8 + 2, j * 12 + 3, 4, 6);
    }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** 창 불빛이 있는 공장 건물. 길이 x, 높이 h, 폭 z */
function building(x: number, z: number, l: number, h: number, w: number) {
  const tex = windowTexture(Math.round(l / 3), Math.round(h / 4));
  const side = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: tex,
    emissive: 0xffffff,
    emissiveMap: tex,
    emissiveIntensity: 0.85,
    roughness: 0.9,
  });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(l, h, w), [side, side, M.roof, M.roof, side, side]);
  mesh.position.set(x, h / 2, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** 번호·이름 팻말(공식 색상 체계: 배경 TRUST BLUE, 번호 HERITAGE GREEN) */
function label(no: number, name: string) {
  const c = document.createElement('canvas');
  c.width = 640;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(0,37,84,0.88)';
  g.beginPath();
  g.roundRect(4, 4, 632, 120, 28);
  g.fill();
  g.fillStyle = '#008233';
  g.beginPath();
  g.arc(66, 64, 42, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#ffffff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = '700 52px Pretendard, system-ui, sans-serif';
  g.fillText(String(no), 66, 66);
  g.textAlign = 'left';
  g.font = '700 56px Pretendard, system-ui, sans-serif';
  g.fillText(name, 130, 68);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, fog: false, depthWrite: false }));
  s.scale.set(40, 8, 1);
  return s;
}

export function buildYard(scene: THREE.Scene, stations: Station[]) {
  const g = new THREE.Group();
  scene.add(g);
  const add = <T extends THREE.Object3D>(o: T) => (g.add(o), o);

  // 중앙 도로(정문 → 도크 뒤 적치장)와 가운데 선
  const road = add(new THREE.Mesh(new THREE.BoxGeometry(600, 0.1, ROAD_HALF * 2), M.road));
  road.position.set(-410, 0.05, 0);
  road.receiveShadow = true;
  for (let x = -700; x < -120; x += 14) {
    const d = add(new THREE.Mesh(new THREE.BoxGeometry(7, 0.12, 0.5), M.line));
    d.position.set(x, 0.08, 0);
  }
  // 가로등(불빛만, 조명은 넣지 않음 — 점광원이 늘면 무거워짐)
  for (let x = -690; x < -130; x += 60)
    for (const z of [-ROAD_HALF - 2, ROAD_HALF + 2]) {
      const pole = add(new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 12, 8), M.steel));
      pole.position.set(x, 6, z);
      const head = add(new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.5, 1), M.lamp));
      head.position.set(x, 12, z - Math.sign(z) * 1.2);
    }

  const at = (id: string) => stations.find((s) => s.id === id)!.at;

  // 0 정문·역사관: 도로를 가로지르는 정문 + 역사관 건물
  {
    const [x, , z] = at('gate');
    add(building(x, z, 50, 18, 30));
    const gx = x - 60;
    for (const s of [-1, 1]) {
      const p = add(new THREE.Mesh(new THREE.BoxGeometry(3, 14, 3), M.roof));
      p.position.set(gx, 7, s * (ROAD_HALF + 3));
    }
    const beam = add(new THREE.Mesh(new THREE.BoxGeometry(3, 2.5, ROAD_HALF * 2 + 9), M.roof));
    beam.position.set(gx, 14, 0);
  }
  // 1 설계동: 사무동(높은 건물)
  {
    const [x, , z] = at('design');
    add(building(x, z, 44, 34, 26));
  }
  // 2 강재 가공공장, 3 조립공장, 5 도장공장: 공장동
  {
    const [x, , z] = at('cutting');
    add(building(x, z, 80, 22, 40));
  }
  {
    const [x, , z] = at('assembly');
    add(building(x, z, 90, 26, 44));
  }
  {
    const [x, , z] = at('paint');
    add(building(x, z, 66, 20, 38));
  }
  // 4 선행탑재장: 트인 마당에 블록 몇 개
  {
    const [x, , z] = at('pe');
    const plate = add(new THREE.Mesh(new THREE.BoxGeometry(90, 0.2, 50), M.plate));
    plate.position.set(x, 0.1, z);
    plate.receiveShadow = true;
    const sizes: [number, number, number, number, number][] = [
      [-28, -10, 18, 7, 14],
      [-5, -12, 22, 9, 16],
      [22, -8, 16, 6, 12],
      [0, 12, 24, 8, 14],
    ];
    for (const [dx, dz, l, h, w] of sizes) {
      const b = add(new THREE.Mesh(new THREE.BoxGeometry(l, h, w), M.block));
      b.position.set(x + dx, h / 2 + 0.2, z + dz);
      b.castShadow = true;
      b.receiveShadow = true;
    }
  }
  // 8 의장 안벽, 10 인도 안벽: 바다로 뻗은 부두와 계선주
  for (const id of ['quay', 'delivery']) {
    const [x, , z] = at(id);
    const pier = add(new THREE.Mesh(new THREE.BoxGeometry(300, 6, 26), M.pier));
    pier.position.set(x, -3, z);
    pier.receiveShadow = true;
    const edge = Math.sign(z) * -13; // 바다 쪽(도크 방향) 가장자리에 계선주
    for (let px = x - 140; px <= x + 140; px += 20) {
      const b = add(new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 1.2, 10), M.steel));
      b.position.set(px, 0.6, z + edge);
    }
    for (let px = x - 120; px <= x + 120; px += 80) {
      const pole = add(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 14, 8), M.steel));
      pole.position.set(px, 7, z - edge * 0.7);
      const head = add(new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.5, 1), M.lamp));
      head.position.set(px, 14, z - edge * 0.6);
    }
  }
  // 9 시운전 해역: 부표
  {
    const [x, , z] = at('trial');
    for (const [dx, dz] of [
      [0, 0],
      [60, -40],
      [-50, 50],
    ]) {
      const buoy = add(new THREE.Group());
      const body = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.6, 4, 12), M.buoyRed);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.25, 0.8, 12), M.buoyWhite);
      band.position.y = 0.6;
      const top = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 8), M.lamp);
      top.position.y = 2.6;
      buoy.add(body, band, top);
      buoy.position.set(x + dx, -2, z + dz);
    }
  }

  // 팻말 높이: 건물 지붕보다 조금 위(건물 높이에 맞춤)
  const LIFT: Record<string, number> = {
    gate: 30, design: 46, cutting: 32, assembly: 36, pe: 24, paint: 30,
    dock: 40, launch: 28, quay: 20, trial: 14, delivery: 20,
  };
  stations.forEach((s, i) => {
    const l = add(label(i, s.name));
    const [x, y, z] = s.at;
    l.position.set(x, Math.max(0, y) + (LIFT[s.id] ?? 30), z);
  });

  return g;
}
