/**
 * 바다 장소의 '직접 해 보기' 셋(2026-11-22, 틀은 try-frame.ts).
 * - 의장 안벽: 경사 시험 — 갑판의 추를 옮기고, 배의 흔들림이 잦아든 뒤 진자 눈금을 읽어 GM 을 구한다(일찍 읽으면 틀린다)
 * - 시운전: 직접 조타 — 타를 써도 늦게 도는 큰 배로 부표 문 넷을 지난다(미리 쓰고 미리 풀기)
 * - 인도: 명명식 — 병을 당겨 놓아 뱃머리 보강판에 맞혀 깬다(덜 당기면 안 깨지고, 바람에 좌우로 흔들린다)
 * 배는 이 셋이 함께 쓰는 한 척이다(처음 쓸 때 만들고, 체험이 끝나면 숨긴다). 원래 장면의 배(quay.ts, trial.ts, delivery.ts)는 건드리지 않는다.
 * 숫자는 모두 교육용 예시다. 조타는 1차 응답 모델(Nomoto: 타 이득 0.09 /s, 시정수 5 s — 실제 배보다 잘 듣게 잡음)이고 화면은 3배속, 경사 시험의 기울기는 화면에서 4배 과장한다.
 */
import * as THREE from 'three';
import { buildBulkCarrier } from './ship';
import { LIGHT_SHIP_T } from './launch-calc';
import type { TryCtx, TryDef } from './try-frame';

const RAD = Math.PI / 180;
const clamp = THREE.MathUtils.clamp;
const std = (color: number, roughness = 0.7, metalness = 0.2) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
const DRAFT = 7;

let seaShip: THREE.Group | null = null;
function shipAt(ctx: TryCtx, x: number, z: number, heading = 0) {
  if (!seaShip) {
    seaShip = buildBulkCarrier(true).ship;
    ctx.scene.add(seaShip);
  }
  seaShip.visible = true;
  seaShip.position.set(x, ctx.seaY - DRAFT, z);
  seaShip.rotation.set(0, heading, 0);
  return seaShip;
}
function hideShip() {
  if (!seaShip) return;
  seaShip.visible = false;
  seaShip.rotation.set(0, 0, 0);
}

