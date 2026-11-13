/**
 * P3-4 명명식과 인도(공식 공정 12 인도). 시운전을 마친 배가 인도 안벽에 붙어 명명식을 하고 선주에게 넘어간다.
 *  예인선이 배를 붙임 → 계류 → 손님 입장(배는 만선기를 닮) → 대모(스폰서)가 줄을 끊으면 병이 뱃머리 옆에 부딪혀 깨짐
 *  → 오색 종이와 뱃고동 → 인도 서명, 선주 깃발 올림 → 손님 퇴장 → 줄을 풀고 뱃머리를 돌려 첫 항해로. 한 순환 약 90초.
 * 배는 뱃머리를 육지 쪽(-x)으로 두고 댄다: 바다 쪽 시점에서 명명식 단상과 뱃머리가 화면 왼쪽(설명 패널 반대편)에 온다.
 * 깃발은 실제 국기나 회사 깃발이 아닌 단색이다(CLAUDE.md 원칙).
 */
import * as THREE from 'three';
import { buildBulkCarrier, SHIP } from './ship';
import { createBerth } from './berth';
import { FM, std, part, boxG, sequence, sparks, lerp, inOut, type Step } from './factory/shed';

interface Options {
  seaY: number;
  draft: number;
  /** 병이 깨질 때(뱃고동) */
  onHorn?: () => void;
}

const D = SHIP.depth;

/** 만선기: 뱃머리 → 앞 마스트 → 거주구 마스트 → 고물로 이어진 줄에 색 삼각기를 단다(배 좌표) */
function dressingFlags(ship: THREE.Object3D) {
  const path = [
    new THREE.Vector3(94, D + 1.5, 0),
    new THREE.Vector3(84, D + 12, 0),
    new THREE.Vector3(-77, D + 18, 0),
    new THREE.Vector3(-94, D + 2.5, 0),
  ];
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];
    const n = Math.max(2, Math.round(a.distanceTo(b) / 3.2));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      // 줄이 살짝 처지게
      pts.push(new THREE.Vector3().lerpVectors(a, b, t).add(new THREE.Vector3(0, -Math.sin(Math.PI * t) * 2.5, 0)));
    }
  }
  const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(1.1, 0, 0), new THREE.Vector3(0.55, -1.4, 0)]);
  geo.setIndex([0, 2, 1]);
  geo.computeVertexNormals();
  const flags = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.7 }), pts.length);
  const colors = [0xd8261b, 0xf2c200, 0x1d4fa8, 0xf4f4ef, 0x1f8a3a, 0xe0661a];
  const m = new THREE.Matrix4();
  const c = new THREE.Color();
  pts.forEach((p, i) => {
    flags.setMatrixAt(i, m.makeTranslation(p.x, p.y, p.z));
    flags.setColorAt(i, c.setHex(colors[i % colors.length]));
  });
  ship.add(flags);
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x2a2e35 }));
  ship.add(line);
}

