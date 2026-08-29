import * as THREE from 'three';
import {
  MoveFlag,
  otherColor,
  squareOf,
  fileOf,
  rankOf,
  type Color,
  type GameResult,
  type Move,
  type PieceType,
  type Position,
  type Square,
} from '@battle-chess/chess-core';
import type { GameEndPayload } from '@battle-chess/protocol';
import { GameRenderer } from './engine/Renderer';
import { buildScene, loadPhoto360Skybox } from './engine/Scene';
import { OrbitCameraRig } from './engine/Camera';
import { RenderScheduler } from './engine/RenderScheduler';
import { autoDetectQualityTier, isMobileDevice } from './engine/DeviceDetect';
import { getQualitySettings, resolvePixelRatioCap, type QualityTier } from './engine/QualityTier';
import { ProceduralUnitFactory } from './units/ProceduralUnitFactory';
import { GLTFUnitProvider } from './units/GLTFUnitProvider';
import { HybridUnitProvider } from './units/HybridUnitProvider';
import { UnitBoard } from './units/UnitBoard';
import { AnimationRegistry } from './anim/AnimationRegistry';
import { ALL_IDLE_CLIPS } from './anim/data/movementClips/idle';
import { ALL_COMBAT_SCENES } from './anim/data/combatScenes/index';
import { CombatDirector, type CinematicPacing } from './anim/CombatDirector';
import { AudioGraph } from './audio/AudioGraph';
import { SoundRegistry } from './audio/SoundRegistry';
import { GameSession } from './game/GameSession';
import { HotSeatController } from './game/HotSeatController';
import { MatchController } from './game/MatchController';
import type { MatchConfig, MatchOutcome } from './game/MatchState';
import { AiWorkerHandle, type Difficulty } from './ai/AiWorkerHandle';
import { NetClient } from './net/NetClient';
import { ReconnectController } from './net/ReconnectController';
import { PointerController } from './input/PointerController';
import { TouchGhost } from './input/TouchGhost';
import { HUD } from './ui/HUD';
import { MainMenu } from './ui/MainMenu';
import { SettingsScreen } from './ui/SettingsScreen';
import { IntermissionScreen } from './ui/IntermissionScreen';
import { ResultModal } from './ui/ResultModal';
import { MatchmakingScreen } from './ui/MatchmakingScreen';
import { NicknameModal } from './ui/NicknameModal';
import { HistoryScreen } from './ui/HistoryScreen';
import { LeaderboardScreen } from './ui/LeaderboardScreen';
import { GuestbookScreen } from './ui/GuestbookScreen';
import { SavedGamesScreen } from './ui/SavedGamesScreen';
import { PerfOverlay } from './ui/PerfOverlay';
import { YoutubeBgmPlayer } from './audio/YoutubeBgmPlayer';
import { publicAssetUrl } from './assets/publicAssetUrl';
import { IndexedDbStore } from './persistence/IndexedDbStore';
import type { SavedGameRecord } from './persistence/schema';
import { MatchRecorder } from './persistence/MatchRecorder';
import { HistoryClient } from './persistence/HistoryClient';
import { SyncEngine } from './persistence/SyncEngine';
import { backupCode, clearIdentity, createIdentity, loadIdentity, markServerRegistered, restoreFromBackupCode, updateNickname, type PlayerIdentity } from './persistence/identity';

const appQuery = document.querySelector<HTMLDivElement>('#app');
if (appQuery === null) throw new Error('#app root element missing');
const app: HTMLDivElement = appQuery;
app.textContent = '';
app.style.position = 'relative';

const canvas = document.createElement('canvas');
canvas.style.display = 'block';
canvas.style.width = '100%';
canvas.style.height = '100%';
app.appendChild(canvas);

// 1) 임시 Medium 가정으로 부팅 — 실측 완료 후 최종 티어로 재조정된다(D9 5단계).
let tier: QualityTier = 'medium';
const renderer = new GameRenderer(canvas, resolvePixelRatioCap(tier, isMobileDevice()));
const scene = buildScene();
const BACKGROUND_URLS = [
  publicAssetUrl('/env/hdrmaps-049.jpg'),
  publicAssetUrl('/env/music-hall-01.jpg'),
  publicAssetUrl('/env/ballroom.jpg'),
  publicAssetUrl('/env/hdrmaps-160.jpg'),
] as const;
let currentBackgroundIndex = -1;
let backgroundLoadQueue: Promise<void> = Promise.resolve();

/** 현재 이미지와 다른 360도 배경을 무작위로 골라 순차 로드한다. */
function changeBackground(): Promise<void> {
  let nextIndex = Math.floor(Math.random() * BACKGROUND_URLS.length);
  if (nextIndex === currentBackgroundIndex) nextIndex = (nextIndex + 1) % BACKGROUND_URLS.length;
  currentBackgroundIndex = nextIndex;
  const url = BACKGROUND_URLS[nextIndex] ?? BACKGROUND_URLS[0];
  backgroundLoadQueue = backgroundLoadQueue
    .catch(() => undefined)
    .then(() => loadPhoto360Skybox(scene, url))
    .then(() => scheduler.markDirty())
    .catch((err: unknown) => console.warn('[Scene] 360도 배경 로드 실패:', err));
  return backgroundLoadQueue;
}
const cameraRig = new OrbitCameraRig(canvas);

