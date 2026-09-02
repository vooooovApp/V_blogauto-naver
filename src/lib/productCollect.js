const http = require("node:http");
const https = require("node:https");
const { URL } = require("node:url");

const MAX_RESPONSE_CHARS = 1_200_000;
const FETCH_TIMEOUT_MS = 15000;

const LOGIN_WALL_HOST_HINTS = [
  /login\./i,
  /passport\./i,
  /signin\./i,
  /member\.1688\.com/i,
  /login\.taobao\.com/i,
  /login\.tmall\.com/i
];

const LOGIN_WALL_PAGE_HINTS = [
  /로그인\s*(이|이\s*)?필요/i,
  /로그인\s*후\s*이용/i,
  /please\s+(sign|log)\s+in/i,
  /sign\s+in\s+to\s+continue/i,
  /登录后|請先登入|请先登录/i
];

const LOGIN_WALL_MARKET_HOSTS = [
  /(^|\.)1688\.com$/i,
  /(^|\.)taobao\.com$/i,
  /(^|\.)tmall\.com$/i
];

function decodeEntities(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_match, num) => String.fromCharCode(parseInt(num, 10)));
}

function stripTags(value) {
  return decodeEntities(value)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeUrl(value, baseUrl = "") {
  const text = String(value || "").trim();
  if (!text || text.startsWith("data:") || text.startsWith("javascript:")) return "";
  try {
    return new URL(text, baseUrl || undefined).toString();
  } catch {
    return "";
  }
}

function hostFromUrl(value) {
  try {
    return new URL(String(value || "")).hostname || "";
  } catch {
    return "";
  }
}

function isHttpUrl(value) {
  return /^https?:\/\//i.test(String(value || "").trim());
}

function looksLikeLoginWallUrl(url) {
  const normalized = String(url || "").trim();
  if (!normalized) return false;
  let parsed;
  try {
    parsed = new URL(normalized);
  } catch {
    return false;
  }
  const host = parsed.hostname || "";
  const href = parsed.href;
  if (LOGIN_WALL_HOST_HINTS.some((pattern) => pattern.test(host) || pattern.test(href))) {
    return true;
  }
  if (/(?:^|[?&#/])(?:login|signin|passport)(?:[=&#/]|$)/i.test(href) && LOGIN_WALL_MARKET_HOSTS.some((pattern) => pattern.test(host))) {
    return true;
  }
  return false;
}

function looksLikeLoginWallHtml(html, url = "") {
  const text = stripTags(html).slice(0, 4000);
  if (LOGIN_WALL_PAGE_HINTS.some((pattern) => pattern.test(text))) return true;
  const host = hostFromUrl(url);
  if (LOGIN_WALL_MARKET_HOSTS.some((pattern) => pattern.test(host))) {
    if (/password|passwd|sms.?code|captcha/i.test(html) && /login|signin|passport/i.test(html)) {
      return true;
    }
  }
  return false;
}

function uniqueStrings(values, limit = 20) {
  const seen = new Set();
  const result = [];
  for (const value of Array.isArray(values) ? values : []) {
    const text = String(value || "").replace(/\s+/g, " ").trim();
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(text);
    if (result.length >= limit) break;
  }
  return result;
}

function metaContent(html, names) {
  for (const name of names) {
    const propertyPattern = new RegExp(
      `<meta[^>]+(?:property|name)=["']${name}["'][^>]+content=["']([^"']+)["'][^>]*>`,
      "i"
    );
    const contentFirst = new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${name}["'][^>]*>`,
      "i"
    );
    const match = html.match(propertyPattern) || html.match(contentFirst);
    if (match?.[1]) return decodeEntities(match[1]).trim();
  }
  return "";
}

function extractTitle(html) {
  return metaContent(html, ["og:title", "twitter:title"])
    || stripTags((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1] || "")
    || stripTags((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "");
}

function extractDescription(html) {
  const meta = metaContent(html, ["og:description", "twitter:description", "description"]);
  if (meta) return meta;
  const paragraphs = [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((match) => stripTags(match[1]))
    .filter((text) => text.length >= 40);
  return paragraphs[0] || "";
}

function extractJsonLdBlocks(html) {
  return [...String(html || "").matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => {
      try {
        return JSON.parse(match[1]);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function walkJsonLd(value, visit) {
  if (!value) return;
  if (Array.isArray(value)) {
    for (const item of value) walkJsonLd(item, visit);
    return;
  }
  if (typeof value === "object") {
    visit(value);
    for (const child of Object.values(value)) walkJsonLd(child, visit);
  }
}

function flattenJsonLdProducts(blocks) {
  const products = [];
  for (const block of blocks) {
    walkJsonLd(block, (node) => {
      const types = []
        .concat(node["@type"] || [])
        .map((item) => String(item || "").toLowerCase());
      if (types.some((type) => ["product", "offer"].includes(type))) {
        products.push(node);
      }
    });
  }
  return products;
}

function priceFromOffer(offer) {
  if (!offer || typeof offer !== "object") return "";
  const amount = offer.price || offer.lowPrice || offer.highPrice || offer.priceSpecification?.price;
  const currency = offer.priceCurrency || offer.priceSpecification?.priceCurrency || "";
  if (amount == null || amount === "") return "";
  return [currency, amount].filter(Boolean).join(" ").trim();
}

function extractJsonLdFields(html) {
  const products = flattenJsonLdProducts(extractJsonLdBlocks(html));
  const titles = [];
  const descriptions = [];
  const prices = [];
  const images = [];
  for (const node of products) {
    if (node.name) titles.push(node.name);
    if (node.description) descriptions.push(stripTags(node.description));
    const offers = Array.isArray(node.offers) ? node.offers : node.offers ? [node.offers] : [node];
    for (const offer of offers) {
      const price = priceFromOffer(offer);
      if (price) prices.push(price);
    }
    const imageValues = Array.isArray(node.image) ? node.image : node.image ? [node.image] : [];
    for (const image of imageValues) {
      if (typeof image === "string") images.push(image);
      else if (image?.url) images.push(image.url);
    }
  }
  return {
    title: titles.find(Boolean) || "",
    description: descriptions.find(Boolean) || "",
    prices,
    images
  };
}

function extractPriceCandidates(html, jsonLdPrices = []) {
  const candidates = [...jsonLdPrices];
  const metaPrice = metaContent(html, ["product:price:amount", "og:price:amount"]);
  const metaCurrency = metaContent(html, ["product:price:currency", "og:price:currency"]);
  if (metaPrice) candidates.push([metaCurrency, metaPrice].filter(Boolean).join(" "));
  const itemprop = [...html.matchAll(/itemprop=["']price["'][^>]*content=["']([^"']+)["']/gi)]
    .map((match) => decodeEntities(match[1]));
  candidates.push(...itemprop);
  const visible = stripTags(html).match(/(?:₩|KRW|USD|\$|€|¥|원)\s*[\d.,]+|[\d.,]+\s*(?:원|KRW|USD|₩)/gi) || [];
  candidates.push(...visible.slice(0, 8));
  return uniqueStrings(candidates, 12);
}

function extractImageUrls(html, baseUrl, jsonLdImages = []) {
  const raw = [
    ...jsonLdImages,
    metaContent(html, ["og:image", "og:image:url", "twitter:image", "twitter:image:src"]),
    ...[...html.matchAll(/<img[^>]+(?:src|data-src|data-original)=["']([^"']+)["'][^>]*>/gi)].map((match) => match[1])
  ];
  return uniqueStrings(
    raw
      .map((item) => normalizeUrl(item, baseUrl))
      .filter((url) => isHttpUrl(url))
      .filter((url) => !/\.(svg)(?:$|\?)/i.test(url))
      .filter((url) => !/sprite|icon|logo|pixel|1x1|blank/i.test(url)),
    12
  );
}

function fetchPublicHtml(url) {
  return new Promise((resolve, reject) => {
    const client = /^http:\/\//i.test(url) ? http : https;
    const request = client.get(url, {
      headers: {
        "user-agent": "Mozilla/5.0 BlogautoProductCollect/0.1",
        accept: "text/html,application/xhtml+xml",
        "accept-language": "ko-KR,ko;q=0.9,en;q=0.7"
      },
      timeout: FETCH_TIMEOUT_MS
    }, (response) => {
      const status = Number(response.statusCode || 0);
      if (status >= 300 && status < 400 && response.headers.location) {
        fetchPublicHtml(new URL(response.headers.location, url).toString()).then(resolve, reject);
        return;
      }
      if (status === 401 || status === 403) {
        reject(Object.assign(new Error("공개 페이지가 아니거나 로그인 벽이 감지되었습니다."), {
          code: "LOGIN_WALL",
          status
        }));
        return;
      }
      if (status >= 400) {
        reject(Object.assign(new Error(`상품 페이지를 가져오지 못했습니다 (HTTP ${status}).`), {
          code: "FETCH_FAILED",
          status
        }));
        return;
      }
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
        if (body.length > MAX_RESPONSE_CHARS) {
          request.destroy(new Error("상품 페이지가 너무 커서 일부만 읽지 않고 중단합니다."));
        }
      });
      response.on("end", () => resolve({ html: body, finalUrl: url, status }));
    });
    request.on("timeout", () => request.destroy(new Error("상품 페이지 요청 시간이 초과되었습니다.")));
    request.on("error", reject);
  });
}

function parseProductHtml(html, url = "") {
  const jsonLd = extractJsonLdFields(html);
  const title = jsonLd.title || extractTitle(html);
  const description = jsonLd.description || extractDescription(html);
  const priceCandidates = extractPriceCandidates(html, jsonLd.prices);
  const imageUrls = extractImageUrls(html, url, jsonLd.images);
  const loginWall = looksLikeLoginWallUrl(url) || looksLikeLoginWallHtml(html, url);
  return {
    url,
    title: String(title || "").replace(/\s+/g, " ").trim(),
    description: String(description || "").replace(/\s+/g, " ").trim(),
    priceCandidates,
    imageUrls,
    loginWall,
    source: loginWall ? "login_wall" : "public_html"
  };
}

function extractQuality(extracted = {}) {
  const hasTitle = Boolean(String(extracted.title || "").trim());
  const hasPrice = Array.isArray(extracted.priceCandidates) && extracted.priceCandidates.length > 0;
  const hasImage = Array.isArray(extracted.imageUrls) && extracted.imageUrls.length > 0;
  const hasDescription = String(extracted.description || "").trim().length >= 12;
  return {
    hasTitle,
    hasPrice,
    hasImage,
    hasDescription,
    score: [hasTitle, hasPrice, hasImage, hasDescription].filter(Boolean).length
  };
}

function normalizeManualProduct(manual = {}) {
  const imageUrls = uniqueStrings(
    Array.isArray(manual.imageUrls)
      ? manual.imageUrls
      : String(manual.imageUrls || manual.images || "").split(/[\n,]+/),
    12
  ).filter((item) => isHttpUrl(item) || /^https?:\/\//i.test(item));
  const priceCandidates = uniqueStrings(
    Array.isArray(manual.priceCandidates)
      ? manual.priceCandidates
      : String(manual.price || manual.priceCandidates || "").split(/[\n,]+/),
    8
  );
  return {
    title: String(manual.title || "").replace(/\s+/g, " ").trim(),
    description: String(manual.description || "").replace(/\s+/g, " ").trim(),
    priceCandidates,
    imageUrls,
    categoryHint: String(manual.categoryHint || manual.category || "").trim()
  };
}

function mergeProductExtract(extracted = {}, manual = {}) {
  const fallback = normalizeManualProduct(manual);
  const title = extracted.title || fallback.title;
  const description = extracted.description || fallback.description;
  const priceCandidates = uniqueStrings([
    ...(extracted.priceCandidates || []),
    ...fallback.priceCandidates
  ], 12);
  const imageUrls = uniqueStrings([
    ...(extracted.imageUrls || []),
    ...fallback.imageUrls
  ], 12);
  const usedManual = Boolean(
    (!extracted.title && fallback.title)
    || (!extracted.description && fallback.description)
    || (!(extracted.priceCandidates || []).length && fallback.priceCandidates.length)
    || (!(extracted.imageUrls || []).length && fallback.imageUrls.length)
  );
  return {
    url: extracted.url || String(manual.url || "").trim(),
    title,
    description,
    priceCandidates,
    imageUrls,
    categoryHint: fallback.categoryHint || "",
    loginWall: extracted.loginWall === true,
    source: usedManual && extracted.source && extracted.source !== "manual" ? `${extracted.source}+manual` : (usedManual ? "manual" : extracted.source || "manual"),
    usedManualFallback: usedManual
  };
}

async function collectProduct({ url = "", manual = {}, allowLoginWall = false } = {}) {
  const productUrl = String(url || manual.url || "").trim();
  const fallback = normalizeManualProduct({ ...manual, url: productUrl });
  const notes = [];

  if (productUrl && !isHttpUrl(productUrl)) {
    return {
      ok: false,
      status: "failed",
      reason: "상품 URL은 http(s) 공개 페이지만 지원합니다.",
      extracted: mergeProductExtract({ url: productUrl, title: "", description: "", priceCandidates: [], imageUrls: [], loginWall: false, source: "" }, fallback),
      needsManual: true,
      notes
    };
  }

  if (productUrl && looksLikeLoginWallUrl(productUrl) && !allowLoginWall) {
    notes.push("로그인 벽 URL로 보여 자동 수집을 건너뛰었습니다. 공개 페이지이거나 수동 붙여넣기를 사용하세요.");
    const extracted = mergeProductExtract({
      url: productUrl,
      title: "",
      description: "",
      priceCandidates: [],
      imageUrls: [],
      loginWall: true,
      source: "login_wall"
    }, fallback);
    const quality = extractQuality(extracted);
    return {
      ok: quality.score > 0,
      status: quality.score > 0 ? "collect" : "failed",
      reason: quality.score > 0
        ? "로그인 벽 URL이라 수동 붙여넣기 값을 사용했습니다."
        : "로그인 벽 URL은 v1에서 자동 수집하지 않습니다. 제목/가격/설명/이미지 URL을 수동으로 붙여넣으세요.",
      extracted,
      needsManual: quality.score === 0,
      notes
    };
  }

  if (!productUrl) {
    const extracted = mergeProductExtract({
      url: "",
      title: "",
      description: "",
      priceCandidates: [],
      imageUrls: [],
      loginWall: false,
      source: ""
    }, fallback);
    const quality = extractQuality(extracted);
    return {
      ok: quality.hasTitle,
      status: quality.hasTitle ? "collect" : "failed",
      reason: quality.hasTitle
        ? "URL 없이 수동 붙여넣기 값으로 수집했습니다."
        : "상품 URL 또는 수동 제목이 필요합니다.",
      extracted,
      needsManual: !quality.hasTitle,
      notes
    };
  }

  try {
    const fetched = await fetchPublicHtml(productUrl);
    if (looksLikeLoginWallHtml(fetched.html, fetched.finalUrl || productUrl) && !allowLoginWall) {
      notes.push("페이지 HTML이 로그인 벽으로 보여 자동 추출을 신뢰하지 않습니다.");
      const extracted = mergeProductExtract({
        url: fetched.finalUrl || productUrl,
        title: "",
        description: "",
        priceCandidates: [],
        imageUrls: [],
        loginWall: true,
        source: "login_wall"
      }, fallback);
      const quality = extractQuality(extracted);
      return {
        ok: quality.score > 0,
        status: quality.score > 0 ? "collect" : "failed",
        reason: quality.score > 0
          ? "로그인 벽 페이지라 수동 붙여넣기 값을 사용했습니다."
          : "로그인 없이 열리지 않는 페이지입니다. 수동 붙여넣기를 사용하세요.",
        extracted,
        needsManual: quality.score === 0,
        notes
      };
    }
    const parsed = parseProductHtml(fetched.html, fetched.finalUrl || productUrl);
    const extracted = mergeProductExtract(parsed, fallback);
    const quality = extractQuality(extracted);
    if (!quality.hasTitle) {
      notes.push("공개 페이지에서 제목을 찾지 못했습니다. 수동 붙여넣기를 사용하세요.");
      return {
        ok: false,
        status: "failed",
        reason: "공개 페이지에서 상품 제목을 추출하지 못했습니다.",
        extracted,
        needsManual: true,
        notes
      };
    }
    if (quality.score < 2) {
      notes.push("추출 정보가 부족합니다. 가격/설명/이미지 URL을 수동으로 보완할 수 있습니다.");
    }
    return {
      ok: true,
      status: "collect",
      reason: extracted.usedManualFallback
        ? "공개 페이지 추출과 수동 붙여넣기를 합쳤습니다."
        : "공개 페이지에서 상품 정보를 추출했습니다.",
      extracted,
      needsManual: false,
      notes
    };
  } catch (error) {
    const loginWall = error.code === "LOGIN_WALL";
    notes.push(error.message);
    const extracted = mergeProductExtract({
      url: productUrl,
      title: "",
      description: "",
      priceCandidates: [],
      imageUrls: [],
      loginWall,
      source: loginWall ? "login_wall" : "fetch_failed"
    }, fallback);
    const quality = extractQuality(extracted);
    return {
      ok: quality.hasTitle,
      status: quality.hasTitle ? "collect" : "failed",
      reason: quality.hasTitle
        ? `자동 수집 실패 후 수동 붙여넣기를 사용했습니다: ${error.message}`
        : (loginWall
          ? "로그인 벽이 감지되어 자동 수집을 중단했습니다. 수동 붙여넣기를 사용하세요."
          : `공개 페이지 수집에 실패했습니다: ${error.message}`),
      extracted,
      needsManual: !quality.hasTitle,
      notes
    };
  }
}

module.exports = {
  collectProduct,
  parseProductHtml,
  mergeProductExtract,
  normalizeManualProduct,
  extractQuality,
  looksLikeLoginWallUrl,
  looksLikeLoginWallHtml,
  _private: {
    extractJsonLdFields,
    extractPriceCandidates,
    extractImageUrls,
    decodeEntities,
    stripTags
  }
};
