import { expect, type Page, test } from '@playwright/test'

import { logInAsDemoOwner } from './helpers.ts'

const API = '/api/v1'

test.beforeEach(async ({ page }) => {
  await logInAsDemoOwner(page)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Dashboard', level: 2 })).toBeVisible()
})

const tile = (page: Page, label: string) => page.getByRole('group', { name: label })
const attention = (page: Page) => page.getByRole('list', { name: 'Batches that need attention' })

function day(offset: number): string {
  const moment = new Date()
  moment.setDate(moment.getDate() + offset)
  const month = String(moment.getMonth() + 1).padStart(2, '0')
  const date = String(moment.getDate()).padStart(2, '0')
  return `${moment.getFullYear()}-${month}-${date}`
}

const money = (amount: string | number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR' }).format(Number(amount))

async function json<T>(page: Page, path: string): Promise<T> {
  return (await (await page.request.get(`${API}${path}`)).json()) as T
}

type Summary = { sales: number; revenue: string; profit: string }
type Stock = { stock_value: string; expired_value: string; expired_batches: number; expiring_batches: number }
type Day = { day: string; sales: number; revenue: string; profit: string }

test('the tiles show the same numbers as the API', async ({ page }) => {
  const stock = await json<Stock>(page, '/batches/summary')
  const todaySales = await json<Summary>(page, `/sales/summary?date_from=${day(0)}&date_to=${day(0)}`)

  await expect(tile(page, 'Revenue today')).toContainText(money(todaySales.revenue))
  await expect(tile(page, 'Stock value')).toContainText(money(stock.stock_value))
  await expect(tile(page, 'Expired stock')).toContainText(money(stock.expired_value))
  await expect(tile(page, 'Expired stock')).toContainText(`${stock.expired_batches} batch`)
  await expect(tile(page, 'Expiring soon')).toContainText(String(stock.expiring_batches))
})

test('the chart covers 30 days, and the table shows the same numbers', async ({ page }) => {
  const month = await json<Summary>(page, `/sales/summary?date_from=${day(-29)}&date_to=${day(0)}`)
  const days = await json<Day[]>(page, `/sales/daily?date_from=${day(-29)}&date_to=${day(0)}`)
  expect(days).toHaveLength(30)

  await expect(page.getByText(`Last 30 days: ${money(month.revenue)} revenue, ${money(month.profit)} profit`)).toBeVisible()
  await expect(page.getByRole('list', { name: 'Legend' })).toContainText('Revenue')
  await expect(page.getByRole('list', { name: 'Legend' })).toContainText('Profit')
  // Two lines for the finished days, and two dashed ones for today, which isn't over yet.
  await expect(page.locator('.recharts-line-curve')).toHaveCount(4)
  await expect(page.locator('.recharts-line-curve[stroke-dasharray]')).toHaveCount(2)
  await expect(page.getByRole('list', { name: 'Legend' })).toContainText('today so far')

  await page.getByRole('button', { name: 'Show as a table' }).click()
  const rows = page.locator('tbody tr')
  await expect(rows).toHaveCount(30)
  // Newest first, so yesterday is the second row.
  await expect(rows.nth(1)).toContainText(money(days[28].revenue))
  await expect(rows.nth(1)).toContainText(money(days[28].profit))

  await page.getByRole('button', { name: 'Hide the table' }).click()
  await expect(rows).toHaveCount(0)
})

test('hovering the chart shows every series of that day', async ({ page }) => {
  const days = await json<Day[]>(page, `/sales/daily?date_from=${day(-29)}&date_to=${day(0)}`)
  const chart = page.locator('.recharts-surface').first()
  await chart.scrollIntoViewIfNeeded()
  const box = await chart.boundingBox()
  if (!box) throw new Error('The chart is not on the page')

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  const tooltip = page.locator('.recharts-tooltip-wrapper')
  await expect(tooltip).toContainText('Revenue')
  await expect(tooltip).toContainText('Profit')
  const text = await tooltip.innerText()
  expect(days.some((row) => text.includes(money(row.revenue)) && text.includes(money(row.profit)))).toBe(true)
})

test('needs attention lists expired goods first and leads to the batch', async ({ page }) => {
  await expect(attention(page).getByRole('listitem').first()).toContainText('Пилешко филе')
  await expect(attention(page).getByRole('listitem').first()).toContainText('Expired yesterday')
  await expect(attention(page)).toContainText('Expires tomorrow')

  await attention(page).getByRole('link', { name: /Пилешко филе/ }).click()
  await expect(page).toHaveURL(/\/inventory\?q=/)
  await expect(page.locator('tbody tr')).toHaveCount(1)
})

test('a new sale shows on the dashboard right away', async ({ page }) => {
  const before = await json<Summary>(page, `/sales/summary?date_from=${day(0)}&date_to=${day(0)}`)
  await expect(tile(page, 'Revenue today')).toContainText(money(before.revenue))

  await page.getByRole('link', { name: 'Sales', exact: true }).click()
  await page.getByRole('button', { name: 'New sale' }).first().click()
  await page.getByRole('dialog').getByRole('combobox').click()
  await page.getByPlaceholder('Search by name or barcode').fill('Минерална вода')
  await page.getByRole('option', { name: 'Минерална вода' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Record sale' }).click()
  await expect(page.getByText('Sale of €0.65 recorded')).toBeVisible()

  await page.getByRole('link', { name: 'Dashboard', exact: true }).click()
  await expect(tile(page, 'Revenue today')).toContainText(money(Number(before.revenue) + 0.65))
  await expect(tile(page, 'Revenue today')).toContainText(`${before.sales + 1} sale`)
})

test('the last 7 days are compared with the 7 days before', async ({ page }) => {
  const week = await json<Summary>(page, `/sales/summary?date_from=${day(-7)}&date_to=${day(-1)}`)
  const before = await json<Summary>(page, `/sales/summary?date_from=${day(-14)}&date_to=${day(-8)}`)
  const change = ((Number(week.revenue) - Number(before.revenue)) / Number(before.revenue)) * 100
  const sign = change > 0 ? '+' : ''

  await expect(tile(page, 'Revenue, last 7 days')).toContainText(money(week.revenue))
  await expect(tile(page, 'Revenue, last 7 days')).toContainText(`${sign}${change.toFixed(1)}% vs the 7 days before`)
})

test('waste is the first report, with its value per reason', async ({ page }) => {
  type Waste = { total: string; reasons: { reason: string; value: string }[] }
  const waste = await json<Waste>(page, `/reports/waste?date_from=${day(-29)}&date_to=${day(0)}`)

  await expect(page.getByRole('tab', { name: 'Waste' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('region', { name: 'Reports' })).toContainText(money(waste.total))
  const rows = page.getByRole('list', { name: 'Written off goods by reason' }).getByRole('listitem')
  await expect(rows).toHaveCount(waste.reasons.length)
  await expect(rows.first()).toContainText('Expired')
  await expect(rows.first()).toContainText(money(waste.reasons[0].value))
})

test('the reports switch, and the choice survives a reload', async ({ page }) => {
  type Top = { product: { name: string }; profit: string }
  type Category = { category: string; revenue: string }
  const top = await json<Top[]>(page, `/reports/top-products?date_from=${day(-29)}&date_to=${day(0)}`)
  const categories = await json<Category[]>(page, `/reports/categories?date_from=${day(-29)}&date_to=${day(0)}`)

  await page.getByRole('tab', { name: 'Top products' }).click()
  await expect(page).toHaveURL(/report=top-products/)
  const topRows = page.getByRole('list', { name: 'Most profitable products' }).getByRole('listitem')
  await expect(topRows).toHaveCount(5)
  await expect(topRows.first()).toContainText(top[0].product.name)
  await expect(topRows.first()).toContainText(money(top[0].profit))
  await expect(page.getByRole('list', { name: 'Written off goods by reason' })).toHaveCount(0)

  await page.reload()
  await expect(page.getByRole('tab', { name: 'Top products' })).toHaveAttribute('aria-selected', 'true')
  await expect(topRows).toHaveCount(5)

  await page.getByRole('tab', { name: 'Categories' }).click()
  const categoryRows = page.getByRole('list', { name: 'Revenue by category' }).getByRole('listitem')
  await expect(categoryRows.first()).toContainText(categories[0].category)
  await expect(categoryRows.first()).toContainText(money(categories[0].revenue))
  await expect(categoryRows.first()).toContainText('%')

  await page.getByRole('tab', { name: 'Waste' }).click()
  await expect(page).not.toHaveURL(/report=/)
})

test('running out shows how long the stock lasts and leads to the batches', async ({ page }) => {
  type Running = { product: { name: string }; days_left: string }
  const running = await json<Running[]>(page, '/reports/running-out')
  expect(running.length).toBeGreaterThan(0)

  await page.getByRole('tab', { name: 'Running out' }).click()
  const rows = page.getByRole('list', { name: 'Products running out' }).getByRole('listitem')
  await expect(rows.first()).toContainText(running[0].product.name)
  await expect(page.getByRole('region', { name: 'Reports' })).toContainText('not a forecast')

  await rows.first().getByRole('link').click()
  await expect(page).toHaveURL(/\/inventory\?q=/)
})

test('switching reports is instant: the server is not asked again', async ({ page }) => {
  await expect(page.getByRole('list', { name: 'Written off goods by reason' })).toBeVisible()
  const asked: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('/reports/')) asked.push(request.url())
  })

  await page.getByRole('tab', { name: 'Top products' }).click()
  await expect(page.getByRole('list', { name: 'Most profitable products' })).toBeVisible()
  await page.getByRole('tab', { name: 'Categories' }).click()
  await expect(page.getByRole('list', { name: 'Revenue by category' })).toBeVisible()

  expect(asked).toEqual([])
})

// Records the height of the report on every painted frame while a tab is being opened.
async function heightsWhileSwitching(page: Page, tab: string): Promise<number[]> {
  await page.evaluate(() => {
    const box = document.querySelector('[data-testid="report-box"]') as HTMLElement
    const heights: number[] = []
    const record = () => {
      heights.push(Math.round(box.getBoundingClientRect().height))
      if (heights.length < 40) requestAnimationFrame(record)
    }
    Object.assign(window, { reportHeights: heights })
    requestAnimationFrame(record)
  })
  await page.getByRole('tab', { name: tab }).click()
  await page.waitForTimeout(700)
  return page.evaluate(() => (window as unknown as { reportHeights: number[] }).reportHeights)
}

test('the report changes height smoothly and ends at its natural size', async ({ page }) => {
  await expect(page.getByRole('list', { name: 'Products running out' })).toBeHidden()
  await expect(page.getByRole('list', { name: 'Written off goods by reason' })).toBeVisible()

  const heights = await heightsWhileSwitching(page, 'Running out')
  const first = heights[0]
  const last = heights[heights.length - 1]
  expect(last).not.toBe(first)

  // More than the start and the end: it went through sizes in between, only in one direction.
  expect(new Set(heights).size).toBeGreaterThan(3)
  expect(heights).toEqual([...heights].sort((a, b) => (last > first ? a - b : b - a)))

  // Afterwards nothing is left behind, so the card still follows its content.
  await expect(page.getByTestId('report-box')).not.toHaveAttribute('style', /height/)
})

test('with reduced motion the report just changes', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.reload()
  await expect(page.getByRole('list', { name: 'Written off goods by reason' })).toBeVisible()

  const heights = await heightsWhileSwitching(page, 'Running out')
  expect(new Set(heights).size).toBe(2)
})

test('a scrolled page stays still when a shorter report opens', async ({ page }) => {
  await page.getByRole('tab', { name: 'Running out' }).click()
  await expect(page.getByRole('list', { name: 'Products running out' })).toBeVisible()
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  await page.waitForTimeout(100)

  await page.getByRole('tab', { name: 'Waste' }).click()
  await expect(page.getByRole('list', { name: 'Written off goods by reason' })).toBeVisible()
  await page.waitForTimeout(400)

  // The report's tabs are where they can be clicked again: the page ended at its real bottom.
  await expect(page.getByRole('tab', { name: 'Running out' })).toBeInViewport()
})
