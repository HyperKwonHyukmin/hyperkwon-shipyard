/**
 * 4단계: 소리. 음원 파일 없이 WebAudio 로 합성한다.
 * - 바람: 갈색 잡음을 낮은 대역만 통과시키고 아주 느리게 흔든다(항상)
 * - 크레인 모터: 낮은 톱니파 두 개(크레인·훅이 움직일 때, 가까울수록 크게)
 * - 용접: 높은 대역 잡음을 불규칙하게 끊어 지직거림(아크가 켜졌을 때)
 * - 블록 안착: 짧고 낮은 '쿵'
 * - 먼 뱃고동: 2~4분에 한 번
 * 브라우저는 사용자가 누르기 전에는 소리를 막으므로 enable() 은 버튼 클릭에서 부른다.
 */

const rand = (a: number, b: number) => a + Math.random() * (b - a);
/** 거리(m)에 따른 음량 비율 */
export const nearness = (d: number) => Math.min(1, 70 / (d + 30));

interface Graph {
  ctx: AudioContext;
  master: GainNode;
  motor: GainNode;
  weld: GainNode;
  noise: AudioBuffer;
}

function noiseBuffer(ctx: AudioContext, brown: boolean) {
  const len = ctx.sampleRate * 3;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (brown) {
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    } else d[i] = w;
  }
  return buf;
}
function loop(ctx: AudioContext, buf: AudioBuffer) {
  const s = ctx.createBufferSource();
  s.buffer = buf;
  s.loop = true;
  s.start(0, Math.random() * buf.duration);
  return s;
}

function build(): Graph {
  const ctx = new AudioContext();
  const master = ctx.createGain();
  master.gain.value = 0;
  master.connect(ctx.destination);

  // 바람
  const wind = loop(ctx, noiseBuffer(ctx, true));
  const windLp = ctx.createBiquadFilter();
  windLp.type = 'lowpass';
  windLp.frequency.value = 420;
  const windGain = ctx.createGain();
  windGain.gain.value = 0.5;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.06;
  const lfoAmt = ctx.createGain();
  lfoAmt.gain.value = 220;
  lfo.connect(lfoAmt).connect(windLp.frequency);
  lfo.start();
  wind.connect(windLp).connect(windGain).connect(master);

  // 크레인 모터
  const motor = ctx.createGain();
  motor.gain.value = 0;
  const motorLp = ctx.createBiquadFilter();
  motorLp.type = 'lowpass';
  motorLp.frequency.value = 260;
  for (const f of [46, 47.3, 92.5]) {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = f;
    o.connect(motorLp);
    o.start();
  }
  motorLp.connect(motor).connect(master);

  // 용접
  const white = noiseBuffer(ctx, false);
  const weldSrc = loop(ctx, white);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 2600;
  const bp = ctx.createBiquadFilter();
  bp.type = 'peaking';
  bp.frequency.value = 5200;
  bp.gain.value = 8;
  const weld = ctx.createGain();
  weld.gain.value = 0;
  weldSrc.connect(hp).connect(bp).connect(weld).connect(master);

  return { ctx, master, motor, weld, noise: white };
}

export function createSound() {
  let g: Graph | null = null;
  let on = false;
  let hornIn = rand(40, 90);

  function thump(volume: number) {
    if (!g || !on || volume <= 0.02) return;
    const { ctx, master } = g;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(95, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.35);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.9 * volume, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    o.connect(og).connect(master);
    o.start(t);
    o.stop(t + 0.7);
    // 쇠끼리 닿는 짧은 울림
    const n = ctx.createBufferSource();
    n.buffer = g.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 900;
    bp.Q.value = 6;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.35 * volume, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
    n.connect(bp).connect(ng).connect(master);
    n.start(t);
    n.stop(t + 1);
  }

  function horn() {
    if (!g) return;
    const { ctx, master } = g;
    const t = ctx.currentTime;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 380;
    const hg = ctx.createGain();
    hg.gain.setValueAtTime(0.0001, t);
    hg.gain.exponentialRampToValueAtTime(0.16, t + 0.5);
    hg.gain.setValueAtTime(0.16, t + 2.4);
    hg.gain.exponentialRampToValueAtTime(0.0001, t + 3.6);
    for (const f of [98, 98.8, 147]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.connect(lp);
      o.start(t);
      o.stop(t + 3.8);
    }
    lp.connect(hg).connect(master);
  }

  return {
    get on() {
      return on;
    },
    /** 버튼 클릭에서 부른다 */
    async toggle() {
      if (!g) g = build();
      on = !on;
      if (on) await g.ctx.resume();
      const t = g.ctx.currentTime;
      g.master.gain.cancelScheduledValues(t);
      g.master.gain.setTargetAtTime(on ? 0.7 : 0, t, 0.25);
      return on;
    },
    /**
     * motor: 0~1(크레인 움직임 × 가까움), weld: 0~1(켜진 아크 × 가까움)
     */
    update(dt: number, motor: number, weld: number) {
      if (!g || !on) return;
      const t = g.ctx.currentTime;
      g.motor.gain.setTargetAtTime(0.22 * motor, t, 0.3);
      // 지직거림: 매 프레임 크기를 불규칙하게 바꾼다
      const crackle = weld > 0 ? weld * (Math.random() < 0.7 ? rand(0.25, 1) : 0.03) : 0;
      g.weld.gain.setTargetAtTime(0.3 * crackle, t, 0.012);
      hornIn -= dt;
      if (hornIn <= 0) {
        horn();
        hornIn = rand(120, 240);
      }
    },
    thump,
    /** 뱃고동(명명식 등에서 부름). 소리를 끈 상태면 들리지 않는다 */
    horn,
  };
}
