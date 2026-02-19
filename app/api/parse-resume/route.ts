import { NextRequest, NextResponse } from "next/server"

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

    const fileName = file.name.toLowerCase()
    const mimeType = file.type

    if (mimeType === "application/pdf" || fileName.endsWith(".pdf")) {
      const { PDFParse } = await import("pdf-parse")
      const parser = new PDFParse({ data: buffer })
      const result = await parser.getText()
      text = result.text
      await parser.destroy()
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
        { error: "Could not extract text from the file. The file may be empty or image-based." },
        { status: 422 }
      )
    }

    return NextResponse.json({ text })
  } catch (error) {
    console.error("Parse resume error:", error)
    return NextResponse.json(
      { error: "Failed to parse resume. Please try a different file." },
      { status: 500 }
    )
  }
}
