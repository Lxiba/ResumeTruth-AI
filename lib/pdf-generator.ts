import { PDFDocument, StandardFonts, rgb } from "pdf-lib"

const PAGE_WIDTH   = 595.28  // A4
const PAGE_HEIGHT  = 841.89  // A4
const MARGIN       = 50
const LINE_HEIGHT  = 14
const FONT_SIZE    = 10
const HEADING_SIZE = 12
const BULLET_INDENT = 14     // horizontal offset for bullet text

// Known resume section names for Title Case heading detection
const SECTION_NAMES = new Set([
  "experience", "work experience", "professional experience", "employment", "employment history",
  "education", "academic background", "academic history",
  "skills", "technical skills", "core competencies", "key skills", "competencies", "skill set",
  "projects", "personal projects", "key projects", "notable projects", "side projects", "project work",
  "certifications", "certificates", "certification", "licenses", "credentials",
  "awards", "honors", "achievements", "accomplishments", "recognition",
  "summary", "professional summary", "executive summary", "objective", "profile",
  "about me", "career objective", "career summary", "about",
  "publications", "research", "volunteer", "volunteering", "volunteer work", "community involvement",
  "extracurriculars", "extracurricular activities", "activities", "interests", "hobbies",
  "languages", "references", "additional information", "additional",
  "contact", "contact information", "links", "portfolio",
  "leadership", "leadership experience", "management experience",
  "training", "professional development", "courses", "coursework",
])

function isHeadingLine(line: string): boolean {
  const t = line.trim()
  if (!t || t.length > 55 || t.includes("@") || t.includes("|")) return false
  if (!/[a-zA-Z]/.test(t)) return false

  // ALL CAPS with at least 2 uppercase letters
  if (t === t.toUpperCase() && /[A-Z]{2,}/.test(t)) return true

  // Known section name (case-insensitive, full match)
  if (SECTION_NAMES.has(t.toLowerCase())) return true

  return false
}

// Detect bullet character at the start of a trimmed line.
// Returns the bullet char + the text after it, or null if not a bullet.
function parseBullet(trimmed: string): { char: string; rest: string } | null {
  const unicodeBullets = ["•", "●", "◦", "▪", "▸", "–", "—"]
  for (const bc of unicodeBullets) {
    if (trimmed.startsWith(bc + " ") || trimmed.startsWith(bc + "\t")) {
      return { char: bc, rest: trimmed.slice(bc.length).trimStart() }
    }
  }
  // Dash or asterisk bullets (only when followed by a space)
  if (/^[-*]\s/.test(trimmed)) {
    return { char: trimmed[0], rest: trimmed.slice(1).trimStart() }
  }
  return null
}

// Wrap a plain string into lines that fit within maxWidth.
function wrapWords(
  text: string,
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  fontSize: number,
  maxWidth: number
): string[] {
  if (!text.trim()) return []
  const words = text.split(" ")
  const lines: string[] = []
  let cur = ""
  for (const w of words) {
    if (!w) continue
    const test = cur ? `${cur} ${w}` : w
    if (font.widthOfTextAtSize(test, fontSize) > maxWidth && cur) {
      lines.push(cur)
      cur = w
    } else {
      cur = test
    }
  }
  if (cur) lines.push(cur)
  return lines
}

type DrawLineType = "heading" | "bullet-first" | "bullet-cont" | "text" | "blank"

interface DrawLine {
  type: DrawLineType
  text: string
  bulletChar?: string
}

