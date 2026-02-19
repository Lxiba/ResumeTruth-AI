"use client"

import { useState } from "react"
import { Copy, Check } from "lucide-react"
import { Button } from "@/components/ui/button"

interface ResumePreviewProps {
  content: string
}

export function ResumePreview({ content }: ResumePreviewProps) {
  const [copied, setCopied] = useState(false)

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
            <>
              <Check className="mr-1.5 h-3.5 w-3.5 text-green-400" /> Copied!
            </>
          ) : (
            <>
              <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy Text
            </>
          )}
        </Button>
      </div>
      <div className="max-h-[500px] overflow-y-auto rounded-lg border border-purple-800/30 bg-[#0B1F3A]/60 p-5 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-purple-800">
        <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-purple-100">
          {content}
        </pre>
      </div>
    </div>
  )
}
