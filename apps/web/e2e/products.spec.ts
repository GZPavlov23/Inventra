import { expect, type Page, test } from '@playwright/test'

import { logInAsDemoOwner } from './helpers.ts'

test.beforeEach(async ({ page }) => {
  await logInAsDemoOwner(page)
  await page.goto('/products')
  await expect(page.getByRole('row').nth(1)).toBeVisible()
})

const dialog = (page: Page) => page.getByRole('dialog')
const row = (page: Page, name: string) => page.getByRole('row').filter({ hasText: name })

// The text of one column for every visible row (columns are counted from 0).
const column = (page: Page, index: number) =>
  page.locator('tbody tr').locator(`td:nth-child(${index + 1})`).allInnerTexts()

const prices = async (page: Page) =>
  (await column(page, 5)).map((text) => Number(text.replace(/[^\d.]/g, '')))

async function addProduct(page: Page, name: string, barcode = '') {
  await page.getByRole('button', { name: 'Add product' }).click()
  await dialog(page).getByLabel('Name').fill(name)
  await dialog(page).getByLabel('Barcode').fill(barcode)
  await dialog(page).getByLabel('Purchase price').fill('1.00')
  await dialog(page).getByLabel('Sale price').fill('2.00')
  await dialog(page).getByRole('button', { name: 'Add product' }).click()
}

test('the list shows real products in Bulgarian alphabetical order', async ({ page }) => {
  await expect(row(page, 'Прясно мляко 3% 1 л')).toContainText('30.8%')
  await expect(row(page, 'Банани')).toContainText('kg')

  const names = (await column(page, 0)).map((text) => text.split('\n')[0])
  expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'bg')))
})

test('search filters the list and survives a reload', async ({ page }) => {
  await page.getByLabel('Search products').fill('МЛЯКО')
  await expect(page).toHaveURL(/q=/)
  await expect(page.locator('tbody tr')).toHaveCount(2)

  await page.reload()
  await expect(page.locator('tbody tr')).toHaveCount(2)
  await expect(page.getByLabel('Search products')).toHaveValue('МЛЯКО')

  await page.getByLabel('Search products').fill('няма такъв продукт')
  await expect(page.getByText('No products found')).toBeVisible()
})

test('columns sort the whole list in both directions', async ({ page }) => {
  await page.getByRole('button', { name: 'Sale price' }).click()
  await expect(page).toHaveURL(/sort=sale_price/)
  await expect(page.getByRole('columnheader', { name: 'Sale price' })).toHaveAttribute('aria-sort', 'ascending')
  await expect.poll(() => prices(page).then((list) => list[0])).toBe(Math.min(...(await prices(page))))
  const ascending = await prices(page)
  expect(ascending).toEqual([...ascending].sort((a, b) => a - b))

  await page.getByRole('button', { name: 'Sale price' }).click()
  await expect(page).toHaveURL(/order=desc/)
  await expect(page.getByRole('columnheader', { name: 'Sale price' })).toHaveAttribute('aria-sort', 'descending')
  // Compared by order, not with the list above: with many products it is a different page.
  await expect.poll(async () => {
    const descending = await prices(page)
    return descending[0] >= ascending[ascending.length - 1]
      && descending.every((price, index) => index === 0 || price <= descending[index - 1])
  }).toBe(true)
})

test('adding a product: validation errors, then it appears in the table', async ({ page }) => {
  await page.getByRole('button', { name: 'Add product' }).click()
  await expect(dialog(page).getByLabel('Name')).toBeFocused()

  await dialog(page).getByLabel('Name').fill('Е2Е Айрян')
  await dialog(page).getByLabel('Purchase price').fill('0.60')
  await dialog(page).getByLabel('Sale price').fill('0.95')
  await expect(dialog(page).getByText('Margin:')).toContainText('36.8%')

  await dialog(page).getByLabel('Barcode').fill('2000000000016')
  await dialog(page).getByRole('button', { name: 'Add product' }).click()
  await expect(dialog(page).getByText('Barcode must be a valid')).toBeVisible()

  await dialog(page).getByLabel('Barcode').fill('2000000000015')
  await dialog(page).getByRole('button', { name: 'Add product' }).click()
  await expect(dialog(page).getByText(/already used by/)).toBeVisible()

  await dialog(page).getByLabel('Barcode').fill('')
  await dialog(page).getByRole('button', { name: 'Add product' }).click()
  await expect(dialog(page)).toBeHidden()
  await expect(page.getByText('Е2Е Айрян was added')).toBeVisible()
  await expect(row(page, 'Е2Е Айрян')).toContainText('36.8%')
})

