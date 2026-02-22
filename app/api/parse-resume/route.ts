import { NextRequest, NextResponse } from "next/server"
import path from "path"
import { pathToFileURL } from "url"

export const runtime  = "nodejs"
export const maxDuration = 60

const MAX_PAGES            = 10
const MIN_CHARS_PER_PAGE   = 50      // below this → treat page as scanned
const TOO_LONG_CHARS       = 8_000   // ~1,200–1,500 words ≈ 2 printed pages
const OCR_TIMEOUT_MS       = 20_000  // hard cap per local tesseract page
const OCR_SPACE_TIMEOUT_MS = 30_000  // hard cap for OCR.space API call
const OCR_SPACE_MAX_BYTES  = 1_000_000  // free tier file size limit (1 MB)

// pdfjs-dist legacy build — required for Node.js (standard build needs DOMMatrix)
const PDFJS_WORKER_URL = pathToFileURL(
  path.resolve(process.cwd(), "node_modules", "pdfjs-dist", "legacy", "build", "pdf.worker.min.mjs")
).href

// ─── Tier 1: OCR.space cloud API ─────────────────────────────────────────────
// Handles both text-layer PDFs and fully scanned/image PDFs.
// Falls back to local processing on any error (timeout, rate limit, size, etc.)

async function extractWithOcrSpace(buffer: Buffer): Promise<string> {
  if (buffer.length > OCR_SPACE_MAX_BYTES) {
    throw new Error("OCR.space: file exceeds 1 MB free-tier limit")
  }

  const apiKey = process.env.OCR_SPACE_API_KEY ?? "K86090142088957"

  const form = new FormData()
  form.append("apikey",              apiKey)
  form.append("language",            "eng")
  form.append("isOverlayRequired",   "false")
  form.append("detectOrientation",   "true")
  form.append("scale",               "true")
  form.append("OCREngine",           "2")       // engine 2 handles complex layouts better
  form.append(
    "file",
    new Blob([new Uint8Array(buffer)], { type: "application/pdf" }),
    "resume.pdf"
  )

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), OCR_SPACE_TIMEOUT_MS)

  let data: any
  try {
    const resp = await fetch("https://api.ocr.space/parse/image", {
      method: "POST",
      body:   form,
      signal: controller.signal,
    })
    if (!resp.ok) throw new Error(`OCR.space HTTP ${resp.status}`)
    data = await resp.json()
  } finally {
    clearTimeout(timer)
  }

  if (data.IsErroredOnProcessing) {
    const msg = Array.isArray(data.ErrorMessage)
      ? data.ErrorMessage.join("; ")
      : String(data.ErrorMessage ?? "unknown error")
    throw new Error(`OCR.space processing error: ${msg}`)
  }

  const text = (data.ParsedResults as any[] ?? [])
    .map((r: any) => r.ParsedText ?? "")
    .join("\n")
    .trim()

  if (!text) throw new Error("OCR.space returned empty text")
  return text
}

// ─── Pure-JS RGBA → 24-bit BMP ───────────────────────────────────────────────
// BMP is trivially decoded by Tesseract's Leptonica engine — zero extra deps.
function rgbaToBmp(rgba: Uint8ClampedArray, w: number, h: number): Buffer {
  const rowBytes   = Math.ceil((w * 3) / 4) * 4
  const pixelBytes = rowBytes * h
  const fileSize   = 54 + pixelBytes
  const buf        = Buffer.alloc(fileSize, 0)

  buf[0] = 0x42; buf[1] = 0x4d
  buf.writeUInt32LE(fileSize, 2)
  buf.writeUInt32LE(54, 10)
  buf.writeUInt32LE(40, 14)
  buf.writeInt32LE(w, 18)
  buf.writeInt32LE(-h, 22)
  buf.writeUInt16LE(1, 26)
  buf.writeUInt16LE(24, 28)
  buf.writeUInt32LE(0, 30)
  buf.writeUInt32LE(pixelBytes, 34)
  buf.writeInt32LE(2835, 38)
  buf.writeInt32LE(2835, 42)

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const src = (y * w + x) * 4
      const dst = 54 + y * rowBytes + x * 3
      buf[dst]     = rgba[src + 2]
      buf[dst + 1] = rgba[src + 1]
      buf[dst + 2] = rgba[src]
    }
  }
  return buf
}

// ─── Minimal canvas stub for pdfjs-dist rendering ────────────────────────────
interface CapturedImage { data: Uint8ClampedArray; width: number; height: number }

class StubCanvas {
  width  = 0
  height = 0
  images: CapturedImage[] = []
  getContext(_type: string) { return makeCtx(this) }
}

