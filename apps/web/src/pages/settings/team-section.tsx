import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Ellipsis, Mail, UserMinus, UserPlus, UserRoundCheck } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { useAuth, useCurrentUser } from '@/auth/use-auth'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { toApiError } from '@/lib/api'
import type { UserRole } from '@/lib/auth-api'
import { type MemberStatus, teamApi, type TeamMember } from '@/lib/team-api'
import { InviteDialog } from '@/pages/settings/invite-dialog'
import { useT } from '@/i18n/language-context'

const STATUS_COLORS: Record<MemberStatus, string> = {
  active: 'bg-good/10 text-good',
  invited: 'bg-warning text-warning-foreground',
  deactivated: 'bg-muted text-muted-foreground',
}

const ROLES: UserRole[] = ['owner', 'manager', 'staff']

export function TeamSection() {
  const me = useCurrentUser()
  const { refresh } = useAuth()
  const t = useT()
  const queryClient = useQueryClient()
  const [inviteOpen, setInviteOpen] = useState(false)

  const members = useQuery({ queryKey: ['team'], queryFn: teamApi.members })

  const update = useMutation({
    mutationFn: ({ member, change }: { member: TeamMember; change: { role?: UserRole; active?: boolean } }) =>
      teamApi.update(member.id, change),
    onSuccess: (saved, { change }) => {
      void queryClient.invalidateQueries({ queryKey: ['team'] })
      if (change.role) toast.success(t.settings.nowRole(saved.full_name, t.settings.rolesLower[saved.role]))
      else if (change.active === false) toast.success(t.settings.cantLogIn(saved.full_name))
      else toast.success(t.settings.canLogIn(saved.full_name))
      // My own role may have changed what I'm allowed to see.
      if (saved.id === me.id) void refresh()
    },
    onError: (error) => toast.error(toApiError(error).message),
  })

  const resend = useMutation({
    mutationFn: (member: TeamMember) => teamApi.resend(member.id),
    onSuccess: (saved) => toast.success(t.settings.resent(saved.email)),
    onError: (error) => toast.error(toApiError(error).message),
  })

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <CardTitle>{t.settings.people}</CardTitle>
          <CardDescription>{t.settings.peopleText}</CardDescription>
        </div>
        <Button onClick={() => setInviteOpen(true)}>
          <UserPlus />
          {t.settings.invite}
        </Button>
      </CardHeader>
      <CardContent>
        {members.isError ? (
          <Alert variant="destructive"><AlertDescription>{members.error.message}</AlertDescription></Alert>
        ) : !members.data ? (
          <div className="flex flex-col gap-2"><Skeleton className="h-9 w-full" /><Skeleton className="h-9 w-full" /></div>
        ) : (
          <div className="rounded-lg border">
            <Table>
              <TableCaption className="sr-only">{t.settings.peopleCaption}</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>{t.settings.name}</TableHead>
                  <TableHead className="w-32 sm:w-40">{t.settings.role}</TableHead>
                  <TableHead className="hidden sm:table-cell">{t.settings.status}</TableHead>
                  <TableHead className="w-10"><span className="sr-only">{t.inventory.actions}</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.data.map((member) => {
                  const isMe = member.id === me.id
                  return (
                    <TableRow key={member.id}>
                      <TableCell>
                        <div className="font-medium">
                          {member.full_name}
                          {isMe && <span className="ml-1.5 text-xs font-normal text-muted-foreground">{t.settings.you}</span>}
                        </div>
                        <div className="text-xs text-muted-foreground">{member.email}</div>
                        {/* On a phone the status sits here, so the table needs no sideways scroll. */}
                        <StatusTag status={member.status} className="mt-1 inline-block sm:hidden" />
                      </TableCell>
                      <TableCell>
                        {/* Your own role is changed by another owner: it saves you from locking
                            yourself out of this page by mistake. */}
                        {isMe ? (
                          <span className="text-sm">{t.roles[member.role]}</span>
                        ) : (
                          <Select value={member.role}
                            onValueChange={(role) => update.mutate({ member, change: { role: role as UserRole } })}>
                            <SelectTrigger className="h-8 w-full" aria-label={t.settings.roleOf(member.full_name)}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {ROLES.map((role) => (
                                <SelectItem key={role} value={role}>{t.roles[role]}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <StatusTag status={member.status} />
                      </TableCell>
                      <TableCell className="py-0 text-right">
                        {!isMe && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon-sm" aria-label={t.inventory.actionsFor(member.full_name)}>
                                <Ellipsis />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {member.status === 'invited' && (
                                <DropdownMenuItem onSelect={() => resend.mutate(member)}>
                                  <Mail />
                                  {t.settings.sendAgain}
                                </DropdownMenuItem>
                              )}
                              {member.status === 'deactivated' ? (
                                <DropdownMenuItem onSelect={() => update.mutate({ member, change: { active: true } })}>
                                  <UserRoundCheck />
                                  {t.settings.giveBack}
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem onSelect={() => update.mutate({ member, change: { active: false } })}>
                                  <UserMinus />
                                  {t.settings.deactivate}
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          {t.settings.deactivatedNote}
        </p>
      </CardContent>
      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} />
    </Card>
  )
}

function StatusTag({ status, className = '' }: { status: MemberStatus; className?: string }) {
  const t = useT()
  return (
    <span className={`rounded-sm px-1.5 py-0.5 text-[0.6875rem] font-semibold tracking-wide uppercase ${STATUS_COLORS[status]} ${className}`}>
      {t.settings.statuses[status]}
    </span>
  )
}
