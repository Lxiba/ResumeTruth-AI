# ResumeTruth AI

**ResumeTruth AI** is an AI-powered resume optimizer that analyzes your resume against a real job description and gives you an honest, actionable assessment — not generic tips.

Live at: [resumetruth-ai.vercel.app](https://resumetruth-ai.vercel.app)

---

## What It Does

Most resume tools give vague, cookie-cutter feedback. ResumeTruth AI reads your actual resume and the actual job posting, then tells you exactly where you stand — with a hiring probability score, specific skill gaps, and two distinct ways to improve your document.

---

## Features

| Feature | Description |
|---|---|
| **Hiring Probability Score** | A 0–100% score showing how well your resume matches the role, with an AI explanation of how it was calculated |
| **Strength Analysis** | Highlights what you already have that aligns with the job requirements |
| **Missing Skills Detection** | Pinpoints specific skills and keywords from the job posting that are absent from your resume |
| **Full Optimization Mode** | AI rewrites your entire resume — preserving your original structure — with ATS keywords injected and impact statements strengthened, downloadable as a PDF |
| **Annotated Review Mode** | Keeps your original resume untouched and overlays color-coded inline suggestions (remove / replace / reformat) so you can make edits yourself and retain your embedded links |
| **Cover Letter Generator** | Produces a professionally formatted cover letter with a four-paragraph structure, real metrics pulled from your resume, and recipient details extracted from the job posting |

---

## How It Works

1. **Upload your resume** — drag and drop or browse for a PDF or DOCX file
2. **Enter the job details** — paste the job description, job title, and company name
3. **Choose a mode** — Full Optimization (AI rewrites it) or Annotated Review (AI marks it up)
4. **Toggle cover letter** — optionally generate a tailored cover letter alongside your resume
5. **Get results** — view your score, gaps, and improved resume; download as PDF

---

## Frontend

The interface is built with **Next.js** using the App Router and **TypeScript** for type safety throughout. Styling is handled by **Tailwind CSS** with a custom dark purple and navy color scheme, and all UI components come from **shadcn/ui** with **Lucide React** icons.

### Pages

- **`/`** — Landing and input page: resume upload, job details form, mode selection, and the generate action
- **`/results`** — Results page: hiring score, strength cards, missing skills list, resume preview (optimized or annotated), cover letter preview, and download buttons

### Key Components

**Input**
- `upload-zone.tsx` — Drag-and-drop file uploader with support for PDF and DOCX
- `job-form.tsx` — Fields for job title, company, and the job description textarea
- `generate-button.tsx` — Submit trigger that kicks off the analysis

**Results**
- `probability-score.tsx` — Animated circular progress ring with color-coded tiers
- `strength-analysis.tsx` — Cards listing matched strengths from the resume
- `missing-skills.tsx` — Checklist of skills gaps identified from the job description
- `resume-preview.tsx` — Full rewritten resume with formatted sections
- `annotated-resume.tsx` — Original resume text with clickable inline annotations (color-coded by type)
- `cover-letter-preview.tsx` — Rendered cover letter with full formatting
- `ai-explanation.tsx` — AI-generated rationale for the score and recommendations
- `download-button.tsx` — Exports resume or cover letter as a PDF

---

## Backend

The backend runs entirely on **Next.js API Routes** (serverless), with no separate server. All heavy lifting — document parsing, AI calls, and PDF generation — happens on the server side.

### API Routes

**`POST /api/parse-resume`**

Accepts a file upload and extracts plain text from it.
- PDF files are processed with **pdf-parse**
- DOCX files are processed with **mammoth**
- Returns the extracted text to the frontend for inclusion in the analysis request

**`POST /api/analyze`**

The core endpoint. Receives the extracted resume text and job details, builds the appropriate AI prompt, calls the model, and returns a structured JSON result covering the score, strengths, missing skills, rewritten or annotated resume, and cover letter (if requested).

### Services

**`lib/openrouter.ts`** — AI integration layer

Sends requests to the **Hugging Face Inference API** using the **Qwen 2.5 72B Instruct** model. Handles response parsing and validation, and surfaces descriptive error messages when the API call fails.

**`lib/prompts.ts`** — Prompt engineering

Builds the system and user prompts sent to the AI. There are separate prompt builders for Full Optimization mode and Annotated Review mode, each with specific instructions on output format and behavior. Cover letter instructions are injected conditionally.

**`lib/pdf-generator.ts`** — PDF creation

Uses **pdf-lib** to produce A4 PDFs on the server. Handles heading detection, font selection, text wrapping, and page layout — styled to match the app's purple and navy color scheme.

---

## Tech Stack

**Framework**
- Next.js (App Router) with React and TypeScript

**AI**
- Hugging Face Inference API — Qwen 2.5 72B Instruct model

**Document Processing**
- pdf-parse — extracts text from PDF files
- mammoth — extracts text from DOCX files
- pdf-lib — generates downloadable PDF files

**Frontend**
- Tailwind CSS — utility-first styling
- shadcn/ui — accessible, composable UI components
- Lucide React — icon library

**Deployment**
- Vercel

---

## Project Structure

```
ResumeTruth AI/
├── app/
│   ├── api/
│   │   ├── analyze/route.ts        # Core AI analysis endpoint
│   │   └── parse-resume/route.ts   # Document text extraction endpoint
│   ├── results/page.tsx            # Results display page
│   ├── page.tsx                    # Home / input page
│   ├── layout.tsx                  # Root layout and metadata
│   └── globals.css                 # Global styles
├── components/
│   ├── ui/                         # shadcn/ui base components
│   ├── results/                    # All results page components
│   ├── upload-zone.tsx
│   ├── job-form.tsx
│   └── generate-button.tsx
├── lib/
│   ├── openrouter.ts               # Hugging Face API integration
│   ├── prompts.ts                  # AI prompt builders
│   ├── pdf-generator.ts            # PDF export utility
│   └── utils.ts                   # Shared utilities
└── types/
    └── index.ts                    # TypeScript type definitions
```

---

## Data Flow

```
User uploads resume
        ↓
POST /api/parse-resume  →  pdf-parse / mammoth  →  plain text
        ↓
User submits job details + selects mode
        ↓
POST /api/analyze  →  prompt builder  →  Hugging Face AI (Qwen 2.5 72B)
        ↓
Structured JSON response (score, strengths, gaps, resume, cover letter)
        ↓
Results page renders preview  →  User downloads PDF
```

Results are persisted in **sessionStorage** so they survive page refreshes within the same browser tab.

---

## Environment Variables

| Variable | Purpose |
|---|---|
| `HUGGINGFACE_API_KEY` | API key for the Hugging Face Inference endpoint |
