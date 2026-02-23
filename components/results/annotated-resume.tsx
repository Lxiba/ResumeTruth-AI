"use client"

import { useState } from "react"
import { X, Trash2, RefreshCw, ArrowRightLeft } from "lucide-react"
import type { Annotation, AnnotationType } from "@/types"

interface Segment {
  text: string
  annotation?: Annotation
}

const TYPE_STYLES: Record<AnnotationType, string> = {
  remove:
    "bg-red-500/20 text-red-200 border-b-2 border-red-500 cursor-pointer hover:bg-red-500/30 transition-colors",
  replace:
    "bg-green-500/20 text-green-200 border-b-2 border-green-500 cursor-pointer hover:bg-green-500/30 transition-colors",
  reformat:
    "bg-amber-500/20 text-amber-200 border-b-2 border-amber-500 cursor-pointer hover:bg-amber-500/30 transition-colors",
}

const TYPE_BADGE: Record<AnnotationType, { label: string; className: string; Icon: React.ElementType }> = {
  remove: {
    label: "Remove",
    className: "bg-red-900/50 text-red-300 border border-red-700/50",
    Icon: Trash2,
  },
  replace: {
    label: "Replace With",
    className: "bg-green-900/50 text-green-300 border border-green-700/50",
    Icon: ArrowRightLeft,
  },
  reformat: {
    label: "Reformat",
    className: "bg-amber-900/50 text-amber-300 border border-amber-700/50",
    Icon: RefreshCw,
  },
}

// Collapse all whitespace runs (including newlines) to a single space
function collapseWS(s: string): string {
  return s.replace(/\s+/g, " ").trim()
}

// Build a map from each character position in the collapsed string back to
// its position in the original string. Also returns the collapsed string.
function buildPosMap(original: string): { norm: string; toOrig: number[] } {
  let norm = ""
  const toOrig: number[] = []
  let inWS = true
  for (let i = 0; i < original.length; i++) {
    const ws = /\s/.test(original[i])
    if (ws) {
      if (!inWS && norm.length > 0) {
        norm += " "
        toOrig.push(i)
        inWS = true
      }
    } else {
      norm += original[i]
      toOrig.push(i)
      inWS = false
    }
  }
  return { norm, toOrig }
}

function buildSegments(text: string, annotations: Annotation[]): Segment[] {
  const ranges: Array<{ start: number; end: number; annotation: Annotation }> = []

  // Precompute normalised map once — used for fallback matching
  const { norm: normText, toOrig } = buildPosMap(text)

  for (const ann of annotations) {
    if (!ann.original?.trim()) continue

    let start = -1
    let end = -1

    // 1. Exact match
    const ei = text.indexOf(ann.original)
    if (ei !== -1) {
      start = ei
      end = ei + ann.original.length
    }

    // 2. Case-insensitive match
    if (start === -1) {
      const ci = text.toLowerCase().indexOf(ann.original.toLowerCase())
      if (ci !== -1) {
        start = ci
        end = ci + ann.original.length
      }
    }

    // 3. Normalised whitespace match (handles AI collapsing newlines to spaces)
    if (start === -1) {
      const normAnn = collapseWS(ann.original)
      if (normAnn.length > 0) {
        const ni = normText.toLowerCase().indexOf(normAnn.toLowerCase())
        if (ni !== -1) {
          const ni2 = ni + normAnn.length - 1
          if (ni < toOrig.length && ni2 < toOrig.length) {
            start = toOrig[ni]
            end = toOrig[ni2] + 1
          }
        }
      }
    }

    if (start !== -1 && end !== -1) {
      ranges.push({ start, end, annotation: ann })
    }
  }

  // Sort by position, drop overlaps
  ranges.sort((a, b) => a.start - b.start)
  const clean: typeof ranges = []
  let lastEnd = 0
  for (const r of ranges) {
    if (r.start >= lastEnd) {
      clean.push(r)
      lastEnd = r.end
    }
  }

  // Build segments
  const segments: Segment[] = []
  let pos = 0
  for (const r of clean) {
    if (pos < r.start) segments.push({ text: text.slice(pos, r.start) })
    segments.push({ text: text.slice(r.start, r.end), annotation: r.annotation })
    pos = r.end
  }
  if (pos < text.length) segments.push({ text: text.slice(pos) })
  return segments
}

