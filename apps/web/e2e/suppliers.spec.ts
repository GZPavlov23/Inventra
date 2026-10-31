import { expect, type Page, test } from '@playwright/test'

import { logInAsDemoOwner } from './helpers.ts'

test.beforeEach(async ({ page }) => {
  await logInAsDemoOwner(page)
  await page.goto('/suppliers')
  await expect(page.getByRole('row').nth(1)).toBeVisible()
})

const dialog = (page: Page) => page.getByRole('dialog')
const row = (page: Page, name: string) => page.getByRole('row').filter({ hasText: name })

async function addSupplier(page: Page, name: string) {
  await page.getByRole('button', { name: 'Add supplier' }).click()
  await dialog(page).getByLabel('Company name').fill(name)
  await dialog(page).getByRole('button', { name: 'Add supplier' }).click()
}

test('the list shows demo suppliers with their products', async ({ page }) => {
  await expect(row(page, 'Зелена долина (демо)')).toContainText('orders@zelena-dolina.example')
  await expect(row(page, 'Зелена долина (демо)').getByRole('cell').nth(4)).toHaveText('3')
  await expect(row(page, 'Зелена долина (демо)').getByRole('link').first())
    .toHaveAttribute('href', 'tel:02 000 0001')
})

test('search finds suppliers by contact person and survives a reload', async ({ page }) => {
  await page.getByLabel('Search suppliers').fill('иван')
  await expect(page.locator('tbody tr')).toHaveCount(1)
  await page.reload()
  await expect(row(page, 'Пекарна Изгрев (демо)')).toBeVisible()
})

test('a new supplier appears in the list and can be edited', async ({ page }) => {
  await addSupplier(page, 'Е2Е Доставчик')
  await expect(page.getByText('Е2Е Доставчик was added')).toBeVisible()

  await row(page, 'Е2Е Доставчик').click()
  await dialog(page).getByLabel('Phone').fill('02 000 0099')
  await dialog(page).getByRole('button', { name: 'Save changes' }).click()
  await expect(row(page, 'Е2Е Доставчик')).toContainText('02 000 0099')
})

test('a taken name is shown next to the name field', async ({ page }) => {
  await addSupplier(page, 'ЗЕЛЕНА ДОЛИНА (ДЕМО)')
  await expect(dialog(page).getByRole('alert')).toContainText('already exists')
  await expect(dialog(page).getByLabel('Company name')).toHaveAttribute('aria-invalid', 'true')
})

test('a wrong phone number stays in the form with its own message', async ({ page }) => {
  await page.getByRole('button', { name: 'Add supplier' }).click()
  await dialog(page).getByLabel('Company name').fill('Е2Е Грешен телефон')
  await dialog(page).getByLabel('Phone').fill('call me')
  await dialog(page).getByRole('button', { name: 'Add supplier' }).click()
  await expect(dialog(page).getByLabel('Phone')).toHaveAttribute('aria-invalid', 'true')
  await expect(dialog(page)).toBeVisible()
})

test('a product can be linked to a supplier, and an archived one stays on it', async ({ page }) => {
  await addSupplier(page, 'Е2Е За архив')
  await expect(page.getByText('Е2Е За архив was added')).toBeVisible()

  await page.goto('/products')
  await page.getByRole('row').filter({ hasText: 'Бял хляб' }).click()
  await dialog(page).getByRole('combobox', { name: 'Supplier' }).click()
  await page.getByRole('option', { name: 'Е2Е За архив' }).click()
  await dialog(page).getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByText('was saved')).toBeVisible()

  await page.goto('/suppliers')
  await expect(row(page, 'Е2Е За архив').getByRole('cell').nth(4)).toHaveText('1')
  await page.getByRole('button', { name: 'Actions for Е2Е За архив' }).click()
  await page.getByRole('menuitem', { name: 'Archive' }).click()
  await expect(row(page, 'Е2Е За архив')).toHaveCount(0)

  await page.goto('/products')
  await page.getByRole('row').filter({ hasText: 'Бял хляб' }).click()
  await expect(dialog(page).getByRole('combobox', { name: 'Supplier' })).toHaveText('Е2Е За архив (archived)')
  await dialog(page).getByRole('combobox', { name: 'Supplier' }).click()
  await page.getByRole('option', { name: 'Пекарна Изгрев (демо)' }).click()
  await dialog(page).getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByText('was saved')).toBeVisible()
})

test('archiving can be undone from the toast', async ({ page }) => {
  await page.getByRole('button', { name: 'Actions for Плод и зеленчук (демо)' }).click()
  await page.getByRole('menuitem', { name: 'Archive' }).click()
  await expect(row(page, 'Плод и зеленчук (демо)')).toHaveCount(0)
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(row(page, 'Плод и зеленчук (демо)')).toBeVisible()
})
