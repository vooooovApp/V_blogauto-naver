function compactText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function firstPrice(product = {}) {
  const candidates = Array.isArray(product.priceCandidates) ? product.priceCandidates : [];
  return compactText(candidates[0] || "");
}

function productTags(product = {}, extra = []) {
  const raw = [
    product.title,
    product.categoryHint,
    firstPrice(product) && "가격정보",
    "구매대행",
    "해외구매대행",
    "상품후기",
    ...(Array.isArray(extra) ? extra : [])
  ]
    .flatMap((item) => String(item || "").split(/[,\n#/|]+/))
    .map((item) => item.replace(/[^\p{L}\p{N}]/gu, "").trim())
    .filter((item) => item.length >= 2 && item.length <= 20);
  return [...new Set(raw)].slice(0, 12);
}

function categoryCandidate(product = {}, fallback = "") {
  const hint = compactText(product.categoryHint || fallback);
  if (hint) return hint;
  const title = compactText(product.title);
  if (/이어폰|헤드폰|스피커|충전|케이블|스마트워치/i.test(title)) return "디지털/가전";
  if (/가방|지갑|신발|의류|패션|모자/i.test(title)) return "패션잡화";
  if (/화장품|스킨|세럼|크림|마스크/i.test(title)) return "뷰티";
  if (/주방|생활|정리|수납|청소/i.test(title)) return "생활/주방";
  return "기타";
}

function overseasPurchaseNoticeSkeleton(product = {}) {
  const title = compactText(product.title) || "해당 상품";
  return [
    "[해외구매대행 고지]",
    `${title}은(는) 판매자가 해외 판매처에서 구매를 대행하는 상품일 수 있습니다.`,
    "실제 재고 위치, 통관, 관세/부가세, 배송 기간, 교환·반품 조건은 판매자 고지와 세관 규정에 따릅니다.",
    "개인통관고유부호가 필요할 수 있으며, 품목별 인증·수입 제한 여부를 구매 전 확인하세요.",
    "아래 항목은 골격입니다. 판매자가 실제 내용으로 채워 스마트스토어에 등록하세요.",
    "- 판매자/구매대행자:",
    "- 해외 판매처/원산지:",
    "- 예상 배송 기간:",
    "- 관세·부가세 부담:",
    "- 교환/반품/AS:",
    "- 주의사항:"
  ].join("\n");
}

function storeDetailBlocks(product = {}) {
  const title = compactText(product.title) || "상품명 미입력";
  const price = firstPrice(product) || "가격 확인 필요";
  const description = compactText(product.description) || "상품 설명이 비어 있습니다. 판매자가 스펙과 구성품을 보강하세요.";
  const images = Array.isArray(product.imageUrls) ? product.imageUrls.slice(0, 8) : [];
  const notice = overseasPurchaseNoticeSkeleton(product);
  return {
    title,
    price,
    description,
    images,
    notice,
    categoryCandidate: categoryCandidate(product)
  };
}

function buildStoreDetailHtml(product = {}) {
  const blocks = storeDetailBlocks(product);
  const imageHtml = blocks.images.length
    ? blocks.images.map((url) => `  <p><img src="${escapeHtml(url)}" alt="${escapeHtml(blocks.title)}" /></p>`).join("\n")
    : "  <p>(상품 이미지 URL을 붙여넣으세요)</p>";
  return [
    `<article class="smartstore-detail-draft">`,
    `  <h2>${escapeHtml(blocks.title)}</h2>`,
    `  <p class="price">가격 후보: ${escapeHtml(blocks.price)}</p>`,
    `  <section class="product-images">`,
    imageHtml,
    `  </section>`,
    `  <section class="product-description">`,
    `    <h3>상품 설명</h3>`,
    `    <p>${escapeHtml(blocks.description)}</p>`,
    `  </section>`,
    `  <section class="overseas-purchase-notice">`,
    `    <h3>해외구매대행 고지</h3>`,
    `    <pre>${escapeHtml(blocks.notice)}</pre>`,
    `  </section>`,
    `</article>`
  ].join("\n");
}

function buildStoreDetailText(product = {}) {
  const blocks = storeDetailBlocks(product);
  return [
    `[상품명] ${blocks.title}`,
    `[카테고리 후보] ${blocks.categoryCandidate}`,
    `[가격 후보] ${blocks.price}`,
    `[설명] ${blocks.description}`,
    "",
    blocks.notice
  ].join("\n");
}

function buildBlogArticle(product = {}, options = {}) {
  const blocks = storeDetailBlocks(product);
  const sourceUrl = compactText(product.url);
  const tone = compactText(options.preferredTone);
  const purpose = compactText(options.publishPurpose);
  return [
    `[SECTION - 상품 한눈에]`,
    `${blocks.title} 정보를 공개 페이지와 입력값을 기준으로 정리했습니다.`,
    purpose ? `이 글의 발행 목적: ${purpose}` : "구성, 가격 후보, 구매 전 확인할 점을 짧게 정리합니다.",
    tone ? `톤 참고: ${tone}` : "",
    "",
    `[IMAGE INSERT - 1]`,
    "",
    `[SECTION - 가격과 구성]`,
    `가격 후보: ${blocks.price}`,
    blocks.description,
    sourceUrl ? `원문 공개 페이지: ${sourceUrl}` : "원문 URL이 없으면 판매자가 출처를 직접 확인하세요.",
    "",
    `[SECTION - 구매 전 확인]`,
    "해외구매대행이라면 통관, 배송 기간, 교환·반품, 정품/병행수입 여부를 판매자 고지로 다시 확인하세요.",
    "브랜드 표기나 정품 암시가 있으면 판매자 증빙과 정책을 우선하세요. 이 글은 자동 초안입니다."
  ].filter((line, index, lines) => line !== "" || lines[index - 1] !== "").join("\n").trim();
}

function buildTistoryArticle(product = {}, options = {}) {
  const blog = buildBlogArticle(product, options);
  return [
    blog,
    "",
    "[SECTION - 티스토리 메모]",
    "네이버 블로그 초안과 같은 본문을 티스토리용으로 유지합니다. 발행 전 카테고리와 태그, 이미지 위치를 확인하세요."
  ].join("\n");
}

function buildBlogTitle(product = {}) {
  const title = compactText(product.title) || "상품 소개";
  const price = firstPrice(product);
  if (price && title.length < 36) return `${title} 살펴보기 (${price})`;
  return `${title} 살펴보기`;
}

function writeProductDrafts(product = {}, options = {}) {
  const title = buildBlogTitle(product);
  const article = buildBlogArticle(product, options);
  const tistoryArticle = buildTistoryArticle(product, options);
  const storeDetailHtml = buildStoreDetailHtml(product);
  const storeDetailText = buildStoreDetailText(product);
  const tags = productTags(product, options.extraTags);
  return {
    status: "draft",
    title,
    article,
    tistoryTitle: title,
    tistoryArticle,
    tags,
    storeDetailHtml,
    storeDetailText,
    categoryCandidate: categoryCandidate(product, options.category),
    overseasNotice: overseasPurchaseNoticeSkeleton(product)
  };
}

module.exports = {
  writeProductDrafts,
  buildStoreDetailHtml,
  buildStoreDetailText,
  buildBlogArticle,
  buildTistoryArticle,
  buildBlogTitle,
  overseasPurchaseNoticeSkeleton,
  productTags,
  categoryCandidate
};
