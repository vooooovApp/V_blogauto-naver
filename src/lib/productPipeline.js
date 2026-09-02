const { collectProduct } = require("./productCollect");
const { writeProductDrafts } = require("./productWriter");
const { reviewProductDrafts } = require("./productReview");
const { buildStorePack, commerceApiCapability } = require("./storePack");

const PRODUCT_STATUSES = [
  "collect",
  "draft",
  "review",
  "blog-published",
  "store-pending",
  "store-done",
  "failed"
];

function createProductJobState(jobId, productUrl = "") {
  return {
    jobId,
    pipe: "product",
    productUrl,
    status: "collect",
    stages: {
      collect: "pending",
      draft: "pending",
      review: "pending",
      blogPublished: "pending",
      store: "pending"
    },
    reason: "",
    notes: [],
    collected: null,
    drafts: null,
    review: null,
    storePack: null,
    commerceApi: commerceApiCapability(),
    images: [],
    imageNotes: [],
    blogPublish: null
  };
}

function setProductStatus(state, status, reason = "") {
  const next = PRODUCT_STATUSES.includes(status) ? status : "failed";
  state.status = next;
  if (reason) state.reason = reason;
  if (next === "collect") state.stages.collect = "done";
  if (next === "draft") {
    state.stages.collect = "done";
    state.stages.draft = "done";
  }
  if (next === "review") {
    state.stages.collect = "done";
    state.stages.draft = "done";
    state.stages.review = "done";
  }
  if (next === "blog-published") {
    state.stages.collect = "done";
    state.stages.draft = "done";
    state.stages.review = "done";
    state.stages.blogPublished = "done";
    state.stages.store = state.stages.store === "done" ? "done" : "pending";
  }
  if (next === "store-pending") {
    state.stages.collect = "done";
    state.stages.draft = "done";
    state.stages.review = "done";
    state.stages.store = "pending";
  }
  if (next === "store-done") {
    state.stages.store = "done";
  }
  if (next === "failed") {
    const pendingKey = Object.keys(state.stages).find((key) => state.stages[key] === "pending");
    if (pendingKey) state.stages[pendingKey] = "failed";
  }
  return state;
}

async function runProductDraftPipeline({ url = "", manual = {}, category = "", publishPurpose = "", preferredTone = "", log = () => {} } = {}) {
  log("상품 URL 수집을 시작합니다.", "info", "collect");
  const collected = await collectProduct({ url, manual });
  if (!collected.ok) {
    const state = createProductJobState("", url);
    state.collected = collected;
    setProductStatus(state, "failed", collected.reason);
    return state;
  }
  for (const note of collected.notes || []) log(note, "warn", "collect");
  log(collected.reason, "info", "collect");

  const state = createProductJobState("", collected.extracted.url || url);
  state.collected = collected;
  setProductStatus(state, "collect", collected.reason);

  log("스토어 상세·블로그·티스토리 초안을 템플릿으로 작성합니다.", "info", "writer");
  const drafts = writeProductDrafts(collected.extracted, {
    category,
    publishPurpose,
    preferredTone
  });
  state.drafts = drafts;
  setProductStatus(state, "draft", "스토어 상세와 블로그/티스토리 초안을 만들었습니다.");
  log("상품 Writer 초안 작성 완료.", "info", "writer");

  log("기존 검수 규칙(제목·본문·태그)과 가품/브랜드 경고를 적용합니다.", "info", "review");
  const review = reviewProductDrafts(drafts, collected.extracted);
  state.review = review;
  if (review.status === "failed") {
    setProductStatus(state, "failed", review.writerIssue || "상품 초안 검수에 실패했습니다.");
    return state;
  }
  for (const warning of review.warnings) {
    log(warning.message, warning.level === "warning" ? "warn" : "info", "review");
  }
  setProductStatus(state, "review", review.warnings.length
    ? "검수 통과(경고 있음). 복사는 막지 않습니다."
    : "검수 통과. 복사는 막지 않습니다.");
  state.storePack = buildStorePack(collected.extracted, drafts, review);
  state.commerceApi = commerceApiCapability();
  return state;
}

function markStoreManualDone(state, checked = true) {
  if (!state) return state;
  if (checked) {
    setProductStatus(state, "store-done", "사용자가 스마트스토어 수동 등록을 완료했다고 표시했습니다.");
  } else {
    setProductStatus(state, "store-pending", "스마트스토어는 복사용 팩 + 수동 등록 대기입니다.");
  }
  return state;
}

function markBlogPublished(state, payload = {}) {
  if (!state) return state;
  state.blogPublish = payload;
  if (payload.ok) {
    setProductStatus(state, "blog-published", payload.reason || "블로그 발행을 완료했습니다.");
    if (state.stages.store !== "done") {
      setProductStatus(state, "store-pending", `${state.reason} 스마트스토어는 복사용 팩으로 수동 등록하세요.`);
    }
  } else {
    state.reason = payload.reason || "블로그 발행을 진행하지 못했습니다.";
    if (state.status !== "failed") {
      setProductStatus(state, "store-pending", state.reason);
    }
  }
  return state;
}

module.exports = {
  PRODUCT_STATUSES,
  createProductJobState,
  setProductStatus,
  runProductDraftPipeline,
  markStoreManualDone,
  markBlogPublished
};
