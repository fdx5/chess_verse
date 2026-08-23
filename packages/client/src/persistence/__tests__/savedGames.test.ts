import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { IndexedDbStore } from '../IndexedDbStore';
import type { SavedGameRecord } from '../schema';

function saved(saveId: string, playerId: string, savedAt: number): SavedGameRecord {
  return {
    saveId,
    playerId,
    config: { source: 'cpu', format: 'bo1', cpuDifficulty: 'intermediate', myColorGame1: 'w' },
    localMatchId: `match-${saveId}`,
    gameIndex: 0,
    scoreMine: 0,
    scoreOpponent: 0,
    completedGames: [],
    currentFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    currentMovesSan: [],
    matchStartedAt: savedAt - 1000,
    gameStartedAt: savedAt - 1000,
    savedAt,
  };
}

describe('ID별 게임 저장 슬롯', () => {
  it('플레이어별로 격리하고 최신 저장 순으로 조회하며 삭제한다', async () => {
    const store = new IndexedDbStore();
    await store.open();
    await store.clearAll();
    await store.putSavedGame(saved('old', 'player-a', 100));
    await store.putSavedGame(saved('new', 'player-a', 200));
    await store.putSavedGame(saved('other', 'player-b', 300));

    expect((await store.listSavedGames('player-a')).map((game) => game.saveId)).toEqual(['new', 'old']);
    expect((await store.listSavedGames('player-b')).map((game) => game.saveId)).toEqual(['other']);

    await store.deleteSavedGame('new');
    expect((await store.listSavedGames('player-a')).map((game) => game.saveId)).toEqual(['old']);
  });
});
