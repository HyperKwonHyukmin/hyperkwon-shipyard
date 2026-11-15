/**
 * P2 공용: 안이 들여다보이는 공장 건물과 천장 크레인, 단계 진행기.
 * - 건물은 도로 쪽 긴 벽을 비우고(열린 면), 지붕은 뒤쪽 절반만 덮어 위와 앞에서 안이 보이게 한다.
 * - 좌표는 건물 중심 바닥이 원점. x = 건물 길이, z = 폭, y = 위.
 */
import * as THREE from 'three';
import { shedWallTextures, concreteTexture, roofTexture } from '../textures';
import { mergeStatic } from '../merge';

export function std(color: number, roughness = 0.85, metalness = 0.1) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}
export const FM = {
  floor: std(0x4b4f55, 0.95),
  column: std(0x6c7682, 0.6, 0.4),
  wall: std(0x39414b, 0.9),
  roof: new THREE.MeshStandardMaterial({ color: 0x5b6470, roughness: 0.7, metalness: 0.3, side: THREE.DoubleSide }),
  crane: std(0xd9a21b, 0.55, 0.3),
  craneDark: std(0x8a6a1a, 0.6, 0.3),
  steel: std(0x3a3f46, 0.6, 0.6),
  dark: std(0x1c1f24, 0.9),
  lamp: new THREE.MeshStandardMaterial({ color: 0xfff1d0, emissive: 0xfff0d0, emissiveIntensity: 2.2 }),
};

/** 메시 하나 만들어 부모에 붙인다 */
export function part(
  parent: THREE.Object3D,
  geo: THREE.BufferGeometry,
  m: THREE.Material | THREE.Material[],
  x: number,
  y: number,
  z: number,
  shadow = true,
) {
  const mesh = new THREE.Mesh(geo, m);
  mesh.position.set(x, y, z);
  mesh.castShadow = shadow;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
export const boxG = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);

/** 골강판 벽 재질(위쪽 채광창 띠는 밤에 밝게). cols = 창 칸 수 */
function sidingMaterial(cols: number) {
  const t = shedWallTextures(cols);
  return new THREE.MeshStandardMaterial({
    map: t.map,
    emissive: 0xffffff,
    emissiveMap: t.emissive,
    emissiveIntensity: 0.9,
    roughness: 0.6,
    metalness: 0.35,
  });
}
let roofTex: THREE.Texture | null = null;
let floorTex: THREE.Texture | null = null;

export interface Shed {
  group: THREE.Group;
  /** 천장 크레인 레일 높이 */
  railY: number;
  /** 건물 점광원(공장마다 자리를 옮길 수 있게) */
  lights: THREE.PointLight[];
}

/**
 * 열린 공장 건물. open = 비워 둘 긴 벽 쪽(+1 이면 +z 면).
 * 안쪽 조명은 점광원 2개(lights = 1 이면 가운데 1개). 개수를 늘리면 장면 전체 셰이더가 무거워진다.
 */
