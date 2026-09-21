import { expect, test } from '@playwright/test'

import { signIn } from './support/session'

test.describe('AI 問答', () => {
	// @ 回答含模擬的檢索階段與逐字輸出，比預設 30 秒寬鬆
	test('should answer a question with citations and keep it in the conversation', async ({ page }) => {
		test.setTimeout(90_000)
		await signIn(page)
		await page.goto('#/ask')

		const composer = page.getByLabel('輸入你的問題')
		await composer.fill('住宿費用上限是多少？')
		await page.getByRole('button', { name: '送出問題' }).click()

		// @ 送出後輸入框會清空，改以回答內容判斷這一輪是否結束
		await expect(page.getByText('住宿費用上限是多少？').first()).toBeVisible()
		const citationToggle = page.getByRole('button', { name: /引用來源/ })
		await expect(citationToggle).toBeVisible({ timeout: 60_000 })
		await expect(composer).toHaveValue('')

		// @ 引用清單預設收合，展開後才看得到逐筆引用
		await citationToggle.click()
		await expect(page.getByTestId('citation-entry-1')).toBeVisible()
	})

	test('should limit the answer to the chosen knowledge source', async ({ page }) => {
		await signIn(page)
		await page.goto('#/ask')

		await page.locator('#knowledge-source-trigger').click()
		const dialog = page.getByRole('dialog')
		await expect(dialog.getByRole('heading', { name: '知識來源' })).toBeVisible()

		await dialog.getByTestId('knowledge-source-information-security').click()
		await dialog.getByTestId('confirm-document-scope').click()

		await expect(page.locator('#knowledge-source-trigger')).toContainText('資訊安全')
	})
})
