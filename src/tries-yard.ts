/**
 * 야드 장소의 '직접 해 보기' 넷(2026-11-22, 틀은 try-frame.ts).
 * - 가공: 선상가열 — 강판의 이음마다 불을 대 곡형 템플릿에 맞게 굽힌다(손을 떼도 남은 열로 더 굽는다 → 미리 떼기)
 * - 조립: 용접 순서 — 판넬 이음 5줄을 용접하면 판이 눈앞에서 뒤틀린다(가운데에서 바깥으로, 좌우 번갈아가 정답)
 * - PE장: 블록 수평 잡기 — 받침(잭) 넷을 올리고 내려 기울기와 뜬 받침을 없앤다
 * - 도장: 스프레이 — 고르게 움직이며 뿌려 목표 두께를 채운다(한곳에 오래 뿌리면 흘러내림)
 * 장면은 각 장소의 건물 앞 빈 띠(layout.ts FOOTPRINT 안이라 적치 블록·자재가 오지 않는 자리)에 늘 놓여 있다. 걷기 모드의 충돌은 없다.
 * 숫자는 모두 교육용 예시다(실제 가열 조건·변형 계산·도장 기준서가 아님). 변형과 기울기는 화면에서 과장해 그린다.
 */
import * as THREE from 'three';
import { unitBlockGeometry, seams } from './blockgen';
import { weldDistortion } from './build-calc';
import type { TryDef } from './try-frame';

const RAD = Math.PI / 180;
const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;
const deg = (r: number) => (r / RAD).toFixed(1);
const std = (color: number, roughness = 0.7, metalness = 0.2) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
function box(parent: THREE.Object3D, w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  mesh.castShadow = mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
/**
 * 조각 n 개(폭 w)를 이음마다 bend[j](rad, j = 1..n−1)만큼 꺾어 이은 단면. 가운데가 낮은 접시 모양이고 가장 낮은 점의 높이가 0.
 * pts = 꼭짓점 n+1 개 [x, y], ang = 조각마다의 기울기
 */
function shape(n: number, w: number, bend: number[]) {
  let th = 0;
  for (let j = 1; j < n; j++) th -= (bend[j] ?? 0) / 2;
  let x = -(n * w) / 2;
  let y = 0;
  const pts: [number, number][] = [[x, y]];
  const ang: number[] = [];
  for (let i = 0; i < n; i++) {
    if (i > 0) th += bend[i] ?? 0;
    ang.push(th);
    x += Math.cos(th) * w;
    y += Math.sin(th) * w;
    pts.push([x, y]);
  }
  const low = Math.min(...pts.map((p) => p[1]));
  for (const p of pts) p[1] -= low;
  return { pts, ang };
}
function place(strips: THREE.Object3D[], s: ReturnType<typeof shape>) {
  strips.forEach((m, i) => {
    m.position.set((s.pts[i][0] + s.pts[i + 1][0]) / 2, (s.pts[i][1] + s.pts[i + 1][1]) / 2, 0);
    m.rotation.z = s.ang[i];
  });
}
/** 토치: 비스듬한 노즐과 끝의 불빛 */
function makeTorch() {
  const g = new THREE.Group();
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 1.3, 8), std(0x2a2e35, 0.5, 0.6));
  nozzle.position.set(0, 0.7, 0.25);
  nozzle.rotation.x = -0.35;
  const tipMat = new THREE.MeshBasicMaterial({ color: 0xffb04a, transparent: true, opacity: 0.4, toneMapped: false });
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), tipMat);
  tip.position.y = 0.08;
  g.add(nozzle, tip);
  return { g, tipMat };
}

