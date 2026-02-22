import { NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"
export const maxDuration = 60

const MAX_PAGES = 10
const MIN_CHARS_PER_PAGE = 50  // fewer chars → treat page as scanned / image-based
const TOO_LONG_CHARS = 8_000   // ~1,200–1,500 words ≈ 2 printed pages
const OCR_TIMEOUT_MS = 20_000  // 20 s hard cap per page

// ─── Pure-JS RGBA → 24-bit BMP encoder ───────────────────────────────────────
// BMP has a trivial header and is understood by Tesseract's Leptonica engine,
// so we get a valid image buffer with zero extra dependencies.
function rgbaToBmp(rgba: Uint8ClampedArray, width: number, height: number): Buffer {
  const rowBytes = Math.ceil((width * 3) / 4) * 4   // rows padded to 4-byte boundary
  const pixelBytes = rowBytes * height
  const fileSize = 54 + pixelBytes
  const buf = Buffer.alloc(fileSize, 0)

  // ── BMP file header (14 bytes) ────────────────────────────────────────────
  buf[0] = 0x42; buf[1] = 0x4d          // "BM"
  buf.writeUInt32LE(fileSize, 2)
  buf.writeUInt32LE(54, 10)             // pixel data starts at byte 54

  // ── BITMAPINFOHEADER (40 bytes) ───────────────────────────────────────────
  buf.writeUInt32LE(40, 14)             // header size
  buf.writeInt32LE(width, 18)
  buf.writeInt32LE(-height, 22)         // negative = top-down row order
  buf.writeUInt16LE(1, 26)              // color planes = 1
  buf.writeUInt16LE(24, 28)             // 24-bit RGB (no alpha)
  buf.writeUInt32LE(0, 30)              // BI_RGB — no compression
  buf.writeUInt32LE(pixelBytes, 34)
  buf.writeInt32LE(2835, 38)            // ~72 DPI horizontal
  buf.writeInt32LE(2835, 42)            // ~72 DPI vertical

  // ── Pixel data: RGBA → BGR, row-major ────────────────────────────────────
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const src = (y * width + x) * 4
      const dst = 54 + y * rowBytes + x * 3
      buf[dst]     = rgba[src + 2]   // B
      buf[dst + 1] = rgba[src + 1]   // G
      buf[dst + 2] = rgba[src]       // R
    }
  }

  return buf
}

// ─── Tier 1: pdfjs-dist text-layer extraction (pure JS, no rendering) ────────
// Works for every text-based and mixed PDF. Fast and allocation-light.
async function extractTextLayer(
  pdfjsLib: any,
  buffer: Buffer,
): Promise<string[]> {
  pdfjsLib.GlobalWorkerOptions.workerSrc = ""

  const pdf = await pdfjsLib
    .getDocument({ data: new Uint8Array(buffer), useSystemFonts: true })
    .promise

  const total = Math.min(pdf.numPages, MAX_PAGES)
  const pageTexts: string[] = []

  for (let n = 1; n <= total; n++) {
    const page = await pdf.getPage(n)
    const content = await page.getTextContent()
    const text = content.items
      .map((item: any) => ("str" in item ? item.str : ""))
      .join(" ")
      .trim()
    pageTexts.push(text)
    page.cleanup()
  }

  await pdf.destroy()
  return pageTexts
}

