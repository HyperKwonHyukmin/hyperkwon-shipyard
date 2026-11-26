/**
 * 블록 세우기(턴오버) 장면(2026-11-22 사용자: "조선소에서 일해 본 사람이 탄성을 낼 기능").
 * 도크 옆 문형 크레인의 트롤리 두 대가 눕혀 만든 블록을 세운다. 세우는 동안 두 훅의 하중이 어떻게 옮겨 가는지를
 * 와이어 색과 숫자로 보여 준다(힘 보기와 같은 색: 파랑 가벼움 → 빨강 무거움). 계산은 turnover-calc.ts.
 * 러그 높이(e)를 바꾸면 보조 훅이 느슨해지는 각도가 달라진다 — 러그 위치가 인양 계획을 정한다는 것이 요점.
 * 180° 뒤집기의 뒤 절반(보조 훅을 반대쪽으로 옮겨 거는 구간)은 와이어가 비스듬해져 이 계산으로 다루지 않는다.
 */
import * as THREE from 'three';
import { unitBlockGeometry, seams } from './blockgen';
import { mergeStatic } from './merge';
import { slackAngle, solveTurn } from './turnover-calc';

const W = 320; // 블록 무게(t, 예시)
const A = 8; // 러그 사이 거리의 절반(m)
const LEN = 18; // 블록 길이·두께·폭
const THICK = 5;
const WIDE = 12;
const TROLLEY_Y = 37;
const fmt = (n: number) => Math.round(n).toLocaleString('ko-KR');

