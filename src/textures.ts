/**
 * 디자인 고도화(2026-11-13): 그림 파일 없이 캔버스로 그리는 질감 모음.
 * 바닥(콘크리트 슬래브), 도로(아스팔트 + 차선 + 보행로), 공장 벽(골강판 + 채광창 띠), 사무동(창 격자).
 * 낮/밤 전환(daynight.ts)은 map 과 emissiveMap 이 같은 캔버스인 재질을 '창 불빛 그림'으로 보고 다시 칠하므로,
 * 여기서 만든 벽은 밤 불빛을 따로 그린 emissiveMap 을 쓴다(같은 캔버스를 넣지 않는다).
 */
import * as THREE from 'three';

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return { c, g: c.getContext('2d')! };
}
function finish(c: HTMLCanvasElement, repeat = true) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}
/** 얼룩과 알갱이: 밝고 어두운 점을 흩뿌린다 */
function speckle(g: CanvasRenderingContext2D, w: number, h: number, n: number, max = 0.08, size = 2) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = Math.random() < 0.5 ? `rgba(0,0,0,${Math.random() * max})` : `rgba(255,255,255,${Math.random() * max})`;
    const s = 1 + Math.random() * size;
    g.fillRect(Math.random() * w, Math.random() * h, s, s);
  }
}
function blotch(g: CanvasRenderingContext2D, w: number, h: number, n: number, color: string, rMax: number) {
  for (let i = 0; i < n; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const r = rMax * (0.3 + Math.random() * 0.7);
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, color);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

/** 콘크리트 야드 바닥: 한 장이 20 m(슬래브 4장, 줄눈과 얼룩) */
export function concreteTexture() {
  const S = 512;
  const { c, g } = canvas(S, S);
  g.fillStyle = '#8a8e93';
  g.fillRect(0, 0, S, S);
  // 슬래브마다 밝기를 조금씩 다르게
  for (let i = 0; i < 2; i++)
    for (let j = 0; j < 2; j++) {
      g.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,255'},${0.01 + Math.random() * 0.025})`;
      g.fillRect(i * 256, j * 256, 256, 256);
    }
  blotch(g, S, S, 10, 'rgba(40,44,50,0.05)', 90);
  blotch(g, S, S, 6, 'rgba(255,255,255,0.03)', 70);
  speckle(g, S, S, 5000, 0.07);
  // 줄눈
  g.strokeStyle = 'rgba(40,43,48,0.35)';
  g.lineWidth = 2;
  for (const v of [0, 256]) {
    g.beginPath();
    g.moveTo(v + 1, 0);
    g.lineTo(v + 1, S);
    g.moveTo(0, v + 1);
    g.lineTo(S, v + 1);
    g.stroke();
  }
  return finish(c);
}

/**
 * 도로 한 토막(길이 14 m × 폭 40 m): 아스팔트, 가운데 노란 점선, 양쪽 흰 실선, 가장자리 초록 보행로.
 * 캔버스 가로 = 도로 길이 방향, 세로 = 폭 방향.
 */
export function roadTexture() {
  const PX = 16; // 1 m = 16 px
  const W = 14 * PX;
  const H = 40 * PX;
  const { c, g } = canvas(W, H);
  g.fillStyle = '#2b2e33';
  g.fillRect(0, 0, W, H);
  speckle(g, W, H, 9000, 0.09, 1.5);
  blotch(g, W, H, 6, 'rgba(0,0,0,0.12)', 80);
  // 바퀴 자국(차선 가운데가 조금 밝게 닳음)
  for (const z of [13, 27]) {
    const grad = g.createLinearGradient(0, (z - 3) * PX, 0, (z + 3) * PX);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.045)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, (z - 3) * PX, W, 6 * PX);
  }
  // 초록 보행로(양 가장자리 3 m)와 경계 흰 선
  for (const z0 of [0.4, 36.6]) {
    g.fillStyle = '#2f7a4d';
    g.fillRect(0, z0 * PX, W, 3 * PX);
    speckle(g, W, H, 0, 0);
  }
  g.fillStyle = 'rgba(235,235,225,0.9)';
  for (const z of [3.7, 36.1]) g.fillRect(0, z * PX, W, 0.2 * PX);
  // 가운데 노란 점선(7 m 긋고 7 m 띄움)
  g.fillStyle = '#d4b23c';
  g.fillRect(0, 19.85 * PX, 7 * PX, 0.3 * PX);
  return finish(c);
}