/** 오색 종이: 위에서 흩날리며 천천히 떨어진다 */
function confetti(parent: THREE.Object3D, pool: number) {
  const pos = new Float32Array(pool * 3).fill(-9999);
  const col = new Float32Array(pool * 3);
  const vel = new Float32Array(pool * 3);
  const age = new Float32Array(pool);
  const life = new Float32Array(pool);
  const geo = new THREE.BufferGeometry();
  const pa = new THREE.BufferAttribute(pos, 3);
  geo.setAttribute('position', pa);
  const ca = new THREE.BufferAttribute(col, 3);
  geo.setAttribute('color', ca);
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 3, sizeAttenuation: false, vertexColors: true }));
  pts.frustumCulled = false;
  parent.add(pts);
  const palette = [0xff3b30, 0xffcc00, 0x34c759, 0x0a84ff, 0xff9fcf, 0xffffff].map((h) => new THREE.Color(h));
  let next = 0;
  function emit(p: THREE.Vector3, n: number) {
    for (let k = 0; k < n; k++) {
      const i = next;
      next = (next + 1) % pool;
      pos.set([p.x + (Math.random() - 0.5) * 6, p.y + Math.random() * 2, p.z + (Math.random() - 0.5) * 6], i * 3);
      vel.set([(Math.random() - 0.5) * 6, 2 + Math.random() * 4, (Math.random() - 0.5) * 6], i * 3);
      const c = palette[(Math.random() * palette.length) | 0];
      col.set([c.r, c.g, c.b], i * 3);
      age[i] = 0;
      life[i] = 5 + Math.random() * 3;
    }
    // 색은 뿌릴 때만 바뀐다. 이것이 없으면 처음 올라간 검은색이 그대로 남는다
    ca.needsUpdate = true;
  }
  function update(dt: number) {
    for (let i = 0; i < pool; i++) {
      if (life[i] <= 0) continue;
      age[i] += dt;
      if (age[i] >= life[i] || pos[i * 3 + 1] < 0.1) {
        life[i] = 0;
        pos[i * 3 + 1] = -9999;
        continue;
      }
      // 처음엔 솟았다가 공기 저항으로 느리게 떨어짐(흩날림)
      vel[i * 3 + 1] = Math.max(-1.6, vel[i * 3 + 1] - 6 * dt);
      vel[i * 3] *= 1 - 0.8 * dt;
      vel[i * 3 + 2] *= 1 - 0.8 * dt;
      pos[i * 3] += (vel[i * 3] + Math.sin(age[i] * 3 + i) * 0.8) * dt;
      pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
      pos[i * 3 + 2] += (vel[i * 3 + 2] + Math.cos(age[i] * 2.6 + i) * 0.8) * dt;
    }
    pa.needsUpdate = true;
  }
  function clear() {
    life.fill(0);
    pos.fill(-9999);
    pa.needsUpdate = true;
  }
  return { emit, update, clear };
}

