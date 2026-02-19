"use client"

import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import type { JobInfo } from "@/types"

interface JobFormProps {
  jobInfo: JobInfo
  onChange: (jobInfo: JobInfo) => void
}

export function JobForm({ jobInfo, onChange }: JobFormProps) {
  const update = (field: keyof JobInfo, value: string | boolean) => {
    onChange({ ...jobInfo, [field]: value })
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="job-title" className="text-sm font-medium text-purple-200">
            Job Title <span className="text-red-400">*</span>
          </Label>
          <Input
            id="job-title"
            placeholder="e.g. Senior Software Engineer"
            value={jobInfo.title}
            onChange={(e) => update("title", e.target.value)}
            className="border-purple-800/50 bg-[#0B1F3A] text-white placeholder:text-purple-700 focus-visible:ring-purple-500"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="company" className="text-sm font-medium text-purple-200">
            Company
          </Label>
          <Input
            id="company"
            placeholder="e.g. Google"
            value={jobInfo.company}
            onChange={(e) => update("company", e.target.value)}
            className="border-purple-800/50 bg-[#0B1F3A] text-white placeholder:text-purple-700 focus-visible:ring-purple-500"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="job-description" className="text-sm font-medium text-purple-200">
          Job Description <span className="text-red-400">*</span>
        </Label>
        <Textarea
          id="job-description"
          placeholder="Paste the full job description here..."
          value={jobInfo.description}
          onChange={(e) => update("description", e.target.value)}
          rows={7}
          className="resize-none border-purple-800/50 bg-[#0B1F3A] text-white placeholder:text-purple-700 focus-visible:ring-purple-500"
        />
      </div>

      <div className="flex items-center justify-between rounded-lg border border-purple-800/30 bg-purple-900/10 px-4 py-3">
        <div>
          <p className="text-sm font-medium text-white">Generate Cover Letter</p>
          <p className="text-xs text-purple-400">
            AI will also write a tailored cover letter for this role
          </p>
        </div>
        <Switch
          checked={jobInfo.generateCoverLetter}
          onCheckedChange={(checked) => update("generateCoverLetter", checked)}
          className="data-[state=checked]:bg-purple-600"
        />
      </div>
    </div>
  )
}
