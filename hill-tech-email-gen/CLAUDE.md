# Hill Technologies — Email Generator
## Master Re-implementation Prompt for Claude Code / Cursor

Paste this entire prompt into Claude Code at the root of your existing Next.js project.
It will build or rebuild every file needed for the complete tool.

---

## WHAT THIS TOOL DOES

Hill Technologies is a DC-based IT staffing firm. Recruiters upload a job requisition PDF
from DC government agencies. The tool:
1. Extracts all job-specific fields using AI (DeepSeek)
2. Lets the recruiter review and edit every field
3. Generates a fully formatted Hill Technologies candidate outreach email
4. Copies it to clipboard with HTML formatting preserved when pasted into Gmail or Outlook

---

## TECH STACK

- Next.js 14 App Router, TypeScript strict mode, Tailwind CSS
- DeepSeek API (server-side only) — model: deepseek-chat — base URL: https://api.deepseek.com
- pdfjs-dist — browser-side PDF text extraction (DeepSeek is text-only, not multimodal)
- ClipboardItem API — copies both HTML and plain text simultaneously
- localStorage — draft history, no database needed
- Vercel — deployment target
- Environment variable: DEEPSEEK_API_KEY in .env.local

---

## COMPLETE FOLDER STRUCTURE TO BUILD

```
├── app/
│   ├── layout.tsx
│   ├── page.tsx
│   ├── globals.css
│   └── api/
│       ├── extract/route.ts        ← DeepSeek extraction call
│       └── normalize-title/route.ts ← DeepSeek title cleaning call
├── components/
│   ├── UploadZone.tsx
│   ├── FieldEditor.tsx
│   ├── EmailPreview.tsx
│   ├── StepIndicator.tsx
│   ├── WarningBanner.tsx
│   └── ui/
│       ├── Button.tsx
│       ├── Input.tsx
│       └── Textarea.tsx
├── lib/
│   ├── types.ts
│   ├── pdfReader.ts
│   ├── extractionPrompt.ts
│   ├── htmlEmailBuilder.ts
│   ├── plainTextEmailBuilder.ts
│   └── clipboardService.ts
├── constants/
│   └── emailTemplate.ts
└── .env.local                      ← DEEPSEEK_API_KEY=your-key-here
```

---

## INSTALL DEPENDENCIES FIRST

Run this before building any files:
```bash
npm install pdfjs-dist clsx
```

---

## FILE 1 — lib/types.ts

```typescript
// SkillItem maps to the 3-column skills matrix in the requisition:
// Skill description | Required/Highly desired | Years experience
export interface SkillItem {
  skill: string
  level: 'Required' | 'Highly desired' | 'Desired'
  years: string   // e.g. "2 Years" or "" when not specified
}

export interface RequisitionFields {
  position_title: string          // raw title from requisition, never modified
  position_title_display: string  // AI-cleaned candidate-facing title
  req_id: string
  agency: string
  location: string
  worksite_arrangement: string
  rate: string                    // plain number string e.g. "40.67" — recruiter sets manually
  contract_length: string         // derived from dates e.g. "4 months (through 09/30/2026)"
  start_date: string
  end_date: string
  submission_deadline: string
  engagement_type: string
  position_description: string    // complete verbatim description with ## headers and • bullets
  duties: string[]                // concise bullet strings
  skills_checklist: SkillItem[]   // structured 3-column skill rows
  warnings: string[]
}

export interface DraftHistory {
  id: string
  created_at: string
  position_title: string
  req_id: string
  fields: RequisitionFields
}
```

---

## FILE 2 — lib/pdfReader.ts

```typescript
// Runs in the browser only — not in Node.js
// DeepSeek does not accept file uploads so we extract text from the PDF
// client-side and send it as plain text to the API

import * as pdfjsLib from 'pdfjs-dist'
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js'

// Returns base64 string of the PDF (without data URI prefix)
export async function pdfToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      resolve(result.split(',')[1])
    }
    reader.onerror = () => reject(new Error('Could not read file'))
    reader.readAsDataURL(file)
  })
}

// Extracts all text from all pages of the PDF
export async function pdfToText(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const pages: string[] = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const text = content.items.map((item: any) => item.str).join(' ')
    pages.push(text)
  }
  return pages.join('\n\n')
}

export function isPDF(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
}
```

---

## FILE 3 — lib/extractionPrompt.ts

```typescript
export const EXTRACTION_SYSTEM_PROMPT = `
You are a job requisition parser for Hill Technologies, a DC-based IT staffing firm.
You will receive the full text of a job requisition document.
Extract specific fields and return ONLY valid JSON — no markdown, no code fences, no explanation.

EXTRACTION RULES:

RATE:
  - Extract the candidate-facing rate or submission cap rate as a plain number string e.g. "40.67"
  - No dollar signs, no "per hour", no extra text
  - If not found, return ""

CONTRACT LENGTH:
  - If start and end dates both present, calculate as "X months (through MM/DD/YYYY)"
  - If only one date, return what is available
  - If neither, return ""
  - Never invent a contract length

POSITION DESCRIPTION — CRITICAL:
  - Copy the COMPLETE description text word for word — do not summarize
  - Format using these markers:
      Section headers like "Position Overview", "Key Responsibilities",
      "Required Experience & Skills", "Preferred Qualifications", "Work Conditions"
      → prefix with ##  e.g. "## Key Responsibilities"
      Bullet point items starting with *, -, or • → prefix with "• "
      Normal paragraphs → keep as plain text
      Use \n\n between sections and paragraphs
  - Remove ONLY: page headers with dates/URLs, vendor portal labels like
    "Complete Description:", system navigation text, page numbers

DUTIES:
  - Extract all major duty areas as concise bullet strings under 20 words each
  - Group related sub-tasks, remove redundant items

SKILLS CHECKLIST — CRITICAL:
  - Extract every skill row as a structured object with exactly:
      "skill"  → requirement description text, clean and candidate-facing
      "level"  → exactly one of: "Required", "Highly desired", "Desired"
      "years"  → experience amount e.g. "2 Years", "1 Year", or "" if not specified
  - Map each row from the source skills table exactly
  - Do NOT flatten into plain strings

WARNINGS:
  - Add a warning for any field that was missing, ambiguous, or conflicted

