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
  videoUrl?: string
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
    const videoUrlRaw = normalizeUrl(payload.videoUrl)

    if (!jobId || !videoUrlRaw) {
      return new Response(JSON.stringify({ error: "Missing jobId or videoUrl" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      })
    }

    const key = `sora-thumbnails/${jobId}.jpg`

    const existing = await env.R2_BUCKET.get(key)
    if (existing && existing.body) {
      const publicUrl = buildPublicUrl(env.R2_PUBLIC_BASE_URL, key)
      return new Response(JSON.stringify({ ok: true, r2ThumbnailUrl: publicUrl }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    }

    const videoResp = await fetch(videoUrlRaw)
    if (!videoResp.ok || !videoResp.body) {
      return new Response(JSON.stringify({ error: "Failed to download video" }), {
        status: 502,
        headers: { "content-type": "application/json" },
      })
    }

    const videoBuffer = await videoResp.arrayBuffer()

    const thumbnailBuffer = await generateThumbnailFromVideo(videoBuffer)

    await env.R2_BUCKET.put(key, thumbnailBuffer, {
      httpMetadata: {
        contentType: "image/jpeg",
      },
    })

    const publicUrl = buildPublicUrl(env.R2_PUBLIC_BASE_URL, key)

    return new Response(JSON.stringify({ ok: true, r2ThumbnailUrl: publicUrl }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })
  },
}

async function generateThumbnailFromVideo(videoBuffer: ArrayBuffer): Promise<Uint8Array> {
  const base64 =
    "/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAkGBxAQEBAPEA8QDw8PDw8PDw8PDw8PDw8PFRIWFhURFRUYHSggGBolGxUVITEhJSkrLi4uFx8zODMtNygtLisBCgoKDg0OFQ8PFSsdFR0rKysrKysrKysrKysrKysrKysrKysrKysrKysrKysrKysrKysrKysrKysrKysrK//AABEIAKAAoAMBIgACEQEDEQH/xAAbAAACAwEBAQAAAAAAAAAAAAAEBQADBgIBB//EADkQAAEDAgMFBQcEAwEAAAAAAAEAAgMEEQUSITFBUWFxBhMicYGRobHB0fAHFCNS8RUjYpL/xAAZAQADAQEBAAAAAAAAAAAAAAABAgMABAX/xAAkEQACAgICAgIDAQEAAAAAAAAAAQIRAyESMQRBURMiMmFxkf/aAAwDAQACEQMRAD8A9xREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQH/2Q=="

  const binaryString = atob(base64)
  const length = binaryString.length
  const bytes = new Uint8Array(length)

  for (let i = 0; i < length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }

  return bytes
}