// 2) 애니메이션 레지스트리 — Idle 클립 6종 + 전투 연출 36종+폴백 등록(D5-1/D5-3).
const animationRegistry = new AnimationRegistry();
const IDLE_CLIP_PIECE_TYPE: Record<string, PieceType> = {
  'pawn.idle': 'p',
  'bishop.idle': 'b',
  'knight.idle': 'n',
  'rook.idle': 'r',
  'queen.idle': 'q',
  'king.idle': 'k',
};
for (const idleClip of ALL_IDLE_CLIPS) {
  animationRegistry.registerClip(idleClip);
  const type = IDLE_CLIP_PIECE_TYPE[idleClip.id];
  if (type === undefined) throw new Error(`no PieceType mapping for idle clip id: ${idleClip.id}`);
  animationRegistry.bindIdleClip(type, idleClip.id);
}
for (const combatScene of ALL_COMBAT_SCENES) animationRegistry.registerCombatScene(combatScene);

// 3) 엔진 싱글턴(매치 재시작에도 재사용) — 유닛 팩토리/보드/오디오/전투 연출/AI Worker.
// 사용자 요청 §비숍 스컬프트 애셋 — 조각된 고품질 glTF가 프리로드된 타입은 그쪽을, 나머지는 기존
// 절차적 생성기를 쓴다(다른 기물도 같은 방식으로 순차 전환 예정).
const gltfUnitProvider = new GLTFUnitProvider();
const proceduralUnitFactory = new ProceduralUnitFactory();
const unitFactory = new HybridUnitProvider(gltfUnitProvider, proceduralUnitFactory);
const unitBoard = new UnitBoard(scene, unitFactory, animationRegistry, tier);

// 조각 애셋은 무채색 중립 메시 1개라 진영별 preload가 같은 url을 가리켜도 실제 로드는 1회뿐이다.
// 실패해도 HybridUnitProvider가 절차적 생성으로 자동 폴백하므로 흐름을 막지 않는다.
// 새 조각 기물이 추가될 때마다 이 목록에 한 줄만 추가하면 된다.
const SCULPTED_UNIT_ASSETS: readonly { type: PieceType; url: string }[] = [
  { type: 'b', url: publicAssetUrl('/models/bishop.glb') },
  { type: 'n', url: publicAssetUrl('/models/knight.glb') },
  { type: 'p', url: publicAssetUrl('/models/pawn.glb') },
  { type: 'r', url: publicAssetUrl('/models/rook.glb') },
  { type: 'q', url: publicAssetUrl('/models/queen.glb') },
  { type: 'k', url: publicAssetUrl('/models/king.glb') },
];
const sculptedUnitsReady: Promise<void> = Promise.all(
  SCULPTED_UNIT_ASSETS.flatMap(({ type, url }) => [gltfUnitProvider.preload(type, 'w', url), gltfUnitProvider.preload(type, 'b', url)])
)
  .then(() => undefined)
  .catch((err: unknown) => {
    console.warn('[GLTFUnitProvider] 조각 애셋 프리로드 실패 — 절차적 생성으로 폴백:', err);
  });

const audioGraph = new AudioGraph();
// 사용자 요청 §게임 내 사운드 — 메인 메뉴 버튼(캔버스 밖 DOM 오버레이) 클릭도 첫 제스처로 인정되도록
// canvas 대신 앱 컨테이너 전체에 바인딩한다.
audioGraph.bindResumeOnGesture(app);
audioGraph.bindVisibilityPause();
const soundRegistry = new SoundRegistry(audioGraph);
const combatDirector = new CombatDirector(scene, unitBoard, cameraRig, animationRegistry, soundRegistry);

// 사용자 요청 §게임 내 사운드 — 버튼 클릭 효과음. 개별 화면마다 배선하는 대신 앱 전체에 위임(delegate)
// 리스너 하나로 처리한다: 모든 UI 버튼이 실제 `<button>` 엘리먼트라 이 한 곳에서 전부 커버된다.
app.addEventListener('click', (ev) => {
  if ((ev.target as HTMLElement | null)?.closest('button') !== null) soundRegistry.play('sfx.ui.button');
});

const bgmPlayer = new YoutubeBgmPlayer(app);
const hud = new HUD(
  app,
  bgmPlayer,
  () => exitToMenu(),
  () => void saveCurrentGame(),
  () => cameraRig.resetView(),
  () => void changeBackground()
);
const intermissionScreen = new IntermissionScreen(app);
const resultModal = new ResultModal(app);
const matchmakingScreen = new MatchmakingScreen(app);
const perfOverlay = new PerfOverlay(app, renderer.webgl);

// D10 §영속화 — 오프라인 우선 IndexedDB 기록 + 서버 히스토리 REST 동기화.
// 배포 환경(Render 등)에서는 서버가 클라이언트 정적 빌드를 같은 오리진에서 서빙하므로 포트 없이
// `location.origin` 그대로 쓴다. 로컬 dev는 vite(5173대)와 서버(8787)가 분리돼 있어 기존처럼 고정 포트.
const DEV_SERVER_PORT = import.meta.env['VITE_SERVER_PORT'] ?? '8787';
const HISTORY_API_BASE_URL = import.meta.env.DEV ? `http://${window.location.hostname}:${DEV_SERVER_PORT}` : window.location.origin;
const DIFFICULTY_LABEL_KO: Record<Difficulty, string> = { beginner: '초급', intermediate: '중급', advanced: '고급', master: '마스터' };
const historyStore = new IndexedDbStore();
const historyClient = new HistoryClient(HISTORY_API_BASE_URL);
const syncEngine = new SyncEngine(historyStore, historyClient);
const matchRecorder = new MatchRecorder(historyStore);
let currentIdentity: PlayerIdentity | null = null;
let activeSaveId: string | null = null;
let currentMatchStartedAt = Date.now();

function refreshElapsedTime(): void {
  const startedAt = currentConfig?.source === 'online' ? onlineMatchStartedAt : matchController === null ? null : currentMatchStartedAt;
  hud.setElapsedSeconds(startedAt === null ? 0 : (Date.now() - startedAt) / 1000);
}

setInterval(refreshElapsedTime, 1000);

