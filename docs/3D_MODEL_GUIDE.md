# 3D 모델 및 애니메이션 개발 가이드 (토큰 최적화용)

이 문서는 3D 모델, 애니메이션, 연출 수정 시 AI 컨텍스트(토큰)를 최소화하고 필요한 파일만 정확히 타겟팅하기 위한 경량 명세서입니다.

---

## 1. 주요 핵심 파일 맵 (이 파일들만 선별 수정)

| 역할 | 대상 파일 | 설명 |
|------|-----------|------|
| **3D 모델 로딩 & 틴트** | packages/client/src/units/GLTFUnitProvider.ts | .glb 모델 비동기 로드, 본 네이밍 복원, 진영 틴트 적용 |
| **하이브리드 유닛 생성** | packages/client/src/units/HybridUnitProvider.ts | 3D 모델 우선 로드 + 절차적 생성 폴백 관리 |
| **유닛 보드 & 이동 제어** | packages/client/src/units/UnitBoard.ts | 보드 위 기물 이동 보간, 발판(pedestal) 제어, 워크 사이클 |
| **전투 연출 & 사운드** | packages/client/src/anim/CombatDirector.ts | 기물별 피니셔(Pawn, Knight, Bishop, Rook, Queen, King) 및 SFX 트리거 |
| **사운드 등록 및 재생** | packages/client/src/audio/SoundRegistry.ts | /sound/*.mp3 큐 정의 및 볼륨/버스 매핑 |
| **메인 진입점 및 에셋 등록** | packages/client/src/main.ts | SCULPTED_UNIT_ASSETS 목록에 .glb 경로 등록 |

---

## 2. 3D 모델 본(Bone) 네이밍 규칙

glTF 모델의 본 이름은 아래 매핑을 통해 런타임에 Three.js 표준 이름으로 자동 정규화됩니다:
* 	highL / 	highR $\rightarrow$ 	high.L / 	high.R
* kneeL / kneeR $\rightarrow$ knee.L / knee.R
* shoulderL / shoulderR $\rightarrow$ shoulder.L / shoulder.R
* elbowL / elbowR $\rightarrow$ elbow.L / elbow.R
* handL / handR $\rightarrow$ hand.L / hand.R

---

## 3. 기물별 전투 사운드 (SFX Cues)

* Pawn: sfx.combat.pawn (spear.mp3)
* Knight: sfx.combat.knight (knight.mp3)
* Bishop: sfx.combat.bishop (lightning.mp3)
* Rook: sfx.combat.rook (ook.mp3)
* Queen: sfx.combat.queen (lightning.mp3)
* King: sfx.combat.king (king.mp3)
