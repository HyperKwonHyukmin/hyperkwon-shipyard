/**
 * P2-1 강재 가공공장(공식 공정 1 가공).
 * 한 순환(약 75초): 강판 반입 → 절단기가 부재 모양을 따라 자름(불꽃, 절단선이 강판에 남음)
 * → 천장 크레인 자석이 부재를 들어 팔레트에 쌓음 → 남은 강판 뼈대를 스크랩 통에 버림.
 * 옆의 프레스는 따로 돌며 평평한 강판을 조금씩 눌러 굽힌다(곡가공).
 * 좌표는 건물 중심 바닥이 원점(x = 건물 길이, z = 폭, +z 가 도로 쪽 열린 면).
 */
import * as THREE from 'three';
import { buildShed, overheadCrane, part, boxG, FM, std, sequence, lerp, inOut, glowTexture, sparks, type Step } from './shed';

const L = 80;
const W = 40;
const H = 22;

// 강판 14 × 7 m, 두께는 잘 보이게 0.4 m 로 과장
const PL = 14;
const PW = 7;
const PT = 0.4;
const TABLE_Y = 0.9; // 절단대 윗면 = 강판 아랫면
const TOP = TABLE_Y + PT;
const PPM = 48; // 강판 표면 그림의 1 m 당 화소

const PRIMER = '#6f6a62';
const HOLE = '#111316';
const CUT = 2.2; // 절단 속도 m/s(보기 좋게 빠르게)
const TRAVEL = 6;

type P2 = [number, number];

/** 부재 3개의 외곽선(강판 위 u = x, v = z) */
function partOutlines(): P2[][] {
  const bracket: P2[] = [
    [-6.4, -3],
    [-1.6, -3],
    [-1.6, -2.2],
    [-5.6, 2.9],
    [-6.4, 2.9],
  ];
  // 아래 변은 곧고 위 변에 반원 홈(스캘럽) 2개가 있는 웨브
  const web: P2[] = [
    [-0.8, -3],
    [6.4, -3],
    [6.4, -1],
  ];
  for (const cu of [4.2, 1.6]) {
    web.push([cu + 0.45, -1]);
    for (let a = 0; a <= 8; a++) {
      const t = (a / 8) * Math.PI;
      web.push([cu + 0.45 * Math.cos(t), -1 - 0.45 * Math.sin(t)]);
    }
  }
  web.push([-0.8, -1]);
  // 위가 둥근 곡부재
  const curved: P2[] = [
    [-0.8, -0.3],
    [6.4, -0.3],
    [6.4, 1.2],
  ];
  for (let a = 1; a < 16; a++) {
    const u = 6.4 - (7.2 * a) / 16;
    const s = (u - 2.8) / 3.6;
    curved.push([u, 1.2 + 1.7 * (1 - s * s)]);
  }
  curved.push([-0.8, 1.2]);
  return [bracket, web, curved];
}

interface Seg {
  a: P2;
  b: P2;
  cut: boolean;
  t0: number;
  t1: number;
}
function buildPath(parts: P2[][], start: P2) {
  const segs: Seg[] = [];
  let t = 0;
  let cur = start;
  const push = (a: P2, b: P2, cut: boolean) => {
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const dur = d / (cut ? CUT : TRAVEL);
    segs.push({ a, b, cut, t0: t, t1: t + dur });
    t += dur;
  };
  for (const p of parts) {
    push(cur, p[0], false);
    for (let i = 0; i < p.length; i++) push(p[i], p[(i + 1) % p.length], true);
    cur = p[0];
  }
  return { segs, total: t };
}