/** 횡단보도(폭 6 m × 길이 33 m 를 한 장으로) */
export function crosswalkTexture() {
  const { c, g } = canvas(64, 512);
  g.clearRect(0, 0, 64, 512);
  g.fillStyle = 'rgba(238,238,230,0.92)';
  for (let y = 8; y < 512; y += 32) g.fillRect(4, y, 56, 16);
  return finish(c, false);
}

/**
 * 공장 벽: 세로 골강판 + 위쪽 채광창 띠 + 아래 콘크리트 턱. cols = 가로로 놓을 창 칸 수.
 * map(낮 모습)과 emissive(밤에 창만 밝게)를 따로 돌려준다.
 */
export function shedWallTextures(cols: number, tint = '#6f8296') {
  const W = Math.max(256, cols * 64);
  const H = 256;
  const a = canvas(W, H);
  const b = canvas(W, H);
  const g = a.g;
  g.fillStyle = tint;
  g.fillRect(0, 0, W, H);
  // 골(세로 줄무늬)
  for (let x = 0; x < W; x += 8) {
    const grad = g.createLinearGradient(x, 0, x + 8, 0);
    grad.addColorStop(0, 'rgba(255,255,255,0.10)');
    grad.addColorStop(0.5, 'rgba(0,0,0,0.10)');
    grad.addColorStop(1, 'rgba(255,255,255,0.04)');
    g.fillStyle = grad;
    g.fillRect(x, 0, 8, H);
  }
  // 판 이음(가로)과 빗물 자국
  g.fillStyle = 'rgba(0,0,0,0.18)';
  for (const y of [96, 176]) g.fillRect(0, y, W, 2);
  for (let i = 0; i < cols * 3; i++) {
    const x = Math.random() * W;
    const grad = g.createLinearGradient(0, 60, 0, 60 + 60 + Math.random() * 100);
    grad.addColorStop(0, 'rgba(30,30,30,0.16)');
    grad.addColorStop(1, 'rgba(30,30,30,0)');
    g.fillStyle = grad;
    g.fillRect(x, 60, 2 + Math.random() * 4, 170);
  }
  // 위쪽 색 띠(공장 구분 띠, 로고·글자 없음)
  g.fillStyle = 'rgba(20,48,92,0.75)';
  g.fillRect(0, 0, W, 14);
  // 채광창 띠
  b.g.fillStyle = '#000';
  b.g.fillRect(0, 0, W, H);
  const cw = W / cols;
  for (let i = 0; i < cols; i++) {
    const x = i * cw + cw * 0.12;
    const w = cw * 0.76;
    const grad = g.createLinearGradient(0, 24, 0, 62);
    grad.addColorStop(0, '#9fb6c8');
    grad.addColorStop(1, '#5f7688');
    g.fillStyle = grad;
    g.fillRect(x, 24, w, 38);
    g.strokeStyle = 'rgba(30,36,44,0.8)';
    g.lineWidth = 2;
    g.strokeRect(x, 24, w, 38);
    g.beginPath();
    g.moveTo(x + w / 2, 24);
    g.lineTo(x + w / 2, 62);
    g.stroke();
    if (Math.random() < 0.85) {
      b.g.fillStyle = Math.random() < 0.85 ? '#ffd99a' : '#cfe4ff';
      b.g.globalAlpha = 0.55 + Math.random() * 0.45;
      b.g.fillRect(x + 2, 26, w - 4, 34);
    }
  }
  // 아래 콘크리트 턱
  g.fillStyle = '#6b6f75';
  g.fillRect(0, H - 26, W, 26);
  speckle(g, W, H, 1500, 0.06);
  return { map: finish(a.c, false), emissive: finish(b.c, false) };
}

