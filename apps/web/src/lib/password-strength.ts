// A simple, explainable estimate of password strength, shown while the user types.
// It only guides the user: the server's real rule is "at least 8 characters" (NIST SP 800-63B),
// so we reward length first and never demand a symbol or a capital letter.

export type PasswordStrength = {
  score: 0 | 1 | 2 | 3 | 4
  label: 'Too short' | 'Weak' | 'Fair' | 'Good' | 'Strong'
}

const LABELS = ['Too short', 'Weak', 'Fair', 'Good', 'Strong'] as const

// A few of the most common passwords. Long lists exist, but these cover the classic mistakes.
const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'password123', '12345678', '123456789', '1234567890',
  'qwertyui', 'qwerty123', '11111111', '00000000', 'iloveyou', 'abcd1234',
  'inventra', 'inventra1', 'inventra123',
])

const SEQUENCES = ['abcdefghijklmnopqrstuvwxyz', '01234567890', 'qwertyuiop', 'asdfghjkl']

function isSequence(password: string): boolean {
  const lower = password.toLowerCase()
  return SEQUENCES.some((sequence) => sequence.includes(lower) || sequence.split('').reverse().join('').includes(lower))
}

export function estimatePasswordStrength(password: string, email = ''): PasswordStrength {
  const result = (score: PasswordStrength['score']) => ({ score, label: LABELS[score] })

  if (password.length < 8) return result(0)

  const lower = password.toLowerCase()
  const emailName = email.split('@')[0].toLowerCase()
  const isObvious =
    COMMON_PASSWORDS.has(lower) ||
    new Set(lower).size <= 2 || // e.g. "aaaaaaaa" or "abababab"
    isSequence(password) ||
    (emailName.length >= 3 && lower.includes(emailName))
  if (isObvious) return result(1)

  // Length matters most...
  let score = password.length >= 16 ? 3 : password.length >= 12 ? 2 : 1
  // ...and a mix of character kinds adds a little.
  const kinds = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/].filter((kind) => kind.test(password))
  if (kinds.length >= 3) score += 1

  return result(Math.min(score, 4) as PasswordStrength['score'])
}
