import type { MatchFormat, TimeControlPreset } from '@battle-chess/protocol';
import { MatchState, type MatchPlayer } from './match.js';

const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // D6-9: 0/O, 1/I 제외
const ROOM_CODE_LENGTH = 6;
const ROOM_CODE_TTL_MS = 30 * 60_000; // D6-9: 30분 내 미입장 시 폐기

interface QueueEntry {
  player: MatchPlayer;
  timeControl: TimeControlPreset;
  matchFormat: MatchFormat;
  queuedAt: number;
}

interface PendingRoom {
  roomCode: string;
  host: MatchPlayer;
  timeControl: TimeControlPreset;
  matchFormat: MatchFormat;
  expiresAt: number;
}

/** D6-3/D6-9 §매칭(quick queue) + 룸코드 관리. */
export class RoomManager {
  private readonly quickQueue: QueueEntry[] = [];
  private readonly pendingRooms = new Map<string, PendingRoom>();

  private generateRoomCode(): string {
    let code: string;
    do {
      code = Array.from({ length: ROOM_CODE_LENGTH }, () => ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)]).join('');
    } while (this.pendingRooms.has(code));
    return code;
  }

  createRoom(host: MatchPlayer, timeControl: TimeControlPreset, matchFormat: MatchFormat): PendingRoom {
    const roomCode = this.generateRoomCode();
    const room: PendingRoom = { roomCode, host, timeControl, matchFormat, expiresAt: Date.now() + ROOM_CODE_TTL_MS };
    this.pendingRooms.set(roomCode, room);
    return room;
  }

  /** 룸코드로 참가 — 성공 시 매치를 만들고 룸을 정리한다. 코드가 없거나 만료됐으면 null. */
  joinRoom(roomCode: string, guest: MatchPlayer): MatchState | null {
    const room = this.pendingRooms.get(roomCode);
    if (room === undefined || room.expiresAt < Date.now()) {
      this.pendingRooms.delete(roomCode);
      return null;
    }
    this.pendingRooms.delete(roomCode);
    return new MatchState(room.host, guest, room.matchFormat, room.timeControl);
  }

  /** quick 매칭 — 대기열에 넣고, 즉시 짝지어지면 MatchState를 반환한다. */
  enqueueQuick(player: MatchPlayer, timeControl: TimeControlPreset, matchFormat: MatchFormat): MatchState | null {
    const opponentIndex = this.quickQueue.findIndex((e) => e.matchFormat === matchFormat);
    if (opponentIndex === -1) {
      this.quickQueue.push({ player, timeControl, matchFormat, queuedAt: Date.now() });
      return null;
    }
    const [opponent] = this.quickQueue.splice(opponentIndex, 1);
    if (opponent === undefined) return null;
    return new MatchState(opponent.player, player, matchFormat, timeControl);
  }

  removeFromQueue(playerId: string): void {
    const idx = this.quickQueue.findIndex((e) => e.player.playerId === playerId);
    if (idx !== -1) this.quickQueue.splice(idx, 1);
  }

  /** D6-7: 대기열 엔트리는 120초 후 서버가 자동 제거. 주기적으로 호출한다. */
  pruneStaleQueueEntries(now: number): void {
    const QUEUE_TIMEOUT_MS = 120_000;
    for (let i = this.quickQueue.length - 1; i >= 0; i -= 1) {
      const entry = this.quickQueue[i];
      if (entry !== undefined && now - entry.queuedAt > QUEUE_TIMEOUT_MS) this.quickQueue.splice(i, 1);
    }
    for (const [code, room] of this.pendingRooms) {
      if (room.expiresAt < now) this.pendingRooms.delete(code);
    }
  }
}
