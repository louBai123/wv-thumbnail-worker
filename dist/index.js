var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// node_modules/@ffmpeg/ffmpeg/dist/esm/const.js
var CORE_VERSION = "0.12.9";
var CORE_URL = `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/umd/ffmpeg-core.js`;
var FFMessageType;
(function(FFMessageType2) {
  FFMessageType2["LOAD"] = "LOAD";
  FFMessageType2["EXEC"] = "EXEC";
  FFMessageType2["FFPROBE"] = "FFPROBE";
  FFMessageType2["WRITE_FILE"] = "WRITE_FILE";
  FFMessageType2["READ_FILE"] = "READ_FILE";
  FFMessageType2["DELETE_FILE"] = "DELETE_FILE";
  FFMessageType2["RENAME"] = "RENAME";
  FFMessageType2["CREATE_DIR"] = "CREATE_DIR";
  FFMessageType2["LIST_DIR"] = "LIST_DIR";
  FFMessageType2["DELETE_DIR"] = "DELETE_DIR";
  FFMessageType2["ERROR"] = "ERROR";
  FFMessageType2["DOWNLOAD"] = "DOWNLOAD";
  FFMessageType2["PROGRESS"] = "PROGRESS";
  FFMessageType2["LOG"] = "LOG";
  FFMessageType2["MOUNT"] = "MOUNT";
  FFMessageType2["UNMOUNT"] = "UNMOUNT";
})(FFMessageType || (FFMessageType = {}));

// node_modules/@ffmpeg/ffmpeg/dist/esm/utils.js
var getMessageID = /* @__PURE__ */ (() => {
  let messageID = 0;
  return () => messageID++;
})();

// node_modules/@ffmpeg/ffmpeg/dist/esm/errors.js
var ERROR_UNKNOWN_MESSAGE_TYPE = new Error("unknown message type");
var ERROR_NOT_LOADED = new Error("ffmpeg is not loaded, call `await ffmpeg.load()` first");
var ERROR_TERMINATED = new Error("called FFmpeg.terminate()");
var ERROR_IMPORT_FAILURE = new Error("failed to import ffmpeg-core.js");