// ── 가공: 선상가열 ───────────────────────────────────────────
function heatTry(at: [number, number, number]): TryDef {
  const cx = at[0] + 25;
  const cz = at[2] + 25; // 가공공장 열린 면(+z) 앞
  const N = 8;
  const W = 1.5;
  const D = 5;
  const TOL = 0.4 * RAD;
  const RATE = 1.7 * RAD; // 불을 대고 있을 때 꺾이는 빠르기(rad/s)
  const PROFILE = [0, 0.6, 0.9, 1.1, 1.2, 1.1, 0.9, 0.6];
  const root = new THREE.Group();
  const strips: THREE.Mesh[] = [];
  const glows: THREE.Mesh[] = [];
  const glowMats: THREE.MeshBasicMaterial[] = [];
  const bend = new Array<number>(N).fill(0);
  const heat = new Array<number>(N).fill(0);
  let target = new Array<number>(N).fill(0);
  let goal = shape(N, W, target);
  let template!: THREE.Line;
  let torch!: ReturnType<typeof makeTorch>;
  let x = 0;
  let t = 0;
  let done = false;
  const jointX = (j: number) => -(N * W) / 2 + j * W;
  return {
    id: 'heat',
    label: '선상가열',
    hint: '불로 강판을 굽혀 곡면 만들기',
    station: 'cutting',
    at: [at[0] + 52, at[2] + 25],
    title: '선상가열(곡가공)',
    keys: '←→ 토치 옮기기 · Space 가열(누르고 있기) · 손을 떼도 남은 열로 조금 더 굽습니다',
    reads: ['이 이음의 굽힘 / 목표', '템플릿과의 틈(최대)', '과굽힘', '시간'],
    pad: [['left', '◀'], ['right', '▶']],
    act: 'Space 가열',
    cam: [cx, 7.5, cz + 13],
    look: [cx, 1.3, cz],
    build(ctx) {
      root.position.set(cx, 0, cz);
      ctx.scene.add(root);
      box(root, N * W + 1.2, 0.9, D + 1, std(0x2f3338, 0.9, 0.1), 0, 0.45, 0); // 정반
      const plate = new THREE.Group();
      plate.position.y = 0.96;
      root.add(plate);
      const steel = std(0x7b8087, 0.55, 0.55);
      for (let i = 0; i < N; i++) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(W, 0.1, D), steel);
        m.castShadow = m.receiveShadow = true;
        plate.add(m);
        strips.push(m);
      }
      for (let j = 1; j < N; j++) {
        const gm = new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0, toneMapped: false });
        const g = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.04, D), gm);
        plate.add(g);
        glows[j] = g;
        glowMats[j] = gm;
      }
      // 곡형 템플릿(목표 모양): 판 앞뒤 가장자리를 따라 초록 선
      const pts = Array.from({ length: (N + 1) * 2 + 1 }, () => new THREE.Vector3());
      template = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x00e600 }));
      template.frustumCulled = false;
      plate.add(template);
      torch = makeTorch();
      plate.add(torch.g);
      place(strips, shape(N, W, bend));
      torch.g.position.set(jointX(1), 0.1, 0.6);
    },
    start(ctx) {
      const base = (3 + 2.5 * ctx.day(1)) * RAD;
      target = PROFILE.map((p) => p * base);
      goal = shape(N, W, target);
      bend.fill(0);
      heat.fill(0);
      x = jointX(1) - 0.6;
      t = 0;
      done = false;
      const pos = template.geometry.attributes.position as THREE.BufferAttribute;
      let k = 0;
      for (let i = 0; i <= N; i++) pos.setXYZ(k++, goal.pts[i][0], goal.pts[i][1] + 0.07, D / 2 + 0.06);
      for (let i = N; i >= 0; i--) pos.setXYZ(k++, goal.pts[i][0], goal.pts[i][1] + 0.07, -D / 2 - 0.06);
      pos.setXYZ(k, goal.pts[0][0], goal.pts[0][1] + 0.07, D / 2 + 0.06);
      pos.needsUpdate = true;
      ctx.hud.note('초록 선(곡형 템플릿)에 판이 닿게 굽힙니다. 이음 위에서 Space 를 누르고 있으면 그 줄이 달아오르며 꺾입니다.', 9);
    },
    update(dt, ctx) {
      if (done) return;
      t += dt;
      const dir = (ctx.held.has('right') ? 1 : 0) - (ctx.held.has('left') ? 1 : 0);
      x = clamp(x + dir * 3.2 * dt, -(N * W) / 2 + 0.2, (N * W) / 2 - 0.2);
      const j = clamp(Math.round((x + (N * W) / 2) / W), 1, N - 1);
      const near = Math.abs(x - jointX(j)) < 0.45;
      const on = ctx.held.has('act') && near;
      if (ctx.taps.has('act') && !near) ctx.hud.note('이음(판이 꺾이는 줄) 위로 토치를 옮긴 뒤 가열하세요', 2.5);
      for (let q = 1; q < N; q++) {
        heat[q] = q === j && on ? Math.min(1, heat[q] + dt * 2.6) : heat[q] * Math.exp(-dt * 1.7);
        bend[q] += heat[q] * RATE * dt;
        glowMats[q].opacity = Math.min(1, heat[q] * 1.1);
      }
      const s = shape(N, W, bend);
      place(strips, s);
      for (let q = 1; q < N; q++) {
        glows[q].position.set(s.pts[q][0], s.pts[q][1] + 0.07, 0);
        glows[q].rotation.z = (s.ang[q - 1] + s.ang[q]) / 2;
      }
      const u = (x + (N * W) / 2) / W;
      const i = Math.min(N - 1, Math.floor(u));
      torch.g.position.set(lerp(s.pts[i][0], s.pts[i + 1][0], u - i), lerp(s.pts[i][1], s.pts[i + 1][1], u - i) + 0.1, 0.6);
      torch.tipMat.opacity = on ? 1 : 0.4;
      let gap = 0;
      for (let q = 0; q <= N; q++) gap = Math.max(gap, Math.abs(s.pts[q][1] - goal.pts[q][1]));
      let over = 0;
      let left = 0;
      for (let q = 1; q < N; q++) {
        if (bend[q] > target[q] + TOL) over++;
        else if (bend[q] < target[q] - TOL) left++;
      }
      const cool = heat.every((h) => h < 0.04);
      ctx.hud.step(left ? `굽힐 이음 ${left}곳 남음` : cool ? '' : '식는 중…');
      ctx.hud.read([`${deg(bend[j])}° / ${deg(target[j])}°`, `${Math.round(gap * 1000)} mm`, `${over}곳`, `${Math.round(t)}초`]);
      if (!left && cool) {
        done = true;
        ctx.sound.thump(0.35);
        ctx.hud.result(
          over ? '곡가공 — 과굽힘이 있습니다' : '곡가공 — 템플릿에 맞았습니다',
          [
            ['템플릿과의 틈(최대)', `${Math.round(gap * 1000)} mm`],
            ['과굽힘', over ? `${over}곳 — 뒤집어 반대쪽을 가열해 펴야 합니다` : '없음'],
            ['걸린 시간', `${Math.round(t)}초`],
          ],
          over
            ? '불을 뗀 뒤에도 남은 열로 판은 조금 더 굽습니다. 목표보다 일찍 떼는 것이 요령입니다. 한번 과하게 굽은 판은 되돌리기 어렵습니다.'
            : '선상가열은 달군 쪽이 식으며 줄어드는 힘으로 판을 굽힙니다. 가열 위치와 빠르기, 식히는 방법으로 곡률을 맞추는 숙련 작업입니다.',
        );
      }
    },
    stop() {
      for (let q = 1; q < N; q++) glowMats[q].opacity = 0;
    },
    debug: () => ({ x, bend: bend.map((b) => b / RAD), target: target.map((b) => b / RAD), heat: [...heat], jointX: Array.from({ length: N }, (_, j) => jointX(j)), done }),
  };
}

