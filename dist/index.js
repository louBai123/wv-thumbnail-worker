var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/index.ts
function buildPublicUrl(base, key) {
  if (!base) return key;
  const trimmedBase = base.replace(/\/+$/, "");
  const trimmedKey = key.replace(/^\/+/, "");
  return `${trimmedBase}/${trimmedKey}`;
}
__name(buildPublicUrl, "buildPublicUrl");
var index_default = {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      if (url.pathname !== "/thumbnail") {
        return new Response("Not found", { status: 404 });
      }
      const secret = env.THUMBNAIL_WORKER_SECRET || "";
      const headerSecret = request.headers.get("x-api-key") || "";
      if (!secret || !headerSecret || secret !== headerSecret) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { "content-type": "application/json" }
        });
      }
      const payload = await request.json().catch(() => ({}));
      const jobId = typeof payload.jobId === "string" ? payload.jobId : "";
      if (!jobId) {
        return new Response(JSON.stringify({ error: "Missing jobId" }), {
          status: 400,
          headers: { "content-type": "application/json" }
        });
      }
      const thumbnailKey = `sora-thumbnails/${jobId}.jpg`;
      const bucket = env.R2_BUCKET;
      const existing = await bucket.get(thumbnailKey);
      if (existing && existing.body) {
        const existingUrl = buildPublicUrl(env.R2_PUBLIC_BASE_URL, thumbnailKey);
        return new Response(JSON.stringify({ ok: true, r2ThumbnailUrl: existingUrl }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
      return new Response(
        JSON.stringify({ error: "Thumbnail not found in R2", r2ThumbnailKey: thumbnailKey }),
        {
          status: 404,
          headers: { "content-type": "application/json" }
        }
      );
    } catch (error) {
      const message = error && typeof error.message === "string" ? error.message : "Unknown error";
      return new Response(JSON.stringify({ error: "Internal worker error", detail: message }), {
        status: 500,
        headers: { "content-type": "application/json" }
      });
    }
  }
};
export {
  index_default as default
};
//# sourceMappingURL=index.js.map
