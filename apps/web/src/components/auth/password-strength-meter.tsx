import { estimatePasswordStrength } from '@/lib/password-strength'
import { useT } from '@/i18n/language-context'

const SEGMENT_COLORS = ['', 'bg-destructive', 'bg-signal', 'bg-good', 'bg-good']
const LABEL_COLORS = ['text-muted-foreground', 'text-destructive', 'text-warning-foreground', 'text-good', 'text-good']

// Four bars that fill up as the password gets stronger, plus a one-word label.
export function PasswordStrengthMeter({ password, email }: { password: string; email?: string }) {
  const t = useT()
  if (!password) return null
  // The score decides; the word for it comes in the chosen language.
  const { score } = estimatePasswordStrength(password, email)
  const label = t.auth.strength[score]

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
      <p aria-live="polite" className={`min-w-16 text-right text-xs font-medium whitespace-nowrap ${LABEL_COLORS[score]}`}>
        <span className="sr-only">{t.auth.strengthLabel}</span>
        {label}
      </p>
    </div>
  )
}
