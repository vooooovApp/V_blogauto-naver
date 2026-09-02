# Blogauto Naver + Tistory

Codex 기반 Windows 데스크톱 자동화 콘솔입니다. Naver Blog 글 생성/발행을 기본 흐름으로 사용하고, Naver 발행이 성공하면 같은 제목, 본문, 이미지, 카테고리, 태그를 Tistory 블로그에도 이어서 발행할 수 있습니다.

## 주요 기능

- Naver 계정 여러 개와 계정별 카테고리 관리
- 카테고리별 키워드, 발행 목적, 검색 채널, 블로그 신뢰 설정 관리
- Research/Title Agent, Writer Agent, Main Review Agent, Image Worker 기반 글 생성
- 현재성/공식성/신뢰매체 근거 검증
- Naver 세션 확인, 수동 보안 확인 후 세션 재사용
- Tistory Kakao 로그인 세션 확인 및 재사용
- Naver 발행 성공 후 Tistory 동일 글 자동 발행
- Tistory-only 테스트 발행
- 공개, 비공개, 예약 발행 설정
- 제목 이미지와 본문 이미지 생성 및 업로드
- 태그 입력, 카테고리 매칭, 인용구 스타일 변환
- 상품 파이프: 공개 상품 URL → 수집 → 스토어 상세/블로그/티스토리 초안 → 검수 경고 → (선택) 기존 Naver/Tistory 발행 → 스마트스토어 복사용 팩

## 기본 흐름

1. 계정, 카테고리, 키워드, 발행 목적을 설정합니다.
2. 필요하면 세션 일괄 확인으로 Naver와 Tistory 로그인 상태를 확인합니다.
3. Research/Title Agent가 주제와 제목 후보를 고르고 검색 근거를 수집합니다.
4. Writer Agent가 본문과 태그, 이미지 프롬프트를 작성합니다.
5. Main Review Agent가 제목 일치, 근거 신뢰도, 본문 품질, 독자 가치, 현재성 기준을 검토합니다.
6. Image Worker가 이미지를 생성합니다.
7. Naver Blog에 글을 작성하고 발행합니다.
8. Tistory 발행 옵션이 켜져 있고 세션이 유효하면 같은 글을 Tistory에도 발행합니다.

상품 파이프는 위 Research→Writer 흐름 **옆**에 붙습니다. Research 키워드 검색을 쓰지 않고, 상품 URL 수집이 첫 단계입니다.

1. 작업 입력에서 `상품` 탭을 엽니다.
2. 공개 상품 URL 하나를 넣고 `URL 수집`을 실행합니다. 실패하면 제목/가격/설명/이미지 URL을 수동으로 붙여넣습니다.
3. `초안 만들기` 또는 `상품 작업 시작`으로 스마트스토어 상세 HTML, 네이버 블로그 초안, 티스토리 초안을 화면에 표시합니다. 상세에는 해외구매대행 고지 골격이 포함됩니다.
4. 가품·브랜드 토큰 경고가 있어도 복사는 막지 않습니다.
5. `생성 후 Naver 발행까지 진행`이 켜져 있으면 기존 Naver 발행 경로와 세션 정책을 재사용합니다. Tistory는 앱에 이미 있는 발행 경로를 재사용하고, 세션이 없으면 이유를 로그에 남긴 뒤 초안만 유지합니다.
6. 스마트스토어는 복사용 팩(상품명, 카테고리 후보, 태그, 상세, 고지)을 복사한 뒤 셀러센터에서 수동 등록하고 `스마트스토어 수동 등록 완료`를 체크합니다.

## 상품 파이프가 하지 않는 것

- 셀러센터 UI 자동 클릭, 매크로, 브라우저로 스마트스토어에 대신 등록
- 스마트스토어 비밀번호 저장
- 비공식/비문서화 커머스 API
- 로그인 벽 URL(1688/타오바오 로그인 페이지 등) 자동 수집. 공개 페이지만. 실패 시 수동 붙여넣기
- 상품 URL 대량/일괄 처리
- 구매대행 데스크·수수료·주문 게시판과의 코드 공유
- Research 키워드 레인에 상품 흐름을 섞는 것