export function buildShed(l: number, w: number, h: number, open: 1 | -1, lights: 1 | 2 = 2, crane = true): Shed {
  const g = new THREE.Group();
  const railY = h - 5;
  const back = -open * (w / 2);

  // 바닥: 콘크리트 슬래브(공장마다 크기에 맞춰 반복), 지붕: 골강판
  floorTex ??= concreteTexture();
  const ft = floorTex.clone();
  ft.repeat.set(l / 20, w / 20);
  part(g, boxG(l + 2, 0.2, w + 2), new THREE.MeshStandardMaterial({ map: ft, color: 0xa6a6a2, roughness: 0.9 }), 0, 0.1, 0, false);
  if (!roofTex) {
    roofTex = roofTexture();
    roofTex.repeat.set(1, 6);
    FM.roof.map = roofTex;
    FM.roof.color.setHex(0xb9c2cc);
  }

  // 기둥: 뒤쪽 벽을 따라 10 m 간격. 열린 면에는 양 끝 모서리에만 둔다
  // (2026-11-13 사용자: "철골 구조물이 화면을 가린다" — 열린 면의 기둥과 지붕 트러스를 없앰)
  for (let x = -l / 2; x <= l / 2 + 0.01; x += 10) part(g, boxG(0.9, h, 0.9), FM.column, x, h / 2, back);
  for (const sx of [-1, 1]) part(g, boxG(0.9, h, 0.9), FM.column, (sx * l) / 2, h / 2, -back);
  // 천장 크레인 레일(크레인이 있는 건물만). 열린 면 쪽은 가늘게
  if (crane) {
    part(g, boxG(l, 0.8, 0.6), FM.steel, 0, railY - 0.4, back + open * 0.9, false);
    part(g, boxG(l, 0.35, 0.35), FM.steel, 0, railY - 0.18, -back - open * 0.9, false);
  }

  // 뒤쪽 긴 벽과 양 끝 벽(창 불빛). 열린 면 쪽 끝 벽은 아래 절반만 둬서 옆에서도 보이게 한다
  const wallMat = sidingMaterial(Math.max(2, Math.round(l / 6)));
  const endMat = sidingMaterial(Math.max(2, Math.round(w / 6)));
  part(g, boxG(l, h, 0.5), [wallMat, wallMat, FM.roof, FM.roof, wallMat, wallMat], 0, h / 2, back, false);
  for (const sx of [-1, 1]) part(g, boxG(0.5, h, w), [endMat, endMat, FM.roof, FM.roof, endMat, endMat], (sx * l) / 2, h / 2, 0, false);

  // 뒤쪽 절반만 덮는 지붕판과 그 아래 서까래(지붕이 있는 쪽에만)
  for (let x = -l / 2; x <= l / 2 + 0.01; x += 10) part(g, boxG(0.5, 0.7, w / 2), FM.column, x, h + 0.35, back / 2, false);
  const roof = part(g, boxG(l + 1, 0.3, w / 2 + 0.5), FM.roof, 0, h + 1.2, back / 2 - (open * 0.25), false);
  roof.rotation.x = open * 0.1;

  // 천장 등(불빛만)과 점광원 2개
  for (let x = -l / 2 + 10; x < l / 2; x += 20) part(g, boxG(3, 0.3, 1.2), FM.lamp, x, h - 0.6, back / 2, false);
  mergeStatic(g); // 기둥·트러스·레일·등을 재질별로 합침(건물 하나에 수십 번 → 몇 번)
  const lamps = (lights === 2 ? [-1, 1] : [0]).map((sx) => {
    const p = new THREE.PointLight(0xfff0d8, lights === 2 ? 2200 : 3000, 75, 2);
    p.position.set((sx * l) / 4, h - 3, 0);
    g.add(p);
    return p;
  });
  return { group: g, railY, lights: lamps };
}

/** 천장 크레인: 거더(x 로 이동) + 트롤리(z 로 이동) + 훅(y). 훅 아래에 매달 물건은 hook 에 붙인다 */
export function overheadCrane(w: number, railY: number) {
  const bridge = new THREE.Group();
  for (const dx of [-1.1, 1.1]) part(bridge, boxG(1.2, 1.4, w - 1.6), FM.crane, dx, railY + 0.7, 0);
  for (const z of [-(w / 2 - 1), w / 2 - 1]) part(bridge, boxG(4.5, 1.1, 1.4), FM.craneDark, 0, railY + 0.55, z);
  const trolley = new THREE.Group();
  trolley.position.y = railY + 1.4;
  bridge.add(trolley);
  part(trolley, boxG(3.4, 1.1, 2.6), FM.craneDark, 0, 0.55, 0);
  const hook = new THREE.Group();
  trolley.add(hook);
  const cables = [-0.6, 0.6].map((dx) => {
    const c = part(trolley, new THREE.CylinderGeometry(0.06, 0.06, 1, 6), FM.steel, dx, 0, 0, false);
    return c;
  });
  part(hook, boxG(1.4, 0.8, 0.8), FM.crane, 0, 0.4, 0);
  /** 훅 아랫면(물건을 다는 점)을 바닥 기준 높이 y 로 */
  function setHook(y: number) {
    const local = Math.min(-1.5, y - trolley.position.y);
    hook.position.y = local;
    for (const c of cables) {
      c.position.y = local / 2;
      c.scale.y = -local;
    }
  }
  const getHook = () => trolley.position.y + hook.position.y;
  setHook(railY - 6);
  return { bridge, trolley, hook, setHook, getHook };
}

export type Crane = ReturnType<typeof overheadCrane>;

/** 크레인 단계 만들기: 옮기기(x, z), 훅 높이, 잡기(훅에 붙임), 놓기(다른 부모에 붙임). 시작 위치는 단계가 시작될 때 읽는다 */
export function craneSteps(root: THREE.Object3D, crane: Crane) {
  const craneTo = (x: number, z: number, dur: number, label: string): Step => {
    let x0 = 0;
    let z0 = 0;
    return {
      dur,
      label,
      enter: () => {
        x0 = crane.bridge.position.x;
        z0 = crane.trolley.position.z;
      },
      apply: (k) => {
        crane.bridge.position.x = lerp(x0, x, inOut(k));
        crane.trolley.position.z = lerp(z0, z, inOut(k));
      },
    };
  };
  const hookTo = (y: () => number, dur: number, label: string): Step => {
    let y0 = 0;
    return { dur, label, enter: () => (y0 = crane.getHook()), apply: (k) => crane.setHook(lerp(y0, y(), inOut(k))) };
  };
  const grab = (o: () => THREE.Object3D, label: string): Step => ({
    dur: 0.8,
    label,
    enter: () => {
      root.updateMatrixWorld(true);
      crane.hook.attach(o());
    },
  });
  const release = (o: () => THREE.Object3D, to: () => THREE.Object3D, label: string): Step => ({
    dur: 0.8,
    label,
    enter: () => {
      root.updateMatrixWorld(true);
      to().attach(o());
    },
  });
  return { craneTo, hookTo, grab, release };
}

