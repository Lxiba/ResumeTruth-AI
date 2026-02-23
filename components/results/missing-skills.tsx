import { Badge } from "@/components/ui/badge"
import { AlertCircle } from "lucide-react"

interface MissingSkillsProps {
  skills: string[]
}

export function MissingSkills({ skills }: MissingSkillsProps) {
  if (skills.length === 0) {
    return (
      <p className="text-sm text-purple-300">
        Great news — no critical skill gaps detected!
      </p>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm text-purple-300">
        <AlertCircle className="h-4 w-4 text-orange-400" />
        <span>{skills.length} missing skill{skills.length !== 1 ? "s" : ""} detected</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {skills.map((skill) => (
          <Badge
            key={skill}
            variant="outline"
            className="max-w-full break-words border-purple-600/50 bg-purple-900/30 text-purple-200 hover:bg-purple-800/40"
          >
            {skill}
          </Badge>
        ))}
      </div>
    </div>
  )
}
