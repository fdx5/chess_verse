import type { Color, GameResult } from '@battle-chess/chess-core';
import type { GameSession } from './GameSession';

/** R2 로컬 2인(핫시트) 플레이 오케스트레이션 — 턴 상태를 HUD가 소비할 수 있는 형태로 정리한다. */
export class HotSeatController {
  private lastResult: GameResult = { kind: 'in_progress' };

  constructor(private readonly session: GameSession) {
    this.session.bus.on('game:gameEnded', ({ result }) => {
      this.lastResult = result;
    });
  }

  getActiveColor(): Color {
    return this.session.getPosition().turn;
  }

  isGameOver(): boolean {
    return this.lastResult.kind !== 'in_progress';
  }

  getStatusText(): string {
    const result = this.lastResult;
    switch (result.kind) {
      case 'checkmate':
        return `체크메이트 — ${result.winner === 'w' ? '백' : '흑'} 승리`;
      case 'stalemate':
        return '스테일메이트 — 무승부';
      case 'draw':
        return `무승부 (${result.reason})`;
      case 'resignation':
        return `기권 — ${result.winner === 'w' ? '백' : '흑'} 승리`;
      case 'timeout':
        return `시간패 — ${result.winner === 'w' ? '백' : '흑'} 승리`;
      case 'in_progress':
        return this.getActiveColor() === 'w' ? '백 차례' : '흑 차례';
    }
  }
}
