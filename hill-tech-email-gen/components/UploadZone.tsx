'use client'

import { useRef, useState } from 'react'

interface Props {
  onFileSelected: (file: File) => void
  isLoading: boolean
  currentFileName?: string
}

function isPdfFile(file: File): boolean {
  return file.type === 'application/pdf' || file.name.endsWith('.pdf')
}

export default function UploadZone({ onFileSelected, isLoading, currentFileName }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState<boolean>(false)
  const [error, setError] = useState<string>('')
  const [hiddenFileName, setHiddenFileName] = useState<string>('')

  const displayedFileName =
    currentFileName && currentFileName !== hiddenFileName ? currentFileName : ''

  const handleFile = (file: File): void => {
    if (!isPdfFile(file)) {
      setError('Only PDF files are supported.')
      return
    }

    setError('')
    setHiddenFileName('')
    onFileSelected(file)
  }

  const handleClick = (): void => {
    if (isLoading) {
      return
    }
    inputRef.current?.click()
  }

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    handleFile(file)
  }

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>): void => {
    event.preventDefault()
    if (isLoading) {
      return
    }
    setIsDragging(true)
  }

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>): void => {
    event.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = (event: React.DragEvent<HTMLDivElement>): void => {
    event.preventDefault()
    setIsDragging(false)

    if (isLoading) {
      return
    }

    const file = event.dataTransfer.files?.[0]
    if (!file) {
      return
    }

    handleFile(file)
  }

  const handleUploadAnother = (): void => {
    setError('')
    setHiddenFileName(currentFileName || '')
    if (inputRef.current) {
      inputRef.current.value = ''
    }
  }

  const zoneClasses = [
    'rounded-xl border-2 border-dashed border-gray-300 p-10 text-center cursor-pointer transition-colors',
    !isLoading ? 'hover:border-blue-400 hover:bg-blue-50' : '',
    isDragging ? 'border-blue-500 bg-blue-50' : '',
    isLoading ? 'opacity-60 cursor-not-allowed' : '',
    displayedFileName ? 'border-green-400 bg-green-50' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div>
      <div
        className={zoneClasses}
        onClick={handleClick}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        role="button"
        tabIndex={0}
        onKeyDown={(event): void => {
          if ((event.key === 'Enter' || event.key === ' ') && !isLoading) {
            event.preventDefault()
            handleClick()
          }
        }}
        aria-disabled={isLoading}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf"
          className="hidden"
          onChange={handleInputChange}
          disabled={isLoading}
        />

        {isLoading ? (
          <div className="flex items-center justify-center gap-3 text-gray-700">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-gray-700" />
            <span className="text-sm font-medium">Extracting fields...</span>
          </div>
        ) : (
          <div className="space-y-1">
            <div className="mx-auto mb-3 h-10 w-10 text-gray-500" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth="1.8">
                <path d="M12 16V7" strokeLinecap="round" />
                <path d="M8.5 10.5 12 7l3.5 3.5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M4 16.5v1a2.5 2.5 0 0 0 2.5 2.5h11a2.5 2.5 0 0 0 2.5-2.5v-1" strokeLinecap="round" />
              </svg>
            </div>
            <p className="text-base font-medium text-gray-800">Drop your requisition PDF here</p>
            <p className="text-sm text-gray-500">or click to browse</p>
          </div>
        )}
      </div>

      {displayedFileName ? (
        <div className="mt-3 text-sm text-gray-700">
          <p className="inline-flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-green-500" aria-hidden="true" />
            <span>{displayedFileName}</span>
          </p>
          <button
            type="button"
            className="mt-1 block text-xs text-blue-600 hover:text-blue-700"
            onClick={handleUploadAnother}
          >
            Upload another
          </button>
        </div>
      ) : null}

      {error ? <p className="text-sm text-red-500 mt-2">{error}</p> : null}
    </div>
  )
}
