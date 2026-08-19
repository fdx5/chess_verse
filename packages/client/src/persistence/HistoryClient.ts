import type { IdentifyResponseDto, MatchDetailDto, MatchHistoryPage, PlayerStatsDto, SyncMatchDto, SyncUploadResult } from '@battle-chess/protocol';
import type { PlayerIdentity } from './identity';

/** D10-6 §히스토리 REST 클라이언트 — 인증은 `X-BCR-Player-Id`/`X-BCR-Player-Secret` 헤더로. */
export class HistoryClient {
  constructor(private readonly baseUrl: string) {}

  private authHeaders(identity: PlayerIdentity): Record<string, string> {
    return { 'x-bcr-player-id': identity.playerId, 'x-bcr-player-secret': identity.secret };
  }

  async identify(identity: PlayerIdentity, includeSecret: boolean): Promise<IdentifyResponseDto> {
    const res = await fetch(`${this.baseUrl}/api/v1/players/identify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ playerId: identity.playerId, nickname: identity.nickname, ...(includeSecret ? { secret: identity.secret } : {}) }),
    });
    if (!res.ok) throw new Error(`identify failed: ${res.status}`);
    return (await res.json()) as IdentifyResponseDto;
  }

  async uploadMatches(identity: PlayerIdentity, batch: SyncMatchDto[]): Promise<SyncUploadResult[]> {
    const res = await fetch(`${this.baseUrl}/api/v1/matches/sync`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...this.authHeaders(identity) },
      body: JSON.stringify({ matches: batch }),
    });
    if (!res.ok) throw new Error(`sync failed: ${res.status}`);
    const body = (await res.json()) as { results: SyncUploadResult[] };
    return body.results;
  }

  async fetchHistory(identity: PlayerIdentity, opts: { limit: number; before?: number }): Promise<MatchHistoryPage> {
    const params = new URLSearchParams({ limit: String(opts.limit) });
    if (opts.before !== undefined) params.set('before', String(opts.before));
    const res = await fetch(`${this.baseUrl}/api/v1/players/${identity.playerId}/matches?${params.toString()}`, { headers: this.authHeaders(identity) });
    if (!res.ok) throw new Error(`fetchHistory failed: ${res.status}`);
    return (await res.json()) as MatchHistoryPage;
  }

  async fetchMatch(identity: PlayerIdentity, matchId: string): Promise<MatchDetailDto> {
    const res = await fetch(`${this.baseUrl}/api/v1/matches/${matchId}`, { headers: this.authHeaders(identity) });
    if (!res.ok) throw new Error(`fetchMatch failed: ${res.status}`);
    return (await res.json()) as MatchDetailDto;
  }

  async fetchStats(identity: PlayerIdentity): Promise<PlayerStatsDto> {
    const res = await fetch(`${this.baseUrl}/api/v1/players/${identity.playerId}/stats`, { headers: this.authHeaders(identity) });
    if (!res.ok) throw new Error(`fetchStats failed: ${res.status}`);
    return (await res.json()) as PlayerStatsDto;
  }

  async deleteAccount(identity: PlayerIdentity): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/v1/players/${identity.playerId}`, { method: 'DELETE', headers: this.authHeaders(identity) });
    if (!res.ok && res.status !== 204) throw new Error(`deleteAccount failed: ${res.status}`);
  }
}
