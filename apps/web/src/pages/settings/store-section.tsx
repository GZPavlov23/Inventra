import { useMutation } from '@tanstack/react-query'
import { type FormEvent, useState } from 'react'
import { toast } from 'sonner'

import { useAuth, useCurrentUser } from '@/auth/use-auth'
import { FormField } from '@/components/form-field'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { toApiError } from '@/lib/api'
import { teamApi } from '@/lib/team-api'
import { useT } from '@/i18n/language-context'

export function StoreSection({ editable }: { editable: boolean }) {
  const { store } = useCurrentUser()
  const { refresh } = useAuth()
  const t = useT()
  const [name, setName] = useState(store.name)

  const rename = useMutation({
    mutationFn: () => teamApi.renameStore(name),
    onSuccess: async (saved) => {
      // The sidebar shows the name too, and it comes from who is logged in.
      await refresh()
      setName(saved.name)
      toast.success(t.settings.renamed)
    },
  })

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    rename.mutate()
  }

  const error = rename.error ? toApiError(rename.error) : null

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.settings.store}</CardTitle>
        <CardDescription>
          {t.settings.currency(store.currency)}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {editable ? (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:max-w-md">
            <FormField id="store_name" label={t.settings.name} required error={error?.fieldErrors.name ?? error?.message}>
              <Input id="store_name" required maxLength={120} aria-invalid={Boolean(error)}
                value={name} onChange={(event) => { setName(event.target.value); if (rename.isError) rename.reset() }} />
            </FormField>
            <Button type="submit" variant="outline" className="self-start"
              disabled={rename.isPending || name.trim() === store.name}>
              {rename.isPending && <Spinner />}
              {t.settings.saveName}
            </Button>
          </form>
        ) : (
          <p className="text-sm">{store.name}</p>
        )}
      </CardContent>
    </Card>
  )
}
