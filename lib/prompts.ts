import type { JobInfo } from "@/types"

export function buildPrompt(
  resumeText: string,
  jobInfo: JobInfo
): { system: string; user: string } {
  return jobInfo.optimizeMode === "annotate"
    ? buildAnnotatePrompt(resumeText, jobInfo)
    : buildFullPrompt(resumeText, jobInfo)
}

// ─── Format detection ─────────────────────────────────────────────────────────
// Analyzes the extracted resume text to identify the exact formatting conventions
// so the AI can be instructed to mirror them precisely.

function detectFormatting(text: string): string {
  const lines = text.split("\n")

  // Count each bullet character style
  const bullets: Record<string, number> = {}
  for (const line of lines) {
    const t = line.trimStart()
    if (t.startsWith("• ") || t.startsWith("● ")) bullets["•"] = (bullets["•"] || 0) + 1
    else if (t.startsWith("- ") && t.length > 2)   bullets["-"] = (bullets["-"] || 0) + 1
    else if (t.startsWith("* ") && t.length > 2)   bullets["*"] = (bullets["*"] || 0) + 1
    else if (t.startsWith("◦ "))                    bullets["◦"] = (bullets["◦"] || 0) + 1
    else if (t.startsWith("▪ ") || t.startsWith("▸ ")) bullets["▪"] = (bullets["▪"] || 0) + 1
    else if (/^\d+[.)]\s/.test(t))                  bullets["1."] = (bullets["1."] || 0) + 1
  }
  const topBullet = Object.entries(bullets).sort((a, b) => b[1] - a[1])[0]

  // Detect section header style from short, label-like lines
  const labelLines = lines
    .map((l) => l.trim())
    .filter(
      (l) =>
        l.length >= 3 &&
        l.length <= 45 &&
        !/[@|•\-*◦▪▸]/.test(l) &&
        !/\d{4}/.test(l) &&
        !/[,;]/.test(l)
    )
  const allCapsCount = labelLines.filter(
    (l) => l === l.toUpperCase() && /[A-Z]{2,}/.test(l)
  ).length
  const titleCaseCount = labelLines.filter((l) => /^[A-Z][a-z]/.test(l)).length

  let headerStyle: string
  const exampleHeader = labelLines.find(
    (l) => l === l.toUpperCase() && /[A-Z]{2,}/.test(l) && l.length > 3
  )
  if (allCapsCount > 1 && exampleHeader) {
    headerStyle = `ALL CAPS — example from the resume: "${exampleHeader}"`
  } else if (titleCaseCount > allCapsCount) {
    const ex = labelLines.find((l) => /^[A-Z][a-z]/.test(l))
    headerStyle = `Title Case — example from the resume: "${ex ?? ""}"`
  } else {
    headerStyle = "match whatever style appears in the original"
  }

  // Detect date format
  const dateFormats: Array<{ re: RegExp; label: string }> = [
    { re: /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?\s+\d{4}/i,           label: 'abbreviated month, e.g. "Jan 2023"' },
    { re: /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}/i, label: 'full month, e.g. "January 2023"' },
    { re: /\b\d{2}\/\d{4}/,                                                             label: 'MM/YYYY, e.g. "01/2023"' },
    { re: /\b\d{4}\s*[–-]\s*(Present|Current|Now|Today)/i,                             label: 'year–Present, e.g. "2022–Present"' },
    { re: /\b\d{4}\s*[–-]\s*\d{4}/,                                                    label: 'year–year, e.g. "2020–2022"' },
  ]
  const matchedDate = dateFormats.find((d) => d.re.test(text))

  // Build the FORMAT LOCK block
  const parts: string[] = []

  if (topBullet) {
    parts.push(
      `Bullet character: "${topBullet[0]}" — every list item must start with this exact character, no substitutions`
    )
  } else {
    parts.push("No bullet characters detected — do not introduce any")
  }

  parts.push(`Section header style: ${headerStyle}`)

  if (matchedDate) {
    parts.push(`Date format: ${matchedDate.label} — use this exact format for every date`)
  }

  return parts.join("\n")
}

