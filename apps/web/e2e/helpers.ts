import { readFileSync } from 'node:fs'

import { expect, type Page } from '@playwright/test'

import { OUTBOX_FILE } from './config.ts'

export const DEMO_OWNER = {
  name: 'Demo Owner',
  email: 'owner@inventra.example',
  password: 'Inventra-demo-2026',
}

export async function fillLogin(page: Page, email: string, password: string) {
  await page.getByLabel('Email').fill(email)
  // exact: otherwise the "Show password" button matches too.
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Log in', exact: true }).click()
}

// The rest of the demo team, with the same public password (apps/api/scripts/seed_demo.py).
export const DEMO_MANAGER = { name: 'Demo Manager', email: 'manager@inventra.example' }
export const DEMO_STAFF = { name: 'Demo Staff', email: 'staff@inventra.example' }

export async function logInAs(page: Page, person: { name: string; email: string }, password = DEMO_OWNER.password) {
  await page.goto('/login')
  await fillLogin(page, person.email, password)
  await expect(page.getByRole('button', { name: new RegExp(person.name) })).toBeVisible()
}

export async function logInAsDemoOwner(page: Page) {
  await page.goto('/login')
  await fillLogin(page, DEMO_OWNER.email, DEMO_OWNER.password)
  await expect(page.getByRole('button', { name: new RegExp(DEMO_OWNER.name) })).toBeVisible()
}

// The newest link of this kind sent to this address, as a path the browser can open.
export function lastEmailedLink(to: string, kind: 'verify-email' | 'reset-password' | 'accept-invitation'): string {
  const emails = readFileSync(OUTBOX_FILE, 'utf-8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { to: string; body: string })

  for (const email of emails.reverse()) {
    const match = email.to === to && email.body.match(new RegExp(`/${kind}\\?token=[\\w-]+`))
    if (match) return match[0]
  }
  throw new Error(`No ${kind} link was sent to ${to}`)
}
