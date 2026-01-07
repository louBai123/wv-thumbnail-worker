import * as FFmpegModule from "@ffmpeg/ffmpeg"

const ffmpegAny = FFmpegModule as any
const createFFmpeg =
  ffmpegAny.createFFmpeg || ffmpegAny.default?.createFFmpeg || ffmpegAny.default || ffmpegAny
const fetchFile = ffmpegAny.fetchFile || ffmpegAny.default?.fetchFile

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
let ffmpeg: any = null
let ffmpegReady: Promise<void> | null = null

async function ensureFfmpegLoaded() {
  if (!ffmpeg) {
    ffmpeg = createFFmpeg({
      log: false,
      corePath: "https://unpkg.com/@ffmpeg/core@0.12.10/dist/ffmpeg-core.js",
    })
  }
  if (!ffmpegReady) {
    ffmpegReady = ffmpeg.load()
  }
  await ffmpegReady
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
      const videoUrlRaw = normalizeUrl(payload.videoUrl)

      if (!jobId || !videoUrlRaw) {
        return new Response(JSON.stringify({ error: "Missing jobId or videoUrl" }), {
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

      const videoUrl = new URL(videoUrlRaw)
      const videoKey = videoUrl.pathname.replace(/^\/+/, "")

      const videoObject = await bucket.get(videoKey)
      if (!videoObject || !videoObject.body) {
        return new Response(JSON.stringify({ error: "Video object not found in R2" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        })
      }

      const videoBuffer = await new Response(videoObject.body).arrayBuffer()

      const thumbnailBuffer = await generateThumbnailFromVideo(videoBuffer)

      await bucket.put(thumbnailKey, thumbnailBuffer, {
        httpMetadata: {
          contentType: "image/jpeg",
        },
      })

      const publicUrl = buildPublicUrl(env.R2_PUBLIC_BASE_URL, thumbnailKey)

      return new Response(JSON.stringify({ ok: true, r2ThumbnailUrl: publicUrl }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
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

async function generateThumbnailFromVideo(videoBuffer: ArrayBuffer): Promise<Uint8Array> {
  await ensureFfmpegLoaded()

  const inputName = "input.mp4"
  const outputName = "thumbnail.jpg"

  const data = new Uint8Array(videoBuffer)

  ffmpeg.FS("writeFile", inputName, await fetchFile(data))

  await ffmpeg.run(
    "-i",
    inputName,
    "-ss",
    "00:00:01.000",
    "-frames:v",
    "1",
    "-vf",
    "scale=512:-1",
    "-f",
    "image2",
    outputName,
  )

  const output = ffmpeg.FS("readFile", outputName)

  ffmpeg.FS("unlink", inputName)
  ffmpeg.FS("unlink", outputName)

  return output
}
