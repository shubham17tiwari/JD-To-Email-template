import type { RequisitionFields } from './types'
import { buildHtmlEmail } from './htmlEmailBuilder'
import { buildPlainTextEmail } from './plainTextEmailBuilder'

export type CopyResult = { method: 'html' | 'plaintext'; message: string }

export async function copyEmailToClipboard(
  fields: RequisitionFields,
  subject: string,
): Promise<CopyResult> {
  const htmlContent = `<p><strong>Subject: ${subject}</strong></p><br>${buildHtmlEmail(fields)}`
  const plainContent = `Subject: ${subject}\n\n${buildPlainTextEmail(fields)}`

  try {
    const item = new ClipboardItem({
      'text/html': new Blob([htmlContent], { type: 'text/html' }),
      'text/plain': new Blob([plainContent], { type: 'text/plain' }),
    })

    await navigator.clipboard.write([item])
    return {
      method: 'html',
      message: 'Copied with formatting — paste into Gmail or Outlook.',
    }
  } catch {
    try {
      await navigator.clipboard.writeText(plainContent)
      return { method: 'plaintext', message: 'Copied as plain text.' }
    } catch {
      throw new Error('Copy failed — please select the email and copy manually.')
    }
  }
}

export async function copyPlainText(
  fields: RequisitionFields,
  subject: string,
): Promise<void> {
  const plainContent = `Subject: ${subject}\n\n${buildPlainTextEmail(fields)}`
  await navigator.clipboard.writeText(plainContent)
}
