/**
 * 한 척 짓기(2026-11-22 사용자: "나조차도 잘 안 하게 된다" — 보는 전시관이라 목표·결과·다시 열 이유가 없었다).
 * 흐름(같은 날 재검토 뒤): 골리앗 크레인으로 블록을 하나씩 올린다 — 내려 앉히기 → 같은 장면에서 이음 맞추기 → 가용접(블록 하나에 40초쯤).
 * 올린 만큼 배가 자라고, 원할 때 진수하고, 건조 기록을 받는다.
 * 재검토에서 뺀 것: 카드 안에서 단추로 하던 과제(용접 순서, 도장 시점, 숫자 단추 세팅)와 슬라이더로 하던 블록 세우기.
 *   한 단계를 손에 붙을 때까지 다듬은 뒤, 같은 틀(3D 장면 안에서 손으로)로 하나씩 다시 넣는다. 계산은 build-calc.ts 에 남겼다.
 * 결과는 점수·별·배지가 아니라(2026-11-13 "유치원 같다") 현장 숫자와 재작업 시간(교육용 예시 환산)만.
 * 오늘의 조건(날짜로 정해져 그날은 누구나 같다): 바람 세기, 블록마다의 이음 오차.
 */
export interface Landed {
  name: string;
  off: number;
  touch: number;
  hard: boolean;
  sway: number;
  sec: number;
  /** 가용접했을 때 남은 어긋남(mm) [앞뒤 틈, 좌우, 단차] */
  fit: [number, number, number] | null;
}
export interface Launched { sec: number; vmaxKn: number; overSec: number }
export interface BuildOptions {
  el: HTMLElement;
  /** 크레인 단계를 연다(블록을 건 채 시작하는 quick 모드) */
  startCrane: () => void;
  nextBlock: () => void;
  stopCrane: () => void;
  startLaunch: () => void;
  stopLaunch: () => void;
  /** 둘러보기(빠른 견학) */
  tour: () => void;
  progress: () => { placed: number; total: number };
  sound: { on: () => boolean; toggle: () => void };
  /** 통계: 짓기 시작, 블록 하나를 가용접까지, 진수까지 */
  onEvent?: (what: 'start' | 'landed' | 'launched') => void;
}
const KEY = 'ulsan-story:build:v2';
const FIT_TOL = 3;
/** 한국 날짜(YYYYMMDD) */
function today() {
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
}
const h1 = (n: number) => (Math.round(n * 10) / 10).toLocaleString('ko-KR');
const sgn = (n: number) => (n > 0 ? `+${n}` : String(n));
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export function createBuild(o: BuildOptions) {
  type Step = 'off' | 'offer' | 'crane' | 'launch' | 'record';
  let step: Step = 'off';
  const day = today();
  const WIND = [
    { name: '약함', a: 0.3 },
    { name: '보통', a: 0.6 },
    { name: '셈', a: 0.9 },
  ][day % 3];
  interface Round { name: string; sec: number; touch: number; hard: boolean; fit: [number, number, number]; rework: number }
  let rounds: Round[] = [];
  let sea: Launched | null = null;

  /** 오늘 올린 블록 수와, 재작업 없이 가장 빨리 올린 블록의 시간 */
  function saved(): { count: number; fast: number | null } {
    try {
      const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as { day: number; count: number; fast: number | null } | null;
      if (v && v.day === day) return { count: v.count, fast: v.fast };
    } catch {
      /* 무시 */
    }
    return { count: 0, fast: null };
  }
  function save(r: Round) {
    const s = saved();
    const fast = r.rework < 0.05 ? Math.min(s.fast ?? Infinity, r.sec) : s.fast;
    try {
      localStorage.setItem(KEY, JSON.stringify({ day, count: s.count + 1, fast }));
    } catch {
      /* 저장이 막혀도 그대로 */
    }
  }
  function show(html: string, slim = false) {
    o.el.hidden = false;
    o.el.classList.toggle('slim', slim);
    o.el.innerHTML = html;
    o.el.querySelectorAll<HTMLButtonElement>('[data-do]').forEach((b) => b.addEventListener('click', () => act(b.dataset.do!)));
  }
  /** 짓는 동안에는 다른 화면 요소(위 단추, 단계 바, 설명 패널, '해 볼 것')를 숨긴다 */
  const setBuilding = (on: boolean) => document.body.classList.toggle('building', on);
  const head = (text: string) =>
    `<div class="bd-head"><strong>${text}</strong><button class="btn" type="button" data-do="quit">${rounds.length && step !== 'record' ? '마치기' : '그만'}</button></div>`;
  const btns = (...list: [string, string, boolean?][]) =>
    `<div class="bd-btns">${list.map(([what, label, primary]) => `<button class="btn${primary ? ' primary' : ''}" type="button" data-do="${what}">${label}</button>`).join('')}</div>`;

  function offer() {
    step = 'offer';
    const p = o.progress();
    const s = saved();
    show(`<div class="bd-head"><strong>내 배 한 척 지어 보기</strong></div>
      <p>골리앗 크레인으로 블록을 내려 앉히고, 이음을 맞춰 가용접합니다. 블록 하나에 40초쯤. 올린 만큼 배가 자라고, 원할 때 진수합니다.</p>
      <p class="bd-day">오늘의 조건 · 바람 ${WIND.name} · 블록 ${Math.min(p.placed + 1, p.total)}/${p.total}부터${
        s.count ? ` · 오늘 내가 올린 블록 ${s.count}개${s.fast !== null ? `, 가장 빠른 무재작업 ${Math.round(s.fast)}초` : ''}` : ''
      }</p>
      ${btns(['start', '지어 보기', true], ['sound', o.sound.on() ? '소리 끄기' : '소리 켜기'], ['tour', '둘러보기만'], ['quit', '닫기'])}`);
  }
  function craneCard(first: boolean) {
    const p = o.progress();
    show(
      `${head(`블록 ${Math.min(p.placed + 1, p.total)}/${p.total} 올리는 중 · 바람 ${WIND.name}`)}${
        first ? '<p>방향키로 녹색 윤곽 위에 맞추고 F 로 내립니다. 받침 가까이에서는 F 를 끊어 눌러 살살 앉히세요(세게 닿으면 이음이 벌어집니다). 앉으면 이음을 맞춰 Space 로 가용접.</p>' : ''
      }`,
      true,
    );
  }
  function start() {
    rounds = [];
    sea = null;
    step = 'crane';
    setBuilding(true);
    craneCard(true);
    o.onEvent?.('start');
    o.startCrane();
  }
  function stopAll() {
    if (step === 'crane') o.stopCrane();
    else if (step === 'launch') o.stopLaunch();
  }
  function act(what: string) {
    if (what === 'start') start();
    else if (what === 'sound') {
      o.sound.toggle();
      window.setTimeout(() => step === 'offer' && offer(), 250);
    } else if (what === 'tour') {
      quit();
      o.tour();
    } else if (what === 'quit') {
      // 올린 블록이 있으면 그냥 닫지 않고 기록을 보여 준다
      if (rounds.length && (step === 'crane' || step === 'launch')) {
        stopAll();
        record();
      } else quit();
    } else if (what === 'next') {
      craneCard(false);
      o.nextBlock();
    } else if (what === 'launch') {
      o.stopCrane();
      step = 'launch';
      show(`${head('진수')}<p>물을 채워 배를 띄우고, 게이트를 열어 예인선으로 끌어냅니다. 도크 안에서는 3 노트를 넘기지 마세요.</p>`, true);
      o.startLaunch();
    } else if (what === 'record') {
      stopAll();
      record();
    }
  }
  function record() {
    step = 'record';
    const n = rounds.length;
    const total = rounds.reduce((s, r) => s + r.rework, 0);
    const r4 = sea ? sea.overSec * 0.5 : 0;
    const avg = n ? rounds.reduce((s, r) => s + r.sec, 0) / n : 0;
    const rows = rounds
      .slice(-6)
      .map(
        (r) =>
          `<tr><th>${esc(r.name)}</th><td>${Math.round(r.sec)}초</td><td>${Math.max(0, r.touch).toFixed(2)} m/s${r.hard ? ' 충격' : ''}</td><td>${r.fit.map(sgn).join('/')} mm</td><td>${r.rework > 0.05 ? `+${h1(r.rework)} h` : '없음'}</td></tr>`,
      )
      .join('');
    const s = saved();
    show(`<div class="bd-head"><strong>건조 기록</strong></div>
      <table class="bd-t"><tr><th>블록</th><th>시간</th><th>닿는 속도</th><th>남은 어긋남</th><th>재작업</th></tr>${rows}</table>
      ${n > 6 ? `<p class="bd-day">앞서 올린 ${n - 6}개는 줄였습니다.</p>` : ''}
      ${sea ? `<p>진수: 최고 ${h1(sea.vmaxKn)} 노트 · 3 노트 넘긴 ${h1(sea.overSec)}초${r4 > 0.05 ? ` · 재작업 +${h1(r4)} h` : ''}</p>` : ''}
      <p class="bd-sum">블록 <b>${n}개</b> · 블록당 평균 ${Math.round(avg)}초 · 재작업 합계 <b>${h1(total + r4)}시간</b></p>
      <p class="bd-day">오늘 올린 블록 ${s.count}개${s.fast !== null ? ` · 가장 빠른 무재작업 블록 ${Math.round(s.fast)}초` : ''}</p>
      <small>재작업 시간은 실수의 크기를 현장 일로 바꿔 본 교육용 예시이며 실제 공수 기준이 아닙니다(허용 오차 ${FIT_TOL} mm 를 넘긴 1 mm 당 0.3 h, 충격 착지 2 h, 진수 과속 1초당 0.5 h). 조건은 내일 바뀝니다.</small>
      ${btns(['start', '이어서 더 올리기', true], ['tour', '둘러보기'], ['quit', '닫기'])}`);
  }
  function quit() {
    stopAll();
    step = 'off';
    o.el.hidden = true;
    setBuilding(false);
  }
  /** 블록 이름에서 정해지는 고정 난수(오늘 그 블록의 이음 오차) */
  function hash(s: string) {
    let h = day % 100000;
    for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) >>> 0;
    return h;
  }
  return {
    offer,
    start,
    quit,
    /** 조작 화면의 '그만'·Esc: 올린 블록이 있으면 기록으로, 없으면 닫는다 */
    leave: () => act('quit'),
    /** 그 블록의 세팅 시작 오차(mm) [앞뒤 틈 ±8~20, 좌우 ±8~18, 단차 ±4~10] */
    fitStart(name: string): [number, number, number] {
      const h = hash(name);
      const v = (shift: number, lo: number, span: number) => (lo + ((h >>> shift) % span)) * ((h >>> (shift + 5)) & 1 ? 1 : -1);
      return [v(0, 8, 13), v(7, 8, 11), v(14, 4, 7)];
    },
    /** 오늘의 바람(매단 점에 더하는 가속도 진폭 m/s²) */
    get wind() {
      return step === 'crane' ? WIND.a : 0;
    },
    /** 블록이 앉아 이음 맞추기로 넘어갔다: 앉히는 설명을 걷는다 */
    onSeated() {
      if (step !== 'crane') return;
      const p = o.progress();
      show(head(`블록 ${Math.min(p.placed + 1, p.total)}/${p.total} 이음 맞추는 중`), true);
    },
    /** 가용접 결과(크레인 운전이 알림) */
    onLanded(r: Landed) {
      if (step !== 'crane') return;
      const fit = r.fit ?? [0, 0, 0];
      const rework = fit.reduce((s, x) => s + Math.max(0, Math.abs(x) - FIT_TOL) * 0.3, 0) + (r.hard ? 2 : 0);
      const round: Round = { name: r.name, sec: r.sec, touch: r.touch, hard: r.hard, fit, rework };
      rounds.push(round);
      save(round);
      o.onEvent?.('landed');
      const p = o.progress();
      const left = p.total - p.placed;
      show(
        `${head(`블록 ${p.placed}/${p.total} 가용접`)}
        <p><b>${esc(r.name)}</b> · ${Math.round(r.sec)}초 · 닿는 속도 ${Math.max(0, r.touch).toFixed(2)} m/s${r.hard ? ' (충격 착지 — 이음부 점검 필요)' : ''} · 남은 어긋남 ${fit.map(sgn).join('/')} mm · ${rework > 0.05 ? `재작업 +${h1(rework)} h` : '재작업 없음'}</p>
        ${left > 0 ? btns(['next', `다음 블록 올리기(남은 ${left}개)`, true], ['launch', '진수하고 마치기']) : btns(['launch', '선체 완성 — 진수하기', true], ['record', '건조 기록'])}`,
      );
    },
    /** 더 올릴 블록이 없다(선체 완성) */
    onEmpty() {
      if (step !== 'crane') return;
      show(`${head('선체가 완성됐습니다')}<p>블록을 모두 올렸습니다. 이제 물을 채워 띄울 차례입니다.</p>${btns(['launch', '진수하기', true], ['record', '건조 기록'])}`);
    },
    /** 진수 결과(직접 진수가 알림) */
    onLaunched(r: Launched) {
      if (step !== 'launch') return;
      sea = r;
      o.onEvent?.('launched');
      show(`${head('진수')}<p>배가 도크를 빠져나왔습니다.</p>${btns(['record', '건조 기록 보기', true])}`);
    },
    get active() {
      return step !== 'off' && step !== 'offer';
    },
    get step() {
      return step;
    },
  };
}