// ─── Tier 2: extract embedded RGBA image data from page objects ───────────────
// After getOperatorList() resolves, pdfjs-dist has decoded every embedded image
// and stored its RGBA pixel data in page.objs. We grab it directly — no canvas
// rendering needed, no native bindings required.
async function extractPageImages(
  pdfjsLib: any,
  buffer: Buffer,
  targetPages: number[],   // 1-based page numbers that need OCR
): Promise<Map<number, { data: Uint8ClampedArray; width: number; height: number }>> {
  pdfjsLib.GlobalWorkerOptions.workerSrc = ""

  const pdf = await pdfjsLib
    .getDocument({ data: new Uint8Array(buffer), useSystemFonts: true })
    .promise

  // OPS.paintImageXObject = 85 in all current pdfjs-dist versions
  const PAINT_IMAGE_OP: number = pdfjsLib.OPS?.paintImageXObject ?? 85

  const results = new Map<
    number,
    { data: Uint8ClampedArray; width: number; height: number }
  >()

  for (const pageNum of targetPages) {
    if (pageNum > Math.min(pdf.numPages, MAX_PAGES)) continue

    const page = await pdf.getPage(pageNum)
    try {
      // getOperatorList() populates page.objs with all decoded resources
      const ops = await page.getOperatorList()

      const imgNames = new Set<string>()
      for (let i = 0; i < ops.fnArray.length; i++) {
        if (ops.fnArray[i] === PAINT_IMAGE_OP) {
          const name = ops.argsArray[i]?.[0]
          if (typeof name === "string") imgNames.add(name)
        }
      }

      // Pick the largest image on the page — most likely the scanned content
      let best: { data: Uint8ClampedArray; width: number; height: number } | null = null

      for (const name of imgNames) {
        // Try page-local objects first, then document-level common objects
        let obj: any = null
        try { obj = (page as any).objs.get(name) } catch { /* not in page objs */ }
        if (!obj) {
          try { obj = (page as any).commonObjs.get(name) } catch { /* not in common objs */ }
        }
        if (!obj?.data || !obj.width || !obj.height) continue

        const candidate = {
          data: obj.data instanceof Uint8ClampedArray
            ? obj.data
            : new Uint8ClampedArray(obj.data.buffer ?? obj.data),
          width:  obj.width  as number,
          height: obj.height as number,
        }

        if (!best || candidate.width * candidate.height > best.width * best.height) {
          best = candidate
        }
      }

      if (best) results.set(pageNum, best)
    } catch {
      // Operator list or object access failed for this page — skip silently
    }

    page.cleanup()
  }

  await pdf.destroy()
  return results
}

// ─── OCR one BMP buffer, hard-capped at timeoutMs ────────────────────────────
async function ocrBuffer(
  worker: any,
  bmpBuf: Buffer,
  timeoutMs: number,
): Promise<string> {
  const ocr = worker.recognize(bmpBuf).then((r: any) => r.data.text ?? "")
  const abort = new Promise<string>((_, rej) =>
    setTimeout(() => rej(new Error("OCR timeout")), timeoutMs),
  )
  return Promise.race([ocr, abort])
}

// ─── Route handler ────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get("file") as File | null

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    const bytes  = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    const name   = file.name.toLowerCase()
    const mime   = file.type
    let   text   = ""

    // ── DOCX ──────────────────────────────────────────────────────────────────
    if (
      mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      name.endsWith(".docx")
    ) {
      const mammoth = await import("mammoth")
      text = (await mammoth.extractRawText({ buffer })).value.trim()

    // ── TXT ───────────────────────────────────────────────────────────────────
    } else if (mime === "text/plain" || name.endsWith(".txt")) {
      text = buffer.toString("utf-8").trim()

    // ── RTF ───────────────────────────────────────────────────────────────────
    } else if (
      mime === "application/rtf" ||
      mime === "text/rtf"         ||
      name.endsWith(".rtf")
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
    } else if (mime === "application/pdf" || name.endsWith(".pdf")) {
      const pdfjsLib = await import("pdfjs-dist")

      // Tier 1 — text layer (handles standard + mixed PDFs instantly)
      const pageTexts = await extractTextLayer(pdfjsLib, buffer)

      // Find which pages are image-only / scanned
      const scannedPages = pageTexts
        .map((t, i) => ({ t, n: i + 1 }))
        .filter(({ t }) => t.length < MIN_CHARS_PER_PAGE)
        .map(({ n }) => n)

      // Tier 2 — OCR only the scanned pages
      if (scannedPages.length > 0) {
        try {
          const imageMap = await extractPageImages(pdfjsLib, buffer, scannedPages)

          if (imageMap.size > 0) {
            const { createWorker } = await import("tesseract.js")
            const worker = await createWorker("eng")

            try {
              for (const [pageNum, { data, width, height }] of imageMap) {
                try {
                  const bmp     = rgbaToBmp(data, width, height)
                  const ocrText = await ocrBuffer(worker, bmp, OCR_TIMEOUT_MS)
                  pageTexts[pageNum - 1] = ocrText.trim()
                } catch {
                  // OCR timed out or failed for this page — leave as-is
                }
              }
            } finally {
              await worker.terminate()
            }
          }
        } catch {
          // Tier 2 failed entirely — fall through with whatever Tier 1 extracted
        }
      }

      text = pageTexts.join("\n").trim()

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

    // ── Resume length check ───────────────────────────────────────────────────
    const tooLong = text.length > TOO_LONG_CHARS

    return NextResponse.json({ text, tooLong })
  } catch (error) {
    console.error("Parse resume error:", error)
    return NextResponse.json(
      { error: "Failed to parse resume. Please try a different file." },
      { status: 500 },
    )
  }
}
