/**
 * 사진 모드와 시점 공유(2026-11-22). 화면의 단추·패널을 모두 걷고 장면만 남긴 뒤
 * - 사진 저장: 지금 화면을 PNG 로 내려받는다. 왼쪽 아래에 제목과 '비공식' 표기를 함께 새긴다(사진만 돌아다녀도 공식 자료로 오인되지 않게).
 * - 이 시점 주소 복사: 같은 장소·시점·시간대·건조 단계로 열리는 주소(?cam= 등, README '확인용 주소 옵션').
 * 걷는 중에도 쓸 수 있다. 닫기 단추나 Esc 로 돌아온다. 키보드로만 되는 기능은 없다.
 */
export interface PhotoOptions {
  bar: HTMLElement;
  canvas: HTMLCanvasElement;
  /** 한 프레임을 지금 그린다(그린 직후에만 캔버스를 읽을 수 있다) */
  render: () => void;
  /** 지금 시점으로 열리는 주소 */
  link: () => string;
  onToggle: (on: boolean) => void;
}

export function createPhoto(o: PhotoOptions) {
  let on = false;
  o.bar.innerHTML = `
    <button class="btn primary" type="button" id="ph-save">사진 저장</button>
    <button class="btn" type="button" id="ph-link">이 시점 주소 복사</button>
    <button class="btn" type="button" id="ph-close">닫기</button>
    <output id="ph-msg" aria-live="polite"></output>`;
  const msg = o.bar.querySelector<HTMLElement>('#ph-msg')!;
  let msgTimer = 0;
  function say(text: string) {
    msg.textContent = text;
    window.clearTimeout(msgTimer);
    msgTimer = window.setTimeout(() => (msg.textContent = ''), 3500);
  }

  function save() {
    o.render();
    const w = o.canvas.width;
    const h = o.canvas.height;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d')!;
    g.drawImage(o.canvas, 0, 0);
    // 표기: 화면 높이에 비례한 글자
    const px = Math.max(13, Math.round(h * 0.02));
    g.font = `600 ${px}px Pretendard, system-ui, sans-serif`;
    g.textBaseline = 'bottom';
    g.shadowColor = 'rgba(0,0,0,.75)';
    g.shadowBlur = px * 0.5;
    g.fillStyle = '#fff';
    g.fillText('울산조선소 이야기', px, h - px * 1.9);
    g.font = `400 ${Math.round(px * 0.78)}px Pretendard, system-ui, sans-serif`;
    g.fillStyle = '#dbe5f0';
    g.fillText('HD현대중공업과 관계없는 비공식 개인 프로젝트', px, h - px * 0.8);
    c.toBlob((blob) => {
      if (!blob) return say('사진을 만들지 못했습니다');
      const d = new Date();
      const p2 = (n: number) => String(n).padStart(2, '0');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `ulsan-yard-${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      say('사진을 저장했습니다');
    }, 'image/png');
  }

  async function copy() {
    const url = o.link();
    try {
      await navigator.clipboard.writeText(url);
      say('주소를 복사했습니다. 열면 이 시점에서 시작합니다');
    } catch {
      // 복사가 막힌 환경: 주소를 보여 주고 직접 복사하게 한다
      window.prompt('이 주소를 복사하세요', url);
    }
  }

  function set(v: boolean) {
    if (on === v) return;
    on = v;
    o.bar.hidden = !v;
    document.body.classList.toggle('photo', v);
    o.onToggle(v);
  }
  o.bar.querySelector('#ph-save')!.addEventListener('click', save);
  o.bar.querySelector('#ph-link')!.addEventListener('click', () => void copy());
  o.bar.querySelector('#ph-close')!.addEventListener('click', () => set(false));
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && on) set(false);
  });
  return {
    set,
    toggle: () => set(!on),
    get on() {
      return on;
    },
  };
}