let aiHandle: AiWorkerHandle | null = null;
function getAiHandle(): AiWorkerHandle {
  aiHandle ??= new AiWorkerHandle();
  return aiHandle;
}

// D3 §사고 중 연출 시간(min/max) + §난이도 4단계 movetime.
const MOVETIME_MS: Record<Difficulty, number> = { beginner: 300, intermediate: 800, advanced: 2000, master: 4000 };
const MIN_THINK_DELAY_MS: Record<Difficulty, number> = { beginner: 400, intermediate: 500, advanced: 600, master: 800 };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let inputLocked = false;
let matchController: MatchController | null = null;
let hotSeat: HotSeatController | null = null;
let currentConfig: MatchConfig | null = null;
let localMatchGeneration = 0;
const cpuMoveRequests = new Set<GameSession>();

/** 로컬/CPU/온라인 공통 — 클릭한 칸을 선택 or 이동 시도로 해석한다. */
function handleBoardClick(session: GameSession, square: Square | null, beforeAttempt?: () => void): void {
  if (square === null) {
    session.select(null);
    return;
  }
  const selected = session.getSelected();
  const position = session.getPosition();
  const piece = position.board[square];

  if (selected === null) {
    if (piece !== null && piece !== undefined && piece.color === position.turn) session.select(square);
    return;
  }
  if (selected === square) {
    session.select(null);
    return;
  }
  const legal = session.legalMovesFrom(selected);
  const isLegalTarget = legal.some((m) => m.to === square);
  if (isLegalTarget) {
    beforeAttempt?.();
    session.attemptMove({ from: selected, to: square });
  } else {
    // 캐슬링 UX: 표준 방식(왕을 c/g 파일로 두 칸 이동)뿐 아니라
    // 왕을 선택한 뒤 해당 룩을 누르는 직관적인 입력도 허용한다.
    const castleViaRook = legal.find((move) => {
      if ((move.flags & (MoveFlag.CASTLE_K | MoveFlag.CASTLE_Q)) === 0) return false;
      const rookSquare = squareOf((move.flags & MoveFlag.CASTLE_K) !== 0 ? 7 : 0, rankOf(move.from));
      return square === rookSquare;
    });
    if (castleViaRook !== undefined) {
      beforeAttempt?.();
      session.attemptMove({ from: castleViaRook.from, to: castleViaRook.to });
      return;
    }
    if (piece !== null && piece !== undefined && piece.color === position.turn) {
      session.select(square);
    } else {
      session.select(null);
    }
  }
}

/** 사용자 요청 §게임 내 사운드 — 매치 최종 결과(승/패)에 맞는 효과음을 재생한다. */
function playOutcomeSound(outcome: MatchOutcome): void {
  if (outcome === 'win') soundRegistry.play('sfx.result.win');
  else if (outcome === 'loss') soundRegistry.play('sfx.result.lose');
}

/** 사용자 요청 §처치 기록 패널 — 캡처 이동이면 잡힌 기물을 반환한다(앙파상은 대각선 뒤 칸 기준). */
function capturedPieceOf(move: Move, prevPosition: Position): { color: Color; type: PieceType } | null {
  if ((move.flags & MoveFlag.CAPTURE) === 0) return null;
  const isEnPassant = (move.flags & MoveFlag.EN_PASSANT) !== 0;
  const square = isEnPassant ? squareOf(fileOf(move.to), rankOf(move.from)) : move.to;
  return prevPosition.board[square] ?? null;
}

function refreshTurnStatusText(): void {
  if (currentConfig?.source === 'online') {
    if (onlineSession === null) return;
    hud.setTurnText(onlineSession.getPosition().turn === onlineMyColor ? '내 차례' : '상대 차례');
    return;
  }
  if (hotSeat !== null) {
    hud.setTurnText(hotSeat.getStatusText());
    const position = matchController?.getSession().getPosition();
  }
}

function bindSessionEvents(session: GameSession, config: MatchConfig, generation = localMatchGeneration): void {
  hotSeat = new HotSeatController(session);
  unitBoard.initFromPosition(session.getPosition());
  hud.resetMoveList();
  hud.resetCaptured();
  refreshTurnStatusText();
  scheduler.markDirty();

  session.bus.on('game:selectionChanged', ({ square, legalTargets }) => {
    unitBoard.showHighlights(square, legalTargets);
  });

  session.bus.on('game:moveApplied', ({ move, san, prevPosition }) => {
    unitBoard.clearHighlights();
    hud.pushMove(san, prevPosition.turn);
    const captured = capturedPieceOf(move, prevPosition);
    if (captured !== null) hud.recordCapture(prevPosition.turn, captured.type);
    inputLocked = true;

    const isCapture = (move.flags & MoveFlag.CAPTURE) !== 0;
    if (isCapture) {
      void combatDirector.playCapture(move, prevPosition).then(() => {
        if (generation !== localMatchGeneration) return;
        inputLocked = false;
        refreshTurnStatusText();
        scheduler.markDirty();
        void maybeTriggerCpuMove(session, config);
      });
    } else {
      soundRegistry.playWalk();
      unitBoard.applyMove(move, prevPosition);
    }
    scheduler.markDirty();
  });

  session.bus.on('game:promotionNeeded', ({ color, resolve }) => {
    void hud.askPromotion(color).then(resolve);
  });

  session.bus.on('game:gameEnded', () => {
    refreshTurnStatusText();
  });

  void maybeTriggerCpuMove(session, config);
}

