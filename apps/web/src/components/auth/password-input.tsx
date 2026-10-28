import { ArrowBigUpDash, Eye, EyeOff } from 'lucide-react'
import { type ComponentProps, type KeyboardEvent, useState } from 'react'

import { Input } from '@/components/ui/input'

// A password field with a button to show or hide what was typed, and a warning when Caps Lock
// is on (a common cause of "wrong password", which counts towards the account lock).
export function PasswordInput(props: Omit<ComponentProps<'input'>, 'type'>) {
  const [visible, setVisible] = useState(false)
  const [capsLock, setCapsLock] = useState(false)
  const Icon = visible ? EyeOff : Eye

  // The Caps Lock state can only be read from a keyboard event.
  const readCapsLock = (event: KeyboardEvent<HTMLInputElement>) =>
    setCapsLock(event.getModifierState('CapsLock'))

  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative">
        <Input
          {...props}
          type={visible ? 'text' : 'password'}
          className="pr-10"
          onKeyDown={(event) => {
            readCapsLock(event)
            props.onKeyDown?.(event)
          }}
          onKeyUp={(event) => {
            readCapsLock(event)
            props.onKeyUp?.(event)
          }}
          onBlur={(event) => {
            setCapsLock(false)
            props.onBlur?.(event)
          }}
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
        >
          <Icon className="size-4" />
        </button>
      </div>
      {capsLock && (
        <p role="status" className="flex items-center gap-1 text-xs font-medium text-amber-700">
          <ArrowBigUpDash className="size-3.5" />
          Caps Lock is on
        </p>
      )}
    </div>
  )
}
