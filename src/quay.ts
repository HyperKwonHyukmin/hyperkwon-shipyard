/**
 * P3-2 의장 안벽(공식 공정 9 후행의장). 진수한 배가 안벽에 붙어 마무리 의장을 하고 시운전 해역으로 떠난다.
 *  예인선이 배를 안벽에 붙임 → 계류줄 → 안벽 크레인이 부두에 내려 둔 의장품 5개를 배에 올림
 *  (갑판 크레인 4기, 구명정 — 올릴 때마다 받침 용접 불꽃) → 계류 상태로 엔진을 돌려 봄(연돌 연기)
 *  → 계류줄을 풀고 예인선이 시운전 해역 쪽으로 데려감 → 다음 배가 들어옴. 한 순환 약 190초.
 * 배는 도크의 배와 따로 둔 한 척(buildBulkCarrier 를 한 번 더). 진수 장면과 시간은 맞추지 않는다.
 * 좌표: 안벽 중심 at(yard.ts 의 부두 300×26 m, 윗면 y = 0). 배는 부두의 -z 쪽(도크 쪽) 가장자리에 붙는다.
 * 바다 쪽(-z)에서 보면 +x 가 화면 왼쪽이라, 크레인은 +x 의장품부터 차례로 올린다.
 */
import * as THREE from 'three';
import { buildBulkCarrier, SHIP } from './ship';
import { createBerth } from './berth';
import { FM, std, part, boxG, sequence, sparks, glowTexture, lerp, inOut, type Step } from './factory/shed';

interface Options {
  seaY: number;
  /** 뜬 배의 흘수(기선에서 수면까지) */
  draft: number;
}

/** 받침 있는 말이면 a, 없으면 b(을/를 등) */
const josa = (w: string, a: string, b: string) => ((w.charCodeAt(w.length - 1) - 0xac00) % 28 ? w + a : w + b);

const L_JIB = 46; // 안벽 크레인 지브 길이
const TOWER_H = 30;
const SAFE_Y = 34; // 의장품을 들고 옮기는 높이(월드). 구명정이 레이더 마스트(약 26 m)를 넘게

/** 갑판 크레인(받침 기둥 + 운전실 + 접어 둔 붐). 원점 = 받침 바닥, 높이 약 9 m */
function deckCrane() {
  const g = new THREE.Group();
  const white = std(0xd8d4c8, 0.6, 0.2);
  part(g, new THREE.CylinderGeometry(1.2, 1.4, 6, 14), white, 0, 3, 0);
  part(g, boxG(4.2, 3, 4), white, 0, 7.5, 0);
  part(g, boxG(1.4, 1.2, 1.2), FM.dark, -1.6, 7.9, 1.6); // 운전실 창
  const boom = part(g, boxG(20, 0.9, 0.9), FM.crane, 10, 7.2, 0);
  boom.rotation.z = -0.1;
  return { object: g, top: 9 };
}

/** 구명정(주황 선체 + 덮개)과 대빗 받침. 원점 = 받침 바닥. 바다 쪽(-z) 거주구 옆에 달아 시점에서 보이게 */
function lifeboat() {
  const g = new THREE.Group();
  const orange = std(0xf07a1a, 0.55);
  part(g, boxG(7.5, 1.6, 2.8), orange, 0, 1.4, 0);
  part(g, boxG(6.5, 1.1, 2.4), orange, 0, 2.7, 0);
  part(g, boxG(7.5, 0.25, 2.9), std(0xdedcd2, 0.6), 0, 2.15, 0);
  for (const dx of [-2.8, 2.8]) part(g, boxG(0.4, 3.6, 0.4), FM.steel, dx, 1.8, 1.6); // 대빗(거주구 쪽 +z)
  return { object: g, top: 3.4 };
}