// ─── Shared cover letter instructions ────────────────────────────────────────

function coverLetterInstructions(jobInfo: JobInfo): string {
  return `
COVER LETTER REQUIREMENTS — follow every rule exactly:

FORMAT (plain text, use \\n for line breaks within the JSON string):
--------------------------------------------------------------------
[Candidate full name — extracted from resume]
[Candidate's current/most recent job title — extracted from resume]
[Candidate city, province/state — extracted from resume if present]
[Candidate phone number — extracted from resume if present]
[Candidate email address — extracted from resume if present]
[Candidate LinkedIn/portfolio URL — extracted from resume if present]

[Today's date spelled out, e.g. February 18, 2026]

[RECIPIENT BLOCK — build this from the job description using the rules below]
[Recruiter/Hiring Manager full name — if found anywhere in the job description (look for "Contact:", "Apply to:", posted by, or any named person)]
[Recruiter/Hiring Manager job title — if found in the job description]
${jobInfo.company || "[Company Name]"}
[Company street address — if found in the job description (look for "Location:", "Address:", "Office:", or a street address anywhere in the text)]
[City, Province/State, Postal/Zip Code — if found in the job description]

If NO recruiter name is found, write "Hiring Manager" on the first recipient line.
If NO company address is found, write only the company name on a single line.
Do NOT invent or guess any address or name — only use what appears in the job description.

Dear [Recruiter name if found, otherwise "Hiring Manager"],

[PARAGRAPH 1 — THE HOOK: 3-4 sentences. Open with a bold, specific statement about the candidate's biggest relevant achievement with a real metric from the resume (e.g., "I cut onboarding time by 35% by redesigning the pipeline"). Name the exact role and company, then state specifically why THIS company excites the candidate — reference something concrete from the job description (mission, product, scale, market). Never open with "I am writing to apply".]

[PARAGRAPH 2 — PROOF OF FIT: 4-5 sentences. Take 2-3 explicit requirements from the job description and pair each with a concrete, numbered achievement from the resume. Name the technologies, team sizes, revenue figures, or timeframes involved. Show the direct evidence — not opinions.]

[PARAGRAPH 3 — VALUE PROPOSITION: 3-4 sentences. Articulate what the candidate uniquely brings that others won't. Connect their background directly to a challenge or goal implied by the job description. Forward-looking, confident, specific.]

[PARAGRAPH 4 — CALL TO ACTION: 2-3 sentences. Express genuine enthusiasm for the opportunity. Invite the recruiter to connect. Do not beg, hedge, or use "I look forward to hearing from you".]

Sincerely,

[Candidate full name]
--------------------------------------------------------------------

STYLE RULES:
- Tone: confident, specific, warm — NOT generic, NOT boastful
- Every claim must tie back to something real in the resume
- Active voice throughout
- Banned phrases: "I am passionate about", "I believe I would be a great fit", "I look forward to hearing from you", "I am writing to apply"
- Length: 300-380 words for the body only (not counting header/footer)
- Return the entire cover letter as a single JSON string value with \\n for newlines`
}

// ─── Mode 1: Full Optimisation ───────────────────────────────────────────────