export function createTurnover(scene: THREE.Scene, center: [number, number, number], hud: HTMLElement, o: { onClose: () => void }) {
  const [cx, , cz] = center;
  const root = new THREE.Group();
  root.position.set(cx, 0, cz);
  scene.add(root);
  const std = (color: number, roughness = 0.6, metalness = 0.3) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
  const yellow = std(0xd9a21b, 0.55);
  const dark = std(0x8a6a1a, 0.6);
  const steel = std(0x3a3f46, 0.6, 0.6);
  const add = (parent: THREE.Object3D, w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };
  // 문형 크레인(움직이지 않는 부분은 합친다): 다리 넷, 거더 둘, 받침
  const frame = new THREE.Group();
  root.add(frame);
  for (const sx of [-22, 22]) {
    for (const sz of [-8, 8]) add(frame, 1.6, 40, 1.6, yellow, sx, 20, sz);
    add(frame, 3, 1.6, 20, dark, sx, 0.8, 0);
    add(frame, 1.2, 1.2, 16, yellow, sx, 26, 0);
  }
  for (const sz of [-3, 3]) add(frame, 48, 3.2, 2.2, yellow, 0, 40, sz);
  mergeStatic(frame);
  // 받침목 둘(블록이 누워 있을 때 놓이는 자리)
  for (const sx of [-6, 6]) add(root, 1.4, 1, WIDE + 2, std(0x4a3a2c, 0.9, 0), sx, 0.5, 0);

  // 블록(판·늑판·거더가 있는 형상, blockgen) + 러그 둘
  const block = new THREE.Group();
  root.add(block);
  const body = new THREE.Mesh(unitBlockGeometry(), seams(new THREE.MeshStandardMaterial({ color: 0x8a8f96, roughness: 0.75, metalness: 0.2, side: THREE.DoubleSide })));
  body.scale.set(LEN, THICK, WIDE);
  body.castShadow = body.receiveShadow = true;
  block.add(body);
  const lugMat = std(0xe0b020, 0.5);
  const lugA = add(block, 0.5, 1.1, 1.4, lugMat, -A, 0, 0);
  const lugB = add(block, 0.5, 1.1, 1.4, lugMat, A, 0, 0);

  // 트롤리 둘과 와이어(길이 1 원통을 늘림). 와이어 색 = 하중
  const trolleys = [0, 1].map((i) => add(root, 5, 1.8, 5, dark, 0, TROLLEY_Y + 0.9, i ? 1.2 : -1.2));
  const wireMats = [0, 1].map(() => new THREE.MeshBasicMaterial({ color: 0xffffff }));
  const wires = wireMats.map((m) => {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 1, 8), m);
    root.add(w);
    return w;
  });
  const RAMP: [number, number][] = [[0, 0x3d7fd0], [0.4, 0x3fae5a], [0.7, 0xe2b324], [1, 0xdc3b2a]];
  const ca = new THREE.Color();
  const cb = new THREE.Color();
  function ramp(k: number, out: THREE.Color) {
    for (let i = 1; i < RAMP.length; i++)
      if (k <= RAMP[i][0]) return out.copy(ca.setHex(RAMP[i - 1][1])).lerp(cb.setHex(RAMP[i][1]), (k - RAMP[i - 1][0]) / (RAMP[i][0] - RAMP[i - 1][0]));
    return out.setHex(RAMP[RAMP.length - 1][1]);
  }

  hud.innerHTML = `
    <div class="tn-head"><strong>블록 세우기(턴오버)</strong><button class="btn" type="button" id="tn-close">닫기</button></div>
    <p class="tn-p">눕혀서 만든 ${W} t 블록을 훅 두 개로 세웁니다. 주 훅이 한쪽 끝을 올리고, 보조 훅이 반대쪽 끝을 받치며 내려 줍니다.</p>
    <div class="tn-reads">
      <div><span>기울기</span><b id="tn-th"></b></div>
      <div><span>주 훅</span><b id="tn-main"></b></div>
      <div><span>보조 훅</span><b id="tn-aux"></b></div>
      <div><span>보조 훅이 풀리는 각도</span><b id="tn-slack"></b></div>
    </div>
    <p class="tn-say" id="tn-say"></p>
    <div class="tn-task" id="tn-task" hidden><p id="tn-task-t"></p><button class="btn primary" type="button" id="tn-task-go">이 러그 위치로 세우기</button></div>
    <label class="tn-row">기울기 <input type="range" id="tn-angle" min="0" max="100" step="1" value="0" /><button class="btn" type="button" id="tn-auto" aria-pressed="true">자동</button></label>
    <label class="tn-row">러그 높이(무게중심선 위) <output id="tn-e-out"></output><input type="range" id="tn-e" min="0.5" max="3.5" step="0.1" value="2" /></label>
    <small>주 훅 = W/2 × (1 + (러그 높이 ÷ 러그 간격의 절반) × tan 기울기). 와이어가 수직인 정적 평형만 본 교육용 예시이며 실제 인양 계획 값이 아닙니다. 180° 뒤집기의 뒤 절반은 와이어가 비스듬해져 이 식으로 다루지 않습니다.</small>`;
  const $ = <T extends HTMLElement>(id: string) => hud.querySelector<T>('#' + id)!;
  const angleEl = $<HTMLInputElement>('tn-angle');
  const eEl = $<HTMLInputElement>('tn-e');
  const autoBtn = $('tn-auto');
  let e = 2;
  let k = 0; // 0 = 누움, 1 = 느슨해지는 각도까지 세움
  let auto = true;
  let t = 0;
  let open = false;
  const setAuto = (v: boolean) => {
    auto = v;
    autoBtn.setAttribute('aria-pressed', String(v));
  };
  angleEl.addEventListener('input', () => {
    setAuto(false);
    k = Number(angleEl.value) / 100;
  });
  eEl.addEventListener('input', () => (e = Number(eEl.value)));
  autoBtn.addEventListener('click', () => setAuto(!auto));
  $('tn-close').addEventListener('click', () => close());
  // 한 척 짓기의 과제: 보조 훅이 정해진 각도에서 풀리게 러그 높이를 고른다
  let taskTarget = 0;
  let taskDone: ((err: number, got: number) => void) | null = null;
  $('tn-task-go').addEventListener('click', () => {
    const got = (slackAngle(A, e) * 180) / Math.PI;
    $('tn-task').hidden = true;
    setAuto(true);
    taskDone?.(Math.abs(got - taskTarget), got);
    taskDone = null;
  });
  for (const el of [angleEl, eEl]) el.addEventListener('keydown', (ev) => ev.stopPropagation());

  const up = new THREE.Vector3(0, 1, 0);
  const dir = new THREE.Vector3();
  const pa = new THREE.Vector3();
  const pb = new THREE.Vector3();
  let lastText = '';
  function draw() {
    const limit = slackAngle(A, e);
    const theta = k * limit;
    const r = solveTurn(theta, W, A, e);
    // 가장 낮은 모서리가 받침목 위 1 m 를 지나도록 무게중심 높이를 잡는다(누웠을 때는 받침목 위)
    const half = Math.abs(Math.sin(theta)) * (LEN / 2) + Math.cos(theta) * (THICK / 2);
    const cgY = 1 + half + Math.min(1, k * 6) * 1.2;
    block.position.set(0, cgY, 0);
    block.rotation.z = -theta;
    lugA.position.y = lugB.position.y = e;
    pa.set(r.ax, cgY + r.ay, 0);
    pb.set(r.bx, cgY + r.by, 0);
    [pa, pb].forEach((p, i) => {
      trolleys[i].position.x = p.x;
      const share = (i ? r.aux : r.main) / W;
      const slack = share < 0.01;
      dir.set(0, TROLLEY_Y - p.y, 0);
      wires[i].position.set(p.x, p.y + dir.y / 2, 0);
      wires[i].scale.set(slack ? 0.5 : 1, Math.max(0.01, dir.y), slack ? 0.5 : 1);
      wires[i].quaternion.setFromUnitVectors(up, dir.normalize());
      if (slack) wireMats[i].color.setHex(0x6b7480);
      else ramp(share, wireMats[i].color);
    });
    if (!open) return;
    const text = `${theta.toFixed(3)}|${e}`;
    if (text === lastText) return;
    lastText = text;
    $('tn-th').textContent = `${Math.round((theta * 180) / Math.PI)}°`;
    $('tn-main').textContent = `${fmt(r.main)} t`;
    $('tn-aux').textContent = `${fmt(r.aux)} t`;
    $('tn-slack').textContent = `${Math.round((limit * 180) / Math.PI)}°`;
    $('tn-e-out').textContent = `${e.toFixed(1)} m`;
    $('tn-say').textContent =
      r.aux < W * 0.02
        ? '보조 훅이 풀렸습니다. 무게중심이 주 훅 러그 바로 아래에 와서, 블록 무게를 주 훅이 혼자 듭니다.'
        : r.aux < W * 0.25
          ? '보조 훅 하중이 빠르게 줄어듭니다. 주 훅 쪽 러그와 와이어가 블록 무게 대부분을 받습니다.'
          : k < 0.05
            ? '누워 있을 때는 두 훅이 반씩 나눠 듭니다.'
            : '세울수록 무게중심이 주 훅 쪽으로 옮겨 가 주 훅 하중이 늘어납니다. 러그가 높을수록 더 일찍 넘어갑니다.';
    if (document.activeElement !== angleEl) angleEl.value = String(Math.round(k * 100));
  }

  /** 자동: 13초에 세우고 3초 머문 뒤 13초에 눕힌다 */
  function update(dt: number) {
    if (auto) {
      t = (t + dt) % 32;
      const u = t < 13 ? t / 13 : t < 16 ? 1 : t < 29 ? 1 - (t - 16) / 13 : 0;
      k = u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;
    }
    draw();
  }
  function close() {
    if (!open) return;
    open = false;
    hud.hidden = true;
    $('tn-task').hidden = true;
    taskDone = null;
    o.onClose();
  }
  draw();
  return {
    update,
    open() {
      open = true;
      hud.hidden = false;
      lastText = '';
      setAuto(true);
    },
    close,
    /** 과제를 건다: 보조 훅이 target° 에서 풀리게. 고르면 done(오차°, 고른 각도°) */
    task(target: number, done: (err: number, got: number) => void) {
      taskTarget = target;
      taskDone = done;
      $('tn-task-t').textContent = `과제: 보조 훅이 ${target}° 에서 풀리게 러그 높이를 정하세요(오른쪽 '보조 훅이 풀리는 각도'를 보며).`;
      $('tn-task').hidden = false;
    },
    /** 확인용: 기울기를 0~1 로 고정 */
    hold(v: number) {
      setAuto(false);
      k = Math.min(1, Math.max(0, v));
    },
    get active() {
      return open;
    },
    view: { cam: [cx + 2, 24, cz + 78] as [number, number, number], look: [cx + 2, 9, cz] as [number, number, number] },
  };
}
