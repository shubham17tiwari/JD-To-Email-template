// lib/titleNormalizer.ts
// Makes a second small AI call to clean the raw job title into a
// candidate-friendly version, using context from the position description.

import OpenAI from 'openai'

const TITLE_PROMPT = `You are a recruiting specialist. You will receive a raw internal job title
and a short excerpt of the position description. Your job is to produce one clean,
candidate-facing job title.

RULES:
- Remove agency/department prefixes like "DCPS -", "OCTO Flex Tech –", "DHCF DCAS -",
  "DHCF", "OCTO", "DCPS", "DCAS", "CAI", or any government agency code at the start
- Remove level labels like "Level 1:", "Journeyman", "Senior" ONLY if they add no meaning
  — keep them if they meaningfully describe seniority (e.g. "Senior" is fine to keep)
- Keep the core role name as close to the original as possible
- Fix obvious formatting issues (dashes, ampersands, capitalisation)
- If the raw title is vague or internal-sounding, use the description excerpt
  to infer the real role — but stay close to the original intent
- Return ONLY the cleaned title — no explanation, no punctuation at the end,
  no quotes, nothing else

EXAMPLES:
  Raw: "DCPS - Infrastructure & AV Systems Technical Specialist"
  Description: "seeking a Technical Specialist to support audiovisual systems..."
  Output: AV & Infrastructure Technical Specialist

  Raw: "OCTO Flex Tech – Level 1: Field Technician & Logistical Support"
  Description: "entry-level field technician supporting telecommunications..."
  Output: Field Technician & Logistics Support

  Raw: "DHCF DCAS - Trainer Coordinator"
  Description: "responsible for coordinating training programs..."
  Output: Training Coordinator

  Raw: "DHCF DCAS UAT Tester Journeyman"
  Description: "mid-level UAT tester supporting user acceptance testing..."
  Output: UAT Tester

  Raw: "Network Engineer Senior"
  Description: "senior-level network engineering role..."
  Output: Senior Network Engineer
`

const TITLE_NORMALIZATION_MODEL =
  process.env.DEEPSEEK_TITLE_MODEL?.trim() ||
  process.env.DEEPSEEK_EXTRACTION_MODEL?.trim() ||
  'deepseek-chat'

export async function normalizeJobTitle(
  rawTitle: string,
  descriptionExcerpt: string,
  apiKey: string,
): Promise<string> {
  const title = rawTitle.trim()
  if (!title) return ''

  // Lightweight deterministic cleanup for reliability/fallback.
  const localNormalized = title
    .replace(
      /^(?:(?:DCPS|OCTO|DHCF|DCAS|CAI|OCA|DISB|DOES|DMV|MPD|DPW)\s+){1,3}/i,
      '',
    )
    .replace(/^(?:Flex\s*Tech)\b\s*[-–:]?/i, '')
    .replace(/^[-–:]\s*/, '')
    .replace(/\bLevel\s*\d+\s*:*/i, '')
    .replace(/\bJourneyman\b/gi, '')
    .replace(/\bLogistical\b/gi, 'Logistics')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s*[-–:]\s*$/, '')
    .trim()

  const shouldNormalize =
    /(DCPS|OCTO|DHCF|DCAS|CAI|OCA|DISB|DOES|DMV|MPD|DPW|flex\s*tech|journeyman|level\s*\d+)/i.test(
      title,
    )

  if (!shouldNormalize) {
    return title
  }

  if (!apiKey) {
    return localNormalized || title
  }

  try {
    const excerpt = descriptionExcerpt.slice(0, 600)
    const model = TITLE_NORMALIZATION_MODEL

    const client = new OpenAI({
      apiKey,
      baseURL: 'https://api.deepseek.com',
    })

    const completion = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: TITLE_PROMPT },
        {
          role: 'user',
          content: `Raw title: "${rawTitle}"\nDescription excerpt: "${excerpt}"\n\nOutput:`,
        },
      ],
      max_tokens: 30,
      temperature: 0.2,
    })

    const cleaned = completion.choices[0]?.message?.content
      ?.replace(/^['"\`\s]+|['"\`\s]+$/g, '')
      ?.replace(/[.;:,\s]+$/g, '')
      ?.trim()

    return cleaned && cleaned.length > 0 && cleaned.length < 100
      ? cleaned
      : localNormalized || title
  } catch {
    return localNormalized || title
  }
}
