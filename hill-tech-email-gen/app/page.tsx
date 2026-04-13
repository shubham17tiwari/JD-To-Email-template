'use client'

import { useState } from 'react'

import EmailPreview from '@/components/EmailPreview'
import FieldEditor from '@/components/FieldEditor'
import UploadZone from '@/components/UploadZone'
import { isPDF, pdfToBase64, pdfToText } from '@/lib/pdfReader'
import type { RequisitionFields } from '@/lib/types'

type Step = 'upload' | 'edit' | 'preview'

type ExtractResponse = RequisitionFields & {
  warnings?: string[]
}

function StepIndicator({ step }: { step: Step }) {
  const steps = [
    { key: 'upload', label: 'Upload' },
    { key: 'edit', label: 'Review Fields' },
    { key: 'preview', label: 'Preview Email' },
  ] as const

  const activeIndex = step === 'edit' ? 1 : 2

  return (
    <div className="mb-5 flex items-center gap-3 text-xs">
      {steps.map((item, index) => {
        const isCompleted = index < activeIndex
        const isActive = index === activeIndex

        return (
          <div key={item.key} className="flex items-center gap-2">
            <span
              className={`inline-flex h-5 w-5 items-center justify-center rounded-full border text-[11px] ${
                isCompleted
                  ? 'border-green-300 bg-green-50 text-green-700'
                  : isActive
                    ? 'border-blue-300 bg-blue-50 text-blue-700'
                    : 'border-gray-200 text-gray-500'
              }`}
            >
              {isCompleted ? '✓' : index + 1}
            </span>
            <span className={isActive ? 'font-medium text-gray-800' : 'text-gray-500'}>
              {item.label}
            </span>
            {index < steps.length - 1 ? <span className="text-gray-300">→</span> : null}
          </div>
        )
      })}
    </div>
  )
}

export default function Home() {
  const [step, setStep] = useState<Step>('upload')
  const [fields, setFields] = useState<RequisitionFields | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [currentFileName, setCurrentFileName] = useState<string>('')

  const handleFileSelected = async (file: File): Promise<void> => {
    if (!isPDF(file)) {
      setError('Only PDF files are supported.')
      return
    }

    setIsLoading(true)
    setError(null)
    setCurrentFileName(file.name)

    try {
      const [base64, text] = await Promise.all([pdfToBase64(file), pdfToText(file)])

      const response = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64, text, filename: file.name }),
      })

      if (!response.ok) {
        throw new Error(await response.text())
      }

      const data = (await response.json()) as ExtractResponse
      setFields(data)
      setWarnings(Array.isArray(data.warnings) ? data.warnings : [])
      setStep('edit')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Extraction failed. Please try again.'
      setError(message || 'Extraction failed. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleFieldsChange = (updated: RequisitionFields): void => {
    setFields(updated)
  }

  const handleGenerateEmail = (): void => {
    setStep('preview')
  }

  const handleEdit = (): void => {
    setStep('edit')
  }

  const handleReset = (): void => {
    setStep('upload')
    setFields(null)
    setWarnings([])
    setError(null)
    setIsLoading(false)
    setCurrentFileName('')
  }

  return (
    <main className="max-w-3xl mx-auto px-4 py-8">
      <header className="border-b border-gray-100 pb-4 mb-6">
        <h1 className="text-xl font-medium text-gray-900">Hill Technologies — Email Generator</h1>
        <p className="text-sm text-gray-500">
          Upload a requisition → AI extracts fields → generate your outreach email
        </p>
      </header>

      {error ? (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4 flex justify-between items-center">
          <p className="text-sm text-red-700">⚠ {error}</p>
          <button
            type="button"
            onClick={(): void => setError(null)}
            className="text-red-400 hover:text-red-600"
            aria-label="Clear error"
          >
            ✕
          </button>
        </div>
      ) : null}

      {step === 'edit' || step === 'preview' ? <StepIndicator step={step} /> : null}

      {step === 'upload' ? (
        <UploadZone
          onFileSelected={handleFileSelected}
          isLoading={isLoading}
          currentFileName={currentFileName}
        />
      ) : null}

      {step === 'edit' && fields ? (
        <div>
          <FieldEditor fields={fields} onChange={handleFieldsChange} warnings={warnings} />

          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={handleGenerateEmail}
              className="bg-gray-900 text-white rounded-lg px-4 py-2 text-sm"
            >
              Generate Email →
            </button>

            <button
              type="button"
              onClick={handleReset}
              className="rounded-lg px-4 py-2 text-sm border border-gray-200 hover:bg-gray-50"
            >
              Start Over
            </button>
          </div>
        </div>
      ) : null}

      {step === 'preview' && fields ? (
        <div>
          <EmailPreview fields={fields} onEdit={handleEdit} />

          <button
            type="button"
            onClick={handleReset}
            className="mt-4 rounded-lg px-4 py-2 text-sm border border-gray-200 hover:bg-gray-50"
          >
            Start Over
          </button>
        </div>
      ) : null}
    </main>
  )
}
