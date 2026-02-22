export type OptimizeMode = "full" | "annotate"
export type AnnotationType = "remove" | "replace" | "reformat"

export interface Annotation {
  original: string      // verbatim text from resume to highlight
  type: AnnotationType
  suggestion: string    // brief note shown on click
}

export interface AnalysisResult {
  hiringProbability: number
  missingSkills: string[]
  strengthAnalysis: string[]
  optimizedResume?: string      // "full" mode only
  annotations?: Annotation[]   // "annotate" mode only
  coverLetter?: string          // "full" mode + toggle only
  aiExplanation: string[]
  mode: OptimizeMode
}

export interface JobInfo {
  title: string
  company: string
  description: string
  generateCoverLetter: boolean
  optimizeMode: OptimizeMode
  condenseResume?: boolean
}
