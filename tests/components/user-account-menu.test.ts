import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

import UserAccountMenu from '../src/components/UserAccountMenu.vue'

globalThis.ResizeObserver = class ResizeObserverStub {
	observe(): void {}
	unobserve(): void {}
	disconnect(): void {}
} as typeof ResizeObserver

Object.defineProperty(globalThis, 'visualViewport', {
	configurable: true,
	value: {
		addEventListener: vi.fn(),
		dispatchEvent: vi.fn(() => true),
		height: 768,
		offsetLeft: 0,
		offsetTop: 0,
		onresize: null,
		onscroll: null,
		pageLeft: 0,
		pageTop: 0,
		removeEventListener: vi.fn(),
		scale: 1,
		width: 1024,
	} satisfies Partial<VisualViewport>,
})

let wrapper: VueWrapper | null = null

async function mountMenu(initialRoute = '/'): Promise<VueWrapper> {
	const router = createRouter({
		history: createMemoryHistory(),
		routes: [
			{ path: '/', component: { template: '<div>首頁</div>' } },
			{ path: '/account', component: { template: '<div>個人設定</div>' } },
		],
	})
	await router.push(initialRoute)
	await router.isReady()

	wrapper = mount(UserAccountMenu, {
		attachTo: document.body,
		props: {
			name: '王小明',
			department: '產品企劃部',
			email: 'employee@company.com',
			roleLabel: '系統管理員',
		},
		global: {
			plugins: [createVuetify({ components, directives }), router],
		},
	})

	return wrapper
}

async function openMenu(menuWrapper: VueWrapper): Promise<void> {
	await menuWrapper.get('[data-testid="user-menu-trigger"]').trigger('click')
	await nextTick()
}

async function pressKey(element: Element, key: string): Promise<void> {
	element.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key }))
	await nextTick()
}

afterEach(() => {
	wrapper?.unmount()
	wrapper = null
	document.body.innerHTML = ''
})

describe('UserAccountMenu', () => {
	it('should show the current user identity on the menu trigger', async () => {
		const menuWrapper = await mountMenu()
		const trigger = menuWrapper.get('[data-testid="user-menu-trigger"]')

		expect(trigger.text()).toContain('王小明')
		expect(trigger.attributes('aria-label')).toBe('王小明的使用者選單')
		expect(trigger.attributes('aria-haspopup')).toBe('menu')
	})

	it('should provide direct links to every existing account function when opened', async () => {
		const menuWrapper = await mountMenu()
		await openMenu(menuWrapper)

		expect(document.body.textContent).toContain('產品企劃部 · 系統管理員')
		expect(document.querySelector('.user-summary-email-sr')?.textContent).toBe('employee@company.com')

		for (const tab of ['profile', 'security', 'appearance', 'support', 'about']) {
			const link = document.querySelector(`[data-testid="user-menu-${tab}"]`)
			expect(link, `${tab} 應顯示在使用者選單`).toBeInstanceOf(HTMLAnchorElement)
			expect((link as HTMLAnchorElement).href).toContain(`/account?tab=${tab}`)
		}
	})

	it('should not show route-active backgrounds on account menu items', async () => {
		const menuWrapper = await mountMenu('/account?tab=profile')
		await openMenu(menuWrapper)

		expect(document.querySelectorAll('.user-account-menu .v-list-item--active')).toHaveLength(0)
	})

	it('should emit logout when the logout action is selected', async () => {
		const menuWrapper = await mountMenu()
		await openMenu(menuWrapper)

		const logout = document.querySelector('[data-testid="user-menu-logout"]')
		expect(logout).toBeInstanceOf(HTMLElement)
		;(logout as HTMLElement).click()
		await nextTick()

		expect(menuWrapper.emitted('logout')).toHaveLength(1)
	})

	it('should keep every action in one keyboard list and return focus after Escape', async () => {
		const menuWrapper = await mountMenu()
		const trigger = menuWrapper.get('[data-testid="user-menu-trigger"]')
		await openMenu(menuWrapper)

		const support = document.querySelector('[data-testid="user-menu-support"]')
		const lists = document.querySelectorAll('.user-account-menu .v-list')
		const actions = Array.from(lists[0]?.querySelectorAll('[data-testid]') ?? []).map((element) => element.getAttribute('data-testid'))

		expect(lists).toHaveLength(1)
		expect(support?.previousElementSibling?.getAttribute('data-testid')).toBe('user-menu-appearance')
		expect(actions).toEqual([
			'user-menu-profile',
			'user-menu-security',
			'user-menu-appearance',
			'user-menu-support',
			'user-menu-about',
			'user-menu-logout',
		])
		expect(support).toBeInstanceOf(HTMLAnchorElement)

		;(support as HTMLAnchorElement).focus()
		await pressKey(support as HTMLAnchorElement, 'Escape')
		expect(trigger.attributes('aria-expanded')).toBe('false')
		expect(document.activeElement).toBe(trigger.element)
	})
})