export function createQuay(scene: THREE.Scene, at: [number, number, number], o: Options) {
  const [ax, , az] = at;
  const root = new THREE.Group();
  scene.add(root);

  // ── 배 ──
  const { ship } = buildBulkCarrier();
  root.add(ship);
  // 계류 위치, 계류줄, 예인선은 공용(berth.ts). 배는 부두의 -z 쪽
  const berth = createBerth(root, ship, { ax, az, d: -1, seaY: o.seaY, draft: o.draft });
  const { keelY, setRopes, placeTugs } = berth;
  const EDGE_Z = berth.edgeZ;
  const MOOR_Z = berth.moorZ;
  const OFF_Z = berth.offZ;
  const DECK = berth.deckY;
  ship.position.set(ax, keelY, MOOR_Z);

  // ── 안벽 크레인(부두 위 레일을 따라 x 로 움직이고, 지브를 세웠다 눕혀 반경을 바꿈) ──
  const TOWER_Z = az + 1;
  const PIVOT_Z = TOWER_Z - 1.5;
  for (const dz of [-4.5, 4.5]) part(root, boxG(300, 0.3, 0.5), FM.steel, ax, 0.15, TOWER_Z + dz, false);
  const crane = new THREE.Group();
  crane.position.set(ax, 0, TOWER_Z);
  root.add(crane);
  part(crane, boxG(10, 2.4, 10), FM.craneDark, 0, 1.2, 0);
  for (const sx of [-3.5, 3.5]) for (const sz of [-3.5, 3.5]) part(crane, boxG(1.2, 10, 1.2), FM.crane, sx, 7, sz);
  part(crane, boxG(9, 1.6, 9), FM.crane, 0, 12.8, 0);
  part(crane, boxG(3.2, TOWER_H - 13, 3.2), FM.crane, 0, (TOWER_H + 13) / 2, 0);
  part(crane, boxG(7, 4, 6), std(0xdedcd2, 0.6), 0, TOWER_H + 1, 2.5); // 기계실
  part(crane, boxG(2.4, 2, 2.2), FM.craneDark, 2.6, TOWER_H - 0.2, -1.6); // 운전실
  const jib = new THREE.Group();
  jib.position.set(0, TOWER_H + 2, PIVOT_Z - TOWER_Z);
  crane.add(jib);
  part(jib, boxG(1.6, 1.6, L_JIB), FM.crane, 0, 0, -L_JIB / 2);
  part(jib, boxG(1, 1, 3), FM.craneDark, 0, -0.6, -L_JIB);
  const hook = new THREE.Group();
  root.add(hook);
  part(hook, boxG(1.6, 1, 1), FM.crane, 0, 0.5, 0);
  const cable = part(root, new THREE.CylinderGeometry(0.08, 0.08, 1, 6), FM.steel, 0, 0, 0, false);

  let reach = 6; // 지브 끝의 수평 반경
  let hookY = SAFE_Y;
  const tip = new THREE.Vector3();
  function placeCrane() {
    const r = THREE.MathUtils.clamp(reach, 4, L_JIB - 1);
    const phi = Math.acos(r / L_JIB);
    jib.rotation.x = phi;
    tip.set(crane.position.x, TOWER_H + 2 + L_JIB * Math.sin(phi), PIVOT_Z - r);
    hook.position.set(tip.x, hookY, tip.z);
    const len = tip.y - (hookY + 1);
    cable.position.set(tip.x, hookY + 1 + len / 2, tip.z);
    cable.scale.y = Math.max(0.1, len);
  }
  placeCrane();

  // ── 의장품: 부두에 내려 둔 자리(pier)와 배 위 자리(local) ──
  const items = [
    ...[41, 17, -7, -31].map((x, i) => ({ ...deckCrane(), name: `갑판 크레인 ${4 - i}호기`, local: new THREE.Vector3(x, SHIP.depth, 0) })),
    { ...lifeboat(), name: '구명정', local: new THREE.Vector3(-79, SHIP.depth + 5.6, -12.5) },
  ].map((it) => ({ ...it, pier: new THREE.Vector3(ax + it.local.x, 0, az - 6) }));
  function resetItems() {
    for (const it of items) {
      root.add(it.object);
      it.object.position.copy(it.pier);
      it.object.rotation.set(0, 0, 0);
    }
  }
  resetItems();

  setRopes(1);

  // ── 불꽃(받침 용접)과 연돌 연기 ──
  const fx = sparks(root, 300, [1, 0.8, 0.45]);
  let weldAt: THREE.Vector3 | null = null;
  let weldLeft = 0;
  const smokeTex = glowTexture('rgba(120,120,125,0.55)', 'rgba(120,120,125,0)');
  const puffs = Array.from({ length: 14 }, () => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, transparent: true, depthWrite: false, opacity: 0 }));
    s.visible = false;
    root.add(s);
    return { s, age: 0, life: 0 };
  });
  let smoking = false;
  let puffTimer = 0;
  function updateSmoke(dt: number) {
    puffTimer -= dt;
    if (smoking && puffTimer <= 0) {
      puffTimer = 0.45;
      const p = puffs.find((q) => q.life <= 0);
      if (p) {
        p.age = 0;
        p.life = 5;
        p.s.visible = true;
        p.s.position.set(ship.position.x - 89, DECK + 17.5, ship.position.z);
      }
    }
    for (const p of puffs) {
      if (p.life <= 0) continue;
      p.age += dt;
      const k = p.age / p.life;
      if (k >= 1) {
        p.life = 0;
        p.s.visible = false;
        continue;
      }
      p.s.position.y += dt * 3;
      p.s.position.x -= dt * 2.5; // 바람
      const size = 3 + k * 9;
      p.s.scale.set(size, size, 1);
      (p.s.material as THREE.SpriteMaterial).opacity = 0.7 * (1 - k);
    }
  }

  // 밤 투광등 1개(장소당 조명 1개 이하 — CLAUDE.md). 점광원은 낮 바다에 하얀 반사 얼룩이 생겨 쓰지 않고,
  // 투광등(SpotLight)은 daynight.ts 가 낮에 끈다. 그림자는 그리지 않는다
  const flood = new THREE.SpotLight(0xffc98a, 9000, 220, Math.PI / 3.2, 0.6, 2);
  flood.position.set(ax - 20, 30, EDGE_Z + 10);
  flood.target.position.set(ax, DECK, MOOR_Z);
  root.add(flood, flood.target);

  // ── 단계 ──
  const moveTo = (x: () => number, r: () => number, dur: number, label: string): Step => {
    let x0 = 0;
    let r0 = 0;
    return {
      dur,
      label,
      enter: () => {
        x0 = crane.position.x;
        r0 = reach;
      },
      apply: (k) => {
        crane.position.x = lerp(x0, x(), inOut(k));
        reach = lerp(r0, r(), inOut(k));
        placeCrane();
      },
    };
  };
  const hookTo = (y: () => number, dur: number, label: string): Step => {
    let y0 = 0;
    return {
      dur,
      label,
      enter: () => (y0 = hookY),
      apply: (k) => {
        hookY = lerp(y0, y(), inOut(k));
        placeCrane();
      },
    };
  };
  const target = (it: (typeof items)[number]) => it.local.clone().add(ship.position);

  const build = (): Step[] => {
    const steps: Step[] = [
      {
        dur: 14,
        label: '예인선이 진수한 배를 안벽에 붙임',
        enter: () => {
          resetItems();
          setRopes(0);
          smoking = false;
          ship.visible = true;
        },
        apply: (k) => {
          ship.position.set(ax, keelY, lerp(OFF_Z, MOOR_Z, inOut(k)));
          placeTugs('side');
        },
      },
      {
        dur: 4,
        label: '계류줄로 배를 안벽에 묶음',
        enter: () => placeTugs('hide'),
        apply: (k) => setRopes(k),
      },
    ];
    for (const it of items) {
      steps.push(
        moveTo(() => it.pier.x, () => PIVOT_Z - it.pier.z, 5, `안벽 크레인이 ${it.name} 쪽으로 이동`),
        hookTo(() => it.pier.y + it.top, 3, `${it.name}에 훅을 걺`),
        {
          dur: 0.8,
          label: `${it.name}에 훅을 걺`,
          enter: () => {
            root.updateMatrixWorld(true);
            hook.attach(it.object);
          },
        },
        hookTo(() => SAFE_Y, 3, `${josa(it.name, '을', '를')} 들어 올림`),
        moveTo(() => target(it).x, () => PIVOT_Z - target(it).z, 5, `${josa(it.name, '을', '를')} 배 위로 옮김`),
        hookTo(() => target(it).y + it.top, 3, `${josa(it.name, '을', '를')} 제자리에 내림`),
        {
          dur: 3,
          label: `${it.name} 받침을 용접`,
          enter: () => {
            root.updateMatrixWorld(true);
            ship.attach(it.object);
            weldAt = target(it);
            weldLeft = 3;
          },
        },
        hookTo(() => SAFE_Y, 2, '훅을 올림'),
      );
    }
    steps.push(
      moveTo(() => ax + 75, () => 6, 6, '크레인이 물러남 — 거주구 내부·전기 마무리'),
      {
        dur: 12,
        label: '계류한 채 엔진을 돌려 봄(계류 시운전)',
        enter: () => (smoking = true),
      },
      {
        dur: 4,
        label: '계류줄을 풂',
        enter: () => (smoking = false),
        apply: (k) => setRopes(1 - k),
      },
      {
        dur: 8,
        label: '예인선이 배를 안벽에서 떼어 냄',
        apply: (k) => {
          ship.position.z = lerp(MOOR_Z, OFF_Z, inOut(k));
          placeTugs('side');
        },
      },
      {
        dur: 14,
        label: '시운전 해역으로 떠남',
        apply: (k) => {
          ship.position.x = lerp(ax, ax + 320, k * k);
          placeTugs('ahead');
        },
      },
      {
        dur: 5,
        label: '다음 배를 기다림 — 부두에 다음 의장품을 내려 둠',
        enter: () => {
          resetItems();
          ship.visible = false;
          placeTugs('hide');
          ship.position.x = ax;
        },
      },
    );
    return steps;
  };
  const main = sequence(build);

  function update(machineDt: number) {
    main.update(machineDt);
    if (weldAt && weldLeft > 0) {
      weldLeft -= machineDt;
      fx.emit(weldAt, 3);
    }
    fx.update(machineDt);
    updateSmoke(machineDt);
  }
  return { update, status: () => main.label() };
}
