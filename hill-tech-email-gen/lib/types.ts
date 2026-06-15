export interface SkillItem {
  /** The requirement description shown in the left column */
  skill: string
  /** "Required" | "Highly desired" | "Desired" */
  level: 'Required' | 'Highly desired' | 'Desired'
  /** Experience in years, e.g. "2 Years" — empty string when not specified */
  years: string
}

export interface RequisitionFields {
  /** Position title extracted from the requisition. */
  position_title: string
  /** Display-friendly title after AI normalization */
  position_title_display?: string
  /** Requisition or job ID identifier. */
  req_id: string
  /** Agency or client organization name. */
  agency: string
  /** Job location. */
  location: string
  /** Worksite arrangement (onsite, hybrid, remote, etc.). */
  worksite_arrangement: string
  /** Raw extracted rate string; recruiter will edit manually. */
  rate: string
  /** Contract length derived from dates, or blank if unavailable. */
  contract_length: string
  /** Start date for the engagement. */
  start_date: string
  /** End date for the engagement. */
  end_date: string
  /** Submission deadline date. */
  submission_deadline: string
  /** Engagement type (1099, C2C, W2, etc.). */
  engagement_type: string
  /** Three to five sentence AI summary of the role. */
  position_description: string
  /** Concise duty bullet points. */
  duties: string[]
  /** Structured skill rows for the Skills Matrix table */
  skills_checklist: SkillItem[]
  /** Missing or ambiguous field warnings flagged by AI. */
  warnings: string[]
}

export interface DraftHistory {
  /** Unique draft identifier. */
  id: string
  /** Draft creation timestamp as an ISO date string. */
  created_at: string
  /** Position title captured for this draft. */
  position_title: string
  /** Requisition ID captured for this draft. */
  req_id: string
  /** Full requisition fields snapshot for the draft. */
  fields: RequisitionFields
}
