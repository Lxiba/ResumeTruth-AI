import { NextRequest, NextResponse } from "next/server"
import { analyzeResume } from "@/lib/openrouter"
import type { JobInfo } from "@/types"

// Allow up to 60 seconds — LLM inference can be slow
export const maxDuration = 60

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { resumeText, jobInfo } = body as {
      resumeText: string
      jobInfo: JobInfo
    }

    if (!resumeText?.trim()) {
      return NextResponse.json(
        { error: "Resume text is required" },
        { status: 400 }
      )
    }

    if (!jobInfo?.title?.trim() || !jobInfo?.description?.trim()) {
      return NextResponse.json(
        { error: "Job title and description are required" },
        { status: 400 }
      )
    }

    const result = await analyzeResume(resumeText, jobInfo)
    return NextResponse.json(result)
  } catch (error) {
    console.error("Analyze error:", error)

    let message =
      error instanceof Error ? error.message : "Analysis failed. Please try again."

    // Surface a clearer message when the API key is missing in the deployment environment
    if (message.includes("HUGGINGFACE_API_KEY")) {
      message =
        "Server configuration error: HUGGINGFACE_API_KEY is not set. " +
        "Add it to .env.local for local development, or to the Environment Variables " +
        "section in your Vercel/hosting dashboard for production."
    }

    return NextResponse.json({ error: message }, { status: 500 })
  }
}
