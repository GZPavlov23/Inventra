// A thin wrapper around fetch for our REST API.
// Requests go to /api/... on the web app's own address; in development Vite forwards them to
// FastAPI (see vite.config.ts). The browser attaches the httpOnly session cookie by itself:
// our JavaScript never sees or stores the session token.

const API_BASE = '/api/v1'

// Fired on every 401 response, so the app can return to the login page when a session ends.
export const UNAUTHORIZED_EVENT = 'inventra:unauthorized'

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  // Validation messages per field name, so forms can show each one under its own input.
  readonly fieldErrors: Record<string, string>

  constructor(status: number, code: string, message: string, fieldErrors: Record<string, string> = {}) {
    super(message)
    this.status = status
    this.code = code
    this.fieldErrors = fieldErrors
  }
}

type ValidationIssue = { loc: (string | number)[]; msg: string }

function readFieldErrors(issues: ValidationIssue[] = []): Record<string, string> {
  const fields: Record<string, string> = {}
  for (const { loc, msg } of issues) {
    // loc looks like ["body", "barcode"]; keep the first message of each field.
    const field = loc[0] === 'body' ? loc[1] : undefined
    if (typeof field === 'string' && !(field in fields)) fields[field] = msg
  }
  return fields
}

// A new error object every time, so each failed attempt is a distinct event for the UI.
const serverUnreachable = () =>
  new ApiError(0, 'network_error', 'Cannot reach the server. Check that the backend is running.')

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: unknown
}

export async function api<T>(path: string, { method = 'GET', body }: RequestOptions = {}): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
    })
  } catch {
    throw serverUnreachable()
  }

  if (response.status === 401) {
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT))
  }
  if (response.status === 204) {
    return undefined as T
  }

  const data = await response.json().catch(() => null)
  if (!response.ok) {
    // Every API error has the shape {code, detail}. Anything else means the API itself is
    // down (e.g. the dev proxy answers 500 when FastAPI isn't running).
    if (!data?.code) throw serverUnreachable()
    throw new ApiError(response.status, data.code, data.detail, readFieldErrors(data.errors))
  }
  return data as T
}

export function toApiError(error: unknown): ApiError {
  return error instanceof ApiError ? error : new ApiError(0, 'unknown', 'Something went wrong')
}
