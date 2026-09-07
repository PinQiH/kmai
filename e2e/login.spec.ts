import { expect, test } from '@playwright/test'

test.describe('登入流程', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('#/login')
	})

	test('should disable login when the password has fewer than eight characters', async ({ page }) => {
		await page.getByTestId('login-password').locator('input').fill('short')

		await expect(page.getByTestId('login-submit')).toBeDisabled()
	})

	test('should open the home page when the default demo account logs in', async ({ page }) => {
		await page.getByTestId('login-submit').click()

		await expect(page).toHaveURL(/#\/$/)
		await expect(page.getByRole('heading', { name: '今天想找什麼？' })).toBeVisible()
	})
})
