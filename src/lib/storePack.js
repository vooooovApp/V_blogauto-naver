const COMMERCE_API_DISABLED_REASON = [
  "공식 네이버 커머스(스마트스토어) 상품 등록 API는 이 저장소에 연결되어 있지 않습니다.",
  "판매자 애플리케이션 등록, OAuth 자격 증명, 카테고리/원산지/인증 스키마 매핑이 필요하며 v1에서 안전하게 추가할 수 없습니다.",
  "셀러센터 UI 자동 클릭, 스마트스토어 비밀번호 저장, 비공식 API는 사용하지 않습니다.",
  "복사용 팩을 복사한 뒤 셀러센터에서 수동 등록하고 '수동 등록 완료'를 체크하세요."
].join(" ");

function isOfficialCommerceApiConfigured(_settings = {}) {
  return false;
}

function commerceApiCapability(settings = {}) {
  const configured = isOfficialCommerceApiConfigured(settings);
  return {
    enabled: configured === true,
    buttonEnabled: configured === true,
    reason: configured
      ? "공식 커머스 API 설정이 확인되어 상품 등록을 시도할 수 있습니다."
      : COMMERCE_API_DISABLED_REASON
  };
}

async function registerProductViaOfficialApi() {
  const error = new Error(COMMERCE_API_DISABLED_REASON);
  error.code = "COMMERCE_API_UNAVAILABLE";
  throw error;
}

function buildStorePack(product = {}, drafts = {}, review = {}) {
  const notices = [
    drafts.overseasNotice || "",
    ...(Array.isArray(review.notes) ? review.notes : [])
  ].filter(Boolean);
  const pack = {
    name: String(drafts.title || product.title || "").trim(),
    categoryCandidate: String(drafts.categoryCandidate || product.categoryHint || "").trim(),
    tags: Array.isArray(drafts.tags) ? drafts.tags : [],
    detail: String(drafts.storeDetailHtml || "").trim(),
    detailText: String(drafts.storeDetailText || "").trim(),
    notices,
    priceCandidates: Array.isArray(product.priceCandidates) ? product.priceCandidates : [],
    imageUrls: Array.isArray(product.imageUrls) ? product.imageUrls : [],
    sourceUrl: String(product.url || "").trim(),
    copyAllowed: review.copyAllowed !== false,
    warnings: Array.isArray(review.warnings) ? review.warnings : []
  };
  pack.copyText = [
    `상품명: ${pack.name}`,
    `카테고리 후보: ${pack.categoryCandidate || "(직접 선택)"}`,
    `태그: ${pack.tags.join(", ")}`,
    `가격 후보: ${pack.priceCandidates.join(" / ") || "(없음)"}`,
    `원문 URL: ${pack.sourceUrl || "(없음)"}`,
    "",
    "=== 상세 HTML ===",
    pack.detail,
    "",
    "=== 고지/주의 ===",
    notices.join("\n")
  ].join("\n");
  return pack;
}

module.exports = {
  COMMERCE_API_DISABLED_REASON,
  isOfficialCommerceApiConfigured,
  commerceApiCapability,
  registerProductViaOfficialApi,
  buildStorePack
};
