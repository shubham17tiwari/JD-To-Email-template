import Anthropic from '@anthropic-ai/sdk'
import { NextResponse } from 'next/server'

import { buildUserPrompt, EXTRACTION_SYSTEM_PROMPT } from '@/lib/extractionPrompt'

type ExtractRequestBody = {
  base64?: string
  filename?: string
  text?: string
}

function methodNotAllowed(): NextResponse {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 })
}

function parseModelJson(text: string): unknown {
  const cleaned = text.replace(/```json\s*/gi, '').replace(/```/g, '').trim()
  return JSON.parse(cleaned)
}

function isAnthropicKey(key: string): boolean {
  return key.startsWith('sk-ant-')
}

function isOpenAIKey(key: string): boolean {
  return key.startsWith('sk-proj-') || (key.startsWith('sk-') && !key.startsWith('sk-ant-'))
}

function getProviderConfig():
  | { provider: 'anthropic'; apiKey: string }
  | { provider: 'openai'; apiKey: string }
  | null {
  const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim()
  const openaiKey = process.env.OPENAI_API_KEY?.trim()

  if (openaiKey) {
    return { provider: 'openai', apiKey: openaiKey }
  }

  if (!anthropicKey) {
    return null
  }

  if (isAnthropicKey(anthropicKey)) {
    return { provider: 'anthropic', apiKey: anthropicKey }
  }

  if (isOpenAIKey(anthropicKey)) {
    return { provider: 'openai', apiKey: anthropicKey }
  }

  return null
}

async function runAnthropicExtraction(base64: string, apiKey: string): Promise<string> {
  const client = new Anthropic({ apiKey })

  const data = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    system: EXTRACTION_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: base64,
            },
          },
          {
            type: 'text',
            text: buildUserPrompt(),
          },
        ],
      },
    ],
  })

  return data.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
}

async function runOpenAIExtraction(text: string, apiKey: string): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
      temperature: 0,
      messages: [
        {
          role: 'system',
          content: EXTRACTION_SYSTEM_PROMPT,
        },
        {
          role: 'user',
          content: `${buildUserPrompt()}\n\nDocument text:\n${text}`,
        },
      ],
    }),
  })

  const payload = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string
      }
    }>
    error?: {
      message?: string
    }
  }

  if (!response.ok) {
    const message = payload?.error?.message || `OpenAI API error (${response.status})`
    throw new Error(message)
  }

  const content = payload?.choices?.[0]?.message?.content
  if (!content) {
    throw new Error('OpenAI response did not include text content.')
  }

  return content
}

export async function POST(request: Request): Promise<NextResponse> {
  const timestamp = new Date().toISOString()
  let filename = 'unknown'

  try {
    const config = getProviderConfig()
    if (!config) {
      console.error(`[extract] failure filename=unknown timestamp=${timestamp} reason=missing_api_key`)
      return NextResponse.json(
        {
          error:
            'Server is missing a valid API key. Set OPENAI_API_KEY or ANTHROPIC_API_KEY.',
        },
        { status: 500 },
      )
    }

    const body = (await request.json()) as ExtractRequestBody
    const base64 = body.base64?.trim()
    const text = body.text?.trim()
    filename = body.filename?.trim() || 'unknown'

    if (!base64) {
      console.error(`[extract] failure filename=${filename} timestamp=${timestamp} reason=missing_base64`)
      return NextResponse.json({ error: 'base64 is required' }, { status: 400 })
    }

    if (config.provider === 'openai' && !text) {
      console.error(`[extract] failure filename=${filename} timestamp=${timestamp} reason=missing_text`)
      return NextResponse.json(
        { error: 'text is required for OpenAI extraction' },
        { status: 400 },
      )
    }

    const responseText =
      config.provider === 'openai'
        ? await runOpenAIExtraction(text || '', config.apiKey)
        : await runAnthropicExtraction(base64, config.apiKey)

    let parsed: unknown
    try {
      parsed = parseModelJson(responseText)
    } catch {
      console.error(`[extract] failure filename=${filename} timestamp=${timestamp} reason=invalid_json`)
      return NextResponse.json({ error: 'Model response was not valid JSON' }, { status: 500 })
    }

    console.info(
      `[extract] success filename=${filename} timestamp=${timestamp} provider=${config.provider}`,
    )
    return NextResponse.json(parsed, { status: 200 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown API error'
    console.error(`[extract] failure filename=${filename} timestamp=${timestamp} reason=${message}`)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function GET(): Promise<NextResponse> {
  return methodNotAllowed()
}

export async function PUT(): Promise<NextResponse> {
  return methodNotAllowed()
}

export async function PATCH(): Promise<NextResponse> {
  return methodNotAllowed()
}

export async function DELETE(): Promise<NextResponse> {
  return methodNotAllowed()
}

export async function OPTIONS(): Promise<NextResponse> {
  return methodNotAllowed()
}

export async function HEAD(): Promise<NextResponse> {
  return methodNotAllowed()
}
