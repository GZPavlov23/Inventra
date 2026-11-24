import { useCan } from '@/auth/use-auth'
import { AccountSection } from '@/pages/settings/account-section'
import { StoreSection } from '@/pages/settings/store-section'
import { TeamSection } from '@/pages/settings/team-section'
import { useT } from '@/i18n/language-context'

// Everyone has an account here. The store's name and its people are for the owner.
export function SettingsPage() {
  const can = useCan()
  const t = useT()
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">{t.nav.settings}</h2>
        <p className="text-sm text-muted-foreground">{t.settings.subtitle}</p>
      </div>
      <AccountSection />
      <StoreSection editable={can('manage_team')} />
      {can('manage_team') && <TeamSection />}
    </div>
  )
}
