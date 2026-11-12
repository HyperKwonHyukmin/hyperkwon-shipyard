/**
 * 4단계: 용접 불꽃.
 * 블록이 자리에 앉으면 이음매 몇 곳에서 용접이 시작된다. 아크가 켜졌다 꺼졌다 하며 불꽃이 튀고,
 * 푸른빛 점광원이 주변을 깜빡이며 비춘다.
 * - 점광원 개수가 바뀌면 셰이더가 다시 만들어져 화면이 멈칫하므로, 조명은 처음에 MAX 개를 만들어 두고 켜고 끄기만 한다.
 */
import * as THREE from 'three';

const MAX = 3; // 동시에 용접하는 곳
const POOL = 900; // 불꽃 입자 수
const RATE = 140; // 아크 하나가 1초에 뿜는 입자
const GRAVITY = -9.8;

interface Welder {
  pos: THREE.Vector3;
  /** 남은 작업 시간(초) */
  left: number;
  arc: boolean;
  /** 아크를 켜거나 끄기까지 남은 시간 */
  toggle: number;
  emit: number;
  light: THREE.PointLight;
  core: THREE.Mesh;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);

/** 가운데가 밝고 바깥으로 흐려지는 원 */
function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.2, 'rgba(200,225,255,0.8)');
  grad.addColorStop(0.5, 'rgba(120,170,255,0.25)');
  grad.addColorStop(1, 'rgba(80,140,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createWelding(scene: THREE.Scene) {
  // 불꽃 입자
  const pos = new Float32Array(POOL * 3);
  const col = new Float32Array(POOL * 3);
  const vel = new Float32Array(POOL * 3);
  const age = new Float32Array(POOL);
  const life = new Float32Array(POOL);
  for (let i = 0; i < POOL; i++) {
    pos[i * 3 + 1] = -9999;
    life[i] = 0;
  }
  const geo = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(pos, 3);
  const colAttr = new THREE.BufferAttribute(col, 3);
  geo.setAttribute('position', posAttr);
  geo.setAttribute('color', colAttr);
  const points = new THREE.Points(
    geo,
    new THREE.PointsMaterial({
      size: 3,
      sizeAttenuation: false,
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  points.frustumCulled = false;
  scene.add(points);
  let next = 0;

  // 용접 자리(조명 + 아크 빛 알갱이 + 멀리서도 보이는 번짐)
  const coreMat = new THREE.MeshBasicMaterial({ color: 0xe8f2ff, toneMapped: false });
  const coreGeo = new THREE.SphereGeometry(0.35, 10, 8);
  const glowMat = new THREE.SpriteMaterial({
    map: glowTexture(),
    color: 0xcfe2ff,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: false, // 화면에서 늘 같은 크기라 멀리서도 반짝임이 보인다
    toneMapped: false,
  });
  const welders: Welder[] = Array.from({ length: MAX }, () => {
    const light = new THREE.PointLight(0xbcd6ff, 0, 60, 2);
    const core = new THREE.Mesh(coreGeo, coreMat);
    const glow = new THREE.Sprite(glowMat);
    glow.scale.setScalar(0.05);
    core.add(glow);
    core.visible = false;
    scene.add(light, core);
    return { pos: new THREE.Vector3(), left: 0, arc: false, toggle: 0, emit: 0, light, core };
  });
  let rotate = 0;

  /** 블록이 앉았을 때: 이음매 후보 가운데 MAX 곳을 골라 용접을 시작한다(가장 오래된 자리를 넘겨받음) */
  function start(box: THREE.Box3) {
    const { min, max } = box;
    const z = () => rand(min.z + 1, max.z - 1);
    const y = () => rand(min.y + 1, max.y - 1);
    const candidates = [
      new THREE.Vector3(min.x, max.y, z()), // 윗면, 선미 쪽 이음매
      new THREE.Vector3(max.x, max.y, z()), // 윗면, 선수 쪽 이음매
      new THREE.Vector3(min.x, y(), max.z), // 우현 바깥, 세로 이음매
      new THREE.Vector3(max.x, y(), min.z), // 좌현 바깥, 세로 이음매
    ].sort(() => Math.random() - 0.5);
    for (let i = 0; i < MAX; i++) {
      const w = welders[rotate];
      rotate = (rotate + 1) % MAX;
      w.pos.copy(candidates[i]);
      w.left = rand(16, 26);
      w.arc = false;
      w.toggle = rand(0.2, 1.5); // 세 곳이 동시에 켜지지 않게 엇갈림
      w.light.position.copy(w.pos).add(new THREE.Vector3(0, 1.5, 0));
      w.core.position.copy(w.pos);
    }
  }

  function spawn(p: THREE.Vector3) {
    const i = next;
    next = (next + 1) % POOL;
    pos[i * 3] = p.x + rand(-0.2, 0.2);
    pos[i * 3 + 1] = p.y + rand(-0.1, 0.2);
    pos[i * 3 + 2] = p.z + rand(-0.2, 0.2);
    const a = Math.random() * Math.PI * 2;
    const s = rand(1.5, 7);
    vel[i * 3] = Math.cos(a) * s;
    vel[i * 3 + 1] = rand(1, 6);
    vel[i * 3 + 2] = Math.sin(a) * s;
    age[i] = 0;
    life[i] = rand(0.4, 1.1);
  }

  /** dt 는 실제 경과 시간(속도 배율을 곱하지 않음). 불꽃 물리가 배율에 따라 튀지 않게 */
  function update(dt: number) {
    for (const w of welders) {
      if (w.left <= 0) {
        w.light.intensity = 0;
        w.core.visible = false;
        continue;
      }
      w.left -= dt;
      w.toggle -= dt;
      if (w.toggle <= 0) {
        w.arc = !w.arc && w.left > 0;
        w.toggle = w.arc ? rand(1.5, 4) : rand(0.4, 1.4);
      }
      if (w.arc) {
        // 아크는 불규칙하게 떨린다
        w.light.intensity = rand(600, 1800);
        w.core.visible = true;
        w.core.scale.setScalar(rand(0.6, 1.4));
        w.emit += RATE * dt;
        while (w.emit >= 1) {
          spawn(w.pos);
          w.emit--;
        }
      } else {
        w.light.intensity = 0;
        w.core.visible = false;
      }
    }
    for (let i = 0; i < POOL; i++) {
      if (life[i] <= 0) continue;
      age[i] += dt;
      const k = age[i] / life[i];
      if (k >= 1) {
        life[i] = 0;
        pos[i * 3 + 1] = -9999;
        col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = 0;
        continue;
      }
      vel[i * 3 + 1] += GRAVITY * dt;
      pos[i * 3] += vel[i * 3] * dt;
      pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
      pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      // 흰색 → 주황 → 사라짐(가산 혼합이라 어두워지면 곧 투명)
      const fade = 1 - k;
      col[i * 3] = 1 * fade;
      col[i * 3 + 1] = (0.95 - 0.55 * k) * fade;
      col[i * 3 + 2] = (0.8 - 0.75 * k) * fade;
    }
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
  }

  /** 지금 아크가 켜진 자리들(소리 크기 계산용) */
  const arcs = () => welders.filter((w) => w.left > 0 && w.arc).map((w) => w.pos);

  return { start, update, arcs };
}
