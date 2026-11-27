/**
 * 최소 다중 접속 서버(2026-11-17, PLAN.md 6장 '방향 검토' 표의 2).
 * - 방은 조선소 전체 하나(`yard-1`): 접속한 사람은 어느 장소에 있든 서로 보인다(2026-11-17 장소별 방에서 바꿈 —
 *   장소별로 나누니 동시에 들어와도 서로 못 만났다). 방이 차면(150명) `yard-2`… 로 넘긴다.
 * - 주고받는 것: 들어옴·나감, 보고 있는 장소(바뀔 때만), 걷는 사람의 위치(보내는 쪽이 초당 2번 이하로 줄여 보냄), 핑, 손 흔들기.
 * - 저장은 이름 없는 숫자만(`Stats`): 날짜별 방문 횟수와 최대 동시 접속. 닉네임·IP 는 저장하지 않는다.
 *   2026-11-27 통계 대시보드(`/stats.html`): 순방문자, 재방문, 시간대, 머문 시간, 체험 시작과 끝냄, 장소별 머문 시간, 공유.
 *   재방문 판정은 브라우저가 한다(마지막 방문 날짜를 브라우저에만 둔다). 서버는 칸별 개수만 더하고 사람을 알아볼 값은 받지 않는다.
 *   닉네임은 주소(쿼리)에 싣지 않고 첫 메시지(hello)로 받는다 — 주소는 요청 기록에 남기 때문.
 * - 채팅·로그인 없음. 닉네임은 12자까지, 접속할 때 한 번만 정한다.
 * 화면 파일(dist)은 Worker 를 거치지 않고 바로 나간다. Worker 는 /ws 와 /api/* 만 받는다.
 */
import { DurableObject } from 'cloudflare:workers';
import { STATIONS } from '../src/content/stations';

interface Env {
  ROOM: DurableObjectNamespace<Room>;
  STATS: DurableObjectNamespace<Stats>;
  ASSETS: Fetcher;
}

const ROOMS = new Set(STATIONS.map((s) => s.id));
const HELMETS = ['yellow', 'white', 'orange', 'blue'];
/** 방 하나에 받는 최대 접속(화면에는 30명까지만 그린다) */
const MAX_ROOM = 150;
/** 방이 차면 넘길 방 수(yard-1 … yard-4) */
const SHARDS = 4;
/** 한 접속이 1초에 보낼 수 있는 메시지 수 */
const RATE = 12;
/** 좌표 한계(야드 바깥 값은 잘라 낸다) */
const LIMIT = 1500;
/**
 * 받는 통계 소식 이름(허용 목록). 종류: s 시작, e 끝냄, q 견학 단계, lv 설명 깊이, sh 공유.
 * 목록 밖 이름은 버린다(2026-11-27 Codex 검토: 아무 이름이나 받으면 하루 이름 한도를 엉뚱한 이름으로 채워 진짜 소식을 막을 수 있다).
 * 새 체험을 더하면 EXP_IDS 에도 더한다(main.ts 의 begin/track 이름, stats.html 의 EXP).
 */
const EXP_IDS = ['build', 'build-sea', 'crane', 'launch', 'turn', 'lift', 'forces', 'quick', 'heat', 'weld', 'level', 'spray', 'heel', 'helm', 'bottle'];
const EV_KEYS = new Set([
  ...EXP_IDS.flatMap((id) => [`s:${id}`, `e:${id}`]),
  ...STATIONS.map((s) => `q:${s.id}`),
  'lv:1', 'lv:2', 'lv:3',
  'sh:photo', 'sh:link',
  // 위 단추(2026-11-27): 체험 고르기 창 열기, 보기 설정 단추
  'ui:exp', 'ui:time', 'ui:sound', 'ui:speed', 'ui:spin', 'ui:overview',
]);
/** 한 접속이 보낼 수 있는 통계 소식 수 */
const EV_MAX = 300;

/** 접속 하나의 상태(소켓에 붙여 둔다. 저장소에는 쓰지 않는다) */
interface Peer {
  id: number;
  /** 방 이름(yard-1 …) */
  r: string;
  /** 보고 있는 장소 */
  s: string;
  /** hello 를 받았는가(받기 전에는 다른 사람에게 알리지 않는다) */
  ok: boolean;
  n: string;
  h: string;
  x: number;
  z: number;
  d: number;
  /** 0 조감, 1 걷기, 2 자전거 */
  m: number;
  /** hello 를 받은 시각(ms). 끊길 때 머문 시간을 잰다 */
  t0?: number;
  /** 같은 화면에서 다시 붙었을 때, 앞 접속들에서 이미 머문 초 */
  since?: number;
  /** 세지 않는 접속(?nostats 로 표시한 개발자 브라우저) */
  ns?: boolean;
  /** 화면이 스스로 다시 붙으려고 끊는다(bye): 이번 조각의 머문 시간은 다음 접속이 이어서 잰다 */
  bye?: boolean;
  /** 이 접속이 보낸 통계 소식 수(넘치면 버린다) */
  evN?: number;
}

