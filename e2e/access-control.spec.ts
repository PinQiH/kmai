import { expect, test } from '@playwright/test'

import { signIn } from './support/session'

// @ 展示環境預設為已登入狀態，測未登入行為要先從介面登出

test.describe('權限導向', () => {
	test('should send a signed-out visitor to login and back to the requested page', async ({ page }) => {
		await page.goto('#/')
		await page.getByTestId('user-menu-trigger').click()
		await page.getByTestId('user-menu-logout').click()
		await expect(page).toHaveURL(/#\/login/)

		await page.goto('#/admin/documents')

		await expect(page).toHaveURL(/#\/login\?redirect=/)

		await page.getByTestId('login-submit').click()

		await expect(page).toHaveURL(/#\/admin\/documents/)
	})

	test('should show the not-found page for an unknown address', async ({ page }) => {
		await signIn(page)

		await page.goto('#/this-page-does-not-exist')

		await expect(page.getByText('找不到這個頁面')).toBeVisible()
		await expect(page.getByText('網址「/this-page-does-not-exist」不存在')).toBeVisible()

		await page.getByRole('button', { name: '回到首頁' }).click()

		await expect(page).toHaveURL(/#\/$/)
	})
})
