import { afterEach, describe, expect, it } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

import { useAppStore } from '../src/stores/app'
import { darkTheme, lightTheme, redDarkTheme, redLightTheme } from '../src/theme'
import AccountView from '../src/views/AccountView.vue'

globalThis.ResizeObserver = class ResizeObserverStub {
	observe(): void {}
	unobserve(): void {}
	disconnect(): void {}
} as typeof ResizeObserver

let wrapper: VueWrapper | null = null

async function mountAccountView(initialRoute = '/account'): Promise<VueWrapper> {
	const pinia = createPinia()
	setActivePinia(pinia)
	const router = createRouter({
		history: createMemoryHistory(),
		routes: [{ path: '/account', component: AccountView }],
	})
	await router.push(initialRoute)
	await router.isReady()

	wrapper = mount(AccountView, {
		global: {
			plugins: [
				pinia,
				createVuetify({
					components,
					directives,
					theme: {
						defaultTheme: 'kmaiLight',
						themes: {
							kmaiLight: lightTheme,
							kmaiDark: darkTheme,
							kmaiRedLight: redLightTheme,
							kmaiRedDark: redDarkTheme,
						},
					},
				}),
				router,
			],
		},
	})

	return wrapper
}

afterEach(() => {
	wrapper?.unmount()
	wrapper = null
	document.body.innerHTML = ''
})

describe('AccountView', () => {
	it('should show account, display name, and Email in the basic profile section', async () => {
		const accountView = await mountAccountView()
		const fields = accountView.findAll('[data-testid^="profile-"]')

		expect(fields.map((field) => field.attributes('data-testid'))).toEqual([
			'profile-account',
			'profile-display-name',
			'profile-email',
		])
		expect(accountView.get('[data-testid="profile-account"] input').element).toHaveProperty('readOnly', true)
		expect(accountView.get('[data-testid="profile-account"] input').element).toHaveProperty('value', 'employee')
		expect(accountView.get('[data-testid="profile-display-name"] input').element).toHaveProperty('value', '王小明')
		expect(accountView.get('[data-testid="profile-email"] input').element).toHaveProperty('value', 'employee@company.com')
	})

	it('should place password and security before appearance settings', async () => {
		const accountView = await mountAccountView()
		const tabs = accountView.findAll('[data-testid^="account-tab-"]')

		expect(tabs.map((tab) => tab.attributes('data-testid'))).toEqual([
			'account-tab-profile',
			'account-tab-security',
			'account-tab-appearance',
			'account-tab-support',
			'account-tab-about',
		])
	})

	it('should offer browser, light, and dark appearance modes', async () => {
		const accountView = await mountAccountView('/account?tab=appearance')
		const appStore = useAppStore()
		const modes = accountView.findAll('[data-testid^="appearance-mode-"]')

		expect(modes.map((mode) => mode.attributes('data-testid'))).toEqual([
			'appearance-mode-system',
			'appearance-mode-light',
			'appearance-mode-dark',
		])
		expect(accountView.get('[data-testid="appearance-mode-system"] input').element).toHaveProperty('checked', true)

		await accountView.get('[data-testid="appearance-mode-dark"] input').setValue(true)

		expect(appStore.themePreference).toBe('dark')
		expect(appStore.themeMode).toBe('dark')
	})

	it('should explain and enforce the local password format rules', async () => {
		const accountView = await mountAccountView('/account?tab=security')
		const requirements = accountView.get('[data-testid="new-password-requirements"]')

		expect(requirements.text()).toContain('密碼須為 8～20 碼，並包含英文大寫、英文小寫、數字及半形符號。')
		expect(requirements.text()).toContain('僅可使用半形英數與符號，不可包含空白。')
		expect(requirements.text()).toContain('系統會檢查新密碼不得與前三次使用的密碼相同。')
		expect(accountView.get('[data-testid="new-password"] input').attributes('aria-describedby')).toContain('new-password-requirements')

		await accountView.get('[data-testid="current-password"] input').setValue('Current1!')
		for (const invalidPassword of [
			'Short1!',
			'Password1234567890!AB',
			'PASSWORD1!',
			'password1!',
			'Password!',
			'Password1',
			'Password 1!',
			'Password1中',
		]) {
			await accountView.get('[data-testid="new-password"] input').setValue(invalidPassword)
			await accountView.get('[data-testid="confirmed-password"] input').setValue(invalidPassword)
			await accountView.get('[data-testid="password-form"]').trigger('submit')

			expect(accountView.get('[data-testid="new-password"] input').element).toHaveProperty('value', invalidPassword)
			expect(accountView.text()).toContain('請輸入 8～20 碼的半形字元，並包含英文大寫、英文小寫、數字及符號（不可有空白）')
			expect(accountView.text()).not.toContain('密碼格式已通過')
		}

		await accountView.get('[data-testid="new-password"] input').setValue('Passw1!a')
		await accountView.get('[data-testid="confirmed-password"] input').setValue('Passw1!a')
		await accountView.get('[data-testid="password-form"]').trigger('submit')

		expect(accountView.get('[data-testid="new-password"] input').element).toHaveProperty('value', '')
		expect(accountView.text()).toContain('密碼格式已通過；正式更新時，系統會再確認未與前三次密碼重複。')

		await accountView.get('[data-testid="current-password"] input').setValue('Current1!')
		await accountView.get('[data-testid="new-password"] input').setValue('Password1234567890!A')
		await accountView.get('[data-testid="confirmed-password"] input').setValue('Password1234567890!A')
		await accountView.get('[data-testid="password-form"]').trigger('submit')

		expect(accountView.get('[data-testid="new-password"] input').element).toHaveProperty('value', '')

		await accountView.get('[data-testid="current-password"] input').setValue('Current1!')
		await accountView.get('[data-testid="new-password"] input').setValue('password1!')
		await accountView.get('[data-testid="confirmed-password"] input').setValue('password1!')
		await accountView.get('[data-testid="password-form"]').trigger('submit')

		expect(accountView.text()).toContain('請輸入 8～20 碼的半形字元，並包含英文大寫、英文小寫、數字及符號（不可有空白）')
		expect(accountView.text()).not.toContain('密碼格式已通過')
	})

	it('should list the latest version first without release status labels', async () => {
		const accountView = await mountAccountView('/account?tab=about')
		const versionHeadings = accountView.findAll('.version-entry h3')
		const versionMarkers = accountView.findAll('[data-testid="version-marker"]')

		expect(versionHeadings.map((heading) => heading.text())).toEqual([
			'第 0.2.0 版',
			'第 0.1.0 版',
			'第 0.0.5 版',
		])
		expect(versionMarkers).toHaveLength(3)
		expect(versionMarkers[0].classes()).toContain('timeline-marker--current')
		expect(versionMarkers[1].classes()).not.toContain('timeline-marker--current')
		expect(versionMarkers[2].classes()).not.toContain('timeline-marker--current')
		expect(accountView.findAll('[data-testid="version-status"]')).toHaveLength(0)
		expect(accountView.text()).not.toContain('即將推出')
		expect(accountView.text()).not.toContain('已封存')
		expect(accountView.text()).not.toContain('目前版本')
	})
})
