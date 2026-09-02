const fs = require("node:fs");
const http = require("node:http");
const https = require("node:https");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const MAX_IMAGE_BYTES = 8_000_000;
const MAX_IMAGES = 6;

function extensionFrom(url, contentType = "") {
  const type = String(contentType || "").toLowerCase();
  if (type.includes("png")) return ".png";
  if (type.includes("webp")) return ".webp";
  if (type.includes("jpeg") || type.includes("jpg")) return ".jpg";
  const fromUrl = String(url || "").split("?")[0].match(/\.(png|jpe?g|webp)$/i);
  if (fromUrl) return fromUrl[0].toLowerCase().replace(".jpeg", ".jpg");
  return ".jpg";
}

function downloadBuffer(url) {
  return new Promise((resolve, reject) => {
    const client = /^http:\/\//i.test(url) ? http : https;
    const request = client.get(url, {
      headers: {
        "user-agent": "Mozilla/5.0 BlogautoProductCollect/0.1",
        accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8"
      },
      timeout: 12000
    }, (response) => {
      const status = Number(response.statusCode || 0);
      if (status >= 300 && status < 400 && response.headers.location) {
        downloadBuffer(new URL(response.headers.location, url).toString()).then(resolve, reject);
        return;
      }
      if (status >= 400) {
        reject(new Error(`이미지 다운로드 실패 (HTTP ${status})`));
        return;
      }
      const chunks = [];
      let size = 0;
      response.on("data", (chunk) => {
        size += chunk.length;
        if (size > MAX_IMAGE_BYTES) {
          request.destroy(new Error("이미지가 너무 커서 건너뜁니다."));
          return;
        }
        chunks.push(chunk);
      });
      response.on("end", () => resolve({
        buffer: Buffer.concat(chunks),
        contentType: response.headers["content-type"] || ""
      }));
    });
    request.on("timeout", () => request.destroy(new Error("이미지 요청 시간이 초과되었습니다.")));
    request.on("error", reject);
  });
}

function maybeResizePng(buffer, maxWidth = 1200) {
  try {
    const { nativeImage } = require("electron");
    if (!nativeImage?.createFromBuffer) return buffer;
    const image = nativeImage.createFromBuffer(buffer);
    const size = image.getSize();
    if (!size.width || size.width <= maxWidth) return image.toPNG();
    return image.resize({ width: maxWidth, quality: "best" }).toPNG();
  } catch {
    return buffer;
  }
}

async function downloadProductImages({ imageUrls = [], jobDir, maxImages = MAX_IMAGES, resize = true } = {}) {
  const dir = path.join(jobDir, "product-images");
  fs.mkdirSync(dir, { recursive: true });
  const notes = [];
  const images = [];
  const urls = (Array.isArray(imageUrls) ? imageUrls : []).filter((url) => /^https?:\/\//i.test(url)).slice(0, maxImages);
  for (const [index, url] of urls.entries()) {
    try {
      const downloaded = await downloadBuffer(url);
      const ext = resize ? ".png" : extensionFrom(url, downloaded.contentType);
      const filePath = path.join(dir, `product_${index + 1}${ext}`);
      const output = resize ? maybeResizePng(downloaded.buffer) : downloaded.buffer;
      fs.writeFileSync(filePath, output);
      images.push({
        role: index === 0 ? "title" : "body",
        sequence: index === 0 ? "title" : index,
        path: filePath,
        url: pathToFileURL(filePath).toString(),
        sourceUrl: url
      });
    } catch (error) {
      notes.push(`상품 이미지 다운로드 실패 (${url}): ${error.message}`);
    }
  }
  if (!images.length && urls.length) {
    notes.push("상품 이미지 URL을 파일로 저장하지 못했습니다. 초안은 유지됩니다.");
  }
  return { images, notes };
}

function toPublishImages(downloaded = []) {
  const title = downloaded.find((item) => item.role === "title");
  const bodyImages = downloaded
    .filter((item) => item.role === "body")
    .map((item, index) => ({
      sequence: Number(item.sequence || index + 1),
      path: item.path
    }));
  return {
    titleImagePath: title?.path || "",
    bodyImages
  };
}

module.exports = {
  downloadProductImages,
  toPublishImages
};
