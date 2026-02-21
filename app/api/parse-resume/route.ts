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

// ─── Tier 2 & 3: pdfjs-dist direct + ML OCR via tesseract.js ────────────────
// Used when pdf-parse returns empty (scanned / image-based PDFs)
async function extractWithOCR(buffer: Buffer): Promise<string> {
  // Dynamically import to allow graceful failure if native bindings are missing
  const [pdfjsModule, canvasModule, tesseractModule] = await Promise.all([
    import("pdfjs-dist"),
    import("canvas"),
    import("tesseract.js"),
  ])

  const pdfjsLib = pdfjsModule
  const { createCanvas } = canvasModule
  const Tesseract = "default" in tesseractModule
    ? (tesseractModule as any).default
    : tesseractModule

  // Disable the PDF.js web worker — we're in Node.js, not a browser
  pdfjsLib.GlobalWorkerOptions.workerSrc = ""

  const pdf = await pdfjsLib
    .getDocument({ data: new Uint8Array(buffer), useSystemFonts: true })
    .promise

  const maxPages = Math.min(pdf.numPages, 10) // cap at 10 pages for performance
  let allText = ""

  for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
    const page = await pdf.getPage(pageNum)

    // ── Tier 2: try direct text extraction via pdfjs-dist first ─────────────
    const textContent = await page.getTextContent()
    const pageText = textContent.items
      .map((item: any) => ("str" in item ? item.str : ""))
      .join(" ")
      .trim()

    if (pageText.length >= 20) {
      // Page has selectable text — no need to OCR
      allText += pageText + "\n"
      continue
    }

    // ── Tier 3: render page to image and run ML OCR (tesseract.js) ──────────
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

      // ── Tier 2 + 3: ML OCR fallback for image/scanned PDFs ───────────────
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
    } else {
      return NextResponse.json(
        { error: "Unsupported file type. Please upload a PDF or DOCX file." },
        { status: 400 }
      )
    }

    text = text.trim()
    if (!text) {
      return NextResponse.json(
        {
          error:
            "Could not extract text from this file. " +
            "If your PDF is a scanned image, OCR may need additional setup. " +
            "Try converting to DOCX for best results.",
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