test('the category menu reuses existing categories and adds new ones', async ({ page }) => {
  await page.getByRole('button', { name: 'Add product' }).click()
  await dialog(page).getByLabel('Name').fill('Е2Е Грах')
  await dialog(page).getByLabel('Purchase price').fill('1')
  await dialog(page).getByLabel('Sale price').fill('2')

  // A partial name offers the existing category first, so Enter can't create a near-duplicate.
  await page.getByRole('combobox', { name: 'Category' }).click()
  await page.getByPlaceholder('Search or add a category').fill('млеч')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('combobox', { name: 'Category' })).toHaveText('Млечни')

  await page.getByRole('combobox', { name: 'Category' }).click()
  await page.getByPlaceholder('Search or add a category').fill('Е2Е   Замразени')
  await page.getByRole('option', { name: 'Add “Е2Е Замразени”' }).click()
  await expect(page.getByRole('combobox', { name: 'Category' })).toHaveText('Е2Е Замразени')

  // Escape closes only the menu.
  await page.getByRole('combobox', { name: 'Category' }).click()
  await page.keyboard.press('Escape')
  await expect(dialog(page)).toBeVisible()

  await dialog(page).getByRole('button', { name: 'Add product' }).click()
  await expect(row(page, 'Е2Е Грах')).toContainText('Е2Е Замразени')
})

test('editing a product changes it, and Cancel changes nothing', async ({ page }) => {
  await addProduct(page, 'Е2Е Редакция')
  await expect(row(page, 'Е2Е Редакция')).toBeVisible()

  await row(page, 'Е2Е Редакция').getByRole('cell').nth(2).click()
  await expect(dialog(page).getByRole('heading', { name: 'Edit product' })).toBeVisible()
  await expect(dialog(page).getByLabel('Name')).toHaveValue('Е2Е Редакция')
  await expect(dialog(page).getByRole('button', { name: 'Save changes' })).toBeDisabled()

  await dialog(page).getByLabel('Name').fill('Е2Е Не се записва')
  await dialog(page).getByRole('button', { name: 'Cancel' }).click()
  await expect(row(page, 'Е2Е Редакция')).toBeVisible()
  await expect(row(page, 'Е2Е Не се записва')).toHaveCount(0)

  await page.getByRole('button', { name: 'Е2Е Редакция', exact: true }).click()
  await dialog(page).getByLabel('Name').fill('Е2Е Променен')
  await dialog(page).getByLabel('Sale price').fill('2.50')
  await dialog(page).getByRole('button', { name: 'Save changes' }).click()
  await expect(dialog(page)).toBeHidden()
  await expect(page.getByText('Е2Е Променен was saved')).toBeVisible()
  await expect(row(page, 'Е2Е Променен')).toContainText('60.0%')
})

test('archiving hides a product, Undo and Restore bring it back', async ({ page }) => {
  await addProduct(page, 'Е2Е Архив')
  const name = 'Е2Е Архив'
  await expect(row(page, name)).toBeVisible()

  // Opening the menu must not also open the edit form behind it.
  await page.getByRole('button', { name: `Actions for ${name}` }).click()
  await expect(dialog(page)).toBeHidden()

  await page.getByRole('menuitem', { name: 'Archive' }).click()
  await expect(row(page, name)).toHaveCount(0)
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(row(page, name)).toBeVisible()

  await page.getByRole('button', { name: `Actions for ${name}` }).click()
  await page.getByRole('menuitem', { name: 'Archive' }).click()
  await expect(row(page, name)).toHaveCount(0)

  await page.getByRole('tab', { name: 'Archived' }).click()
  await expect(row(page, name)).toContainText('Archived')
  await page.getByRole('button', { name: `Actions for ${name}` }).click()
  await page.getByRole('menuitem', { name: 'Restore' }).click()
  await expect(page.getByText(`${name} was restored`)).toBeVisible()

  await page.getByRole('tab', { name: 'Active' }).click()
  await expect(row(page, name)).toBeVisible()
})

test('the page stays usable after the menu opened a dialog', async ({ page }) => {
  const first = page.getByRole('button', { name: /^Actions for/ }).first()
  await first.click()
  await page.getByRole('menuitem', { name: 'Edit' }).click()
  await expect(dialog(page)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog(page)).toBeHidden()

  await page.getByLabel('Search products').fill('Банани')
  await expect(page.locator('tbody tr')).toHaveCount(1)
})
