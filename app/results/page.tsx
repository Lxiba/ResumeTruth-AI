"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Sparkles, Download, Highlighter } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ProbabilityScore } from "@/components/results/probability-score"
import { MissingSkills } from "@/components/results/missing-skills"
import { StrengthAnalysis } from "@/components/results/strength-analysis"
import { ResumePreview } from "@/components/results/resume-preview"
import { CoverLetterPreview } from "@/components/results/cover-letter-preview"
import { AiExplanation } from "@/components/results/ai-explanation"
import { DownloadButton } from "@/components/results/download-button"
import { AnnotatedResume } from "@/components/results/annotated-resume"
import type { AnalysisResult, JobInfo } from "@/types"

export default function ResultsPage() {
  const router = useRouter()
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [jobInfo, setJobInfo] = useState<JobInfo | null>(null)
  const [originalResumeText, setOriginalResumeText] = useState("")

  useEffect(() => {
    const stored = sessionStorage.getItem("analysisResult")
    const storedJob = sessionStorage.getItem("jobInfo")
    const storedOriginal = sessionStorage.getItem("originalResumeText")
    if (!stored) {
      router.replace("/")
      return
    }
    setResult(JSON.parse(stored) as AnalysisResult)
    if (storedJob) setJobInfo(JSON.parse(storedJob) as JobInfo)
    if (storedOriginal) setOriginalResumeText(storedOriginal)
  }, [router])

  if (!result) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0B1F3A]">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-purple-700 border-t-purple-300" />
          <p className="text-purple-300">Loading results...</p>
        </div>
      </div>
    )
  }

  const isAnnotateMode = result.mode === "annotate"
  const resumeFilename = `optimized-resume-${(jobInfo?.title || "resume").toLowerCase().replace(/\s+/g, "-")}.pdf`
  const coverFilename = `cover-letter-${(jobInfo?.company || "company").toLowerCase().replace(/\s+/g, "-")}.pdf`

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0B1F3A] to-[#2A0E4A]">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-purple-900/40 bg-[#0B1F3A]/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push("/")}
              className="text-purple-300 hover:bg-purple-900/30 hover:text-white"
            >
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              Back
            </Button>
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-400" />
              <span className="font-bold text-white">ResumeTruth AI</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Mode badge */}
            <Badge
              variant="outline"
              className={
                isAnnotateMode
                  ? "border-amber-700/50 bg-amber-900/20 text-amber-300"
                  : "border-purple-700/50 bg-purple-900/20 text-purple-300"
              }
            >
              {isAnnotateMode ? (
                <><Highlighter className="mr-1.5 h-3 w-3" />Annotated Review</>
              ) : (
                <><Download className="mr-1.5 h-3 w-3" />Full Optimization</>
              )}
            </Badge>
            {jobInfo && (
              <p className="hidden text-sm text-purple-400 sm:block">
                {jobInfo.title}
                {jobInfo.company ? ` @ ${jobInfo.company}` : ""}
              </p>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-8 pb-20">
        {/* Score + Strengths Row */}
        <div className="grid gap-5 lg:grid-cols-3">
          <Card className="border-purple-800/30 bg-[#2A0E4A]/60 backdrop-blur-sm">
            <CardContent className="flex items-center justify-center py-8">
              <ProbabilityScore score={result.hiringProbability} />
            </CardContent>
          </Card>

          <Card className="border-purple-800/30 bg-[#2A0E4A]/60 backdrop-blur-sm lg:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-white">
                Strengths Detected
              </CardTitle>
            </CardHeader>
            <CardContent>
              <StrengthAnalysis strengths={result.strengthAnalysis} />
            </CardContent>
          </Card>
        </div>

        {/* Missing Skills */}
        <Card className="border-purple-800/30 bg-[#2A0E4A]/60 backdrop-blur-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold text-white">
              Missing Skills &amp; Gaps
            </CardTitle>
          </CardHeader>
          <CardContent>
            <MissingSkills skills={result.missingSkills} />
          </CardContent>
        </Card>

        {/* ── FULL MODE: Optimized resume ── */}
        {!isAnnotateMode && result.optimizedResume && (
          <Card className="border-purple-800/30 bg-[#2A0E4A]/60 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base font-semibold text-white">
                AI-Optimized Resume
              </CardTitle>
              <DownloadButton
                content={result.optimizedResume}
                filename={resumeFilename}
                label="Download PDF"
              />
            </CardHeader>
            <CardContent>
              <ResumePreview content={result.optimizedResume} />
            </CardContent>
          </Card>
        )}

        {/* ── Cover Letter (both modes, when requested) ── */}
        {result.coverLetter && (
          <Card className="border-purple-800/30 bg-[#2A0E4A]/60 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base font-semibold text-white">
                Cover Letter
              </CardTitle>
              <DownloadButton
                content={result.coverLetter}
                filename={coverFilename}
                label="Download PDF"
              />
            </CardHeader>
            <CardContent>
              <CoverLetterPreview content={result.coverLetter} />
            </CardContent>
          </Card>
        )}

        {/* ── ANNOTATE MODE: Highlighted original resume ── */}
        {isAnnotateMode && result.annotations && (
          <Card className="border-amber-800/30 bg-[#2A0E4A]/60 backdrop-blur-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-white">
                Your Resume — Annotated
              </CardTitle>
            </CardHeader>
            <CardContent>
              <AnnotatedResume
                originalText={originalResumeText}
                annotations={result.annotations}
              />
            </CardContent>
          </Card>
        )}

        {/* AI Explanation */}
        <Card className="border-purple-800/30 bg-[#2A0E4A]/60 backdrop-blur-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold text-white">
              AI Analysis &amp; Recommendations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <AiExplanation explanations={result.aiExplanation} />
          </CardContent>
        </Card>

        {/* Analyze Another */}
        <div className="text-center">
          <Button
            variant="outline"
            onClick={() => router.push("/")}
            className="border-purple-700/50 bg-transparent text-purple-300 hover:bg-purple-900/30 hover:text-white"
          >
            Analyze Another Resume
          </Button>
        </div>
      </main>
    </div>
  )
}
