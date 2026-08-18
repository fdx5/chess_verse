# D8. AUDIO_DESIGN.md

> R14(중세 톤 고정)에 따라 BGM/앰비언스는 반드시 중세 악기 팔레트(류트, 하프, 내추럴호른, 프레임드럼/타보르, 비올)로 절차 합성되거나 그 스타일의 샘플로 대체 가능해야 한다.

## 오디오 아키텍처

```
AudioContext
 └─ masterGain (GainNode, 기본 0.8)
     ├─ musicBus (GainNode) → compressor(DynamicsCompressorNode) → masterGain
     ├─ sfxBus (GainNode) → masterGain
     ├─ uiBus (GainNode) → masterGain
     └─ ambienceBus (GainNode) → masterGain
```
개별 큐는 해당 버스에 연결된 `PannerNode`(HRTF, 3D) 또는 직결(스테레오)로 나뉜다.

- **3D 공간음(PannerNode) 적용:** 이동 SFX, 전투 SFX(접근/스윙/임팩트/사망) — 보드 좌표를 월드 좌표로 변환해 `panner.positionX/Y/Z`에 매 프레임이 아닌 이벤트 발생 시 1회 세팅(정적 사운드이므로 갱신 불필요). 카메라 리스너(`AudioListener`)는 Three.js 카메라와 동기화.
- **평면 스테레오(비공간화):** UI 사운드 전부(선택/배치/오류/체크경고/스팅어/시계경고/승리팡파레), BGM/앰비언스(전역 배경음이므로 공간화 무의미).

## 큐 시트

### 이동 (공간화, sfxBus)
| 큐 | 길이(ms) | 방식 |
|---|---|---|
| `sfx.pawn.footstep.leather` | 80–120 | 절차 합성 |
| `sfx.knight.hoofbeat` | 100–150 | 절차 합성 |
| `sfx.bishop.cloth_rustle` | 200–300 | 절차 합성 |
| `sfx.bishop.magic_shimmer` | 400–600 | 절차 합성 |
| `sfx.rook.stone_stomp` | 150–250 | 절차 합성 |
| `sfx.queen.footstep.elegant` | 90–130 | 절차 합성 |
| `sfx.queen.cape_whoosh` | 250–350 | 절차 합성 |
| `sfx.king.footstep.heavy` | 140–200 | 절차 합성 |

### 전투 (공간화, sfxBus)
| 큐 | 길이(ms) | 방식 |
|---|---|---|
| `sfx.*.approach` (유닛별 변형) | 200–500 | 절차 합성 |
| `sfx.*.weapon_swing` | 150–250 | 절차 합성 |
| `sfx.impact.metal` / `sfx.impact.stone` / `sfx.impact.dull`(육박전) | 80–150 | 절차 합성 |
| `sfx.*.parry_block` | 100–180 | 절차 합성 |
| `sfx.death.dissolve.light` / `.dust` / `.mist` / `.embers` | 600–1200 | 절차 합성 |
| `sfx.*.victory_roar` | 500–900 | 절차 합성(추후 샘플 교체 후보 — 목소리 합성은 절차 합성 한계가 뚜렷함) |

### UI (비공간화, uiBus)
| 큐 | 길이(ms) | 방식 |
|---|---|---|
| `sfx.ui.select` | 60–90 | 절차 합성 |
| `sfx.ui.place` | 70–100 | 절차 합성 |
| `sfx.ui.illegal` | 150–200 | 절차 합성 |
| `sfx.ui.check_warning` | 300–400 | 절차 합성 |
| `sfx.ui.checkmate_stinger` | 1200–1800 | 절차 합성(중세 팔레트 — natural horn 스팅어) |
| `sfx.ui.clock_warning` (10초 미만, 매초 반복) | 120–180 | 절차 합성 |
| `sfx.ui.match_victory_fanfare` | 2000–3000 | 절차 합성(호른+타보르 팡파레) |

### 앰비언스 (비공간화, ambienceBus, 루프)
| 큐 | 길이(초, 루프 단위) | 방식 |
|---|---|---|
| `amb.castle_hall` | 45–60 | 절차 합성(류트+하프 저음 드론 + 잔향) |
| `amb.frozen_keep` | 45–60 | 절차 합성(바람 노이즈 + 비올 저음 드론) |
| `amb.volcanic_ruin` | 45–60 | 절차 합성(타보르 저역 펄스 + 낮은 브라스 드론) |

