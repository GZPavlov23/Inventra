import { expect, type Page, test } from '@playwright/test'

import { DEMO_MANAGER, DEMO_STAFF, logInAs } from './helpers.ts'


async function menuTitles(page: Page): Promise<string[]> {
  const links = page.getByRole('navigation', { name: 'Main' }).getByRole('link')
  return (await links.allInnerTexts()).map((text) => text.trim()).filter(Boolean)
}

test.describe('staff', () => {
  test.beforeEach(async ({ page }) => {
    await logInAs(page, DEMO_STAFF)
  })

  test('the menu holds only the till and shelf work, and the day starts on Inventory', async ({ page }) => {
    await expect(page).toHaveURL('/inventory')
    expect(await menuTitles(page)).toEqual(['Products', 'Inventory', 'Deliveries', 'Suppliers', 'Sales'])
    await page.goto('/')
    await expect(page).toHaveURL('/inventory')

    // Settings is not a pill any more: it lives in the person's menu.
    await page.getByRole('button', { name: 'Account: Demo Staff' }).click()
    await page.getByRole('menuitem', { name: 'Settings' }).click()
    await expect(page).toHaveURL('/settings')
  })

  test('a page outside the role explains itself instead of failing', async ({ page }) => {
    for (const path of ['/orders', '/forecast']) {
      await page.goto(path)
      await expect(page.getByText("isn't part of your role")).toBeVisible()
    }
    await page.getByRole('link', { name: 'Go to your start page' }).click()
    await expect(page).toHaveURL('/inventory')
  })

  test('products and suppliers are for looking up, not for changing', async ({ page }) => {
    await page.goto('/products')
    await expect(page.locator('tbody tr').first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Add product' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^Actions for/ })).toHaveCount(0)
    await page.locator('tbody tr').first().click()
    await expect(page.getByRole('dialog')).toHaveCount(0)

    await page.goto('/suppliers')
    await expect(page.locator('tbody tr').first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Add supplier' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^Actions for/ })).toHaveCount(0)
    await expect(page.getByRole('link', { name: '02 000 0001' })).toBeVisible()
  })

  test('the till records sales without showing what the store earns', async ({ page }) => {
    await page.goto('/sales')
    await expect(page.getByText('Ready for the next customer')).toBeVisible()
    await expect(page.getByRole('button', { name: 'New sale' })).toBeVisible()
    await expect(page.getByRole('button', { name: /Import/ })).toHaveCount(0)
    await expect(page.getByRole('group', { name: 'Profit' })).toHaveCount(0)
  })

  test('deliveries can be received, but not placed or cancelled', async ({ page }) => {
    await page.goto('/deliveries')
    await expect(page.locator('tbody tr').first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'New delivery' })).toHaveCount(0)
    await page.locator('tbody tr').first().getByRole('cell').first().click()
    await expect(page.getByRole('dialog').getByRole('button', { name: 'Receive goods' })).toBeVisible()
    await expect(page.getByRole('dialog').getByRole('button', { name: 'Cancel delivery' })).toHaveCount(0)
  })

  test('settings show the account and what the role can do, without the people', async ({ page }) => {
    await page.goto('/settings')
    const can = page.getByRole('list', { name: 'What your role can do' }).getByRole('listitem')
    await expect(can).toHaveText(['Record sales at the till', 'Receive goods and deliveries, write off and correct stock'])
    await expect(page.getByText('People', { exact: true })).toHaveCount(0)
    // The store's name is shown, but not as a field to change.
    await expect(page.getByRole('textbox', { name: 'Name', exact: true })).toHaveCount(0)
    await expect(page.getByRole('main').getByText('Демо магазин (демо данни)')).toBeVisible()
  })
})

test.describe('manager', () => {
  test('runs the store day to day, but people and the store name stay with the owner', async ({ page }) => {
    await logInAs(page, DEMO_MANAGER)
    await expect(page).toHaveURL('/')
    expect(await menuTitles(page)).toEqual([
      'Dashboard', 'Products', 'Inventory', 'Deliveries', 'Suppliers', 'Sales', 'Orders', 'Forecast',
    ])
    await page.goto('/products')
    await expect(page.getByRole('button', { name: 'Add product' })).toBeVisible()

    await page.goto('/settings')
    await expect(page.getByRole('list', { name: 'What your role can do' }).getByRole('listitem')).toHaveCount(5)
    await expect(page.getByRole('button', { name: 'Invite someone' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Save name' })).toHaveCount(0)
  })
})