## 스마트스토어 API 등록 버튼이 꺼진 이유

공식 네이버 커머스(스마트스토어) 상품 등록 API는 이 저장소에 연결되어 있지 않습니다. 판매자 애플리케이션 등록, OAuth 자격 증명, 카테고리/원산지/인증 스키마 매핑이 필요하며 v1에서 안전하게 추가할 수 없습니다. 따라서 `API 등록` 버튼은 비활성이고, 복사용 팩 + 수동 등록 완료 체크가 기본 종료 경로입니다. 나중에 공식 API를 연결할 때는 기존 settings/secret 패턴만 사용하고 키를 코드에 넣지 마세요.

## 검색과 근거 기준

정책, 채용, 지원금, 신청, 모집, 법률, 가격, 일정처럼 독자 행동에 직접 영향을 주는 글은 공식 또는 기관 근거를 우선합니다.

AI 업계동향, 기술 발표, 모델 출시, 반도체 시장 변화 같은 글은 Naver Blog 후보만으로 확정하지 않습니다. 공식 출처가 없더라도 독립 편집 매체 또는 신뢰 가능한 웹 근거가 함께 확인되어야 합니다. 블로그 후보는 주제 발견 단서로 사용할 수 있지만, 블로그만으로 발표형 글을 발행하지 않습니다.

## 실행

```bash
npm install
npm start
```

검사:

```bash
npm run check
```

빌드:

```bash
npm run dist
```

저장된 작업 실행:

```bash
npm run run:saved
```

최신 생성 결과 발행:

```bash
npm run publish:latest
```

## Tistory 테스트

앱 화면의 `Tistory 테스트 발행` 버튼을 사용하면 Naver 글 생성과 Naver 발행을 건너뛰고 Tistory 로그인, 본문 입력, 이미지 업로드, 카테고리 선택, 태그 입력, 최종 발행 흐름만 빠르게 테스트할 수 있습니다.

## 로컬 데이터와 계정정보

계정, 비밀번호, 세션, 브라우저 프로필, 작업 로그, 생성 이미지, 빌드 결과는 Git에 올리지 않습니다. 대표 제외 대상은 다음과 같습니다.

- `runtime/`
- `dist/`
- `node_modules/`
- `**/user-settings.json`
- `**/account-categories.json`
- `**/account-assets/`
- `**/browser-profile/`
- `**/browser-profiles/`
- `.env`, `.env.*`, `*.local`
- `.codex/`, `.agents/`

## 주요 파일

- `src/main.js`: Electron main process, 작업 흐름, 세션 확인, Naver/Tistory 발행 오케스트레이션
- `src/lib/codexRunner.js`: Research/Title, Writer, Main Review, Image Worker 실행과 프롬프트 구성
- `src/lib/search.js`: 검색 후보 수집, 공식/기관/독립 신뢰 근거 판정, source quality 요약
- `src/lib/naverPublisher.js`: Naver 로그인, 글쓰기 편집기, 이미지/카테고리/태그/발행 자동화
- `src/lib/tistoryPublisher.js`: Tistory Kakao 세션, TinyMCE 본문 입력, 이미지/카테고리/태그/발행 자동화
- `src/lib/accountStore.js`: 계정과 카테고리 저장 구조
- `src/lib/settings.js`: 앱 설정 기본값과 정규화
- `src/renderer/`: Electron renderer UI
- `src/lib/productCollect.js`: 공개 상품 URL 파서와 수동 붙여넣기 폴백
- `src/lib/productWriter.js`: 스토어 상세 HTML/블로그/티스토리 초안 템플릿
- `src/lib/productReview.js`: 기존 검수 규칙 재사용 + 가품/브랜드 경고(복사 차단 없음)
- `src/lib/productImages.js`: 상품 이미지 URL 다운로드/리사이즈
- `src/lib/storePack.js`: 스마트스토어 복사용 팩. 공식 API 미연결 시 등록 버튼 비활성
- `src/lib/productPipeline.js`: 수집→초안→검수→발행→스토어 대기/완료 상태
- `scripts/check.js`: 프로젝트 구조와 핵심 회귀 조건 검사
