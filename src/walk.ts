/**
 * 걷기 모드(2026-11-13 사용자: "주인공이 조선소 야드를 둘러보는 컨셉"). 컨셉은 "신입 사원의 야드 견학 첫날".
 * - 안전모를 쓴 주인공을 카메라가 뒤에서 따라간다. 화면을 끌면 둘러보고, 휠로 멀고 가깝게.
 * - WASD·방향키로 걷고 Shift 로 달린다. B 로 자전거를 탄다(야드가 600 m 라 걸으면 멀다. 실제 야드에서도 자전거를 탄다).
 * - 바닥을 누르면 그곳으로 간다(휴대폰에서는 이것으로 이동).
 * - 장소 앞에는 선배가 서 있다. 가까이 가면 그 장소의 설명 패널이 열리고 장면이 움직인다.
 *   E 를 누르면 그 장소를 위에서 본다(걷기를 잠시 멈춤). 바다 장소(진수·안벽·시운전·인도)는 도크 끝 전망대에서 E.
 * - 건물 벽, 적치 블록, 도크 구덩이, 바다는 지나갈 수 없다. 공장 안 설비는 아직 그냥 지나간다.
 * 선배 대화, 견학 수첩, 퀴즈는 다음 단계.
 */
import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Station } from './content/stations';
import { doorOf, FOOTPRINT, SHEDS } from './layout';
import { createAvatar, type Avatar } from './avatar';

type Box = [number, number, number, number]; // x0, x1, z0, z1

const SPEED = { walk: 6, run: 12, bike: 24 };
const RADIUS = 0.9;
const NEAR = 42; // 이 거리 안에 들어오면 그 장소를 고른다
const TALK = 12; // 이 거리 안이면 'E' 안내
const SCALE = 1.35; // 자전거 크기(사람 모델의 키 2.7 m 에 맞춤)
const HEAD = 3.2; // 카메라가 바라보는 높이(머리 조금 위)

/** 바다 장소를 보는 전망대(도크 바다 쪽 끝 안벽 위)와 도크 옆 자리 */
const VIEWPOINT: Record<string, [number, number]> = {
  dock: [-122, 40],
  launch: [104, 42],
  trial: [104, 66],
  quay: [104, 112],
  delivery: [104, -112],
};

function std(color: number, roughness = 0.7) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.05 });
}

/** 두 점 사이 둥근 관 */
function tube(parent: THREE.Object3D, a: [number, number, number], b: [number, number, number], r: number, m: THREE.Material) {
  const va = new THREE.Vector3(...a);
  const vb = new THREE.Vector3(...b);
  const d = new THREE.Vector3().subVectors(vb, va);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), 8), m);
  mesh.position.copy(va).addScaledVector(d, 0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

/** 자전거: 바퀴(타이어·림·살), 다이아몬드 프레임, 핸들, 안장, 앞 바구니 */
function buildBike() {
  const g = new THREE.Group();
  const frame = new THREE.MeshStandardMaterial({ color: 0x1f6fb5, roughness: 0.35, metalness: 0.5 });
  const tire = std(0x1b1d21, 0.9);
  const metal = new THREE.MeshStandardMaterial({ color: 0xc9cdd2, roughness: 0.3, metalness: 0.8 });
  const wheels = [-0.72, 0.72].map((x) => {
    const w = new THREE.Group();
    w.position.set(x, 0.46, 0);
    const t = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.055, 8, 24), tire);
    t.castShadow = true;
    w.add(t, new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.018, 6, 24), metal));
    for (let i = 0; i < 4; i++) {
      const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.7, 4), metal);
      spoke.rotation.z = (i * Math.PI) / 4;
      w.add(spoke);
    }
    g.add(w);
    return w;
  });
  const seat: [number, number, number] = [-0.3, 1.02, 0];
  const crank: [number, number, number] = [-0.08, 0.5, 0];
  const headTop: [number, number, number] = [0.5, 1.08, 0];
  tube(g, [-0.72, 0.46, 0], crank, 0.03, frame);
  tube(g, [-0.72, 0.46, 0], seat, 0.025, frame);
  tube(g, crank, seat, 0.032, frame);
  tube(g, crank, [0.48, 0.95, 0], 0.034, frame);
  tube(g, seat, headTop, 0.03, frame);
  tube(g, headTop, [0.72, 0.46, 0], 0.03, frame);
  tube(g, headTop, [0.46, 1.26, 0], 0.025, metal);
  tube(g, [0.46, 1.26, -0.3], [0.46, 1.26, 0.3], 0.022, metal); // 핸들
  for (const z of [-0.3, 0.3]) tube(g, [0.46, 1.26, z], [0.4, 1.26, z * 1.15], 0.03, tire);
  const saddle = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), tire);
  saddle.scale.set(1.5, 0.45, 0.85);
  saddle.position.set(-0.32, 1.07, 0);
  g.add(saddle);
  const basket = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.22, 0.4), metal);
  basket.position.set(0.86, 1.0, 0);
  g.add(basket);
  g.scale.setScalar(SCALE);
  return { g, wheels };
}

