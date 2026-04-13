export async function pdfToBase64(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = (): void => {
      const result = reader.result

      if (typeof result !== 'string') {
        reject(new Error('Failed to read PDF file as text data.'))
        return
      }

      const commaIndex = result.indexOf(',')
      if (commaIndex === -1) {
        reject(new Error('Failed to parse PDF file content.'))
        return
      }

      resolve(result.slice(commaIndex + 1))
    }

    reader.onerror = (): void => {
      reject(new Error('Unable to read the selected PDF file.'))
    }

    reader.readAsDataURL(file)
  })
}

export async function pdfToText(file: File): Promise<string> {
  try {
    const pdfjsLib = await import('pdfjs-dist')
    pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

    const data = await file.arrayBuffer()
    const loadingTask = pdfjsLib.getDocument({ data })
    const pdf = await loadingTask.promise

    const pages: string[] = []

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber)
      const textContent = await page.getTextContent()
      const pageLines = textContent.items
        .map((item): string => {
          if ('str' in item && typeof item.str === 'string') {
            return item.str
          }
          return ''
        })
        .filter((line): boolean => line.trim().length > 0)

      pages.push(pageLines.join('\n'))
    }

    return pages.join('\n')
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    throw new Error(`Failed to extract text from the PDF file. ${message}`)
  }
}

export function isPDF(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
}
