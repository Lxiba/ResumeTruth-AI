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

// ─────────────────────────────────────────────────────────────────────────────
// Jake's Resume template generator
// US Letter, Times Roman, centered header, black section rules, right-aligned dates
// ─────────────────────────────────────────────────────────────────────────────
export async function generateJakesResumePDF(content: string): Promise<Uint8Array> {
  const PAGE_W   = 612          // US Letter
  const PAGE_H   = 792
  const MX       = 46           // left/right margin (~0.64 in)
  const MT       = 40           // top margin
  const MB       = 36           // bottom margin
  const USABLE   = PAGE_W - MX * 2
  const LH       = 13.5         // base line height
  const NAME_SZ  = 20
  const CONT_SZ  = 9
  const BODY_SZ  = 10
  const SECT_SZ  = 10

  const pdfDoc   = await PDFDocument.create()
  const bodyFont = await pdfDoc.embedFont(StandardFonts.TimesRoman)
  const boldFont = await pdfDoc.embedFont(StandardFonts.TimesRomanBold)
  const BLACK    = rgb(0, 0, 0)
  const DARK     = rgb(0.12, 0.12, 0.12)

  let page = pdfDoc.addPage([PAGE_W, PAGE_H])
  let y    = PAGE_H - MT

  const needPage = (extra = 1) => {
    if (y - LH * extra < MB) {
      page = pdfDoc.addPage([PAGE_W, PAGE_H])
      y    = PAGE_H - MT
    }
  }

  const lines = content.split("\n")

  // ── Parse header block (lines before first blank or first section heading) ──
  const headerLines: string[] = []
  let bodyStart = 0
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim()
    if (!t || isHeadingLine(t)) { bodyStart = i; break }
    headerLines.push(t)
    bodyStart = i + 1
  }

  // ── Render header ────────────────────────────────────────────────────────
  if (headerLines.length > 0) {
    const name = headerLines[0]
    const nw   = boldFont.widthOfTextAtSize(name, NAME_SZ)
    page.drawText(name, {
      x: PAGE_W / 2 - nw / 2, y,
      size: NAME_SZ, font: boldFont, color: BLACK,
    })
    y -= LH * 1.9

    for (const cl of headerLines.slice(1)) {
      if (!cl) continue
      needPage()
      const cw = bodyFont.widthOfTextAtSize(cl, CONT_SZ)
      page.drawText(cl, {
        x: Math.max(MX, PAGE_W / 2 - cw / 2), y,
        size: CONT_SZ, font: bodyFont, color: DARK,
      })
      y -= LH
    }
    y -= LH * 0.4
  }

  // ── Render body ──────────────────────────────────────────────────────────
  // Two-column heuristic: "Left text   Right text" (3+ spaces separating them)
  const TWO_COL = /^(.+?)\s{3,}(.+)$/

  for (let i = bodyStart; i < lines.length; i++) {
    const t = lines[i].trim()

    if (!t) { y -= LH * 0.25; continue }

    // Section heading
    if (isHeadingLine(t)) {
      needPage(3)
      y -= LH * 0.5
      page.drawText(t.toUpperCase(), {
        x: MX, y, size: SECT_SZ, font: boldFont, color: BLACK,
      })
      y -= LH * 0.35
      page.drawLine({
        start: { x: MX, y }, end: { x: PAGE_W - MX, y },
        thickness: 0.75, color: BLACK,
      })
      y -= LH * 0.8
      continue
    }

    // Bullet
    const bullet = parseBullet(t)
    if (bullet) {
      const BX = MX + 10
      const TX = BX + 10
      const wrapped = wrapWords(bullet.rest, bodyFont, BODY_SZ, USABLE - (TX - MX))
      for (let wi = 0; wi < Math.max(wrapped.length, 1); wi++) {
        needPage()
        if (wi === 0) page.drawText("•", { x: BX, y, size: BODY_SZ, font: bodyFont, color: DARK })
        if (wrapped[wi]) page.drawText(wrapped[wi], { x: TX, y, size: BODY_SZ, font: bodyFont, color: DARK })
        y -= LH
      }
      continue
    }

    // Two-column entry (company/role | date/location)
    const tc = t.match(TWO_COL)
    if (tc) {
      const left  = tc[1].trim()
      const right = tc[2].trim()
      // Only treat as two-column when the right part is short (date or location)
      const isDateLike   = /\d{4}|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec/i.test(right)
      const isLocLike    = /[A-Z][a-z]+,\s*[A-Z]{2,}|Remote|Hybrid|On-site/i.test(right)
      if ((isDateLike || isLocLike) && right.length < 50) {
        const rw      = bodyFont.widthOfTextAtSize(right, BODY_SZ)
        const leftMax = USABLE - rw - 8
        const wLeft   = wrapWords(left, boldFont, BODY_SZ, leftMax)
        for (let wi = 0; wi < Math.max(wLeft.length, 1); wi++) {
          needPage()
          if (wLeft[wi]) page.drawText(wLeft[wi], { x: MX, y, size: BODY_SZ, font: boldFont, color: BLACK })
          if (wi === 0) page.drawText(right, { x: PAGE_W - MX - rw, y, size: BODY_SZ, font: bodyFont, color: DARK })
          y -= LH
        }
        continue
      }
    }

    // Plain text
    const wrapped = wrapWords(t, bodyFont, BODY_SZ, USABLE)
    for (const wl of wrapped) {
      needPage()
      page.drawText(wl, { x: MX, y, size: BODY_SZ, font: bodyFont, color: DARK })
      y -= LH
    }
    if (!wrapped.length) y -= LH
  }

  return pdfDoc.save()
}

// ─────────────────────────────────────────────────────────────────────────────
// Original styled PDF generator (purple/navy theme, A4)
// ─────────────────────────────────────────────────────────────────────────────
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