Return exactly this JSON schema:
{
  "position_title": "",
  "req_id": "",
  "agency": "",
  "location": "",
  "worksite_arrangement": "",
  "rate": "",
  "start_date": "",
  "end_date": "",
  "contract_length": "",
  "submission_deadline": "",
  "engagement_type": "",
  "position_description": "",
  "duties": [],
  "skills_checklist": [{ "skill": "", "level": "Required", "years": "" }],
  "warnings": []
}
`

export function buildUserPrompt(pdfText: string): string {
  return `Extract the fields from the following job requisition text:\n\n${pdfText}`
}
```

---

## FILE 4 — app/api/extract/route.ts

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { EXTRACTION_SYSTEM_PROMPT, buildUserPrompt } from '@/lib/extractionPrompt'

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json()
    if (!body.pdfText) {
      return NextResponse.json({ error: 'pdfText is required' }, { status: 400 })
    }

    const { pdfText, filename = 'unknown.pdf' } = body

    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        max_tokens: 4000,
        temperature: 0,
        messages: [
          { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
          { role: 'user', content: buildUserPrompt(pdfText) },
        ],
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      throw new Error(`DeepSeek API error ${response.status}: ${err}`)
    }

    const data = await response.json()
    const text = data.choices?.[0]?.message?.content || ''
    const clean = text.replace(/```json|```/g, '').trim()

    let parsed
    try {
      parsed = JSON.parse(clean)
    } catch {
      return NextResponse.json({ error: 'Response was not valid JSON' }, { status: 500 })
    }

    console.log(`[extract] ${filename} — success at ${new Date().toISOString()}`)
    return NextResponse.json(parsed, { status: 200 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[extract] Error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 })
}
```

---

## FILE 5 — app/api/normalize-title/route.ts

```typescript
import { NextRequest, NextResponse } from 'next/server'

const TITLE_SYSTEM_PROMPT = `You are a recruiting specialist at Hill Technologies.
You receive a raw internal DC government job title and a short description excerpt.
Return ONE clean candidate-facing job title and nothing else.
No explanation. No punctuation at the end. No quotes.

RULES:
- Remove agency/department prefixes: "DCPS -", "OCTO Flex Tech –", "DHCF DCAS -",
  "DHCF", "OCTO", "DCPS", "DCAS", "CAI" and any government agency code at the start
- Remove internal labels like "Flex Tech", "Journeyman", "Level 1:" ONLY if they
  add no real meaning — keep seniority words like "Senior", "Junior", "Lead"
- Keep the core role name as close to the original wording as possible
- Use the description excerpt only when the title is too vague on its own

EXAMPLES:
  "DCPS - Infrastructure & AV Systems Technical Specialist" → AV & Infrastructure Technical Specialist
  "OCTO Flex Tech – Level 1: Field Technician & Logistical Support" → Field Technician & Logistics Support
  "DHCF DCAS - Trainer Coordinator" → Training Coordinator
  "DHCF DCAS UAT Tester Journeyman" → UAT Tester
  "Network Engineer Senior" → Senior Network Engineer`

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const { rawTitle, descriptionExcerpt } = await req.json()
    if (!rawTitle) return NextResponse.json({ title: '' }, { status: 200 })

    const agencyPrefix = /^(DCPS|OCTO|DHCF|DCAS|CAI|OCA|DISB|DOES|DMV|MPD|DPW|DC\s)\s*[-–]/i
    const hasLevelLabel = /flex tech|journeyman|level \d/i

    if (!agencyPrefix.test(rawTitle.trim()) && !hasLevelLabel.test(rawTitle)) {
      return NextResponse.json({ title: rawTitle.trim() })
    }

    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        max_tokens: 30,
        temperature: 0.2,
        messages: [
          { role: 'system', content: TITLE_SYSTEM_PROMPT },
          { role: 'user', content: `Raw title: "${rawTitle}"\nDescription: "${(descriptionExcerpt || '').slice(0, 300)}"` },
        ],
      }),
    })

    const data = await response.json()
    const cleaned = data.choices?.[0]?.message?.content?.trim()
    const title = cleaned && cleaned.length > 0 && cleaned.length < 100
      ? cleaned : rawTitle.trim()

    return NextResponse.json({ title })
  } catch {
    return NextResponse.json({ title: '' })
  }
}
```

---

## FILE 6 — constants/emailTemplate.ts

```typescript
// ALL static Hill Technologies email copy lives here.
// Never modify these strings from any other module.
// To update company copy: edit this file only.

export const STATIC_VALUE_PROP = `Since we are a small firm, we can also provide you with higher compensation than our competitors. In addition, as former DC Government employees in the Tech sector, Hill Technologies best understands your needs and career growth.`

export const STATIC_CTA = `Let us know if you are interested and reply with your up-to-date resume. Meanwhile, let's set up a call at your earliest convenience!`

export const STATIC_IDEAL_CANDIDATE_NOTE = `*Ideal candidate meets or exceeds all required experience shown in the "Skills Checklist" section below.`

export const STATIC_BENEFITS_BLOCK = `We connect high-level talent with advantageous opportunities, playing a crucial role in assisting career experts with achieving their goals conveniently.
Through extensive experience working with a diverse portfolio of positions, we provide candidates with exceptional job opportunities and the ability to advance their careers further.
Utilizing our formulated Placement Process and over 30 years of combined staffing experience; we identify suitable career-oriented candidates and compile comprehensive applicant pools for each unfilled position.
Hill Technologies strives to end prolonged resume screening processes and unsuccessful interviews that typically drain internal resources.`

export const STATIC_CTA_SEND = `***Send your resume by the deadline to: info@cassociatesstaffing.com ***`

export const STATIC_SIGNATURE_NAME = `Hans Capozzi`
export const STATIC_SIGNATURE_PHONE = `(202) 650-7790`
export const STATIC_SIGNATURE_WEBSITE = `www.hilltechinc.com`
export const STATIC_SIGNATURE_ADDRESS = `700 Pennsylvania Ave, S.E.\nSuite 2130, Washington, DC 20003`

