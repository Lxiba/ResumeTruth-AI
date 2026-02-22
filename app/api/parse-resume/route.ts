import { NextRequest, NextResponse } from "next/server"

export const runtime  = "nodejs"
export const maxDuration = 60

const MAX_PAGES          = 10
const MIN_CHARS_PER_PAGE = 50      // below this → treat page as scanned
const TOO_LONG_CHARS     = 8_000   // ~1,200–1,500 words ≈ 2 printed pages
const OCR_TIMEOUT_MS     = 20_000  // hard cap per page

// ─── Pure-JS RGBA → 24-bit BMP ───────────────────────────────────────────────
// BMP is trivially decoded by Tesseract's Leptonica engine — zero extra deps.
function rgbaToBmp(rgba: Uint8ClampedArray, w: number, h: number): Buffer {
  const rowBytes   = Math.ceil((w * 3) / 4) * 4   // pad rows to 4-byte boundary
  const pixelBytes = rowBytes * h
  const fileSize   = 54 + pixelBytes
  const buf        = Buffer.alloc(fileSize, 0)

  buf[0] = 0x42; buf[1] = 0x4d            // "BM"
  buf.writeUInt32LE(fileSize, 2)
  buf.writeUInt32LE(54, 10)               // pixel data offset
  buf.writeUInt32LE(40, 14)               // BITMAPINFOHEADER size
  buf.writeInt32LE(w, 18)
  buf.writeInt32LE(-h, 22)                // negative = top-down rows
  buf.writeUInt16LE(1, 26)                // color planes
  buf.writeUInt16LE(24, 28)               // 24-bit RGB
  buf.writeUInt32LE(0, 30)                // BI_RGB (no compression)
  buf.writeUInt32LE(pixelBytes, 34)
  buf.writeInt32LE(2835, 38)              // ~72 DPI H
  buf.writeInt32LE(2835, 42)              // ~72 DPI V

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const src = (y * w + x) * 4
      const dst = 54 + y * rowBytes + x * 3
      buf[dst]     = rgba[src + 2]        // B
      buf[dst + 1] = rgba[src + 1]        // G
      buf[dst + 2] = rgba[src]            // R
    }
  }
  return buf
}