const num = (v: unknown, lim: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(-lim, Math.min(lim, Math.round(v * 10) / 10)) : 0);
/** 닉네임: 글자·숫자·공백·몇 가지 기호만, 12자까지 */
const cleanName = (v: unknown) =>
  typeof v === 'string'
    ? v
        .replace(/[^\p{L}\p{N} _.\-]/gu, '')
        .trim()
        .slice(0, 12)
    : '';
const pub = (p: Peer) => ({ id: p.id, n: p.n, h: p.h, s: p.s, x: p.x, z: p.z, d: p.d, m: p.m });

export class Room extends DurableObject<Env> {
  /** 속도 제한용(메모리만. 잠들었다 깨면 비워져도 된다) */
  private rate = new Map<WebSocket, { t: number; n: number }>();

  async fetch(req: Request): Promise<Response> {
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('websocket only', { status: 426 });
    if (this.ctx.getWebSockets().length >= MAX_ROOM) return new Response('room full', { status: 503 });
    const room = new URL(req.url).searchParams.get('room') ?? '';
    const pair = new WebSocketPair();
    const me: Peer = { id: 1 + Math.floor(Math.random() * 2 ** 30), r: room, s: 'dock', ok: false, n: '', h: 'yellow', x: 0, z: 0, d: 0, m: 0 };
    this.ctx.acceptWebSocket(pair[1]);
    pair[1].serializeAttachment(me);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  private peers(except?: WebSocket) {
    const out: { ws: WebSocket; p: Peer }[] = [];
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except) continue;
      const p = ws.deserializeAttachment() as Peer | null;
      if (p?.ok) out.push({ ws, p });
    }
    return out;
  }

  private cast(msg: unknown, except?: WebSocket) {
    const s = JSON.stringify(msg);
    for (const { ws } of this.peers(except)) {
      try {
        ws.send(s);
      } catch {
        /* 끊기는 중인 소켓 */
      }
    }
  }

  private stats() {
    return this.env.STATS.get(this.env.STATS.idFromName('all'));
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    if (typeof raw !== 'string' || raw.length > 300) return;
    const now = Date.now();
    const r = this.rate.get(ws);
    if (!r || now - r.t > 1000) this.rate.set(ws, { t: now, n: 1 });
    else if (++r.n > RATE) return;
    let m: Record<string, unknown>;
    try {
      m = JSON.parse(raw);
    } catch {
      return;
    }
    const me = ws.deserializeAttachment() as Peer | null;
    if (!me || typeof m !== 'object' || m === null) return;
    if (m.t === 'hello') {
      if (me.ok) return;
      me.ok = true;
      me.n = cleanName(m.n);
      me.h = HELMETS.includes(m.h as string) ? (m.h as string) : 'yellow';
      if (ROOMS.has(m.s as string)) me.s = m.s as string;
      me.x = num(m.x, LIMIT);
      me.z = num(m.z, LIMIT);
      me.d = num(m.d, 7);
      me.m = m.m === 1 || m.m === 2 ? m.m : 0;
      me.t0 = Date.now();
      me.since = num(m.since, 86400);
      me.ns = m.ns === true;
      ws.serializeAttachment(me);
      const others = this.peers(ws);
      let all = others.length + 1;
      // 세지 않는 브라우저도 지금 접속 수에는 들어간다(다른 사람에게 보이므로)
      const visit: Visit | undefined = me.ns
        ? undefined
        : {
            first: m.first === true,
            day: m.day === 'new' || m.day === 'd7' || m.day === 'old' ? m.day : undefined,
            back: m.back === true,
            link: m.link === true,
          };
      try {
        all = await this.stats().report(me.r, others.length + 1, visit);
      } catch {
        /* 숫자 기록이 실패해도 접속은 그대로 */
      }
      ws.send(JSON.stringify({ t: 'init', id: me.id, peers: others.map((o) => pub(o.p)), all }));
      this.cast({ t: 'join', p: pub(me) }, ws);
      return;
    }
    if (!me.ok) return;
    if (m.t === 'pos') {
      me.x = num(m.x, LIMIT);
      me.z = num(m.z, LIMIT);
      me.d = num(m.d, 7);
      me.m = m.m === 1 || m.m === 2 ? m.m : 0;
      ws.serializeAttachment(me);
      // 속도는 받는 쪽이 이어 그리는 데만 쓴다(저장하지 않음)
      this.cast({ t: 'pos', id: me.id, x: me.x, z: me.z, d: me.d, m: me.m, vx: num(m.vx, 80), vz: num(m.vz, 80) }, ws);
    } else if (m.t === 'at') {
      if (!ROOMS.has(m.s as string) || m.s === me.s) return;
      me.s = m.s as string;
      ws.serializeAttachment(me);
      this.cast({ t: 'at', id: me.id, s: me.s }, ws);
    } else if (m.t === 'ping') {
      this.cast({ t: 'ping', id: me.id, x: num(m.x, LIMIT), z: num(m.z, LIMIT) }, ws);
    } else if (m.t === 'wave') {
      this.cast({ t: 'wave', id: me.id }, ws);
    } else if (m.t === 'bye') {
      me.bye = true;
      ws.serializeAttachment(me);
    } else if (m.t === 'ev' || m.t === 'dw') {
      if (me.ns) return;
      me.evN = (me.evN ?? 0) + 1;
      if (me.evN > EV_MAX) return;
      ws.serializeAttachment(me);
      try {
        if (m.t === 'ev' && typeof m.k === 'string' && EV_KEYS.has(m.k)) await this.stats().track('ev', m.k, 1);
        else if (m.t === 'dw' && ROOMS.has(m.s as string)) {
          const sec = Math.round(num(m.sec, 600));
          if (sec >= 1) await this.stats().track('dw', m.s as string, sec);
        }
      } catch {
        /* 숫자 기록 실패는 넘긴다 */
      }
    }
  }

  private async gone(ws: WebSocket) {
    this.rate.delete(ws);
    const me = ws.deserializeAttachment() as Peer | null;
    if (!me?.ok) return;
    this.cast({ t: 'leave', id: me.id }, ws);
    // 머문 시간: 화면이 스스로 다시 붙으려고 끊은 조각(bye)은 세지 않는다(다음 접속이 since 로 이어서 잰다)
    const dur = !me.ns && !me.bye && me.t0 ? (Date.now() - me.t0) / 1000 + (me.since ?? 0) : undefined;
    try {
      await this.stats().report(me.r, this.peers(ws).length, undefined, dur);
    } catch {
      /* 숫자 기록 실패는 넘긴다 */
    }
  }

  async webSocketClose(ws: WebSocket, code: number) {
    await this.gone(ws);
    try {
      ws.close(code === 1005 || code === 1006 ? 1000 : code);
    } catch {
      /* 이미 닫힘 */
    }
  }

  async webSocketError(ws: WebSocket) {
    await this.gone(ws);
  }
}

