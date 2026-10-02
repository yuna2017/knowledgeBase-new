import { REQUEST_ID_RE, TICKET_RE } from './feedback-contract.js'

const FIELDS = ['category', 'kind', 'want', 'scene', 'article', 'contact']

export function submissionContent(payload) {
  return JSON.stringify(FIELDS.map((field) => typeof payload?.[field] === 'string' ? payload[field] : ''))
}

/** A retry keeps its ID; an edited submission gets a new one. */
export function prepareSubmission(payload, previous, createId = () => crypto.randomUUID()) {
  const reuse = previous && REQUEST_ID_RE.test(previous.requestId || '') && submissionContent(previous) === submissionContent(payload)
  return { ...payload, requestId: reuse ? previous.requestId : createId() }
}

/** Old pending entries predate request IDs. Derive the same upgrade ID in every tab. */
export async function restoreSubmission(payload) {
  if (typeof payload.requestId === 'string' && REQUEST_ID_RE.test(payload.requestId)) return payload
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(payload)))
  const digest = [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  return { ...payload, requestId: 'legacy-' + digest }
}

/** A 200 without a usable ticket is not a successful delivery receipt. */
export function feedbackReceipt(data) {
  return data?.ok === true && typeof data.ticket === 'string' && TICKET_RE.test(data.ticket) ? data.ticket : null
}
