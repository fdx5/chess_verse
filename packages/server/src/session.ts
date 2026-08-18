import { randomUUID } from 'node:crypto';

const SESSION_TTL_MS = 10 * 60_000; // D6-6: 10분, 슬라이딩 만료

export interface Session {
  sessionToken: string;
  playerId: string | null;
  matchId: string | null;
  expiresAt: number;
}

/** D6-6 §세션 토큰 — 발급/조회/슬라이딩 TTL 갱신을 담당한다. */
export class SessionStore {
  private readonly sessions = new Map<string, Session>();

  create(): Session {
    const session: Session = { sessionToken: randomUUID(), playerId: null, matchId: null, expiresAt: Date.now() + SESSION_TTL_MS };
    this.sessions.set(session.sessionToken, session);
    return session;
  }

  get(token: string): Session | undefined {
    const session = this.sessions.get(token);
    if (session === undefined) return undefined;
    if (session.expiresAt < Date.now()) {
      this.sessions.delete(token);
      return undefined;
    }
    return session;
  }

  /** 매 MOVE_ACCEPTED/CLOCK_SYNC 전송 시 호출 — TTL을 10분으로 갱신(sliding expiration). */
  touch(token: string): void {
    const session = this.sessions.get(token);
    if (session === undefined) return;
    session.expiresAt = Date.now() + SESSION_TTL_MS;
  }

  bindMatch(token: string, matchId: string, playerId: string): void {
    const session = this.sessions.get(token);
    if (session === undefined) return;
    session.matchId = matchId;
    session.playerId = playerId;
  }

  remove(token: string): void {
    this.sessions.delete(token);
  }
}
