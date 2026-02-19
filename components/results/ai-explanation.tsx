"use client"

import { useState } from "react"
import { ChevronDown, ChevronUp, Brain } from "lucide-react"

interface AiExplanationProps {
  explanations: string[]
}

export function AiExplanation({ explanations }: AiExplanationProps) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(0)

  const toggle = (index: number) => {
    setExpandedIndex(expandedIndex === index ? null : index)
  }

  return (
    <div className="space-y-2">
      {explanations.map((explanation, index) => (
        <div
          key={index}
          className="overflow-hidden rounded-lg border border-purple-800/30 bg-purple-900/10"
        >
          <button
            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-purple-900/20"
            onClick={() => toggle(index)}
          >
            <div className="flex items-center gap-2.5">
              <Brain className="h-4 w-4 shrink-0 text-purple-400" />
              <span className="text-sm font-medium text-white">
                Insight {index + 1}
              </span>
            </div>
            {expandedIndex === index ? (
              <ChevronUp className="h-4 w-4 shrink-0 text-purple-400" />
            ) : (
              <ChevronDown className="h-4 w-4 shrink-0 text-purple-400" />
            )}
          </button>
          {expandedIndex === index && (
            <div className="border-t border-purple-800/20 px-4 py-3">
              <p className="text-sm leading-relaxed text-purple-200">{explanation}</p>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
