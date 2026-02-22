import { NextRequest, NextResponse } from "next/server"
import { analyzeResume } from "@/lib/openrouter"
import type { JobInfo } from "@/types"

export const maxDuration = 60

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()

    const resumeTextInput = formData.get("resumeText") as string | null
    const file = formData.get("file") as File | null
    const jobInfoRaw = formData.get("jobInfo") as string | null

    if (!jobInfoRaw) {
      return NextResponse.json(
        { error: "Job information is required" },
        { status: 400 }
      )
    }

    const jobInfo: JobInfo = JSON.parse(jobInfoRaw)

    if (!jobInfo?.title?.trim() || !jobInfo?.description?.trim()) {
      return NextResponse.json(
        { error: "Job title and description are required" },
        { status: 400 }
      )
    }

    let resumeText = ""

    // ─────────────────────────────
    // Case 1: Direct Text
    // ─────────────────────────────
    if (resumeTextInput?.trim()) {
      resumeText = resumeTextInput.trim()
    }

    // ─────────────────────────────
    // Case 2: File Upload (PDF/DOCX/TXT)
    // ─────────────────────────────
    else if (file) {
      const parseResponse = await fetch(
        `${process.env.NEXT_PUBLIC_BASE_URL || ""}/api/parse-resume`,
        {
          method: "POST",
          body: (() => {
            const fd = new FormData()
            fd.append("file", file)
            return fd
          })(),
        }
      )

      const parsed = await parseResponse.json()

      if (!parseResponse.ok || !parsed.text) {
        return NextResponse.json(
          { error: parsed.error || "Failed to extract resume text." },
          { status: 422 }
        )
      }

      resumeText = parsed.text
    }

    else {
      return NextResponse.json(
        { error: "Resume text or file is required" },
        { status: 400 }
      )
    }

    if (!resumeText.trim()) {
      return NextResponse.json(
        { error: "Could not extract text from the resume." },
        { status: 422 }
      )
    }

    // Generate real server date for cover letter
    const currentDate = new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    })

    const result = await analyzeResume(resumeText, jobInfo, currentDate)

    return NextResponse.json(result)

  } catch (error) {
    console.error("Analyze error:", error)

    let message =
      error instanceof Error
        ? error.message
        : "Analysis failed. Please try again."

    if (message.includes("HUGGINGFACE_API_KEY")) {
      message =
        "Server configuration error: HUGGINGFACE_API_KEY is not set. " +
        "Add it to your environment variables in Vercel or .env.local."
    }

    return NextResponse.json({ error: message }, { status: 500 })
  }
}