// ── 의장 안벽: 경사 시험 ─────────────────────────────────────
function heelTry(at: [number, number, number]): TryDef {
  const sx = at[0];
  const sz = at[2] + 31; // 안벽(부두)의 바깥쪽에 댄다
  const WT = 30; // 추 하나(t)
  const ARM = 22; // 옮기는 거리(m)
  const PEND = 3000; // 진자 길이(mm)
  const EX = 4; // 기울기를 화면에서 과장하는 배율
  const OM = (2 * Math.PI) / 6.5; // 횡요 고유 각진동수
  const ZETA = 0.22;
  const kit = new THREE.Group();
  const weights: THREE.Mesh[] = [];
  let gm = 2.5;
  let phi = 0;
  let w = 0;
  let moved = 0;
  let phase: 'move' | 'read' = 'move';
  let readings: number[] = [];
  let t = 0;
  let done = false;
  const eq = () => Math.atan((moved * WT * ARM) / (LIGHT_SHIP_T * gm));
  return {
    id: 'heel',
    label: '경사 시험',
    hint: '추를 옮겨 배의 GM 구하기',
    station: 'quay',
    at: [at[0], at[2] + 54],
    title: '경사 시험',
    keys: 'Space 추 옮기기 → 흔들림이 잦아들면 Space 눈금 읽기(3번) · 기울기는 화면에서 4배 과장',
    reads: ['진자 눈금(3 m 진자)', '눈금이 변하는 빠르기', '옮긴 추 · 읽은 횟수', '시간'],
    pad: [],
    act: 'Space 추 옮기기',
    cam: [sx + 150, 52, sz + 44],
    look: [sx + 5, 10, sz],
    phoneBack: 1.5,
    build() {
      const yellow = std(0xe0b020, 0.6, 0.2);
      for (const x of [-30, -10, 10]) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 3), yellow);
        m.position.set(x, 19.5, -ARM / 2);
        m.castShadow = true;
        kit.add(m);
        weights.push(m);
      }
    },
    start(ctx) {
      gm = 1.9 + 1.2 * ctx.day(31);
      shipAt(ctx, sx, sz).add(kit);
      phi = w = t = 0;
      moved = 0;
      phase = 'move';
      readings = [];
      done = false;
      for (const m of weights) m.position.z = -ARM / 2;
      ctx.hud.act('Space 추 옮기기');
      ctx.hud.note('갑판의 노란 추(30 t)를 반대쪽 뱃전으로 옮기면 배가 기웁니다. 그 기울기로 무게중심 높이(GM)를 구합니다.', 8);
    },
    update(dt, ctx) {
      t += done ? 0 : dt;
      // 횡요: 추를 옮기면 새 평형 둘레로 흔들리다 잦아든다
      const steps = Math.max(1, Math.ceil(dt / 0.02));
      const h = dt / steps;
      for (let i = 0; i < steps; i++) {
        w += (-OM * OM * (phi - eq()) - 2 * ZETA * OM * w) * h;
        phi += w * h;
      }
      weights.forEach((m, i) => {
        const to = i < moved ? ARM / 2 : -ARM / 2;
        m.position.z += clamp(to - m.position.z, -9 * dt, 9 * dt);
      });
      if (seaShip) seaShip.rotation.x = phi * EX;
      if (done) return;
      if (ctx.taps.has('act')) {
        if (phase === 'move') {
          moved++;
          phase = 'read';
          ctx.hud.act('Space 눈금 읽기');
          ctx.sound.thump(0.2);
        } else {
          readings.push(Math.tan(phi));
          if (readings.length < 3) {
            phase = 'move';
            ctx.hud.act('Space 추 옮기기');
          }
        }
      }
      const mm = PEND * Math.tan(phi);
      const rate = Math.abs(PEND * w);
      ctx.hud.step(phase === 'read' ? (rate > 4 ? '배가 흔들리는 중 — 잦아들 때까지 기다리기' : '잦아들었습니다 — 눈금 읽기') : `추 ${moved + 1}번째를 옮기세요`);
      ctx.hud.read([`${mm.toFixed(0)} mm`, `${rate.toFixed(0)} mm/s`, `${moved}개 · ${readings.length}번`, `${Math.round(t)}초`]);
      if (readings.length === 3) {
        done = true;
        const each = readings.map((tan, k) => ((k + 1) * WT * ARM) / (LIGHT_SHIP_T * Math.max(1e-4, tan)));
        const got = each.reduce((s, v) => s + v, 0) / each.length;
        const err = (Math.abs(got - gm) / gm) * 100;
        ctx.hud.result(
          err <= 5 ? '경사 시험 — GM 을 바르게 구했습니다' : '경사 시험 — 읽은 값이 흔들렸습니다',
          [
            ['구한 GM', `${got.toFixed(2)} m`],
            ['이 배의 GM(참값)', `${gm.toFixed(2)} m`],
            ['오차', `${err.toFixed(0)} %`],
            ['걸린 시간', `${Math.round(t)}초`],
          ],
          err <= 5
            ? 'GM = (추 무게 × 옮긴 거리) ÷ (배수량 × tan 기울기). 경사 시험에서 구한 무게중심 높이가 복원성 계산의 출발점이 됩니다.'
            : '추를 옮긴 직후에는 배가 좌우로 흔들립니다. 진자가 잦아든 뒤에 읽어야 합니다. 실제 경사 시험도 바람과 물결이 잔잔한 때를 골라 계류줄을 느슨히 하고 합니다.',
        );
      }
    },
    stop() {
      kit.removeFromParent();
      hideShip();
    },
    debug: () => ({ phi, eq: eq(), w, moved, phase, readings: [...readings], gm, done }),
  };
}

