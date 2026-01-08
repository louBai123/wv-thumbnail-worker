export interface Env {
  R2_BUCKET: R2Bucket
  THUMBNAIL_WORKER_SECRET: string
  R2_PUBLIC_BASE_URL?: string
}

type R2Bucket = {
  get: (key: string) => Promise<R2Object | null>
  put: (
    key: string,
    value: ReadableStream | ArrayBuffer | Uint8Array,
    options?: { httpMetadata?: { contentType?: string } },
  ) => Promise<unknown>
}

type R2Object = {
  body: ReadableStream | null
}

type ThumbnailPayload = {
  jobId?: string
}

function normalizeUrl(value: unknown) {
  if (typeof value !== "string") return null
  const trimmed = value.replace(/`/g, "").trim()
  if (!trimmed) return null
  if (!/^https?:\/\//i.test(trimmed)) return null
  return trimmed
}

function buildPublicUrl(base: string | undefined, key: string) {
  if (!base) return key
  const trimmedBase = base.replace(/\/+$/, "")
  const trimmedKey = key.replace(/^\/+/, "")
  return `${trimmedBase}/${trimmedKey}`
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(request.url)

      if (url.pathname !== "/thumbnail") {
        return new Response("Not found", { status: 404 })
      }

      const secret = env.THUMBNAIL_WORKER_SECRET || ""
      const headerSecret = request.headers.get("x-api-key") || ""
      if (!secret || !headerSecret || secret !== headerSecret) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { "content-type": "application/json" },
        })
      }

      const payload = (await request.json().catch(() => ({}))) as ThumbnailPayload
      const jobId = typeof payload.jobId === "string" ? payload.jobId : ""

      if (!jobId) {
        return new Response(JSON.stringify({ error: "Missing jobId" }), {
          status: 400,
          headers: { "content-type": "application/json" },
        })
      }

      const thumbnailKey = `sora-thumbnails/${jobId}.jpg`
      const bucket = env.R2_BUCKET

      const existing = await bucket.get(thumbnailKey)
      if (existing && existing.body) {
        const existingUrl = buildPublicUrl(env.R2_PUBLIC_BASE_URL, thumbnailKey)
        return new Response(JSON.stringify({ ok: true, r2ThumbnailUrl: existingUrl }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      }

      return new Response(
        JSON.stringify({ error: "Thumbnail not found in R2", r2ThumbnailKey: thumbnailKey }),
        {
          status: 404,
          headers: { "content-type": "application/json" },
        },
      )
    } catch (error) {
      const message =
        error && typeof (error as any).message === "string"
          ? (error as any).message
          : "Unknown error"
      return new Response(JSON.stringify({ error: "Internal worker error", detail: message }), {
        status: 500,
        headers: { "content-type": "application/json" },
      })
    }
  },
}