export const STATIC_DISCLAIMER = `This message contains Privileged and/or Confidential Information. You may not share or use this information without the express written consent of Hill Technologies, Inc. If you are not the addressee indicated in this message (or responsible for delivery of the message to such person), you may not use, copy, or deliver this message in any way, shape, or form. Please destroy this message and kindly notify the sender by reply email. Please advise immediately if you or your employer does not consent to Internet email for messages of this kind. Opinions, conclusions, and/or other information in this message that do not relate to the official business of my firm shall be understood as neither given nor endorsed by it.`
```

---

## FILE 7 — lib/htmlEmailBuilder.ts

IMPORTANT NOTES BEFORE BUILDING THIS FILE:
- All styles must be inline style="" — no <style> blocks, email clients strip them
- Job details section uses HTML <table> — Outlook cannot render flexbox/grid
- Logos are embedded as base64 data URIs — no external image hosting needed
- Logo width is set to 120px which renders cleanly at small size in Gmail
- descriptionToHtml() converts ## headers and • bullets into proper HTML
- Skills matrix is a 3-column table: Requirement | Level | Experience
- escapeHtml() must be called on ALL dynamic content from fields

```typescript
import { RequisitionFields, SkillItem } from './types'
import {
  STATIC_VALUE_PROP, STATIC_CTA, STATIC_IDEAL_CANDIDATE_NOTE,
  STATIC_BENEFITS_BLOCK, STATIC_CTA_SEND, STATIC_DISCLAIMER,
  STATIC_SIGNATURE_NAME, STATIC_SIGNATURE_PHONE,
  STATIC_SIGNATURE_WEBSITE, STATIC_SIGNATURE_ADDRESS,
} from '../constants/emailTemplate'

// ── LOGOS ─────────────────────────────────────────────────────────────────────
// Embedded as base64 so they render in Gmail with no external hosting.
// LOGO_WIDTH controls display size — 120px is the recommended small size
// that renders cleanly in Gmail without distortion.
// To update: base64-encode your PNG and replace the string after "base64,"
const LOGO_TOP = 'data:image/png;base64,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'
const LOGO_SIG = 'data:image/png;base64,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'

// ── FORMATTING CONSTANTS ──────────────────────────────────────────────────────
// Change any value here to update the whole email — nothing else to edit.
const FONT_FAMILY      = 'Arial, Helvetica, sans-serif'
const FONT_SIZE_BODY   = '14px'
const FONT_SIZE_SMALL  = '11px'
const FONT_SIZE_H1     = '17px'   // position title heading
const FONT_SIZE_H2     = '14px'   // section labels
const FONT_SIZE_DESC_H = '13px'   // ## subheadings inside position description

const COLOR_TEXT       = '#222222'
const COLOR_MUTED      = '#666666'
const COLOR_HEADING    = '#1a1a1a'
const COLOR_ACCENT     = '#1a3c6b'   // dark navy — title + matrix header
const COLOR_BORDER     = '#dddddd'
const COLOR_MATRIX_HDR = '#1a3c6b'
const COLOR_MATRIX_ALT = '#f5f6f8'
const COLOR_DISCLAIMER = '#888888'

const SPACING_SECTION  = '20px'
const SPACING_PARA     = '12px'

// Logo pixel width — controls display size in Gmail.
// 120px is the correct small size that fits the Hill Technologies logo aspect ratio.
const LOGO_WIDTH       = '120px'

