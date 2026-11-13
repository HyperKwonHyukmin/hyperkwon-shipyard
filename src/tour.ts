/**
 * P1: 장소 둘러보기.
 * - 장소를 고르면 카메라가 그 장소로 날아간다(약 2초).
 * - 오른쪽 설명 패널: 이름, 공식 공정 단계, 설명, 공개 기록과 출처.
 * - 아래: 이전 / 지도(방문 n/11) / 다음. 지도는 위에서 본 배치도에 장소 번호를 찍는다.
 * - 방문한 장소는 브라우저에 저장한다(다시 왔을 때 지도에 표시). 저장이 막힌 환경에서도 화면은 그대로 동작한다.
 * - 주소 끝 #장소id 로 바로 들어올 수 있다(예: #dock).
 */
import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Station } from './content/stations';
import { ROADS, routeBetween } from './layout';

const STORE_KEY = 'ulsan-story:visited';
const FLY_SEC = 2;

interface TourOptions {
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  stations: Station[];
  /** 처음 장소로 카메라를 옮길지(?cam 으로 시점을 고정할 때는 false) */
  placeCamera: boolean;
  /** 장소별 추가 화면(예: 도크의 건조 시점 막대) */
  renderExtra?: (station: Station, el: HTMLElement) => void;
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const inOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function loadVisited(): Set<string> {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}
function saveVisited(v: Set<string>) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify([...v]));
  } catch {
    /* 저장이 막혀도 둘러보기는 계속 */
  }
}

