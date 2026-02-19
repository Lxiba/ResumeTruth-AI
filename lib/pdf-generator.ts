import { PDFDocument, StandardFonts, rgb } from "pdf-lib"

const PAGE_WIDTH = 595.28   // A4
const PAGE_HEIGHT = 841.89  // A4
const MARGIN = 50
const LINE_HEIGHT = 14
const FONT_SIZE = 10
const HEADING_SIZE = 13

function wrapText(text: string, font: Awaited<ReturnType<PDFDocument["embedFont"]>>, fontSize: number, maxWidth: number): string[] {
  const lines: string[] = []
  const paragraphs = text.split("\n")

  for (const paragraph of paragraphs) {
    if (paragraph.trim() === "") {
      lines.push("")
      continue
    }
    const words = paragraph.split(" ")
    let currentLine = ""

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word
      const width = font.widthOfTextAtSize(testLine, fontSize)
      if (width > maxWidth && currentLine) {
        lines.push(currentLine)
        currentLine = word
      } else {
        currentLine = testLine
      }
    }
    if (currentLine) lines.push(currentLine)
  }

  return lines
}

export async function generatePDF(content: string, title: string): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create()
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  const usableWidth = PAGE_WIDTH - MARGIN * 2
  const lines = wrapText(content, font, FONT_SIZE, usableWidth)

  let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  let y = PAGE_HEIGHT - MARGIN

  // Draw title
  page.drawText(title, {
    x: MARGIN,
    y,
    size: HEADING_SIZE + 2,
    font: boldFont,
    color: rgb(0.04, 0.12, 0.23), // navy
  })
  y -= LINE_HEIGHT * 2

  // Draw a separator line
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_WIDTH - MARGIN, y },
    thickness: 1,
    color: rgb(0.43, 0.16, 0.85), // purple
  })
  y -= LINE_HEIGHT * 1.5

  for (const line of lines) {
    if (y < MARGIN + LINE_HEIGHT) {
      page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
      y = PAGE_HEIGHT - MARGIN
    }

    const isHeading =
      line === line.toUpperCase() &&
      line.trim().length > 0 &&
      line.trim().length < 40 &&
      !line.includes("@") &&
      !line.includes("|")

    if (isHeading && line.trim() !== "") {
      y -= LINE_HEIGHT * 0.5
      page.drawText(line, {
        x: MARGIN,
        y,
        size: HEADING_SIZE,
        font: boldFont,
        color: rgb(0.43, 0.16, 0.85),
      })
      y -= LINE_HEIGHT * 0.5
      page.drawLine({
        start: { x: MARGIN, y },
        end: { x: PAGE_WIDTH - MARGIN, y },
        thickness: 0.5,
        color: rgb(0.7, 0.7, 0.7),
      })
    } else if (line === "") {
      y -= LINE_HEIGHT * 0.5
    } else {
      page.drawText(line, {
        x: MARGIN,
        y,
        size: FONT_SIZE,
        font,
        color: rgb(0.1, 0.1, 0.1),
      })
    }

    y -= LINE_HEIGHT
  }

  return await pdfDoc.save()
}
