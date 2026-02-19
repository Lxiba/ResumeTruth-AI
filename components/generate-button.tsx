"use client"

import { Loader2, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"

interface GenerateButtonProps {
  onClick: () => void
  isLoading: boolean
  disabled?: boolean
}

export function GenerateButton({ onClick, isLoading, disabled }: GenerateButtonProps) {
  return (
    <Button
      onClick={onClick}
      disabled={disabled || isLoading}
      size="lg"
      className="w-full cursor-pointer bg-[#6D28D9] py-6 text-base font-semibold text-white shadow-lg shadow-purple-900/40 transition-all duration-200 hover:bg-purple-700 hover:shadow-purple-700/50 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {isLoading ? (
        <>
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Analyzing your resume...
        </>
      ) : (
        <>
          <Sparkles className="mr-2 h-5 w-5" />
          Analyze &amp; Optimize Resume
        </>
      )}
    </Button>
  )
}
