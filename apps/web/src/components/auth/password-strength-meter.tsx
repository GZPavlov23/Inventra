import { estimatePasswordStrength } from '@/lib/password-strength'

const SEGMENT_COLORS = ['', 'bg-destructive', 'bg-amber-500', 'bg-primary', 'bg-primary']
const LABEL_COLORS = ['text-muted-foreground', 'text-destructive', 'text-amber-700', 'text-primary', 'text-primary']

// Four bars that fill up as the password gets stronger, plus a one-word label.
export function PasswordStrengthMeter({ password, email }: { password: string; email?: string }) {
  if (!password) return null
  const { score, label } = estimatePasswordStrength(password, email)

  return (
    <div className="flex items-center gap-3">
      <div className="flex flex-1 gap-1" aria-hidden>
        {[1, 2, 3, 4].map((segment) => (
          <div
            key={segment}
            className={`h-1 flex-1 rounded-full transition-colors duration-300 motion-reduce:transition-none ${
              segment <= score ? SEGMENT_COLORS[score] : 'bg-muted'
            }`}
          />
        ))}
      </div>
      {/* aria-live: screen readers announce the new strength while typing. */}
      <p aria-live="polite" className={`w-16 text-right text-xs font-medium ${LABEL_COLORS[score]}`}>
        <span className="sr-only">Password strength: </span>
        {label}
      </p>
    </div>
  )
}
