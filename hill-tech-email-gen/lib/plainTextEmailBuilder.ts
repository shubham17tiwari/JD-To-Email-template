import type { RequisitionFields } from './types'
import {
  STATIC_BENEFITS_BLOCK,
  STATIC_CTA,
  STATIC_CTA_SEND,
  STATIC_DISCLAIMER,
  STATIC_GREETING,
  STATIC_IDEAL_CANDIDATE_NOTE,
  STATIC_INTRO_PARAGRAPH,
  STATIC_SIGNATURE,
  STATIC_VALUE_PROP,
} from '../constants/emailTemplate'

export function buildPlainTextEmail(fields: RequisitionFields): string {
  const positionTitle = fields.position_title.trim() || '[POSITION TITLE — SET MANUALLY]'
  const location = fields.location.trim() || '[LOCATION — SET MANUALLY]'
  const agency = fields.agency.trim() || '[AGENCY — SET MANUALLY]'
  const worksiteArrangement =
    fields.worksite_arrangement.trim() || '[WORKSITE ARRANGEMENT — SET MANUALLY]'
  const contractLength = fields.contract_length.trim() || '[CONTRACT LENGTH — SET MANUALLY]'
  const submissionDeadline = fields.submission_deadline.trim() || '[DATE — SET MANUALLY]'
  const positionDescription =
    fields.position_description.trim() || '[POSITION DESCRIPTION — SET MANUALLY]'

  const introParagraph = STATIC_INTRO_PARAGRAPH.replace('{POSITION_TITLE}', positionTitle)

  const rateLine = fields.rate.trim()
    ? `Rate: Up to $${fields.rate}/hr (1099 or C2C) depending on experience.`
    : 'Rate: [SET MANUALLY BY RECRUITER]'

  const dutiesLines =
    fields.duties.length > 0
      ? fields.duties.map((duty) => `  • ${duty}`).join('\n')
      : '  • [DUTIES — SET MANUALLY]'

  const skillsLines =
    fields.skills_checklist.length > 0
      ? fields.skills_checklist.map((skill) => `  ☐ ${skill}`).join('\n')
      : '  ☐ [SKILLS — SET MANUALLY]'

  const sections: string[] = [
    `${positionTitle} — Open Position`,
    STATIC_GREETING,
    introParagraph,
    STATIC_VALUE_PROP,
    STATIC_CTA,
    [
      `Location: ${location}`,
      `Agency: ${agency}`,
      rateLine,
      `Worksite Arrangement: ${worksiteArrangement}`,
      `Contract Length: ${contractLength}`,
      `*Deadline — Submittals Need to be Made by COB on ${submissionDeadline}*`,
    ].join('\n'),
    STATIC_IDEAL_CANDIDATE_NOTE,
    ['Position Description:', positionDescription].join('\n'),
    ['Duties & Responsibilities:', dutiesLines].join('\n'),
    ['Skills Checklist:', skillsLines].join('\n'),
    '-',
    STATIC_BENEFITS_BLOCK,
    [
      STATIC_CTA_SEND,
      'We look forward to hearing from you!',
      '(Referrals welcome for this position)',
    ].join('\n'),
    STATIC_SIGNATURE,
    STATIC_DISCLAIMER,
  ]

  return sections.join('\n\n')
}