// node_modules/@ffmpeg/ffmpeg/dist/esm/classes.js
var FFmpeg = class {
  static {
    __name(this, "FFmpeg");
  }
  #worker = null;
  /**
   * #resolves and #rejects tracks Promise resolves and rejects to
   * be called when we receive message from web worker.
   */
  #resolves = {};
  #rejects = {};
  #logEventCallbacks = [];
  #progressEventCallbacks = [];
  loaded = false;
  /**
   * register worker message event handlers.
   */
  #registerHandlers = /* @__PURE__ */ __name(() => {
    if (this.#worker) {
      this.#worker.onmessage = ({ data: { id, type, data } }) => {
        switch (type) {
          case FFMessageType.LOAD:
            this.loaded = true;
            this.#resolves[id](data);
            break;
          case FFMessageType.MOUNT:
          case FFMessageType.UNMOUNT:
          case FFMessageType.EXEC:
          case FFMessageType.FFPROBE:
          case FFMessageType.WRITE_FILE:
          case FFMessageType.READ_FILE:
          case FFMessageType.DELETE_FILE:
          case FFMessageType.RENAME:
          case FFMessageType.CREATE_DIR:
          case FFMessageType.LIST_DIR:
          case FFMessageType.DELETE_DIR:
            this.#resolves[id](data);
            break;
          case FFMessageType.LOG:
            this.#logEventCallbacks.forEach((f) => f(data));
            break;
          case FFMessageType.PROGRESS:
            this.#progressEventCallbacks.forEach((f) => f(data));
            break;
          case FFMessageType.ERROR:
            this.#rejects[id](data);
            break;
        }
        delete this.#resolves[id];
        delete this.#rejects[id];
      };
    }
  }, "#registerHandlers");
  /**
   * Generic function to send messages to web worker.
   */
  #send = /* @__PURE__ */ __name(({ type, data }, trans = [], signal) => {
    if (!this.#worker) {
      return Promise.reject(ERROR_NOT_LOADED);
    }
    return new Promise((resolve, reject) => {
      const id = getMessageID();
      this.#worker && this.#worker.postMessage({ id, type, data }, trans);
      this.#resolves[id] = resolve;
      this.#rejects[id] = reject;
      signal?.addEventListener("abort", () => {
        reject(new DOMException(`Message # ${id} was aborted`, "AbortError"));
      }, { once: true });
    });
  }, "#send");
  on(event, callback) {
    if (event === "log") {
      this.#logEventCallbacks.push(callback);
    } else if (event === "progress") {
      this.#progressEventCallbacks.push(callback);
    }
  }
  off(event, callback) {
    if (event === "log") {
      this.#logEventCallbacks = this.#logEventCallbacks.filter((f) => f !== callback);
    } else if (event === "progress") {
      this.#progressEventCallbacks = this.#progressEventCallbacks.filter((f) => f !== callback);
    }
  }
  /**
   * Loads ffmpeg-core inside web worker. It is required to call this method first
   * as it initializes WebAssembly and other essential variables.
   *
   * @category FFmpeg
   * @returns `true` if ffmpeg core is loaded for the first time.
   */
  load = /* @__PURE__ */ __name(({ classWorkerURL, ...config } = {}, { signal } = {}) => {
    if (!this.#worker) {
      this.#worker = classWorkerURL ? new Worker(new URL(classWorkerURL, import.meta.url), {
        type: "module"
      }) : (
        // We need to duplicated the code here to enable webpack
        // to bundle worekr.js here.
        new Worker(new URL("./worker.js", import.meta.url), {
          type: "module"
        })
      );
      this.#registerHandlers();
    }
    return this.#send({
      type: FFMessageType.LOAD,
      data: config
    }, void 0, signal);
  }, "load");
  /**
   * Execute ffmpeg command.
   *
   * @remarks
   * To avoid common I/O issues, ["-nostdin", "-y"] are prepended to the args
   * by default.
   *
   * @example
   * ```ts
   * const ffmpeg = new FFmpeg();
   * await ffmpeg.load();
   * await ffmpeg.writeFile("video.avi", ...);
   * // ffmpeg -i video.avi video.mp4
   * await ffmpeg.exec(["-i", "video.avi", "video.mp4"]);
   * const data = ffmpeg.readFile("video.mp4");
   * ```
   *
   * @returns `0` if no error, `!= 0` if timeout (1) or error.
   * @category FFmpeg
   */
  exec = /* @__PURE__ */ __name((args, timeout = -1, { signal } = {}) => this.#send({
    type: FFMessageType.EXEC,
    data: { args, timeout }
  }, void 0, signal), "exec");
  /**
   * Execute ffprobe command.
   *
   * @example
   * ```ts
   * const ffmpeg = new FFmpeg();
   * await ffmpeg.load();
   * await ffmpeg.writeFile("video.avi", ...);
   * // Getting duration of a video in seconds: ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 video.avi -o output.txt
   * await ffmpeg.ffprobe(["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", "video.avi", "-o", "output.txt"]);
   * const data = ffmpeg.readFile("output.txt");
   * ```
   *
   * @returns `0` if no error, `!= 0` if timeout (1) or error.
   * @category FFmpeg
   */
  ffprobe = /* @__PURE__ */ __name((args, timeout = -1, { signal } = {}) => this.#send({
    type: FFMessageType.FFPROBE,
    data: { args, timeout }
  }, void 0, signal), "ffprobe");
  /**
   * Terminate all ongoing API calls and terminate web worker.
   * `FFmpeg.load()` must be called again before calling any other APIs.
   *
   * @category FFmpeg
   */
  terminate = /* @__PURE__ */ __name(() => {
    const ids = Object.keys(this.#rejects);
    for (const id of ids) {
      this.#rejects[id](ERROR_TERMINATED);
      delete this.#rejects[id];
      delete this.#resolves[id];
    }
    if (this.#worker) {
      this.#worker.terminate();
      this.#worker = null;
      this.loaded = false;
    }
  }, "terminate");
  /**
   * Write data to ffmpeg.wasm.
   *
   * @example
   * ```ts
   * const ffmpeg = new FFmpeg();
   * await ffmpeg.load();
   * await ffmpeg.writeFile("video.avi", await fetchFile("../video.avi"));
   * await ffmpeg.writeFile("text.txt", "hello world");
   * ```
   *
   * @category File System
   */
  writeFile = /* @__PURE__ */ __name((path, data, { signal } = {}) => {
    const trans = [];
    if (data instanceof Uint8Array) {
      trans.push(data.buffer);
    }
    return this.#send({
      type: FFMessageType.WRITE_FILE,
      data: { path, data }
    }, trans, signal);
  }, "writeFile");
  mount = /* @__PURE__ */ __name((fsType, options, mountPoint) => {
    const trans = [];
    return this.#send({
      type: FFMessageType.MOUNT,
      data: { fsType, options, mountPoint }
    }, trans);
  }, "mount");
  unmount = /* @__PURE__ */ __name((mountPoint) => {
    const trans = [];
    return this.#send({
      type: FFMessageType.UNMOUNT,
      data: { mountPoint }
    }, trans);
  }, "unmount");
  /**
   * Read data from ffmpeg.wasm.
   *
   * @example
   * ```ts
   * const ffmpeg = new FFmpeg();
   * await ffmpeg.load();
   * const data = await ffmpeg.readFile("video.mp4");
   * ```
   *
   * @category File System
   */
  readFile = /* @__PURE__ */ __name((path, encoding = "binary", { signal } = {}) => this.#send({
    type: FFMessageType.READ_FILE,
    data: { path, encoding }
  }, void 0, signal), "readFile");
  /**
   * Delete a file.
   *
   * @category File System
   */
  deleteFile = /* @__PURE__ */ __name((path, { signal } = {}) => this.#send({
    type: FFMessageType.DELETE_FILE,
    data: { path }
  }, void 0, signal), "deleteFile");
  /**
   * Rename a file or directory.
   *
   * @category File System
   */
  rename = /* @__PURE__ */ __name((oldPath, newPath, { signal } = {}) => this.#send({
    type: FFMessageType.RENAME,
    data: { oldPath, newPath }
  }, void 0, signal), "rename");
  /**
   * Create a directory.
   *
   * @category File System
   */
  createDir = /* @__PURE__ */ __name((path, { signal } = {}) => this.#send({
    type: FFMessageType.CREATE_DIR,
    data: { path }
  }, void 0, signal), "createDir");
  /**
   * List directory contents.
   *
   * @category File System
   */
  listDir = /* @__PURE__ */ __name((path, { signal } = {}) => this.#send({
    type: FFMessageType.LIST_DIR,
    data: { path }
  }, void 0, signal), "listDir");
  /**
   * Delete an empty directory.
   *
   * @category File System
   */
  deleteDir = /* @__PURE__ */ __name((path, { signal } = {}) => this.#send({
    type: FFMessageType.DELETE_DIR,
    data: { path }
  }, void 0, signal), "deleteDir");
};