async function maybeTriggerCpuMove(session: GameSession, config: MatchConfig): Promise<void> {
  if (config.source !== 'cpu' || matchController === null) return;
  if (cpuMoveRequests.has(session)) return;
  const humanColor = matchController.getMyColorForCurrentGame();
  const cpuColor = otherColor(humanColor);
  if (session.getPosition().turn !== cpuColor) return;

  cpuMoveRequests.add(session);
  const difficulty = config.cpuDifficulty ?? 'intermediate';
  const start = performance.now();
  const { move } = await getAiHandle().requestMove(session.getPosition(), difficulty, MOVETIME_MS[difficulty]);
  const elapsed = performance.now() - start;
  const remaining = MIN_THINK_DELAY_MS[difficulty] - elapsed;
  if (remaining > 0) await sleep(remaining);

  if (matchController === null || matchController.getSession() !== session) {
    cpuMoveRequests.delete(session);
    return;
  }
  session.attemptMove(move.promo === undefined ? { from: move.from, to: move.to } : { from: move.from, to: move.to, promo: move.promo });
  cpuMoveRequests.delete(session);
}

function startMatch(config: MatchConfig, savedGame?: SavedGameRecord): void {
  void changeBackground();
  // A rematch may start before the previous checkmate capture/AI task settles.
  localMatchGeneration += 1;
  if (combatDirector.isPlaying()) combatDirector.requestSkip();
  inputLocked = false;
  aiHandle?.dispose();
  aiHandle = null;
  cpuMoveRequests.clear();
  currentConfig = config;
  activeSaveId = savedGame?.saveId ?? null;
  currentMatchStartedAt = savedGame?.matchStartedAt ?? Date.now();
  mainMenu.hide();
  matchController = new MatchController(config, savedGame === undefined ? undefined : {
    localMatchId: savedGame.localMatchId,
    gameIndex: savedGame.gameIndex,
    scoreMine: savedGame.scoreMine,
    scoreOpponent: savedGame.scoreOpponent,
    completedGames: savedGame.completedGames,
    currentFen: savedGame.currentFen,
    currentMovesSan: savedGame.currentMovesSan,
    gameStartedAt: savedGame.gameStartedAt,
  });

  const generation = localMatchGeneration;
  matchController.bus.on('match:gameStarted', ({ session }) => {
    bgmPlayer.shufflePlaylistForNewGame();
    bindSessionEvents(session, config, generation);
  });
  matchController.bus.on('match:gameEnded', ({ gameIndex, result, scoreMine, scoreOpponent }) => {
    const controller = matchController;
    if (controller === null) return;
    if (controller.isMatchComplete()) return; // game:matchEnded가 최종 화면을 담당
    intermissionScreen.show(gameIndex, result, scoreMine, scoreOpponent, '다음 판 시작', () => controller.startNextGame());
  });
  matchController.bus.on('game:matchEnded', ({ localMatchId, source, format, outcome, scoreMine, scoreOpponent, games }) => {
    void deleteActiveSavedGame();
    if (currentIdentity !== null) {
      const firstGame = games[0];
      const lastGame = games[games.length - 1];
      void matchRecorder
        .record({
          localMatchId,
          source,
          format,
          myPlayerId: currentIdentity.playerId,
          myColorGame1: config.myColorGame1,
          opponentKind: source === 'cpu' ? 'cpu' : 'human-local',
          opponentLabel: source === 'cpu' ? `CPU (${DIFFICULTY_LABEL_KO[config.cpuDifficulty ?? 'intermediate']})` : '상대 플레이어',
          ...(source === 'cpu' ? { cpuDifficulty: config.cpuDifficulty ?? 'intermediate' } : {}),
          timeControl: 'unlimited',
          scoreMine,
          scoreOpponent,
          outcome,
          startedAt: firstGame?.startedAt ?? Date.now(),
          endedAt: lastGame?.endedAt ?? Date.now(),
          games,
        })
        .then(() => {
          void syncEngine.syncNow();
        });
    }

    playOutcomeSound(outcome);
    resultModal.show(
      outcome,
      scoreMine,
      scoreOpponent,
      () => void handleStartFromMenu(config),
      () => {
        matchController = null;
        mainMenu.show();
      }
    );
  });

  bindSessionEvents(matchController.getSession(), config, generation);
  if (savedGame !== undefined) {
    savedGame.currentMovesSan.forEach((san, index) => hud.pushMove(san, index % 2 === 0 ? 'w' : 'b'));
  }
}

async function deleteActiveSavedGame(): Promise<void> {
  const saveId = activeSaveId;
  activeSaveId = null;
  if (saveId !== null) await historyStore.deleteSavedGame(saveId);
  await refreshContinueAvailability();
}

async function saveCurrentGame(): Promise<void> {
  if (currentIdentity === null || currentConfig === null || matchController === null || currentConfig.source === 'online') return;
  const state = matchController.getResumeState();
  const saveId = activeSaveId ?? crypto.randomUUID();
  activeSaveId = saveId;
  await historyStore.putSavedGame({
    saveId,
    playerId: currentIdentity.playerId,
    config: currentConfig,
    ...state,
    matchStartedAt: currentMatchStartedAt,
    savedAt: Date.now(),
  });
  await refreshContinueAvailability();
  hud.setTurnText('게임을 저장했습니다');
  setTimeout(() => refreshTurnStatusText(), 1400);
}

// ── 온라인 대전(Sprint 9a/9c) ────────────────────────────────────────────────
// 배포 환경은 https로 서빙되므로 mixed-content 차단을 피하려면 반드시 wss://(같은 오리진)를 써야 한다.
const ONLINE_SERVER_URL = import.meta.env.DEV
  ? `ws://${window.location.hostname}:${DEV_SERVER_PORT}`
  : `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}`;
const MATCHMAKING_TIMEOUT_MS = 20_000;

let netClient: NetClient | null = null;
let reconnectController: ReconnectController | null = null;
let onlineSession: GameSession | null = null;
let onlineMatchId: string | null = null;
let onlineGameIndex = 0;
let onlineMyColor: 'w' | 'b' = 'w';
let onlineMyColorGame1: Color = 'w';
let onlineMatchStartedAt: number | null = null;
let onlineOpponentName: string | null = null;
let lastMoveWasLocalInput = false;
const ownPendingMoveIds = new Set<string>();
let queueTimeoutHandle: ReturnType<typeof setTimeout> | null = null;

