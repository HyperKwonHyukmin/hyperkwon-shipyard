/**
 * 빠른 견학 한 바퀴(2026-11-14 방향 검토, PLAN.md 6장). 들어오면 바로 시작해 약 5분에 건조 과정 끝까지 본다.
 * 블록 하나를 따라 가공 → 조립 → PE장 → 도장 → 도크 탑재 → 진수 → 안벽 → 시운전 → 인도.
 * 장소마다 LEGS 의 시간만 머물며, 그 장소의 한 순환을 그 시간 안에 보도록 배속(speed)을 따로 건다.
 * 진행은 사람마다 따로다(공용 시계 없음). '여기 머물기'를 누르면 보통 둘러보기로 돌아가 그 장소에 남는다.
 * 문장은 stations.ts 의 `quick`(내용과 코드 분리).
 */
import type { Station } from './content/stations';

interface Leg {
  id: string;
  /** 머무는 시간(초, 카메라 이동 포함) */
  sec: number;
  /** 장면 배속: 그 장소 한 순환 ÷ 머무는 시간 정도 */
  speed: number;
}
/** 순환 길이: 가공 75초, 조립 130, PE장 190, 도장 60, 블록 하나 탑재 약 40, 진수 약 86, 안벽 190, 시운전 165, 명명식 90 */
// 2026-11-22 검토 "투어가 느리다": 머무는 시간을 약 0.72배로 줄이고 그만큼 배속을 올렸다(한 바퀴 약 3분 20초)
const LEGS: Leg[] = [
  { id: 'cutting', sec: 20, speed: 4.2 },
  { id: 'assembly', sec: 23, speed: 5.6 },
  { id: 'pe', sec: 24, speed: 8.3 },
  { id: 'paint', sec: 19, speed: 3.5 },
  { id: 'dock', sec: 22, speed: 6.9 },
  { id: 'launch', sec: 24, speed: 4.2 },
  { id: 'quay', sec: 24, speed: 8.3 },
  { id: 'trial', sec: 23, speed: 8.3 },
  { id: 'delivery', sec: 23, speed: 4.2 },
];
/** 한 바퀴 전체 시간(초) */
export const QUICK_TOTAL = LEGS.reduce((s, l) => s + l.sec, 0);

export interface QuickTourOptions {
  stations: Station[];
  el: HTMLElement;
  /** 장소로 카메라를 옮김 */
  go: (index: number) => void;
  /** 장면 배속을 바꿈(1 = 보통) */
  setSpeed: (n: number) => void;
  /** 그 장소에 들어갈 때 장면을 맞춤(도크는 마지막 블록 몇 개 전, 진수는 다 쌓은 상태 등) */
  prepare: (id: string) => void;
  /** 끝난 뒤 '더 볼 곳' 버튼(이름, 누를 때 할 일) */
  more: { label: string; run: () => void }[];
  onStart?: () => void;
  onStop?: () => void;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export function createQuickTour(o: QuickTourOptions) {
  const legs = LEGS.map((l) => ({ ...l, index: o.stations.findIndex((s) => s.id === l.id) })).filter((l) => l.index >= 0);
  let active = false;
  let leg = 0;
  let t = 0;
  let total = 0;

  o.el.innerHTML = `
    <div class="qt-row">
      <span class="qt-step" id="qt-step"></span>
      <strong class="qt-name" id="qt-name"></strong>
      <span class="qt-proc" id="qt-proc"></span>
    </div>
    <p class="qt-line" id="qt-line"></p>
    <div class="qt-bar" aria-hidden="true"><i id="qt-fill"></i></div>
    <div class="qt-row qt-btns">
      <button type="button" class="btn" id="qt-prev" aria-label="이전 장소">◀</button>
      <button type="button" class="btn" id="qt-next" aria-label="다음 장소">▶</button>
      <button type="button" class="btn primary" id="qt-stay">여기 머물기</button>
    </div>
    <div class="qt-done" id="qt-done" hidden></div>`;
  const $ = (id: string) => o.el.querySelector<HTMLElement>('#' + id)!;
  const stepEl = $('qt-step');
  const nameEl = $('qt-name');
  const procEl = $('qt-proc');
  const lineEl = $('qt-line');
  const fillEl = $('qt-fill');
  const doneEl = $('qt-done');
  o.el.hidden = true;

  $('qt-prev').addEventListener('click', () => enterLeg(Math.max(0, leg - 1)));
  $('qt-next').addEventListener('click', () => (leg + 1 < legs.length ? enterLeg(leg + 1) : finish()));
  $('qt-stay').addEventListener('click', () => stop());

  function enterLeg(i: number) {
    leg = i;
    t = 0;
    const l = legs[i];
    const s = o.stations[l.index];
    o.prepare(l.id);
    o.go(l.index);
    o.setSpeed(l.speed);
    stepEl.textContent = `${i + 1}/${legs.length}`;
    nameEl.textContent = s.name;
    procEl.textContent = s.processes.join(' · ');
    lineEl.textContent = s.quick ?? s.summary;
    fillEl.style.width = '0%';
  }

  function start() {
    active = true;
    total = 0;
    doneEl.hidden = true;
    o.el.hidden = false;
    o.el.classList.remove('is-done');
    document.body.classList.add('quicktour');
    o.onStart?.();
    enterLeg(0);
  }

  /** 한 바퀴 끝: '더 볼 곳' 안내. 배속은 보통으로 */
  function finish() {
    active = false;
    o.setSpeed(1);
    o.el.classList.add('is-done');
    doneEl.hidden = false;
    const min = Math.floor(total / 60);
    const sec = Math.round(total % 60);
    doneEl.innerHTML = `
      <h3>한 바퀴 끝 — 강판이 배가 되어 떠나기까지 ${min}분 ${sec}초</h3>
      <p>더 볼 곳</p>
      <div class="qt-more">${o.more.map((m, i) => `<button type="button" class="btn" data-m="${i}">${esc(m.label)}</button>`).join('')}
        <button type="button" class="btn" data-again>처음부터 다시</button>
        <button type="button" class="btn" data-close>닫기</button></div>`;
    doneEl.querySelectorAll<HTMLButtonElement>('[data-m]').forEach((b) =>
      b.addEventListener('click', () => {
        close();
        o.more[Number(b.dataset.m)].run();
      }),
    );
    doneEl.querySelector('[data-again]')!.addEventListener('click', () => start());
    doneEl.querySelector('[data-close]')!.addEventListener('click', () => close());
  }

  function close() {
    o.el.hidden = true;
    document.body.classList.remove('quicktour');
    o.onStop?.();
  }

  /** 지금 장소에 남고 보통 둘러보기로 */
  function stop() {
    if (!active && o.el.hidden) return;
    active = false;
    o.setSpeed(1);
    close();
  }

  function update(dt: number) {
    if (!active) return;
    t += dt;
    total += dt;
    const l = legs[leg];
    fillEl.style.width = `${Math.min(100, ((leg + Math.min(1, t / l.sec)) / legs.length) * 100).toFixed(1)}%`;
    if (t >= l.sec) {
      if (leg + 1 < legs.length) enterLeg(leg + 1);
      else finish();
    }
  }

  return {
    start,
    stop,
    update,
    get active() {
      return active;
    },
    /** 확인용: 지금 몇 번째 장소, 그 장소에서 지난 시간 */
    debug: () => ({ active, leg, id: legs[leg]?.id, t, total }),
  };
}
