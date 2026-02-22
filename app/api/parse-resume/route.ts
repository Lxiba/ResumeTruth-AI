import { NextRequest, NextResponse } from "next/server"
import path from "path"
import { pathToFileURL } from "url"

export const runtime = "nodejs"
export const maxDuration = 60

// ─────────────────────────────────────────
// Limits
// ─────────────────────────────────────────
const MAX_PAGES = 10
const MIN_CHARS_PER_PAGE = 50
const TOO_LONG_CHARS = 8000
const OCR_TIMEOUT_MS = 20000
const OCR_SPACE_TIMEOUT_MS = 30000
const OCR_SPACE_MAX_BYTES = 1_000_000

// ─────────────────────────────────────────
// PDF.js Worker
// ─────────────────────────────────────────
const PDFJS_WORKER_URL = pathToFileURL(
  path.resolve(
    process.cwd(),
    "node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs"
  )
).href

// ─────────────────────────────────────────
// Tier 1 — OCR.space (Cloud)
// ─────────────────────────────────────────
async function extractWithOcrSpace(buffer: Buffer): Promise<string> {
  if (buffer.length > OCR_SPACE_MAX_BYTES) {
    throw new Error("File exceeds OCR.space 1MB free limit")
  }

  const apiKey = process.env.OCR_SPACE_API_KEY
  if (!apiKey) throw new Error("OCR_SPACE_API_KEY missing")

  const form = new FormData()
  form.append("apikey", apiKey)
  form.append("language", "eng")
  form.append("OCREngine", "2")
  form.append("file", new Blob([buffer]), "resume.pdf")

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), OCR_SPACE_TIMEOUT_MS)

  try {
    const resp = await fetch("https://api.ocr.space/parse/image", {
      method: "POST",
      body: form,
      signal: controller.signal,
    })

    if (!resp.ok) throw new Error(`OCR.space HTTP ${resp.status}`)

    const data: any = await resp.json()

    if (data.IsErroredOnProcessing) {
      throw new Error(data.ErrorMessage || "OCR processing error")
    }

    const text = (data.ParsedResults || [])
      .map((r: any) => r.ParsedText || "")
      .join("\n")
      .trim()

    if (!text) throw new Error("Empty OCR result")

    return text
  } finally {
    clearTimeout(timer)
  }
}

// ─────────────────────────────────────────
// Tier 2 — PDF.js Text Extraction
// ─────────────────────────────────────────
async function extractWithPdfJs(buffer: Buffer): Promise<string> {
  let pdfjs: any

  try {
    pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs")
    pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL
  } catch {
    return ""
  }

  try {
    const pdf = await pdfjs.getDocument({
      data: new Uint8Array(buffer),
      disableStream: true,
      disableRange: true,
      useSystemFonts: false,
    }).promise

    const total = Math.min(pdf.numPages, MAX_PAGES)
    const pages: string[] = []

    for (let i = 1; i <= total; i++) {
      const page = await pdf.getPage(i)
      const content = await page.getTextContent()

      const text = content.items
        .map((item: any) => item.str || "")
        .join(" ")
        .trim()

      pages.push(text)
      page.cleanup?.()
    }

    await pdf.destroy().catch(() => {})

    return pages.join("\n").trim()
  } catch {
    return ""
  }
}

// ─────────────────────────────────────────
// Master PDF Processor
// ─────────────────────────────────────────
async function processPdf(buffer: Buffer): Promise<string> {
  // Try OCR.space first (handles scanned + text PDFs)
  try {
    const cloudText = await extractWithOcrSpace(buffer)
    if (cloudText.length > MIN_CHARS_PER_PAGE) {
      return cloudText
    }
  } catch (err) {
    console.warn("OCR.space failed — falling back to PDF.js")
  }

  // Fallback to local PDF.js
  return extractWithPdfJs(buffer)
}

// ─────────────────────────────────────────
// Route Handler
// ─────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get("file") as File | null

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      )
    }

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    const filename = file.name.toLowerCase()
    const mime = file.type

    let text = ""

    // ───────────────── DOCX ─────────────────
    if (
      mime ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      filename.endsWith(".docx")
    ) {
      const mammoth = await import("mammoth")
      text = (await mammoth.extractRawText({ buffer })).value.trim()

    // ───────────────── TXT ─────────────────
    } else if (mime === "text/plain" || filename.endsWith(".txt")) {
      text = buffer.toString("utf-8").trim()

    // ───────────────── PDF ─────────────────
    } else if (mime === "application/pdf" || filename.endsWith(".pdf")) {
      text = await processPdf(buffer)

    // ───────────────── Unsupported ─────────────────
    } else {
      return NextResponse.json(
        {
          error:
            "Unsupported file type. Please upload a PDF, DOCX, or TXT file.",
        },
        { status: 400 }
      )
    }

    if (!text) {
      return NextResponse.json(
        {
          error:
            "Could not extract text from this file. " +
            "If this is a scanned PDF, try exporting it as DOCX for best results.",
        },
        { status: 422 }
      )
    }

    const tooLong = text.length > TOO_LONG_CHARS

    return NextResponse.json({
      text,
      tooLong,
    })

  } catch (err) {
    console.error("Unhandled resume parse error:", err)

    return NextResponse.json(
      { error: "Failed to parse resume. Please try again." },
      { status: 500 }
    )
  }
}