function clearQueueTimeout(): void {
  if (queueTimeoutHandle !== null) {
    clearTimeout(queueTimeoutHandle);
    queueTimeoutHandle = null;
  }
}

/** 매칭 요청 후 일정 시간 내 상대를 못 찾으면 안내 후 메인 메뉴로 돌아갈 수 있게 한다. */
function startQueueTimeout(): void {
  clearQueueTimeout();
  queueTimeoutHandle = setTimeout(() => {
    queueTimeoutHandle = null;
    netClient?.disconnect();
    reconnectController?.clear();
    matchmakingScreen.showTimeout(() => {
      currentConfig = null;
      onlineMatchId = null;
      onlineSession = null;
      mainMenu.show();
    });
  }, MATCHMAKING_TIMEOUT_MS);
}

let rollbackFlashEl: HTMLDivElement | null = null;
let rollbackToastEl: HTMLDivElement | null = null;

/** D6-1 §롤백 UX — 스냅 직후 0.15s 빨간 테두리 플래시 + 2초 토스트. */
function showRollbackToast(message: string): void {
  if (rollbackFlashEl === null) {
    rollbackFlashEl = document.createElement('div');
    rollbackFlashEl.style.cssText = 'position:absolute;inset:0;pointer-events:none;border:6px solid #D4535A;opacity:0;transition:opacity 0.15s ease-out;z-index:40;';
    app.appendChild(rollbackFlashEl);
  }
  const flash = rollbackFlashEl;
  flash.style.opacity = '0.4';
  setTimeout(() => {
    flash.style.opacity = '0';
  }, 150);

  if (rollbackToastEl === null) {
    rollbackToastEl = document.createElement('div');
    rollbackToastEl.style.cssText =
      'position:absolute;bottom:24px;left:50%;transform:translateX(-50%);padding:10px 18px;background:rgba(26,20,13,0.9);color:#F2E8D5;border-radius:8px;font:13px system-ui,sans-serif;z-index:40;pointer-events:none;transition:opacity 0.3s;';
    app.appendChild(rollbackToastEl);
  }
  const toast = rollbackToastEl;
  toast.textContent = message;
  toast.style.opacity = '1';
  setTimeout(() => {
    toast.style.opacity = '0';
  }, 2000);
}

function serverGameEndToResult(payload: GameEndPayload): GameResult {
  if (payload.result === 'draw') {
    if (payload.reason === 'stalemate') return { kind: 'stalemate' };
    const reason = payload.reason === 'draw50' ? 'fifty_move' : payload.reason === 'repetition' ? 'threefold' : payload.reason === 'insufficientMaterial' ? 'insufficient_material' : 'agreement';
    return { kind: 'draw', reason };
  }
  const winner = payload.result === 'white' ? 'w' : 'b';
  if (payload.reason === 'resign' || payload.reason === 'abandon') return { kind: 'resignation', winner };
  if (payload.reason === 'timeout') return { kind: 'timeout', winner };
  return { kind: 'checkmate', winner };
}

