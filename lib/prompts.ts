import type { JobInfo } from "@/types"

export function buildPrompt(
  resumeText: string,
  jobInfo: JobInfo
): { system: string; user: string } {
  return jobInfo.optimizeMode === "annotate"
    ? buildAnnotatePrompt(resumeText, jobInfo)
    : buildFullPrompt(resumeText, jobInfo)
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
  const system = `You are ResumeTruth AI, an expert resume analyst and career coach.
Analyze the candidate's resume against the job description and return a JSON object.

CRITICAL FORMAT RULE: The optimizedResume must follow the EXACT same section structure, ordering, and layout as the original resume. Do NOT invent new sections or reorder them. Preserve the candidate's real experience — improve phrasing, inject relevant keywords, and strengthen impact statements.

You MUST respond with ONLY valid JSON matching this exact structure:
{
  "mode": "full",
  "hiringProbability": <integer 0-100>,
  "missingSkills": [<string>, ...],
  "strengthAnalysis": [<string>, ...],
  "optimizedResume": "<full optimized resume as plain text>",
  ${jobInfo.generateCoverLetter ? '"coverLetter": "<cover letter — see format rules below>",' : ""}
  "aiExplanation": [<string>, ...]
}

Field requirements:
- hiringProbability: Honest 0-100 match score.
- missingSkills: Specific skills/technologies from the job description absent in the resume.
- strengthAnalysis: Concrete matching strengths with specifics (not vague praise).
- optimizedResume: Rewritten resume preserving the ORIGINAL section structure and order. Use plain text. Section headers in the same format as the original.
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
