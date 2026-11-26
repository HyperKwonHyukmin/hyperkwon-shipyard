/**
 * 오프닝 장면(2026-11-22 사용자: "들어왔을 때 꽤 흥미로운 느낌이 있어야 다시 온다").
 * 처음 들어오면 약 10초 동안 노을 진 도크를 낮은 자리에서 훑어 올라가며 보여 준다:
 * 반쯤 올라간 선체, 블록을 옮기는 골리앗 크레인, 용접 불꽃, 켜지기 시작한 투광등.
 * 장면 준비(시간대·탑재 상태·카메라)는 main.ts 가 하고, 여기는 글자·건너뛰기·끝날 때의 암전만 맡는다.
 * 아무 키, 화면 누르기, '건너뛰기'로 바로 넘어간다. 끝나면 onEnd(화면이 가려진 순간) → 빠른 견학.
 */
export interface OpeningOptions {
  el: HTMLElement;
  /** 화면 전체를 덮는 암전 판 */
  fade: HTMLElement;
  /** 장면 길이(초) */
  sec: number;
  /** 화면이 가려진 순간: 시간대를 되돌리고 견학을 시작한다 */
  onEnd: () => void;
  /** true 면 시간이 흐르지 않는다(?open=초 로 한 순간을 캡처할 때) */
  hold?: boolean;
}

export function createOpening(o: OpeningOptions) {
  let t = -1;
  let ending = false;
  let done = false;
  const skip = (e: Event) => {
    if (e.type === 'keydown' && (e as KeyboardEvent).key === 'Tab') return;
    finish();
  };

  function start() {
    t = 0;
    o.el.hidden = false;
    document.body.classList.add('opening-on');
    window.addEventListener('keydown', skip);
    window.addEventListener('pointerdown', skip);
    // 보조 기술은 click 만 보낼 수 있다(finish 가 중복 호출을 막음)
    o.el.querySelector('#opening-skip')?.addEventListener('click', finish, { once: true });
  }

  function finish() {
    if (ending || t < 0) return;
    ending = true;
    window.removeEventListener('keydown', skip);
    window.removeEventListener('pointerdown', skip);
    o.fade.classList.add('on');
    setTimeout(() => {
      o.el.hidden = true;
      document.body.classList.remove('opening-on');
      o.onEnd();
      done = true;
      // 새 장면이 한 프레임 그려진 뒤에 걷는다
      setTimeout(() => o.fade.classList.remove('on'), 120);
    }, 520);
  }

  function update(dt: number) {
    if (t < 0 || ending || o.hold) return;
    t += dt;
    if (t >= o.sec) finish();
  }

  return {
    start,
    update,
    finish,
    get active() {
      return t >= 0 && !done;
    },
  };
}