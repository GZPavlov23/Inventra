import { expect, type Page, test } from '@playwright/test'

import { logInAsDemoOwner } from './helpers.ts'

const API = '/api/v1'

type Item = { product: { name: string }; total: string; shortage: string; days: { day: string }[] }
type Report = { method: string; items: Item[] }
type Accuracy = {
  chosen: string
  models: { method: string; daily_wape: string; weekly_wape: string }[]
}

test.beforeEach(async ({ page }) => {
  await logInAsDemoOwner(page)
  await page.goto('/forecast')
  await expect(page.getByRole('heading', { name: 'Forecast', level: 2 })).toBeVisible()
  await expect(page.locator('tbody tr').first()).toBeVisible()
})

const tile = (page: Page, label: string) => page.getByRole('group', { name: label })
const dialog = (page: Page) => page.getByRole('dialog')
const percent = (share: string) => `${(Number(share) * 100).toFixed(1)}%`

async function json<T>(page: Page, path: string): Promise<T> {
  return (await (await page.request.get(`${API}${path}`)).json()) as T
}

test('it is reached from the menu, and the old name is gone', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'Forecast', exact: true }).click()
  await expect(page).toHaveURL('/forecast')
  await expect(page.getByRole('link', { name: 'AI Insights' })).toHaveCount(0)
})

test('the table shows the biggest shortage first', async ({ page }) => {
  const report = await json<Report>(page, '/forecasts?horizon=7')
  const rows = page.locator('tbody tr').filter({ hasText: /short|Enough/ })

  await expect(rows).toHaveCount(report.items.length)
  await expect(rows.first()).toContainText(report.items[0].product.name)
  await expect(rows.first()).toContainText('short')

  const shortages = report.items.map((item) => Number(item.shortage))
  expect(shortages).toEqual([...shortages].sort((a, b) => b - a))
  await expect(page.getByText(`Model: ${report.method}`)).toBeVisible()
})

test('a shortage of pieces is rounded up, so it can be ordered', async ({ page }) => {
  // The demo numbers change with the weekday, so the shortage is set by hand here.
  await page.route(`**${API}/forecasts?horizon=7`, async (route) => {
    const report = (await (await route.fetch()).json()) as Report
    report.items[0].shortage = '30.2'
    await route.fulfill({ json: report })
  })
  await page.reload()
  await expect(page.locator('tbody tr').first()).toContainText('31 pcs short')
})

test('the tiles count the same products as the table', async ({ page }) => {
  const report = await json<Report>(page, '/forecasts?horizon=7')
  const short = report.items.filter((item) => Number(item.shortage) > 0).length

  await expect(tile(page, 'Running short')).toContainText(String(short))
  await expect(tile(page, 'Enough stock')).toContainText(String(report.items.length - short))
})

test('the accuracy of both models is shown, and which one is used', async ({ page }) => {
  const accuracy = await json<Accuracy>(page, '/forecasts/accuracy')
  const chosen = accuracy.models.find((model) => model.method === accuracy.chosen)
  if (!chosen) throw new Error('The chosen model is not on the list')

  await expect(tile(page, 'Error per week')).toContainText(percent(chosen.weekly_wape))
  for (const model of accuracy.models) {
    const row = page.getByRole('row').filter({ hasText: model.method })
    await expect(row).toContainText(percent(model.daily_wape))
    await expect(row).toContainText(percent(model.weekly_wape))
  }
  await expect(page.getByRole('row').filter({ hasText: accuracy.chosen })).toContainText('Used')
  await expect(page.getByText('Used', { exact: true })).toHaveCount(1)
})

test('the page says plainly that this is not machine learning yet', async ({ page }) => {
  await expect(page.getByText('not machine learning yet')).toBeVisible()
  await expect(page.getByText('counts as a day without demand')).toBeVisible()
})

test('a product opens its forecast day by day', async ({ page }) => {
  const report = await json<Report>(page, '/forecasts?horizon=7')
  const first = report.items[0]

  await page.getByRole('button', { name: first.product.name, exact: true }).click()
  await expect(dialog(page).getByRole('heading', { name: first.product.name })).toBeVisible()
  await expect(dialog(page).getByRole('list', { name: 'Expected sales per day' }).getByRole('listitem')).toHaveCount(7)
  await page.keyboard.press('Escape')
  await expect(dialog(page)).toBeHidden()
})

test('the period can be changed, and survives a reload', async ({ page }) => {
  const asked = page.waitForRequest(`**${API}/forecasts?horizon=14`)
  await page.getByRole('tab', { name: 'Next 14 days' }).click()
  await asked
  await expect(page).toHaveURL(/days=14/)
  await expect(tile(page, 'Running short')).toContainText('within 14 days')

  await page.reload()
  await expect(page.getByRole('tab', { name: 'Next 14 days' })).toHaveAttribute('aria-selected', 'true')

  await page.locator('tbody tr').first().getByRole('button').click()
  await expect(dialog(page).getByRole('list', { name: 'Expected sales per day' }).getByRole('listitem')).toHaveCount(14)
})

test('a delivery lowers the shortage on the next visit', async ({ page }) => {
  // Its own product with invented history, because this test adds stock and the demo products
  // have to stay as they are for other tests.
  const name = 'Е2Е Прогноза'
  const created = await page.request.post(`${API}/products`, {
    data: { name, purchase_price: '1.00', sale_price: '2.00' },
  })
  const product = (await created.json()) as { id: number }
  const days = Array.from({ length: 20 }, (_, index) => {
    const day = new Date()
    day.setDate(day.getDate() - index - 1)
    const month = String(day.getMonth() + 1).padStart(2, '0')
    const date = String(day.getDate()).padStart(2, '0')
    return `${day.getFullYear()}-${month}-${date};${name};5`
  })
  const imported = await page.request.post(`${API}/imports/sales`, {
    data: { mode: 'history', content: ['date;product;quantity', ...days].join('\n'), dry_run: false },
  })
  expect(((await imported.json()) as { applied: boolean }).applied).toBe(true)

  await page.goto('/')
  await page.getByRole('link', { name: 'Forecast', exact: true }).click()
  await expect(page.getByRole('row').filter({ hasText: name })).toContainText('35 pcs short')

  const delivery = await page.request.post(`${API}/batches`, {
    data: { product_id: product.id, quantity: '36' },
  })
  expect(delivery.ok()).toBe(true)

  await page.getByRole('link', { name: 'Dashboard', exact: true }).click()
  await page.getByRole('link', { name: 'Forecast', exact: true }).click()
  await expect(page.getByRole('row').filter({ hasText: name })).toContainText('Enough')
})

test('on a phone the tables fit, so the shortage needs no sideways scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 })
  await expect(page.getByRole('columnheader', { name: 'Shortage' })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'Error per week' })).toBeVisible()

  const tables = page.locator('[data-slot="table-container"]')
  await expect(tables).toHaveCount(2)
  for (const table of await tables.all()) {
    expect(await table.evaluate((box) => box.scrollWidth - box.clientWidth)).toBeLessThanOrEqual(0)
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0)
})
