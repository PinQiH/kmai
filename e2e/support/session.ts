import { expect, type Page } from '@playwright/test'

/**
 * 以展示帳號登入並停在首頁。
 * @param page Playwright 頁面。
 */
export async function signIn(page: Page): Promise<void> {
	await page.goto('#/login')
	await page.getByTestId('login-submit').click()
	await expect(page).toHaveURL(/#\/$/)
}