// ── HELPERS ───────────────────────────────────────────────────────────────────
export function escapeHtml(str: string): string {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function orFallback(value: string | undefined, label: string): string {
  return value?.trim() ? value.trim() : `[${label} — SET MANUALLY]`
}

// ── POSITION DESCRIPTION RENDERER ────────────────────────────────────────────
// Converts the structured description text (with ## headers and • bullets)
// into formatted HTML with bold subheadings and bullet lists.
function descriptionToHtml(raw: string): string {
  if (!raw?.trim()) return `<p>[POSITION DESCRIPTION — SET MANUALLY]</p>`

  const lines = raw.split('\n')
  const parts: string[] = []
  let bulletBuffer: string[] = []

  const flushBullets = () => {
    if (bulletBuffer.length) {
      parts.push(
        `<ul style="margin:4px 0 10px 0;padding-left:20px">` +
        bulletBuffer.map(b => `<li style="margin-bottom:3px;font-size:${FONT_SIZE_BODY}">${escapeHtml(b)}</li>`).join('') +
        `</ul>`
      )
      bulletBuffer = []
    }
  }

  for (const line of lines) {
    const t = line.trim()
    if (!t) { flushBullets(); continue }
    if (t.startsWith('## ')) {
      flushBullets()
      parts.push(`<p style="font-weight:bold;font-size:${FONT_SIZE_DESC_H};color:${COLOR_HEADING};margin:12px 0 3px 0">${escapeHtml(t.slice(3).trim())}</p>`)
    } else if (t.startsWith('• ') || t.startsWith('* ') || t.startsWith('- ')) {
      bulletBuffer.push(t.slice(2).trim())
    } else {
      flushBullets()
      parts.push(`<p style="margin:0 0 8px 0;font-size:${FONT_SIZE_BODY}">${escapeHtml(t)}</p>`)
    }
  }
  flushBullets()
  return parts.join('')
}

// ── SKILLS MATRIX ─────────────────────────────────────────────────────────────
// 3-column table: Requirement | Level | Experience
// Matches the format of the skills table in DC government requisitions
function buildSkillsMatrix(skills: SkillItem[]): string {
  if (!skills?.length) return `<p style="color:${COLOR_MUTED}">[SKILLS — SET MANUALLY]</p>`

  const headerCells = ['Requirement', 'Level', 'Experience'].map(h =>
    `<td style="background:${COLOR_MATRIX_HDR};color:#fff;font-size:${FONT_SIZE_BODY};font-weight:bold;padding:8px 12px;border:1px solid ${COLOR_BORDER};white-space:nowrap">${h}</td>`
  ).join('')

  const rows = skills.map((item, i) => {
    const bg = i % 2 === 0 ? '#ffffff' : COLOR_MATRIX_ALT
    const levelColor = item.level === 'Required' ? COLOR_HEADING : COLOR_MUTED
    return `<tr>
      <td style="background:${bg};font-size:${FONT_SIZE_BODY};padding:7px 12px;border:1px solid ${COLOR_BORDER};vertical-align:top">${escapeHtml(item.skill)}</td>
      <td style="background:${bg};font-size:${FONT_SIZE_BODY};padding:7px 12px;border:1px solid ${COLOR_BORDER};vertical-align:top;white-space:nowrap;color:${levelColor}">${escapeHtml(item.level)}</td>
      <td style="background:${bg};font-size:${FONT_SIZE_BODY};padding:7px 12px;border:1px solid ${COLOR_BORDER};vertical-align:top;white-space:nowrap;color:${COLOR_MUTED}">${escapeHtml(item.years)}</td>
    </tr>`
  }).join('')

  return `<table style="border-collapse:collapse;width:100%;margin:0 0 ${SPACING_SECTION} 0">
    <thead><tr>${headerCells}</tr></thead>
    <tbody>${rows}</tbody>
  </table>`
}

// ── MAIN EMAIL BUILDER ────────────────────────────────────────────────────────
export function buildHtmlEmail(fields: RequisitionFields): string {
  const title    = orFallback(fields.position_title_display || fields.position_title, 'POSITION TITLE')
  const agency   = orFallback(fields.agency, 'AGENCY')
  const location = orFallback(fields.location, 'LOCATION')
  const worksite = orFallback(fields.worksite_arrangement, 'WORKSITE')
  const contract = orFallback(fields.contract_length, 'CONTRACT LENGTH')
  const deadline = fields.submission_deadline?.trim() ? `COB on ${fields.submission_deadline.trim()}` : '[DATE — SET MANUALLY]'
  const rate     = fields.rate?.trim() ? `Up to $${fields.rate.trim()}/hr (1099 or C2C) depending on experience.` : '[RATE — SET MANUALLY BY RECRUITER]'
  const duties   = (fields.duties || []).length
    ? fields.duties.map(d => `<li style="margin-bottom:4px">${escapeHtml(d)}</li>`).join('')
    : '<li>[DUTIES — SET MANUALLY]</li>'

  return `<div style="font-family:${FONT_FAMILY};font-size:${FONT_SIZE_BODY};line-height:1.7;color:${COLOR_TEXT};max-width:640px">

  <!-- TOP LOGO — 120px renders cleanly in Gmail at correct aspect ratio -->
  <div style="margin-bottom:16px">
    <img src="${LOGO_TOP}" width="${LOGO_WIDTH}" alt="Hill Technologies" style="display:block;height:auto;border:0">
  </div>

  <!-- POSITION TITLE -->
  <p style="font-size:${FONT_SIZE_H1};font-weight:bold;color:${COLOR_ACCENT};margin:0 0 16px 0">
    ${escapeHtml(title)} - Open Position
  </p>

  <p style="margin:0 0 ${SPACING_PARA} 0">Hello,</p>

  <p style="margin:0 0 ${SPACING_PARA} 0">
    We are seeking a <strong>${escapeHtml(title)}</strong> for the D.C. Government and thought you might be a good fit.
  </p>

  <p style="margin:0 0 ${SPACING_PARA} 0">
    Since we are a small firm, we can also provide you with <strong>higher compensation than our competitors</strong>.
  </p>
  <p style="margin:0 0 ${SPACING_SECTION} 0">
    In addition, as former DC Government employees in the Tech sector, <strong>Hill Technologies</strong> best understands your needs and career growth.
  </p>

  <p style="margin:0 0 ${SPACING_SECTION} 0">${STATIC_CTA}</p>

  <!-- JOB DETAILS TABLE — must use <table> for Outlook compatibility -->
  <table style="border-collapse:collapse;margin:0 0 ${SPACING_SECTION} 0">
    <tr>
      <td style="padding:3px 16px 3px 0;font-weight:bold;white-space:nowrap;vertical-align:top;color:${COLOR_HEADING}">Location:</td>
      <td style="padding:3px 0;vertical-align:top">${escapeHtml(location)}</td>
    </tr>
    <tr>
      <td style="padding:3px 16px 3px 0;font-weight:bold;white-space:nowrap;vertical-align:top;color:${COLOR_HEADING}">Agency:</td>
      <td style="padding:3px 0;vertical-align:top">${escapeHtml(agency)}</td>
    </tr>
    <tr>
      <td style="padding:3px 16px 3px 0;font-weight:bold;white-space:nowrap;vertical-align:top;color:${COLOR_HEADING}">Rate:</td>
      <td style="padding:3px 0;vertical-align:top">${escapeHtml(rate)}</td>
    </tr>
    <tr>
      <td style="padding:3px 16px 3px 0;font-weight:bold;white-space:nowrap;vertical-align:top;color:${COLOR_HEADING}">Worksite Arrangement:</td>
      <td style="padding:3px 0;vertical-align:top">${escapeHtml(worksite)}</td>
    </tr>
    <tr>
      <td style="padding:3px 16px 3px 0;font-weight:bold;white-space:nowrap;vertical-align:top;color:${COLOR_HEADING}">Contract Length:</td>
      <td style="padding:3px 0;vertical-align:top">${escapeHtml(contract)}</td>
    </tr>
    <tr>
      <td style="padding:3px 16px 3px 0;font-weight:bold;white-space:nowrap;vertical-align:top;color:${COLOR_HEADING}">Deadline:</td>
      <td style="padding:3px 0;vertical-align:top"><strong><em>*Submittals Need to be Made by ${escapeHtml(deadline)}*</em></strong></td>
    </tr>
  </table>

  <p style="margin:0 0 ${SPACING_SECTION} 0;font-style:italic;color:${COLOR_MUTED}">
    *<strong>Ideal candidate</strong> meets or exceeds all required experience shown in the <strong>"Skills Checklist"</strong> section below.
  </p>

  <!-- POSITION DESCRIPTION — rendered with subheadings and bullets -->
  <p style="margin:0 0 6px 0;font-size:${FONT_SIZE_H2};font-weight:bold;color:${COLOR_HEADING}">Position Description:</p>
  <div style="margin:0 0 ${SPACING_SECTION} 0">${descriptionToHtml(fields.position_description)}</div>

  <!-- DUTIES -->
  <p style="margin:0 0 8px 0;font-size:${FONT_SIZE_H2};font-weight:bold;color:${COLOR_HEADING}">Duties &amp; Responsibilities:</p>
  <ul style="margin:0 0 ${SPACING_SECTION} 0;padding-left:20px">${duties}</ul>

  <!-- SKILLS MATRIX -->
  <p style="margin:0 0 10px 0;font-size:${FONT_SIZE_H2};font-weight:bold;color:${COLOR_HEADING}">Skills Checklist:</p>
  ${buildSkillsMatrix(fields.skills_checklist || [])}

  <hr style="border:none;border-top:1px solid ${COLOR_BORDER};margin:0 0 16px 0">

  <!-- BENEFITS -->
  <p style="margin:0 0 8px 0;font-weight:bold;color:${COLOR_HEADING}">What's the benefit of working with Hill Technologies?</p>
  <p style="margin:0 0 ${SPACING_SECTION} 0">${STATIC_BENEFITS_BLOCK.replace(/\n/g, '<br>')}</p>

  <!-- SEND CTA -->
  <p style="margin:0 0 6px 0">
    <strong>${STATIC_CTA_SEND}</strong><br>
    <strong>We look forward to hearing from you!</strong><br>
    <em>(Referrals welcome for this position)</em>
  </p>
  <br>

  <!-- SIGNATURE -->
  <p style="margin:0 0 2px 0">${STATIC_SIGNATURE_NAME}</p>
  <p style="margin:0 0 4px 0"><strong>________________</strong></p>
  <p style="margin:0 0 4px 0">${STATIC_SIGNATURE_PHONE}</p>
  <div style="margin:6px 0 4px 0">
    <img src="${LOGO_SIG}" width="${LOGO_WIDTH}" alt="Hill Technologies" style="display:block;height:auto;border:0">
  </div>
  <p style="margin:0 0 2px 0"><a href="http://${STATIC_SIGNATURE_WEBSITE}" style="color:${COLOR_ACCENT}">${STATIC_SIGNATURE_WEBSITE}</a></p>
  <p style="margin:0">${STATIC_SIGNATURE_ADDRESS.replace('\n', '<br>')}</p>
  <br>

  <!-- DISCLAIMER -->
  <p style="font-size:${FONT_SIZE_SMALL};color:${COLOR_DISCLAIMER};border-top:1px solid #eeeeee;padding-top:10px;margin:0">
    ${STATIC_DISCLAIMER}
  </p>

</div>`
}
```

---

## FILE 8 — lib/plainTextEmailBuilder.ts

```typescript
import { RequisitionFields } from './types'
import {
  STATIC_VALUE_PROP, STATIC_CTA, STATIC_IDEAL_CANDIDATE_NOTE,
  STATIC_BENEFITS_BLOCK, STATIC_CTA_SEND, STATIC_DISCLAIMER,
  STATIC_SIGNATURE_NAME, STATIC_SIGNATURE_PHONE,
  STATIC_SIGNATURE_WEBSITE, STATIC_SIGNATURE_ADDRESS,
} from '../constants/emailTemplate'

export function buildPlainTextEmail(fields: RequisitionFields): string {
  const title    = fields.position_title_display?.trim() || fields.position_title?.trim() || '[POSITION TITLE]' 
  const rate     = fields.rate?.trim() ? `Up to $${fields.rate.trim()}/hr (1099 or C2C) depending on experience.` : '[RATE — SET MANUALLY]' 
  const deadline = fields.submission_deadline?.trim() || '[DATE — SET MANUALLY]'
  const duties   = (fields.duties || []).map(d => `  • ${d}`).join('\n') || '  [DUTIES — SET MANUALLY]'

  // Plain text skills: each skill on its own line with level and years
  const skills = (fields.skills_checklist || []).map(s =>
    `  ☐ ${s.skill}  |  ${s.level}${s.years ? `  |  ${s.years}` : ''}`
  ).join('\n') || '  [SKILLS — SET MANUALLY]'

  // Strip ## markers for plain text
  const description = (fields.position_description || '[DESCRIPTION — SET MANUALLY]')
    .replace(/^## /gm, '').trim()

  return [
    `${title} — Open Position`, '',
    'Hello,', '',
    `We are seeking a ${title} for the D.C. Government and thought you might be a good fit.`, '',
    STATIC_VALUE_PROP, '',
    STATIC_CTA, '',
    `Location: ${fields.location?.trim() || '[LOCATION]'}`,
    `Agency: ${fields.agency?.trim() || '[AGENCY]'}`,
    `Rate: ${rate}`,
    `Worksite Arrangement: ${fields.worksite_arrangement?.trim() || '[WORKSITE]'}`,
    `Contract Length: ${fields.contract_length?.trim() || '[CONTRACT LENGTH]'}`,
    `*Deadline — Submittals Need to be Made by COB on ${deadline}*`, '',
    STATIC_IDEAL_CANDIDATE_NOTE, '',
    'Position Description:', description, '',
    'Duties & Responsibilities:', duties, '',
    'Skills Checklist:', skills, '',
    '—', '',
    'What\'s the benefit of working with Hill Technologies?',
    STATIC_BENEFITS_BLOCK, '',
    STATIC_CTA_SEND,
    'We look forward to hearing from you!',
    '(Referrals welcome for this position)', '', '',
    STATIC_SIGNATURE_NAME, '________________',
    STATIC_SIGNATURE_PHONE,
    STATIC_SIGNATURE_WEBSITE,
    STATIC_SIGNATURE_ADDRESS, '',
    STATIC_DISCLAIMER,
  ].join('\n')
}
```

---

## FILE 9 — lib/clipboardService.ts

```typescript
import { RequisitionFields } from './types'
import { buildHtmlEmail } from './htmlEmailBuilder'
import { buildPlainTextEmail } from './plainTextEmailBuilder'

export type CopyResult = { method: 'html' | 'plaintext'; message: string }

export async function copyEmailToClipboard(fields: RequisitionFields, subject: string): Promise<CopyResult> {
  const html  = `<p><strong>Subject: ${subject}</strong></p><br>${buildHtmlEmail(fields)}`
  const plain = `Subject: ${subject}\n\n${buildPlainTextEmail(fields)}`

  try {
    await navigator.clipboard.write([
      new ClipboardItem({
        'text/html':  new Blob([html],  { type: 'text/html' }),
        'text/plain': new Blob([plain], { type: 'text/plain' }),
      })
    ])
    return { method: 'html', message: 'Copied with formatting — paste into Gmail or Outlook.' }
  } catch {
    await navigator.clipboard.writeText(plain)
    return { method: 'plaintext', message: 'Copied as plain text.' }
  }
}

export async function copyPlainText(fields: RequisitionFields, subject: string): Promise<void> {
  await navigator.clipboard.writeText(`Subject: ${subject}\n\n${buildPlainTextEmail(fields)}`)
}
```

---

## FILE 10 — components/ui/Button.tsx

```typescript
'use client'
import clsx from 'clsx'
import { ButtonHTMLAttributes } from 'react'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost' | 'danger'
  size?: 'sm' | 'md'
  loading?: boolean
}

export default function Button({ variant='ghost', size='md', loading=false, children, className, ...rest }: Props) {
  return (
    <button
      className={clsx(
        'inline-flex items-center justify-center gap-2 font-medium rounded-lg border transition-all duration-150',
        'active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-1',
        'disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none',
        size === 'sm' ? 'text-xs px-3 py-1.5' : 'text-sm px-4 py-2',
        variant === 'primary' && 'bg-[#1a3c6b] text-white border-transparent hover:bg-[#1e4d8c]',
        variant === 'ghost'   && 'bg-transparent text-gray-700 border-gray-200 hover:bg-gray-50',
        variant === 'danger'  && 'bg-transparent text-red-600 border-red-200 hover:bg-red-50',
        className
      )}
      disabled={loading || rest.disabled}
      {...rest}
    >
      {loading && <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />}
      {children}
    </button>
  )
}
```

---

## FILE 11 — components/ui/Input.tsx

```typescript
'use client'
import clsx from 'clsx'
import { useId, InputHTMLAttributes } from 'react'

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  helper?: string
  error?: string
}

