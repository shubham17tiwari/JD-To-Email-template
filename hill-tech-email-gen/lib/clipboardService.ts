import type { RequisitionFields } from './types'
import { buildHtmlEmail } from './htmlEmailBuilder'
import { buildPlainTextEmail } from './plainTextEmailBuilder'

export type CopyResult = { method: 'html' | 'plaintext'; message: string }

export async function copySubjectToClipboard(subject: string): Promise<void> {
  await navigator.clipboard.writeText(subject)
}

export async function copyEmailToClipboard(
  fields: RequisitionFields,
): Promise<CopyResult> {
  const htmlContent = buildHtmlEmail(fields)
  const plainContent = buildPlainTextEmail(fields)

  try {
    const item = new ClipboardItem({
      'text/html': new Blob([htmlContent], { type: 'text/html' }),
      'text/plain': new Blob([plainContent], { type: 'text/plain' }),
    })

    await navigator.clipboard.write([item])
    return {
      method: 'html',
      message: 'Copied formatted email — paste into Gmail or Outlook.',
    }
  } catch {
    try {
      await navigator.clipboard.writeText(plainContent)
      return { method: 'plaintext', message: 'Copied email body as plain text.' }
    } catch {
      throw new Error('Copy failed — please select the email and copy manually.')
    }
  }
}

export async function copyPlainText(
  fields: RequisitionFields,
): Promise<void> {
  const plainContent = buildPlainTextEmail(fields)
  await navigator.clipboard.writeText(plainContent)
}
