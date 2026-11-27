/**
 * 장소별 '직접 해 보기'의 공통 틀(2026-11-22 사용자: "도크 밖 장소들 체험도 만들어줘").
 * 체험 하나 = TryDef: 그 장소 옆에 작은 장면을 만들고(build), 방향키와 Space(화면 단추도 같음)로 30초쯤 조작해 결과를 본다.
 * 규칙(CLAUDE.md '한 척 짓기'와 같음): 폼 화면이 아니라 3D 장면 안에서 손으로, 실패는 글자보다 장면에 먼저 보이게,
 * 결과는 점수가 아니라 현장 숫자. 숫자는 모두 교육용 예시(화면에 적는다).
 * 틀이 맡는 것: 시작과 끝(암전 컷, 카메라, 다른 화면 요소 숨김), 입력(누르고 있는 키 held, 이번 프레임에 눌린 키 taps),
 * 조작판(눈금·안내·결과·다시 하기). 체험은 장면과 규칙만 쓴다(tries-yard.ts, tries-sea.ts).
 */
import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export interface TryHud {
  /** 제목 옆 한 줄(지금 할 일) */
  step: (text: string) => void;
  /** 눈금 값(TryDef.reads 와 같은 순서) */
  read: (values: string[]) => void;
  note: (text: string, sec?: number) => void;
  /** 주 단추의 글자를 바꾼다 */
  act: (label: string) => void;
  result: (title: string, rows: [string, string][], why: string) => void;
}
export interface TryCtx {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  /** 누르고 있는 키: left right up down act */
  held: Set<string>;
  /** 이번 프레임에 눌린 키 */
  taps: Set<string>;
  hud: TryHud;
  sound: { thump: (v: number) => void; horn: () => void };
  seaY: number;
  /** 오늘 날짜에서 나오는 0~1 고정 난수(그날은 누구나 같은 조건) */
  day: (salt: number) => number;
  /** 좁은 화면(휴대폰): 조작판이 아래를 덮으므로 카메라를 뒤로 빼고 대상을 화면 위쪽에 둔다 */
  phone: boolean;
}
export interface TryDef {
  id: string;
  /** 단추·지도에 쓰는 이름과 한 줄 풀이 */
  label: string;
  hint: string;
  station: string;
  /** 지도 위 자리(월드 x, z) */
  at: [number, number];
  title: string;
  /** 조작 안내 한 줄 */
  keys: string;
  /** 눈금 이름(4개까지) */
  reads: string[];
  /** 화면 단추 [키, 글자] */
  pad: [string, string][];
  /** 주 단추(Space) 글자. 없으면 주 단추가 없다 */
  act?: string;
  cam: [number, number, number];
  look: [number, number, number];
  /** 카메라를 체험이 직접 움직인다(끌어 돌리기를 끈다) */
  ownCamera?: boolean;
  /** 휴대폰에서 카메라를 뒤로 빼는 배율(세로 화면은 가로 시야가 좁다). 기본 2.1 */
  phoneBack?: number;
  build: (ctx: TryCtx) => void;
  start: (ctx: TryCtx) => void;
  update: (dt: number, ctx: TryCtx) => void;
  stop: (ctx: TryCtx) => void;
  /** 자동 시험이 읽는 값 */
  debug?: () => unknown;
}

const KEYMAP: Record<string, string> = {
  arrowleft: 'left', a: 'left', arrowright: 'right', d: 'right', arrowup: 'up', w: 'up', arrowdown: 'down', s: 'down', ' ': 'act',
};
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
/** 한국 날짜(YYYYMMDD) */
function today() {
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
}

export interface TriesOptions {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  el: HTMLElement;
  defs: TryDef[];
  sound: TryCtx['sound'];
  seaY: number;
  /** 짧은 암전 컷 */
  cut: (fn: () => void) => void;
  onEnter: (d: TryDef) => void;
  onExit: (d: TryDef) => void;
  /** 결과 화면이 떴다(통계: 끝까지 해 봤는가) */
  onResult?: (d: TryDef) => void;
}

