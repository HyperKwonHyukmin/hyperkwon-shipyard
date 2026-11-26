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

export type TimeOfDay = 'day' | 'dusk' | 'night';
/** 낮 → 노을 → 밤 순서로 돈다 */
const NEXT: Record<TimeOfDay, TimeOfDay> = { day: 'dusk', dusk: 'night', night: 'day' };
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

  // 노을(2026-11-22 오프닝 장면): 낮은 주황빛 해 + 켜지기 시작한 투광등. 하늘은 위 남색 → 수평선 주황
  const duskBg = gradientTexture([
    [0, '#27325e'],
    [0.45, '#6a5a86'],
    [0.72, '#d98a6a'],
    [0.9, '#f3b46f'],
    [1, '#f6cf9a'],
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
  /**
   * 하늘빛 반사(환경 맵)를 끈 품질 단계에서는 그만큼 하늘빛(반구광)을 올려 준다.
   * 2026-11-22: 반사를 끄면 낮 장면이 해 질 녘처럼 어둡고 누렇게 보였다(느린 PC 에서만 나타나 그동안 못 봄).
   */
  let noReflection = false;
  const LOST: Record<TimeOfDay, number> = { day: 1.8, dusk: 1.45, night: 1.05 };
  const HEMI: Record<TimeOfDay, number> = { day: 1.15, dusk: 0.75, night: 1.3 };
  const hemiNow = () => HEMI[mode] * (noReflection ? LOST[mode] : 1);
  /** save = false 면 브라우저에 남기지 않는다(오프닝 장면이 잠깐 노을로 바꿀 때) */
  function apply(t: TimeOfDay, save = true) {
    mode = t;
    const day = t === 'day';
    const dusk = t === 'dusk';
    const fog = o.scene.fog as THREE.FogExp2;
    o.scene.background = day ? dayBg : dusk ? duskBg : night.bg;
    // 2026-11-15 W5 디오라마풍: 낮 안개를 조금 짙게(먼 곳이 흐려져 깊이감), 하늘빛(반구광)을 줄이고 해를 따뜻하게·낮게·세게
    // → 그림자가 길고 진해져 형태가 또렷해진다. 하늘빛 2.0 은 그림자 쪽까지 밝혀 납작한 '장난감' 느낌의 주원인이었다
    fog.color.setHex(day ? 0xc9d5e0 : dusk ? 0xcf9f8a : night.fog);
    fog.density = day ? 0.00115 : dusk ? 0.0013 : night.density;
    o.renderer.toneMappingExposure = day ? 1.05 : dusk ? 1.15 : night.exposure;
    o.sea.color.setHex(day ? 0x2d5f86 : dusk ? 0x3a4f70 : night.sea);
    o.hemi.color.setHex(day ? 0xc9dbf0 : dusk ? 0x8f9ad0 : 0x5a6f9c);
    o.hemi.groundColor.setHex(day ? 0x5a5247 : dusk ? 0x4a3a30 : 0x1e1a16);
    o.hemi.intensity = hemiNow();
    o.moon.color.setHex(day ? 0xffe4c0 : dusk ? 0xff9450 : 0x9fb4e0);
    o.moon.intensity = day ? 3.4 : dusk ? 2.7 : 0.9;
    // 낮 해 고도 약 35°, 노을은 약 13°(그림자가 길게 눕는다)
    if (dusk) o.moon.position.set(-420, 115, 260);
    else o.moon.position.set(day ? -300 : 300, day ? 260 : 400, day ? 230 : -200);
    for (const e of emissive) e.m.emissiveIntensity = day ? e.base * 0.15 : dusk ? e.base * 0.9 : e.base;
    // 낮에는 낮용 창 그림을 쓰고 발광은 끈다(밝은 벽이 빛나 보이지 않게)
    for (const w of windows) {
      w.m.map = day ? w.day : w.night;
      if (day) w.m.emissiveIntensity = 0;
    }
    for (const x of lights) x.l.intensity = day ? x.base * x.day : dusk ? x.base * (x.day ? 0.8 : 0.6) : x.base;
    // 별처럼 깜깜해야 어울리는 것(userData.deepNight)은 노을에 숨긴다
    for (const n of o.nightOnly) n.visible = !day && !(dusk && n.userData.deepNight);
    o.setFog(t === 'night');
    document.documentElement.dataset.time = t;
    if (save)
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
  apply(q.has('night') ? 'night' : q.has('dusk') ? 'dusk' : q.has('day') ? 'day' : saved === 'night' || saved === 'dusk' ? saved : 'day', false);

  return {
    apply,
    toggle: () => apply(NEXT[mode]),
    /** 품질 단계가 하늘빛 반사를 껐는지 알려 준다(main.ts 의 applyQuality) */
    setNoReflection(v: boolean) {
      noReflection = v;
      o.hemi.intensity = hemiNow();
    },
    get mode() { return mode; },
  };
}