/** 한국 날짜(YYYY-MM-DD) */
const today = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

/** 접속할 때 브라우저가 알리는 것(모두 사람을 알아볼 수 없는 표시) */
interface Visit {
  /** 이 탭에서 처음 붙음(방문 횟수) */
  first: boolean;
  /** 이 브라우저의 오늘 첫 방문: 처음 온 브라우저 / 7일 안에 왔던 브라우저 / 그 전에 왔던 브라우저 */
  day?: 'new' | 'd7' | 'old';
  /** 처음 온 날부터 7일 안에 다시 왔다(브라우저마다 한 번만 보낸다) */
  back: boolean;
  /** 공유된 시점 주소(?cam=)로 들어왔다 */
  link: boolean;
}

/** 하루 기록. 2026-11-27 전 기록에는 visits·peak 만 있다 */
interface Day {
  visits: number;
  peak: number;
  /** 순방문자(브라우저 기준) */
  uniq?: number;
  ret?: { new: number; d7: number; old: number };
  /** 처음 온 날부터 7일 안에 다시 온 브라우저 수(다시 온 날에 센다) */
  back?: number;
  /** 시간대별 방문(한국 시각 0~23시) */
  hours?: number[];
  /** 머문 시간 구간별 접속 수: 1분 미만, 1~5분, 5~15분, 15~30분, 30분 이상 */
  dur?: number[];
  /** 머문 시간 합(초, 접속 하나에 60분까지만 더함)과 접속 수 */
  durSum?: number;
  durN?: number;
  /** 체험 시작과 끝냄, 견학 단계, 설명 깊이, 공유 */
  ev?: Record<string, number>;
  /** 장소별 직접 본 시간(초, 빠른 견학과 오프닝 제외) */
  dw?: Record<string, number>;
}

