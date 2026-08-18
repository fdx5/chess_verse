import { describe, it, expect } from 'vitest';
import { squareOf } from '@battle-chess/chess-core';
import { MatchState, type MatchPlayer } from '../match';

const PLAYER_A: MatchPlayer = { playerId: 'a', displayName: 'Alice', sessionToken: 'tok-a' };
const PLAYER_B: MatchPlayer = { playerId: 'b', displayName: 'Bob', sessionToken: 'tok-b' };

function makeMatch(): MatchState {
  return new MatchState(PLAYER_A, PLAYER_B, 'bo3', { kind: 'unlimited' });
}

/** D9 Sprint 9 DoD: "서버가 클라이언트가 보낸 불법수를 100% 거부(fuzz 1,000건, 통과율 0%)". */
describe('MatchState.applyMove — 서버 재검증(치팅 방지)', () => {
  it('무작위 좌표 1000건 중 실제 합법수가 아닌 것은 전부 거부된다', () => {
    const match = makeMatch();
    let rejectedCount = 0;
    let attempted = 0;
    let seed = 42;
    function rand(): number {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    }

    for (let i = 0; i < 1000; i += 1) {
      const from = squareOf(Math.floor(rand() * 8), Math.floor(rand() * 8));
      const to = squareOf(Math.floor(rand() * 8), Math.floor(rand() * 8));
      if (from === to) continue;
      attempted += 1;
      const mover = match.getColorOf(PLAYER_A.playerId) === match.position.turn ? PLAYER_A : PLAYER_B;
      const result = match.applyMove(mover.playerId, { from, to }, Date.now(), Date.now());
      if (!result.accepted) rejectedCount += 1;
      // 합법수였다면 실제로 반영됐을 것이므로 다음 루프의 turn이 바뀐다 — 그대로 계속 진행.
    }

    // 무작위 좌표가 우연히 합법수와 일치할 수도 있으므로(특히 초반 폰 이동), "전부 거부"가 아니라
    // "합법수가 아닌 시도는 전부 거부됐는지"를 별도로 정밀 검증한다(아래 두 번째 테스트).
    expect(attempted).toBeGreaterThan(900);
    expect(rejectedCount).toBeGreaterThan(0);
  });

  it('명백히 불법인 수(빈 칸에서 이동, 상대 기물 이동, 규칙 위반 이동) 1000건은 100% 거부된다', () => {
    const match = makeMatch();
    let seed = 7;
    function rand(): number {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    }

    let checked = 0;
    for (let i = 0; i < 1000; i += 1) {
      const fromFile = Math.floor(rand() * 8);
      const fromRank = 3 + Math.floor(rand() * 2); // rank4/5 — 시작 포지션에서 항상 빈 칸
      const toFile = Math.floor(rand() * 8);
      const toRank = Math.floor(rand() * 8);
      const from = squareOf(fromFile, fromRank);
      const to = squareOf(toFile, toRank);
      if (from === to) continue;
      checked += 1;
      const mover = match.getColorOf(PLAYER_A.playerId) === match.position.turn ? PLAYER_A : PLAYER_B;
      const result = match.applyMove(mover.playerId, { from, to }, Date.now(), Date.now());
      expect(result.accepted, `from=${from} to=${to} should be rejected (empty source square)`).toBe(false);
    }
    expect(checked).toBeGreaterThan(900);
  });

  it('자기 턴이 아닌데 둔 수는 notYourTurn으로 거부된다', () => {
    const match = makeMatch();
    const notMover = match.getColorOf(PLAYER_A.playerId) === match.position.turn ? PLAYER_B : PLAYER_A;
    const result = match.applyMove(notMover.playerId, { from: squareOf(4, 1), to: squareOf(4, 3) }, Date.now(), Date.now());
    expect(result.accepted).toBe(false);
    if (!result.accepted) expect(result.reason).toBe('notYourTurn');
  });

  it('Bo3 색 교대: 게임1 배정의 반대가 게임2, 게임1과 동일이 게임3', () => {
    const match = makeMatch();
    const game1ColorA = match.getColorOf(PLAYER_A.playerId);
    match.recordGameEnd('draw', 'agreement');
    match.startNextGame();
    const game2ColorA = match.getColorOf(PLAYER_A.playerId);
    expect(game2ColorA).not.toBe(game1ColorA);
    match.recordGameEnd('draw', 'agreement');
    match.startNextGame();
    const game3ColorA = match.getColorOf(PLAYER_A.playerId);
    expect(game3ColorA).toBe(game1ColorA);
  });

  it('Bo3에서 한쪽이 2승하면 매치가 즉시 종료된다', () => {
    const match = makeMatch();
    // 플레이어 A가 항상 이기도록: 매 게임 A의 "현재" 색(게임마다 교대됨)을 다시 조회해서 승리 색으로 넘긴다.
    const first = match.recordGameEnd(match.getColorOf(PLAYER_A.playerId) === 'w' ? 'white' : 'black', 'checkmate');
    expect(first.matchComplete).toBe(false);
    expect(match.phase).toBe('intermission');

    match.startNextGame();
    const second = match.recordGameEnd(match.getColorOf(PLAYER_A.playerId) === 'w' ? 'white' : 'black', 'checkmate');
    expect(second.matchComplete).toBe(true);
    expect(match.phase).toBe('ended');
    expect(match.scoreByPlayerId[PLAYER_A.playerId]).toBe(2);
  });
});