export function createDelivery(scene: THREE.Scene, at: [number, number, number], o: Options) {
  const [ax, , az] = at;
  const root = new THREE.Group();
  scene.add(root);

  // ── 배: 뱃머리를 -x(육지 쪽)로. 만선기를 단 채 들어온다 ──
  const { ship } = buildBulkCarrier(true);
  root.add(ship);
  dressingFlags(ship);
  const berth = createBerth(root, ship, { ax, az, d: 1, seaY: o.seaY, draft: o.draft });
  const { keelY, moorZ, offZ, edgeZ, setRopes, placeTugs } = berth;
  ship.position.set(ax, keelY, moorZ);
  ship.rotation.y = Math.PI;
  setRopes(1);

  // 선주 깃발(단색): 고물 깃대(배 좌표 고물 끝)
  const staff = part(ship, new THREE.CylinderGeometry(0.12, 0.12, 9, 6), FM.steel, -93, D + 4.5, 0);
  staff.castShadow = false;
  const flag = part(ship, boxG(0.05, 2, 3), std(0x1d4fa8, 0.7), -93, D + 1.5, 1.6, false);
  const FLAG_LOW = D + 1.5;
  const FLAG_TOP = D + 8;

  // ── 명명식 단상(부두 위, 뱃머리 앞쪽) ──
  const BOW_X = ax - 65; // 배가 전폭이 되는 뱃머리 쪽 끝(세계 x)
  const stageX = BOW_X - 8;
  const stageZ = edgeZ - 10;
  const white = std(0xf1efe8, 0.7);
  part(root, boxG(16, 1.2, 8), std(0x8a8f96, 0.8), stageX, 0.6, stageZ);
  part(root, boxG(16.4, 0.06, 8.4), std(0xb3261e, 0.9), stageX, 1.23, stageZ); // 붉은 천
  for (const sx of [-7.6, 7.6]) for (const sz of [-3.6, 3.6]) part(root, boxG(0.3, 5, 0.3), white, stageX + sx, 3.7, stageZ + sz);
  part(root, boxG(16.6, 0.3, 8.6), white, stageX, 6.3, stageZ); // 차양
  part(root, boxG(3, 0.06, 10), std(0xb3261e, 0.9), stageX, 0.04, stageZ - 9); // 단상으로 오는 붉은 길

  // 손님(단상 뒤 줄): 몸통 원통 + 머리 구
  const suits = [0x23262c, 0x2e3a52, 0x4a4f57, 0x7a2a2a, 0xd9d4c7].map((c) => std(c, 0.8));
  const skin = std(0xd9b08c, 0.8);
  const guests: THREE.Group[] = [];
  for (let row = 0; row < 3; row++)
    for (let i = 0; i < 9; i++) {
      const g = new THREE.Group();
      part(g, new THREE.CylinderGeometry(0.28, 0.32, 1.4, 8), suits[(row * 9 + i) % suits.length], 0, 0.7, 0);
      part(g, new THREE.SphereGeometry(0.22, 8, 6), skin, 0, 1.6, 0);
      g.position.set(stageX - 8 + i * 2 + (row % 2) * 0.8, 0, stageZ - 6 - row * 1.6);
      g.visible = false;
      root.add(g);
      guests.push(g);
    }
  // 대모(스폰서): 단상 위 앞쪽
  const sponsor = new THREE.Group();
  part(sponsor, new THREE.CylinderGeometry(0.28, 0.4, 1.5, 8), std(0xe6d3a3, 0.7), 0, 0.75, 0);
  part(sponsor, new THREE.SphereGeometry(0.22, 8, 6), skin, 0, 1.7, 0);
  sponsor.position.set(BOW_X - 1, 1.2, stageZ + 2.5);
  sponsor.visible = false;
  root.add(sponsor);

  // ── 병과 줄: 부두 가장자리 기둥 팔에 매달린 진자 ──
  const pivot = new THREE.Vector3(BOW_X, 10, edgeZ - 2);
  part(root, boxG(0.4, 10, 0.4), FM.steel, pivot.x, 5, pivot.z - 3);
  part(root, boxG(0.3, 0.3, 3.3), FM.steel, pivot.x, 10, pivot.z - 1.5);
  const L = 8;
  const bottle = new THREE.Group();
  part(bottle, new THREE.CylinderGeometry(0.3, 0.3, 1, 10), new THREE.MeshStandardMaterial({ color: 0x1f6b3a, roughness: 0.2, metalness: 0.3 }), 0, -0.5, 0);
  part(bottle, new THREE.CylinderGeometry(0.1, 0.25, 0.5, 10), std(0xe8c24a, 0.4), 0, 0.2, 0);
  bottle.scale.setScalar(2); // 멀리서도 보이게 실제보다 크게
  root.add(bottle);
  const cord = part(root, new THREE.CylinderGeometry(0.04, 0.04, 1, 5), std(0xe6e1d3, 0.8), 0, 0, 0, false);
  const HULL_Z = moorZ - SHIP.beam / 2; // 부두 쪽 선체 옆면
  const THETA_HIT = Math.asin(THREE.MathUtils.clamp((HULL_Z - pivot.z - 0.6) / L, -1, 1));
  const THETA_HOLD = -0.95; // 단상 쪽으로 당겨 둔 각도
  const UP = new THREE.Vector3(0, 1, 0);
  const tip = new THREE.Vector3();
  function setBottle(theta: number) {
    tip.set(pivot.x, pivot.y - L * Math.cos(theta), pivot.z + L * Math.sin(theta));
    bottle.position.copy(tip);
    bottle.rotation.set(theta, 0, 0);
    const d = new THREE.Vector3().subVectors(tip, pivot);
    cord.position.copy(pivot).addScaledVector(d, 0.5);
    cord.scale.y = d.length();
    cord.quaternion.setFromUnitVectors(UP, d.normalize());
  }
  setBottle(THETA_HOLD);

  const splash = sparks(root, 200, [1, 0.95, 0.75]);
  const paper = confetti(root, 900);
  const burstAt = [
    new THREE.Vector3(stageX - 6, 12, stageZ),
    new THREE.Vector3(stageX + 6, 12, stageZ),
    new THREE.Vector3(BOW_X + 10, 16, moorZ - 8),
  ];

  // 밤 투광등 1개(장소당 1개 이하): 단상과 뱃머리 쪽. daynight.ts 가 낮에 끈다
  const flood = new THREE.SpotLight(0xffd9a8, 9000, 200, Math.PI / 3.4, 0.6, 2);
  flood.position.set(stageX - 25, 26, edgeZ - 22);
  flood.target.position.set(BOW_X + 20, 2, moorZ - 6);
  root.add(flood, flood.target);

  function reset() {
    ship.visible = true;
    ship.rotation.y = Math.PI;
    flag.position.y = FLAG_LOW;
    for (const g of guests) g.visible = false;
    sponsor.visible = false;
    bottle.visible = true;
    setBottle(THETA_HOLD);
    paper.clear();
  }

  // ── 단계 ──
  const build = (): Step[] => [
    {
      dur: 12,
      label: '예인선이 시운전을 마친 배를 인도 안벽에 붙임',
      enter: () => {
        reset();
        setRopes(0);
      },
      apply: (k) => {
        ship.position.set(ax, keelY, lerp(offZ, moorZ, inOut(k)));
        placeTugs('side');
      },
    },
    { dur: 3, label: '계류줄로 배를 묶음', enter: () => placeTugs('hide'), apply: (k) => setRopes(k) },
    {
      dur: 6,
      label: '손님이 자리에 섬 — 만선기를 단 배 앞에서 명명식 준비',
      apply: (k) => guests.forEach((g, i) => (g.visible = i < Math.round(k * guests.length))),
    },
    {
      dur: 4,
      label: '대모(스폰서)가 배 이름을 부르고 줄을 끊을 준비',
      enter: () => (sponsor.visible = true),
      apply: (k) => setBottle(THETA_HOLD + Math.sin(k * 30) * 0.02),
    },
    {
      dur: 1.1,
      label: '줄을 끊음 — 병이 뱃머리로 날아감',
      apply: (k) => setBottle(lerp(THETA_HOLD, THETA_HIT, k * k)),
    },
    {
      dur: 8,
      label: '병이 깨지고 축하 — 오색 종이와 뱃고동',
      enter: () => {
        bottle.visible = false;
        splash.emit(tip, 120, 1.5);
        for (const p of burstAt) paper.emit(p, 160);
        o.onHorn?.();
      },
      apply: (k) => {
        if (k < 0.5 && Math.random() < 0.5) paper.emit(burstAt[(Math.random() * burstAt.length) | 0], 6);
      },
    },
    {
      dur: 8,
      label: '선주에게 인도 서류를 넘기고 서명 — 선주 깃발을 올림',
      apply: (k) => (flag.position.y = lerp(FLAG_LOW, FLAG_TOP, inOut(k))),
    },
    {
      dur: 4,
      label: '손님이 돌아감',
      apply: (k) => {
        guests.forEach((g, i) => (g.visible = i >= Math.round(k * guests.length)));
        sponsor.visible = k < 0.5;
      },
    },
    { dur: 3, label: '계류줄을 풂', apply: (k) => setRopes(1 - k) },
    {
      dur: 8,
      label: '예인선이 배를 안벽에서 떼어 냄',
      apply: (k) => {
        ship.position.z = lerp(moorZ, offZ, inOut(k));
        placeTugs('side');
      },
    },
    {
      dur: 12,
      label: '뱃머리를 바다 쪽으로 돌림',
      enter: () => placeTugs('hide'),
      // π → 2π: 뱃머리가 바다 쪽(+z)으로 돈다(π → 0 이면 뱃머리가 부두를 친다). 돌면서 조금 나아가고 부두에서 더 멀어짐
      apply: (k) => {
        const e = inOut(k);
        ship.rotation.y = lerp(Math.PI, Math.PI * 2, e);
        ship.position.x = lerp(ax, ax + 60, e);
        ship.position.z = lerp(offZ, offZ + 35, e); // 반쯤 돌았을 때(배가 z 방향) 고물이 부두 가장자리에서 약 10 m 떨어지게
      },
    },
    {
      dur: 14,
      label: '선주의 첫 항해로 떠남',
      apply: (k) => (ship.position.x = lerp(ax + 60, ax + 300, k * k)),
    },
    {
      dur: 5,
      label: '다음 배를 기다림',
      enter: () => {
        ship.visible = false;
        ship.position.x = ax;
      },
    },
  ];
  const main = sequence(build);

  function update(machineDt: number) {
    main.update(machineDt);
    splash.update(machineDt);
    paper.update(machineDt);
  }
  return { update, status: () => main.label() };
}
