import { CheckCircle2 } from "lucide-react"

interface StrengthAnalysisProps {
  strengths: string[]
}

export function StrengthAnalysis({ strengths }: StrengthAnalysisProps) {
  if (strengths.length === 0) {
    return (
      <p className="text-sm text-purple-300">No strengths identified yet.</p>
    )
  }

  return (
    <ul className="space-y-2.5">
      {strengths.map((strength, index) => (
        <li key={index} className="flex items-start gap-2.5">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-400" />
          <span className="text-sm text-purple-100">{strength}</span>
        </li>
      ))}
    </ul>
  )
}