### 전투 연출 SFX id 확정 목록

D5-3의 36개 전투 연출이 참조하는 **구체 큐 id는 D5(§D5-3 각 항목의 SFX 행 + §D5-3-B 매핑 표)가 단일 출처**이며, 본 문서의 전투 표(`sfx.*.approach` 등)는 그 id들을 합성하기 위한 **파라미터 계열(family)** 정의다. 네이밍 규칙은 `sfx.<주체>.<동작>.<재질>`(주체 = `pawn|knight|cleric|golem|queen|king|impact|ui|amb`)로 고정한다. `SoundRegistry`는 부팅 시 계열 정의로부터 구체 id를 파생 등록하며(예: `sfx.golem.crumble.large` = `sfx.*.death.dissolve` 계열 + lowpass 220Hz + 길이 1200ms), D5에 있는데 등록되지 않은 id는 `SoundRegistry.play()`가 `console.warn('[audio] unregistered cue: <id>')` 후 무음 처리한다(연출 진행은 절대 막지 않는다).

---

## BGM / 음악 레이어 (비공간화, musicBus, 루프) — R14 중세 팔레트 고정

**R14 확정 제약:** BGM은 **중세 악기 팔레트 밖의 음색을 사용하지 않는다.** 허용 음색은 **류트(lute), 하프(harp), 내추럴호른(natural horn), 프레임 드럼/타보르(frame drum/tabor), 비올(viol)** 5종과 그 절차적 근사뿐이다. **금지:** 신스 패드/리드, 드럼머신·808 계열, 일렉트릭 기타/베이스, 오케스트라 스트링 섹션의 현대적 레가토 샘플, 네온/사이버 계열의 어떤 음색도 사용하지 않는다. 3테마의 BGM은 **같은 팔레트 안에서 조성·템포·편성 밀도만 달라져야 하며**, 악기 자체를 바꿔 분위기를 만드는 방식은 금지한다(테마 전환 시 "같은 악단이 다른 곡을 연주하는" 일관성을 유지하기 위함).

| 큐 | 테마 | 루프 길이 | 템포 | 조성 | 편성(레이어) | 성격 |
|---|---|---|---|---|---|---|
| `bgm.castle_hall` | Castle Hall | 64.0s (16마디 × 4/4) | 84 BPM | D 도리안 | L1 하프 아르페지오(8분음표), L2 류트 코드 스트럼(2박마다), L3 내추럴호른 3화음 롱톤(4마디마다), L4 타보르(1·3박) | 장엄한 홀 — 밝고 개방적, 4레이어 전부 사용 |
| `bgm.frozen_keep` | Frozen Keep | 72.0s (18마디 × 4/4) | 64 BPM | A 에올리안 | L1 하프 하모닉스(2분음표, 옥타브 +1), L2 비올 저음 지속음(sul tasto 근사, 롱보우), L3 류트 단선율(4마디마다 1프레이즈), L4 프레임드럼(1박만, 감쇠 길게) | 음산한 겨울 성채 — 호른 제외(빈 공간감), 밀도 최저 |
| `bgm.volcanic_ruin` | Volcanic Ruin | 60.0s (20마디 × 3/4) | 96 BPM | E 프리지안 | L1 타보르+프레임드럼 복합 리듬(3/4 강-약-약), L2 비올 트레몰로 저음, L3 내추럴호른 단2도 부딪힘(E–F) 경고 모티프, L4 류트 저현 리프 | 위협적인 화산 요새 — 타악 주도, 하프 제외 |