export default function Input({ label, helper, error, className, ...rest }: Props) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm text-gray-600 font-medium">{label}</label>
      <input id={id} className={clsx(
        'w-full rounded-lg border px-3 py-2 text-sm bg-white text-gray-900 transition-all',
        'focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent',
        error ? 'border-red-400' : 'border-gray-200', className
      )} {...rest} />
      {error  && <p className="text-xs text-red-500">{error}</p>}
      {helper && !error && <p className="text-xs text-gray-400">{helper}</p>}
    </div>
  )
}
```

---

## FILE 12 — components/ui/Textarea.tsx

```typescript
'use client'
import clsx from 'clsx'
import { useId, TextareaHTMLAttributes } from 'react'

interface Props extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string
  helper?: string
  error?: string
  rows?: number
}

export default function Textarea({ label, helper, error, rows=4, className, ...rest }: Props) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm text-gray-600 font-medium">{label}</label>
      <textarea id={id} rows={rows} className={clsx(
        'w-full rounded-lg border px-3 py-2 text-sm bg-white text-gray-900 resize-y transition-all',
        'focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent',
        error ? 'border-red-400' : 'border-gray-200', className
      )} {...rest} />
      {error  && <p className="text-xs text-red-500">{error}</p>}
      {helper && !error && <p className="text-xs text-gray-400">{helper}</p>}
    </div>
  )
}
```

---

## FILE 13 — components/WarningBanner.tsx

```typescript
'use client'
interface Props { warnings: string[]; onDismiss?: () => void }

