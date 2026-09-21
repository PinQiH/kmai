import { expect, test } from '@playwright/test'

import { signIn } from './support/session'

test.describe('新增文件', () => {
	test('should walk a text document through the three upload steps', async ({ page }) => {
		await signIn(page)
		await page.goto('#/admin/documents/upload')

		// > 步驟一：文件來源
		await page.getByRole('button', { name: '輸入文字' }).click()
		await page.getByLabel('文件文字內容').fill('E2E 測試用的文件內容，說明差旅申請流程。')
		const next = page.getByTestId('upload-next')
		await expect(next).toBeEnabled()
		await next.click()

		// > 步驟二：文件資訊（標題、大類別、版本說明為必填）
		await page.getByLabel('文件標題').fill('E2E 測試文件')
		await page.getByTestId('main-category').locator('input').fill('人資')
		await page.getByTestId('initial-version-note').locator('textarea').first().fill('初次建立，供 E2E 驗證。')
		await expect(next).toBeEnabled()
		await next.click()

		// > 步驟三：確認送出
		await expect(page.getByText('E2E 測試文件')).toBeVisible()
		await next.click()

		await expect(page.getByText('文件已加入處理佇列')).toBeVisible({ timeout: 30_000 })
		await expect(page.getByRole('link', { name: '查看處理進度' })).toBeVisible()
	})

	test('should block the next step until a source is provided', async ({ page }) => {
		await signIn(page)
		await page.goto('#/admin/documents/upload')

		await expect(page.getByTestId('upload-next')).toBeDisabled()
	})
})
