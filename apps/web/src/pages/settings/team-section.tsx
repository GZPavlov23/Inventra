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
import { ROLE_LABELS, type UserRole } from '@/lib/auth-api'
import { type MemberStatus, teamApi, type TeamMember } from '@/lib/team-api'
import { InviteDialog } from '@/pages/settings/invite-dialog'

const STATUS: Record<MemberStatus, { label: string; className: string }> = {
  active: { label: 'Active', className: 'bg-good/10 text-good' },
  invited: { label: 'Invited', className: 'bg-warning text-warning-foreground' },
  deactivated: { label: 'Deactivated', className: 'bg-muted text-muted-foreground' },
}

export function TeamSection() {
  const me = useCurrentUser()
  const { refresh } = useAuth()
  const queryClient = useQueryClient()
  const [inviteOpen, setInviteOpen] = useState(false)

  const members = useQuery({ queryKey: ['team'], queryFn: teamApi.members })

  const update = useMutation({
    mutationFn: ({ member, change }: { member: TeamMember; change: { role?: UserRole; active?: boolean } }) =>
      teamApi.update(member.id, change),
    onSuccess: (saved, { change }) => {
      void queryClient.invalidateQueries({ queryKey: ['team'] })
      if (change.role) toast.success(`${saved.full_name} is now ${ROLE_LABELS[saved.role].toLowerCase()}`)
      else if (change.active === false) toast.success(`${saved.full_name} can no longer log in`)
      else toast.success(`${saved.full_name} can log in again`)
      // My own role may have changed what I'm allowed to see.
      if (saved.id === me.id) void refresh()
    },
    onError: (error) => toast.error(toApiError(error).message),
  })

  const resend = useMutation({
    mutationFn: (member: TeamMember) => teamApi.resend(member.id),
    onSuccess: (saved) => toast.success(`A new invitation was sent to ${saved.email}`),
    onError: (error) => toast.error(toApiError(error).message),
  })

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <CardTitle>People</CardTitle>
          <CardDescription>Everyone who works in the store, and what they can do.</CardDescription>
        </div>
        <Button onClick={() => setInviteOpen(true)}>
          <UserPlus />
          Invite someone
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
              <TableCaption className="sr-only">People of your store</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="w-32 sm:w-40">Role</TableHead>
                  <TableHead className="hidden sm:table-cell">Status</TableHead>
                  <TableHead className="w-10"><span className="sr-only">Actions</span></TableHead>
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
                          {isMe && <span className="ml-1.5 text-xs font-normal text-muted-foreground">(you)</span>}
                        </div>
                        <div className="text-xs text-muted-foreground">{member.email}</div>
                        {/* On a phone the status sits here, so the table needs no sideways scroll. */}
                        <StatusTag status={member.status} className="mt-1 inline-block sm:hidden" />
                      </TableCell>
                      <TableCell>
                        {/* Your own role is changed by another owner: it saves you from locking
                            yourself out of this page by mistake. */}
                        {isMe ? (
                          <span className="text-sm">{ROLE_LABELS[member.role]}</span>
                        ) : (
                          <Select value={member.role}
                            onValueChange={(role) => update.mutate({ member, change: { role: role as UserRole } })}>
                            <SelectTrigger className="h-8 w-full" aria-label={`Role of ${member.full_name}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {(Object.keys(ROLE_LABELS) as UserRole[]).map((role) => (
                                <SelectItem key={role} value={role}>{ROLE_LABELS[role]}</SelectItem>
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
                              <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${member.full_name}`}>
                                <Ellipsis />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {member.status === 'invited' && (
                                <DropdownMenuItem onSelect={() => resend.mutate(member)}>
                                  <Mail />
                                  Send the invitation again
                                </DropdownMenuItem>
                              )}
                              {member.status === 'deactivated' ? (
                                <DropdownMenuItem onSelect={() => update.mutate({ member, change: { active: true } })}>
                                  <UserRoundCheck />
                                  Give access back
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem onSelect={() => update.mutate({ member, change: { active: false } })}>
                                  <UserMinus />
                                  Deactivate
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
          Someone deactivated is logged out at once and can't log in, but their sales and stock
          changes stay in the history.
        </p>
      </CardContent>
      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} />
    </Card>
  )
}

function StatusTag({ status, className = '' }: { status: MemberStatus; className?: string }) {
  return (
    <span className={`rounded-sm px-1.5 py-0.5 text-[0.6875rem] font-semibold tracking-wide uppercase ${STATUS[status].className} ${className}`}>
      {STATUS[status].label}
    </span>
  )
}
