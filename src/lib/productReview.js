const BRAND_TOKENS = [
  "nike", "adidas", "gucci", "chanel", "louis vuitton", "lv", "hermes", "prada",
  "dior", "rolext", "rolex", "omega", "cartier", "balenciaga", "supreme",
  "apple", "samsung", "sony", "dyson", "starbucks",
  "나이키", "아디다스", "구찌", "샤넬", "루이비통", "에르메스", "프라다",
  "디올", "롤렉스", "오메가", "까르띠에", "발렌시아가", "슈프림",
  "애플", "삼성", "소니", "다이슨"
];

const COUNTERFEIT_TOKENS = [
  "가품", "레플리카", "레플", "이미테이션", "이미테이숀", "이미테이션급",
  "미러급", "1:1", "1:1제작", "aaa급", "초특가레플",
  "replica", "counterfeit", "fake", "knockoff"
];

function compactList(values) {
  return (Array.isArray(values) ? values : [])
    .map((item) => String(item || "").replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function reviewText(drafts = {}, product = {}) {
  return [
    drafts.title,
    drafts.article,
    drafts.tistoryArticle,
    drafts.storeDetailText,
    drafts.storeDetailHtml,
    product.title,
    product.description,
    ...(Array.isArray(drafts.tags) ? drafts.tags : [])
  ].filter(Boolean).join("\n");
}

function findTokens(text, tokens) {
  const haystack = String(text || "");
  const lower = haystack.toLowerCase();
  const found = [];
  for (const token of tokens) {
    const needle = String(token || "").trim();
    if (!needle) continue;
    const matched = /[A-Za-z]/.test(needle)
      ? lower.includes(needle.toLowerCase())
      : haystack.includes(needle);
    if (matched && !found.includes(needle)) found.push(needle);
  }
  return found;
}

function writerLikeIssueReason(drafts = {}) {
  if (!String(drafts.title || "").trim()) return "상품 Writer가 제목을 비워 반환했습니다.";
  if (!String(drafts.article || "").trim()) return "상품 Writer가 블로그 본문(article)을 비워 반환했습니다.";
  if (!Array.isArray(drafts.tags) || drafts.tags.filter(Boolean).length === 0) {
    return "상품 Writer가 태그(tags)를 반환하지 않았습니다.";
  }
  if (!String(drafts.storeDetailHtml || "").trim()) {
    return "스마트스토어 상세 HTML 초안이 비어 있습니다.";
  }
  return "";
}

function reviewProductDrafts(drafts = {}, product = {}) {
  const text = reviewText(drafts, product);
  const brandTokens = findTokens(text, BRAND_TOKENS);
  const counterfeitTokens = findTokens(text, COUNTERFEIT_TOKENS);
  const writerIssue = writerLikeIssueReason(drafts);
  const warnings = [];
  if (brandTokens.length) {
    warnings.push({
      code: "brand_token",
      level: "warning",
      blocksCopy: false,
      message: `브랜드 토큰이 감지되었습니다: ${brandTokens.join(", ")}. 정품/병행수입/상표 정책을 확인하세요. 복사는 막지 않습니다.`
    });
  }
  if (counterfeitTokens.length) {
    warnings.push({
      code: "counterfeit_token",
      level: "warning",
      blocksCopy: false,
      message: `가품·레플리카 토큰이 감지되었습니다: ${counterfeitTokens.join(", ")}. 등록/발행 전 판매 가능 여부를 확인하세요. 복사는 막지 않습니다.`
    });
  }
  if (!String(product.description || "").trim()) {
    warnings.push({
      code: "thin_description",
      level: "info",
      blocksCopy: false,
      message: "상품 설명이 짧습니다. 스토어 상세와 블로그 초안을 사람이 보강하세요."
    });
  }
  const blocking = Boolean(writerIssue);
  return {
    status: blocking ? "failed" : "review",
    verdict: blocking ? "REVISION" : (warnings.length ? "PASS_WITH_WARNING" : "PASS"),
    publishable: !blocking,
    copyAllowed: true,
    writerIssue,
    warnings,
    brandTokens,
    counterfeitTokens,
    titleReviewPass: Boolean(String(drafts.title || "").trim()),
    bodyQualityPass: Boolean(String(drafts.article || "").trim()),
    riskExpressionPass: counterfeitTokens.length === 0,
    notes: compactList([
      writerIssue,
      ...warnings.map((item) => item.message)
    ])
  };
}

module.exports = {
  reviewProductDrafts,
  writerLikeIssueReason,
  findTokens,
  BRAND_TOKENS,
  COUNTERFEIT_TOKENS
};
