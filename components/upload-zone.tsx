"use client"

import { useCallback, useState } from "react"
import { Upload, FileText, X } from "lucide-react"

interface UploadZoneProps {
  onFileSelect: (file: File) => void
  selectedFile: File | null
  onClear: () => void
}

const ACCEPTED_TYPES = ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain", "application/rtf", "text/rtf"]
const ACCEPTED_EXTENSIONS = [".pdf", ".docx", ".txt", ".rtf"]

function isAccepted(file: File): boolean {
  return (
    ACCEPTED_TYPES.includes(file.type) ||
    ACCEPTED_EXTENSIONS.some((ext) => file.name.toLowerCase().endsWith(ext))
  )
}

export function UploadZone({ onFileSelect, selectedFile, onClear }: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false)

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      setIsDragging(false)
      const file = e.dataTransfer.files[0]
      if (file && isAccepted(file)) {
        onFileSelect(file)
      }
    },
    [onFileSelect]
  )

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback(() => {
    setIsDragging(false)
  }, [])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) onFileSelect(file)
  }

  if (selectedFile) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-purple-500/40 bg-purple-900/20 p-4">
        <FileText className="h-8 w-8 shrink-0 text-purple-400" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-white">{selectedFile.name}</p>
          <p className="text-xs text-purple-300">
            {(selectedFile.size / 1024).toFixed(0)} KB — ready to analyze
          </p>
        </div>
        <button
          onClick={onClear}
          className="rounded-full p-1 text-purple-300 transition-colors hover:bg-purple-800/40 hover:text-white"
          aria-label="Remove file"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    )
  }

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      className={`relative cursor-pointer rounded-xl border-2 border-dashed p-10 text-center transition-all duration-200 ${
        isDragging
          ? "border-purple-400 bg-purple-900/30"
          : "border-purple-800/50 bg-[#0B1F3A]/50 hover:border-purple-600/60 hover:bg-purple-900/10"
      }`}
    >
      <input
        type="file"
        accept=".pdf,.docx,.txt,.rtf"
        onChange={handleInputChange}
        className="absolute inset-0 cursor-pointer opacity-0"
        aria-label="Upload resume"
      />
      <Upload
        className={`mx-auto mb-3 h-10 w-10 transition-colors ${
          isDragging ? "text-purple-400" : "text-purple-600"
        }`}
      />
      <p className="text-base font-semibold text-white">
        Drag & drop your resume here
      </p>
      <p className="mt-1 text-sm text-purple-300">
        or <span className="text-purple-400 underline underline-offset-2">click to browse</span>
      </p>
      <p className="mt-3 text-xs text-purple-500">Supports PDF, DOCX, TXT, and RTF files</p>
    </div>
  )
}
