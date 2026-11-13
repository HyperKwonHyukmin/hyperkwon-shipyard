/**
 * P1: 압축한 조선소 배치. 도크 뒤(-x)로 난 중앙 도로 양옆에 공정 순서대로 건물 자리를 두고,
 * 바다 쪽(+x)에는 의장 안벽·인도 안벽과 시운전 부표를 둔다. 건물은 아직 빈 껍데기(P2 에서 채움).
 * 각 장소 위에는 번호와 이름 팻말을 띄운다.
 */
import * as THREE from 'three';
import type { Station } from './content/stations';
import { officeTextures, roadTexture, crosswalkTexture } from './textures';
import { ROADS, FOOTPRINT, doorOf, onRoad } from './layout';

const ROAD_HALF = 20; // 중앙 도로 반폭(트랜스포터가 지나는 길)

function std(color: number, roughness = 0.85, metalness = 0.1) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}
const M = {
  road: std(0x26292e, 0.95),
  line: new THREE.MeshStandardMaterial({ color: 0xc9b25a, emissive: 0x6b5a1e, emissiveIntensity: 0.6 }),
  plate: std(0x3a4049, 0.9),
  roof: std(0x5b6470, 0.7, 0.3),
  roofFlat: std(0x4b5058, 0.9),
  plinth: std(0x5c6066, 0.9),
  trim: std(0xc9cdd2, 0.7),
  curb: std(0xa9adb2, 0.9),
  barrier: new THREE.MeshStandardMaterial({ color: 0xd8342a, roughness: 0.6 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x35536e, roughness: 0.15, metalness: 0.6 }),
  pier: std(0x55595f, 0.9),
  steel: std(0x3a3f46, 0.6, 0.6),
  lamp: new THREE.MeshStandardMaterial({ color: 0xfff1d0, emissive: 0xffd9a0, emissiveIntensity: 2.5 }),
  block: std(0x7b8087, 0.8, 0.2),
  buoyRed: new THREE.MeshStandardMaterial({ color: 0xc8261b, emissive: 0x5a0d08, emissiveIntensity: 0.6 }),
  buoyWhite: std(0xdedcd2, 0.6),
};

/** 사무동: 띠창 벽, 옥상 난간과 설비, 도로 쪽 현관. 길이 x, 높이 h, 폭 z. front = 도로 쪽 z 방향(-1 이면 -z 면) */
function office(x: number, z: number, l: number, h: number, w: number, front: 1 | -1) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const rows = Math.round(h / 3.8);
  const wall = (cols: number) => {
    const t = officeTextures(cols, rows);
    return new THREE.MeshStandardMaterial({
      map: t.map,
      emissive: 0xffffff,
      emissiveMap: t.emissive,
      emissiveIntensity: 0.9,
      roughness: 0.55,
      metalness: 0.1,
    });
  };
  const long = wall(Math.round(l / 3.2));
  const short = wall(Math.round(w / 3.2));
  const body = new THREE.Mesh(new THREE.BoxGeometry(l, h, w), [short, short, M.roofFlat, M.roofFlat, long, long]);
  body.position.y = h / 2 + 1;
  body.castShadow = body.receiveShadow = true;
  g.add(body);
  const mk = (bw: number, bh: number, bd: number, m: THREE.Material, bx: number, by: number, bz: number) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), m);
    mesh.position.set(bx, by, bz);
    mesh.castShadow = mesh.receiveShadow = true;
    g.add(mesh);
    return mesh;
  };
  mk(l + 1.2, 1, w + 1.2, M.plinth, 0, 0.5, 0); // 기단
  // 옥상 난간과 설비
  for (const sz of [-1, 1]) mk(l, 1.2, 0.4, M.trim, 0, h + 1.6, sz * (w / 2 - 0.2));
  for (const sx of [-1, 1]) mk(0.4, 1.2, w, M.trim, sx * (l / 2 - 0.2), h + 1.6, 0);
  mk(8, 3, 6, M.trim, -l / 4, h + 2.5, 0);
  mk(5, 2, 4, M.plinth, l / 5, h + 2, 2);
  mk(1.2, 6, 1.2, M.steel, l / 3, h + 4, -3);
  // 현관: 캐노피와 유리문
  const fz = front * (w / 2);
  mk(12, 0.5, 5, M.trim, 0, 5.2, fz + front * 2.5);
  for (const sx of [-1, 1]) mk(0.4, 4.2, 0.4, M.steel, sx * 5.4, 3.1, fz + front * 4.6);
  mk(8, 3.6, 0.3, M.glass, 0, 2.8, fz + front * 0.2);
  return g;
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
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, fog: false, depthWrite: false, transparent: true }));
  s.scale.set(40, 8, 1);
  return s;
}