export default function WarningBanner({ warnings, onDismiss }: Props) {
  if (!warnings?.length) return null
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-5">
      <div className="flex justify-between items-start mb-1">
        <p className="text-sm font-medium text-amber-800">⚠ Review needed</p>
        {onDismiss && <button onClick={onDismiss} className="text-amber-400 hover:text-amber-600 text-lg leading-none">✕</button>}
      </div>
      {warnings.map((w, i) => (
        <p key={i} className="text-sm text-amber-700 flex gap-2">
          <span className="text-amber-400 flex-shrink-0 mt-0.5">—</span>{w}
        </p>
      ))}
    </div>
  )
}
```

---

## FILE 14 — components/StepIndicator.tsx

```typescript
'use client'
import clsx from 'clsx'

const STEPS = ['Upload PDF', 'Review Fields', 'Preview Email']
type Step = 'upload' | 'edit' | 'preview'

const stepIndex = (s: Step) => ({ upload: 0, edit: 1, preview: 2 }[s])

export default function StepIndicator({ currentStep }: { currentStep: Step }) {
  const current = stepIndex(currentStep)
  return (
    <div className="flex items-center mb-8">
      {STEPS.map((label, i) => (
        <div key={i} className="flex items-center flex-1 last:flex-none">
          <div className="flex flex-col items-center gap-1">
            <div className={clsx(
              'w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all',
              i < current  && 'bg-[#1a3c6b] text-white',
              i === current && 'bg-[#1a3c6b] text-white ring-4 ring-indigo-100',
              i > current  && 'bg-gray-100 text-gray-400'
            )}>
              {i < current ? '✓' : i + 1}
            </div>
            <span className={clsx('text-xs whitespace-nowrap',
              i <= current ? 'text-[#1a3c6b] font-medium' : 'text-gray-400'
            )}>{label}</span>
          </div>
          {i < STEPS.length - 1 && (
            <div className={clsx('flex-1 h-px mx-3 mb-5', i < current ? 'bg-[#1a3c6b]' : 'bg-gray-200')} />
          )}
        </div>
      ))}
    </div>
  )
}
```

---

## FILE 15 — components/UploadZone.tsx

```typescript
'use client'
import { useRef, useState, DragEvent } from 'react'
import { isPDF } from '@/lib/pdfReader'

interface Props {
  onFileSelected: (file: File) => void
  isLoading: boolean
  currentFileName?: string
}

export default function UploadZone({ onFileSelected, isLoading, currentFileName }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState('')

  const handleFile = (file: File) => {
    if (!isPDF(file)) { setError('Only PDF files are supported.'); return }
    setError('')
    onFileSelected(file)
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault(); setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  return (
    <div
      onClick={() => !isLoading && inputRef.current?.click()}
      onDragOver={e => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={`rounded-xl border-2 border-dashed p-12 text-center transition-all cursor-pointer
        ${dragging ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300 hover:border-indigo-400 hover:bg-gray-50'}
        ${isLoading ? 'opacity-60 cursor-not-allowed' : ''}
        ${currentFileName ? 'border-green-400 bg-green-50' : ''}`}
    >
      <input ref={inputRef} type="file" accept=".pdf" className="hidden"
        onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]) }} />

      {isLoading ? (
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-600">Extracting fields with AI...</p>
        </div>
      ) : currentFileName ? (
        <div>
          <p className="text-sm font-medium text-green-700">✓ {currentFileName}</p>
          <p className="text-xs text-green-500 mt-1">Click to upload a different file</p>
        </div>
      ) : (
        <div>
          <p className="text-3xl mb-3">📄</p>
          <p className="text-base font-medium text-gray-700 mb-1">Drop your requisition PDF here</p>
          <p className="text-sm text-gray-400">or click to browse</p>
        </div>
      )}
      {error && <p className="text-sm text-red-500 mt-3">{error}</p>}
    </div>
  )
}
```

---

## FILE 16 — components/FieldEditor.tsx

```typescript
'use client'
import { RequisitionFields, SkillItem } from '@/lib/types'
import Input from './ui/Input'
import Textarea from './ui/Textarea'
import WarningBanner from './WarningBanner'