// ─── Minimal canvas stub for pdfjs-dist rendering ────────────────────────────
// pdfjs-dist calls canvas 2D context methods when rendering a page.
// This stub is all no-ops EXCEPT drawImage / putImageData, which capture
// the decoded RGBA pixel data we need for OCR.
// No native bindings, no external libraries.

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
    // Scenario A: another StubCanvas (from a pdfjs temp-canvas)
    if (img instanceof StubCanvas) {
      self.images.push(...img.images)
      return
    }
    // Scenario B: raw pixel object { data, width, height }
    if (img?.data && img.width > 0 && img.height > 0) {
      const d = img.data instanceof Uint8ClampedArray
        ? img.data
        : new Uint8ClampedArray(img.data.buffer ?? img.data)
      // sanity check: must be exactly width * height * 4 bytes (RGBA)
      if (d.length === img.width * img.height * 4) {
        self.images.push({ data: d, width: img.width, height: img.height })
      }
    }
  }

  return {
    // ── style props (writable, never read) ──────────────────────────────────
    fillStyle: "", strokeStyle: "", lineWidth: 1,
    lineCap: "butt", lineJoin: "miter", miterLimit: 10,
    font: "", textAlign: "start", textBaseline: "alphabetic", direction: "ltr",
    globalAlpha: 1, globalCompositeOperation: "source-over",
    imageSmoothingEnabled: true, imageSmoothingQuality: "medium",
    shadowBlur: 0, shadowColor: "", shadowOffsetX: 0, shadowOffsetY: 0,
    lineDashOffset: 0, filter: "none",

    // ── canvas ref ───────────────────────────────────────────────────────────
    get canvas() { return self },

    // ── state ────────────────────────────────────────────────────────────────
    save: noop, restore: noop,

    // ── transforms ───────────────────────────────────────────────────────────
    scale: noop, rotate: noop, translate: noop,
    transform: noop, setTransform: noop, resetTransform: noop,
    getTransform() { return { a:1, b:0, c:0, d:1, e:0, f:0 } },

    // ── rects ────────────────────────────────────────────────────────────────
    clearRect: noop, fillRect: noop, strokeRect: noop,

    // ── paths ────────────────────────────────────────────────────────────────
    beginPath: noop, closePath: noop,
    moveTo: noop, lineTo: noop, bezierCurveTo: noop,
    quadraticCurveTo: noop, arc: noop, arcTo: noop,
    ellipse: noop, rect: noop,
    fill: noop, stroke: noop, clip: noop,
    isPointInPath: () => false, isPointInStroke: () => false,

    // ── text ─────────────────────────────────────────────────────────────────
    fillText: noop, strokeText: noop,
    measureText: () => ({
      width: 0, actualBoundingBoxAscent: 0, actualBoundingBoxDescent: 0,
      actualBoundingBoxLeft: 0, actualBoundingBoxRight: 0,
      fontBoundingBoxAscent: 0, fontBoundingBoxDescent: 0,
    }),

    // ── image — what we actually care about ──────────────────────────────────
    drawImage(img: any)      { capture(img) },
    putImageData(imgData: any) {
      if (!imgData?.data || !imgData.width || !imgData.height) return
      const d = imgData.data instanceof Uint8ClampedArray
        ? imgData.data
        : new Uint8ClampedArray(imgData.data.buffer ?? imgData.data)
      if (d.length === imgData.width * imgData.height * 4) {
        self.images.push({ data: d, width: imgData.width, height: imgData.height })
      }
    },
    createImageData: (w: number, h: number) => ({
      data: new Uint8ClampedArray(w * h * 4), width: w, height: h,
    }),
    getImageData: (_x: number, _y: number, w: number, h: number) => ({
      data: new Uint8ClampedArray(w * h * 4), width: w, height: h,
    }),

    // ── gradient / pattern ───────────────────────────────────────────────────
    createLinearGradient: () => grad, createRadialGradient: () => grad,
    createConicGradient: () => grad,  createPattern: () => null,

    // ── line dash ────────────────────────────────────────────────────────────
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

// ─── Resolve pdfjs-dist regardless of module shape ───────────────────────────
// Dynamic import can return either a named-export namespace or a .default object.
// If GlobalWorkerOptions is missing on the namespace root, try .default.
function resolvePdfjs(mod: any) {
  if (typeof mod?.getDocument === "function") return mod
  if (typeof mod?.default?.getDocument === "function") return mod.default
  throw new Error("pdfjs-dist: could not resolve getDocument")
}

// ─── Tier 1: pdf-parse (primary — fast, well-tested for text PDFs) ────────────
// Handles both pdf-parse v1 (default function) and v2 (PDFParse class).
async function extractWithPdfParse(buffer: Buffer): Promise<string> {
  const mod = await import("pdf-parse") as any

  // v2.x — named PDFParse class
  if (mod.PDFParse) {
    const parser = new mod.PDFParse({ data: buffer })
    const result = await parser.getText()
    await parser.destroy?.()
    return result.text?.trim() ?? ""
  }

  // v1.x — default function export
  const fn = typeof mod.default === "function" ? mod.default
           : typeof mod          === "function" ? mod
           : null
  if (fn) {
    const data = await fn(buffer)
    return data.text?.trim() ?? ""
  }

  throw new Error("pdf-parse: unrecognised module shape")
}

// ─── Process a PDF: text layer + OCR fallback — single document open ──────────
async function processPdf(buffer: Buffer): Promise<string> {
  // ── Tier 1a: pdf-parse ──────────────────────────────────────────────────────
  let quickText = ""
  try {
    quickText = await extractWithPdfParse(buffer)
  } catch (e) {
    console.error("[parse-resume] pdf-parse error:", e)
  }

  // If pdf-parse gave solid text, skip pdfjs entirely (fast path)
  if (quickText.length >= MIN_CHARS_PER_PAGE * 3) return quickText

  // ── Tiers 1b + 2: pdfjs-dist text layer + canvas-stub OCR ──────────────────
  let pdfjs: any
  try {
    pdfjs = resolvePdfjs(await import("pdfjs-dist"))
  } catch (e) {
    console.error("[parse-resume] pdfjs-dist import error:", e)
    // If pdfjs-dist fails to import, return whatever pdf-parse gave us
    return quickText
  }

  pdfjs.GlobalWorkerOptions.workerSrc = ""

  let pdf: any
  try {
    pdf = await pdfjs.getDocument({
      data: new Uint8Array(buffer),
      useSystemFonts:  false,   // avoids host font lookups
      disableRange:    true,    // we have the full buffer already
      disableStream:   true,
      verbosity:       0,       // suppress warnings
    }).promise
  } catch (e) {
    console.error("[parse-resume] pdfjs getDocument error:", e)
    return quickText
  }

  const total      = Math.min(pdf.numPages, MAX_PAGES)
  const pageTexts  = new Array<string>(total).fill("")
  const needsOcr: number[] = []

  // ── Tier 1b: extract text layer from every page ─────────────────────────────
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
      console.error(`[parse-resume] pdfjs page ${n} text error:`, e)
      needsOcr.push(n)   // treat unreadable page as scanned
    }
  }

  // If the text layer was already solid, no need for OCR
  const textLayerResult = pageTexts.join("\n").trim()
  if (needsOcr.length === 0) {
    await pdf.destroy().catch(() => {})
    return textLayerResult.length > quickText.length ? textLayerResult : quickText
  }

  // ── Tier 2: OCR scanned pages via canvas-stub rendering + tesseract ──────────
  let worker: any
  try {
    const { createWorker } = await import("tesseract.js")
    worker = await createWorker("eng")
  } catch (e) {
    console.error("[parse-resume] tesseract init error:", e)
    // OCR unavailable — return best text we have
    await pdf.destroy().catch(() => {})
    const best = textLayerResult.length > quickText.length ? textLayerResult : quickText
    return best
  }

  const factory = new StubCanvasFactory()

  try {
    for (const pageNum of needsOcr) {
      let page: any
      try {
        page = await pdf.getPage(pageNum)
      } catch {
        continue
      }

      const cc = factory.create(0, 0)
      try {
        const viewport = page.getViewport({ scale: 1.5 })
        factory.reset(cc, Math.round(viewport.width), Math.round(viewport.height))

        await page.render({
          canvasContext: cc.context,
          viewport,
          canvasFactory: factory,
        }).promise

        const images = (cc.canvas as StubCanvas).images
        if (images.length > 0) {
          // Use the largest image on the page (= the scanned content)
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
        console.error(`[parse-resume] OCR page ${pageNum} error:`, e)
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
  // Return whichever extraction gave the most text
  return [quickText, textLayerResult, ocrResult].reduce((a, b) =>
    b.length > a.length ? b : a)
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
        { error: "Unsupported file type. Please upload a PDF, DOCX, TXT, or RTF file." },
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
