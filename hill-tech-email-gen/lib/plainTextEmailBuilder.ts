import type { RequisitionFields } from './types'
import {
  STATIC_BENEFITS_BLOCK,
  STATIC_CTA,
  STATIC_CTA_SEND,
  STATIC_DISCLAIMER,
  STATIC_GREETING,
  STATIC_IDEAL_CANDIDATE_NOTE,
  STATIC_INTRO_PARAGRAPH,
  STATIC_SIGNATURE_NAME, STATIC_SIGNATURE_PHONE,
  STATIC_SIGNATURE_WEBSITE, STATIC_SIGNATURE_ADDRESS,
  STATIC_VALUE_PROP,
} from '../constants/emailTemplate'

function escapeHtml(str: string): string {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export function buildPlainTextEmail(fields: RequisitionFields): string {
  const title = fields.position_title_display?.trim() || fields.position_title.trim() || '[POSITION TITLE]'
  const location = fields.location.trim() || '[LOCATION — SET MANUALLY]'
  const agency = fields.agency.trim() || '[AGENCY — SET MANUALLY]'
  const worksiteArrangement =
    fields.worksite_arrangement.trim() || '[WORKSITE ARRANGEMENT — SET MANUALLY]'
  const contractLength = fields.contract_length.trim() || '[CONTRACT LENGTH — SET MANUALLY]'
  const submissionDeadline = fields.submission_deadline.trim() || '[DATE — SET MANUALLY]'
  const positionDescription =
    (fields.position_description || '').replace(/^## /gm, '').trim() || '[POSITION DESCRIPTION — SET MANUALLY]'

  const introParagraph = STATIC_INTRO_PARAGRAPH.replace('{POSITION_TITLE}', title)

  const rateLine = fields.rate.trim()
    ? 'Rate: Up to $' + fields.rate + '/hr (1099 or C2C) depending on experience.'
    : 'Rate: [SET MANUALLY BY RECRUITER]'

  const dutiesLines =
    fields.duties.length > 0
      ? fields.duties.map((duty) => '  • ' + duty).join('\n')
      : '  • [DUTIES — SET MANUALLY]'

  const skillsLines =
    fields.skills_checklist.length > 0
      ? fields.skills_checklist.map((item) => {
          const skill = typeof item === 'string' ? item : item.skill
          const level = typeof item === 'string' ? '' : item.level
          const years = typeof item === 'string' ? '' : item.years
          const meta = [level, years].filter(Boolean).join(', ')
          return meta ? '  ☐ ' + skill + ' [' + meta + ']' : '  ☐ ' + skill
        }).join('\n')
      : '  ☐ [SKILLS — SET MANUALLY]'

  const sections: string[] = [
    title + ' — Open Position',
    '',
    STATIC_GREETING,
    '',
    introParagraph,
    '',
    STATIC_VALUE_PROP,
    '',
    STATIC_CTA,
    '',
    [
      'Location: ' + location,
      'Agency: ' + agency,
      rateLine,
      'Worksite Arrangement: ' + worksiteArrangement,
      'Contract Length: ' + contractLength,
      '*Deadline — Submittals Need to be Made by COB on ' + submissionDeadline + '*',
    ].join('\n'),
    '',
    STATIC_IDEAL_CANDIDATE_NOTE,
    '',
    ['Position Description:', positionDescription].join('\n'),
    '',
    ['Duties & Responsibilities:', dutiesLines].join('\n'),
    '',
    ['Skills Checklist:', skillsLines].join('\n'),
    '',
    '—',
    '',
    'What\'s the benefit of working with Hill Technologies?',
    STATIC_BENEFITS_BLOCK,
    '',
    [
      STATIC_CTA_SEND,
      'We look forward to hearing from you!',
      '(Referrals welcome for this position)',
    ].join('\n'),
    '',
    '',
    STATIC_SIGNATURE_NAME,
    '________________',
    STATIC_SIGNATURE_PHONE,
    STATIC_SIGNATURE_WEBSITE,
    STATIC_SIGNATURE_ADDRESS,
    '',
    STATIC_DISCLAIMER,
  ]

  return sections.join('\n')
}
