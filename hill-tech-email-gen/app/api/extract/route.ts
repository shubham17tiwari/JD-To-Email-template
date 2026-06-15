import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { EXTRACTION_SYSTEM_PROMPT, buildUserPrompt } from '@/lib/extractionPrompt'
import { normalizeJobTitle } from '@/lib/titleNormalizer'

const PRIMARY_EXTRACTION_MODEL =
  process.env.DEEPSEEK_EXTRACTION_MODEL?.trim() || 'deepseek-chat'
const FALLBACK_EXTRACTION_MODELS = ['deepseek-chat']
const RETRIABLE_HTTP_CODES = new Set([429, 500, 502, 503, 504])

// ---------------------------------------------------------------------------
// PDF text extraction (server-side fallback)
// ---------------------------------------------------------------------------
async function extractTextFromBase64Pdf(base64: string): Promise<string> {
  const binaryString = atob(base64)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i += 1) {
    bytes[i] = binaryString.charCodeAt(i)
  }

  const pdfjsLib = await import('pdfjs-dist')
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/5.6.205/pdf.worker.min.mjs'

  const loadingTask = pdfjsLib.getDocument({ data: bytes })
  const pdf = await loadingTask.promise

  const pages: string[] = []
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
    const page = await pdf.getPage(pageNum)
    const textContent = await page.getTextContent()
    const pageText = textContent.items
      .map((item) => ('str' in item && typeof item.str === 'string' ? item.str : ''))
      .filter((s: string) => s.trim().length > 0)
      .join('\n')
    pages.push(pageText)
  }

  return pages.join('\n\n')
}

// ---------------------------------------------------------------------------
// DeepSeek client
// ---------------------------------------------------------------------------
function getAiClient(): OpenAI | null {
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim()
  if (!apiKey) return null
  return new OpenAI({
    apiKey,
    baseURL: 'https://api.deepseek.com',
  })
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

type ApiErrorInfo = {
  status?: number
  message?: string
}

function parseApiError(err: unknown): ApiErrorInfo {
  if (
    err instanceof Error &&
    'status' in err &&
    typeof (err as { status: unknown }).status === 'number'
  ) {
    return {
      status: (err as { status: number }).status,
      message: err.message,
    }
  }
  if (err instanceof Error) {
    return { message: err.message }
  }
  return {}
}

function isRetriableError(err: unknown): boolean {
  const info = parseApiError(err)
  return Boolean(info.status && RETRIABLE_HTTP_CODES.has(info.status))
}

function getExtractionModels(): string[] {
  const models = [PRIMARY_EXTRACTION_MODEL, ...FALLBACK_EXTRACTION_MODELS]
  return [...new Set(models.map((m) => m.trim()).filter(Boolean))]
}

function adjustExtractedRate(rawRate: unknown): string {
  if (typeof rawRate !== 'string') return ''
  const trimmed = rawRate.trim()
  if (!trimmed) return ''
  const match = trimmed.match(/-?\d+(?:\.\d+)?/)
  if (!match) return ''
  const parsed = Number.parseFloat(match[0])
  if (!Number.isFinite(parsed)) return ''
  const adjusted = parsed - 17
  return Number.isInteger(adjusted)
    ? adjusted.toString()
    : adjusted.toFixed(2).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1')
}

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------
async function generateExtraction(
  client: OpenAI,
  pdfText: string,
): Promise<string> {
  const models = getExtractionModels()
  let lastError: unknown

  for (const model of models) {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const completion = await client.chat.completions.create({
          model,
          messages: [
            { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
            {
              role: 'user',
              content: `Here is the text extracted from a job requisition PDF:\n\n${pdfText}\n\n${buildUserPrompt()}`,
            },
          ],
          temperature: 0.1,
          max_tokens: 4096,
        })

        const content = completion.choices[0]?.message?.content
        if (content) return content
        lastError = new Error('DeepSeek returned an empty response')
      } catch (err) {
        lastError = err
        if (attempt < 3 && isRetriableError(err)) {
          await sleep(500 * attempt)
          continue
        }
        break
      }
    }
  }

  throw lastError ?? new Error('DeepSeek extraction failed')
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const client = getAiClient()
    if (!client) {
      return NextResponse.json(
        { error: 'DEEPSEEK_API_KEY environment variable is not set' },
        { status: 500 },
      )
    }

    const body = await req.json()

    if (!body.base64 && !body.text) {
      return NextResponse.json(
        { error: 'base64 or text is required' },
        { status: 400 },
      )
    }

    const { base64, text, filename = 'unknown.pdf' } = body as {
      base64?: string
      text?: string
      filename?: string
    }

    // Prefer client-extracted text; fall back to server-side extraction
    const pdfText: string =
      text?.trim() || (base64 ? await extractTextFromBase64Pdf(base64) : '')

    if (!pdfText.trim()) {
      return NextResponse.json(
        { error: 'Could not extract text from the provided PDF' },
        { status: 400 },
      )
    }

    const responseText = await generateExtraction(client, pdfText)
    const clean = responseText.replace(/```json|```/g, '').trim()

    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(clean)
    } catch {
      return NextResponse.json(
        { error: 'DeepSeek response was not valid JSON' },
        { status: 500 },
      )
    }

    parsed.contract_length = '24 months+'
    parsed.rate = adjustExtractedRate(parsed.rate)

    const apiKey = process.env.DEEPSEEK_API_KEY || ''
    parsed.position_title_display = await normalizeJobTitle(
      (parsed.position_title as string) || '',
      (parsed.position_description as string) || '',
      apiKey,
    )

    console.log(
      `[extract] ${filename} — success at ${new Date().toISOString()}`,
    )
    return NextResponse.json(parsed, { status: 200 })
  } catch (err) {
    const info = parseApiError(err)
    const message =
      info.message || (err instanceof Error ? err.message : 'Unknown error')
    const status =
      info.status && info.status >= 400 && info.status <= 599
        ? info.status
        : 500

    console.error('[extract] Error:', {
      status,
      providerStatus: info.status,
      message,
    })

    return NextResponse.json({ error: message }, { status })
  }
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 })
}
