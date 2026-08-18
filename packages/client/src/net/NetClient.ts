import type {
  AnyMessage,
  ClientMessage,
  MatchFoundPayload,
  MoveAcceptedPayload,
  MoveRejectedPayload,
  StateSyncPayload,
  ClockSyncPayload,
  GameEndPayload,
  MatchEndPayload,
  OpponentDisconnectedPayload,
  PlayerIdentifiedPayload,
  RoomCreatedPayload,
  DrawOfferPayload,
  ChatPayload,
  EmotePayload,
  QueueJoinPayload,
  MatchFormat,
} from '@battle-chess/protocol';
import { envelope } from '@battle-chess/protocol';
import type { Move } from '@battle-chess/chess-core';
import { EventBus } from '../game/EventBus';
import { PredictionBuffer } from './PredictionBuffer';

export interface NetClientEventMap {
  'net:connected': Record<string, never>;
  'net:disconnected': { code: number };
  'net:playerIdentified': PlayerIdentifiedPayload;
  'net:roomCreated': RoomCreatedPayload;
  'net:matchFound': MatchFoundPayload;
  'net:moveAccepted': MoveAcceptedPayload;
  'net:moveRejected': MoveRejectedPayload;
  'net:stateSync': StateSyncPayload;
  'net:clockSync': ClockSyncPayload;
  'net:gameEnd': GameEndPayload;
  'net:matchEnd': MatchEndPayload;
  'net:opponentDisconnected': OpponentDisconnectedPayload;
  'net:drawOffer': DrawOfferPayload;
  'net:chat': ChatPayload;
  'net:emote': EmotePayload;
}

const HEARTBEAT_INTERVAL_MS = 15_000;

/** D6 §클라이언트 net 레이어 — WS 연결, 낙관적 적용/롤백, 하트비트를 담당한다. */
export class NetClient {
  readonly bus = new EventBus<NetClientEventMap>();
  readonly predictionBuffer = new PredictionBuffer();
  private ws: WebSocket | null = null;
  private heartbeatHandle: ReturnType<typeof setInterval> | null = null;
  private clientVersion = '0.1.0';

  connect(url: string, sessionToken?: string): void {
    this.ws = new WebSocket(url);
    this.ws.addEventListener('open', () => {
      this.send('HELLO', { clientVersion: this.clientVersion, ...(sessionToken !== undefined ? { sessionToken } : {}) });
      this.bus.emit('net:connected', {});
      this.heartbeatHandle = setInterval(() => this.send('HELLO', { clientVersion: this.clientVersion }), HEARTBEAT_INTERVAL_MS);
    });
    this.ws.addEventListener('message', (ev: MessageEvent<string>) => this.handleMessage(ev.data));
    this.ws.addEventListener('close', (ev) => {
      if (this.heartbeatHandle !== null) clearInterval(this.heartbeatHandle);
      this.bus.emit('net:disconnected', { code: ev.code });
    });
  }

  disconnect(): void {
    this.ws?.close();
    this.ws = null;
  }

  private send<T extends ClientMessage['type']>(type: T, payload: Extract<ClientMessage, { type: T }>['payload']): void {
    if (this.ws === null || this.ws.readyState !== this.ws.OPEN) return;
    this.ws.send(JSON.stringify(envelope(type, payload)));
  }

  identify(playerId: string, nickname: string, secret?: string): void {
    this.send('PLAYER_IDENTIFY', { playerId, nickname, ...(secret !== undefined ? { secret } : {}) });
  }

  queueJoin(payload: QueueJoinPayload): void {
    this.send('QUEUE_JOIN', payload);
  }

  /** D6-1: 낙관적 적용은 호출부(GameSession 연동 레이어)가 하고, 여기서는 전송+추적만 한다. */
  sendMove(matchId: string, gameIndex: number, move: Move, clientMoveId: string): void {
    this.predictionBuffer.push(clientMoveId, move);
    this.send('MOVE', { matchId, gameIndex, move, clientMoveId });
  }

  resign(matchId: string, gameIndex: number): void {
    this.send('RESIGN', { matchId, gameIndex });
  }

  reconnect(sessionToken: string, matchId: string): void {
    this.send('RECONNECT', { sessionToken, matchId });
  }

  drawOffer(matchId: string, action: 'offer' | 'accept' | 'decline'): void {
    this.send('DRAW_OFFER', { matchId, action });
  }

  chat(matchId: string, text: string): void {
    this.send('CHAT', { matchId, text });
  }

  emote(matchId: string, emoteId: EmotePayload['emoteId']): void {
    this.send('EMOTE', { matchId, emoteId });
  }

  intermissionReady(matchId: string, gameIndex: number): void {
    this.send('INTERMISSION_READY', { matchId, gameIndex });
  }

  private handleMessage(raw: string): void {
    let msg: AnyMessage;
    try {
      msg = JSON.parse(raw) as AnyMessage;
    } catch {
      return;
    }
    switch (msg.type) {
      case 'PLAYER_IDENTIFIED':
        return this.bus.emit('net:playerIdentified', msg.payload);
      case 'ROOM_CREATED':
        return this.bus.emit('net:roomCreated', msg.payload);
      case 'MATCH_FOUND':
        return this.bus.emit('net:matchFound', msg.payload);
      case 'MOVE_ACCEPTED':
        this.predictionBuffer.consume(msg.payload.clientMoveId);
        return this.bus.emit('net:moveAccepted', msg.payload);
      case 'MOVE_REJECTED':
        this.predictionBuffer.consume(msg.payload.clientMoveId);
        return this.bus.emit('net:moveRejected', msg.payload);
      case 'STATE_SYNC':
        return this.bus.emit('net:stateSync', msg.payload);
      case 'CLOCK_SYNC':
        return this.bus.emit('net:clockSync', msg.payload);
      case 'GAME_END':
        return this.bus.emit('net:gameEnd', msg.payload);
      case 'MATCH_END':
        return this.bus.emit('net:matchEnd', msg.payload);
      case 'OPPONENT_DISCONNECTED':
        return this.bus.emit('net:opponentDisconnected', msg.payload);
      case 'DRAW_OFFER':
        return this.bus.emit('net:drawOffer', msg.payload);
      case 'CHAT':
        return this.bus.emit('net:chat', msg.payload);
      case 'EMOTE':
        return this.bus.emit('net:emote', msg.payload);
      case 'INTERMISSION_READY':
        return; // 서버가 클라로 이 타입을 되돌려보내는 경로는 없음(C→S 전용 사용)
    }
  }
}

export type { MatchFormat };
