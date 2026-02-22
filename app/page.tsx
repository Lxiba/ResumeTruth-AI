"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Sparkles, AlertCircle, Download, Highlighter, Check } from "lucide-react"
import { UploadZone } from "@/components/upload-zone"
import { JobForm } from "@/components/job-form"
import { GenerateButton } from "@/components/generate-button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import type { JobInfo, AnalysisResult, OptimizeMode } from "@/types"

const DEFAULT_JOB_INFO: JobInfo = {
  title: "",
  company: "",
  description: "",
  generateCoverLetter: false,
  optimizeMode: "full",
}

interface ModeCard {
  mode: OptimizeMode
  title: string
  tagline: string
  description: string
  bullets: string[]
  Icon: React.ElementType
  accent: string
}

const MODE_CARDS: ModeCard[] = [
  {
    mode: "full",
    title: "Full Optimization",
    tagline: "Download-ready PDF",
    description:
      "AI rewrites your entire resume, preserving your section structure, and optimizes every line for the role.",
    bullets: [
      "ATS keyword injection",
      "Stronger impact statements",
      "Optional cover letter",
    ],
    Icon: Download,
    accent: "purple",
  },
  {
    mode: "annotate",
    title: "Annotated Review",
    tagline: "Edit your own document",
    description:
      "AI highlights specific phrases in your resume with color-coded notes — what to remove, what to replace, and what to reformat.",
    bullets: [
      "Your original document stays untouched",
      "3-color inline highlights",
      "Click any highlight for a specific note",
      "Preserves embedded hyperlinks",
    ],
    Icon: Highlighter,
    accent: "amber",
  },
]

