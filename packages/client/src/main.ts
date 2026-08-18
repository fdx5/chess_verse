import * as THREE from 'three';
import { MoveFlag, otherColor, type GameResult, type PieceType, type Square } from '@battle-chess/chess-core';
import type { GameEndPayload } from '@battle-chess/protocol';
import { GameRenderer } from './engine/Renderer';
import { buildScene } from './engine/Scene';
import { OrbitCameraRig } from './engine/Camera';
import { RenderScheduler } from './engine/RenderScheduler';
import { autoDetectQualityTier, isMobileDevice } from './engine/DeviceDetect';
import { getQualitySettings, resolvePixelRatioCap, type QualityTier } from './engine/QualityTier';
import { ProceduralUnitFactory } from './units/ProceduralUnitFactory';
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
import { HUD } from './ui/HUD';
import { MainMenu } from './ui/MainMenu';
import { SettingsScreen } from './ui/SettingsScreen';
import { IntermissionScreen } from './ui/IntermissionScreen';
import { ResultModal } from './ui/ResultModal';
import { MatchmakingScreen } from './ui/MatchmakingScreen';

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
const unitFactory = new ProceduralUnitFactory();
const unitBoard = new UnitBoard(scene, unitFactory, animationRegistry, tier);

const audioGraph = new AudioGraph();
audioGraph.bindResumeOnGesture(canvas);
audioGraph.bindVisibilityPause();
const soundRegistry = new SoundRegistry(audioGraph);
const combatDirector = new CombatDirector(scene, unitBoard, cameraRig, animationRegistry, soundRegistry);

const hud = new HUD(app);
const intermissionScreen = new IntermissionScreen(app);
const resultModal = new ResultModal(app);
const matchmakingScreen = new MatchmakingScreen(app);

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
  } else if (piece !== null && piece !== undefined && piece.color === position.turn) {
    session.select(square);
  } else {
    session.select(null);
  }
}

function refreshTurnStatusText(): void {
  if (currentConfig?.source === 'online') {
    if (onlineSession === null) return;
    hud.setTurnText(onlineSession.getPosition().turn === onlineMyColor ? '내 차례' : '상대 차례');
    return;
  }
  if (hotSeat !== null) hud.setTurnText(hotSeat.getStatusText());
}