// ── 조립: 용접 순서 ──────────────────────────────────────────
function weldTry(at: [number, number, number]): TryDef {
  const cx = at[0] + 30;
  const cz = at[2] - 27.5; // 조립공장 열린 면(−z) 앞
  const N = 6;
  const W = 2;
  const D = 5;
  const root = new THREE.Group();
  const strips: THREE.Mesh[] = [];
  const beads: THREE.Mesh[] = [];
  const bend = new Array<number>(N).fill(0);
  const goal = new Array<number>(N).fill(0);
  let torch!: ReturnType<typeof makeTorch>;
  let sel = 2;
  let busy = 0;
  let ending = 0;
  let order: number[] = [];
  let done = false;
  let t = 0;
  return {
    id: 'weld',
    label: '용접 순서',
    hint: '판넬 이음을 용접하면 판이 뒤틀린다',
    station: 'assembly',
    at: [at[0] + 50, at[2] - 30],
    title: '판넬 용접 순서',
    keys: '←→ 이음 고르기 · Space 용접 · 변형은 화면에서 과장해 그립니다',
    reads: ['고른 이음', '용접한 순서', '지금까지의 변형', '남은 이음'],
    pad: [['left', '◀'], ['right', '▶']],
    act: 'Space 용접',
    cam: [cx, 7.5, cz - 13.5],
    look: [cx, 1, cz],
    build(ctx) {
      root.position.set(cx, 0, cz);
      root.rotation.y = Math.PI; // 길 쪽(−z)에서 보므로 돌려 놓는다 → 화면 오른쪽이 판넬의 +x
      ctx.scene.add(root);
      for (const sx of [-4.5, 0, 4.5]) box(root, 0.5, 0.6, D + 0.6, std(0x4a3a2c, 0.9, 0), sx, 0.3, 0); // 받침
      const panel = new THREE.Group();
      panel.position.y = 0.66;
      root.add(panel);
      const steel = std(0x8a8f96, 0.6, 0.45);
      for (let i = 0; i < N; i++) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(W - 0.06, 0.1, D), steel);
        m.castShadow = m.receiveShadow = true;
        panel.add(m);
        strips.push(m);
      }
      const beadMat = std(0xd9dde2, 0.35, 0.8);
      for (let s = 0; s < N - 1; s++) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.05, D), beadMat);
        b.visible = false;
        panel.add(b);
        beads.push(b);
      }
      torch = makeTorch();
      panel.add(torch.g);
      place(strips, shape(N, W, bend));
      torch.g.position.set(0, 0.1, 0);
    },
    start(ctx) {
      bend.fill(0);
      goal.fill(0);
      order = [];
      sel = 2;
      busy = ending = t = 0;
      done = false;
      for (const b of beads) b.visible = false;
      ctx.hud.note('강판 6장을 이어 판넬을 만듭니다. 이음 5줄을 어느 순서로 용접할지 정하세요. 용접한 자리는 식으며 줄어듭니다.', 8);
    },
    update(dt, ctx) {
      t += dt;
      if (!done && busy > 0) {
        busy -= dt;
        torch.g.position.z = lerp(-D / 2, D / 2, 1 - Math.max(0, busy) / 1.1);
        if (busy <= 0) {
          const before = weldDistortion(order);
          order.push(sel);
          goal[sel + 1] = (0.5 + 0.95 * (weldDistortion(order) - before)) * RAD;
          beads[sel].visible = true;
          ctx.sound.thump(0.2);
          if (order.length === N - 1) ending = 1.4;
        }
      } else if (!done && !ending) {
        if (ctx.taps.has('left')) sel = Math.max(0, sel - 1);
        if (ctx.taps.has('right')) sel = Math.min(N - 2, sel + 1);
        if (ctx.taps.has('act')) {
          if (order.includes(sel)) ctx.hud.note('이미 용접한 이음입니다', 2);
          else busy = 1.1;
        }
      }
      // 변형은 식으면서 천천히 드러난다
      for (let j = 1; j < N; j++) bend[j] += (goal[j] - bend[j]) * Math.min(1, dt * 2.2);
      const s = shape(N, W, bend);
      place(strips, s);
      beads.forEach((b, k) => {
        b.position.set(s.pts[k + 1][0], s.pts[k + 1][1] + 0.06, 0);
        b.rotation.z = (s.ang[k] + s.ang[k + 1]) / 2;
      });
      torch.g.position.x = s.pts[sel + 1][0];
      torch.g.position.y = s.pts[sel + 1][1] + 0.1;
      if (busy <= 0) torch.g.position.z = 0;
      torch.tipMat.opacity = busy > 0 ? 1 : 0.4;
      if (done) return;
      const mm = order.length ? weldDistortion(order) : 0;
      ctx.hud.step(busy > 0 ? '용접 중…' : order.length ? '' : '어느 줄부터 용접할까요?');
      ctx.hud.read([`${sel + 1}번`, order.map((o) => o + 1).join(' → ') || '–', `${mm} mm`, `${N - 1 - order.length}줄`]);
      if (ending > 0) {
        ending -= dt;
        if (ending <= 0) {
          done = true;
          ctx.hud.result(
            mm <= 4 ? '판넬 용접 — 변형이 가장 작은 순서입니다' : '판넬 용접 — 판이 뒤틀렸습니다',
            [
              ['용접 순서', order.map((o) => o + 1).join(' → ')],
              ['판넬 변형', `${mm} mm`],
              ['곡직(불로 펴기)', mm > 6 ? `필요 — 약 ${((mm - 6) * 0.25).toFixed(1)}시간` : '필요 없음'],
            ],
            mm <= 4
              ? '가운데에서 바깥으로, 좌우를 번갈아 용접하면 수축이 바깥으로 풀려 변형이 작습니다.'
              : '바깥 이음을 먼저 용접하면 안쪽이 묶인 채 줄어들어 뒤틀리고, 한쪽만 이어 용접하면 한쪽으로 쏠립니다. 가운데에서 바깥으로, 좌우를 번갈아 용접해 보세요.',
          );
        }
      }
    },
    stop() {},
    debug: () => ({ sel, order: [...order], busy, done }),
  };
}