export default function HomePage() {
  const router = useRouter()
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [jobInfo, setJobInfo] = useState<JobInfo>(DEFAULT_JOB_INFO)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleModeChange = (mode: OptimizeMode) => {
    setJobInfo((prev) => ({ ...prev, optimizeMode: mode }))
  }

  // Safely parse JSON from a fetch response.
  // If the server returns a non-JSON body (e.g. a Vercel HTML error page on
  // crash or timeout), this throws a friendly message instead of a raw
  // "Unexpected token" parse error.
  const safeJson = async (response: Response): Promise<any> => {
    const text = await response.text()
    try {
      return JSON.parse(text)
    } catch {
      if (response.status === 504 || response.status === 524) {
        throw new Error("The request timed out. Please try again.")
      }
      if (response.status >= 500) {
        throw new Error("A server error occurred. Please try again in a moment.")
      }
      throw new Error("Unexpected server response. Please try again.")
    }
  }

  const handleGenerate = async () => {
    setError(null)

    if (!selectedFile) {
      setError("Please upload your resume (PDF or DOCX).")
      return
    }
    if (!jobInfo.title.trim()) {
      setError("Please enter the job title.")
      return
    }
    if (!jobInfo.description.trim()) {
      setError("Please enter the job description.")
      return
    }

    setIsLoading(true)

    try {
      // Step 1: Parse resume
      const formData = new FormData()
      formData.append("file", selectedFile)

      const parseResponse = await fetch("/api/parse-resume", {
        method: "POST",
        body: formData,
      })

      const parseData = await safeJson(parseResponse)
      if (!parseResponse.ok) {
        throw new Error(parseData.error || "Failed to parse resume")
      }

      const resumeText: string = parseData.text

      // Step 2: Analyze
      const analyzeResponse = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumeText, jobInfo }),
      })

      const result = await safeJson(analyzeResponse)
      if (!analyzeResponse.ok) {
        throw new Error(result.error || "Analysis failed")
      }

      // Step 3: Store and navigate
      sessionStorage.setItem("analysisResult", JSON.stringify(result as AnalysisResult))
      sessionStorage.setItem("jobInfo", JSON.stringify(jobInfo))
      // Store original text for annotate mode highlighting
      sessionStorage.setItem("originalResumeText", resumeText)

      router.push("/results")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0B1F3A] to-[#2A0E4A]">
      {/* Header */}
      <header className="border-b border-purple-900/40 bg-[#0B1F3A]/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl items-center gap-2.5 px-4 py-4">
          <Sparkles className="h-6 w-6 text-purple-400" />
          <span className="text-lg font-bold text-white">ResumeTruth AI</span>
        </div>
      </header>

      {/* Hero */}
      <div className="mx-auto max-w-5xl px-4 py-12 text-center">
        <h1 className="mt-6 text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
          Know Your{" "}
          <span className="bg-gradient-to-r from-purple-400 to-purple-600 bg-clip-text text-transparent">
            Real Chances!
          </span>
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-base text-purple-300">
          Get an honest hiring probability score, missing skills, and actionable improvements — in seconds.
        </p>
      </div>

      {/* Main Form */}
      <main className="mx-auto max-w-3xl space-y-5 px-4 pb-20">
        {/* Resume Upload */}
        <Card className="border-purple-800/30 bg-[#2A0E4A]/60 backdrop-blur-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold text-white">
              Upload Your Resume
            </CardTitle>
          </CardHeader>
          <CardContent>
            <UploadZone
              onFileSelect={setSelectedFile}
              selectedFile={selectedFile}
              onClear={() => setSelectedFile(null)}
            />
          </CardContent>
        </Card>

        {/* Job Info */}
        <Card className="border-purple-800/30 bg-[#2A0E4A]/60 backdrop-blur-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold text-white">
              Job Details
            </CardTitle>
          </CardHeader>
          <CardContent>
            <JobForm jobInfo={jobInfo} onChange={setJobInfo} />
          </CardContent>
        </Card>

        {/* Mode Selection */}
        <div className="space-y-3">
          <p className="text-sm font-semibold text-purple-200">
            Choose your output mode
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {MODE_CARDS.map(({ mode, title, tagline, description, bullets, Icon, accent }) => {
              const isSelected = jobInfo.optimizeMode === mode
              const borderColor =
                isSelected
                  ? accent === "purple"
                    ? "border-purple-500"
                    : "border-amber-500"
                  : "border-purple-800/30"
              const iconColor = accent === "purple" ? "text-purple-400" : "text-amber-400"
              const taglineColor = accent === "purple" ? "text-purple-400" : "text-amber-400"

              return (
                <button
                  key={mode}
                  onClick={() => handleModeChange(mode)}
                  className={`relative flex flex-col gap-3 rounded-xl border-2 bg-[#2A0E4A]/60 p-5 text-left backdrop-blur-sm transition-all duration-200 hover:bg-purple-900/20 ${borderColor}`}
                >
                  {/* Selected checkmark */}
                  {isSelected && (
                    <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-purple-600">
                      <Check className="h-3 w-3 text-white" />
                    </span>
                  )}

                  <div className="flex items-center gap-2.5">
                    <Icon className={`h-5 w-5 shrink-0 ${iconColor}`} />
                    <div>
                      <p className="text-sm font-bold text-white">{title}</p>
                      <p className={`text-xs font-medium ${taglineColor}`}>{tagline}</p>
                    </div>
                  </div>

                  <p className="text-xs leading-relaxed text-purple-300">{description}</p>

                  <ul className="space-y-1.5">
                    {bullets.map((b) => (
                      <li key={b} className="flex items-start gap-1.5 text-xs text-purple-400">
                        <span className={`mt-0.5 text-[10px] ${iconColor}`}>✓</span>
                        {b}
                      </li>
                    ))}
                  </ul>
                </button>
              )
            })}
          </div>
        </div>

        <Separator className="border-purple-900/40" />

        {/* Error */}
        {error && (
          <div className="flex items-start gap-2.5 rounded-lg border border-red-500/30 bg-red-900/20 px-4 py-3 text-sm text-red-300">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
            {error}
          </div>
        )}

        {/* Submit */}
        <GenerateButton
          onClick={handleGenerate}
          isLoading={isLoading}
          disabled={isLoading}
        />
      </main>
    </div>
  )
}
