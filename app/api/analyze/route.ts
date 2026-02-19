import { NextRequest, NextResponse } from "next/server"
import { analyzeResume } from "@/lib/openrouter"
import type { JobInfo } from "@/types"

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
    const message =
      error instanceof Error ? error.message : "Analysis failed. Please try again."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
