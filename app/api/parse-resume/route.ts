import { NextRequest, NextResponse } from "next/server"

// Allow up to 60 seconds — OCR on multi-page scanned PDFs can be slow
export const maxDuration = 60

// ─── Tier 1: pdf-parse (fast, reliable for text-based PDFs) ─────────────────
async function extractWithPdfParse(buffer: Buffer): Promise<string> {
  const { PDFParse } = await import("pdf-parse")
  const parser = new PDFParse({ data: buffer })
  const result = await parser.getText()
  await parser.destroy()
  return result.text?.trim() ?? ""
}

// ─── Tier 2: pdfjs-dist text layer extraction (pure JS, no native bindings) ──
// Works in any Node.js environment including Vercel serverless
async function extractWithPdfJs(buffer: Buffer): Promise<string> {
  const pdfjsLib = await import("pdfjs-dist")
  // Disable the PDF.js web worker — we're in Node.js, not a browser
  pdfjsLib.GlobalWorkerOptions.workerSrc = ""

  const pdf = await pdfjsLib
    .getDocument({ data: new Uint8Array(buffer), useSystemFonts: true })
    .promise

  const maxPages = Math.min(pdf.numPages, 10) // cap at 10 pages for performance
  let allText = ""

  for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
    const page = await pdf.getPage(pageNum)
    const textContent = await page.getTextContent()
    const pageText = textContent.items
      .map((item: any) => ("str" in item ? item.str : ""))
      .join(" ")
      .trim()
    if (pageText) allText += pageText + "\n"
  }

  return allText.trim()
}

// ─── Tier 3: ML OCR via canvas + tesseract.js ────────────────────────────────
// Requires native bindings (canvas/Cairo) — may not be available on all hosts.
// Imported separately so a missing native binding doesn't kill Tier 2.
async function extractWithOCR(buffer: Buffer): Promise<string> {
  // Each import is separate so a failure in canvas doesn't block pdfjs-dist
  const pdfjsLib = await import("pdfjs-dist")
  const { createCanvas } = await import("canvas")
  const tesseractModule = await import("tesseract.js")
  const Tesseract = "default" in tesseractModule
    ? (tesseractModule as any).default
    : tesseractModule

  pdfjsLib.GlobalWorkerOptions.workerSrc = ""

  const pdf = await pdfjsLib
    .getDocument({ data: new Uint8Array(buffer), useSystemFonts: true })
    .promise

  const maxPages = Math.min(pdf.numPages, 10)
  let allText = ""

  for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
    const page = await pdf.getPage(pageNum)
    const scale = 2.0 // higher scale → better OCR accuracy
    const viewport = page.getViewport({ scale })

    const canvas = createCanvas(
      Math.round(viewport.width),
      Math.round(viewport.height)
    )
    const ctx = canvas.getContext("2d")

    await page.render({
      canvasContext: ctx as unknown as CanvasRenderingContext2D,
      // pdfjs-dist v5 requires the canvas element itself in addition to the context
      canvas: canvas as unknown as HTMLCanvasElement,
      viewport,
    }).promise

    const pngBuffer = canvas.toBuffer("image/png")

    // ML OCR: LSTM neural-network model via tesseract.js
    const { data: { text } } = await Tesseract.recognize(pngBuffer, "eng", {
      logger: () => {}, // silence progress logs in server output
    })
    allText += text + "\n"
  }

  return allText.trim()
}

// ─── Route handler ───────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get("file") as File | null

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    let text = ""
    let extractionMethod = "pdf-parse"

    const fileName = file.name.toLowerCase()
    const mimeType = file.type

    if (mimeType === "application/pdf" || fileName.endsWith(".pdf")) {
      // ── Tier 1: fast text extraction ──────────────────────────────────────
      try {
        text = await extractWithPdfParse(buffer)
      } catch (err) {
        console.error("pdf-parse error:", err)
      }

      // ── Tier 2: pdfjs-dist pure-JS extraction ─────────────────────────────
      if (!text || text.length < 50) {
        try {
          text = await extractWithPdfJs(buffer)
          extractionMethod = "pdfjs"
        } catch (err) {
          console.error("pdfjs extraction error:", err)
        }
      }

      // ── Tier 3: ML OCR fallback for image/scanned PDFs ───────────────────
      if (!text || text.length < 50) {
        try {
          text = await extractWithOCR(buffer)
          extractionMethod = "ocr"
        } catch (ocrErr) {
          console.error("OCR extraction error:", ocrErr)
          // OCR failed — text stays empty, will return 422 below
        }
      }
    } else if (
      mimeType ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      fileName.endsWith(".docx")
    ) {
      const mammoth = await import("mammoth")
      const result = await mammoth.extractRawText({ buffer })
      text = result.value
    } else if (
      mimeType === "text/plain" ||
      fileName.endsWith(".txt")
    ) {
      // Plain text — decode directly
      text = buffer.toString("utf-8")
      extractionMethod = "txt"
    } else if (
      mimeType === "application/rtf" ||
      mimeType === "text/rtf" ||
      fileName.endsWith(".rtf")
    ) {
      // RTF — strip all RTF control words and braces to get plain text
      const raw = buffer.toString("utf-8")
      text = raw
        .replace(/\\\n/g, "\n")                          // escaped newlines
        .replace(/\\[a-z]+\d*\s?/gi, "")                 // control words like \par \b0 \fs24
        .replace(/\{|\}/g, "")                           // braces
        .replace(/\\'/gi, "'")                           // escaped apostrophes
        .replace(/\r\n|\r/g, "\n")                       // normalize line endings
        .replace(/\n{3,}/g, "\n\n")                      // collapse excessive blank lines
        .trim()
      extractionMethod = "rtf"
    } else {
      return NextResponse.json(
        { error: "Unsupported file type. Please upload a PDF, DOCX, TXT, or RTF file." },
        { status: 400 }
      )
    }

    text = text.trim()
    if (!text) {
      return NextResponse.json(
        {
          error:
            "Could not extract text from this PDF. It may be image-based or scanned. " +
            "Please try converting it to a text-based PDF or DOCX for best results.",
        },
        { status: 422 }
      )
    }

    return NextResponse.json({ text, extractionMethod })
  } catch (error) {
    console.error("Parse resume error:", error)
    return NextResponse.json(
      { error: "Failed to parse resume. Please try a different file." },
      { status: 500 }
    )
  }
}
