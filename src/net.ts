/**
 * 다중 접속 연결(2026-11-17). 서버는 worker/index.ts, 규칙은 CLAUDE.md '다중 접속'.
 * - 방은 조선소 전체 하나: 한 번 붙으면 어느 장소에 있든 서로 보인다. 장소를 옮기면 '어디를 보는지'만 알린다.
 * - 조감 견학에서는 위치를 보내지 않는다. 걷는 동안만 0.4초마다, 자리가 바뀌었을 때만. 자리와 함께 속도를 보내
 *   받는 쪽이 다음 소식까지 그 속도로 이어 그린다(2026-11-17 "상대 움직임이 뚝뚝 끊긴다").
 * - 서버가 없으면(로컬 미리보기) 몇 번 해 보고 조용히 그만둔다. 화면은 혼자일 때와 같다.
 */
export type Helmet = 'yellow' | 'white' | 'orange' | 'blue';
export const HELMETS: Helmet[] = ['yellow', 'white', 'orange', 'blue'];

export interface Peer {
  id: number;
  n: string;
  h: Helmet;
  /** 보고 있는 장소 */
  s: string;
  x: number;
  z: number;
  d: number;
  /** 0 조감, 1 걷기, 2 자전거 */
  m: number;
  /** 마지막으로 받은 속도(m/s)와 받은 시각 — 다음 소식이 올 때까지 이 속도로 이어 그린다 */
  vx?: number;
  vz?: number;
  t?: number;
}

interface Options {
  /** 사람 목록이나 숫자가 바뀜 */
  onChange: () => void;
  onPing: (p: Peer, x: number, z: number) => void;
  onWave: (p: Peer) => void;
}

const KEY = 'shipyard-me';
/** 걷는 자리 보내는 간격(ms). 2026-11-17 '걷는 것도 부담': 초당 4번 → 2번, 제자리에서 도는 것은 보내지 않음 */
const SEND_EVERY = 400;

export function loadMe(): { name: string; helmet: Helmet } {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return { name: typeof v.name === 'string' ? v.name.slice(0, 12) : '', helmet: HELMETS.includes(v.helmet) ? v.helmet : 'yellow' };
  } catch {
    return { name: '', helmet: 'yellow' };
  }
}

/** 별명을 임의로 짓는다(들어올 때 미리 채워 주고, 사용자가 고친다). 현장 직종·설비 이름으로 */
export function randomName() {
  const A = ['든든한', '꼼꼼한', '부지런한', '차분한', '노련한', '씩씩한', '느긋한', '날렵한', '묵묵한', '유쾌한'];
  const B = ['신호수', '용접사', '도장공', '배관사', '기관사', '항해사', '설계자', '크레인', '예인선', '족장공', '검사관', '선장'];
  const pick = (a: string[]) => a[Math.floor(Math.random() * a.length)];
  return `${pick(A)} ${pick(B)}`;
}

/** 닉네임이 없을 때 보이는 이름 */
export const nameOf = (p: Peer) => p.n || `견학자 ${10 + (p.id % 90)}`;

