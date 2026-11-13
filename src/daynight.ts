/**
 * 낮 / 밤 전환(기본은 낮, 2026-11-13 사용자 요청 "너무 어둡다").
 * 장면을 한 번 훑어 밤 기준값(발광 세기, 조명 세기)을 기억해 두고, 낮에는 줄이거나 끈다.
 * - 하늘, 안개 색과 짙기, 화면 노출, 바다 색
 * - 반구광(하늘빛)과 달빛 → 해
 * - 투광등(SpotLight)은 낮에 끔, 점광원은 줄임(공장 안 조명은 낮에도 약하게 켜 둠)
 * - 발광 재질(등)은 낮에 흐리게, 창 불빛 그림은 낮용(밝은 벽 + 어두운 유리)으로 바꿈
 * - 밤에만 보일 것(별, 도시 불빛, 빛줄기, 땅 안개)은 낮에 숨김
 * 매 프레임 세기를 새로 정하는 조명(용접, 토치)은 그쪽 값이 그대로 쓰인다.
 */
import * as THREE from 'three';

export type TimeOfDay = 'day' | 'night';
const STORE_KEY = 'ulsan-story:time';

function gradientTexture(stops: [number, string][]) {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, 256);
  for (const [k, col] of stops) grad.addColorStop(k, col);
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

interface Options {
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer;
  hemi: THREE.HemisphereLight;
  moon: THREE.DirectionalLight;
  sea: THREE.MeshStandardMaterial;
  /** 밤에만 보일 것 */
  nightOnly: THREE.Object3D[];
  /** 땅 안개 켜고 끄기 */
  setFog: (visible: boolean) => void;
}

export function createDayNight(o: Options) {
  const night = {
    bg: o.scene.background as THREE.Texture,
    fog: (o.scene.fog as THREE.FogExp2).color.getHex(),
    density: (o.scene.fog as THREE.FogExp2).density,
    exposure: o.renderer.toneMappingExposure,
    sea: o.sea.color.getHex(),
  };
  const dayBg = gradientTexture([
    [0, '#5d93c8'],
    [0.55, '#9cc2e3'],
    [0.8, '#cfe0ee'],
    [1, '#e4ebf0'],
  ]);

  /** 창 불빛 그림(어두운 벽 + 밝은 창)을 낮용(밝은 회색 벽 + 어두운 유리창)으로 다시 그린다 */
  function dayWindows(tex: THREE.Texture) {
    const src = tex.image as HTMLCanvasElement;
    const c = document.createElement('canvas');
    c.width = src.width;
    c.height = src.height;
    const g = c.getContext('2d')!;
    g.drawImage(src, 0, 0);
    const img = g.getImageData(0, 0, c.width, c.height);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const lum = (d[i] + d[i + 1] + d[i + 2]) / 765;
      const [r, gg, b] = lum < 0.25 ? [168, 176, 185] : [62, 82, 102];
      d[i] = r;
      d[i + 1] = gg;
      d[i + 2] = b;
    }
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  // 밤 기준값 기억(처음 한 번)
  const windows: { m: THREE.MeshStandardMaterial; night: THREE.Texture; day: THREE.Texture }[] = [];
  const emissive: { m: THREE.MeshStandardMaterial; base: number }[] = [];
  const lights: { l: THREE.Light; base: number; day: number }[] = [];
  const seen = new Set<THREE.Material>();
  o.scene.traverse((obj) => {
    if (obj instanceof THREE.SpotLight) lights.push({ l: obj, base: obj.intensity, day: 0 });
    else if (obj instanceof THREE.PointLight) lights.push({ l: obj, base: obj.intensity, day: 0.35 });
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (seen.has(m) || !(m instanceof THREE.MeshStandardMaterial)) continue;
      seen.add(m);
      if (m.emissive.getHex() !== 0 && m.emissiveIntensity > 0) emissive.push({ m, base: m.emissiveIntensity });
      if (m.map && m.map === m.emissiveMap && m.map.image instanceof HTMLCanvasElement)
        windows.push({ m, night: m.map, day: dayWindows(m.map) });
    }
  });

  let mode: TimeOfDay = 'day';
  function apply(t: TimeOfDay) {
    mode = t;
    const day = t === 'day';
    const fog = o.scene.fog as THREE.FogExp2;
    o.scene.background = day ? dayBg : night.bg;
    fog.color.setHex(day ? 0xc4d4e2 : night.fog);
    fog.density = day ? 0.0009 : night.density;
    o.renderer.toneMappingExposure = day ? 1.0 : night.exposure;
    o.sea.color.setHex(day ? 0x2d5f86 : night.sea);
    o.hemi.color.setHex(day ? 0xdce9f7 : 0x5a6f9c);
    o.hemi.groundColor.setHex(day ? 0x6f6656 : 0x1e1a16);
    o.hemi.intensity = day ? 2.0 : 1.3;
    o.moon.color.setHex(day ? 0xfff2de : 0x9fb4e0);
    o.moon.intensity = day ? 2.6 : 0.9;
    o.moon.position.set(day ? -250 : 300, 400, day ? 180 : -200);
    for (const e of emissive) e.m.emissiveIntensity = day ? e.base * 0.15 : e.base;
    // 낮에는 낮용 창 그림을 쓰고 발광은 끈다(밝은 벽이 빛나 보이지 않게)
    for (const w of windows) {
      w.m.map = day ? w.day : w.night;
      if (day) w.m.emissiveIntensity = 0;
    }
    for (const x of lights) x.l.intensity = day ? x.base * x.day : x.base;
    for (const n of o.nightOnly) n.visible = !day;
    o.setFog(!day);
    document.documentElement.dataset.time = t;
    try {
      localStorage.setItem(STORE_KEY, t);
    } catch {
      /* 저장이 막혀도 전환은 된다 */
    }
  }

  // 처음 값: 주소 ?night / ?day 가 먼저, 그다음 지난번 선택, 없으면 낮
  const q = new URLSearchParams(location.search);
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(STORE_KEY);
  } catch {
    /* 무시 */
  }
  apply(q.has('night') ? 'night' : q.has('day') ? 'day' : saved === 'night' ? 'night' : 'day');

  return { apply, toggle: () => apply(mode === 'day' ? 'night' : 'day'), get mode() { return mode; } };
}