function buildDrawLines(
  content: string,
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  fontSize: number,
  usableWidth: number
): DrawLine[] {
  const out: DrawLine[] = []

  for (const rawLine of content.split("\n")) {
    const t = rawLine.trim()

    if (!t) {
      out.push({ type: "blank", text: "" })
      continue
    }

    if (isHeadingLine(t)) {
      out.push({ type: "heading", text: t })
      continue
    }

    const bullet = parseBullet(t)
    if (bullet) {
      const innerWidth = usableWidth - BULLET_INDENT
      const wrapped = wrapWords(bullet.rest, font, fontSize, innerWidth)
      if (wrapped.length === 0) {
        out.push({ type: "bullet-first", text: "", bulletChar: bullet.char })
      } else {
        wrapped.forEach((line, i) =>
          out.push({
            type: i === 0 ? "bullet-first" : "bullet-cont",
            text: line,
            bulletChar: i === 0 ? bullet.char : undefined,
          })
        )
      }
    } else {
      const wrapped = wrapWords(t, font, fontSize, usableWidth)
      wrapped.forEach((line) => out.push({ type: "text", text: line }))
    }
  }

  return out
}

export async function generatePDF(content: string, title: string): Promise<Uint8Array> {
  const pdfDoc   = await PDFDocument.create()
  const font     = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  const usableWidth = PAGE_WIDTH - MARGIN * 2
  const drawLines   = buildDrawLines(content, font, FONT_SIZE, usableWidth)

  let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  let y    = PAGE_HEIGHT - MARGIN

  // Document title
  page.drawText(title, {
    x: MARGIN, y,
    size: HEADING_SIZE + 2,
    font: boldFont,
    color: rgb(0.04, 0.12, 0.23),
  })
  y -= LINE_HEIGHT * 2

  // Title underline
  page.drawLine({
    start: { x: MARGIN, y },
    end:   { x: PAGE_WIDTH - MARGIN, y },
    thickness: 1,
    color: rgb(0.43, 0.16, 0.85),
  })
  y -= LINE_HEIGHT * 1.5

  function newPageIfNeeded(extraLines = 1) {
    if (y - LINE_HEIGHT * extraLines < MARGIN + LINE_HEIGHT) {
      page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
      y = PAGE_HEIGHT - MARGIN
    }
  }

  for (const dl of drawLines) {
    switch (dl.type) {
      case "blank":
        y -= LINE_HEIGHT * 0.4
        break

      case "heading":
        newPageIfNeeded(3)
        y -= LINE_HEIGHT * 0.6
        page.drawText(dl.text, {
          x: MARGIN, y,
          size: HEADING_SIZE,
          font: boldFont,
          color: rgb(0.43, 0.16, 0.85),
        })
        y -= LINE_HEIGHT * 0.4
        page.drawLine({
          start: { x: MARGIN, y },
          end:   { x: PAGE_WIDTH - MARGIN, y },
          thickness: 0.5,
          color: rgb(0.7, 0.7, 0.7),
        })
        y -= LINE_HEIGHT * 0.8
        break

      case "bullet-first":
        newPageIfNeeded()
        if (dl.bulletChar) {
          page.drawText(dl.bulletChar, {
            x: MARGIN, y,
            size: FONT_SIZE,
            font,
            color: rgb(0.1, 0.1, 0.1),
          })
        }
        if (dl.text) {
          page.drawText(dl.text, {
            x: MARGIN + BULLET_INDENT, y,
            size: FONT_SIZE,
            font,
            color: rgb(0.1, 0.1, 0.1),
          })
        }
        y -= LINE_HEIGHT
        break

      case "bullet-cont":
        newPageIfNeeded()
        if (dl.text) {
          page.drawText(dl.text, {
            x: MARGIN + BULLET_INDENT, y,
            size: FONT_SIZE,
            font,
            color: rgb(0.1, 0.1, 0.1),
          })
        }
        y -= LINE_HEIGHT
        break

      case "text":
        newPageIfNeeded()
        if (dl.text) {
          page.drawText(dl.text, {
            x: MARGIN, y,
            size: FONT_SIZE,
            font,
            color: rgb(0.1, 0.1, 0.1),
          })
        }
        y -= LINE_HEIGHT
        break
    }
  }

  return pdfDoc.save()
}
