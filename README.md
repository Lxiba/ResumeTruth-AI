# ResumeTruth AI

An AI-powered resume optimizer that analyzes your resume against any job description and gives you an honest assessment.

## Features

- **Hiring Probability Score** — see how well your resume matches the role
- **Missing Skills Detection** — specific gaps identified from the job description
- **Full Optimization Mode** — AI rewrites your resume preserving your original structure, ready to download as PDF
- **Annotated Review Mode** — color-coded inline highlights (remove / replace / reformat) so you can edit your own document and keep your links
- **Cover Letter Generator** — professionally formatted letter addressed to the recruiter with company info pulled from the job posting

## Tech Stack

- Next.js 16 (App Router)
- TypeScript
- Tailwind CSS + Shadcn UI
- Hugging Face Inference API (Qwen 2.5 72B)
- pdf-parse · mammoth · pdf-lib

## Getting Started

1. Clone the repo and install dependencies:

```bash
npm install
```

2. Copy the example env file and add your Hugging Face API key:

```bash
cp .env.local.example .env.local
```

3. Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to use the app.