/** 시간 순서대로 이어지는 단계들. 끝나면 onEnd(다음 순환 준비) */
export interface Step {
  dur: number;
  label: string;
  apply?: (k: number) => void;
  /** 단계가 시작되는 순간 한 번 */
  enter?: () => void;
}
export function sequence(build: () => Step[]) {
  let steps = build();
  let i = 0;
  let e = 0;
  let entered = false;
  function update(dt: number) {
    let left = dt;
    // 빠르게 돌릴 때(×16) 한 프레임에 여러 단계를 건너뛸 수 있게
    for (let guard = 0; guard < 20 && left > 0; guard++) {
      const s = steps[i];
      if (!entered) {
        s.enter?.();
        entered = true;
      }
      const room = s.dur - e;
      const used = Math.min(room, left);
      e += used;
      left -= used;
      s.apply?.(Math.min(1, e / s.dur));
      if (e >= s.dur) {
        i++;
        e = 0;
        entered = false;
        if (i >= steps.length) {
          steps = build();
          i = 0;
        }
      }
    }
  }
  return { update, label: () => steps[i].label };
}

export const lerp = THREE.MathUtils.lerp;
export const inOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** 가운데가 밝고 바깥으로 흐려지는 원(불꽃 번짐) */
export function glowTexture(inner: string, outer: string) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.2, inner);
  grad.addColorStop(1, outer);
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** 작은 불꽃 입자 묶음(가산 혼합). emit(p, n) 으로 뿜고 update(dt) 로 떨어뜨린다 */
export function sparks(parent: THREE.Object3D, pool: number, hot: [number, number, number]) {
  const pos = new Float32Array(pool * 3).fill(-9999);
  const col = new Float32Array(pool * 3);
  const vel = new Float32Array(pool * 3);
  const age = new Float32Array(pool);
  const life = new Float32Array(pool);
  const geo = new THREE.BufferGeometry();
  const pa = new THREE.BufferAttribute(pos, 3);
  const ca = new THREE.BufferAttribute(col, 3);
  geo.setAttribute('position', pa);
  geo.setAttribute('color', ca);
  const pts = new THREE.Points(
    geo,
    new THREE.PointsMaterial({
      size: 2.5,
      sizeAttenuation: false,
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  pts.frustumCulled = false;
  parent.add(pts);
  let next = 0;
  let live = 0;
  const r = (a: number, b: number) => a + Math.random() * (b - a);
  function emit(p: THREE.Vector3, n: number, up = 1) {
    for (let k = 0; k < n; k++) {
      const i = next;
      next = (next + 1) % pool;
      pos.set([p.x, p.y, p.z], i * 3);
      const a = Math.random() * Math.PI * 2;
      const s = r(0.5, 4);
      vel.set([Math.cos(a) * s, r(-1, 3) * up, Math.sin(a) * s], i * 3);
      age[i] = 0;
      life[i] = r(0.3, 0.9);
    }
    live = pool;
  }
  function update(dt: number) {
    if (live <= 0) return;
    let any = 0;
    for (let i = 0; i < pool; i++) {
      if (life[i] <= 0) continue;
      age[i] += dt;
      const k = age[i] / life[i];
      if (k >= 1) {
        life[i] = 0;
        pos[i * 3 + 1] = -9999;
        col.set([0, 0, 0], i * 3);
        continue;
      }
      any++;
      vel[i * 3 + 1] -= 9.8 * dt;
      pos[i * 3] += vel[i * 3] * dt;
      pos[i * 3 + 1] = Math.max(0.15, pos[i * 3 + 1] + vel[i * 3 + 1] * dt);
      pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      const f = 1 - k;
      col.set([hot[0] * f, hot[1] * f * (1 - 0.5 * k), hot[2] * f * (1 - k)], i * 3);
    }
    pa.needsUpdate = true;
    ca.needsUpdate = true;
    if (!any) live = 0;
  }
  return { emit, update };
}