function makeCtx(self: StubCanvas): Record<string, any> {
  const noop = () => {}
  const grad = { addColorStop: noop }

  function capture(img: any) {
    if (img instanceof StubCanvas) { self.images.push(...img.images); return }
    if (img?.data && img.width > 0 && img.height > 0) {
      const d = img.data instanceof Uint8ClampedArray
        ? img.data
        : new Uint8ClampedArray(img.data.buffer ?? img.data)
      if (d.length === img.width * img.height * 4) {
        self.images.push({ data: d, width: img.width, height: img.height })
      }
    }
  }

  return {
    fillStyle: "", strokeStyle: "", lineWidth: 1,
    lineCap: "butt", lineJoin: "miter", miterLimit: 10,
    font: "", textAlign: "start", textBaseline: "alphabetic", direction: "ltr",
    globalAlpha: 1, globalCompositeOperation: "source-over",
    imageSmoothingEnabled: true, imageSmoothingQuality: "medium",
    shadowBlur: 0, shadowColor: "", shadowOffsetX: 0, shadowOffsetY: 0,
    lineDashOffset: 0, filter: "none",
    get canvas() { return self },
    save: noop, restore: noop,
    scale: noop, rotate: noop, translate: noop,
    transform: noop, setTransform: noop, resetTransform: noop,
    getTransform() { return { a:1, b:0, c:0, d:1, e:0, f:0 } },
    clearRect: noop, fillRect: noop, strokeRect: noop,
    beginPath: noop, closePath: noop,
    moveTo: noop, lineTo: noop, bezierCurveTo: noop,
    quadraticCurveTo: noop, arc: noop, arcTo: noop,
    ellipse: noop, rect: noop,
    fill: noop, stroke: noop, clip: noop,
    isPointInPath: () => false, isPointInStroke: () => false,
    fillText: noop, strokeText: noop,
    measureText: () => ({
      width: 0, actualBoundingBoxAscent: 0, actualBoundingBoxDescent: 0,
      actualBoundingBoxLeft: 0, actualBoundingBoxRight: 0,
      fontBoundingBoxAscent: 0, fontBoundingBoxDescent: 0,
    }),
    drawImage(img: any)        { capture(img) },
    putImageData(imgData: any) {
      if (!imgData?.data || !imgData.width || !imgData.height) return
      const d = imgData.data instanceof Uint8ClampedArray
        ? imgData.data
        : new Uint8ClampedArray(imgData.data.buffer ?? imgData.data)
      if (d.length === imgData.width * imgData.height * 4)
        self.images.push({ data: d, width: imgData.width, height: imgData.height })
    },
    createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
    getImageData:    (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
    createLinearGradient: () => grad, createRadialGradient: () => grad,
    createConicGradient:  () => grad, createPattern: () => null,
    setLineDash: noop, getLineDash: () => [] as number[],
  }
}

class StubCanvasFactory {
  create(w: number, h: number) {
    const canvas = new StubCanvas(); canvas.width = w; canvas.height = h
    return { canvas, context: canvas.getContext("2d") }
  }
  reset(cc: { canvas: StubCanvas }, w: number, h: number) {
    cc.canvas.width = w; cc.canvas.height = h; cc.canvas.images = []
  }
  destroy(cc: { canvas: StubCanvas }) { cc.canvas.images = [] }
}

// ─── Tier 2 + 3: local pdfjs text layer + tesseract OCR fallback ─────────────
async function processPdfLocally(buffer: Buffer): Promise<string> {
  let pdfjs: any
  try {
    pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs" as any)
    if (typeof pdfjs.getDocument !== "function" && typeof pdfjs.default?.getDocument === "function") {
      pdfjs = pdfjs.default
    }
    pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL
  } catch (e) {
    console.error("[parse-resume] pdfjs import error:", e)
    return ""
  }

  let pdf: any
  try {
    pdf = await pdfjs.getDocument({
      data:           new Uint8Array(buffer),
      useSystemFonts: false,
      disableRange:   true,
      disableStream:  true,
      verbosity:      0,
    }).promise
  } catch (e) {
    console.error("[parse-resume] pdfjs getDocument error:", e)
    return ""
  }

  const total     = Math.min(pdf.numPages, MAX_PAGES)
  const pageTexts = new Array<string>(total).fill("")
  const needsOcr: number[] = []

  // Tier 2: pdfjs text layer
  for (let n = 1; n <= total; n++) {
    try {
      const page    = await pdf.getPage(n)
      const content = await page.getTextContent()
      const t = content.items
        .map((item: any) => ("str" in item ? item.str : ""))
        .join(" ")
        .trim()
      pageTexts[n - 1] = t
      if (t.length < MIN_CHARS_PER_PAGE) needsOcr.push(n)
      page.cleanup?.()
    } catch (e) {
      console.error(`[parse-resume] pdfjs page ${n} error:`, e)
      needsOcr.push(n)
    }
  }

  const textLayerResult = pageTexts.join("\n").trim()
  if (needsOcr.length === 0) {
    await pdf.destroy().catch(() => {})
    return textLayerResult
  }

  // Tier 3: tesseract OCR for scanned pages
  let worker: any
  try {
    const { createWorker } = await import("tesseract.js")
    worker = await createWorker("eng")
  } catch (e) {
    console.error("[parse-resume] tesseract init error:", e)
    await pdf.destroy().catch(() => {})
    return textLayerResult
  }

  const factory = new StubCanvasFactory()

  try {
    for (const pageNum of needsOcr) {
      let page: any
      try { page = await pdf.getPage(pageNum) } catch { continue }

      const cc = factory.create(0, 0)
      try {
        const viewport = page.getViewport({ scale: 1.5 })
        factory.reset(cc, Math.round(viewport.width), Math.round(viewport.height))
        await page.render({ canvasContext: cc.context, viewport, canvasFactory: factory }).promise

        const images = (cc.canvas as StubCanvas).images
        if (images.length > 0) {
          const best = images.reduce((a, b) =>
            a.width * a.height >= b.width * b.height ? a : b)
          const bmp = rgbaToBmp(best.data, best.width, best.height)
          const ocrText = await Promise.race<string>([
            worker.recognize(bmp).then((r: any) => r.data.text ?? ""),
            new Promise<string>((_, rej) =>
              setTimeout(() => rej(new Error("OCR timeout")), OCR_TIMEOUT_MS)),
          ])
          pageTexts[pageNum - 1] = ocrText.trim()
        }
      } catch (e) {
        console.error(`[parse-resume] tesseract page ${pageNum} error:`, e)
      } finally {
        page.cleanup?.()
        factory.destroy(cc)
      }
    }
  } finally {
    await worker.terminate().catch(() => {})
    await pdf.destroy().catch(() => {})
  }

  const ocrResult = pageTexts.join("\n").trim()
  return ocrResult.length > textLayerResult.length ? ocrResult : textLayerResult
}

// ─── Main PDF processor ───────────────────────────────────────────────────────
async function processPdf(buffer: Buffer): Promise<string> {
  // Tier 1: OCR.space — cloud API, handles text and scanned PDFs
  try {
    const text = await extractWithOcrSpace(buffer)
    if (text.length >= MIN_CHARS_PER_PAGE) return text
    console.warn("[parse-resume] OCR.space returned very short text, falling back to local")
  } catch (e) {
    console.error("[parse-resume] OCR.space error (falling back to local):", (e as Error).message)
  }

  // Tier 2+3: local pdfjs text layer + tesseract
  return processPdfLocally(buffer)
}

// ─── Route handler ────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file     = formData.get("file") as File | null

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    const bytes  = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    const fname  = file.name.toLowerCase()
    const mime   = file.type
    let   text   = ""

    // ── DOCX ──────────────────────────────────────────────────────────────────
    if (
      mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      fname.endsWith(".docx")
    ) {
      const mammoth = await import("mammoth")
      text = (await mammoth.extractRawText({ buffer })).value.trim()

    // ── TXT ───────────────────────────────────────────────────────────────────
    } else if (mime === "text/plain" || fname.endsWith(".txt")) {
      text = buffer.toString("utf-8").trim()

    // ── RTF ───────────────────────────────────────────────────────────────────
    } else if (
      mime === "application/rtf" ||
      mime === "text/rtf"         ||
      fname.endsWith(".rtf")
    ) {
      text = buffer
        .toString("utf-8")
        .replace(/\\\n/g, "\n")
        .replace(/\\[a-z]+\d*\s?/gi, "")
        .replace(/[{}]/g, "")
        .replace(/\\'/gi, "'")
        .replace(/\r\n|\r/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim()

    // ── PDF ───────────────────────────────────────────────────────────────────
    } else if (mime === "application/pdf" || fname.endsWith(".pdf")) {
      text = await processPdf(buffer)

    // ── Unsupported ───────────────────────────────────────────────────────────
    } else {
      return NextResponse.json(
        { error: "Unsupported file type. Please upload a PDF, DOCX, or TXT file." },
        { status: 400 },
      )
    }

    if (!text) {
      return NextResponse.json(
        {
          error:
            "Could not extract text from this file. " +
            "If it is a scanned PDF, please convert it to a text-based PDF or DOCX for best results.",
        },
        { status: 422 },
      )
    }

    const tooLong = text.length > TOO_LONG_CHARS
    return NextResponse.json({ text, tooLong })

  } catch (error) {
    console.error("[parse-resume] unhandled error:", error)
    return NextResponse.json(
      { error: "Failed to parse resume. Please try a different file." },
      { status: 500 },
    )
  }
}
