/**
 * 사람 한 명의 모습(2026-11-13). 조작(walk.ts)과 떼어 둔다 — 나중에 다른 접속자도 이 모듈로 그린다.
 * 모델: Kenney "Mini Characters"의 작업자(CC0, public/models/LICENSE-kenney.txt). 뼈 7개, 삼각형 약 900개, 동작 32개.
 * - 모델 파일은 한 번만 받아서 사람마다 복제한다(뼈대는 따로, 그림 한 장과 재질은 같이).
 * - 겉모습(look)은 색상표(colormap.png)의 칸을 바꿔 끼워서 만든다: 피부색 4가지, 안전모 색.
 *   모델의 색이 전부 색상표 한 장의 칸에서 나오므로, 꼭짓점의 그림 좌표(UV)만 다른 칸으로 옮기면 된다.
 * - 상태(state)를 바꾸면 동작이 부드럽게 넘어간다.
 * 앞 = +x(프로젝트 약속). 모델 원본은 +z 가 앞이라 안에서 돌려 둔다.
 */
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

export type AvatarState = 'idle' | 'walk' | 'run' | 'ride' | 'greet' | 'talk';
const CLIP: Record<AvatarState, string> = {
  idle: 'idle',
  walk: 'walk',
  run: 'sprint',
  ride: 'drive',
  greet: 'emote-yes',
  talk: 'interact-right',
};

export interface Look {
  /** 피부색 칸: 0 구릿빛, 1 어두운 갈색, 2 밝은 살구색(기본), 3 아주 밝은 색 */
  skin?: 0 | 1 | 2 | 3;
  helmet?: 'yellow' | 'white' | 'orange' | 'blue';
}

/** 색상표는 512 px, 한 칸이 64 px(= 0.125). 세로는 4줄(0.25 씩). 좌표는 [u 시작, v 시작] */
const CELL = 0.125;
const SKIN_ROW = 0.5; // 셋째 줄
const HELMET_FROM: [number, number] = [0, 0.75]; // 작업자 안전모의 원래 색(넷째 줄 첫 칸, 누런 금색)
const HELMET_TO: Record<NonNullable<Look['helmet']>, [number, number] | null> = {
  yellow: [0.625, 0.5],
  white: [0.875, 0.75],
  orange: [0.75, 0.5],
  blue: [0, 0.25],
};
const HEIGHT = 2.7; // 선 키(m). 넓은 야드에서 보이게 실제보다 크다

let base: Promise<GLTF> | null = null;
function loadBase() {
  base ??= new GLTFLoader().loadAsync('models/character-worker.glb');
  return base;
}

/** 겉모습에 맞게 그림 좌표를 옮긴 기하(같은 겉모습끼리는 같이 쓴다) */
const geoCache = new Map<string, THREE.BufferGeometry>();
function recolor(src: THREE.BufferGeometry, look: Required<Look>) {
  const key = `${src.uuid}|${look.skin}|${look.helmet}`;
  let g = geoCache.get(key);
  if (g) return g;
  g = src.clone();
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const helmet = HELMET_TO[look.helmet];
  for (let i = 0; i < uv.count; i++) {
    const u = uv.getX(i);
    const v = uv.getY(i);
    if (v >= SKIN_ROW && v < SKIN_ROW + 0.25 && u < 0.5) {
      // 피부색 4칸 가운데 어느 칸이든 고른 칸으로(칸 안에서의 위치는 지켜 명암이 그대로)
      uv.setX(i, (u % CELL) + look.skin * CELL);
    } else if (helmet && u >= HELMET_FROM[0] && u < HELMET_FROM[0] + CELL && v >= HELMET_FROM[1] && v < HELMET_FROM[1] + 0.25) {
      uv.setXY(i, u - HELMET_FROM[0] + helmet[0], v - HELMET_FROM[1] + helmet[1]);
    }
  }
  uv.needsUpdate = true;
  geoCache.set(key, g);
  return g;
}

export function createAvatar(look: Look = {}) {
  const want: Required<Look> = { skin: look.skin ?? 2, helmet: look.helmet ?? 'yellow' };
  const group = new THREE.Group();
  let mixer: THREE.AnimationMixer | null = null;
  const actions = new Map<string, THREE.AnimationAction>();
  let state: AvatarState = 'idle';
  let current: THREE.AnimationAction | null = null;

  function play(next: AvatarState, fade = 0.18) {
    const a = actions.get(CLIP[next]);
    if (!a || a === current) return;
    a.reset().fadeIn(fade).play();
    current?.fadeOut(fade);
    current = a;
  }

  void loadBase().then((gltf) => {
    const model = cloneSkinned(gltf.scene);
    const box = new THREE.Box3().setFromObject(model);
    const k = HEIGHT / (box.max.y - box.min.y);
    model.scale.setScalar(k);
    model.position.y = -box.min.y * k;
    model.rotation.y = Math.PI / 2; // 모델의 앞(+z)을 +x 로
    model.traverse((o) => {
      const m = o as THREE.SkinnedMesh;
      if (!m.isMesh) return;
      m.geometry = recolor(m.geometry, want);
      m.castShadow = true;
      m.frustumCulled = false; // 뼈로 움직이는 메시는 처음 자세의 범위로 걸러져 사라질 수 있다
    });
    group.add(model);
    mixer = new THREE.AnimationMixer(model);
    for (const clip of gltf.animations) actions.set(clip.name, mixer.clipAction(clip));
    play(state, 0);
  });

  return {
    group,
    /** 동작 바꾸기 */
    set(next: AvatarState) {
      if (next === state) return;
      state = next;
      play(next);
    },
    get state() {
      return state;
    },
    update(dt: number) {
      mixer?.update(dt);
    },
  };
}

export type Avatar = ReturnType<typeof createAvatar>;
