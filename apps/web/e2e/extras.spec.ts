import { expect, type Page, test } from '@playwright/test'

import { DEMO_STAFF, logInAs, logInAsDemoOwner } from './helpers.ts'

// The cozy-desk extras: the floating New sale, the notes on the chart, the quick search,
// "Your month" and the evening theme. (The empty briefing is checked in auth.spec.ts, on a new
// store, because the demo store always has something that needs attention.)

const API = '/api/v1'

function day(offset: number): string {
  const moment = new Date()
  moment.setDate(moment.getDate() + offset)
  return `${moment.getFullYear()}-${String(moment.getMonth() + 1).padStart(2, '0')}-${String(moment.getDate()).padStart(2, '0')}`
}

const money = (amount: string | number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR' }).format(Number(amount))

async function json<T>(page: Page, path: string): Promise<T> {
  return (await (await page.request.get(`${API}${path}`)).json()) as T
}

const floating = (page: Page) => page.locator('button[aria-keyshortcuts="N"]')
const newSaleDialog = (page: Page) => page.getByRole('dialog', { name: 'New sale' })

test.describe('owner', () => {
  test.beforeEach(async ({ page }) => {
    await logInAsDemoOwner(page)
  })

  test('New sale floats on every page and opens with N, but not while typing', async ({ page }) => {
    await page.goto('/inventory')
    await floating(page).click()
    await expect(newSaleDialog(page)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(newSaleDialog(page)).toHaveCount(0)

    await page.keyboard.press('n')
    await expect(newSaleDialog(page)).toBeVisible()
    await page.keyboard.press('Escape')

    await page.getByPlaceholder('Search by product, barcode or lot').fill('n')
    await expect(newSaleDialog(page)).toHaveCount(0)

    // The Sales page has its own button, so the floating one stays away.
    await page.goto('/sales')
    await expect(page.getByRole('heading', { name: 'Sales', level: 2 })).toBeVisible()
    await expect(floating(page)).toHaveCount(0)
  })

  test('the chart points at the best finished day, worked out from the daily numbers', async ({ page }) => {
    const days = await json<{ day: string; revenue: string }[]>(page, `/sales/daily?date_from=${day(-29)}&date_to=${day(0)}`)
    // Today isn't over, so it can't be the best day.
    const best = days.slice(0, -1).reduce((top, item) => (Number(item.revenue) > Number(top.revenue) ? item : top))

    await page.goto('/')
    await expect(page.locator('[data-note="best"]')).toContainText(`best day: ${money(best.revenue)}`)
    await expect(page.locator('[data-note="today"]')).toHaveText('today so far')
    await expect(page.locator('.sr-only').filter({ hasText: `Best day: ${money(best.revenue)}` })).toBeAttached()
  })

  test('the quick search finds a product by its barcode and goes to it', async ({ page }) => {
    await page.goto('/inventory')
    await expect(page.getByRole('heading', { name: 'Inventory', level: 2 })).toBeVisible()
    await page.keyboard.press('ControlOrMeta+k')
    const search = page.getByRole('dialog', { name: 'Search everything' })
    await search.getByRole('combobox').fill('2000000000022')
    await expect(search.getByRole('option', { name: /Кисело мляко/ }).first()).toBeVisible()
    await page.keyboard.press('Enter')

    await expect(page).toHaveURL('/products?q=2000000000022')
    await expect(page.locator('tbody tr')).toHaveCount(1)
    await expect(page.locator('tbody tr')).toContainText('Кисело мляко')

    // Opened again from the same page with another search: the page follows the new one.
    await page.keyboard.press('ControlOrMeta+k')
    await search.getByRole('combobox').fill('2000000000015')
    await expect(search.getByRole('option', { name: /Прясно мляко/ }).first()).toBeVisible()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL('/products?q=2000000000015')
    await expect(page.getByPlaceholder('Search by name, brand or barcode')).toHaveValue('2000000000015')
    await expect(page.locator('tbody tr')).toContainText('Прясно мляко')
  })

  test('the quick search goes to pages and starts a sale', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Search' }).click()
    const search = page.getByRole('dialog', { name: 'Search everything' })
    await search.getByRole('combobox').fill('your month')
    await search.getByRole('option', { name: 'Your month' }).click()
    await expect(page).toHaveURL('/month')

    await page.keyboard.press('ControlOrMeta+k')
    await search.getByRole('combobox').fill('new sale')
    await search.getByRole('option', { name: /New sale/ }).click()
    await expect(newSaleDialog(page)).toBeVisible()
  })

  test('your month adds up the month so far and steps back to the month before', async ({ page }) => {
    const firstOfMonth = `${day(0).slice(0, 8)}01`
    const summary = await json<{ revenue: string; profit: string }>(page, `/sales/summary?date_from=${firstOfMonth}&date_to=${day(0)}`)
    const name = (offset: number) => {
      const moment = new Date()
      moment.setDate(1)
      moment.setMonth(moment.getMonth() + offset)
      return new Intl.DateTimeFormat('en', { month: 'long' }).format(moment)
    }

    await page.goto('/')
    await page.getByRole('link', { name: 'Your month so far' }).click()
    await expect(page.getByRole('heading', { name: `Your ${name(0)}`, level: 2 })).toBeVisible()
    await expect(page.getByRole('region', { name: 'You sold' })).toContainText(money(summary.revenue))
    await expect(page.getByRole('region', { name: 'You sold' })).toContainText(money(summary.profit))

    await page.getByRole('navigation', { name: 'Months' }).getByRole('link', { name: new RegExp(name(-1)) }).click()
    await expect(page.getByRole('heading', { name: new RegExp(`^Your ${name(-1)}`), level: 2 })).toBeVisible()
    await expect(page.getByRole('region', { name: 'How close the forecast was' })).toHaveCount(0)
  })

  test('the expiry calendar adds up each day and leads back to the batch in the list', async ({ page }) => {
    // This week's Monday, the same first day the page uses.
    const monday = new Date()
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
    const first = day(Math.round((monday.getTime() - Date.now()) / 86_400_000))
    const lastDate = new Date(monday)
    lastDate.setDate(lastDate.getDate() + 34)
    const last = day(Math.round((lastDate.getTime() - Date.now()) / 86_400_000))
    type Calendar = { total: string; days: { day: string; value: string; batches: { product: { name: string; barcode: string | null }; value: string }[] }[] }
    const calendar = await json<Calendar>(page, `/reports/expiry-calendar?date_from=${first}&date_to=${last}`)
    const [firstDay] = calendar.days
    const [batch] = firstDay.batches

    await page.goto('/inventory')
    await page.getByRole('tab', { name: 'Calendar' }).click()
    await expect(page).toHaveURL('/inventory?view=calendar')
    await expect(page.getByText(`${money(calendar.total)} expires in these 5 weeks`)).toBeVisible()

    const days = page.getByRole('list', { name: 'Expiry calendar' })
    await days.getByRole('button', { name: new RegExp(`: ${money(firstDay.value).replace('.', '\\.')},`) }).first().click()
    const panel = page.getByRole('dialog')
    await expect(panel).toContainText(batch.product.name)
    await expect(panel).toContainText(money(batch.value))

    await panel.getByRole('link', { name: 'Show in the list' }).first().click()
    await expect(page).toHaveURL(`/inventory?q=${encodeURIComponent(batch.product.barcode ?? batch.product.name)}`)
    await expect(page.getByRole('tab', { name: 'List' })).toHaveAttribute('aria-selected', 'true')
  })

  test('the evening theme is chosen in the account menu and stays after a reload', async ({ page }) => {
    const html = page.locator('html')
    await page.goto('/inventory')
    await expect(html).not.toHaveClass(/dark/)

    await page.getByRole('button', { name: /^Account:/ }).click()
    await page.getByRole('menuitemradio', { name: 'Dark, for the evening' }).click()
    await expect(html).toHaveClass(/dark/)
    await page.reload()
    await expect(html).toHaveClass(/dark/)

    await page.getByRole('button', { name: /^Account:/ }).click()
    await page.getByRole('menuitemradio', { name: 'Same as this computer' }).click()
    await expect(html).not.toHaveClass(/dark/)
  })
})

test.describe('dark computer', () => {
  test.use({ colorScheme: 'dark' })

  test('the evening theme follows a computer set to dark', async ({ page }) => {
    await page.goto('/login')
    await expect(page.locator('html')).toHaveClass(/dark/)
  })
})

test.describe('staff', () => {
  test('the till sees the floating New sale and a quick search without planning or money pages', async ({ page }) => {
    await logInAs(page, DEMO_STAFF)
    await expect(floating(page)).toBeVisible()

    await page.keyboard.press('ControlOrMeta+k')
    const search = page.getByRole('dialog', { name: 'Search everything' })
    await search.getByRole('combobox').fill('o')
    await expect(search.getByRole('option', { name: 'Products' })).toBeVisible()
    await expect(search.getByRole('option', { name: 'Forecast' })).toHaveCount(0)
    await expect(search.getByRole('option', { name: 'Your month' })).toHaveCount(0)
    await page.keyboard.press('Escape')

    await page.goto('/month')
    await expect(page.getByText("isn't part of your role")).toBeVisible()

    // The shelf's calendar is for whoever looks after the shelf.
    await page.goto('/inventory?view=calendar')
    await expect(page.getByRole('list', { name: 'Expiry calendar' })).toBeVisible()
  })
})
