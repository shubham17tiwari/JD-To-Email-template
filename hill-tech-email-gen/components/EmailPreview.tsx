'use client'

import { useRef, useState } from 'react'

import type { RequisitionFields } from '@/lib/types'
import { copyEmailToClipboard, copyPlainText } from '@/lib/clipboardService'
import { buildHtmlEmail } from '@/lib/htmlEmailBuilder'

interface Props {
  fields: RequisitionFields
  onEdit: () => void
}

export default function EmailPreview({ fields, onEdit }: Props) {
  const [copyMessage, setCopyMessage] = useState<string>('')
  const [copyError, setCopyError] = useState<boolean>(false)
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const subject = `Seeking a ${fields.position_title || '[POSITION TITLE]'} — Immediate Opening`
  const htmlContent = buildHtmlEmail(fields)

  const setTimedMessage = (message: string, isError: boolean): void => {
    if (clearTimerRef.current) {
      clearTimeout(clearTimerRef.current)
    }

    setCopyMessage(message)
    setCopyError(isError)

    clearTimerRef.current = setTimeout(() => {
      setCopyMessage('')
      setCopyError(false)
      clearTimerRef.current = null
    }, 2500)
  }

  const handleCopyPlainText = async (): Promise<void> => {
    try {
      await copyPlainText(fields, subject)
      setTimedMessage('Copied as plain text!', false)
    } catch {
      setTimedMessage('Copy failed — select and copy manually.', true)
    }
  }

  const handleCopyFormatted = async (): Promise<void> => {
    try {
      const result = await copyEmailToClipboard(fields, subject)
      setTimedMessage(result.message, false)
    } catch {
      setTimedMessage('Copy failed — select and copy manually.', true)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-3">
        <button
          type="button"
          onClick={onEdit}
          className="border border-gray-200 rounded-lg px-4 py-2 text-sm hover:bg-gray-50"
        >
          ← Edit fields
        </button>

        <div className="flex items-center gap-2">
          {copyMessage ? (
            <span className={`text-sm ${copyError ? 'text-red-600' : 'text-green-600'}`}>
              {copyMessage}
            </span>
          ) : null}

          <button
            type="button"
            onClick={handleCopyPlainText}
            className="rounded-lg px-4 py-2 text-sm border border-gray-200 hover:bg-gray-50"
          >
            Copy plain text
          </button>

          <button
            type="button"
            onClick={handleCopyFormatted}
            className="bg-gray-900 text-white rounded-lg px-4 py-2 text-sm"
          >
            Copy formatted email
          </button>
        </div>
      </div>

      <div className="mb-3">
        <span className="bg-green-50 text-green-700 text-xs rounded-md px-3 py-1 inline-flex items-center">
          ✓ HTML formatted — paste into Gmail or Outlook
        </span>
      </div>

      <div className="bg-gray-50 border border-b-0 border-gray-200 rounded-t-xl px-5 py-3">
        <span className="text-xs font-semibold text-gray-500 mr-3">SUBJECT</span>
        <span className="text-sm text-gray-800">{subject}</span>
      </div>

      <div className="bg-white border border-gray-200 rounded-b-xl p-6 overflow-y-auto" style={{ maxHeight: 580 }}>
        <div dangerouslySetInnerHTML={{ __html: htmlContent }} />
      </div>

      <p className="mt-3 text-xs text-gray-400">
        Copy formatted email pastes with bold labels, bullet points, and full layout into Gmail or
        Outlook. Copy plain text is for plain-text systems.
      </p>
    </div>
  )
}