function bindSessionEvents(session: GameSession, config: MatchConfig): void {
  hotSeat = new HotSeatController(session);
  unitBoard.initFromPosition(session.getPosition());
  hud.resetMoveList();
  refreshTurnStatusText();
  scheduler.markDirty();

  session.bus.on('game:selectionChanged', ({ square, legalTargets }) => {
    unitBoard.showHighlights(square, legalTargets);
  });

  session.bus.on('game:moveApplied', ({ move, san, prevPosition }) => {
    unitBoard.clearHighlights();
    hud.pushMove(san, prevPosition.turn);
    inputLocked = true;

    const isCapture = (move.flags & MoveFlag.CAPTURE) !== 0;
    if (isCapture) {
      void combatDirector.playCapture(move, prevPosition).then(() => {
        inputLocked = false;
        refreshTurnStatusText();
        scheduler.markDirty();
        void maybeTriggerCpuMove(session, config);
      });
    } else {
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
  const humanColor = matchController.getMyColorForCurrentGame();
  const cpuColor = otherColor(humanColor);
  if (session.getPosition().turn !== cpuColor) return;

  const difficulty = config.cpuDifficulty ?? 'intermediate';
  const start = performance.now();
  const { move } = await getAiHandle().requestMove(session.getPosition(), difficulty, MOVETIME_MS[difficulty]);
  const elapsed = performance.now() - start;
  const remaining = MIN_THINK_DELAY_MS[difficulty] - elapsed;
  if (remaining > 0) await sleep(remaining);

  if (matchController === null || matchController.getSession() !== session) return; // 그 사이 매치가 바뀌었으면 폐기
  session.attemptMove(move.promo === undefined ? { from: move.from, to: move.to } : { from: move.from, to: move.to, promo: move.promo });
}

function startMatch(config: MatchConfig): void {
  currentConfig = config;
  mainMenu.hide();
  matchController = new MatchController(config);

  matchController.bus.on('match:gameStarted', ({ session }) => bindSessionEvents(session, config));
  matchController.bus.on('match:gameEnded', ({ gameIndex, result, scoreMine, scoreOpponent }) => {
    const controller = matchController;
    if (controller === null) return;
    if (controller.isMatchComplete()) return; // game:matchEnded가 최종 화면을 담당
    intermissionScreen.show(gameIndex, result, scoreMine, scoreOpponent, '다음 판 시작', () => controller.startNextGame());
  });
  matchController.bus.on('game:matchEnded', ({ outcome, scoreMine, scoreOpponent }) => {
    resultModal.show(
      outcome,
      scoreMine,
      scoreOpponent,
      () => startMatch(config),
      () => {
        matchController = null;
        mainMenu.show();
      }
    );
  });

  bindSessionEvents(matchController.getSession(), config);
}

// ── 온라인 대전(Sprint 9a/9c) ────────────────────────────────────────────────
const ONLINE_SERVER_URL = `ws://${window.location.hostname}:8787`;
const MATCHMAKING_TIMEOUT_MS = 20_000;

let netClient: NetClient | null = null;
let reconnectController: ReconnectController | null = null;
let onlineSession: GameSession | null = null;
let onlineMatchId: string | null = null;
let onlineGameIndex = 0;
let onlineMyColor: 'w' | 'b' = 'w';
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

function getOrCreateLocalStorageId(key: string, factory: () => string): string {
  const existing = localStorage.getItem(key);
  if (existing !== null) return existing;
  const created = factory();
  localStorage.setItem(key, created);
  return created;
}
function getOrCreatePlayerId(): string {
  return getOrCreateLocalStorageId('bcr.playerId', () => globalThis.crypto?.randomUUID?.() ?? `guest-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);
}
function getOrCreateNickname(): string {
  return getOrCreateLocalStorageId('bcr.nickname', () => `Guest${Math.floor(Math.random() * 10_000)}`);
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
  refreshTurnStatusText();
  scheduler.markDirty();

  session.bus.on('game:selectionChanged', ({ square, legalTargets }) => {
    unitBoard.showHighlights(square, legalTargets);
  });

  session.bus.on('game:moveApplied', ({ move, san, prevPosition }) => {
    unitBoard.clearHighlights();
    hud.pushMove(san, prevPosition.turn);
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
    client.identify(getOrCreatePlayerId(), getOrCreateNickname());
  });
  client.bus.on('net:playerIdentified', () => {
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

function startOnlineMatch(config: MatchConfig): void {
  currentConfig = config;
  mainMenu.hide();
  matchmakingScreen.showSearching('서버 연결 중...');
  const client = getOrCreateNetClient();
  client.connect(ONLINE_SERVER_URL);
}

function handleStartFromMenu(config: MatchConfig): void {
  if (config.source === 'online') startOnlineMatch(config);
  else startMatch(config);
}

// 4) 메인 메뉴 + 설정 화면.
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
});
const mainMenu = new MainMenu(app, handleStartFromMenu, () => settingsScreen.show());

function trySquareClick(square: ReturnType<GameSession['getSelected']>): void {
  if (combatDirector.isPlaying()) {
    combatDirector.requestSkip();
    return;
  }
  if (settingsScreen.isVisible()) return;
  if (inputLocked || unitBoard.isAnimating()) return;

  if (currentConfig?.source === 'online') {
    if (onlineSession === null) return;
    if (onlineSession.getPosition().turn !== onlineMyColor) return; // 상대 차례엔 입력 무시
    handleBoardClick(onlineSession, square, () => {
      lastMoveWasLocalInput = true;
    });
    return;
  }

  if (matchController === null) return;
  const session = matchController.getSession();
  if (currentConfig?.source === 'cpu') {
    const humanColor = matchController.getMyColorForCurrentGame();
    if (session.getPosition().turn !== humanColor) return; // CPU 차례엔 입력 무시
  }
  handleBoardClick(session, square);
}

const pointerController = new PointerController(canvas, cameraRig.camera, trySquareClick);
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
    inputLocked = false;
    refreshTurnStatusText();
    // 캡처가 아닌 일반 이동은 combatDirector를 거치지 않고 여기서 애니메이션이 끝나므로,
    // CPU 차례 트리거는 이 지점에서도 걸어야 한다(캡처 경로는 playCapture().then()에서 이미 처리).
    if (matchController !== null && currentConfig !== null) void maybeTriggerCpuMove(matchController.getSession(), currentConfig);
  }
  renderer.render(scene, cameraRig.camera);
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

console.info(`Battle Chess Reforged — Sprint 9a online play. THREE r${THREE.REVISION}`);