export function createTries(o: TriesOptions) {
  const { camera, controls } = o;
  let cur: TryDef | null = null;
  let showing = false;
  const held = new Set<string>();
  const taps = new Set<string>();
  let note = '';
  let noteT = 0;
  const saved = { min: 0, max: 0, pan: true, zoom: true, polar: 0 };

  o.el.innerHTML = `
    <div class="op-top"><strong id="ty-title"></strong><span id="ty-step"></span><button type="button" class="btn" id="ty-exit">Esc 그만</button></div>
    <dl class="op-read" id="ty-read"></dl>
    <p class="op-note" id="ty-note" role="status"></p>
    <div class="op-pad" id="ty-pad" aria-label="조작 버튼"></div>
    <div class="op-result" id="ty-result" hidden></div>
    <p class="op-keys" id="ty-keys"></p>`;
  const $ = (id: string) => o.el.querySelector<HTMLElement>('#' + id)!;
  const titleEl = $('ty-title');
  const stepEl = $('ty-step');
  const readEl = $('ty-read');
  const noteEl = $('ty-note');
  const padEl = $('ty-pad');
  const resultEl = $('ty-result');
  const keysEl = $('ty-keys');
  let dds: HTMLElement[] = [];
  let actBtn: HTMLElement | null = null;
  o.el.hidden = true;
  $('ty-exit').addEventListener('click', () => stop());

  const press = (k: string) => {
    if (!held.has(k)) taps.add(k);
    held.add(k);
  };
  window.addEventListener('keydown', (e) => {
    if (!cur || (e.target as Element | null)?.closest?.('input, textarea, select')) return;
    const k = KEYMAP[e.key.toLowerCase()];
    if (k) {
      if (!showing) press(k);
      e.preventDefault();
    } else if (e.key === 'Escape') stop();
  });
  window.addEventListener('keyup', (e) => {
    const k = KEYMAP[e.key.toLowerCase()];
    if (k) held.delete(k);
  });
  window.addEventListener('blur', () => held.clear());

  function buildPad(d: TryDef) {
    padEl.innerHTML =
      d.pad.map(([k, label]) => `<button type="button" class="btn" data-k="${k}">${esc(label)}</button>`).join('') +
      (d.act ? `<button type="button" class="btn primary" data-k="act" id="ty-act">${esc(d.act)}</button>` : '');
    actBtn = padEl.querySelector<HTMLElement>('#ty-act');
    padEl.querySelectorAll<HTMLButtonElement>('[data-k]').forEach((b) => {
      const k = b.dataset.k!;
      b.addEventListener('pointerdown', (e) => {
        press(k);
        b.setPointerCapture(e.pointerId);
      });
      for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ev, () => held.delete(k));
    });
  }

  const hud: TryHud = {
    step: (t) => {
      if (stepEl.textContent !== t) stepEl.textContent = t;
    },
    read: (vals) =>
      vals.forEach((v, i) => {
        if (dds[i] && dds[i].textContent !== v) dds[i].textContent = v;
      }),
    note: (t, sec = 3) => {
      note = t;
      noteT = sec;
    },
    act: (label) => {
      if (actBtn && actBtn.textContent !== label) actBtn.textContent = label;
    },
    result: (title, rows, why) => {
      showing = true;
      if (cur) o.onResult?.(cur);
      held.clear();
      o.el.classList.add('done');
      padEl.hidden = true;
      resultEl.hidden = false;
      resultEl.innerHTML = `<h3>${esc(title)}</h3>
        <table>${rows.map(([a, b]) => `<tr><th>${esc(a)}</th><td>${esc(b)}</td></tr>`).join('')}</table>
        <p class="op-why">${esc(why)}</p>
        <div class="op-next"><button type="button" class="btn primary" id="ty-again">다시 해 보기</button><button type="button" class="btn" id="ty-done">마치기</button></div>`;
      resultEl.querySelector('#ty-again')!.addEventListener('click', () => again());
      resultEl.querySelector('#ty-done')!.addEventListener('click', () => stop());
    },
  };
  const dayNum = today();
  const ctx: TryCtx = {
    scene: o.scene,
    camera,
    controls,
    held,
    taps,
    hud,
    sound: o.sound,
    seaY: o.seaY,
    phone: false,
    day: (salt) => {
      let h = (dayNum ^ Math.imul(salt + 1, 0x9e3779b1)) >>> 0;
      h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
      h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
      return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
    },
  };
  for (const d of o.defs) d.build(ctx);

  function fresh(d: TryDef) {
    showing = false;
    held.clear();
    taps.clear();
    note = '';
    noteT = 0;
    resultEl.hidden = true;
    padEl.hidden = false;
    o.el.classList.remove('done');
    stepEl.textContent = '';
    if (d.act) hud.act(d.act);
    // 휴대폰(2026-11-22 확인: 조작판이 화면 아래 절반을 덮어 대상이 가려졌다): 뒤로 빼고, 보는 점을 내려 대상이 화면 위쪽에 오게
    ctx.phone = window.innerWidth < 700;
    const cam = new THREE.Vector3(...d.cam);
    const look = new THREE.Vector3(...d.look);
    if (ctx.phone) {
      cam.sub(look).multiplyScalar(d.phoneBack ?? 2.1).add(look);
      look.y -= cam.distanceTo(look) * 0.15;
    }
    camera.position.copy(cam);
    controls.target.copy(look);
    controls.update();
    d.start(ctx);
  }
  function again() {
    if (cur) fresh(cur);
  }
  function start(id: string) {
    const d = o.defs.find((x) => x.id === id);
    if (!d || cur) return;
    o.cut(() => {
      cur = d;
      o.onEnter(d);
      saved.min = controls.minDistance;
      saved.max = controls.maxDistance;
      saved.pan = controls.enablePan;
      saved.zoom = controls.zoomToCursor;
      saved.polar = controls.maxPolarAngle;
      controls.enablePan = false;
      controls.zoomToCursor = false;
      controls.autoRotate = false;
      controls.minDistance = 3;
      controls.maxDistance = 900;
      controls.maxPolarAngle = Math.PI * 0.49;
      controls.enabled = !d.ownCamera;
      titleEl.textContent = d.title;
      keysEl.textContent = `${d.keys} · 교육용 예시`;
      readEl.innerHTML = d.reads.map((r) => `<div><dt>${esc(r)}</dt><dd>–</dd></div>`).join('');
      dds = [...readEl.querySelectorAll<HTMLElement>('dd')];
      buildPad(d);
      o.el.hidden = false;
      fresh(d);
    });
  }
  function stop() {
    if (!cur) return;
    const d = cur;
    d.stop(ctx);
    cur = null;
    showing = false;
    held.clear();
    taps.clear();
    o.el.hidden = true;
    controls.enabled = true;
    controls.enablePan = saved.pan;
    controls.zoomToCursor = saved.zoom;
    controls.minDistance = saved.min;
    controls.maxDistance = saved.max;
    controls.maxPolarAngle = saved.polar;
    o.onExit(d);
  }
  function update(dt: number) {
    if (!cur || !(dt > 0)) return;
    cur.update(dt, ctx);
    taps.clear();
    noteT -= dt;
    const t = noteT > 0 ? note : '';
    if (noteEl.textContent !== t) noteEl.textContent = t;
  }

  return {
    start,
    stop,
    update,
    defs: o.defs,
    /** 지도·단추에 넣을 목록 */
    experiences: o.defs.map((d) => ({ label: d.label, hint: d.hint, station: d.station, at: d.at, run: () => start(d.id) })),
    get active() {
      return cur !== null;
    },
    debug: () => ({ id: cur?.id ?? null, showing, result: resultEl.hidden ? '' : resultEl.innerText, state: cur?.debug?.() ?? null }),
  };
}