interface Options {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  canvas: HTMLCanvasElement;
  stations: Station[];
  /** 적치 블록 등 추가로 막힌 자리 */
  obstacles: Box[];
  /** 가까운 장소가 바뀌었을 때(설명 패널을 그 장소로) */
  onNear: (index: number) => void;
  /** E: 그 장소를 위에서 보기(걷기를 멈춤) */
  onLook: (index: number) => void;
  /** 움직이는 장애물(트랜스포터): 주인공이 밀려난다 */
  dynamic?: () => { x: number; z: number; hx: number; hz: number }[];
  /** 안내 글과 E 버튼을 그릴 곳 */
  hud: HTMLElement;
}

export function createWalk(o: Options) {
  const { camera, controls, stations } = o;
  const player = new THREE.Group();
  player.visible = false;
  o.scene.add(player);
  const me = createAvatar({ helmet: 'yellow' });
  player.add(me.group);
  const bike = buildBike();
  bike.g.visible = false;
  player.add(bike.g);

  // ── 장소 앞 자리: 선배(흰 안전모)와 바닥 표시 ──
  const seniors: Avatar[] = [];
  const spots = stations.map((s) => {
    const v = VIEWPOINT[s.id];
    const [x, z] = v ?? doorOf(s.at).front;
    return { x, z };
  });
  {
    const marks = new THREE.Group();
    const ring = new THREE.RingGeometry(1.6, 2.1, 28);
    ring.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x00ad1d, transparent: true, opacity: 0.85, depthWrite: false });
    spots.forEach((p, i) => {
      const senior = createAvatar({ helmet: 'white', skin: i % 3 === 1 ? 3 : 2 });
      senior.group.position.set(p.x + 1.4, 0, p.z);
      // 장소 쪽에서 길 쪽을 본다(전망대의 선배는 바다 쪽을 본다)
      const s = stations[i];
      senior.group.rotation.y = Math.atan2(-(p.z - s.at[2]), p.x - s.at[0]) + (VIEWPOINT[s.id] ? Math.PI : 0);
      marks.add(senior.group);
      seniors.push(senior);
      const r = new THREE.Mesh(ring, ringMat);
      r.position.set(p.x, 0.14, p.z);
      marks.add(r);
    });
    o.scene.add(marks);
  }

  // ── 막힌 자리 ──
  const boxes: Box[] = [...o.obstacles];
  for (const s of stations) {
    const sh = SHEDS[s.id];
    if (sh) {
      const [x, , z] = s.at;
      const back = z - sh.open * (sh.w / 2);
      boxes.push([x - sh.l / 2, x + sh.l / 2, back - 0.6, back + 0.6]); // 뒤 벽
      for (const sx of [-1, 1]) boxes.push([x + (sx * sh.l) / 2 - 0.6, x + (sx * sh.l) / 2 + 0.6, z - sh.w / 2, z + sh.w / 2]); // 끝 벽
    }
    if (s.id === 'design') {
      boxes.push([s.at[0] - 23, s.at[0] + 23, s.at[2] - 14, s.at[2] + 14]); // 사무동
      boxes.push([s.at[0] - 34.5, s.at[0] + 34.5, 24, 42]); // 수조
    }
    if (s.id === 'pe' && FOOTPRINT.pe) continue;
  }
  boxes.push([-110, 118, -24.5, 24.5]); // 도크 구덩이
  // 인양 학습장 크레인 다리 4개와 블록(main.ts 의 liftLab 자리 −30, 80), 정문 기둥과 경비실
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) boxes.push([-30 + sx * 5 - 0.8, -30 + sx * 5 + 0.8, 80 + sz * 16 - 0.8, 80 + sz * 16 + 0.8]);
  boxes.push([-38.5, -21.5, 73.5, 86.5]);
  for (const sz of [-1, 1]) boxes.push([-702, -698, sz * 24 - 2, sz * 24 + 2]);
  boxes.push([-694.5, -689.5, 23, 27]);
  // 선배들
  for (const p of spots) boxes.push([p.x + 1.4 - 0.5, p.x + 1.4 + 0.5, p.z - 0.5, p.z + 0.5]);
  // 배경 공장(scenery.ts 의 BACK_SHEDS 와 같은 자리)
  boxes.push([-350, -250, -242, -202], [-475, -405, -240, -204], [-95, -25, -168, -132]);

  /** 서 있을 수 있는 곳인가: 육지(안벽 끝 x = 116 까지)와 두 부두 위 */
  function ground(x: number, z: number) {
    if (x < -748 || z < -292 || z > 330) return false;
    if (x <= 116) return true;
    return x <= 428 && Math.abs(Math.abs(z) - 152) <= 12;
  }
  function blocked(x: number, z: number, r = RADIUS) {
    if (!ground(x, z)) return true;
    for (const [x0, x1, z0, z1] of boxes) if (x > x0 - r && x < x1 + r && z > z0 - r && z < z1 + r) return true;
    return false;
  }

  // ── 입력 ──
  const keys = new Set<string>();
  let dest: THREE.Vector3 | null = null;
  let riding = false;
  let active = false;
  let near = -1;
  let phase = 0;
  const saved = { min: 0, max: 0, pan: true, zoom: true, polar: 0 };

  const isTyping = (e: KeyboardEvent) => !!(e.target as Element | null)?.closest?.('input, textarea, select');
  window.addEventListener('keydown', (e) => {
    if (!active || isTyping(e)) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (['w', 'a', 's', 'd', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Shift', ' '].includes(k)) {
      keys.add(k);
      dest = null;
      e.preventDefault();
    } else if (k === 'b') setRiding(!riding);
    else if (k === 'e') look();
  });
  window.addEventListener('keyup', (e) => keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key));
  window.addEventListener('blur', () => keys.clear());

  // 바닥 누르기: 끌지 않고 짧게 눌렀을 때만(끌기는 둘러보기)
  {
    const ray = new THREE.Raycaster();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hit = new THREE.Vector3();
    let down: { x: number; y: number; t: number } | null = null;
    o.canvas.addEventListener('pointerdown', (e) => (down = { x: e.clientX, y: e.clientY, t: performance.now() }));
    o.canvas.addEventListener('pointerup', (e) => {
      if (!active || !down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      const quick = performance.now() - down.t < 350;
      down = null;
      if (moved > 6 || !quick) return;
      const r = o.canvas.getBoundingClientRect();
      ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
      if (ray.ray.intersectPlane(plane, hit) && ground(hit.x, hit.z)) dest = hit.clone();
    });
  }

  // ── 안내(HUD) ──
  o.hud.innerHTML =
    '<p class="walk-keys">WASD·방향키 걷기 · Shift 달리기 · <button type="button" class="btn" id="walk-bike">B 자전거</button> · 바닥을 누르면 그곳으로 · 끌어서 둘러보기</p>' +
    '<button type="button" class="btn primary" id="walk-look" hidden></button>';
  const lookBtn = o.hud.querySelector<HTMLButtonElement>('#walk-look')!;
  const bikeBtn = o.hud.querySelector<HTMLButtonElement>('#walk-bike')!;
  lookBtn.addEventListener('click', look);
  bikeBtn.addEventListener('click', () => setRiding(!riding));
  o.hud.hidden = true;

  function setRiding(on: boolean) {
    riding = on;
    bike.g.visible = on;
    bikeBtn.textContent = on ? 'B 자전거에서 내리기' : 'B 자전거';
    bikeBtn.setAttribute('aria-pressed', String(on));
    // 탈 때는 다리를 앞으로 모으고 몸을 조금 올린다
    // 안장 위에 앉힌다(동작은 update 에서 '운전'으로 바뀜)
    me.group.position.set(on ? -0.42 * SCALE : 0, on ? 0.62 * SCALE : 0, 0);
  }
  function look() {
    if (!active || near < 0) return;
    const p = spots[near];
    if (Math.hypot(player.position.x - p.x, player.position.z - p.z) > TALK) return;
    o.onLook(near);
  }

  const head = new THREE.Vector3();
  function follow(delta: THREE.Vector3) {
    camera.position.add(delta);
    controls.target.copy(player.position).add(head.set(0, HEAD, 0));
  }

  /** 걷기 시작. at 이 있으면 그 자리에서, 없으면 지난 자리(처음이면 정문 안) */
  function enter(at?: [number, number]) {
    if (!active) {
      saved.min = controls.minDistance;
      saved.max = controls.maxDistance;
      saved.pan = controls.enablePan;
      saved.zoom = controls.zoomToCursor;
      saved.polar = controls.maxPolarAngle;
    }
    active = true;
    player.visible = true;
    o.hud.hidden = false;
    if (at) player.position.set(at[0], 0, at[1]);
    else if (player.position.lengthSq() === 0) player.position.set(-690, 0, 6);
    controls.enabled = true;
    controls.autoRotate = false;
    controls.enablePan = false;
    controls.zoomToCursor = false;
    controls.minDistance = 5;
    controls.maxDistance = 70;
    controls.maxPolarAngle = Math.PI * 0.49;
    // 카메라를 주인공 뒤(지금 보던 방향 그대로) 13 m, 눈높이보다 조금 위로. 낮게 잡아야 앞의 공장과 하늘이 보인다
    const back = new THREE.Vector3().subVectors(camera.position, controls.target).setY(0);
    if (back.lengthSq() < 1) back.set(-1, 0, 0);
    back.normalize().multiplyScalar(13);
    controls.target.copy(player.position).add(head.set(0, HEAD, 0));
    camera.position.copy(controls.target).add(back).setY(HEAD + 3.4);
    near = -1;
    // ?goto=x,z: 그 자리로 걸어가게 한다(확인용 — 물건에 부딪히는 장면을 캡처할 때)
    const g = (new URLSearchParams(location.search).get('goto') ?? '').split(',').map(Number);
    if (g.length === 2 && g.every(Number.isFinite)) dest = new THREE.Vector3(g[0], 0, g[1]);
  }
  function exit() {
    if (!active) return;
    active = false;
    player.visible = false;
    o.hud.hidden = true;
    keys.clear();
    dest = null;
    controls.enablePan = saved.pan;
    controls.zoomToCursor = saved.zoom;
    controls.minDistance = saved.min;
    controls.maxDistance = saved.max;
    controls.maxPolarAngle = saved.polar;
  }
  /** 지도·이전/다음으로 장소를 고르면 그 장소 앞으로 바로 옮긴다 */
  function teleport(index: number) {
    const p = spots[index];
    const before = player.position.clone();
    player.position.set(p.x - 3, 0, p.z);
    follow(player.position.clone().sub(before));
    dest = null;
    near = index;
  }

  const fwd = new THREE.Vector3();
  const move = new THREE.Vector3();
  const before = new THREE.Vector3();
  const vel = new THREE.Vector3();
  function update(dt: number) {
    if (!active) return;
    // 트랜스포터가 밀고 들어오면 가까운 옆으로 밀려난다
    for (const d of o.dynamic?.() ?? []) {
      const px = player.position.x - d.x;
      const pz = player.position.z - d.z;
      const ox = d.hx + RADIUS - Math.abs(px);
      const oz = d.hz + RADIUS - Math.abs(pz);
      if (ox <= 0 || oz <= 0) continue;
      before.copy(player.position);
      if (ox < oz) player.position.x += Math.sign(px || 1) * ox;
      else player.position.z += Math.sign(pz || 1) * oz;
      if (blocked(player.position.x, player.position.z)) player.position.copy(before);
      follow(before.subVectors(player.position, before));
    }
    // 방향: 카메라가 보는 쪽이 앞
    fwd.subVectors(controls.target, camera.position).setY(0).normalize();
    const f = (keys.has('w') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('s') || keys.has('ArrowDown') ? 1 : 0);
    const r = (keys.has('d') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('a') || keys.has('ArrowLeft') ? 1 : 0);
    move.set(fwd.x * f - fwd.z * r, 0, fwd.z * f + fwd.x * r);
    if (move.lengthSq() === 0 && dest) {
      move.subVectors(dest, player.position).setY(0);
      if (move.length() < 0.6) {
        dest = null;
        move.set(0, 0, 0);
      }
    }
    const moving = move.lengthSq() > 0;
    if (moving) {
      const speed = riding ? SPEED.bike : keys.has('Shift') || keys.has(' ') ? SPEED.run : SPEED.walk;
      move.normalize().multiplyScalar(speed * dt);
      before.copy(player.position);
      // 축을 나눠 움직여 벽을 따라 미끄러지게
      if (!blocked(player.position.x + move.x, player.position.z)) player.position.x += move.x;
      if (!blocked(player.position.x, player.position.z + move.z)) player.position.z += move.z;
      const went = player.position.distanceTo(before);
      if (went < 0.001) dest = null; // 막혔으면 누른 곳으로 가기를 그만둠
      follow(before.subVectors(player.position, before));
      vel.copy(before).divideScalar(Math.max(dt, 1e-4));
      // 가는 쪽을 바라본다(부드럽게)
      const want = Math.atan2(-move.z, move.x);
      let d = want - player.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      player.rotation.y += d * Math.min(1, dt * 10);
      phase += went * (riding ? 1.2 : 1.6);
    } else {
      follow(move.set(0, 0, 0));
      vel.set(0, 0, 0);
    }
    // 동작: 자전거(운전 자세, 바퀴 굴리기) / 달리기 / 걷기 / 서 있기. 선배는 가까이 가면 끄덕인다
    if (riding) for (const w of bike.wheels) w.rotation.z = -phase;
    me.set(riding ? 'ride' : !moving ? 'idle' : keys.has('Shift') || keys.has(' ') ? 'run' : 'walk');
    me.update(dt);
    seniors.forEach((sn, i) => {
      const d = Math.hypot(player.position.x - spots[i].x, player.position.z - spots[i].z);
      if (d > 90) return; // 멀리 있는 선배는 멈춰 둔다
      sn.set(d <= TALK ? 'greet' : 'idle');
      sn.update(dt);
    });
    // 가까운 장소
    let best = -1;
    let bestD = NEAR;
    spots.forEach((p, i) => {
      const d = Math.hypot(player.position.x - p.x, player.position.z - p.z);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    if (best >= 0 && best !== near) {
      near = best;
      o.onNear(best);
    }
    const can = near >= 0 && Math.hypot(player.position.x - spots[near].x, player.position.z - spots[near].z) <= TALK;
    if (lookBtn.hidden === can) {
      lookBtn.hidden = !can;
    }
    if (can) {
      const label = `E · ${stations[near].name} 위에서 보기`;
      if (lookBtn.textContent !== label) lookBtn.textContent = label;
    }
  }

  return {
    enter,
    exit,
    update,
    teleport,
    get active() {
      return active;
    },
    /** 물건을 미는 쪽으로서의 주인공(자리와 속도). 걷는 중이 아니면 null */
    pusher: () => (active ? { x: player.position.x, z: player.position.z, hx: RADIUS, hz: RADIUS, vx: vel.x, vz: vel.z } : null),
    /** 그 자리가 막혔는가(물건들도 같은 판정을 쓴다) */
    blocked,
    /** 주인공이 선 자리(위에서 보기에서 돌아올 때) */
    get position() {
      return player.position;
    },
  };
}