function buildFullPrompt(
  resumeText: string,
  jobInfo: JobInfo
): { system: string; user: string } {
  const formatLock = detectFormatting(resumeText)

  const system = `You are ResumeTruth AI, an expert resume analyst and career coach.
Analyze the candidate's resume against the job description and return a JSON object.

════ FORMAT LOCK — detected from the original resume ════
${formatLock}
═════════════════════════════════════════════════════════

FORMAT RULES FOR optimizedResume — these are absolute, non-negotiable:
1. Use the EXACT bullet character shown in FORMAT LOCK above — never switch to a different one.
2. Use the EXACT section header style shown — if ALL CAPS, every header must be ALL CAPS; if Title Case, every header must be Title Case.
3. Use the EXACT date format shown — do not reformat any date.
4. Copy every section name VERBATIM from the original — do not rename, translate, abbreviate, or add new sections.
5. Keep sections in the EXACT same order as the original.
6. Preserve the same blank-line spacing between sections as the original.
7. Only improve the CONTENT (phrasing, keywords, impact) — never the structure, labels, or formatting characters.

You MUST respond with ONLY valid JSON matching this exact structure:
{
  "mode": "full",
  "hiringProbability": <integer 0-100>,
  "missingSkills": [<string>, ...],
  "strengthAnalysis": [<string>, ...],
  "optimizedResume": "<full optimized resume as plain text with \\n for newlines>",
  ${jobInfo.generateCoverLetter ? '"coverLetter": "<cover letter — see format rules below>",' : ""}
  "aiExplanation": [<string>, ...]
}

Field requirements:
- hiringProbability: Honest 0-100 match score.
- missingSkills: Specific skills/technologies from the job description absent in the resume.
- strengthAnalysis: Concrete matching strengths with specifics (not vague praise).
- optimizedResume: Rewritten resume with improved content but IDENTICAL formatting to the original.
- aiExplanation: 4-6 explanations covering scoring rationale and improvement tips.
${jobInfo.generateCoverLetter ? coverLetterInstructions(jobInfo) : ""}`

  const user = `Analyze this resume for the position below and return the result as JSON.

JOB TITLE: ${jobInfo.title}
COMPANY: ${jobInfo.company}

JOB DESCRIPTION:
${jobInfo.description}

CANDIDATE'S RESUME:
${resumeText}`

  return { system, user }
}

// ─── Mode 2: Annotated Review ─────────────────────────────────────────────────

function buildAnnotatePrompt(
  resumeText: string,
  jobInfo: JobInfo
): { system: string; user: string } {
  const system = `You are ResumeTruth AI, an expert resume coach.
Analyze the resume against the job description and return a JSON object with inline annotations — do NOT rewrite the resume.

You MUST respond with ONLY valid JSON matching this exact structure:
{
  "mode": "annotate",
  "hiringProbability": <integer 0-100>,
  "missingSkills": [<string>, ...],
  "strengthAnalysis": [<string>, ...],
  "annotations": [
    {
      "original": "<verbatim text copied exactly from the resume>",
      "type": "remove" | "replace" | "reformat",
      "suggestion": "<brief 1-2 sentence note>"
    }
  ],
  ${jobInfo.generateCoverLetter ? '"coverLetter": "<cover letter — see format rules below>",' : ""}
  "aiExplanation": [<string>, ...]
}

Annotation types:
- "remove": This text weakens the resume and should be deleted entirely. suggestion explains why.
- "replace": This text should be swapped for something stronger. suggestion states what to write instead.
- "reformat": This text is factually fine but poorly worded/structured. suggestion shows how to rephrase it.

CRITICAL RULES for "original":
1. Copy the text VERBATIM from the resume — exact capitalization, punctuation, spacing.
2. Keep each snippet short: a phrase, bullet point, or sentence (5-40 words max). Do NOT copy entire paragraphs.
3. Each snippet must appear exactly once in the resume.
4. Produce 8-15 annotations spread across different sections (not all from one area).
5. Do NOT include an "optimizedResume" field.
${jobInfo.generateCoverLetter ? coverLetterInstructions(jobInfo) : ""}`

  const user = `Annotate this resume for the position below and return the result as JSON.

JOB TITLE: ${jobInfo.title}
COMPANY: ${jobInfo.company}

JOB DESCRIPTION:
${jobInfo.description}

CANDIDATE'S RESUME:
${resumeText}`

  return { system, user }
}