/** 머문 시간 구간의 경계(초) */
const DUR_EDGES = [60, 300, 900, 1800];
/** 하루 기록에 받는 소식 이름 수(넘치면 새 이름은 버린다) */
const EV_NAMES = 80;
/** 지금 한국 시각의 시(0~23) */
const hourKst = () => new Date(Date.now() + 9 * 3600e3).getUTCHours();

/** 이름 없는 숫자만: 지금 방별 접속 수, 날짜별 기록(Day) */
export class Stats extends DurableObject<Env> {
  private async day() {
    const key = `d:${today()}`;
    return { key, day: (await this.ctx.storage.get<Day>(key)) ?? { visits: 0, peak: 0 } };
  }

  /** 방이 자기 인원을 알린다(들어올 때는 visit, 나갈 때는 머문 초 dur). 돌려주는 값은 지금 전체 접속 수 */
  async report(room: string, n: number, visit?: Visit, dur?: number): Promise<number> {
    const rooms = (await this.ctx.storage.get<Record<string, number>>('rooms')) ?? {};
    // 방 이름이 아닌 옛 기록(장소별 방 시절)은 버린다
    for (const k of Object.keys(rooms)) if (!k.startsWith('yard-')) delete rooms[k];
    if (n > 0) rooms[room] = n;
    else delete rooms[room];
    const total = Object.values(rooms).reduce((a, b) => a + b, 0);
    const { key, day } = await this.day();
    if (visit?.first) {
      day.visits++;
      (day.hours ??= Array(24).fill(0))[hourKst()]++;
      if (visit.link) (day.ev ??= {})['in:link'] = (day.ev['in:link'] ?? 0) + 1;
    }
    if (visit?.day) {
      day.uniq = (day.uniq ?? 0) + 1;
      (day.ret ??= { new: 0, d7: 0, old: 0 })[visit.day]++;
    }
    if (visit?.back) day.back = (day.back ?? 0) + 1;
    if (dur !== undefined && Number.isFinite(dur) && dur >= 0) {
      let i = 0;
      while (i < DUR_EDGES.length && dur >= DUR_EDGES[i]) i++;
      (day.dur ??= [0, 0, 0, 0, 0])[i]++;
      day.durSum = (day.durSum ?? 0) + Math.min(dur, 3600);
      day.durN = (day.durN ?? 0) + 1;
    }
    if (total > day.peak) day.peak = total;
    await this.ctx.storage.put({ rooms, [key]: day });
    return total;
  }

  /** 체험·견학·공유 소식(ev) 또는 장소별 머문 초(dw)를 더한다. 이름 검증은 방이 먼저 한다(허용 목록이라 이름 수에 한계가 있다) */
  async track(kind: 'ev' | 'dw', name: string, v: number) {
    const { key, day } = await this.day();
    const box = (day[kind] ??= {});
    if (!(name in box) && Object.keys(box).length >= EV_NAMES) return;
    box[name] = (box[name] ?? 0) + v;
    await this.ctx.storage.put(key, day);
  }

  async summary() {
    const rooms = (await this.ctx.storage.get<Record<string, number>>('rooms')) ?? {};
    const days = await this.ctx.storage.list<Day>({ prefix: 'd:', reverse: true, limit: 30 });
    return {
      now: Object.values(rooms).reduce((a, b) => a + b, 0),
      rooms,
      names: Object.fromEntries(STATIONS.map((s) => [s.id, s.name])),
      days: [...days].map(([k, v]) => ({ day: k.slice(2), ...v })),
    };
  }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/ws') {
      // 다른 사이트의 화면이 이 서버에 붙지 못하게 한다
      const origin = req.headers.get('Origin');
      if (origin && new URL(origin).host !== url.host) return new Response('forbidden', { status: 403 });
      // 조선소 전체가 방 하나. 찼으면(503) 다음 방으로
      for (let i = 1; i <= SHARDS; i++) {
        const name = `yard-${i}`;
        const u = new URL(req.url);
        u.searchParams.set('room', name);
        const res = await env.ROOM.get(env.ROOM.idFromName(name)).fetch(new Request(u, req));
        if (res.status !== 503) return res;
      }
      return new Response('full', { status: 503 });
    }
    if (url.pathname === '/api/stats') {
      return Response.json(await env.STATS.get(env.STATS.idFromName('all')).summary(), { headers: { 'Cache-Control': 'no-store' } });
    }
    return env.ASSETS.fetch(req);
  },
} satisfies ExportedHandler<Env>;
