/**
 * 4단계: 안개.
 * - 떠다니는 안개: 바닥·수면 가까이에 옅은 안개 덩어리(스프라이트)가 천천히 흘러간다.
 * - 빛줄기: 투광등에서 아래로 퍼지는 원뿔. 꼭짓점이 밝고 아래로 갈수록 사라진다(가산 혼합).
 */
import * as THREE from 'three';

const rand = (a: number, b: number) => a + Math.random() * (b - a);

/** 가장자리가 부드럽고 속이 얼룩진 안개 덩어리 */
function puffTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  for (let i = 0; i < 14; i++) {
    const x = rand(36, 92);
    const y = rand(40, 88);
    const r = rand(18, 40);
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(255,255,255,0.22)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * 안개는 땅 바로 위에 눕힌 판으로 만든다. 세운 스프라이트는 땅을 뚫고 지나가며
 * 맞닿은 곳에 날카로운 직선이 생기기 때문이다. 판 몇 장을 높이를 조금씩 달리해 겹친다.
 */
export function createFog(scene: THREE.Scene) {
  const tex = puffTexture();
  const AREA = { x0: -740, x1: 460, z0: -240, z1: 240 }; // 장소 전체(정문~안벽)를 덮음
  const geo = new THREE.PlaneGeometry(1, 1);
  geo.rotateX(-Math.PI / 2);
  const puffs = Array.from({ length: 60 }, () => {
    const m = new THREE.MeshBasicMaterial({
      map: tex,
      color: 0x93a4bd,
      transparent: true,
      opacity: rand(0.25, 0.5),
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const s = new THREE.Mesh(geo, m);
    const size = rand(60, 140);
    s.scale.set(size, 1, size * rand(0.5, 0.9));
    s.rotation.y = rand(0, Math.PI * 2);
    s.position.set(rand(AREA.x0, AREA.x1), rand(0.8, 6), rand(AREA.z0, AREA.z1));
    s.renderOrder = 1;
    scene.add(s);
    return { s, vx: rand(0.8, 2.2), vz: rand(-0.4, 0.4), spin: rand(-0.02, 0.02), y0: s.position.y, phase: rand(0, 6) };
  });

  function update(dt: number, t: number) {
    for (const p of puffs) {
      p.s.position.x += p.vx * dt;
      p.s.position.z += p.vz * dt;
      if (p.s.position.x > AREA.x1) p.s.position.x = AREA.x0;
      if (p.s.position.z > AREA.z1) p.s.position.z = AREA.z0;
      if (p.s.position.z < AREA.z0) p.s.position.z = AREA.z1;
      p.s.rotation.y += p.spin * dt;
      p.s.position.y = p.y0 + Math.sin(t * 0.15 + p.phase) * 0.6;
    }
  }
  return { update };
}

/** 투광등 빛줄기: from(등)에서 to(비추는 곳) 방향으로 반각 angle 의 원뿔 */
export function lightBeam(from: THREE.Vector3, to: THREE.Vector3, angle: number, color: number) {
  const dir = new THREE.Vector3().subVectors(to, from);
  const h = dir.length() * 1.05;
  const geo = new THREE.ConeGeometry(Math.tan(angle) * h, h, 40, 8, true);
  geo.translate(0, -h / 2, 0); // 꼭짓점을 원점(등 위치)으로
  const base = new THREE.Color(color);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const cols = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const k = THREE.MathUtils.clamp(-pos.getY(i) / h, 0, 1);
    const a = 0.04 * (1 - k) ** 2;
    cols.set([base.r * a, base.g * a, base.b * a], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    }),
  );
  mesh.position.copy(from);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir.normalize());
  return mesh;
}
