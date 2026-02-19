"use client"

interface ProbabilityScoreProps {
  score: number
}

function getScoreColor(score: number): string {
  if (score >= 75) return "#22c55e"    // green
  if (score >= 50) return "#eab308"    // yellow
  if (score >= 25) return "#f97316"    // orange
  return "#ef4444"                      // red
}

function getScoreLabel(score: number): string {
  if (score >= 75) return "Strong Match"
  if (score >= 50) return "Good Match"
  if (score >= 25) return "Partial Match"
  return "Weak Match"
}

export function ProbabilityScore({ score }: ProbabilityScoreProps) {
  const clamped = Math.max(0, Math.min(100, score))
  const radius = 54
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - (clamped / 100) * circumference
  const color = getScoreColor(clamped)
  const label = getScoreLabel(clamped)

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative flex items-center justify-center">
        <svg width="140" height="140" className="-rotate-90">
          {/* Background ring */}
          <circle
            cx="70"
            cy="70"
            r={radius}
            fill="none"
            stroke="#1e1040"
            strokeWidth="12"
          />
          {/* Score ring */}
          <circle
            cx="70"
            cy="70"
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth="12"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 1s ease-in-out" }}
          />
        </svg>
        <div className="absolute flex flex-col items-center">
          <span className="text-3xl font-bold text-white">{clamped}%</span>
        </div>
      </div>
      <div className="text-center">
        <p className="text-lg font-semibold" style={{ color }}>
          {label}
        </p>
        <p className="mt-0.5 text-sm text-purple-300">Hiring Probability</p>
      </div>
    </div>
  )
}