function bindOnlineSessionEvents(session: GameSession): void {
  unitBoard.initFromPosition(session.getPosition());
  hud.resetMoveList();
  hud.resetCaptured();
  refreshTurnStatusText();
  scheduler.markDirty();

  session.bus.on('game:selectionChanged', ({ square, legalTargets }) => {
    unitBoard.showHighlights(square, legalTargets);
  });

  session.bus.on('game:moveApplied', ({ move, san, prevPosition }) => {
    unitBoard.clearHighlights();
    hud.pushMove(san, prevPosition.turn);
    const captured = capturedPieceOf(move, prevPosition);
    if (captured !== null) hud.recordCapture(prevPosition.turn, captured.type);
    inputLocked = true;

    if (lastMoveWasLocalInput && onlineMatchId !== null && netClient !== null) {
      lastMoveWasLocalInput = false;
      const clientMoveId = `m-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      ownPendingMoveIds.add(clientMoveId);
      netClient.sendMove(onlineMatchId, onlineGameIndex, move, clientMoveId);
    }

    const isCapture = (move.flags & MoveFlag.CAPTURE) !== 0;
    if (isCapture) {
      void combatDirector.playCapture(move, prevPosition).then(() => {
        inputLocked = false;
        refreshTurnStatusText();
        scheduler.markDirty();
      });
    } else {
      soundRegistry.playWalk();
      unitBoard.applyMove(move, prevPosition);
    }
    scheduler.markDirty();
  });

  session.bus.on('game:promotionNeeded', ({ color, resolve }) => {
    void hud.askPromotion(color).then(resolve);
  });

  session.bus.on('game:gameEnded', () => refreshTurnStatusText());

  session.bus.on('game:positionReset', ({ position }) => {
    unitBoard.initFromPosition(position);
    hud.resetMoveList();
    refreshTurnStatusText();
    scheduler.markDirty();
  });
}

function getOrCreateNetClient(): NetClient {
  if (netClient !== null) return netClient;
  const client = new NetClient();
  netClient = client;
  reconnectController = new ReconnectController(client, ONLINE_SERVER_URL);

  client.bus.on('net:connected', () => {
    if (currentIdentity === null) return;
    // D10-1 §서버 등록 흐름 — secret은 이 신원이 서버에 아직 등록되지 않았을 때만(최초 1회) 함께 보낸다.
    client.identify(currentIdentity.playerId, currentIdentity.nickname, currentIdentity.serverRegisteredAt === null ? currentIdentity.secret : undefined);
    void syncEngine.syncNow(); // D10-2 트리거 ③ net:connected
  });
  client.bus.on('net:playerIdentified', (payload) => {
    if (currentIdentity !== null && payload.secretAccepted && currentIdentity.serverRegisteredAt === null) {
      currentIdentity = markServerRegistered(currentIdentity);
    }
    if (currentConfig?.source !== 'online') return;
    matchmakingScreen.showSearching();
    client.queueJoin({ mode: 'quick', timeControl: { kind: 'unlimited' }, matchFormat: currentConfig.format });
    startQueueTimeout();
  });
  client.bus.on('net:matchFound', (payload) => {
    clearQueueTimeout();
    matchmakingScreen.hide();
    onlineMatchId = payload.matchId;
    onlineGameIndex = payload.gameIndex;
    onlineMyColor = payload.yourColor;
    if (payload.gameIndex === 0) {
      onlineMyColorGame1 = payload.yourColor;
      onlineMatchStartedAt = Date.now();
    }
    onlineOpponentName = payload.opponentName;
    inputLocked = false;
    const session = new GameSession();
    onlineSession = session;
    bindOnlineSessionEvents(session);
    hud.setTurnText(`온라인 대전 시작 — 상대: ${payload.opponentName}`);
  });
  client.bus.on('net:moveAccepted', (payload) => {
    if (onlineSession === null) return;
    if (ownPendingMoveIds.has(payload.clientMoveId)) {
      ownPendingMoveIds.delete(payload.clientMoveId);
      return;
    }
    lastMoveWasLocalInput = false;
    const move = payload.move;
    onlineSession.attemptMove(move.promo === undefined ? { from: move.from, to: move.to } : { from: move.from, to: move.to, promo: move.promo });
  });
  client.bus.on('net:moveRejected', (payload) => {
    ownPendingMoveIds.delete(payload.clientMoveId);
    if (onlineSession === null) return;
    onlineSession.loadPosition(payload.authoritativePosition);
    showRollbackToast(payload.reason === 'stale' ? '상대가 먼저 두었습니다' : '서버와 동기화되지 않았습니다 — 되돌립니다');
    scheduler.markDirty();
  });
  client.bus.on('net:stateSync', (payload) => {
    if (onlineSession === null) return;
    onlineGameIndex = payload.gameIndex;
    onlineSession.loadPosition(payload.fen);
    scheduler.markDirty();
  });
  client.bus.on('net:gameEnd', (payload) => {
    const result = serverGameEndToResult(payload);
    const scoreMine = onlineMyColor === 'w' ? payload.scoreWhite : payload.scoreBlack;
    const scoreOpponent = onlineMyColor === 'w' ? payload.scoreBlack : payload.scoreWhite;
    intermissionScreen.show(payload.gameIndex, result, scoreMine, scoreOpponent, '다음 판 준비', () => {
      if (onlineMatchId !== null) client.intermissionReady(onlineMatchId, payload.gameIndex + 1);
      hud.setTurnText('다음 판 대기 중...');
    });
  });
  client.bus.on('net:matchEnd', (payload) => {
    const outcome: MatchOutcome = payload.winnerColorForYou === 'you' ? 'win' : payload.winnerColorForYou === 'opponent' ? 'loss' : 'draw';

    // D10-5 §온라인 매치 — 서버가 이미 권위적으로 기록했으므로 클라는 로컬 열람용 요약만 즉시 synced로 남긴다.
    if (currentIdentity !== null && onlineMatchId !== null) {
      void matchRecorder.record({
        localMatchId: onlineMatchId,
        source: 'online',
        format: currentConfig?.format ?? 'bo1',
        myPlayerId: currentIdentity.playerId,
        myColorGame1: onlineMyColorGame1,
        opponentKind: 'human-online',
        opponentLabel: onlineOpponentName ?? '상대',
        timeControl: 'unlimited',
        scoreMine: payload.finalScoreYou,
        scoreOpponent: payload.finalScoreOpponent,
        outcome,
        startedAt: onlineMatchStartedAt ?? Date.now(),
        endedAt: Date.now(),
        games: [],
        ...(payload.serverMatchId !== null ? { serverMatchId: payload.serverMatchId } : {}),
      });
    }

    playOutcomeSound(outcome);
    resultModal.show(
      outcome,
      payload.finalScoreYou,
      payload.finalScoreOpponent,
      () => {
        if (currentConfig !== null) startOnlineMatch(currentConfig);
      },
      () => {
        disconnectOnline();
        mainMenu.show();
      }
    );
  });
  client.bus.on('net:opponentDisconnected', (payload) => {
    hud.setTurnText(`상대 연결 끊김 — ${payload.graceSeconds}초 내 재접속 대기 중`);
  });
  client.bus.on('net:disconnected', () => {
    if (currentConfig?.source === 'online' && onlineMatchId !== null) hud.setTurnText('연결 끊김 — 재접속 시도 중...');
  });

  return client;
}

function disconnectOnline(): void {
  clearQueueTimeout();
  netClient?.disconnect();
  reconnectController?.clear();
  onlineSession = null;
  onlineMatchId = null;
  currentConfig = null;
}

/** 사용자 요청 §인게임 메뉴 나가기 버튼 — 온라인은 연결을 끊어 상대측에 이탈로 처리되게 하고,
 * 로컬/CPU는 매치 컨트롤러를 폐기해 이후 CPU 수순 트리거(maybeTriggerCpuMove)가 무시되게 한다. */
function exitToMenu(): void {
  // 저장 후 메뉴로 이동하는 것은 이어서 하기의 정상 진입 경로이므로 슬롯을 유지한다.
  // 저장 슬롯은 해당 대국이 실제 결과로 종료될 때 game:matchEnded에서 삭제한다.
  activeSaveId = null;
  if (currentConfig?.source === 'online') {
    disconnectOnline();
  } else {
    matchController = null;
    currentConfig = null;
  }
  matchmakingScreen.hide();
  mainMenu.show();
  void refreshContinueAvailability();
}

function startOnlineMatch(config: MatchConfig): void {
  void changeBackground();
  currentConfig = config;
  mainMenu.hide();
  matchmakingScreen.showSearching('서버 연결 중...');
  const client = getOrCreateNetClient();
  client.connect(ONLINE_SERVER_URL);
}

async function handleStartFromMenu(config: MatchConfig): Promise<void> {
  soundRegistry.play('sfx.ui.game_start'); // 사용자 요청 §게임 시작 사운드
  bgmPlayer.shufflePlaylistForNewGame();
  void bgmPlayer.play(); // 게임 화면 진입 시 BGM 기본 자동재생(메인 메뉴에서는 재생하지 않음) — "시작" 클릭이 사용자 제스처 기준점.
  await sculptedUnitsReady; // 대개 메인 메뉴 도달 전에 이미 끝나 있어 즉시 반환된다.
  if (config.source === 'online') startOnlineMatch(config);
  else startMatch(config);
}

// 4) 메인 메뉴 + 설정 화면 + 닉네임/전적 화면.
const settingsScreen = new SettingsScreen(app, {
  onQualityChange: (newTier) => {
    tier = newTier;
    renderer.setPixelRatioCap(resolvePixelRatioCap(tier, isMobileDevice()));
    scheduler.markDirty();
  },
  onPacingChange: (pacing: CinematicPacing) => combatDirector.setPacing(pacing),
  onVolumeChange: (bus, value) => {
    audioGraph.getBus(bus).gain.value = value;
  },
  getNickname: () => currentIdentity?.nickname ?? '',
  onNicknameChange: (nickname) => {
    if (currentIdentity === null) return;
    currentIdentity = updateNickname(currentIdentity, nickname);
    void historyClient.identify(currentIdentity, false).catch(() => undefined);
  },
  getBackupCode: () => (currentIdentity !== null ? backupCode(currentIdentity) : ''),
  onRestoreFromCode: async (code) => {
    const restored = restoreFromBackupCode(code);
    if (restored === null) return false;
    try {
      const result = await historyClient.identify(restored, true);
      if (!result.secretAccepted) return false;
      currentIdentity = markServerRegistered({ ...restored, nickname: result.nickname });
      syncEngine.setIdentity(currentIdentity);
      void syncEngine.syncNow();
      return true;
    } catch {
      return false;
    }
  },
  onDeleteLocalHistory: async () => {
    await historyStore.clearAll();
  },
  onDeleteServerHistory: async () => {
    if (currentIdentity === null) return;
    try {
      await historyClient.deleteAccount(currentIdentity);
    } catch {
      // 서버가 오프라인이어도 로컬 삭제는 계속 진행한다.
    }
    await historyStore.clearAll();
    clearIdentity();
    currentIdentity = null;
    window.location.reload();
  },
});
const nicknameModal = new NicknameModal(app, historyClient);
const savedGamesScreen = new SavedGamesScreen(app, () => mainMenu.show());
const leaderboardScreen = new LeaderboardScreen(
  app,
  historyStore,
  historyClient,
  () => currentIdentity,
  () => syncEngine.syncNow(),
  () => mainMenu.show()
);
const guestbookScreen = new GuestbookScreen(app, historyClient, () => currentIdentity, () => mainMenu.show());
const mainMenu = new MainMenu(
  app,
  handleStartFromMenu,
  () => settingsScreen.show(),
  () => {
    mainMenu.hide();
    void leaderboardScreen.show('history');
  },
  () => {
    mainMenu.hide();
    void guestbookScreen.show();
  },
  bgmPlayer,
  () => {
    mainMenu.hide();
    nicknameModal.show((nickname) => {
      const identity = createIdentity(nickname);
      nicknameModal.hide();
      mainMenu.show();
      void onIdentityReady(identity);
    }, true, () => mainMenu.show(), currentIdentity?.nickname);
  },
  () => void openSavedGames()
);

async function refreshContinueAvailability(): Promise<void> {
  if (currentIdentity === null) {
    mainMenu.setContinueAvailable(false);
    return;
  }
  const games = await historyStore.listSavedGames(currentIdentity.playerId);
  mainMenu.setContinueAvailable(games.length > 0);
}

async function openSavedGames(): Promise<void> {
  if (currentIdentity === null) return;
  const games = await historyStore.listSavedGames(currentIdentity.playerId);
  if (games.length === 0) {
    mainMenu.setContinueAvailable(false);
    return;
  }
  mainMenu.hide();
  savedGamesScreen.show(games, (savedGame) => startMatch(savedGame.config, savedGame));
}

/** 지금 클릭/탭/드래그를 받아도 되는 세션을 반환한다(없으면 null) — 로컬/CPU/온라인 공통 게이팅. */
function getInteractableSession(): GameSession | null {
  if (settingsScreen.isVisible() || inputLocked || unitBoard.isAnimating()) return null;

  if (currentConfig?.source === 'online') {
    if (onlineSession === null) return null;
    if (onlineSession.getPosition().turn !== onlineMyColor) return null; // 상대 차례엔 입력 무시
    return onlineSession;
  }

  if (matchController === null) return null;
  const session = matchController.getSession();
  if (currentConfig?.source === 'cpu') {
    const humanColor = matchController.getMyColorForCurrentGame();
    if (session.getPosition().turn !== humanColor) return null; // CPU 차례엔 입력 무시
  }
  return session;
}

function trySquareClick(square: Square | null): void {
  if (combatDirector.isPlaying()) {
    combatDirector.requestSkip();
    return;
  }
  const session = getInteractableSession();
  if (session === null) return;
  if (currentConfig?.source === 'online') {
    handleBoardClick(session, square, () => {
      lastMoveWasLocalInput = true;
    });
  } else {
    handleBoardClick(session, square);
  }
}

// UX_UI_SPEC §4 §모바일 드래그 — pointerdown 칸의 소유권 판정 + 고스트 표시 + 카메라 궤도회전과의 충돌 방지.
const touchGhost = new TouchGhost(app);

function canStartDrag(square: Square): boolean {
  if (combatDirector.isPlaying()) return false;
  const session = getInteractableSession();
  if (session === null) return false;
  const piece = session.getPosition().board[square];
  return piece !== null && piece !== undefined && piece.color === session.getPosition().turn;
}

function onDragStart(square: Square): void {
  const session = getInteractableSession();
  if (session === null) return;
  cameraRig.controls.enabled = false;
  session.select(square);
  const piece = session.getPosition().board[square];
  if (piece !== null && piece !== undefined) touchGhost.show(piece.type, piece.color);
}

function onDragMove(clientX: number, clientY: number): void {
  touchGhost.moveTo(clientX, clientY);
}

function onDragEnd(square: Square | null): void {
  cameraRig.controls.enabled = true;
  touchGhost.hide();
  trySquareClick(square); // 이미 select()된 기물 기준 "두 번째 탭"과 동일하게 처리된다.
}

function onDragCancel(): void {
  cameraRig.controls.enabled = true;
  touchGhost.hide();
}

const pointerController = new PointerController(canvas, cameraRig.camera, {
  onTap: trySquareClick,
  canStartDrag,
  onDragStart,
  onDragMove,
  onDragEnd,
  onDragCancel,
});
void pointerController;

window.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && combatDirector.isPlaying()) combatDirector.requestSkip();
});

function resize(): void {
  renderer.resize();
  const { clientWidth, clientHeight } = canvas;
  cameraRig.setAspect(clientHeight === 0 ? 1 : clientWidth / clientHeight);
  scheduler.markDirty();
}

function renderFrame(dtSeconds: number): void {
  if (combatDirector.isPlaying()) {
    combatDirector.update(dtSeconds);
    scheduler.markDirty();
  } else {
    cameraRig.update();
  }
  const wasAnimating = unitBoard.isAnimating();
  unitBoard.update(dtSeconds);
  if (unitBoard.isAnimating()) scheduler.markDirty();
  else if (wasAnimating) {
    soundRegistry.stopWalk();
    inputLocked = false;
    refreshTurnStatusText();
    // 캡처가 아닌 일반 이동은 combatDirector를 거치지 않고 여기서 애니메이션이 끝나므로,
    // CPU 차례 트리거는 이 지점에서도 걸어야 한다(캡처 경로는 playCapture().then()에서 이미 처리).
    if (matchController !== null && currentConfig !== null) void maybeTriggerCpuMove(matchController.getSession(), currentConfig);
  }
  renderer.render(scene, cameraRig.camera);
  perfOverlay.onFrame();
}

function idleUpdate(_dtSeconds: number): void {
  // mixer/이동 갱신은 renderFrame 내부에서 처리(dirty/idle 두 경로 모두 renderFrame을 거친다).
}

const scheduler = new RenderScheduler(renderFrame, idleUpdate, getQualitySettings(tier).idleUpdateHz);

window.addEventListener('resize', resize);
cameraRig.controls.addEventListener('change', () => scheduler.markDirty());

resize();
scheduler.start();

// 5) 실측 기반 최종 품질 티어 자동 감지(D9 §디바이스 자동 감지 알고리즘).
void autoDetectQualityTier(renderer.webgl, () => renderFrame(0)).then((result) => {
  tier = result.tier;
  renderer.setPixelRatioCap(resolvePixelRatioCap(tier, result.isMobile));
  scheduler.markDirty();
  console.info(
    `[QualityTier] resolved=${result.tier} (gpu=${result.gpuCandidate} cores=${result.coreCandidate} ` +
      `dpr=${result.pixelRatioCandidate} runtime=${result.runtimeCandidate} avgFrameMs=${result.avgFrameMs.toFixed(2)} ` +
      `mobile=${result.isMobile})`
  );
});

// 6) D10-1 §아이덴티티 부팅 — 최초 실행이면 닉네임 모달, 이미 있으면 곧장 메인 메뉴.
mainMenu.hide();

async function onIdentityReady(identity: PlayerIdentity): Promise<void> {
  currentIdentity = identity;
  mainMenu.setPlayerNickname(identity.nickname);
  syncEngine.setIdentity(identity);
  syncEngine.start();
  try {
    const result = await historyClient.identify(identity, identity.serverRegisteredAt === null);
    if (result.secretAccepted && identity.serverRegisteredAt === null) currentIdentity = markServerRegistered(identity);
  } catch {
    // 서버가 꺼져 있어도 로컬 플레이/전적 조회는 정상 동작한다(D10-1 §오프라인만 플레이하는 사용자).
  }
  setTimeout(() => void syncEngine.syncNow(), 2000); // D10-2 트리거 ① 부팅 2초 시점
  await refreshContinueAvailability();
}

window.addEventListener('online', () => void syncEngine.syncNow()); // D10-2 트리거 ②

void historyStore
  .open()
  .then(() => {
    const existing = loadIdentity();
    if (existing !== null) {
      mainMenu.show();
      void onIdentityReady(existing);
      return;
    }
    nicknameModal.show((nickname) => {
      const identity = createIdentity(nickname);
      nicknameModal.hide();
      mainMenu.show();
      void onIdentityReady(identity);
    });
  })
  .catch((err: unknown) => {
    console.warn('[persistence] IndexedDB 초기화 실패 — 전적 저장 없이 플레이는 계속 가능:', err);
    mainMenu.show();
  });

console.info(`Battle Chess Reforged — Sprint 9a online play. THREE r${THREE.REVISION}`);