**절차 합성 레시피(악기 근사, 전부 `OscillatorNode` + 필터 조합):**
- **류트:** 톱니파 → lowpass(cutoff 2200Hz, Q 0.7) → 앰프 엔벨로프 A=3ms/D=180ms/S=0.15/R=350ms. 현 6개를 6~14ms 스태거로 스트럼. 피치당 ±4 cents 디튠으로 복현(course) 느낌.
- **하프:** 삼각파 + 2배음 사인(진폭 0.3) → lowpass(cutoff 3500Hz) → A=1ms/D=900ms/S=0/R=900ms(긴 자연 감쇠, 서스테인 없음).
- **내추럴호른:** 사각파(듀티 0.5) → lowpass(cutoff 1400Hz, 어택 중 700→1600Hz 스윕) → A=60ms/D=250ms/S=0.55/R=500ms. **자연 배음(1,2,3,4,5,6,8배음)만 사용** — 반음계 진행 금지(밸브 없는 악기의 물리 제약을 지켜 시대감 유지).
- **비올:** 톱니파 2개(±7 cents) → bandpass(center 900Hz, Q 1.6) → A=120ms/D=200ms/S=0.7/R=400ms + LFO 4.5Hz depth ±6 cents(비브라토).
- **타보르/프레임드럼:** 사인 82Hz(피치 엔벨로프 130→82Hz, 40ms) + 밴드패스 노이즈(center 1800Hz, Q 2.0, 25ms) 레이어. A=1ms/D=120ms/S=0/R=180ms.

**재생 규칙:**
- 레이어별 독립 `GainNode`. 게임 상태에 따라 레이어를 켜고 끄는 **수직 리믹싱(vertical remixing)** 방식이며 곡을 교체하지 않는다(로딩·이음새 없음). 전환은 전부 1.5s `linearRampToValueAtTime`.
  - 메인메뉴/로비: L1+L2만(gain 1.0/0.8, L3/L4 = 0)
  - 대국 중 평시: L1+L2+L4 (L3 = 0)
  - 체크 상태 지속 중: L3을 gain 0.5로 페이드인
  - 매치포인트(Bo3에서 한쪽이 1.5점 이상): L3 gain 0.8 + 템포 유지(피치 시프트 금지 — 배속 재생은 악기 음색을 훼손하므로 기각)
- 루프 지점은 마디 경계이며 `AudioBufferSourceNode.loopStart/loopEnd`를 사용해 샘플 정확도로 이어붙인다(0 크로싱 보정 포함, 클릭 노이즈 방지).
- 테마 변경(D7 설정) 시: 현재 BGM을 0.8s로 페이드아웃 → 새 테마 BGM을 0.8s로 페이드인(교차 없음, 조성이 달라 겹치면 불협).
- 전투 연출 중 덕킹은 아래 §믹싱 규칙(-9dB)을 그대로 따른다.
- 기본 볼륨: `musicBus.gain = 0.6`(D7 설정의 "BGM 볼륨" 기본값 60과 일치).
- 생성 비용: 3개 테마 BGM을 전부 사전 렌더하면 44.1kHz 스테레오 float32 기준 약 (64+72+60)s × 44100 × 2 × 4B ≈ 69MB로 힙 예산(D9: 데스크톱 450MB / 모바일 250MB)에 부담이 크다. 따라서 **`OfflineAudioContext`로 현재 선택된 테마 1곡만 부팅 후 렌더**하고(모노 렌더 후 스테레오 확산 → 약 12MB), 나머지 테마는 전환 시점에 렌더한다. 렌더 소요는 데스크톱 기준 약 60~120ms(비차단, 렌더 완료 전에는 무음).

## 절차 합성 레시피 (대표 4종)

**돌 발소리 (`sfx.rook.stone_stomp`):** 노이즈 버퍼(화이트노이즈) → `BiquadFilterNode`(lowpass, cutoff 300Hz, Q 1.0) → 앰프 엔벨로프 A=2ms/D=40ms/S=0.1(유지 20ms)/R=80ms. 동시에 사인 오실레이터 60Hz(서브 임팩트감) A=1ms/D=30ms/S=0/R=60ms를 믹스.

**금속 임팩트 (`sfx.impact.metal`):** 삼각파 오실레이터 2개(880Hz, 1320Hz 비화성 배음으로 "쨍"함 연출) → `BiquadFilterNode`(bandpass, cutoff 1000Hz, Q 4.0) → 엔벨로프 A=1ms/D=15ms/S=0/R=250ms(긴 릴리즈로 금속 여운). 추가로 짧은 화이트노이즈 클릭(3ms)을 어택에 레이어.