// ── 시운전: 직접 조타 ────────────────────────────────────────
function helmTry(): TryDef {
  const X0 = 520;
  const Z0 = 230;
  const GAP = 280;
  const NG = 4;
  const HALF = 30; // 문의 반폭
  const U = 7.2; // 14 노트
  const TS = 3; // 화면 배속
  const K = 0.09; // 타 이득(1/s)
  const TT = 5; // 따라오는 시간(s)
  const DMAX = 35 * RAD;
  const DRATE = 9 * RAD;
  const buoys: THREE.Mesh[] = [];
  const gates: { x: number; cz: number }[] = [];
  const fwd = new THREE.Vector3();
  let x = X0;
  let z = Z0;
  let psi = 0;
  let r = 0;
  let delta = 0;
  let next = 0;
  let passed = 0;
  let worst = 0;
  let maxD = 0;
  let t = 0;
  let done = false;
  function camera(ctx: TryCtx) {
    fwd.set(Math.cos(psi), 0, -Math.sin(psi));
    // 휴대폰은 더 뒤·위에서, 보는 점을 물 아래로 내려 배가 조작판 위에 오게
    const back = ctx.phone ? 330 : 215;
    ctx.camera.position.set(x - fwd.x * back, ctx.phone ? 210 : 118, z - fwd.z * back);
    ctx.controls.target.set(x + fwd.x * 150, ctx.phone ? -90 : 0, z + fwd.z * 150);
  }
  return {
    id: 'helm',
    label: '직접 조타',
    hint: '늦게 도는 큰 배로 부표 문 지나기',
    station: 'trial',
    at: [640, 200],
    title: '직접 조타(시운전)',
    keys: '←→ 타 쓰기(누르고 있는 동안, 놓으면 중앙으로) · 화면은 3배속',
    reads: ['타각', '선회율', '다음 문까지', '지난 문'],
    pad: [['left', '◀ 좌현 타'], ['right', '우현 타 ▶']],
    cam: [X0 - 215, 118, Z0],
    look: [X0 + 150, 0, Z0],
    ownCamera: true,
    build(ctx) {
      const red = std(0xc8261b, 0.6, 0.1);
      const green = std(0x1f8a3a, 0.6, 0.1);
      const geo = new THREE.CylinderGeometry(2.2, 5, 18, 12); // 멀리서도 보이게 실제 부표보다 크게
      for (let k = 0; k < NG; k++) {
        for (const m of [red, green]) {
          const b = new THREE.Mesh(geo, m);
          b.castShadow = true;
          ctx.scene.add(b);
          buoys.push(b);
        }
        gates.push({ x: X0 + (k + 1) * GAP, cz: Z0 });
      }
      place(ctx.seaY, 1);
    },
    start(ctx) {
      place(ctx.seaY, ctx.day(51) < 0.5 ? 1 : -1);
      x = X0;
      z = Z0;
      psi = r = delta = 0;
      next = passed = 0;
      worst = maxD = t = 0;
      done = false;
      shipAt(ctx, x, z, psi);
      camera(ctx);
      ctx.hud.note('빨강·초록 부표 사이 문 넷을 차례로 지나세요. 타를 써도 한참 뒤에 머리가 돌고, 타를 풀어도 계속 돕니다.', 8);
    },
    update(dt, ctx) {
      if (done) return;
      const s = dt * TS;
      t += dt;
      const cmd = ((ctx.held.has('right') ? 1 : 0) - (ctx.held.has('left') ? 1 : 0)) * DMAX;
      delta += clamp(cmd - delta, -DRATE * s, DRATE * s);
      maxD = Math.max(maxD, Math.abs(delta));
      r += ((K * delta - r) / TT) * s;
      psi -= r * s; // 우현 타(+) → 화면 오른쪽으로 돈다
      x += U * Math.cos(psi) * s;
      z -= U * Math.sin(psi) * s;
      const ship = shipAt(ctx, x, z, psi);
      ship.rotation.x = r * 2.2; // 선회 중의 가벼운 기울기(보기용)
      camera(ctx);
      const g = gates[next];
      if (g && x >= g.x) {
        const miss = z - g.cz;
        worst = Math.max(worst, Math.abs(miss));
        if (Math.abs(miss) <= HALF - 8) {
          passed++;
          ctx.sound.thump(0.3);
          ctx.hud.note(`${next + 1}번 문 통과 — 가운데에서 ${Math.abs(miss).toFixed(0)} m`, 3);
        } else ctx.hud.note(`${next + 1}번 문을 벗어났습니다 — ${Math.abs(miss).toFixed(0)} m`, 3);
        next++;
      }
      const last = gates[NG - 1].x;
      ctx.hud.step(g ? `${next + 1}번 문은 ${g.cz - z > 0 ? '오른쪽' : '왼쪽'}으로 ${Math.abs(g.cz - z).toFixed(0)} m` : '마지막 문을 지났습니다');
      ctx.hud.read([
        `${Math.abs(delta / RAD).toFixed(0)}° ${delta > 0.01 ? '우현' : delta < -0.01 ? '좌현' : '중앙'}`,
        `${((r / RAD) * TS).toFixed(1)} °/s`,
        g ? `${Math.max(0, g.x - x).toFixed(0)} m` : '–',
        `${passed}/${NG}`,
      ]);
      if ((!g && x > last + 90) || Math.abs(z - Z0) > 420 || t > 120) {
        done = true;
        ctx.sound.horn();
        ctx.hud.result(
          passed === NG ? '조타 — 문 넷을 모두 지났습니다' : `조타 — 문 ${NG}개 가운데 ${passed}개를 지났습니다`,
          [
            ['지난 문', `${passed}/${NG}`],
            ['문 가운데에서 가장 멀리', `${worst.toFixed(0)} m`],
            ['가장 크게 쓴 타각', `${(maxD / RAD).toFixed(0)}°`],
            ['걸린 시간(화면)', `${Math.round(t)}초`],
          ],
          '큰 배는 타를 써도 한참 뒤에야 머리가 돌고, 타를 풀어도 계속 돕니다. 문에 닿기 전에 미리 쓰고 미리 풀어야 합니다. 시운전의 지그재그 시험은 이 늦게 따라오는 정도(오버슈트)를 재는 시험입니다.',
        );
      }
    },
    stop() {
      hideShip();
    },
    debug: () => ({ x, z, psi, r, delta, next, gates, passed, done }),
  };
  /** 부표 자리: 문은 좌우로 번갈아 40 m 씩 비켜 있다(sign 은 날짜로) */
  function place(seaY: number, sign: number) {
    gates.forEach((g, k) => {
      g.cz = Z0 + (k % 2 ? -1 : 1) * 32 * sign;
      buoys[k * 2].position.set(g.x, seaY + 8, g.cz - HALF);
      buoys[k * 2 + 1].position.set(g.x, seaY + 8, g.cz + HALF);
    });
  }
}

