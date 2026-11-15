/**
 * 장소(스테이션) 내용. 문장을 고칠 때 3D 코드를 건드리지 않도록 여기에만 둔다.
 * 원칙(CLAUDE.md): 공개 자료의 사실만 우리 말로 쓰고 출처를 단다. 자료마다 숫자가 다르면 둘 다 적는다.
 * 좌표: at = 장소 중심(월드 m), cam = 그 장소를 볼 카메라 위치. x 가 클수록 바다 쪽.
 */

export interface Source {
  label: string;
  url: string;
}
export interface Fact {
  text: string;
  source: Source;
}
/** 블록(또는 부재)이 이 장소로 들어오거나(in) 나가는(out) 흐름. to = 상대 장소 id */
export interface Flow {
  dir: 'in' | 'out';
  text: string;
  to: string;
}
export interface Station {
  id: string;
  name: string;
  /** 공식 건조 공정 12단계 가운데 이 장소의 단계(없으면 빈 배열) */
  processes: string[];
  summary: string;
  facts: Fact[];
  at: [number, number, number];
  cam: [number, number, number];
  /** 블록 흐름(패널 '블록 흐름', 지도 화살표, 도로 트랜스포터 경로가 out 흐름에서 나온다) */
  flow?: Flow[];
  /** 빠른 견학 한 바퀴(quicktour.ts)에서 보여 줄 한 줄 — 지금 화면에서 일어나는 일 */
  quick?: string;
  /** 카메라가 바라볼 점(없으면 at). 오른쪽 설명 패널에 가리지 않게 건물을 화면 왼쪽으로 옮길 때 */
  look?: [number, number, number];
}

const S = {
  history: { label: 'HD현대중공업 연혁', url: 'https://hd-hhi.com/kr/company/heritage/history' },
  business: { label: 'HD현대중공업 조선 사업', url: 'https://hd-hhi.com/kr/business/shipbuilding' },
  report33: {
    label: 'HD한국조선해양 지속가능경영보고서 2024, 33쪽',
    url: 'https://www.hd-ksoe.com/upload/files/2025/06/1e05cc09-7913-45e7-8ec6-e48df3d7fee5.pdf',
  },
  report100: {
    label: 'HD한국조선해양 지속가능경영보고서 2024, 100쪽',
    url: 'https://www.hd-ksoe.com/upload/files/2025/06/1e05cc09-7913-45e7-8ec6-e48df3d7fee5.pdf',
  },
  hk: { label: '한경비즈니스(2017)', url: 'https://magazine.hankyung.com/business/article/201706275495b' },
  ship5000: { label: '5,000척 인도 기사(2025)', url: 'https://v.daum.net/v/20251119180234670' },
  zdnet: { label: '지디넷코리아(2026)', url: 'https://zdnet.co.kr/view/?no=20260615184712' },
  hist50: {
    label: '현대중공업그룹 50년사 2권',
    url: 'https://www.hd.com/common/kr/docs/%ED%98%84%EB%8C%80%EC%A4%91%EA%B3%B5%EC%97%85%EA%B7%B8%EB%A3%B9_50%EB%85%84%EC%82%AC_2%EA%B6%8C(%EC%84%B1%EC%9E%A5%EC%8A%A4%ED%86%A0%EB%A6%AC).pdf',
  },
  st: { label: 'Ship Technology(2015)', url: 'https://ship-technology.com/?p=9042' },
  mt2023: { label: '머니투데이(2023)', url: 'https://www.mt.co.kr/industry/2023/03/26/2023032415411788853' },
  tdock: { label: '뉴스토마토(2009)', url: 'https://newstomato.com/ReadNews.aspx?no=37180' },
  tandem: { label: '시사경제(2008)', url: 'https://www.sateconomy.co.kr/news/view/179588427792459' },
} satisfies Record<string, Source>;