export function buildYard(scene: THREE.Scene, stations: Station[]) {
  const g = new THREE.Group();
  scene.add(g);
  const add = <T extends THREE.Object3D>(o: T) => (g.add(o), o);

  // 도로망(layout.ts): 길마다 아스팔트·차선·초록 보행로를 그림 한 장으로. 세로 길은 같은 그림을 돌려 쓴다
  {
    const base = roadTexture();
    ROADS.forEach((r, i) => {
      const len = r.to - r.from;
      const tex = base.clone();
      tex.repeat.set(len / 14, 1);
      const road = add(new THREE.Mesh(new THREE.PlaneGeometry(len, r.half * 2), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92 })));
      road.rotation.x = -Math.PI / 2;
      if (!r.h) road.rotation.z = Math.PI / 2;
      const mid = (r.from + r.to) / 2;
      // 겹치는 곳이 깜빡이지 않게 길마다 높이를 조금씩 다르게
      road.position.set(r.h ? mid : r.at, 0.06 + i * 0.004, r.h ? r.at : mid);
      road.receiveShadow = true;
    });
    // 교차로: 차선이 겹쳐 보이지 않게 민무늬 아스팔트로 덮는다
    const plain = new THREE.MeshStandardMaterial({ color: 0x2b2e33, roughness: 0.92 });
    for (const h of ROADS)
      for (const v of ROADS) {
        if (!h.h || v.h) continue;
        if (v.at < h.from - 1 || v.at > h.to + 1 || h.at < v.from - 1 || h.at > v.to + 1) continue;
        const patch = add(new THREE.Mesh(new THREE.PlaneGeometry(v.half * 2, h.half * 2), plain));
        patch.rotation.x = -Math.PI / 2;
        patch.position.set(v.at, 0.09, h.at);
        patch.receiveShadow = true;
      }
    // 장소 앞 횡단보도(그 장소가 면한 길을 가로지름)
    const cw = new THREE.MeshStandardMaterial({ map: crosswalkTexture(), transparent: true, depthWrite: false, roughness: 0.9 }); // 밤에 빛나지 않게 조명을 받는 재질
    for (const s of stations) {
      if (!FOOTPRINT[s.id]) continue;
      const d = doorOf(s.at);
      const m = add(new THREE.Mesh(new THREE.PlaneGeometry(5, d.road.half * 2 - 8), cw));
      m.rotation.x = -Math.PI / 2;
      m.position.set(s.at[0] + 34, 0.1, d.road.at);
    }
  }
  // 가로등: 길 양옆 60 m 마다(교차로는 건너뜀). 기둥·팔·등을 InstancedMesh 3개로(불빛만, 조명은 넣지 않음)
  {
    const spots: { x: number; z: number; h: boolean; s: number }[] = [];
    for (const r of ROADS)
      for (let a = r.from + 30; a < r.to - 10; a += 60)
        for (const side of [-1, 1]) {
          const off = side * (r.half + 2);
          const x = r.h ? a : r.at + off;
          const z = r.h ? r.at + off : a;
          // 다른 길 위에 서는 등은 뺀다
          if (ROADS.some((o) => o !== r && onRoad(x, z, 3) && Math.abs((o.h ? z : x) - o.at) <= o.half + 3 && (o.h ? x : z) >= o.from && (o.h ? x : z) <= o.to)) continue;
          spots.push({ x, z, h: r.h, s: -side });
        }
    const pole = add(new THREE.InstancedMesh(new THREE.CylinderGeometry(0.14, 0.22, 11, 8), M.steel, spots.length));
    const arm = add(new THREE.InstancedMesh(new THREE.BoxGeometry(0.14, 0.14, 2.6), M.steel, spots.length));
    const head = add(new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.16, 1.1), M.lamp, spots.length));
    const m4 = new THREE.Matrix4();
    const rot = new THREE.Matrix4().makeRotationY(Math.PI / 2);
    spots.forEach((p, i) => {
      // 팔과 등은 길 쪽으로 뻗는다. 세로 길에서는 90° 돌린다
      const ax = p.h ? 0 : p.s;
      const az = p.h ? p.s : 0;
      pole.setMatrixAt(i, m4.makeTranslation(p.x, 5.5, p.z));
      arm.setMatrixAt(i, m4.makeTranslation(p.x + ax * 1.2, 10.9, p.z + az * 1.2).multiply(p.h ? new THREE.Matrix4() : rot));
      head.setMatrixAt(i, m4.makeTranslation(p.x + ax * 2.2, 10.75, p.z + az * 2.2).multiply(p.h ? new THREE.Matrix4() : rot));
    });
    pole.castShadow = true;
  }

  const at = (id: string) => stations.find((s) => s.id === id)!.at;

  // 0 정문: 도로를 가로지르는 문, 이름판(로고 없음), 경비실과 차단기. 역사관 전시관은 history.ts
  {
    const [x] = at('gate');
    const gx = x - 60;
    for (const s of [-1, 1]) {
      const p = add(new THREE.Mesh(new THREE.BoxGeometry(4, 15, 4), M.trim));
      p.position.set(gx, 7.5, s * (ROAD_HALF + 4));
      p.castShadow = true;
      const cap = add(new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.6, 4.6), M.plinth));
      cap.position.set(gx, 15.3, s * (ROAD_HALF + 4));
    }
    const beam = add(new THREE.Mesh(new THREE.BoxGeometry(2.4, 3.4, ROAD_HALF * 2 + 12), M.trim));
    beam.position.set(gx, 14, 0);
    beam.castShadow = true;
    // 이름판(들어오는 쪽 = −x 면)
    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = 96;
    const cg = c.getContext('2d')!;
    cg.fillStyle = '#002554';
    cg.fillRect(0, 0, 1024, 96);
    cg.fillStyle = '#ffffff';
    cg.font = '700 56px Pretendard, system-ui, sans-serif';
    cg.textAlign = 'center';
    cg.textBaseline = 'middle';
    cg.fillText('울산조선소 이야기', 512, 50);
    const st = new THREE.CanvasTexture(c);
    st.colorSpace = THREE.SRGBColorSpace;
    const sign = add(new THREE.Mesh(new THREE.PlaneGeometry(32, 3), new THREE.MeshBasicMaterial({ map: st })));
    sign.rotation.y = -Math.PI / 2;
    sign.position.set(gx - 1.25, 14, 0);
    // 경비실과 차단기
    const hut = add(new THREE.Mesh(new THREE.BoxGeometry(5, 3.4, 4), M.trim));
    hut.position.set(gx + 8, 1.7, ROAD_HALF + 5);
    hut.castShadow = true;
    const hutRoof = add(new THREE.Mesh(new THREE.BoxGeometry(6, 0.3, 5), M.plinth));
    hutRoof.position.set(gx + 8, 3.55, ROAD_HALF + 5);
    const win = add(new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.4, 0.2), M.glass));
    win.position.set(gx + 8, 2.2, ROAD_HALF + 2.95);
    for (const s of [-1, 1]) {
      const post = add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.3, 0.5), M.steel));
      post.position.set(gx + 4, 0.65, s * (ROAD_HALF - 1));
      const bar = add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, ROAD_HALF - 4), M.barrier));
      bar.position.set(gx + 4, 1.2, s * (ROAD_HALF / 2 + 1));
    }
  }
  // 1 설계동: 사무동(높은 건물)
  {
    const [x, , z] = at('design');
    add(office(x, z, 44, 34, 26, z > 0 ? -1 : 1));
  }
  // 2 가공, 3 조립, 4 PE장, 5 도장은 안이 보이는 공장으로 factory/
  // 4 선행탑재장: 마당·크레인·블록은 factory/pe.ts
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
  // 9 시운전 해역: 속력 시험 구간 양 끝 표지 부표(배는 z = 0 줄을 +x 로 달림, trial.ts)
  {
    const [x, , z] = at('trial');
    for (const [dx, dz] of [
      [-60, 38],
      [100, 38],
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
    gate: 30, design: 50, cutting: 32, assembly: 36, pe: 24, paint: 30,
    dock: 40, launch: 28, quay: 20, trial: 14, delivery: 20,
  };
  const labels = stations.map((s, i) => {
    const l = add(label(i, s.name));
    const [x, y, z] = s.at;
    l.position.set(x, Math.max(0, y) + (LIFT[s.id] ?? 30), z);
    return l;
  });

  /** 지금 장소의 팻말은 카메라가 가까이 오면 흐리게(공장 안을 볼 때 화면 위를 덮지 않게, 이름은 패널에 있음) */
  function fadeLabels(cam: THREE.Vector3, current: number) {
    labels.forEach((l, i) => {
      const d = cam.distanceTo(l.position);
      (l.material as THREE.SpriteMaterial).opacity = i === current ? THREE.MathUtils.clamp((d - 140) / 60, 0, 1) : 1;
    });
  }
  return { group: g, fadeLabels };
}