// ── 인도: 명명식 ─────────────────────────────────────────────
function bottleTry(at: [number, number, number]): TryDef {
  const sx = at[0];
  const sz = at[2] - 31; // 인도 안벽의 바깥쪽
  const L = 9; // 줄 길이
  const G = 9.81;
  const NEED = 7; // 이 속도(m/s)보다 빨라야 깨진다
  const PLATE = 1.1; // 보강판의 반폭
  const rig = new THREE.Group(); // 뱃머리의 줄걸이(배에 붙인다)
  const UP = new THREE.Vector3(0, 1, 0);
  const dir = new THREE.Vector3();
  let rope!: THREE.Mesh;
  let bottle!: THREE.Mesh;
  let shards!: THREE.Points;
  const vel: THREE.Vector3[] = [];
  let theta = 0;
  let om = 0;
  let lat = 0;
  let phase: 'aim' | 'swing' | 'bounce' | 'broken' = 'aim';
  let wait = 0;
  let attempts = 1;
  let hitV = 0;
  let t = 0;
  let done = false;
  function pose() {
    const bx = Math.sin(theta) * L;
    const by = -Math.cos(theta) * L;
    bottle.position.set(bx, by, lat);
    dir.set(bx, by, lat);
    rope.position.copy(dir).multiplyScalar(0.5);
    rope.scale.y = dir.length();
    rope.quaternion.setFromUnitVectors(UP, dir.normalize());
    bottle.quaternion.copy(rope.quaternion);
  }
  return {
    id: 'bottle',
    label: '명명식',
    hint: '병을 당겨 놓아 뱃머리에 깨기',
    station: 'delivery',
    at: [at[0], at[2] - 54],
    title: '명명식 — 병 깨기',
    keys: 'Space 를 누르고 있으면 병을 당깁니다 · 놓으면 떨어집니다 · 병은 바람에 좌우로 흔들립니다',
    reads: ['당긴 각도', '좌우로 벗어남', '시도'],
    pad: [],
    act: 'Space 당기기',
    cam: [sx + 127, 14, sz - 21], // 바다 쪽에서(부두 위에서 보면 단상과 계선주가 화면을 가린다)
    look: [sx + 97, 10, sz],
    phoneBack: 1.25,
    build() {
      rig.position.set(96.5, 22, 0);
      rig.add(new THREE.Mesh(new THREE.BoxGeometry(3, 0.4, 0.4), std(0x2a2e35, 0.6, 0.5)));
      rope = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1, 6), std(0xe9e4d2, 0.8, 0));
      bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 1.1, 10), std(0x1f6b3a, 0.25, 0.2));
      // 뱃머리에 매단 타격판(보강판): 선체 모양과 상관없이 병이 닿는 자리에 온다
      const white = std(0xe9edf1, 0.5, 0.4);
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.25, 2.6, PLATE * 2), white);
      plate.position.set(-0.4, -L, 0);
      const dark = std(0x2a2e35, 0.6, 0.5);
      for (const z of [-PLATE + 0.1, PLATE - 0.1]) {
        const rod = new THREE.Mesh(new THREE.BoxGeometry(0.12, L - 1.3, 0.12), dark);
        rod.position.set(-0.4, -(L - 1.3) / 2, z);
        rig.add(rod);
      }
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.45, 4.2, 0.45), dark);
      post.position.set(-1.3, -2.1, 0);
      rig.add(post);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(60 * 3), 3));
      shards = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xd8f5e0, size: 0.22, transparent: true, opacity: 0 }));
      shards.frustumCulled = false;
      for (let i = 0; i < 60; i++) vel.push(new THREE.Vector3());
      rig.add(rope, bottle, plate, shards);
    },
    start(ctx) {
      shipAt(ctx, sx, sz).add(rig);
      theta = 12 * RAD;
      om = 0;
      phase = 'aim';
      attempts = 1;
      t = wait = 0;
      done = false;
      bottle.visible = true;
      (shards.material as THREE.PointsMaterial).opacity = 0;
      pose();
      ctx.hud.note('병을 충분히 당겨, 뱃머리의 흰 보강판 앞에 왔을 때 놓으세요. 덜 당기면 깨지지 않습니다.', 8);
    },
    update(dt, ctx) {
      t += dt;
      if (phase === 'aim') {
        lat = 2.3 * Math.sin(t * 1.15) + 0.6 * Math.sin(t * 2.7); // 바람에 좌우로
        if (ctx.held.has('act')) theta = Math.min(75 * RAD, theta + 38 * RAD * dt);
        else if (theta > 16 * RAD) {
          phase = 'swing';
          om = 0;
        }
      } else if (phase === 'swing' || phase === 'bounce') {
        const steps = Math.max(1, Math.ceil(dt / 0.008));
        const h = dt / steps;
        for (let i = 0; i < steps; i++) {
          om += -(G / L) * Math.sin(theta) * h - (phase === 'bounce' ? 1.4 * om * h : 0);
          theta += om * h;
          if (theta <= 0) {
            theta = 0;
            if (phase === 'swing') {
              hitV = L * Math.abs(om);
              if (hitV >= NEED && Math.abs(lat) <= PLATE) {
                phase = 'broken';
                wait = 1.6;
                bottle.visible = false;
                const pos = shards.geometry.attributes.position as THREE.BufferAttribute;
                for (let k = 0; k < 60; k++) {
                  pos.setXYZ(k, 0, -L, lat);
                  vel[k].set(2 + Math.random() * 7, (Math.random() - 0.2) * 7, (Math.random() - 0.5) * 9);
                }
                pos.needsUpdate = true;
                (shards.material as THREE.PointsMaterial).opacity = 1;
                ctx.sound.thump(0.9);
                ctx.sound.horn();
              } else {
                phase = 'bounce';
                wait = 2.4;
                om = Math.abs(om) * 0.35;
                ctx.sound.thump(0.3);
                ctx.hud.note(
                  hitV < NEED
                    ? `깨지지 않았습니다 — 닿는 속도 ${hitV.toFixed(1)} m/s. 더 당겨서 다시`
                    : `보강판에서 ${Math.abs(lat).toFixed(1)} m 벗어나 맞았습니다. 가운데에 왔을 때 놓으세요`,
                  4,
                );
              }
            } else om = Math.abs(om) * 0.3;
            break;
          }
        }
        if (phase === 'bounce') {
          wait -= dt;
          if (wait <= 0) {
            phase = 'aim';
            theta = 12 * RAD;
            attempts++;
          }
        }
      } else if (!done) {
        // 깨진 조각이 흩어진다
        const pos = shards.geometry.attributes.position as THREE.BufferAttribute;
        for (let k = 0; k < 60; k++) {
          vel[k].y -= G * dt;
          pos.setXYZ(k, pos.getX(k) + vel[k].x * dt, pos.getY(k) + vel[k].y * dt, pos.getZ(k) + vel[k].z * dt);
        }
        pos.needsUpdate = true;
        wait -= dt;
        (shards.material as THREE.PointsMaterial).opacity = Math.max(0, wait / 1.6);
        if (wait <= 0) {
          done = true;
          ctx.hud.result(
            attempts === 1 ? '명명 — 병이 한 번에 깨졌습니다' : `명명 — ${attempts}번째에 병이 깨졌습니다`,
            [
              ['닿는 속도', `${hitV.toFixed(1)} m/s`],
              ['보강판 가운데에서', `${Math.abs(lat).toFixed(1)} m`],
              ['시도', `${attempts}번`],
            ],
            '줄에 매달린 병은 진자처럼 떨어집니다. 닿는 속도는 당긴 각도로 정해집니다: v = √(2gL(1 − cos θ)). 명명식에서 병이 한 번에 깨지는 것을 좋은 징조로 여깁니다.',
          );
        }
      }
      if (phase !== 'broken') pose();
      if (done) return;
      ctx.hud.act(phase === 'aim' ? 'Space 당기기' : '…');
      ctx.hud.step(phase === 'aim' ? (theta < 44 * RAD ? '더 당기기' : Math.abs(lat) <= PLATE ? '지금 놓기' : '보강판 앞에 올 때까지 기다리기') : '');
      ctx.hud.read([`${(theta / RAD).toFixed(0)}°`, `${Math.abs(lat).toFixed(1)} m`, `${attempts}번째`]);
    },
    stop() {
      rig.removeFromParent();
      hideShip();
    },
    debug: () => ({ theta: theta / RAD, lat, phase, attempts, done }),
  };
}

export function seaTries(stationAt: (id: string) => [number, number, number]): TryDef[] {
  return [heelTry(stationAt('quay')), helmTry(), bottleTry(stationAt('delivery'))];
}
