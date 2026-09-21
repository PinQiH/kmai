import { expect, test } from '@playwright/test'

import { signIn } from './support/session'

test.describe('使用者與存取', () => {
	test('should create a local account and show the one-time credential once', async ({ page }) => {
		await signIn(page)
		await page.goto('#/admin/access')

		const account = `e2e${Date.now().toString().slice(-6)}`
		await page.getByTestId('access-create').click()

		const dialog = page.getByRole('dialog').filter({ hasText: '新增本機帳號' })
		await dialog.getByLabel('帳號').fill(account)
		await dialog.getByLabel('顯示名稱').fill('E2E 測試顧問')
		await dialog.getByLabel('Email', { exact: true }).fill(`${account}@example.com`)
		await page.getByTestId('user-save').click()

		const credential = page.getByTestId('credential')
		await expect(credential).toBeVisible()
		await expect(credential).toContainText(account)

		await page.getByRole('button', { name: '我已記下，關閉' }).click()
		await expect(credential).toBeHidden()

		// @ 建立後的帳號會出現在清單，可用搜尋找到
		// @ Vuetify 會渲染兩個 label 節點，這裡直接定位篩選列的輸入框
		await page.locator('.filters .v-text-field input').first().fill(account)
		await expect(page.getByText('E2E 測試顧問')).toBeVisible()
	})

	test('should keep the editor open when the new account is incomplete', async ({ page }) => {
		await signIn(page)
		await page.goto('#/admin/access')

		await page.getByTestId('access-create').click()
		await page.getByTestId('user-save').click()

		await expect(page.getByRole('dialog').filter({ hasText: '新增本機帳號' })).toBeVisible()
	})
})
