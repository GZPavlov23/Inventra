import { expect, test } from '@playwright/test'

import { DEMO_OWNER, fillLogin, lastEmailedLink, logInAsDemoOwner } from './helpers.ts'

const PASSWORD = 'a-long-test-password'

test('a visitor who is not logged in is sent to the login page', async ({ page }) => {
  await page.goto('/products')
  await expect(page).toHaveURL('/login')
  await expect(page.getByText('Welcome back')).toBeVisible()
})

test('a failed login gives the same message and stays on the page', async ({ page }) => {
  await page.goto('/login')
  await fillLogin(page, 'nobody@nowhere.example', 'wrong-password')
  await expect(page.getByText('Invalid email or password')).toBeVisible()
  await expect(page).toHaveURL('/login')
})

test('after logging in you land on the page you asked for and stay logged in', async ({ page, context }) => {
  await page.goto('/products?q=milk')
  await expect(page).toHaveURL('/login')
  await fillLogin(page, DEMO_OWNER.email, DEMO_OWNER.password)
  await expect(page).toHaveURL('/products?q=milk')

  await page.reload()
  await expect(page).toHaveURL('/products?q=milk')

  // The session cookie is out of reach for JavaScript.
  const session = (await context.cookies()).find((cookie) => cookie.name === 'inventra_session')
  expect(session?.httpOnly).toBe(true)
  expect(session?.sameSite).toBe('Lax')
  expect(await page.evaluate(() => document.cookie)).not.toContain('inventra_session')
})

test('logging out ends the session', async ({ page }) => {
  await logInAsDemoOwner(page)
  await page.getByRole('button', { name: /Demo Owner/ }).click()
  await page.getByRole('menuitem', { name: 'Log out' }).click()
  await expect(page).toHaveURL('/login')

  await page.goto('/inventory')
  await expect(page).toHaveURL('/login')
})

test('a new owner registers, confirms the email and gets an empty store', async ({ page }) => {
  const email = 'new.owner@e2e-shop.example'

  await page.goto('/register')
  await page.getByLabel('Your name').fill('New Owner')
  await page.getByLabel('Store name').fill('E2E Shop')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await expect(page.getByText('Good').or(page.getByText('Fair')).or(page.getByText('Strong'))).toBeVisible()
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByText('Check your email')).toBeVisible()

  // Not confirmed yet: the correct password is not enough.
  await page.goto('/login')
  await fillLogin(page, email, PASSWORD)
  await expect(page.getByText('Please confirm your email address')).toBeVisible()

  const link = lastEmailedLink(email, 'verify-email')
  await page.goto(link)
  await expect(page.getByText('Email confirmed')).toBeVisible()

  // The link works only once.
  await page.goto(link)
  await expect(page.getByText('The link did not work')).toBeVisible()

  await page.goto('/login')
  await fillLogin(page, email, PASSWORD)
  await expect(page.getByText('E2E Shop').first()).toBeVisible()
  await expect(page.getByText('No sales yet')).toBeVisible()
  await expect(page.getByText('No goods were written off')).toBeVisible()

  await page.goto('/forecast')
  await expect(page.getByText('Not enough sales yet')).toBeVisible()

  // Another store's products are not visible here.
  await page.goto('/products')
  await expect(page.getByText('No products yet')).toBeVisible()
})

test('a forgotten password can be replaced through the emailed link', async ({ page }) => {
  const email = 'forgetful@e2e-shop.example'
  const newPassword = 'a-brand-new-password'

  await page.goto('/register')
  await page.getByLabel('Your name').fill('Forgetful Owner')
  await page.getByLabel('Store name').fill('Forgetful Shop')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByText('Check your email')).toBeVisible()
  await page.goto(lastEmailedLink(email, 'verify-email'))
  await expect(page.getByText('Email confirmed')).toBeVisible()

  await page.goto('/login')
  await page.getByRole('link', { name: 'Forgot password?' }).click()
  // Wait for the new page itself: the address changes a moment before it is on screen.
  await expect(page.getByText('Forgot your password?')).toBeVisible()
  await page.getByLabel('Email').fill(email)
  await expect(page.getByLabel('Email')).toHaveValue(email)
  await page.getByRole('button', { name: 'Send reset link' }).click()
  await expect(page.getByText('Check your email')).toBeVisible()

  await page.goto(lastEmailedLink(email, 'reset-password'))
  await page.getByLabel('New password', { exact: true }).fill(newPassword)
  await page.getByLabel('Repeat the new password', { exact: true }).fill('something-else')
  await page.getByRole('button', { name: 'Change password' }).click()
  await expect(page.getByText('The two passwords are not the same')).toBeVisible()

  await page.getByLabel('Repeat the new password', { exact: true }).fill(newPassword)
  await page.getByRole('button', { name: 'Change password' }).click()
  await expect(page.getByText('Password changed')).toBeVisible()

  await page.goto('/login')
  await fillLogin(page, email, PASSWORD)
  await expect(page.getByText('Invalid email or password')).toBeVisible()

  await fillLogin(page, email, newPassword)
  await expect(page.getByText('Forgetful Shop').first()).toBeVisible()
})