// node_modules/@ffmpeg/ffmpeg/dist/esm/types.js
var FFFSType;
(function(FFFSType2) {
  FFFSType2["MEMFS"] = "MEMFS";
  FFFSType2["NODEFS"] = "NODEFS";
  FFFSType2["NODERAWFS"] = "NODERAWFS";
  FFFSType2["IDBFS"] = "IDBFS";
  FFFSType2["WORKERFS"] = "WORKERFS";
  FFFSType2["PROXYFS"] = "PROXYFS";
})(FFFSType || (FFFSType = {}));

// src/index.ts
function normalizeUrl(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/`/g, "").trim();
  if (!trimmed) return null;
  if (!/^https?:\/\//i.test(trimmed)) return null;
  return trimmed;
}
__name(normalizeUrl, "normalizeUrl");
function buildPublicUrl(base, key) {
  if (!base) return key;
  const trimmedBase = base.replace(/\/+$/, "");
  const trimmedKey = key.replace(/^\/+/, "");
  return `${trimmedBase}/${trimmedKey}`;
}
__name(buildPublicUrl, "buildPublicUrl");
var ffmpeg = null;
var ffmpegReady = null;
async function ensureFfmpegLoaded() {
  if (!ffmpeg) {
    ffmpeg = new FFmpeg();
  }
  if (!ffmpegReady) {
    ffmpegReady = ffmpeg.load();
  }
  await ffmpegReady;
}
__name(ensureFfmpegLoaded, "ensureFfmpegLoaded");
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
      const videoUrlRaw = normalizeUrl(payload.videoUrl);
      if (!jobId || !videoUrlRaw) {
        return new Response(JSON.stringify({ error: "Missing jobId or videoUrl" }), {
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
      const videoUrl = new URL(videoUrlRaw);
      const videoKey = videoUrl.pathname.replace(/^\/+/, "");
      const videoObject = await bucket.get(videoKey);
      if (!videoObject || !videoObject.body) {
        return new Response(JSON.stringify({ error: "Video object not found in R2" }), {
          status: 404,
          headers: { "content-type": "application/json" }
        });
      }
      const videoBuffer = await new Response(videoObject.body).arrayBuffer();
      const thumbnailBuffer = await generateThumbnailFromVideo(videoBuffer);
      await bucket.put(thumbnailKey, thumbnailBuffer, {
        httpMetadata: {
          contentType: "image/jpeg"
        }
      });
      const publicUrl = buildPublicUrl(env.R2_PUBLIC_BASE_URL, thumbnailKey);
      return new Response(JSON.stringify({ ok: true, r2ThumbnailUrl: publicUrl }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    } catch (error) {
      const message = error && typeof error.message === "string" ? error.message : "Unknown error";
      return new Response(JSON.stringify({ error: "Internal worker error", detail: message }), {
        status: 500,
        headers: { "content-type": "application/json" }
      });
    }
  }
};
async function generateThumbnailFromVideo(videoBuffer) {
  await ensureFfmpegLoaded();
  const inputName = "input.mp4";
  const outputName = "thumbnail.jpg";
  const data = new Uint8Array(videoBuffer);
  if (!ffmpeg) {
    throw new Error("FFmpeg not initialized");
  }
  await ffmpeg.writeFile(inputName, data);
  await ffmpeg.exec([
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
    outputName
  ]);
  const output = await ffmpeg.readFile(outputName);
  await ffmpeg.deleteFile(inputName);
  await ffmpeg.deleteFile(outputName);
  return output;
}
__name(generateThumbnailFromVideo, "generateThumbnailFromVideo");
export {
  index_default as default
};
//# sourceMappingURL=index.js.map
