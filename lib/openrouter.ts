import type { AnalysisResult, JobInfo } from "@/types"
import { buildPrompt } from "@/lib/prompts"

// router.huggingface.co is the current required endpoint (api-inference.huggingface.co was retired)
const HF_API_URL = "https://router.huggingface.co/v1/chat/completions"
const MODEL = "Qwen/Qwen2.5-72B-Instruct"

/** Extracts a JSON object from a string that may contain markdown code fences. */
function extractJSON(text: string): string {
  // Strip markdown code fences (```json ... ``` or ``` ... ```)
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  if (fenced) return fenced[1]
  // Fall back to slicing from first { to last }
  const start = text.indexOf("{")
  const end = text.lastIndexOf("}")
  if (start !== -1 && end !== -1) return text.slice(start, end + 1)
  return text
}

export async function analyzeResume(
  resumeText: string,
  jobInfo: JobInfo,
  currentDate: string
): Promise<AnalysisResult> {
  const apiKey = process.env.HUGGINGFACE_API_KEY
  if (!apiKey || apiKey === "your_huggingface_api_key_here") {
    throw new Error(
      "HUGGINGFACE_API_KEY is not configured. Please add your API key to .env.local"
    )
  }

  const { system, user } = buildPrompt(resumeText, jobInfo, currentDate)

  const response = await fetch(HF_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
      // Queue the request if the model is warming up instead of returning an instant 503
      "x-wait-for-model": "true",
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
    const errorText = await response.text().catch(() => "")

    if (response.status === 401) {
      throw new Error(
        "Invalid HuggingFace API key. Please verify HUGGINGFACE_API_KEY in your environment settings."
      )
    }
    if (response.status === 402 || response.status === 403) {
      throw new Error(
        "Your HuggingFace account does not have access to this model. " +
        "Ensure your API key is valid and that you have accepted the model license on HuggingFace."
      )
    }
    if (response.status === 429) {
      throw new Error(
        "HuggingFace rate limit reached. Please wait a moment and try again."
      )
    }
    if (response.status === 503) {
      throw new Error(
        "The AI model is currently loading. Please wait 20-30 seconds and try again."
      )
    }

    throw new Error(
      `HuggingFace API error ${response.status}: ${errorText.slice(0, 300)}`
    )
  }

  const data = await response.json()
  const rawContent: string = data.choices?.[0]?.message?.content

  if (!rawContent) {
    throw new Error("No content returned from the AI model. Please try again.")
  }

  let parsed: AnalysisResult
  try {
    parsed = JSON.parse(extractJSON(rawContent)) as AnalysisResult
  } catch {
    throw new Error(
      "The AI returned a malformed response. Please try again — this usually resolves on retry."
    )
  }

  // Ensure mode is always set (the AI may omit it)
  parsed.mode = parsed.mode ?? jobInfo.optimizeMode

  // Validate shared required fields
  if (
    typeof parsed.hiringProbability !== "number" ||
    !Array.isArray(parsed.missingSkills) ||
    !Array.isArray(parsed.strengthAnalysis) ||
    !Array.isArray(parsed.aiExplanation)
  ) {
    throw new Error(
      "AI response is missing required fields. Please try again."
    )
  }

  // Validate mode-specific fields
  if (parsed.mode === "full" && typeof parsed.optimizedResume !== "string") {
    throw new Error(
      "AI did not return an optimized resume. Please try again."
    )
  }
  if (parsed.mode === "annotate" && !Array.isArray(parsed.annotations)) {
    throw new Error(
      "AI did not return annotations. Please try again."
    )
  }

  return parsed
}
