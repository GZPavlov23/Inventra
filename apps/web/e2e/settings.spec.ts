import { type Browser, expect, type Page, test } from '@playwright/test'

import { ENGLISH } from './config.ts'
import { lastEmailedLink, logInAsDemoOwner } from './helpers.ts'

const PASSWORD = 'a-good-new-password'

test.beforeEach(async ({ page }) => {
  await logInAsDemoOwner(page)
  await page.goto('/settings')
  await expect(page.getByRole('heading', { name: 'Settings', level: 2 })).toBeVisible()
})

const people = (page: Page) => page.getByRole('table').filter({ hasText: 'Demo Owner' })
const row = (page: Page, name: string) => people(page).getByRole('row').filter({ hasText: name })

// A different person in every test, so the tests don't depend on each other.
function newPerson(label: string) {
  const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`
  return { name: `Е2Е ${label} ${stamp}`, email: `e2e-${label.toLowerCase()}-${stamp}@inventra.example` }
}

async function invite(page: Page, person: { name: string; email: string }, role: 'Staff' | 'Manager' = 'Staff') {
  await page.getByRole('button', { name: 'Invite someone' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Name').fill(person.name)
  await dialog.getByLabel('Email').fill(person.email)
  if (role !== 'Staff') {
    await dialog.getByRole('combobox', { name: 'Role' }).click()
    await page.getByRole('option', { name: role }).click()
  }
  await dialog.getByRole('button', { name: 'Send invitation' }).click()
  await expect(page.getByText(`Invitation sent to ${person.email}`)).toBeVisible()
}

// The invited person, in a browser of their own, follows the link and logs in.
async function join(browser: Browser, person: { name: string; email: string }): Promise<Page> {
  // A browser of its own doesn't get the config's settings: English is chosen here too.
  const context = await browser.newContext({ storageState: ENGLISH })
  const theirs = await context.newPage()
  await theirs.goto(lastEmailedLink(person.email, 'accept-invitation'))
  await theirs.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await theirs.getByLabel('Repeat the password').fill(PASSWORD)
  await theirs.getByRole('button', { name: 'Join the store' }).click()
  await expect(theirs.getByText("You're in")).toBeVisible()
  await theirs.getByRole('link', { name: 'Log in' }).click()
  await theirs.getByLabel('Email').fill(person.email)
  await theirs.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await theirs.getByRole('button', { name: 'Log in', exact: true }).click()
  await expect(theirs.getByRole('button', { name: new RegExp(person.name) })).toBeVisible()
  return theirs
}

test('the owner sees every permission and is not offered to change their own role', async ({ page }) => {
  await expect(page.getByRole('list', { name: 'What your role can do' }).getByRole('listitem')).toHaveCount(6)
  await expect(row(page, 'Demo Owner')).toContainText('(you)')
  await expect(row(page, 'Demo Owner').getByRole('combobox')).toHaveCount(0)
  await expect(row(page, 'Demo Owner').getByRole('button', { name: /^Actions for/ })).toHaveCount(0)
})

test('an invited person chooses a password, joins with their role, and shows as active', async ({ page, browser }) => {
  const person = newPerson('Staff')
  await invite(page, person)
  await expect(row(page, person.name)).toContainText('Invited')

  const theirs = await join(browser, person)
  await expect(theirs).toHaveURL('/inventory')
  await expect(theirs.getByRole('link', { name: 'Dashboard' })).toHaveCount(0)

  await page.reload()
  await expect(row(page, person.name)).toContainText('Active')
  await theirs.context().close()
})

test('a taken email is shown next to the email field', async ({ page }) => {
  await page.getByRole('button', { name: 'Invite someone' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Name').fill('Again')
  await dialog.getByLabel('Email').fill('staff@inventra.example')
  await dialog.getByRole('button', { name: 'Send invitation' }).click()
  await expect(dialog.getByRole('alert')).toContainText('already has an Inventra account')
})

test('a new role takes effect, and deactivating logs the person out at once', async ({ page, browser }) => {
  const person = newPerson('Manager')
  await invite(page, person)
  const theirs = await join(browser, person)

  await row(page, person.name).getByRole('combobox', { name: `Role of ${person.name}` }).click()
  await page.getByRole('option', { name: 'Manager' }).click()
  await expect(page.getByText(`${person.name} is now manager`)).toBeVisible()
  await theirs.reload()
  await expect(theirs.getByRole('link', { name: 'Dashboard' })).toBeVisible()

  await row(page, person.name).getByRole('button', { name: /^Actions for/ }).click()
  await page.getByRole('menuitem', { name: 'Deactivate' }).click()
  await expect(row(page, person.name)).toContainText('Deactivated')
  await theirs.reload()
  await expect(theirs.getByRole('button', { name: 'Log in', exact: true })).toBeVisible()
  await theirs.context().close()
})

test('a person changes their own password, and a wrong current one is caught', async ({ page, browser }) => {
  const person = newPerson('Password')
  await invite(page, person)
  const theirs = await join(browser, person)
  await theirs.goto('/settings')
  const form = theirs.getByRole('form', { name: 'Change password' })

  await form.getByLabel('Current password').fill('not-my-password')
  await form.getByLabel('New password', { exact: true }).fill('another-good-password')
  await form.getByLabel('Repeat the new password').fill('another-good-password')
  await form.getByRole('button', { name: 'Change password' }).click()
  await expect(form.getByText('The current password is not right')).toBeVisible()
  await expect(theirs).toHaveURL('/settings')

  await form.getByLabel('Current password').fill(PASSWORD)
  await form.getByRole('button', { name: 'Change password' }).click()
  await expect(theirs.getByText('Password changed')).toBeVisible()
  await theirs.context().close()
})

async function storeInMenu(page: Page) {
  await page.getByRole('button', { name: /^Account:/ }).click()
  return page.getByRole('menu').locator('[data-slot="menu-store"]')
}

test('the owner renames the store and the menu shows the new name', async ({ page }) => {
  const field = page.getByRole('textbox', { name: 'Name', exact: true })
  const original = await field.inputValue()
  await field.fill('Е2Е Магазин')
  await page.getByRole('button', { name: 'Save name' }).click()
  await expect(page.getByText('The store was renamed')).toBeVisible()
  await expect(await storeInMenu(page)).toContainText('Е2Е Магазин')
  await page.keyboard.press('Escape')

  // Back as it was, for the tests that come after.
  await field.fill(original)
  await page.getByRole('button', { name: 'Save name' }).click()
  await expect(await storeInMenu(page)).toContainText(original)
})

test('a broken invitation link says so', async ({ page }) => {
  await page.goto('/accept-invitation?token=not-a-real-token')
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByLabel('Repeat the password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Join the store' }).click()
  await expect(page.getByText('The link did not work')).toBeVisible()
})
