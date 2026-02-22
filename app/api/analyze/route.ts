import { NextRequest, NextResponse } from "next/server"
import { analyzeResume } from "@/lib/openrouter"
import type { JobInfo } from "@/types"

export const runtime = "nodejs"
export const maxDuration = 60

const OCR_SPACE_TIMEOUT_MS = 30000
const OCR_SPACE_MAX_BYTES = 1_000_000

// ─────────────────────────────────────────
// OCR.space Extraction (PDF support)
// ─────────────────────────────────────────
async function extractWithOcrSpace(buffer: Buffer): Promise<string> {
  if (buffer.length > OCR_SPACE_MAX_BYTES) {
    throw new Error("File exceeds OCR.space 1MB free-tier limit")
  }

  const apiKey = process.env.OCR_SPACE_API_KEY
  if (!apiKey) {
    throw new Error("OCR_SPACE_API_KEY is not set")
  }

  const form = new FormData()
  form.append("apikey", apiKey)
  form.append("language", "eng")
  form.append("OCREngine", "2")

  // ✅ FIXED TypeScript Blob issue
  form.append(
    "file",
    new Blob([new Uint8Array(buffer)]),
    "resume.pdf"
  )

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), OCR_SPACE_TIMEOUT_MS)

  try {
    const response = await fetch("https://api.ocr.space/parse/image", {
      method: "POST",
      body: form,
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new Error(`OCR.space HTTP ${response.status}`)
    }

    const data: any = await response.json()

    if (data.IsErroredOnProcessing) {
      throw new Error(
        Array.isArray(data.ErrorMessage)
          ? data.ErrorMessage.join(", ")
          : data.ErrorMessage || "OCR processing error"
      )
    }

    const text = (data.ParsedResults || [])
      .map((r: any) => r.ParsedText || "")
      .join("\n")
      .trim()

    if (!text) {
      throw new Error("OCR returned empty text")
    }

    return text
  } finally {
    clearTimeout(timeout)
  }
}

// ─────────────────────────────────────────
// Main Route
// ─────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    let resumeText = ""
    let jobInfo: JobInfo | null = null

    const contentType = request.headers.get("content-type") || ""

    // ─────────────────────────────
    // JSON Request (Text Resume)
    // ─────────────────────────────
    if (contentType.includes("application/json")) {
      const body = await request.json()
      resumeText = body.resumeText
      jobInfo = body.jobInfo
    }

    // ─────────────────────────────
    // Multipart FormData (File Upload)
    // ─────────────────────────────
    else if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData()

      const file = formData.get("file") as File | null
      const jobInfoRaw = formData.get("jobInfo") as string | null

      if (!jobInfoRaw) {
        return NextResponse.json(
          { error: "Job information is required" },
          { status: 400 }
        )
      }

      jobInfo = JSON.parse(jobInfoRaw)

      if (!file) {
        return NextResponse.json(
          { error: "Resume file is required" },
          { status: 400 }
        )
      }

      const bytes = await file.arrayBuffer()
      const buffer = Buffer.from(bytes)

      const filename = file.name.toLowerCase()
      const mime = file.type

      // ───────────── PDF → OCR.space ─────────────
      if (mime === "application/pdf" || filename.endsWith(".pdf")) {
        resumeText = await extractWithOcrSpace(buffer)
      }

      // ───────────── DOCX ─────────────
      else if (
        mime ===
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
        filename.endsWith(".docx")
      ) {
        const mammoth = await import("mammoth")
        resumeText = (await mammoth.extractRawText({ buffer })).value.trim()
      }

      // ───────────── TXT ─────────────
      else if (mime === "text/plain" || filename.endsWith(".txt")) {
        resumeText = buffer.toString("utf-8").trim()
      }

      else {
        return NextResponse.json(
          {
            error:
              "Unsupported file type. Please upload PDF, DOCX, or TXT.",
          },
          { status: 400 }
        )
      }
    }

    else {
      return NextResponse.json(
        { error: "Unsupported content type" },
        { status: 400 }
      )
    }

    // ─────────────────────────────
    // Validation
    // ─────────────────────────────
    if (!resumeText?.trim()) {
      return NextResponse.json(
        { error: "Could not extract resume text." },
        { status: 422 }
      )
    }

    if (!jobInfo?.title?.trim() || !jobInfo?.description?.trim()) {
      return NextResponse.json(
        { error: "Job title and description are required" },
        { status: 400 }
      )
    }

    const currentDate = new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    })

    const result = await analyzeResume(
      resumeText,
      jobInfo,
      currentDate
    )

    return NextResponse.json(result)

  } catch (error) {
    console.error("Analyze error:", error)

    let message =
      error instanceof Error
        ? error.message
        : "Analysis failed. Please try again."

    if (message.includes("OCR_SPACE_API_KEY")) {
      message =
        "Server configuration error: OCR_SPACE_API_KEY is not set. " +
        "Add it to your environment variables in Vercel or .env.local."
    }

    if (message.includes("HUGGINGFACE_API_KEY")) {
      message =
        "Server configuration error: HUGGINGFACE_API_KEY is not set. " +
        "Add it to your environment variables in Vercel or .env.local."
    }

    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