export function createNet(o: Options) {
  const peers = new Map<number, Peer>();
  let me = loadMe();
  let ws: WebSocket | null = null;
  let station = '';
  let sentStation = '';
  let stTimer = 0;
  let online = false;
  let everOnline = false;
  let fails = 0;
  let dead = false;
  let timer = 0;
  let last = { x: 0, z: 0, d: 0, m: 0 };
  let sent = { x: NaN, z: NaN, d: NaN, m: -1, at: 0 };
  let vel = { vx: 0, vz: 0 };
  let sentMoving = false;
  /** 속도를 재는 기준(약 0.1초 전의 자리와 시각) */
  let seen = { x: 0, z: 0, t: 0 };

  const send = (m: unknown) => {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m));
  };

  function close() {
    const old = ws;
    ws = null;
    online = false;
    peers.clear();
    if (old) {
      old.onclose = old.onmessage = old.onopen = old.onerror = null;
      try {
        old.close();
      } catch {
        /* 이미 닫힘 */
      }
    }
  }

  function open() {
    clearTimeout(timer);
    close();
    o.onChange();
    if (dead || !station) return;
    const sock = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
    ws = sock;
    sock.onopen = () => {
      let first = false;
      try {
        first = !sessionStorage.getItem(KEY);
        sessionStorage.setItem(KEY, '1');
      } catch {
        /* 저장이 막혀도 그대로 */
      }
      sent = { ...last, at: performance.now() };
      sentStation = station;
      send({ t: 'hello', n: me.name, h: me.helmet, s: station, first, ...last });
    };
    sock.onmessage = (e) => {
      let m: any;
      try {
        m = JSON.parse(e.data);
      } catch {
        return;
      }
      if (m.t === 'init') {
        online = everOnline = true;
        fails = 0;
        peers.clear();
        for (const p of m.peers as Peer[]) peers.set(p.id, p);
        // 붙는 사이에 장소를 옮겼으면 지금 알린다
        if (station !== sentStation) {
          sentStation = station;
          send({ t: 'at', s: station });
        }
      } else if (m.t === 'join') {
        peers.set(m.p.id, m.p);
      } else if (m.t === 'leave') {
        peers.delete(m.id);
      } else if (m.t === 'at') {
        const p = peers.get(m.id);
        if (!p) return;
        p.s = m.s;
      } else if (m.t === 'pos') {
        const p = peers.get(m.id);
        if (!p) return;
        p.x = m.x;
        p.z = m.z;
        p.d = m.d;
        p.m = m.m;
        p.vx = m.vx ?? 0;
        p.vz = m.vz ?? 0;
        p.t = performance.now();
        return; // 숫자는 그대로라 화면 글자는 안 고친다
      } else if (m.t === 'ping') {
        const p = peers.get(m.id);
        if (p) o.onPing(p, m.x, m.z);
        return;
      } else if (m.t === 'wave') {
        const p = peers.get(m.id);
        if (p) o.onWave(p);
        return;
      }
      o.onChange();
    };
    sock.onclose = () => {
      if (ws !== sock) return;
      ws = null;
      online = false;
      peers.clear();
      o.onChange();
      // 한 번도 못 붙었으면 세 번까지만(서버 없는 로컬 미리보기). 붙었던 적이 있으면 계속 다시 시도
      if (!everOnline && ++fails >= 3) {
        dead = true;
        return;
      }
      timer = window.setTimeout(open, Math.min(30000, 2000 * 2 ** Math.min(fails, 4)));
      if (everOnline) fails++;
    };
  }

  return {
    peers,
    get online() {
      return online;
    },
    /** 지금 전체 접속 수(나 포함) */
    get all() {
      return peers.size + 1;
    },
    /** 그 장소를 보고 있는 다른 사람 수 */
    countAt(id: string) {
      let n = 0;
      for (const p of peers.values()) if (p.s === id) n++;
      return n;
    },
    get me() {
      return me;
    },
    /** 지금 보는 장소. 처음 불리면 접속하고, 그 뒤로는 0.6초 머문 장소만 알린다(빠르게 지나가는 장소는 건너뜀) */
    setStation(id: string) {
      if (id === station) return;
      const first = !station;
      station = id;
      if (first) {
        open();
        return;
      }
      clearTimeout(stTimer);
      stTimer = window.setTimeout(() => {
        if (!online || station === sentStation) return;
        sentStation = station;
        send({ t: 'at', s: station });
      }, 600);
    },
    /** 내 자리(걷는 동안). 조감이면 m = 0 */
    setPos(x: number, z: number, d: number, m: number) {
      const now = performance.now();
      // 속도는 실제 시간으로 잰다(느린 기기는 한 프레임 이동을 제한하므로 걷기 코드의 속도 값이 실제보다 크다)
      const gap = (now - seen.t) / 1000;
      if (m === 0 || gap > 1) vel = { vx: 0, vz: 0 };
      else if (gap >= 0.08) {
        vel = { vx: Math.round(((x - seen.x) / gap) * 10) / 10, vz: Math.round(((z - seen.z) / gap) * 10) / 10 };
        if (Math.hypot(vel.vx, vel.vz) < 0.3) vel = { vx: 0, vz: 0 };
      }
      if (m === 0 || gap > 1 || gap >= 0.08) seen = { x, z, t: now };
      last = { x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10, d: Math.round(d * 100) / 100, m };
      if (!online) return;
      const moving = vel.vx !== 0 || vel.vz !== 0;
      // 멈춘 순간은 간격을 기다리지 않고 바로 알린다(받는 쪽이 속도로 이어 그리다 지나치지 않게)
      const stopped = sentMoving && !moving;
      if (!stopped && now - sent.at < SEND_EVERY) return;
      if (!stopped && last.m === sent.m && last.x === sent.x && last.z === sent.z) return;
      sent = { ...last, at: now };
      sentMoving = moving;
      send({ t: 'pos', ...last, ...vel });
    },
    ping(x: number, z: number) {
      send({ t: 'ping', x, z });
    },
    wave() {
      send({ t: 'wave' });
    },
    /** 닉네임·안전모 색을 바꾸면 다시 붙는다(서버는 접속할 때 한 번만 받는다) */
    setMe(name: string, helmet: Helmet) {
      me = { name: name.trim().slice(0, 12), helmet };
      try {
        localStorage.setItem(KEY, JSON.stringify(me));
      } catch {
        /* 저장이 막혀도 이번 접속에는 쓴다 */
      }
      if (station && !dead) open();
    },
  };
}
export type Net = ReturnType<typeof createNet>;
