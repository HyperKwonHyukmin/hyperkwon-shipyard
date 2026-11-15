/**
 * 진수 직접 해보기(2026-11-15 사용자: "각 과정에서 재미를 더 느낄 수 있게"). 조작과 화면만, 계산은 launch-calc.ts.
 * 1) 급수 밸브를 열어 도크에 바닷물을 채운다 — 수위가 오르며 부력이 배 무게를 넘겨받고, 흘수에 이르면 배가 뜬다.
 * 2) 안팎 수위가 같아지면 게이트를 연다(낮을 때 누르면 까닭을 알려 줌).
 * 3) 예인선을 '끌기'·'잡기'로 몰아 배를 도크 밖으로 — 배가 무거워 늦게 붙고 놓아도 미끄러진다. 3 노트 안으로.
 * 결과는 점수 없이 현장 숫자(걸린 시간, 최고 속력, 3 노트 넘긴 시간, 채운 물의 양).
 */
import type { createLaunch } from './launch';
import { blockLoad, LIGHT_SHIP_T, POOL_M3, SAFE_KN, TIME_X } from './launch-calc';

interface Options {
  hud: HTMLElement;
  launch: ReturnType<typeof createLaunch>;
  onExit: () => void;
  onHorn?: () => void;
  /** 시작 전 준비(선체를 다 쌓은 상태로) */
  prepare: () => void;
}

const fmt = (n: number, d = 1) => n.toLocaleString('ko-KR', { minimumFractionDigits: d, maximumFractionDigits: d });

