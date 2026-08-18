import type { NetClient } from './NetClient';

const STORAGE_KEY_TOKEN = 'bcr.sessionToken';
const STORAGE_KEY_MATCH = 'bcr.matchId';
const RECONNECT_DELAY_MS = 1000;

/** D6-6 §재접속 — sessionToken을 localStorage(R6 예외)에 보관하고, 연결 끊김 시 자동으로 RECONNECT를 시도한다. */
export class ReconnectController {
  private sessionToken: string | null = null;
  private matchId: string | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly netClient: NetClient,
    private readonly serverUrl: string
  ) {
    netClient.bus.on('net:matchFound', (payload) => {
      this.sessionToken = payload.sessionToken;
      this.matchId = payload.matchId;
      this.persist();
    });
    netClient.bus.on('net:disconnected', () => this.scheduleReconnect());
    netClient.bus.on('net:matchEnd', () => this.clear());
  }

  /** 페이지 로드 시 이전 세션이 남아있는지 확인(예: 새로고침 직후). */
  tryResumeFromStorage(): { sessionToken: string; matchId: string } | null {
    const sessionToken = localStorage.getItem(STORAGE_KEY_TOKEN);
    const matchId = localStorage.getItem(STORAGE_KEY_MATCH);
    if (sessionToken !== null && matchId !== null) {
      this.sessionToken = sessionToken;
      this.matchId = matchId;
      return { sessionToken, matchId };
    }
    return null;
  }

  private persist(): void {
    if (this.sessionToken !== null && this.matchId !== null) {
      localStorage.setItem(STORAGE_KEY_TOKEN, this.sessionToken);
      localStorage.setItem(STORAGE_KEY_MATCH, this.matchId);
    }
  }

  private scheduleReconnect(): void {
    if (this.sessionToken === null || this.matchId === null || this.reconnectTimer !== null) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      const token = this.sessionToken;
      const matchId = this.matchId;
      if (token === null || matchId === null) return;
      this.netClient.connect(this.serverUrl, token);
      const unsubscribe = this.netClient.bus.on('net:connected', () => {
        unsubscribe();
        this.netClient.reconnect(token, matchId);
      });
    }, RECONNECT_DELAY_MS);
  }

  clear(): void {
    this.sessionToken = null;
    this.matchId = null;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    localStorage.removeItem(STORAGE_KEY_TOKEN);
    localStorage.removeItem(STORAGE_KEY_MATCH);
  }
}