/** 외곽선을 두께 있는 판 메시로(위에서 본 모양 그대로, 아랫면 y = 0) */
function plateFromOutline(o: P2[], m: THREE.Material) {
  // Shape 의 y 를 -v 로 두고 x 축으로 -90° 돌리면 (u, 높이, v) 가 된다
  const shape = new THREE.Shape(o.map(([u, v]) => new THREE.Vector2(u, -v)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: PT + 0.02, bevelEnabled: false, curveSegments: 1 });
  g.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(g, m);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function createCutting(scene: THREE.Scene, at: [number, number, number]) {
  const root = new THREE.Group();
  root.position.set(at[0], 0, at[2]);
  scene.add(root);
  const shed = buildShed(L, W, H, 1);
  root.add(shed.group);
  const outlines = partOutlines();

  // ── 고정 설비 ──
  const steelM = std(0x6f767e, 0.7, 0.5);
  const plateSide = std(0x6c675e, 0.8, 0.3);
  // 강판 적치(뒤쪽)
  for (let i = 0; i < 9; i++) part(root, boxG(PL, PT * 0.9, PW), i % 2 ? plateSide : steelM, -30, 0.2 + i * PT * 0.9, -12);
  // 롤러 컨베이어
  part(root, boxG(16, 0.5, 0.4), FM.steel, -17, TABLE_Y - 0.6, -3.2);
  part(root, boxG(16, 0.5, 0.4), FM.steel, -17, TABLE_Y - 0.6, 3.2);
  for (let x = -24.5; x <= -9.5; x += 1.5) {
    const r = part(root, new THREE.CylinderGeometry(0.15, 0.15, 7, 8), FM.column, x, TABLE_Y - 0.15, 0, false);
    r.rotation.x = Math.PI / 2;
  }
  // 절단대(살대 위에 강판이 놓임)와 레일
  part(root, boxG(15, TABLE_Y - 0.2, 8), FM.dark, 0, (TABLE_Y - 0.2) / 2, 0, false);
  for (let x = -7; x <= 7; x += 1) part(root, boxG(0.12, 0.2, 7.8), FM.steel, x, TABLE_Y - 0.1, 0, false);
  for (const z of [-5.6, 5.6]) part(root, boxG(20, 0.5, 0.5), FM.steel, 0, 0.6, z);

  // 절단기(겐트리): x 로 달리고, 캐리지가 z 로, 토치 끝이 강판 위
  const gantry = new THREE.Group();
  root.add(gantry);
  for (const z of [-5.6, 5.6]) part(gantry, boxG(1.6, 2.4, 0.9), FM.crane, 0, 2.0, z);
  part(gantry, boxG(0.9, 0.8, 12.2), FM.crane, 0, 3.4, 0);
  const carriage = new THREE.Group();
  gantry.add(carriage);
  part(carriage, boxG(1.1, 1.2, 1.0), FM.craneDark, 0.9, 3.2, 0);
  part(carriage, new THREE.CylinderGeometry(0.12, 0.18, 1.5, 8), FM.steel, 0.9, 2.1, 0);
  // 토치는 캐리지 앞쪽(x + 0.9). 절단 지점은 gantry.x + 0.9
  const TORCH_DX = 0.9;
  const tip = new THREE.Vector3(TORCH_DX, TOP + 0.05, 0);
  const flame = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture('rgba(255,200,120,0.9)', 'rgba(255,120,40,0)'),
      color: 0xffc080,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: false,
      toneMapped: false,
    }),
  );
  flame.scale.setScalar(0.05);
  flame.position.copy(tip);
  flame.visible = false;
  carriage.add(flame);
  const torchLight = new THREE.PointLight(0xffa860, 0, 30, 2);
  torchLight.position.set(TORCH_DX, TOP + 1.2, 0);
  carriage.add(torchLight);
  const fx = sparks(root, 500, [1, 0.8, 0.45]);

  // ── 강판(표면 그림에 절단선이 남음) ──
  const canvas = document.createElement('canvas');
  canvas.width = PL * PPM;
  canvas.height = PW * PPM;
  const g2 = canvas.getContext('2d')!;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const px = ([u, v]: P2): P2 => [(u + PL / 2) * PPM, (v + PW / 2) * PPM];
  function cleanPlate() {
    g2.fillStyle = PRIMER;
    g2.fillRect(0, 0, canvas.width, canvas.height);
    g2.globalAlpha = 0.08;
    for (let i = 0; i < 160; i++) {
      g2.fillStyle = Math.random() < 0.5 ? '#000' : '#fff';
      g2.fillRect(Math.random() * canvas.width, Math.random() * canvas.height, 2 + Math.random() * 30, 1 + Math.random() * 3);
    }
    g2.globalAlpha = 1;
    tex.needsUpdate = true;
  }
  const plate = new THREE.Group();
  part(plate, boxG(PL, PT, PW), plateSide, 0, PT / 2, 0);
  const top = new THREE.Mesh(new THREE.PlaneGeometry(PL, PW), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, metalness: 0.3 }));
  top.rotation.x = -Math.PI / 2;
  top.position.y = PT + 0.01;
  top.receiveShadow = true;
  plate.add(top);
  root.add(plate);

  // 부재 재질(강판 표면색)
  const partM = std(0x6f6a62, 0.8, 0.3);

  // ── 천장 크레인과 자석 ──
  const crane = overheadCrane(W, shed.railY);
  root.add(crane.bridge);
  crane.bridge.position.x = -20;
  const MAG_DROP = 2.0; // 훅에서 자석 아랫면까지
  part(crane.hook, boxG(0.3, 1.4, 0.3), FM.steel, 0, -0.7, 0, false);
  part(crane.hook, boxG(12, 0.35, 0.8), FM.crane, 0, -1.55, 0);
  for (const dx of [-4.5, -1.5, 1.5, 4.5]) part(crane.hook, new THREE.CylinderGeometry(0.55, 0.55, 0.3, 14), FM.dark, dx, -MAG_DROP + 0.15, 0);
  const SAFE = 9;

  // 팔레트와 스크랩 통
  const PALLET: P2 = [17, -10];
  const BIN: P2 = [17, 9];
  part(root, boxG(15, 0.5, 8), std(0x3d4148, 0.8, 0.4), PALLET[0], 0.25, PALLET[1]);
  const pallet = new THREE.Group();
  root.add(pallet);
  part(root, boxG(15.5, 0.3, 8.5), FM.dark, BIN[0], 0.15, BIN[1], false);
  for (const [dx, dz, w, d] of [
    [0, -4.2, 15.5, 0.3],
    [0, 4.2, 15.5, 0.3],
    [-7.6, 0, 0.3, 8.5],
    [7.6, 0, 0.3, 8.5],
  ])
    part(root, boxG(w, 2, d), std(0x4a5560, 0.8, 0.4), BIN[0] + dx, 1, BIN[1] + dz);
  let stacked = 0;

  // ── 곡가공 프레스(따로 도는 순환) ──
  const PRESS_X = 31;
  part(root, boxG(4, 1.0, 1.2), FM.dark, PRESS_X, 0.5, -3.2);
  part(root, boxG(4, 1.0, 1.2), FM.dark, PRESS_X, 0.5, 3.2);
  for (const z of [-6.5, 6.5]) part(root, boxG(1.4, 9, 1.4), FM.column, PRESS_X, 4.5, z);
  part(root, boxG(2.2, 1.6, 14.4), FM.column, PRESS_X, 9.2, 0);
  const ram = new THREE.Group();
  root.add(ram);
  part(ram, boxG(2.6, 0.9, 2.4), FM.crane, 0, 0.45, 0);
  part(ram, new THREE.CylinderGeometry(0.35, 0.35, 8, 10), FM.steel, 0, 4.9, 0, false);
  ram.position.set(PRESS_X, 5, 0);
  const bendGeo = new THREE.BoxGeometry(3, 0.3, 10, 1, 1, 30);
  const bendBase = Float32Array.from(bendGeo.attributes.position.array as Float32Array);
  const bendPlate = part(root, bendGeo, partM, PRESS_X, 1.15, 0);
  function setCurve(c: number) {
    const a = bendGeo.attributes.position.array as Float32Array;
    for (let i = 0; i < a.length; i += 3) a[i + 1] = bendBase[i + 1] + c * bendBase[i + 2] ** 2;
    bendGeo.attributes.position.needsUpdate = true;
    bendGeo.computeVertexNormals();
  }
  const PRESS_N = 6;
  let pressCount = 0;
  const press = sequence(() => {
    const steps: Step[] = [];
    for (let n = 0; n < PRESS_N; n++) {
      const c0 = (0.045 * n) / PRESS_N;
      const c1 = (0.045 * (n + 1)) / PRESS_N;
      steps.push(
        { dur: 1.6, label: '', enter: () => (pressCount = n + 1), apply: (k) => (ram.position.y = lerp(5, 1.3, inOut(k))) },
        { dur: 1.0, label: '', apply: (k) => setCurve(lerp(c0, c1, k)) },
        { dur: 1.6, label: '', apply: (k) => (ram.position.y = lerp(1.3, 5, inOut(k))) },
      );
    }
    steps.push(
      { dur: 2.5, label: '', apply: (k) => (bendPlate.position.y = 1.15 + k * 6) },
      {
        dur: 1.5,
        label: '',
        enter: () => {
          setCurve(0);
          pressCount = 0;
        },
        apply: (k) => (bendPlate.position.y = 7.15 - k * 6),
      },
    );
    return steps;
  });
  setCurve(0);

  // ── 주 순환 ──
  let path = buildPath(outlines, [0, 0]);
  let parts: THREE.Group | null = null;
  let last: P2 | null = null;
  const tmpV = new THREE.Vector3();
  const torchAt = (u: number, v: number) => {
    gantry.position.x = u - TORCH_DX;
    carriage.position.z = v;
  };
  const posAt = (t: number): { p: P2; cut: boolean } => {
    for (const s of path.segs)
      if (t <= s.t1) {
        const k = s.t1 > s.t0 ? (t - s.t0) / (s.t1 - s.t0) : 1;
        return { p: [lerp(s.a[0], s.b[0], k), lerp(s.a[1], s.b[1], k)], cut: s.cut };
      }
    const e = path.segs[path.segs.length - 1];
    return { p: e.b, cut: false };
  };
  const PARK: P2 = [-8, 0];
  let flameOn = false;

  function moveCrane(x0: number, z0: number, x1: number, z1: number, k: number) {
    crane.bridge.position.x = lerp(x0, x1, inOut(k));
    crane.trolley.position.z = lerp(z0, z1, inOut(k));
  }
  function hookMove(y0: number, y1: number, k: number) {
    crane.setHook(lerp(y0, y1, inOut(k)));
  }

  const main = sequence(() => {
    path = buildPath(outlines, PARK);
    let cx = crane.bridge.position.x;
    let cz = crane.trolley.position.z;
    const pick = TOP + MAG_DROP;
    const palletTop = () => 0.5 + stacked * (PT + 0.02);
    return [
      {
        dur: 6,
        label: '강판 반입 — 롤러 컨베이어로 절단대에 올림',
        enter: () => {
          root.add(plate);
          plate.position.set(-17, TABLE_Y, 0);
          plate.visible = true;
          cleanPlate();
          last = null;
        },
        apply: (k) => {
          plate.position.x = lerp(-17, 0, inOut(k));
          moveCrane(cx, cz, -20, 0, k);
          crane.setHook(SAFE);
        },
      },
      { dur: 1.5, label: '절단 준비 — 절단 프로그램 불러오기' },
      {
        dur: path.total,
        label: '절단 중 — 부재 모양을 따라 자름',
        apply: (k) => {
          const { p, cut } = posAt(k * path.total);
          torchAt(p[0], p[1]);
          if (cut && last) {
            g2.strokeStyle = '#17191c';
            g2.lineWidth = 3;
            g2.lineCap = 'round';
            g2.beginPath();
            g2.moveTo(...px(last));
            g2.lineTo(...px(p));
            g2.stroke();
            tex.needsUpdate = true;
          }
          last = p;
          flameOn = cut && k < 1;
        },
      },
      {
        dur: 1.5,
        label: '절단 끝',
        enter: () => (flameOn = false),
        apply: (k) => {
          const e = path.segs[path.segs.length - 1].b;
          torchAt(lerp(e[0], PARK[0], inOut(k)), lerp(e[1], PARK[1], inOut(k)));
        },
      },
      {
        dur: 4,
        label: '부재 옮기기 — 자석 크레인이 부재를 들어 올림',
        enter: () => {
          cx = crane.bridge.position.x;
          cz = crane.trolley.position.z;
        },
        apply: (k) => moveCrane(cx, cz, 0, 0, k),
      },
      { dur: 3, label: '부재 옮기기 — 자석 크레인이 부재를 들어 올림', apply: (k) => hookMove(SAFE, pick, k) },
      {
        dur: 1,
        label: '부재 옮기기 — 자석 크레인이 부재를 들어 올림',
        enter: () => {
          // 부재 자리를 뚫고(강판은 뼈대만 남음) 부재를 따로 만들어 자석에 붙인다
          g2.fillStyle = HOLE;
          for (const o of outlines) {
            g2.beginPath();
            o.forEach((q, i) => (i ? g2.lineTo(...px(q)) : g2.moveTo(...px(q))));
            g2.closePath();
            g2.fill();
          }
          tex.needsUpdate = true;
          parts = new THREE.Group();
          for (const o of outlines) parts.add(plateFromOutline(o, partM));
          parts.position.set(0, TABLE_Y, 0);
          root.add(parts);
          root.updateMatrixWorld(true);
          crane.hook.attach(parts);
        },
      },
      { dur: 3, label: '부재 옮기기 — 팔레트로', apply: (k) => hookMove(pick, SAFE, k) },
      { dur: 4, label: '부재 옮기기 — 팔레트로', apply: (k) => moveCrane(0, 0, PALLET[0], PALLET[1], k) },
      { dur: 3, label: '부재 옮기기 — 팔레트에 내려놓음', apply: (k) => hookMove(SAFE, palletTop() + PT + MAG_DROP, k) },
      {
        dur: 2,
        label: '부재 옮기기 — 팔레트에 내려놓음',
        enter: () => {
          root.updateMatrixWorld(true);
          if (parts) pallet.attach(parts);
          parts = null;
          stacked++;
        },
        apply: (k) => hookMove(palletTop() - (PT + 0.02) + PT + MAG_DROP, SAFE, k),
      },
      { dur: 4, label: '남은 강판(스크랩) 치우기', apply: (k) => moveCrane(PALLET[0], PALLET[1], 0, 0, k) },
      { dur: 3, label: '남은 강판(스크랩) 치우기', apply: (k) => hookMove(SAFE, pick, k) },
      {
        dur: 1,
        label: '남은 강판(스크랩) 치우기',
        enter: () => {
          root.updateMatrixWorld(true);
          crane.hook.attach(plate);
        },
      },
      { dur: 3, label: '남은 강판(스크랩) 치우기', apply: (k) => hookMove(pick, SAFE, k) },
      { dur: 4, label: '남은 강판(스크랩) 치우기', apply: (k) => moveCrane(0, 0, BIN[0], BIN[1], k) },
      { dur: 3, label: '남은 강판(스크랩) 치우기', apply: (k) => hookMove(SAFE, 2.2 + PT + MAG_DROP, k) },
      {
        dur: 2,
        label: '다음 강판 준비',
        enter: () => {
          plate.visible = false;
          // 팔레트가 다 차면 비운다(다음 공장으로 실려 간 것으로)
          if (stacked >= 5) {
            for (const c of [...pallet.children]) {
              pallet.remove(c);
              c.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
            }
            stacked = 0;
          }
        },
        apply: (k) => hookMove(2.2 + PT + MAG_DROP, SAFE, k),
      },
    ];
  });
  torchAt(PARK[0], PARK[1]);

  /** machineDt = 속도 배율을 곱한 시간, dt = 실제 시간(불꽃 물리용) */
  function update(machineDt: number, dt: number) {
    main.update(machineDt);
    press.update(machineDt);
    flame.visible = flameOn;
    if (flameOn) {
      flame.scale.setScalar(0.04 + Math.random() * 0.03);
      torchLight.intensity = 500 + Math.random() * 500;
      carriage.localToWorld(tmpV.copy(tip));
      root.worldToLocal(tmpV);
      fx.emit(tmpV, Math.ceil(dt * 260), 0.6);
    } else torchLight.intensity = 0;
    fx.update(dt);
  }

  function status() {
    const p = pressCount ? ` · 옆 프레스: 곡가공 ${pressCount}/${PRESS_N}번째 누름` : '';
    return `${main.label()}${p}`;
  }
  return { update, status };
}