export function createLaunchTry(o: Options) {
  const L = o.launch.manual;
  o.hud.innerHTML = `
    <div class="op-top">
      <strong>직접 진수</strong>
      <span id="ln-step"></span>
      <button type="button" class="btn" id="ln-exit">그만</button>
    </div>
    <dl class="op-read">
      <div><dt>도크 수위</dt><dd id="ln-depth">–</dd></div>
      <div><dt>부력이 받는 무게</dt><dd id="ln-share">–</dd></div>
      <div><dt>반목이 받는 무게</dt><dd id="ln-load">–</dd></div>
      <div><dt>배 속력</dt><dd id="ln-kn">–</dd></div>
    </dl>
    <p class="op-note" id="ln-note" role="status"></p>
    <div class="op-pad" aria-label="진수 조작">
      <button type="button" class="btn" id="ln-valve" aria-pressed="false">급수 밸브 열기</button>
      <button type="button" class="btn" id="ln-gate">게이트 열기</button>
      <button type="button" class="btn" id="ln-hold" hidden>◀ 잡기</button>
      <button type="button" class="btn primary" id="ln-pull" hidden>끌기 ▶</button>
    </div>
    <div class="op-result" id="ln-result" hidden></div>
    <p class="op-keys">끌기·잡기는 누르고 있는 동안만 · 배 무게 ${LIGHT_SHIP_T.toLocaleString('ko-KR')} 톤 가정 · 교육용 예시, 시간은 실제보다 줄였고 예인은 ${TIME_X}배 빠르게 보여 줌</p>`;
  const $ = (id: string) => o.hud.querySelector<HTMLElement>('#' + id)!;
  const valveBtn = $('ln-valve') as HTMLButtonElement;
  const gateBtn = $('ln-gate') as HTMLButtonElement;
  const pullBtn = $('ln-pull');
  const holdBtn = $('ln-hold');
  const note = $('ln-note');
  const resEl = $('ln-result');
  let noteHold = 0; // 경고 문구를 잠깐 붙잡아 둔다
  let floated = false;
  let active = false;
  let shown = false;

  valveBtn.addEventListener('click', () => L.setValve(!L.valve));
  gateBtn.addEventListener('click', () => {
    const why = L.openGate();
    if (why) {
      note.textContent = why;
      noteHold = 3;
    }
  });
  // 누르고 있는 동안만(손가락·마우스). 손을 떼거나 밖으로 나가면 놓기
  const hold = (el: HTMLElement, p: number) => {
    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture(e.pointerId);
      L.setPull(p);
      e.preventDefault();
    });
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) el.addEventListener(ev, () => L.setPull(0));
  };
  hold(pullBtn, 1);
  hold(holdBtn, -1);
  $('ln-exit').addEventListener('click', () => o.onExit());

  function start() {
    active = true;
    floated = false;
    shown = false;
    resEl.hidden = true;
    o.hud.classList.remove('done');
    o.hud.hidden = false;
    note.textContent = '';
    o.prepare();
    L.start();
  }
  function exit() {
    active = false;
    o.hud.hidden = true;
  }

  function update(dt: number) {
    if (!active) return;
    noteHold -= dt;
    const r = L.read();
    const ph = L.phase;
    $('ln-step').textContent = ph ? o.launch.status() : '진수 완료';
    $('ln-depth').textContent = `${fmt(r.depth)} / ${fmt(r.full)} m`;
    $('ln-share').textContent = `${Math.round(r.share * 100)}%`;
    $('ln-load').textContent = `${fmt(blockLoad(r.share), 0)} t`;
    const kn = $('ln-kn');
    kn.textContent = `${fmt(r.kn)} 노트`;
    kn.classList.toggle('warn', r.kn > SAFE_KN && r.stern);
    // 단추: 단계에 맞는 것만
    valveBtn.hidden = ph !== 'fill';
    gateBtn.hidden = ph !== 'fill';
    pullBtn.hidden = holdBtn.hidden = ph !== 'tow';
    valveBtn.textContent = L.valve ? '급수 밸브 잠그기' : '급수 밸브 열기';
    valveBtn.setAttribute('aria-pressed', String(L.valve));
    if (ph === 'fill' && r.share >= 1 && !floated) {
      floated = true;
      note.textContent = '배가 떴습니다! 잠긴 깊이(흘수)가 7 m 가 되자 부력이 배 무게와 같아졌습니다. 이제 바다 수위까지 채우세요.';
      noteHold = 5;
    }
    if (noteHold <= 0) {
      if (ph === 'park') note.textContent = '진수 준비: 골리앗 크레인이 도크 끝으로 물러납니다.';
      else if (ph === 'fill' && !floated)
        note.textContent = L.valve
          ? '물이 차오르면 반목이 받던 무게를 부력이 조금씩 넘겨받습니다.'
          : '급수 밸브를 열어 도크에 바닷물을 넣으세요.';
      else if (ph === 'fill') note.textContent = r.depth >= r.full - 0.05 ? '안팎 수위가 같아졌습니다. 게이트를 여세요.' : '바다 수위까지 채우세요.';
      else if (ph === 'gate') note.textContent = '게이트(케이슨)를 물에 띄워 옆으로 비킵니다. 예인선이 줄을 잡습니다.';
      else if (ph === 'tow')
        note.textContent =
          r.kn > SAFE_KN && r.stern
            ? `${SAFE_KN} 노트를 넘었습니다 — 도크 벽에 닿을 위험. 잡기로 줄이세요.`
            : r.stern
              ? `끌기로 출발하세요. 배가 무거워 늦게 붙고, 놓아도 한참 미끄러집니다. 도크 안에서는 ${SAFE_KN} 노트 이하로.`
              : '도크를 빠져나왔습니다. 조금만 더.';
      else if (ph === 'leave') note.textContent = '예인선이 배를 의장 안벽으로 데려갑니다.';
    }
    // 결과(예인이 끝나면 한 번)
    const res = L.result;
    if (res && !shown) {
      shown = true;
      o.onHorn?.();
      const pools = res.fillM3 / POOL_M3;
      resEl.innerHTML = `<h3>진수 완료</h3>
        <table>
          <tr><th>채운 바닷물</th><td>${Math.round(res.fillM3).toLocaleString('ko-KR')} m³ (올림픽 수영장 약 ${Math.round(pools)}개)</td></tr>
          <tr><th>걸린 시간(화면)</th><td>${Math.floor(res.sec / 60)}분 ${Math.round(res.sec % 60)}초</td></tr>
          <tr><th>최고 속력</th><td>${fmt(res.vmaxKn)} 노트</td></tr>
          <tr><th>도크 안에서 ${SAFE_KN} 노트를 넘긴 시간</th><td>${fmt(res.overSec)} 초</td></tr>
        </table>
        <p class="op-why">${
          res.overSec > 0.5
            ? '큰 배는 멈추는 데 오래 걸려, 실제 진수에서는 도크를 빠져나올 때 아주 천천히 끕니다. 다음에는 일찍 손을 떼 보세요.'
            : '천천히 잘 끌어냈습니다. 실제로도 여러 척의 예인선이 배의 앞뒤를 잡고 천천히 빠져나옵니다.'
        }</p>
        <div class="op-next"><button type="button" class="btn primary" id="ln-again">다시 해 보기</button><button type="button" class="btn" id="ln-done">마치기</button></div>`;
      resEl.hidden = false;
      o.hud.classList.add('done');
      resEl.querySelector('#ln-again')!.addEventListener('click', () => start());
      resEl.querySelector('#ln-done')!.addEventListener('click', () => o.onExit());
    }
  }

  return {
    start,
    exit,
    update,
    get active() {
      return active;
    },
  };
}