// ── PE장: 블록 수평 잡기 ─────────────────────────────────────
function levelTry(at: [number, number, number]): TryDef {
  const cx = at[0] - 50;
  const cz = at[2] + 28;
  const JX = 5.5;
  const JZ = 3.2;
  const BH = 1.5; // 받침의 기준 높이
  const EX = 25; // 높이 차이를 화면에서 과장하는 배율
  const NAMES = ['왼쪽 앞', '오른쪽 앞', '왼쪽 뒤', '오른쪽 뒤'];
  const AT: [number, number][] = [[-JX, JZ], [JX, JZ], [-JX, -JZ], [JX, -JZ]];
  const root = new THREE.Group();
  const jacks: THREE.Mesh[] = [];
  const jackMats: THREE.MeshStandardMaterial[] = [];
  const h = [0, 0, 0, 0];
  let block!: THREE.Mesh;
  let sel = 0;
  let t = 0;
  let moved = 0;
  let hold = 0;
  let done = false;
  const tilt = () => ({
    lr: (h[1] + h[3] - (h[0] + h[2])) / 2 / (2 * JX), // 좌우 기울기 mm/m(오른쪽이 높으면 +)
    fb: (h[0] + h[1] - (h[2] + h[3])) / 2 / (2 * JZ), // 앞뒤 기울기 mm/m(앞이 높으면 +)
    twist: h[0] - h[1] - h[2] + h[3], // 네 받침이 한 평면에 있지 않은 만큼(mm) = 뜬 받침의 틈
  });
  return {
    id: 'level',
    label: '블록 수평 잡기',
    hint: '받침 넷으로 기울기와 뜬 받침 없애기',
    station: 'pe',
    at: [at[0] - 52, at[2] + 28],
    title: '블록 수평 잡기',
    keys: '←→ 받침 고르기 · ↑↓ 올리기·내리기 · 기울기는 화면에서 25배 과장',
    reads: ['좌우 기울기', '앞뒤 기울기', '뜬 받침 틈', '고른 받침'],
    pad: [['left', '◀'], ['right', '▶'], ['up', '▲ 올림'], ['down', '▼ 내림']],
    cam: [cx - 16, 9.5, cz + 23], // 길가 가로등이 블록 앞에 오지 않는 쪽에서
    look: [cx, 2.2, cz],
    build(ctx) {
      root.position.set(cx, 0, cz);
      ctx.scene.add(root);
      block = new THREE.Mesh(unitBlockGeometry(), seams(new THREE.MeshStandardMaterial({ color: 0x8b4a3a, roughness: 0.75, metalness: 0.2, side: THREE.DoubleSide })));
      block.scale.set(14, 4, 9);
      block.castShadow = block.receiveShadow = true;
      block.position.y = BH + 2;
      root.add(block);
      const geo = new THREE.CylinderGeometry(0.45, 0.6, 1, 12).translate(0, 0.5, 0);
      AT.forEach(([x, z]) => {
        const m = std(0x8a9099, 0.6, 0.4);
        const j = new THREE.Mesh(geo, m);
        j.position.set(x, 0, z);
        j.scale.y = BH;
        j.castShadow = true;
        root.add(j);
        jacks.push(j);
        jackMats.push(m);
        box(root, 1.6, 0.16, 1.6, std(0x2f3338, 0.9, 0.1), x, 0.08, z);
      });
    },
    start(ctx) {
      for (let i = 0; i < 4; i++) h[i] = Math.round((ctx.day(10 + i) - 0.5) * 64);
      const s = tilt();
      if (Math.abs(s.lr) < 1 && Math.abs(s.fb) < 1 && Math.abs(s.twist) < 6) [h[0], h[1], h[2], h[3]] = [18, -14, -9, 22];
      sel = 0;
      t = moved = hold = 0;
      done = false;
      ctx.hud.note('블록을 이어 붙이기 전에 수평을 잡습니다. 두 기울기를 0 으로, 뜬 받침(붉은 받침)도 없게 맞추세요.', 8);
    },
    update(dt, ctx) {
      if (!done) {
        t += dt;
        if (ctx.taps.has('left')) sel = (sel + 3) % 4;
        if (ctx.taps.has('right')) sel = (sel + 1) % 4;
        const v = (ctx.held.has('up') ? 1 : 0) - (ctx.held.has('down') ? 1 : 0);
        if (v) {
          const d = v * 13 * dt;
          const nh = clamp(h[sel] + d, -60, 60);
          moved += Math.abs(nh - h[sel]);
          h[sel] = nh;
        }
      }
      const s = tilt();
      const mean = (h[0] + h[1] + h[2] + h[3]) / 4;
      block.position.y = BH + 2 + (mean * EX) / 1000;
      block.rotation.z = Math.atan(s.lr / 1000) * EX;
      block.rotation.x = -Math.atan(s.fb / 1000) * EX;
      // 뜬 받침: 비틀림이 있으면 낮은 짝(틈이 생기는 쪽)이 붉게 보인다
      const floating = Math.abs(s.twist) > 2 ? (s.twist > 0 ? [1, 2] : [0, 3]) : [];
      jacks.forEach((j, i) => {
        j.scale.y = BH + (h[i] * EX) / 1000 - (floating.includes(i) ? (Math.abs(s.twist) * EX) / 4000 : 0);
        jackMats[i].color.setHex(i === sel && !done ? 0xffd400 : floating.includes(i) ? 0xdc3b2a : 0x8a9099);
      });
      if (done) return;
      const ok = Math.abs(s.lr) <= 0.5 && Math.abs(s.fb) <= 0.5 && Math.abs(s.twist) <= 2;
      hold = ok ? hold + dt : 0;
      ctx.hud.step(ok ? '수평입니다 — 그대로…' : floating.length ? '붉은 받침이 떠 있습니다' : '');
      ctx.hud.read([`${s.lr.toFixed(1)} mm/m`, `${s.fb.toFixed(1)} mm/m`, `${Math.abs(s.twist).toFixed(0)} mm`, `${NAMES[sel]} ${h[sel] > 0 ? '+' : ''}${h[sel].toFixed(0)} mm`]);
      if (hold > 0.7) {
        done = true;
        ctx.sound.thump(0.3);
        ctx.hud.result(
          '블록 수평 — 맞았습니다',
          [
            ['좌우·앞뒤 기울기', `${s.lr.toFixed(1)} · ${s.fb.toFixed(1)} mm/m`],
            ['뜬 받침 틈', `${Math.abs(s.twist).toFixed(0)} mm`],
            ['받침을 움직인 양', `${Math.round(moved)} mm`],
            ['걸린 시간', `${Math.round(t)}초`],
          ],
          '블록은 받침 셋만으로도 서 있습니다. 넷째 받침이 뜨면 블록이 자기 무게로 뒤틀린 채 옆 블록과 이어지게 됩니다. 그래서 수평을 잡을 때는 기울기와 함께 뜬 받침을 봅니다.',
        );
      }
    },
    stop() {},
    debug: () => ({ h: [...h], sel, ...tilt(), done }),
  };
}

