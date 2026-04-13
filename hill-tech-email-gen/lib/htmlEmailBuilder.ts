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

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export function buildHtmlEmail(fields: RequisitionFields): string {
  const location = fields.location.trim()
    ? escapeHtml(fields.location)
    : '[LOCATION — SET MANUALLY]'
  const agency = fields.agency.trim()
    ? escapeHtml(fields.agency)
    : '[AGENCY — SET MANUALLY]'
  const rate = fields.rate.trim()
    ? `Up to $${escapeHtml(fields.rate)}/hr (1099 or C2C) depending on experience.`
    : '[RATE — SET MANUALLY BY RECRUITER]'
  const worksiteArrangement = fields.worksite_arrangement.trim()
    ? escapeHtml(fields.worksite_arrangement)
    : '[WORKSITE — SET MANUALLY]'
  const contractLength = fields.contract_length.trim()
    ? escapeHtml(fields.contract_length)
    : '[CONTRACT LENGTH — SET MANUALLY]'
  const deadline = fields.submission_deadline.trim()
    ? escapeHtml(fields.submission_deadline)
    : '[DATE — SET MANUALLY]'
  const positionDescription = fields.position_description.trim()
    ? escapeHtml(fields.position_description)
    : '[POSITION DESCRIPTION — SET MANUALLY]'

  const dutiesList =
    fields.duties.length > 0
      ? fields.duties
          .map((duty) => `<li style="margin-bottom: 4px;">${escapeHtml(duty)}</li>`)
          .join('')
      : '<li style="margin-bottom: 4px;">[DUTIES — SET MANUALLY]</li>'

  const skillsList =
    fields.skills_checklist.length > 0
      ? fields.skills_checklist
          .map(
            (skill) =>
              `<li style="margin-bottom: 4px;">&#9744; ${escapeHtml(skill)}</li>`,
          )
          .join('')
      : '<li style="margin-bottom: 4px;">&#9744; [SKILLS — SET MANUALLY]</li>'

  const introParagraph = STATIC_INTRO_PARAGRAPH.replace(
    '{POSITION_TITLE}',
    `<strong>${escapeHtml(fields.position_title)}</strong>`,
  )

  const benefitsWithBreaks = STATIC_BENEFITS_BLOCK.split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join('<br>')

  const signatureWithBreaks = STATIC_SIGNATURE.split('\n').join('<br>')

  return `<div style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.7; color: #222222; max-width: 640px;">
<p style="font-size: 17px; font-weight: bold; margin: 0 0 16px 0;">
  ${escapeHtml(fields.position_title)} — Open Position
</p>

<p style="margin: 0 0 12px 0;">${STATIC_GREETING}</p>

<p style="margin: 0 0 12px 0;">
  ${introParagraph}
</p>

<p style="margin: 0 0 12px 0;">${STATIC_VALUE_PROP}</p>

<p style="margin: 0 0 20px 0;">${STATIC_CTA}</p>

<table style="border-collapse: collapse; margin: 0 0 20px 0;">
  <tr>
    <td style="padding: 3px 16px 3px 0; font-weight: bold; white-space: nowrap; vertical-align: top;">Location:</td>
    <td style="padding: 3px 0; vertical-align: top;">${location}</td>
  </tr>
  <tr>
    <td style="padding: 3px 16px 3px 0; font-weight: bold; white-space: nowrap; vertical-align: top;">Agency:</td>
    <td style="padding: 3px 0; vertical-align: top;">${agency}</td>
  </tr>
  <tr>
    <td style="padding: 3px 16px 3px 0; font-weight: bold; white-space: nowrap; vertical-align: top;">Rate:</td>
    <td style="padding: 3px 0; vertical-align: top;">${rate}</td>
  </tr>
  <tr>
    <td style="padding: 3px 16px 3px 0; font-weight: bold; white-space: nowrap; vertical-align: top;">Worksite Arrangement:</td>
    <td style="padding: 3px 0; vertical-align: top;">${worksiteArrangement}</td>
  </tr>
  <tr>
    <td style="padding: 3px 16px 3px 0; font-weight: bold; white-space: nowrap; vertical-align: top;">Contract Length:</td>
    <td style="padding: 3px 0; vertical-align: top;">${contractLength}</td>
  </tr>
  <tr>
    <td style="padding: 3px 16px 3px 0; font-weight: bold; white-space: nowrap; vertical-align: top;">Deadline:</td>
    <td style="padding: 3px 0; vertical-align: top;"><strong><em>*Submittals Need to be Made by COB on ${deadline}*</em></strong></td>
  </tr>
</table>

<p style="margin: 0 0 20px 0; font-style: italic; color: #555555;">${STATIC_IDEAL_CANDIDATE_NOTE}</p>

<p style="margin: 0 0 6px 0;"><strong>Position Description:</strong></p>
<p style="margin: 0 0 20px 0;">${positionDescription}</p>

<p style="margin: 0 0 8px 0;"><strong>Duties &amp; Responsibilities:</strong></p>
<ul style="margin: 0 0 20px 0; padding-left: 20px;">
  ${dutiesList}
</ul>

<p style="margin: 0 0 8px 0;"><strong>Skills Checklist:</strong></p>
<ul style="margin: 0 0 24px 0; padding-left: 4px; list-style: none;">
  ${skillsList}
</ul>

<hr style="border: none; border-top: 1px solid #dddddd; margin: 0 0 16px 0;">

<p style="margin: 0 0 8px 0;"><strong>What's the benefit of working with Hill Technologies?</strong></p>
<p style="margin: 0 0 20px 0;">
  ${benefitsWithBreaks}
</p>

<p style="margin: 0 0 6px 0;">
  <strong>${STATIC_CTA_SEND}</strong><br>
  We look forward to hearing from you!<br>
  <em>(Referrals welcome for this position)</em>
</p>

<br>

<p style="margin: 0 0 20px 0;">
  ${signatureWithBreaks}
</p>

<p style="font-size: 11px; color: #888888; border-top: 1px solid #eeeeee; padding-top: 10px; margin: 0;">
  ${STATIC_DISCLAIMER}
</p>
</div>`
}
