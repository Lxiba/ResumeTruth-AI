"use client"

import { useState } from "react"
import { Copy, Check } from "lucide-react"
import { Button } from "@/components/ui/button"

interface CoverLetterPreviewProps {
  content: string
}

interface ParsedLetter {
  senderLines: string[]   // name + contact block
  date: string
  recipientLines: string[] // Hiring Manager block
  salutation: string
  bodyParagraphs: string[]
  closing: string[]        // "Sincerely," + name
}

function parseLetter(text: string): ParsedLetter | null {
  // Normalise line endings
  const lines = text.replace(/\r\n/g, "\n").split("\n")

  // Find the "Dear " line — splits header from body
  const dearIdx = lines.findIndex((l) => l.trim().toLowerCase().startsWith("dear "))
  if (dearIdx === -1) return null

  // Everything before "Dear" is sender + date + recipient
  const headerLines = lines.slice(0, dearIdx).map((l) => l.trim())

  // Find date line (contains a month name or a 4-digit year)
  const dateIdx = headerLines.findIndex((l) =>
    /\b(january|february|march|april|may|june|july|august|september|october|november|december|\d{4})\b/i.test(l)
  )

  const senderLines = dateIdx > 0 ? headerLines.slice(0, dateIdx).filter(Boolean) : []
  const date = dateIdx !== -1 ? headerLines[dateIdx] : ""

  // Lines between date and end of header → recipient
  const recipientLines =
    dateIdx !== -1
      ? headerLines.slice(dateIdx + 1).filter(Boolean)
      : headerLines.filter(Boolean)

  // Body: from "Dear" line onwards
  const bodyLines = lines.slice(dearIdx).map((l) => l.trim())
  const salutation = bodyLines[0] ?? ""

  // Split body into paragraphs (separated by blank lines)
  const afterSalutation = bodyLines.slice(1)
  const paragraphs: string[] = []
  let current: string[] = []
  for (const line of afterSalutation) {
    if (line === "") {
      if (current.length) { paragraphs.push(current.join(" ")); current = [] }
    } else {
      current.push(line)
    }
  }
  if (current.length) paragraphs.push(current.join(" "))

  // Detect closing block: starts with "Sincerely", "Best", "Regards", "Yours"
  const closingStart = paragraphs.findIndex((p) =>
    /^(sincerely|best regards|best|regards|yours|warm regards|respectfully)/i.test(p)
  )
  const bodyParagraphs = closingStart > 0 ? paragraphs.slice(0, closingStart) : paragraphs
  const closing = closingStart >= 0 ? paragraphs.slice(closingStart) : []

  return { senderLines, date, recipientLines, salutation, bodyParagraphs, closing }
}

export function CoverLetterPreview({ content }: CoverLetterPreviewProps) {
  const [copied, setCopied] = useState(false)
  const parsed = parseLetter(content)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={handleCopy}
          className="border-purple-700/50 bg-transparent text-purple-300 hover:bg-purple-800/30 hover:text-white"
        >
          {copied ? (
            <><Check className="mr-1.5 h-3.5 w-3.5 text-green-400" /> Copied!</>
          ) : (
            <><Copy className="mr-1.5 h-3.5 w-3.5" /> Copy Text</>
          )}
        </Button>
      </div>

      <div className="max-h-[600px] overflow-y-auto overflow-x-hidden rounded-lg border border-purple-800/30 bg-[#0B1F3A]/60">
        {parsed ? (
          <div className="space-y-0">
            {/* ── Sender header block ── */}
            {(parsed.senderLines.length > 0 || parsed.date) && (
              <div className="border-b border-purple-800/30 bg-purple-950/30 px-6 py-5">
                {parsed.senderLines.length > 0 && (
                  <div className="mb-3">
                    {/* First line = candidate name — render large */}
                    <p className="text-lg font-bold tracking-wide text-white">
                      {parsed.senderLines[0]}
                    </p>
                    {/* Remaining lines = title, location, phone, email, url */}
                    {parsed.senderLines.slice(1).map((line, i) => (
                      <p key={i} className="text-sm text-purple-300">
                        {line}
                      </p>
                    ))}
                  </div>
                )}
                {parsed.date && (
                  <p className="text-sm text-purple-400">{parsed.date}</p>
                )}
              </div>
            )}

            {/* ── Recipient block ── */}
            {parsed.recipientLines.length > 0 && (
              <div className="border-b border-purple-800/20 px-6 py-4">
                {parsed.recipientLines.map((line, i) => (
                  <p key={i} className={`text-sm ${i === 0 ? "font-semibold text-white" : "text-purple-300"}`}>
                    {line}
                  </p>
                ))}
              </div>
            )}

            {/* ── Body ── */}
            <div className="space-y-4 px-6 py-5">
              {/* Salutation */}
              {parsed.salutation && (
                <p className="font-semibold text-white">{parsed.salutation}</p>
              )}

              {/* Body paragraphs */}
              {parsed.bodyParagraphs.map((para, i) => (
                <p key={i} className="break-words text-sm leading-7 text-purple-100">
                  {para}
                </p>
              ))}

              {/* Closing */}
              {parsed.closing.length > 0 && (
                <div className="pt-2">
                  {parsed.closing.map((line, i) => (
                    <p
                      key={i}
                      className={`text-sm ${
                        i === 0
                          ? "font-semibold text-white"
                          : i === parsed.closing.length - 1
                          ? "mt-4 font-bold text-white"
                          : "text-purple-300"
                      }`}
                    >
                      {line}
                    </p>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Fallback: plain pre if parsing fails */
          <div className="p-5">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-purple-100">
              {content}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
