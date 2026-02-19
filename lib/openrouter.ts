import type { AnalysisResult, JobInfo } from "@/types"
import { buildPrompt } from "@/lib/prompts"

const HF_API_URL = "https://router.huggingface.co/v1/chat/completions"
const MODEL = "Qwen/Qwen2.5-72B-Instruct"

/** Extracts a JSON object from a string that may contain markdown code fences. */
function extractJSON(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  if (fenced) return fenced[1]
  const start = text.indexOf("{")
  const end = text.lastIndexOf("}")
  if (start !== -1 && end !== -1) return text.slice(start, end + 1)
  return text
}

export async function analyzeResume(
  resumeText: string,
  jobInfo: JobInfo
): Promise<AnalysisResult> {
  const apiKey = process.env.HUGGINGFACE_API_KEY
  if (!apiKey || apiKey === "your_huggingface_api_key_here") {
    throw new Error(
      "HUGGINGFACE_API_KEY is not configured. Please add your API key to .env.local"
    )
  }

  const { system, user } = buildPrompt(resumeText, jobInfo)

  const response = await fetch(HF_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.3,
      max_tokens: 4096,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Hugging Face Router API error ${response.status}: ${errorText}`)
  }

  const data = await response.json()
  const rawContent: string = data.choices?.[0]?.message?.content

  if (!rawContent) {
    throw new Error("No content returned from AI model")
  }

  let parsed: AnalysisResult
  try {
    parsed = JSON.parse(extractJSON(rawContent)) as AnalysisResult
  } catch {
    throw new Error("AI returned malformed JSON. Please try again.")
  }

  // Ensure mode is always set (AI may omit it)
  parsed.mode = parsed.mode ?? jobInfo.optimizeMode

  // Validate shared required fields
  if (
    typeof parsed.hiringProbability !== "number" ||
    !Array.isArray(parsed.missingSkills) ||
    !Array.isArray(parsed.strengthAnalysis) ||
    !Array.isArray(parsed.aiExplanation)
  ) {
    throw new Error("AI response is missing required fields. Please try again.")
  }

  // Validate mode-specific fields
  if (parsed.mode === "full" && typeof parsed.optimizedResume !== "string") {
    throw new Error("AI did not return an optimized resume. Please try again.")
  }
  if (parsed.mode === "annotate" && !Array.isArray(parsed.annotations)) {
    throw new Error("AI did not return annotations. Please try again.")
  }

  return parsed
}