export const STATIONS: Station[] = [
  {
    id: 'gate',
    name: '정문·역사관',
    processes: [],
    summary:
      '1972년 3월, 울산 미포만 백사장에서 조선소 기공식이 열렸습니다. 조선소를 짓는 동시에 첫 배를 지었고, 1974년 6월 조선소 준공과 함께 1·2호선 명명식을 했습니다. 이 월드는 그때부터 이어진 배 짓는 과정을 장소별로 따라갑니다. 역사관의 미포만 모형은 백사장에서 지금의 조선소로 바뀌는 모습을 보여 주는 개념도이고, 실제 배치와는 다릅니다.',
    facts: [
      { text: '1972년 3월 23일, 미포만 백사장에서 울산조선소 기공식', source: S.hk },
      { text: '1974년 첫 인도선은 초대형 유조선(VLCC) 애틀랜틱 배런호', source: S.ship5000 },
      { text: '1983년 연간 건조량 222만 6천 톤으로 세계 1위', source: S.history },
      { text: '2025년 11월, 그룹 누적 선박 인도 5,000척', source: S.ship5000 },
    ],
    at: [-640, 0, -55],
    // 열린 면(도로 쪽) 앞에서 모형과 연혁 벽을 함께 본다. 전시관이 설명 패널 왼쪽에 들어오게 look 을 옮김
    cam: [-648, 26, -2],
    look: [-628, 3, -57],
  },
  {
    id: 'design',
    name: '설계동',
    processes: ['수주·설계'],
    summary:
      '배는 도면에서 먼저 태어납니다. 선주의 요구에 맞춰 크기와 선형을 정하는 기본설계, 부재 하나하나를 정하는 상세설계, 공장에서 바로 쓸 수 있게 블록 단위로 나누는 생산설계로 이어집니다. 설계동 앞 수조에서는 배 전체를 긴 보로 보는 종강도 계산을 체험합니다. 파도의 마루가 배 가운데 오면 배가 위로 휘고(호깅) 갑판이 늘어나며, 골이 오면 아래로 휘고(새깅) 갑판이 눌립니다. 화물을 어떻게 싣느냐에 따라서도 달라집니다.',
    facts: [
      {
        text: '건조 선종: 컨테이너선, LNG선, LPG선, 유조선, 벌크선, 자동차운반선, FSRU, 드릴십 등',
        source: S.business,
      },
    ],
    at: [-640, 0, 60],
    // 도로 건너편에서 수조(z 약 33)와 배 옆면을 본다. 설명 패널 왼쪽에 들어오게 look 을 -x(화면 오른쪽)로
    cam: [-660, 52, -48],
    look: [-652, 2, 30],
  },
  {
    id: 'cutting',
    quick: '강판을 설계 모양대로 잘라 부재를 만들고, 프레스로 눌러 곡면을 만듭니다.',
    name: '강재 가공공장',
    processes: ['1 가공'],
    summary:
      '강판에 부재 모양을 표시(마킹)하고 잘라 냅니다. 곡면이 필요한 부재는 열이나 압력으로 구부립니다. 이렇게 만든 부재가 다음 공장에서 블록이 됩니다.',
    facts: [{ text: '공식 건조 공정 12단계의 첫 단계가 가공', source: S.report33 }],
    flow: [{ dir: 'out', text: '잘라 낸 부재', to: 'assembly' }],
    // 북쪽 길(z = 170)의 남쪽. 길에서 남쪽으로 공장 안을 본다
    at: [-430, 0, 110],
    cam: [-468, 30, 168],
  },
  {
    id: 'assembly',
    quick: '잘라 낸 부재를 용접해 블록을 만들고(소·중·대조립), 배관을 미리 답니다(선행의장).',
    name: '조립공장',
    processes: ['2 소·중조립', '3 대조립', '4 선행의장'],
    summary:
      '잘라 낸 부재를 용접해 판넬과 작은 블록을 만들고(소·중조립), 이것을 모아 큰 블록으로 키웁니다(대조립). 배관이나 전선 받침 같은 의장품을 블록 단계에서 미리 달아 두면(선행의장) 좁은 선체 안에서 할 일이 줄어듭니다.',
    facts: [
      { text: '공식 공정 2~4단계: 소·중조립, 대조립, 선행의장', source: S.report33 },
      { text: '2026년 기사: 용접에 협동로봇, 운반에 자율이동로봇 투입', source: S.zdnet },
    ],
    flow: [
      { dir: 'in', text: '잘라 낸 부재', to: 'cutting' },
      { dir: 'out', text: '조립한 블록(1차 선행탑재로)', to: 'pe' },
    ],
    // 북쪽 길의 북쪽(가공공장과 길을 사이에 두고 비껴 마주 봄)
    at: [-330, 0, 232],
    cam: [-344, 48, 148],
    look: [-344, 0, 232],
  },
  {
    id: 'pe',
    quick: '블록 여러 개를 땅 위에서 미리 이어 붙여, 도크에 올릴 큰 블록으로 만듭니다(선행탑재).',
    name: '선행탑재장(PE장)',
    processes: ['5 블록 1차 선행탑재', '7 블록 2차 선행탑재'],
    summary:
      '도크에 올리기 전에 블록 여러 개를 땅 위에서 미리 합쳐 더 큰 블록으로 만듭니다. 도크에서 하는 일을 줄여 도크를 더 빨리 비우기 위해서입니다. 공식 공정에서는 1차 선행탑재 뒤에 도장을 하고, 2차 선행탑재를 한 번 더 합니다.',
    facts: [{ text: '공식 공정 5단계 1차 선행탑재 → 6단계 도장 → 7단계 2차 선행탑재', source: S.report33 }],
    flow: [
      { dir: 'in', text: '조립한 블록', to: 'assembly' },
      { dir: 'out', text: '1차로 합친 블록(도장하러)', to: 'paint' },
      { dir: 'in', text: '도장을 마친 블록(2차 선행탑재)', to: 'paint' },
      { dir: 'out', text: '2차로 합친 큰 블록(탑재하러)', to: 'dock' },
    ],
    at: [-250, 0, -55],
    cam: [-242, 88, 28],
    look: [-240, 2, -55],
  },
  {
    id: 'paint',
    quick: '블록을 칠합니다. 바닷물에 잠길 바깥은 빨간 방오 도료입니다. 칠한 뒤 다시 PE장에서 이어 붙입니다.',
    name: '도장공장',
    processes: ['6 도장작업'],
    summary:
      '녹을 벗기고 표면을 다듬은 뒤 블록에 도료를 칠합니다. 바닷물에 잠기는 선체 바닥과 화물창, 갑판은 서로 다른 도료를 씁니다. 실내 부스에서 칠하면 날씨와 먼지의 영향을 덜 받습니다.',
    facts: [
      {
        text: '2025년, 3대 선급(LR·ABS·DNV)과 AI 활용 도장 품질관리 시스템 개발 협약',
        source: S.report100,
      },
    ],
    flow: [
      { dir: 'in', text: '1차로 합친 블록', to: 'pe' },
      { dir: 'out', text: '도장을 마친 블록', to: 'pe' },
    ],
    at: [-240, 0, 60],
    cam: [-250, 40, -8],
    look: [-250, 2, 60],
  },
  {
    id: 'dock',
    quick: '골리앗 크레인이 블록을 하나씩 들어 도크에 올려 배를 쌓아 갑니다(탑재).',
    name: '도크',
    processes: ['8 블록 탑재'],
    summary:
      '골리앗 크레인이 블록을 하나씩 들어 도크 바닥의 반목 위에 내려놓고, 블록끼리 용접해 선체를 완성합니다. 이 장면에서는 벌크선 한 척을 블록 26개로 나누어 탑재 순서대로 올립니다. 아래 막대로 건조 시점을 옮겨 볼 수 있습니다.',
    facts: [
      { text: '대형 건조 도크 10개, 골리앗 크레인 9개(공식 사이트 기준)', source: S.business },
      { text: '1974년 6월 1·2도크 준공, 1도크에서 첫 VLCC 건조', source: S.hist50 },
      { text: '가장 큰 3도크는 100만 톤급, 길이 672m', source: S.st },
      { text: '같은 3도크를 640×92m로 적은 자료도 있음', source: S.hist50 },
      { text: '2009년 1도크를 넓혀 세계 최초 T자형 도크로', source: S.tdock },
      { text: '2009년 FPSO 전용 H도크 완공, 1,600톤 골리앗 2기', source: S.hist50 },
    ],
    flow: [{ dir: 'in', text: '2차로 합친 큰 블록', to: 'pe' }],
    at: [0, -6, 0],
    cam: [-190, 95, 170],
  },
  {
    id: 'launch',
    quick: '다 쌓으면 도크에 물을 채워 배를 띄우고, 게이트를 열어 예인선이 끌어냅니다(진수).',
    name: '진수',
    processes: ['10 진수'],
    summary:
      '선체가 완성되면 도크에 바닷물을 채워 배를 띄우고, 바다 쪽 게이트를 열어 예인선이 배를 끌어냅니다. 공식 공정 순서에서는 후행의장(9단계)이 진수(10단계)보다 앞에 있고, 이 월드에서는 의장 안벽에서 후행의장을 보여 줍니다.',
    facts: [
      { text: '2007년 3도크에 텐덤침수공법 적용, 도크 작업일 약 13일 단축', source: S.tandem },
      { text: '2004년 도크 밖 육상에서 지은 상선을 세계 처음 진수(육상건조)', source: S.hist50 },
    ],
    at: [112, -6, 0],
    cam: [215, 28, 85],
  },
  {
    id: 'quay',
    quick: '안벽에 배를 붙여 갑판 크레인·구명정 같은 장비를 마저 답니다(후행의장).',
    name: '의장 안벽',
    processes: ['9 후행의장'],
    summary:
      '진수한 배를 안벽에 묶어 두고 남은 의장 작업을 마무리합니다. 안벽 크레인이 갑판 크레인, 구명정 같은 큰 장비를 배에 올리고, 배 안에서는 엔진, 발전기, 배관, 전기, 거주구 내부를 끝냅니다. 블록 단계에서 다 하지 못한 의장 작업이 여기서 끝나고, 배를 묶어 둔 채 엔진을 돌려 본 뒤 시운전 해역으로 나갑니다.',
    facts: [{ text: '1979년 국산 선박용 엔진 1호기를 벌크선 해정호에 탑재', source: S.history }],
    at: [280, 0, 152],
    // 바다 쪽 비스듬히 선수 앞에서 본다(부두 너머에서 보면 배가 부두에 가림). 배 전체와 거주구가 설명 패널 왼쪽에 들어옴
    cam: [410, 70, -40],
    look: [250, 0, 125],
  },
  {
    id: 'trial',
    quick: '바다에 나가 속력, 선회, 지그재그, 긴급 정지를 시험합니다(시운전).',
    name: '시운전 해역',
    processes: ['11 시운전'],
    summary:
      '배를 바다로 몰고 나가 속도, 선회, 지그재그 조종, 긴급 정지와 엔진, 각종 장비가 계약대로 움직이는지 시험합니다. 시험을 통과해야 선주에게 넘길 수 있습니다. 이 장면의 속도와 선회 반경은 보기 좋게 줄인 값입니다.',
    facts: [{ text: '공식 공정 11단계가 시운전', source: S.report33 }],
    at: [700, -3, 0],
    // 항적 전체(x 약 500~910, z 약 -155~0, trial.ts)가 설명 패널 왼쪽에 들어오게 높이서 본다
    cam: [680, 280, 360],
    look: [760, 0, -80],
  },
  {
    id: 'delivery',
    quick: '명명식에서 이름을 붙이고 선주에게 넘기면, 첫 항해를 떠납니다(인도).',
    name: '명명식·인도',
    processes: ['12 인도'],
    summary:
      '배에 이름을 붙이는 명명식을 합니다. 대모(스폰서)가 줄을 끊으면 매달린 병이 뱃머리에 부딪혀 깨지고, 만선기를 단 배가 축하를 받습니다. 이어서 선주에게 배를 넘기는 인도 서명을 하고, 배는 선주의 첫 항해를 떠납니다. 한 척의 긴 여정이 여기서 끝납니다.',
    facts: [
      { text: '연간 50여 척 건조', source: S.business },
      { text: '2025년까지 51개국 344개 선주사에 2,300여 척 인도', source: S.business },
    ],
    at: [280, 0, -152],
    // 뱃머리 앞 바다 쪽에서 단상을 본다. 배는 뱃머리를 -x 로 대서 단상과 뱃머리가 화면 왼쪽, 선체는 오른쪽으로 뻗는다(delivery.ts)
    cam: [140, 45, -75],
    look: [225, 4, -140],
  },
];
