const STORAGE_KEY = 'bcr:identity';

/** D10-1 §플레이어 아이덴티티 — localStorage에만 저장(부팅 첫 프레임에 동기적으로 필요). */
export interface PlayerIdentity {
  playerId: string;
  nickname: string;
  secret: string;
  createdAt: number;
  serverRegisteredAt: number | null;
  schemaVersion: 1;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function defaultNickname(playerId: string): string {
  return `Player-${playerId.slice(0, 4).toUpperCase()}`;
}

/** D10-1 §닉네임 검증 규칙 — 트림 후 2~16 코드포인트, 연속 공백 축약. 위반 시 null. */
export function normalizeNickname(raw: string): string | null {
  const trimmed = raw.trim().replace(/\s+/g, ' ');
  if (trimmed.length < 2 || trimmed.length > 16) return null;
  return trimmed;
}

export function loadIdentity(): PlayerIdentity | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as PlayerIdentity;
  } catch {
    return null;
  }
}

export function saveIdentity(identity: PlayerIdentity): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
}

export function createIdentity(nicknameInput: string): PlayerIdentity {
  const playerId = crypto.randomUUID();
  const secret = base64UrlEncode(crypto.getRandomValues(new Uint8Array(32)));
  const identity: PlayerIdentity = {
    playerId,
    nickname: normalizeNickname(nicknameInput) ?? defaultNickname(playerId),
    secret,
    createdAt: Date.now(),
    serverRegisteredAt: null,
    schemaVersion: 1,
  };
  saveIdentity(identity);
  return identity;
}

export function updateNickname(identity: PlayerIdentity, nicknameInput: string): PlayerIdentity {
  const normalized = normalizeNickname(nicknameInput);
  if (normalized === null) return identity;
  const updated: PlayerIdentity = { ...identity, nickname: normalized };
  saveIdentity(updated);
  return updated;
}

export function markServerRegistered(identity: PlayerIdentity): PlayerIdentity {
  const updated: PlayerIdentity = { ...identity, serverRegisteredAt: Date.now() };
  saveIdentity(updated);
  return updated;
}

/** D10-1 §확정 — 백업 코드 UI. `playerId:secret` 형식 텍스트로 복사/복원한다. */
export function backupCode(identity: PlayerIdentity): string {
  return `${identity.playerId}:${identity.secret}`;
}

export function restoreFromBackupCode(code: string): PlayerIdentity | null {
  const trimmed = code.trim();
  const sepIndex = trimmed.indexOf(':');
  if (sepIndex <= 0) return null;
  const playerId = trimmed.slice(0, sepIndex);
  const secret = trimmed.slice(sepIndex + 1);
  if (playerId.length === 0 || secret.length === 0) return null;
  const identity: PlayerIdentity = {
    playerId,
    nickname: defaultNickname(playerId),
    secret,
    createdAt: Date.now(),
    serverRegisteredAt: null,
    schemaVersion: 1,
  };
  saveIdentity(identity);
  return identity;
}

export function clearIdentity(): void {
  localStorage.removeItem(STORAGE_KEY);
}
