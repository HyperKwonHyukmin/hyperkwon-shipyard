/**
 * P4-2: 설계동 앞 모형 수조 — 선체 거더 종굽힘 체험.
 * - 1/4 크기 배 모형이 정적 파도(호깅·새깅·잔잔한 물) 위에 떠서 휘고, 선체 색이 굽힘 응력(σ = M·y/I)을 보여 준다.
 *   빨강 = 인장, 파랑 = 압축. 휨은 크게 과장한다.
 * - 계산은 beam.ts(교육용 단순 모델). 값은 예시이고 실제 설계 값이 아니다.
 * - 패널: 파도·적재 버튼, 굽힘 모멘트 곡선, 중앙 단면 응력 그림. 버튼을 누르면 자동 순환을 멈춘다.
 * 좌표: 수조 중심 바닥이 원점, 배 길이 방향 = x(-x 가 선미), 도로 쪽이 -z.
 */
import * as THREE from 'three';
import { part, boxG, std, lerp } from './factory/shed';
import { SHIP, solveBeam, sample, type Cargo, type Wave, type BeamResult } from './beam';

const SCALE = 4; // 모형 축척 1/4
const LM = SHIP.L / SCALE;
const BM = SHIP.B / SCALE;
const DM = SHIP.D / SCALE;
const EXAG = 3; // 모형 위 휨 과장(실제 처짐 m × 이 값 = 모형 m)
const POOL = { l: 66, w: 16, h: 5.5 };
const WATER_Y = POOL.h - 0.5;
const LIMIT = 175; // MPa, 예시 기준(연강)
const COLOR_RANGE = 120; // MPa, 색이 끝까지 가는 값(작게 잡아야 흔한 경우에도 색이 보임)
const AUTO_SEC = 7;

export const WAVES: { key: Wave; label: string; v: number }[] = [
  { key: 'still', label: '잔잔한 물', v: 0 },
  { key: 'hog', label: '호깅', v: 1 },
  { key: 'sag', label: '새깅', v: -1 },
];
export const CARGOS: { key: Cargo; label: string }[] = [
  { key: 'even', label: '고르게' },
  { key: 'middle', label: '가운데 몰아' },
  { key: 'ends', label: '양 끝 나눠' },
];
const WAVE_TEXT: Record<Wave, string> = {
  still: '잔잔한 물',
  hog: '호깅(파정이 배 가운데)',
  sag: '새깅(파저가 배 가운데)',
};

const C_T = new THREE.Color(0xc0262d); // 인장
const C_0 = new THREE.Color(0xe9edf1);
const C_C = new THREE.Color(0x1f5fae); // 압축
function stressColor(mpa: number, out: THREE.Color) {
  const k = THREE.MathUtils.clamp(mpa / COLOR_RANGE, -1, 1);
  return k >= 0 ? out.copy(C_0).lerp(C_T, k) : out.copy(C_0).lerp(C_C, -k);
}

/** 수선면 폭 비율(beam.ts 와 같은 모양). r = x/L(선미 0) */
function breadth(r: number) {
  const t = r < 0.25 ? r / 0.25 : r > 0.75 ? (1 - r) / 0.25 : 1;
  return 0.3 + 0.7 * Math.sin((Math.PI / 2) * Math.max(0, t));
}