interface AnnotatedResumeProps {
  originalText: string
  annotations: Annotation[]
}

export function AnnotatedResume({ originalText, annotations }: AnnotatedResumeProps) {
  const [selected, setSelected] = useState<Annotation | null>(null)

  const segments = buildSegments(originalText, annotations)

  // Count annotations that were successfully matched (using all three strategies)
  const normOrigText = collapseWS(originalText)
  const matched = annotations.filter((ann) => {
    if (!ann.original?.trim()) return false
    if (originalText.indexOf(ann.original) !== -1) return true
    if (originalText.toLowerCase().indexOf(ann.original.toLowerCase()) !== -1) return true
    const normAnn = collapseWS(ann.original)
    return normAnn.length > 0 && normOrigText.toLowerCase().includes(normAnn.toLowerCase())
  })

  const counts = {
    remove: matched.filter((a) => a.type === "remove").length,
    replace: matched.filter((a) => a.type === "replace").length,
    reformat: matched.filter((a) => a.type === "reformat").length,
  }

  return (
    <div className="space-y-4">
      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs text-purple-400">Click a highlight to see the note:</span>
        {(["remove", "replace", "reformat"] as AnnotationType[]).map((type) => {
          const { label, className, Icon } = TYPE_BADGE[type]
          return (
            <span
              key={type}
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${className}`}
            >
              <Icon className="h-3 w-3" />
              {label} ({counts[type]})
            </span>
          )
        })}
        <span className="ml-auto text-xs text-purple-500">
          {matched.length} of {annotations.length} annotations matched
        </span>
      </div>

      {/* Resume text with highlights */}
      <div className="max-h-[520px] overflow-y-auto rounded-lg border border-purple-800/30 bg-[#0B1F3A]/60 p-5">
        <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-purple-100">
          {segments.map((seg, i) =>
            seg.annotation ? (
              <mark
                key={i}
                onClick={() =>
                  setSelected(selected === seg.annotation ? null : seg.annotation!)
                }
                className={`rounded-sm px-0.5 ${TYPE_STYLES[seg.annotation.type]} ${
                  selected === seg.annotation ? "ring-2 ring-white/30" : ""
                }`}
                style={{ backgroundColor: "transparent" }}
              >
                {seg.text}
              </mark>
            ) : (
              <span key={i}>{seg.text}</span>
            )
          )}
        </pre>
      </div>

      {/* Selected annotation callout */}
      {selected && (
        <div
          className={`relative rounded-lg border p-4 ${TYPE_BADGE[selected.type].className}`}
        >
          <button
            onClick={() => setSelected(null)}
            className="absolute right-3 top-3 rounded-full p-0.5 opacity-60 hover:opacity-100"
          >
            <X className="h-3.5 w-3.5" />
          </button>
          <div className="flex items-start gap-3">
            {(() => {
              const { Icon, label, className } = TYPE_BADGE[selected.type]
              return (
                <span
                  className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${className}`}
                >
                  <Icon className="h-3 w-3" />
                  {label}
                </span>
              )
            })()}
            <div className="space-y-1.5">
              <p className="font-mono text-xs italic opacity-70">
                &ldquo;{selected.original}&rdquo;
              </p>
              <p className="text-sm leading-relaxed">{selected.suggestion}</p>
            </div>
          </div>
        </div>
      )}

      <p className="text-center text-xs text-purple-500">
        Use these notes as a guide while editing your original document to preserve any embedded links.
      </p>
    </div>
  )
}