**마법 반짝임 (`sfx.bishop.magic_shimmer`):** 사인 오실레이터 4개를 배음비(1x,1.5x,2x,3x, 기본 523Hz=C5) 병렬 배치 → 각 오실레이터에 LFO(주파수 5Hz, depth ±10Hz)로 비브라토 → 마스터 엔벨로프 A=50ms/D=100ms/S=0.4(유지 200ms)/R=400ms → `BiquadFilterNode`(highpass 200Hz)로 저역 제거해 영롱함 강조.

**체크메이트 스팅어 (`sfx.ui.checkmate_stinger`):** 내추럴호른 근사 — 사각파 오실레이터(220Hz) → lowpass 필터(cutoff 800Hz, envelope-modulated: 필터 컷오프가 A단계에서 400→1200Hz로 스윕) → 앰프 엔벨로프 A=20ms/D=200ms/S=0.6(유지 800ms)/R=600ms. 3화음(220/277/330Hz, A단조 근사)을 50ms 간격으로 스태거 재생해 팡파레감 연출.

## 어댑터 인터페이스 (샘플 교체 대비)

```ts
interface SoundSource {
  play(ctx: AudioContext, destination: AudioNode, opts?: { pitchCents?: number; positionSquare?: Square }): SoundHandle;
}
class SynthSoundSource implements SoundSource { /* 절차 합성 그래프 구성 */ }
class SampleSoundSource implements SoundSource { /* AudioBufferSourceNode로 .ogg/.webm 디코딩 재생 */ }

interface SoundRegistry {
  register(id: string, source: SoundSource): void;
  play(id: string, opts?: PlayOpts): SoundHandle;
}
```
런타임에 `SynthSoundSource` → `SampleSoundSource`로 큐 단위 교체 가능(`registry.register('sfx.ui.checkmate_stinger', new SampleSoundSource(buffer))`) — 호출부(`registry.play(id)`)는 변경 없음. UnitProvider(D4)와 동일한 어댑터 철학.

## 믹싱 규칙
- 동시 재생 보이스 상한: **32** (sfxBus 22 + uiBus 4 + ambienceBus 2 + musicBus 4 — musicBus 4는 위 BGM 레이어 L1~L4에 1:1 대응), 초과 시 **sfxBus에 한해** 가장 오래된 보이스 강제 종료(voice stealing). musicBus/ambienceBus 보이스는 절대 stealing 대상이 아니다(배경음이 끊기면 즉시 인지되므로).
- 동일 사운드 중첩 방지 쿨다운: **60ms** (같은 id가 60ms 내 재요청되면 무시).
- 피치 랜덤화: **±30 cents** (모든 절차 합성 SFX에 기본 적용, UI 스팅어류는 제외).
- BGM 덕킹: 전투 연출 시작 시 musicBus를 **-9dB**로 200ms에 걸쳐 감쇠, 연출 종료 후 600ms에 걸쳐 원복.

## 모바일 제약
- 자동재생 정책: `AudioContext`는 `suspended` 상태로 생성, 첫 `pointerdown`/`touchstart` 이벤트 핸들러(스플래시 화면의 "시작하기" 버튼 클릭 핸들러 내부)에서 `audioContext.resume()` 호출 — 이 한 지점에만 훅을 둔다(중복 방지).
- `document.visibilitychange`에서 `hidden`이면 `masterGain.gain`을 0으로, 복귀 시 이전 값으로 즉시 복원(컨텍스트 자체는 suspend하지 않아 재생 위치 드리프트 방지).
- iOS 무음 스위치: Web Audio API는 무음 스위치의 영향을 받지 않는 것이 사실이지만(미디어 재생과 다름), 일부 구형 iOS Safari 버전에서 예외 동작이 보고됨 — 설정 화면에 "무음 모드에서도 소리가 안 들리면 기기 무음 스위치를 확인하세요" 안내 문구를 둔다(코드로 해결 불가, UX 안내로 대응).

## ⚠️ Open Decisions (D8)

없음. 절차 합성 우선 전략과 샘플 교체 어댑터가 리스크를 충분히 낮추므로, 실제 트레이드오프가 큰 미결 항목은 없음.