// ── 도장: 스프레이 ───────────────────────────────────────────
function sprayTry(at: [number, number, number]): TryDef {
  const cx = at[0] + 35;
  const cz = at[2] - 23.5; // 도장공장 열린 면(−z) 앞
  const COLS = 16;
  const ROWS = 8;
  const C = 0.5;
  const NDFT = 320; // 목표 건조 도막 두께(µm)
  const SAG = 560; // 이보다 두꺼우면 흘러내린다
  const RATE = 520; // 뿌리는 가운데의 두께 증가(µm/s)
  const R = 0.8;
  const LIMIT = 50;
  const n = COLS * ROWS;
  const th = new Float32Array(n);
  const root = new THREE.Group();
  let cells!: THREE.InstancedMesh;
  let gun!: THREE.Group;
  let cone!: THREE.Mesh;
  let u = 0;
  let v = 2;
  let t = 0;
  let done = false;
  const col = new THREE.Color();
  const PRIMER = new THREE.Color(0x9aa0a8);
  const COAT = new THREE.Color(0xa1412f);
  const RUN = new THREE.Color(0x4b1712);
  function paint() {
    for (let i = 0; i < n; i++) {
      if (th[i] > SAG) col.copy(RUN);
      else col.copy(PRIMER).lerp(COAT, Math.min(1, th[i] / NDFT) ** 0.8);
      cells.setColorAt(i, col);
    }
    if (cells.instanceColor) cells.instanceColor.needsUpdate = true;
  }
  function stats() {
    let ok = 0;
    let min = Infinity;
    let sag = 0;
    let sum = 0;
    for (let i = 0; i < n; i++) {
      if (th[i] >= NDFT) ok++;
      if (th[i] > SAG) sag++;
      min = Math.min(min, th[i]);
      sum += th[i];
    }
    return { pct: (ok / n) * 100, min, sag, avg: sum / n };
  }
  return {
    id: 'spray',
    label: '스프레이 도장',
    hint: '고르게 뿌려 목표 두께 채우기',
    station: 'paint',
    at: [at[0] + 50, at[2] - 18],
    title: '스프레이 도장',
    keys: '방향키 스프레이 옮기기 · Space 뿌리기(누르고 있기) · 한곳에 오래 뿌리면 흘러내립니다',
    reads: ['목표 두께(320 µm) 이상', '가장 얇은 곳', '흘러내린 칸', '남은 시간'],
    pad: [['left', '◀'], ['up', '▲'], ['down', '▼'], ['right', '▶']],
    act: 'Space 뿌리기',
    cam: [cx, 3.6, cz - 11.5],
    look: [cx, 2.7, cz],
    build(ctx) {
      root.position.set(cx, 0, cz);
      root.rotation.y = Math.PI; // 길 쪽(−z)에서 보므로 돌려 놓는다 → 벽이 카메라를 향하고 화면 오른쪽이 +x
      ctx.scene.add(root);
      const dark = std(0x3a3f46, 0.7, 0.4);
      box(root, COLS * C + 0.4, ROWS * C + 0.4, 0.3, dark, 0, 0.6 + (ROWS * C) / 2, -0.17);
      for (const sx of [-3.4, 3.4]) box(root, 0.3, 0.6, 2.2, dark, sx, 0.3, -0.6);
      cells = new THREE.InstancedMesh(new THREE.BoxGeometry(C - 0.03, C - 0.03, 0.05), new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.1 }), n);
      const m4 = new THREE.Matrix4();
      for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS; c++) cells.setMatrixAt(r * COLS + c, m4.makeTranslation(-(COLS * C) / 2 + (c + 0.5) * C, 0.6 + (r + 0.5) * C, 0.02));
      cells.receiveShadow = true;
      root.add(cells);
      gun = new THREE.Group();
      gun.add(new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.035, 8, 24), new THREE.MeshBasicMaterial({ color: 0xffd400, toneMapped: false })));
      cone = new THREE.Mesh(
        new THREE.ConeGeometry(R * 0.85, 1.0, 20, 1, true),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }),
      );
      cone.rotation.x = Math.PI / 2; // 꼭짓점이 카메라 쪽(+z), 넓은 쪽이 벽
      cone.position.z = -0.45;
      cone.visible = false;
      gun.add(cone);
      gun.position.set(0, 2.6, 1.05);
      root.add(gun);
      paint();
    },
    start(ctx) {
      th.fill(0);
      u = -(COLS * C) / 2 + 0.6;
      v = ROWS * C - 0.6;
      t = 0;
      done = false;
      paint();
      ctx.hud.note('회색 바탕이 모두 붉은 도막이 되게 뿌립니다. 스프레이를 움직이며 뿌리세요. 멈춘 채 뿌리면 도료가 흘러내려 검붉게 됩니다.', 8);
    },
    update(dt, ctx) {
      if (done) return;
      t += dt;
      u = clamp(u + ((ctx.held.has('right') ? 1 : 0) - (ctx.held.has('left') ? 1 : 0)) * 3 * dt, -(COLS * C) / 2, (COLS * C) / 2);
      v = clamp(v + ((ctx.held.has('up') ? 1 : 0) - (ctx.held.has('down') ? 1 : 0)) * 3 * dt, 0, ROWS * C);
      gun.position.set(u, 0.6 + v, 1.05);
      const on = ctx.held.has('act');
      cone.visible = on;
      if (on) {
        for (let r = 0; r < ROWS; r++)
          for (let c = 0; c < COLS; c++) {
            const dx = -(COLS * C) / 2 + (c + 0.5) * C - u;
            const dy = (r + 0.5) * C - v;
            const d2 = dx * dx + dy * dy;
            if (d2 < R * R) th[r * COLS + c] += RATE * (1 - d2 / (R * R)) * dt;
          }
        paint();
      }
      const s = stats();
      const pass = s.pct >= 90 && s.min >= NDFT * 0.9;
      ctx.hud.read([`${s.pct.toFixed(0)} %`, `${Math.round(s.min)} µm`, `${s.sag}칸`, `${Math.max(0, Math.ceil(LIMIT - t))}초`]);
      if (pass || t >= LIMIT) {
        done = true;
        cone.visible = false;
        ctx.sound.thump(0.3);
        ctx.hud.result(
          pass ? (s.sag ? '도막 두께는 통과 — 흘러내린 곳은 다시 칠해야 합니다' : '도막 검사 통과') : '도막 검사 불합격 — 얇은 곳이 남았습니다',
          [
            ['목표 두께(320 µm) 이상', `${s.pct.toFixed(0)} %`],
            ['가장 얇은 곳', `${Math.round(s.min)} µm`],
            ['흘러내린 칸(과도막)', s.sag ? `${s.sag}칸 — 갈아 내고 다시` : '없음'],
            ['평균 두께', `${Math.round(s.avg)} µm`],
            ['걸린 시간', `${Math.round(t)}초`],
          ],
          '도막 두께는 90/10 규칙으로 봅니다. 측정값의 90% 이상이 목표 두께 이상이고, 나머지도 목표의 90% 이상이어야 합니다. 평균이 목표보다 많이 두꺼우면 그만큼 도료를 더 쓴 것입니다.',
        );
      }
    },
    stop() {
      cone.visible = false;
    },
    debug: () => ({ u, v, t, ...stats(), done }),
  };
}

export function yardTries(stationAt: (id: string) => [number, number, number]): TryDef[] {
  return [heatTry(stationAt('cutting')), weldTry(stationAt('assembly')), levelTry(stationAt('pe')), sprayTry(stationAt('paint'))];
}