export function createTour(opt: TourOptions) {
  const { camera, controls, stations } = opt;
  const visited = loadVisited();
  let current = -1;
  let fly: { k: number; p0: THREE.Vector3; t0: THREE.Vector3; p1: THREE.Vector3; t1: THREE.Vector3; sec?: number } | null = null;

  const panel = $('panel');
  const toggle = $<HTMLButtonElement>('p-toggle');
  const mapEl = $('map');

  // ── 패널 접기 ──
  function setCollapsed(c: boolean) {
    panel.classList.toggle('collapsed', c);
    toggle.textContent = c ? '펼치기' : '접기';
    toggle.setAttribute('aria-expanded', String(!c));
  }
  toggle.addEventListener('click', () => setCollapsed(!panel.classList.contains('collapsed')));
  if (matchMedia('(max-width: 700px)').matches) setCollapsed(true);

  // ── 패널 내용 ──
  function render(i: number) {
    const s = stations[i];
    $('p-no').textContent = String(i);
    $('p-name').textContent = s.name;
    $('p-proc').textContent = s.processes.length ? `공정 ${s.processes.join(' · ')}` : '공정 전 · 이야기의 시작';
    $('p-summary').textContent = s.summary;
    const facts = $('p-facts');
    facts.innerHTML = s.facts
      .map(
        (f) =>
          `<li>${esc(f.text)} <a href="${esc(f.source.url)}" target="_blank" rel="noopener noreferrer">${esc(f.source.label)}</a></li>`,
      )
      .join('');
    $('p-facts-head').hidden = s.facts.length === 0;
    // 블록 흐름: 어디서 들어오고 어디로 나가는지. 누르면 그 장소로
    const flowEl = $('p-flow');
    const flows = s.flow ?? [];
    flowEl.hidden = flows.length === 0;
    flowEl.innerHTML = flows.length
      ? '<h3>블록 흐름</h3>' +
        flows
          .map((f) => {
            const j = stations.findIndex((t) => t.id === f.to);
            if (j < 0) return '';
            const where = `${j}. ${esc(stations[j].name)}`;
            return f.dir === 'in'
              ? `<button type="button" data-go="${j}"><b>← 들어옴</b> ${where}에서 ${esc(f.text)}</button>`
              : `<button type="button" data-go="${j}"><b>→ 나감</b> ${esc(f.text)} → ${where}</button>`;
          })
          .join('')
      : '';
    const extra = $('p-extra');
    extra.innerHTML = '';
    opt.renderExtra?.(s, extra);
    $('hud-station').textContent = `${i}. ${s.name}${s.processes.length ? ` — ${s.processes.join(', ')}` : ''}`;
    $<HTMLButtonElement>('prev').disabled = i === 0;
    $<HTMLButtonElement>('next').disabled = i === stations.length - 1;
    $('visited').textContent = String(visited.size);
    $('visited-total').textContent = String(stations.length);
    drawMap();
  }

  // ── 지도(위에서 본 배치도) ──
  const VB = { x0: -760, x1: 780, z0: -300, z1: 300 };
  function drawMap() {
    const svg = $('map-svg');
    svg.setAttribute('viewBox', `${VB.x0} ${VB.z0} ${VB.x1 - VB.x0} ${VB.z1 - VB.z0}`);
    const rect = (x0: number, z0: number, x1: number, z1: number, cls: string) =>
      `<rect x="${x0}" y="${z0}" width="${x1 - x0}" height="${z1 - z0}" class="${cls}"/>`;
    let html = rect(VB.x0, VB.z0, 118, VB.z1, 'm-land') + rect(118, VB.z0, VB.x1, VB.z1, 'm-sea');
    // 도로망(layout.ts)
    for (const r of ROADS)
      html += r.h ? rect(r.from, r.at - r.half, r.to, r.at + r.half, 'm-road') : rect(r.at - r.half, r.from, r.at + r.half, r.to, 'm-road');
    html +=
      rect(-110, -24, 110, 24, 'm-dock') +
      rect(110, -26, 118, 26, 'm-gate') +
      rect(130, 139, 430, 165, 'm-pier') +
      rect(130, -165, 430, -139, 'm-pier');
    // 블록 흐름 화살표: 트랜스포터와 같은 길(layout.ts)을 따라 그린다
    html += '<defs><marker id="m-arrow" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" class="m-arrow"/></marker></defs>';
    for (const s of stations)
      for (const f of s.flow ?? []) {
        const t = stations.find((u) => u.id === f.to);
        if (f.dir !== 'out' || !t) continue;
        const path = routeBetween(s.at, f.to === 'dock' ? null : t.at);
        html += `<path class="m-flow" d="${path.map(([x, z], i) => `${i ? 'L' : 'M'}${x} ${z}`).join(' ')}" marker-end="url(#m-arrow)"/>`;
      }
    stations.forEach((s, i) => {
      const [x, , z] = s.at;
      const cls = i === current ? 'm-st now' : visited.has(s.id) ? 'm-st seen' : 'm-st';
      html += `<g class="${cls}" data-i="${i}" role="button" tabindex="0" aria-label="${i}. ${esc(s.name)}"><circle cx="${x}" cy="${z}" r="26"/><text x="${x}" y="${z + 1}">${i}</text></g>`;
    });
    svg.innerHTML = html;
    $('map-list').innerHTML = stations
      .map(
        (s, i) =>
          `<li><button type="button" data-i="${i}" class="${i === current ? 'now' : visited.has(s.id) ? 'seen' : ''}">${i}. ${esc(s.name)}${visited.has(s.id) ? ' ✓' : ''}</button></li>`,
      )
      .join('');
  }
  function openMap(open: boolean) {
    mapEl.hidden = !open;
    if (open) drawMap();
  }
  $('map-btn').addEventListener('click', () => openMap(mapEl.hidden));
  $('map-close').addEventListener('click', () => openMap(false));
  mapEl.addEventListener('click', (e) => {
    const t = (e.target as Element).closest('[data-i]');
    if (t) {
      go(Number(t.getAttribute('data-i')));
      openMap(false);
    } else if (e.target === mapEl) openMap(false);
  });
  mapEl.addEventListener('keydown', (e) => {
    const t = (e.target as Element).closest('g[data-i]');
    if (t && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      go(Number(t.getAttribute('data-i')));
      openMap(false);
    }
  });

  // ── 이동 ──
  function go(i: number, instant = false) {
    i = THREE.MathUtils.clamp(i, 0, stations.length - 1);
    const s = stations[i];
    current = i;
    visited.add(s.id);
    saveVisited(visited);
    const p1 = new THREE.Vector3(...s.cam);
    const t1 = new THREE.Vector3(...(s.look ?? s.at));
    if (instant) {
      camera.position.copy(p1);
      controls.target.copy(t1);
      controls.update();
      fly = null;
    } else {
      controls.autoRotate = false;
      controls.enabled = false;
      fly = { k: 0, p0: camera.position.clone(), t0: controls.target.clone(), p1, t1 };
    }
    try {
      history.replaceState(null, '', `#${s.id}`);
    } catch {
      /* 미리보기 등에서 막혀도 무시 */
    }
    render(i);
  }
  $('p-flow').addEventListener('click', (e) => {
    const b = (e.target as Element).closest('[data-go]');
    if (b) go(Number(b.getAttribute('data-go')));
  });
  $('prev').addEventListener('click', () => go(current - 1));
  $('next').addEventListener('click', () => go(current + 1));
  window.addEventListener('keydown', (e) => {
    if ((e.target as Element).closest('input, textarea')) return;
    if (e.key === 'ArrowRight') go(current + 1);
    else if (e.key === 'ArrowLeft') go(current - 1);
    else if (e.key === 'Escape') openMap(false);
  });

  /** 장소를 바꾸지 않고 카메라만 다른 시점으로(예: 도크의 인양 학습장 가까이 보기) */
  function flyTo(cam: [number, number, number], look: [number, number, number], sec = FLY_SEC) {
    controls.autoRotate = false;
    controls.enabled = false;
    fly = { k: 0, p0: camera.position.clone(), t0: controls.target.clone(), p1: new THREE.Vector3(...cam), t1: new THREE.Vector3(...look), sec };
  }

  function update(dt: number) {
    if (!fly) return;
    fly.k = Math.min(1, fly.k + dt / (fly.sec ?? FLY_SEC));
    const e = inOut(fly.k);
    // 먼 거리를 날 때는 중간에 살짝 높이 올라 전체가 보이게
    const lift = fly.sec ? 0 : Math.sin(Math.PI * e) * Math.min(120, fly.p0.distanceTo(fly.p1) * 0.25); // 짧은 이동(회전 중심 옮기기)은 솟지 않음
    camera.position.lerpVectors(fly.p0, fly.p1, e);
    camera.position.y += lift;
    controls.target.lerpVectors(fly.t0, fly.t1, e);
    if (fly.k >= 1) {
      fly = null;
      controls.enabled = true;
    }
  }

  // 시작 장소: 주소의 #id, 없으면 도크
  const fromHash = stations.findIndex((s) => `#${s.id}` === location.hash);
  const start = fromHash >= 0 ? fromHash : stations.findIndex((s) => s.id === 'dock');
  if (opt.placeCamera) go(start, true);
  else {
    current = start;
    visited.add(stations[start].id);
    saveVisited(visited);
    render(start);
  }

  // ?map: 지도를 연 채로 시작(캡처 확인용)
  if (new URLSearchParams(location.search).has('map')) openMap(true);

  return { go, flyTo, update, get current() { return current; } };
}