export function createDesign(scene: THREE.Scene, center: [number, number, number]) {
  const root = new THREE.Group();
  root.position.set(...center);
  scene.add(root);

  // ── 수조(바닥에서 올라온 콘크리트 통) ──
  const wallM = std(0x8d939b, 0.9);
  part(root, boxG(POOL.l + 2, 0.4, POOL.w + 2), std(0x3b4652, 0.9), 0, 0.2, 0, false);
  for (const sz of [-1, 1]) part(root, boxG(POOL.l + 2, POOL.h, 1), wallM, 0, POOL.h / 2, sz * (POOL.w / 2 + 0.5));
  for (const sx of [-1, 1]) part(root, boxG(1, POOL.h, POOL.w), wallM, sx * (POOL.l / 2 + 0.5), POOL.h / 2, 0);
  // 수조 테두리 노란 띠
  for (const sz of [-1, 1]) part(root, boxG(POOL.l + 2, 0.15, 1.05), std(0xe0b020, 0.6), 0, POOL.h + 0.08, sz * (POOL.w / 2 + 0.5), false);

  // 수면: 정적 파도 모양으로 매 프레임 높이를 바꾼다
  const waterGeo = new THREE.PlaneGeometry(POOL.l, POOL.w, 132, 1);
  waterGeo.rotateX(-Math.PI / 2);
  const water = new THREE.Mesh(
    waterGeo,
    new THREE.MeshStandardMaterial({ color: 0x2f6f9c, roughness: 0.2, metalness: 0.1, transparent: true, opacity: 0.72 }),
  );
  water.position.y = WATER_Y;
  root.add(water);
  const wPos = waterGeo.attributes.position as THREE.BufferAttribute;
  const wBase = Float32Array.from(wPos.array as Float32Array);

  // ── 배 모형: 잘게 나눈 상자를 선수·선미로 가늘게 다듬고, 꼭짓점 색으로 응력을 칠한다 ──
  const hullGeo = new THREE.BoxGeometry(LM, DM, BM, 120, 8, 4);
  hullGeo.translate(0, DM / 2, 0); // 용골이 y = 0
  const hp = hullGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < hp.count; i++) {
    const r = (hp.getX(i) + LM / 2) / LM;
    // 위로 갈수록 덜 가늘게(갑판은 수선면보다 조금 넓게)
    const k = breadth(r);
    hp.setZ(i, hp.getZ(i) * lerp(k, Math.min(1, k + 0.25), hp.getY(i) / DM));
  }
  const hBase = Float32Array.from(hp.array as Float32Array);
  const colors = new Float32Array(hp.count * 3);
  hullGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const hull = new THREE.Mesh(hullGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.1 }));
  hull.castShadow = true;
  root.add(hull);

  // 갑판 위 해치 덮개 7개와 선미 거주구(색은 그대로, 갑판 휨을 따라 오르내림)
  const deckThings: { mesh: THREE.Mesh; x: number; h: number }[] = [];
  const hatchM = std(0x5d6a52, 0.7, 0.2);
  for (let j = 0; j < 7; j++) {
    const r = 0.15 + j * 0.105;
    const mesh = part(root, boxG(LM * 0.075, 0.5, BM * 0.62), hatchM, (r - 0.5) * LM, 0, 0);
    deckThings.push({ mesh, x: r * SHIP.L, h: 0.25 });
  }
  const house = part(root, boxG(LM * 0.06, 3, BM * 0.8), std(0xe8e8e2, 0.7), (0.07 - 0.5) * LM, 0, 0);
  deckThings.push({ mesh: house, x: 0.07 * SHIP.L, h: 1.5 });
  const funnel = part(root, boxG(LM * 0.025, 2, BM * 0.25), std(0x2f2f33, 0.6), (0.045 - 0.5) * LM, 0, 0);
  deckThings.push({ mesh: funnel, x: 0.045 * SHIP.L, h: 4 });

  // 밤에 수조를 비추는 등 하나(점광원은 장소당 1개 이하)
  const lamp = new THREE.PointLight(0xfff0d8, 2600, 70, 2);
  lamp.position.set(0, 18, -8);
  root.add(lamp);

  // ── 상태 ──
  let wave: Wave = 'hog';
  let cargo: Cargo = 'even';
  let auto = true;
  let timer = 0;
  let waveNow = 1;
  const mix: Record<Cargo, number> = { even: 1, middle: 0, ends: 0 };
  let result: BeamResult = solveBeam(waveNow, mix);
  let panel: HTMLElement | null = null;
  let panelTimer = 0;

  function set(w: Wave | null, c: Cargo | null, byUser: boolean) {
    if (w) wave = w;
    if (c) cargo = c;
    if (byUser) auto = false;
    timer = 0;
    refreshButtons();
  }

  const col = new THREE.Color();
  function shape() {
    const r = result;
    // 배 꼭짓점: 휨 + 흘수·트림, 색 = 그 높이의 굽힘 응력
    const yAt = (xm: number) => {
      const xr = (xm + LM / 2) * SCALE; // 실제 m, 선미 0
      const xi = xr - SHIP.L / 2;
      return { xr, base: WATER_Y - (r.draft + r.trim * xi) / SCALE + sample(r.x, r.w, xr) * EXAG };
    };
    for (let i = 0; i < hp.count; i++) {
      const x0 = hBase[i * 3];
      const y0 = hBase[i * 3 + 1];
      const { xr, base } = yAt(x0);
      hp.setY(i, base + y0);
      const yReal = y0 * SCALE - SHIP.D / 2; // 중립축 기준
      const mpa = (sample(r.x, r.M, xr) * yReal) / SHIP.I / 1000;
      stressColor(mpa, col).toArray(colors, i * 3);
    }
    hp.needsUpdate = true;
    (hullGeo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    hullGeo.computeVertexNormals();
    for (const d of deckThings) {
      const { base } = yAt(d.x / SCALE - LM / 2);
      d.mesh.position.y = base + DM + d.h;
    }
    // 수면: 배 길이 = 파장
    for (let i = 0; i < wPos.count; i++) {
      const xm = wBase[i * 3];
      const amp = (SHIP.L / 40) * waveNow;
      wPos.setY(i, wBase[i * 3 + 1] + (amp * Math.cos((2 * Math.PI * xm) / LM)) / SCALE);
    }
    wPos.needsUpdate = true;
    waterGeo.computeVertexNormals();
  }

  function update(machineDt: number, dt: number) {
    if (auto) {
      timer += machineDt;
      if (timer >= AUTO_SEC) {
        const i = WAVES.findIndex((w) => w.key === wave);
        set(WAVES[(i + 1) % WAVES.length].key, null, false);
      }
    }
    const target = WAVES.find((w) => w.key === wave)!.v;
    const rate = Math.min(1, dt * 1.8);
    const settled = Math.abs(waveNow - target) < 1e-3 && mix[cargo] > 0.999;
    if (!settled) {
      waveNow = lerp(waveNow, target, rate);
      if (Math.abs(waveNow - target) < 1e-3) waveNow = target;
      for (const c of CARGOS) mix[c.key] = lerp(mix[c.key], c.key === cargo ? 1 : 0, rate);
      const sum = mix.even + mix.middle + mix.ends;
      for (const c of CARGOS) mix[c.key] /= sum;
      result = solveBeam(waveNow, mix);
      shape();
    }
    panelTimer -= dt;
    if (panel && panelTimer <= 0) {
      panelTimer = 0.2;
      if (panel.isConnected) drawPanel();
      else panel = null;
    }
  }

  // ── 설명 패널 ──
  const fmt = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(Math.round(v))}`;
  function refreshButtons() {
    if (!panel) return;
    panel.querySelectorAll<HTMLButtonElement>('[data-wave]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.wave === wave)));
    panel.querySelectorAll<HTMLButtonElement>('[data-cargo]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.cargo === cargo)));
  }
  function drawPanel() {
    if (!panel) return;
    const r = result;
    // 굽힘 모멘트 곡선. 도로에서 보면 선수가 왼쪽이라 그림도 선수 → 선미. 세로 눈금은 고정(±7×10⁶ kN·m)이라 경우끼리 크기를 비교할 수 있다
    const W = 280;
    const H = 96;
    const MS = 7e6;
    const pts = r.x.map((x, i) => `${((1 - x / SHIP.L) * W).toFixed(1)},${(H / 2 - (r.M[i] / MS) * (H / 2)).toFixed(1)}`).join(' ');
    const chart = panel.querySelector('#bm-curve');
    chart?.setAttribute('points', `0,${H / 2} ${pts} ${W},${H / 2}`);
    // 중앙 단면 응력 그림: 갑판 값과 선저 값 사이 직선 분포
    const sx = (v: number) => 70 + (v / COLOR_RANGE) * 50;
    panel.querySelector('#sec-dist')?.setAttribute('points', `70,10 ${sx(r.deck).toFixed(1)},10 ${sx(r.bottom).toFixed(1)},90 70,90`);
    const deckEl = panel.querySelector('#sec-deck');
    const botEl = panel.querySelector('#sec-bot');
    if (deckEl) deckEl.textContent = `갑판 ${fmt(r.deck)} MPa`;
    if (botEl) botEl.textContent = `선저 ${fmt(r.bottom)} MPa`;
    (panel.querySelector('#sec-dist') as SVGElement | null)?.setAttribute('class', r.deck >= 0 ? 'hog' : 'sag');
    const warn = panel.querySelector<HTMLElement>('#bm-warn');
    if (warn) warn.hidden = Math.max(Math.abs(r.deck), Math.abs(r.bottom)) <= LIMIT;
  }
  /** 패널 '추가 화면'에 버튼과 그림을 그린다(장소를 열 때마다 새로) */
  function renderPanel(el: HTMLElement) {
    el.insertAdjacentHTML(
      'beforeend',
      `<div class="bm">
        <p class="bm-h">파도</p>
        <div class="eras" role="group" aria-label="파도">${WAVES.map((w) => `<button class="btn" type="button" data-wave="${w.key}">${w.label}</button>`).join('')}</div>
        <p class="bm-h">화물 싣기</p>
        <div class="eras" role="group" aria-label="화물 싣기">${CARGOS.map((c) => `<button class="btn" type="button" data-cargo="${c.key}">${c.label}</button>`).join('')}</div>
        <svg viewBox="-4 -14 288 128" class="bm-chart" role="img" aria-label="배 길이에 따른 굽힘 모멘트">
            <line x1="0" y1="48" x2="280" y2="48" class="axis"/>
            <polygon id="bm-curve" points="0,48 280,48"/>
            <text x="2" y="-4">호깅 +</text><text x="2" y="110">새깅 −</text>
            <text x="278" y="-4" text-anchor="end">굽힘 모멘트</text>
            <text x="0" y="62" class="small">선수</text><text x="280" y="62" text-anchor="end" class="small">선미</text>
          </svg>
        <div class="bm-figs">
          <svg viewBox="0 0 140 112" class="bm-sec" role="img" aria-label="중앙 단면 응력 분포">
            <rect x="10" y="10" width="40" height="80" class="hull"/>
            <line x1="6" y1="50" x2="54" y2="50" class="na"/>
            <line x1="70" y1="6" x2="70" y2="94" class="axis"/>
            <polygon id="sec-dist" points="70,10 70,10 70,90 70,90"/>
            <text x="30" y="106" text-anchor="middle" class="small">중앙 단면</text>
            <text id="sec-deck" x="138" y="8" text-anchor="end" class="small"></text>
            <text id="sec-bot" x="138" y="104" text-anchor="end" class="small"></text>
          </svg>
          <p class="bm-legend"><span class="t"></span>인장 <span class="c"></span>압축<br>배의 휨은 크게 과장했습니다.<br>상자형에 가까운 배, 정적 파도(파장 = 배 길이, 파고 = 길이/20)로 단순화한 교육용 예시이며 실제 설계 값이 아닙니다.</p>
        </div>
        <p class="bm-warn" id="bm-warn" hidden>예시 기준(연강 175 MPa)을 넘습니다. 실제로는 이렇게 싣지 않도록 적재 계획을 세웁니다.</p>
      </div>`,
    );
    panel = el;
    el.querySelectorAll<HTMLButtonElement>('[data-wave]').forEach((b) => b.addEventListener('click', () => set(b.dataset.wave as Wave, null, true)));
    el.querySelectorAll<HTMLButtonElement>('[data-cargo]').forEach((b) => b.addEventListener('click', () => set(null, b.dataset.cargo as Cargo, true)));
    refreshButtons();
    drawPanel();
  }

  // ?bm=파도,적재 — 그 경우로 고정해 시작(캡처 확인용). 예) ?bm=hog,ends
  {
    const [w, c] = (new URLSearchParams(location.search).get('bm') ?? '').split(',');
    if (WAVES.some((x) => x.key === w) && CARGOS.some((x) => x.key === c)) {
      set(w as Wave, c as Cargo, true);
      waveNow = WAVES.find((x) => x.key === w)!.v;
      for (const x of CARGOS) mix[x.key] = x.key === c ? 1 : 0;
      result = solveBeam(waveNow, mix);
    }
  }
  shape();
  return {
    update,
    renderPanel,
    status: () => {
      const r = result;
      const word = (v: number) => (v >= 0 ? '인장' : '압축');
      return `${WAVE_TEXT[wave]} · 화물 ${CARGOS.find((c) => c.key === cargo)!.label} — 갑판 ${fmt(r.deck)} MPa ${word(r.deck)}, 선저 ${fmt(r.bottom)} MPa ${word(r.bottom)}${auto ? ' · 자동으로 넘어감' : ''}`;
    },
  };
}