interface Props {
  fields: RequisitionFields
  onChange: (f: RequisitionFields) => void
  warnings: string[]
}

// Skills are edited as tab-separated rows: skill [Tab] level [Tab] years
function skillsToText(skills: SkillItem[]): string {
  return (skills || []).map(s => [s.skill, s.level, s.years].join('\t')).join('\n')
}
function textToSkills(raw: string): SkillItem[] {
  return raw.split('\n').map(l => l.trim()).filter(Boolean).map(line => {
    const [skill = '', level = 'Required', years = ''] = line.split('\t').map(s => s.trim())
    return { skill, level: (['Required','Highly desired','Desired'].includes(level) ? level : 'Required') as SkillItem['level'], years }
  })
}

export default function FieldEditor({ fields, onChange, warnings }: Props) {
  const set = (key: keyof RequisitionFields, value: any) => onChange({ ...fields, [key]: value })

  return (
    <div>
      <WarningBanner warnings={warnings} />

      {/* Job Metadata */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Job Metadata</p>
        <div className="flex flex-col gap-3">
          <Input label="Email-facing title (AI-cleaned)" helper="Used in the email subject and heading"
            value={fields.position_title_display || ''} onChange={e => set('position_title_display', e.target.value)} />
          <Input label="Original title (from requisition)" className="bg-gray-50 text-gray-400"
            value={fields.position_title || ''} readOnly />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Agency" value={fields.agency || ''} onChange={e => set('agency', e.target.value)} />
            <Input label="Location" value={fields.location || ''} onChange={e => set('location', e.target.value)} />
            <Input label="Rate ($/hr)" helper="Set manually — becomes 'Up to $X/hr' in the email"
              value={fields.rate || ''} onChange={e => set('rate', e.target.value)} />
            <Input label="Worksite arrangement" value={fields.worksite_arrangement || ''} onChange={e => set('worksite_arrangement', e.target.value)} />
            <Input label="Contract length" helper="e.g. 4 months (through 09/30/2026)"
              value={fields.contract_length || ''} onChange={e => set('contract_length', e.target.value)} />
            <Input label="Deadline (MM/DD/YYYY)" value={fields.submission_deadline || ''} onChange={e => set('submission_deadline', e.target.value)} />
          </div>
        </div>
      </div>

      {/* Email Content */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Email Content</p>
        <div className="flex flex-col gap-4">
          <Textarea rows={8} label="Position Description" helper="Subheadings (## Heading) and bullets (• item) will render as formatted HTML in the email"
            value={fields.position_description || ''} onChange={e => set('position_description', e.target.value)} />
          <Textarea rows={6} label="Duties & Responsibilities" helper="One duty per line — each becomes a bullet in the email"
            value={(fields.duties || []).join('\n')}
            onChange={e => set('duties', e.target.value.split('\n').map(x => x.trim()).filter(Boolean))} />

          {/* Skills Matrix Editor */}
          <div>
            <label className="block text-sm text-gray-600 font-medium mb-1">Skills Checklist</label>
            <p className="text-xs text-gray-400 mb-2">
              One skill per line, columns separated by Tab:<br/>
              <code className="bg-gray-100 px-1 rounded">Skill description [Tab] Required/Highly desired [Tab] 2 Years</code>
            </p>
            {/* Live matrix preview */}
            {(fields.skills_checklist || []).length > 0 && (
              <div className="mb-3 overflow-x-auto rounded-lg border border-gray-200">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr style={{ backgroundColor: '#1a3c6b' }}>
                      {['Requirement', 'Level', 'Experience'].map(h => (
                        <th key={h} className="text-left px-3 py-2 text-xs font-semibold text-white">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(fields.skills_checklist || []).map((s, i) => (
                      <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="px-3 py-2 border-b border-gray-100 text-gray-800">{s.skill}</td>
                        <td className="px-3 py-2 border-b border-gray-100 whitespace-nowrap text-gray-600">{s.level}</td>
                        <td className="px-3 py-2 border-b border-gray-100 whitespace-nowrap text-gray-400">{s.years}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <Textarea rows={10} label="" className="font-mono text-xs"
              value={skillsToText(fields.skills_checklist || [])}
              onChange={e => set('skills_checklist', textToSkills(e.target.value))}
              placeholder={"High School Diploma or GED\tRequired\t2 Years\nValid driver's license\tRequired\t\nExperience with multi-meters\tHighly desired\t"} />
          </div>
        </div>
      </div>
    </div>
  )
}
```

---

## FILE 17 — components/EmailPreview.tsx

```typescript
'use client'
import { useState } from 'react'
import { RequisitionFields } from '@/lib/types'
import { buildHtmlEmail } from '@/lib/htmlEmailBuilder'
import { copyEmailToClipboard, copyPlainText } from '@/lib/clipboardService'
import Button from './ui/Button'

interface Props { fields: RequisitionFields; onEdit: () => void }

export default function EmailPreview({ fields, onEdit }: Props) {
  const [msg, setMsg] = useState('')
  const [isError, setIsError] = useState(false)

  const title   = fields.position_title_display || fields.position_title || '[POSITION TITLE]'
  const subject = `Seeking a ${title} — Immediate Opening`

  const showMsg = (text: string, error = false) => {
    setMsg(text); setIsError(error)
    setTimeout(() => setMsg(''), 2500)
  }

  const handleCopyFormatted = async () => {
    try {
      const result = await copyEmailToClipboard(fields, subject)
      showMsg(result.message)
    } catch (e: any) { showMsg(e.message || 'Copy failed', true) }
  }

  const handleCopyPlain = async () => {
    try { await copyPlainText(fields, subject); showMsg('Copied as plain text!') }
    catch { showMsg('Copy failed', true) }
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
        <Button variant="ghost" size="sm" onClick={onEdit}>← Edit fields</Button>
        <div className="flex items-center gap-2">
          {msg && <span className={`text-sm ${isError ? 'text-red-500' : 'text-green-600'}`}>{msg}</span>}
          <Button variant="ghost" size="sm" onClick={handleCopyPlain}>Copy plain text</Button>
          <Button variant="primary" size="sm" onClick={handleCopyFormatted}>Copy formatted email</Button>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-1">
        <span className="inline-flex items-center gap-1 bg-green-50 text-green-700 text-xs font-medium px-2.5 py-1 rounded-md ring-1 ring-green-200">
          ✓ HTML formatted — paste into Gmail or Outlook
        </span>
      </div>

      <div className="bg-gray-50 border border-b-0 border-gray-200 rounded-t-xl px-5 py-3">
        <span className="text-xs font-semibold text-gray-400 mr-3">SUBJECT</span>
        <span className="text-sm text-gray-800">{subject}</span>
      </div>
      <div className="bg-white border border-gray-200 rounded-b-xl p-6 overflow-y-auto max-h-[600px]"
        dangerouslySetInnerHTML={{ __html: buildHtmlEmail(fields) }} />

      <p className="text-xs text-gray-400 mt-2">
        "Copy formatted email" retains bold labels, bullets, and layout when pasted into Gmail or Outlook.
        "Copy plain text" is for plain-text environments.
      </p>
    </div>
  )
}
```

---

## FILE 18 — app/layout.tsx

```typescript
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Hill Technologies — Email Generator',
  description: 'Requisition to outreach email, powered by AI',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-[#f8f9fb]`}>
        <header className="fixed top-0 left-0 right-0 z-10 bg-white border-b border-gray-100">
          <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-md flex items-center justify-center text-white text-xs font-bold" style={{ backgroundColor: '#1a3c6b' }}>HT</div>
              <span className="font-semibold text-gray-900 text-sm">Hill Technologies</span>
            </div>
            <span className="text-xs text-gray-400">Email Generator</span>
          </div>
        </header>
        <main className="pt-14">{children}</main>
      </body>
    </html>
  )
}
```

---

## FILE 19 — app/globals.css

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

* { box-sizing: border-box; }
```

---

## FILE 20 — app/page.tsx

```typescript
'use client'
import { useState } from 'react'
import { RequisitionFields } from '@/lib/types'
import { pdfToText, isPDF } from '@/lib/pdfReader'
import UploadZone from '@/components/UploadZone'
import FieldEditor from '@/components/FieldEditor'
import EmailPreview from '@/components/EmailPreview'
import StepIndicator from '@/components/StepIndicator'
import Button from '@/components/ui/Button'

type Step = 'upload' | 'edit' | 'preview'

const emptyFields: RequisitionFields = {
  position_title: '', position_title_display: '', req_id: '', agency: '',
  location: '', worksite_arrangement: '', rate: '', contract_length: '',
  start_date: '', end_date: '', submission_deadline: '', engagement_type: '',
  position_description: '', duties: [], skills_checklist: [], warnings: [],
}

export default function Home() {
  const [step, setStep]         = useState<Step>('upload')
  const [fields, setFields]     = useState<RequisitionFields>(emptyFields)
  const [warnings, setWarnings] = useState<string[]>([])
  const [isLoading, setLoading] = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [fileName, setFileName] = useState('')

  const handleFileSelected = async (file: File) => {
    if (!isPDF(file)) { setError('Only PDF files are supported.'); return }
    setError(null); setLoading(true); setFileName(file.name)
    try {
      // Step 1: extract text from PDF client-side (DeepSeek is text-only)
      const pdfText = await pdfToText(file)

      // Step 2: send text to DeepSeek for field extraction
      const res = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdfText, filename: file.name }),
      })
      if (!res.ok) throw new Error(await res.text())
      const data: RequisitionFields = await res.json()

      // Step 3: clean the job title with a second DeepSeek call
      const titleRes = await fetch('/api/normalize-title', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rawTitle: data.position_title,
          descriptionExcerpt: (data.position_description || '').slice(0, 300),
        }),
      })
      const titleData = await titleRes.json()
      data.position_title_display = titleData.title || data.position_title

      setFields(data)
      setWarnings(data.warnings || [])
      setStep('edit')
    } catch (err: any) {
      setError(err.message || 'Extraction failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const reset = () => {
    setStep('upload'); setFields(emptyFields); setWarnings([])
    setError(null); setLoading(false); setFileName('')
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Email Generator</h1>
        <p className="text-sm text-gray-500 mt-1">Upload a requisition PDF — AI extracts the fields — generate your outreach email.</p>
      </div>

      <StepIndicator currentStep={step} />

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-5 flex justify-between items-center">
          <p className="text-sm text-red-700 flex items-center gap-2"><span>⚠</span>{error}</p>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 text-lg ml-4">✕</button>
        </div>
      )}

      {step === 'upload' && (
        <>
          <UploadZone onFileSelected={handleFileSelected} isLoading={isLoading} currentFileName={fileName} />
          <div className="mt-4 flex items-center justify-center gap-8 text-xs text-gray-400">
            <span>📄 PDF requisitions</span>
            <span>🔒 Processed securely</span>
            <span>✏️ All fields editable</span>
          </div>
        </>
      )}

      {step === 'edit' && (
        <>
          <FieldEditor fields={fields} onChange={setFields} warnings={warnings} />
          <div className="flex justify-between mt-4">
            <Button variant="ghost" onClick={reset}>Start over</Button>
            <Button variant="primary" onClick={() => setStep('preview')}>Preview email →</Button>
          </div>
        </>
      )}

      {step === 'preview' && (
        <>
          <EmailPreview fields={fields} onEdit={() => setStep('edit')} />
          <div className="mt-4 flex justify-start">
            <Button variant="ghost" onClick={reset}>Start over</Button>
          </div>
        </>
      )}
    </div>
  )
}
```

---

## FINAL STEPS AFTER BUILDING ALL FILES

1. Copy `pdf.worker.min.js` from node_modules to public/:
   ```bash
   cp node_modules/pdfjs-dist/build/pdf.worker.min.js public/
   ```

2. Create `.env.local` in the project root:
   ```
   DEEPSEEK_API_KEY=your-deepseek-api-key-here
   ```

3. Run the dev server:
   ```bash
   npm run dev
   ```

4. Test with the OCTO Flex Tech requisition PDF — expected results:
   - Raw title: "OCTO Flex Tech – Level 1: Field Technician & Logistical Support"
   - Cleaned title: "Field Technician & Logistics Support"
   - Skills matrix: 3 columns with Required/Highly desired labels and years
   - Position description: subheadings bold, bullets rendered as list items
   - Logos: small (120px), correct aspect ratio, visible in Gmail preview