/** 사무동 벽: 층마다 띠창. cols × rows 칸. map 과 밤 불빛 */
export function officeTextures(cols: number, rows: number) {
  const CW = 40;
  const RH = 48;
  const W = cols * CW;
  const H = rows * RH;
  const a = canvas(W, H);
  const b = canvas(W, H);
  const g = a.g;
  g.fillStyle = '#d5d8dc';
  g.fillRect(0, 0, W, H);
  b.g.fillStyle = '#000';
  b.g.fillRect(0, 0, W, H);
  for (let r = 0; r < rows; r++) {
    const y = r * RH;
    // 층 사이 띠(스팬드럴)
    g.fillStyle = '#b9bec5';
    g.fillRect(0, y, W, 14);
    g.fillStyle = 'rgba(0,0,0,0.18)';
    g.fillRect(0, y + 13, W, 2);
    for (let i = 0; i < cols; i++) {
      const x = i * CW + 4;
      const grad = g.createLinearGradient(0, y + 16, 0, y + RH - 4);
      grad.addColorStop(0, '#6f93b3');
      grad.addColorStop(0.55, '#3f5f7d');
      grad.addColorStop(1, '#2c4660');
      g.fillStyle = grad;
      g.fillRect(x, y + 16, CW - 8, RH - 20);
      // 유리에 비친 하늘 한 줄
      g.fillStyle = 'rgba(255,255,255,0.14)';
      g.fillRect(x, y + 18, CW - 8, 4);
      if (Math.random() < 0.45) {
        b.g.fillStyle = Math.random() < 0.8 ? '#ffd99a' : '#d8e8ff';
        b.g.globalAlpha = 0.5 + Math.random() * 0.5;
        b.g.fillRect(x, y + 16, CW - 8, RH - 20);
      }
    }
  }
  // 기둥 줄
  g.fillStyle = '#c3c7cd';
  for (let i = 0; i <= cols; i += 4) g.fillRect(i * CW - 3, 0, 6, H);
  speckle(g, W, H, 1200, 0.04);
  return { map: finish(a.c, false), emissive: finish(b.c, false) };
}

/** 지붕 강판(골이 지붕 경사 방향) */
export function roofTexture() {
  const { c, g } = canvas(128, 128);
  g.fillStyle = '#566170';
  g.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 8) {
    const grad = g.createLinearGradient(0, y, 0, y + 8);
    grad.addColorStop(0, 'rgba(255,255,255,0.10)');
    grad.addColorStop(0.5, 'rgba(0,0,0,0.12)');
    grad.addColorStop(1, 'rgba(255,255,255,0.03)');
    g.fillStyle = grad;
    g.fillRect(0, y, 128, 8);
  }
  speckle(g, 128, 128, 500, 0.06);
  return finish(c);
}

/** 가장자리가 부드러운 구름 덩어리 */
export function cloudTexture() {
  const { c, g } = canvas(256, 128);
  for (let i = 0; i < 26; i++) {
    const x = 40 + Math.random() * 176;
    const y = 50 + Math.random() * 40 - Math.abs(x - 128) * 0.08;
    const r = 18 + Math.random() * 30;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(255,255,255,0.35)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 128);
  }
  return finish(c, false);
}

/** 적치장 블록 옆면: 외판 이음과 늑골 자국(흰 바탕이라 인스턴스 색이 그대로 곱해진다) */
export function blockTexture() {
  const { c, g } = canvas(256, 256);
  g.fillStyle = '#f2f2f2';
  g.fillRect(0, 0, 256, 256);
  speckle(g, 256, 256, 1800, 0.07);
  blotch(g, 256, 256, 6, 'rgba(90,50,30,0.10)', 60); // 녹 얼룩
  g.strokeStyle = 'rgba(0,0,0,0.28)';
  g.lineWidth = 2;
  for (let x = 32; x < 256; x += 32) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, 256);
    g.stroke();
  }
  g.strokeStyle = 'rgba(0,0,0,0.4)';
  g.lineWidth = 3;
  for (const y of [84, 170]) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(256, y);
    g.stroke();
  }
  g.strokeStyle = 'rgba(0,0,0,0.55)';
  g.lineWidth = 6;
  g.strokeRect(0, 0, 256, 256);
  return finish(c, false);
}
