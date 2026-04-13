'use client'

import type { RequisitionFields } from '@/lib/types'

interface Props {
  fields: RequisitionFields
  onChange: (updated: RequisitionFields) => void
  warnings: string[]
}

const INPUT_CLASSES =
  'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent'

export default function FieldEditor({ fields, onChange, warnings }: Props) {
  const updateField = <K extends keyof RequisitionFields>(
    key: K,
    value: RequisitionFields[K],
  ): void => {
    onChange({ ...fields, [key]: value })
  }

  const handleDutiesChange = (value: string): void => {
    const duties = value
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
    updateField('duties', duties)
  }

  const handleSkillsChange = (value: string): void => {
    const skills = value
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
    updateField('skills_checklist', skills)
  }

  return (
    <div>
      {warnings.length > 0 ? (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-5">
          {warnings.map((warning, index) => (
            <p key={`${warning}-${index}`} className="text-sm text-amber-800">
              ⚠ {warning}
            </p>
          ))}
        </div>
      ) : null}

      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Job Metadata</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="md:col-span-2">
            <label className="block text-sm text-gray-600 mb-1" htmlFor="position_title">
              Position Title
            </label>
            <input
              id="position_title"
              type="text"
              className={INPUT_CLASSES}
              value={fields.position_title}
              onChange={(event) => updateField('position_title', event.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm text-gray-600 mb-1" htmlFor="agency">
              Agency
            </label>
            <input
              id="agency"
              type="text"
              className={INPUT_CLASSES}
              value={fields.agency}
              onChange={(event) => updateField('agency', event.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm text-gray-600 mb-1" htmlFor="location">
              Location
            </label>
            <input
              id="location"
              type="text"
              className={INPUT_CLASSES}
              value={fields.location}
              onChange={(event) => updateField('location', event.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm text-gray-600 mb-1" htmlFor="rate">
              Rate ($/hr)
            </label>
            <input
              id="rate"
              type="text"
              className={INPUT_CLASSES}
              value={fields.rate}
              onChange={(event) => updateField('rate', event.target.value)}
            />
            <p className="text-xs text-gray-400 mt-1">
              Set manually — this becomes &apos;Up to $X/hr&apos; in the email
            </p>
          </div>

          <div>
            <label className="block text-sm text-gray-600 mb-1" htmlFor="worksite_arrangement">
              Worksite Arrangement
            </label>
            <input
              id="worksite_arrangement"
              type="text"
              className={INPUT_CLASSES}
              value={fields.worksite_arrangement}
              onChange={(event) => updateField('worksite_arrangement', event.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm text-gray-600 mb-1" htmlFor="contract_length">
              Contract Length
            </label>
            <input
              id="contract_length"
              type="text"
              className={INPUT_CLASSES}
              value={fields.contract_length}
              onChange={(event) => updateField('contract_length', event.target.value)}
            />
            <p className="text-xs text-gray-400 mt-1">e.g. 4 months (through 09/30/2026)</p>
          </div>

          <div>
            <label className="block text-sm text-gray-600 mb-1" htmlFor="submission_deadline">
              Deadline (MM/DD/YYYY)
            </label>
            <input
              id="submission_deadline"
              type="text"
              className={INPUT_CLASSES}
              value={fields.submission_deadline}
              onChange={(event) => updateField('submission_deadline', event.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Email Content</p>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-600 mb-1" htmlFor="position_description">
              Position Description
            </label>
            <textarea
              id="position_description"
              className={`${INPUT_CLASSES} resize-y`}
              rows={5}
              value={fields.position_description}
              onChange={(event) => updateField('position_description', event.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm text-gray-600 mb-1" htmlFor="duties">
              Duties & Responsibilities
            </label>
            <textarea
              id="duties"
              className={`${INPUT_CLASSES} resize-y`}
              rows={8}
              value={fields.duties.join('\n')}
              onChange={(event) => handleDutiesChange(event.target.value)}
            />
            <p className="text-xs text-gray-400 mt-1">
              One duty per line — each becomes a bullet point in the email
            </p>
          </div>

          <div>
            <label className="block text-sm text-gray-600 mb-1" htmlFor="skills_checklist">
              Skills Checklist
            </label>
            <textarea
              id="skills_checklist"
              className={`${INPUT_CLASSES} resize-y`}
              rows={10}
              value={fields.skills_checklist.join('\n')}
              onChange={(event) => handleSkillsChange(event.target.value)}
            />
            <p className="text-xs text-gray-400 mt-1">
              One skill per line — each becomes a checkbox item in the email
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
