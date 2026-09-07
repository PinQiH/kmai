import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, nextTick } from 'vue'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useAppStore } from '@/stores/app'
import ChangePasswordView from '@/views/ChangePasswordView.vue'
import LoginView from '@/views/LoginView.vue'

globalThis.ResizeObserver = class ResizeObserverStub {
	observe(): void {}
	unobserve(): void {}
	disconnect(): void {}
} as typeof ResizeObserver

let wrapper: VueWrapper | null = null

function createTestRouter(): Router {
	return createRouter({
		history: createMemoryHistory(),
		routes: [
			{ path: '/', name: 'home', component: defineComponent({ template: '<main>home</main>' }) },
			{ path: '/target', name: 'target', component: defineComponent({ template: '<main>target</main>' }) },
			{ path: '/login', name: 'login', component: LoginView },
			{ path: '/change-password', name: 'change-password', component: ChangePasswordView },
		],
	})
}

function mountView(component: typeof LoginView | typeof ChangePasswordView, router: Router): VueWrapper {
	wrapper = mount(component, {
		global: {
			plugins: [
				createVuetify({ components, directives }),
				router,
			],
		},
	})

	return wrapper
}

beforeEach(() => {
	setActivePinia(createPinia())
	vi.useFakeTimers()
})

afterEach(() => {
	wrapper?.unmount()
	wrapper = null
	vi.useRealTimers()
})

describe('authentication views', () => {
	it('should authenticate an eligible account and honour an internal login redirect', async () => {
		const router = createTestRouter()
		await router.push('/login?redirect=/target')
		await router.isReady()
		const loginView = mountView(LoginView, router)

		const submitted = loginView.get('form').trigger('submit')
		await vi.advanceTimersByTimeAsync(600)
		await submitted

		expect(useAppStore().isAuthenticated).toBe(true)
		expect(useAppStore().isAdmin).toBe(true)
		expect(router.currentRoute.value.name).toBe('target')
	})

	it('should ignore an external login redirect target', async () => {
		const router = createTestRouter()
		await router.push('/login?redirect=https://untrusted.example')
		await router.isReady()
		const loginView = mountView(LoginView, router)

		const submitted = loginView.get('form').trigger('submit')
		await vi.advanceTimersByTimeAsync(600)
		await submitted

		expect(router.currentRoute.value.name).toBe('home')
	})

	it('should retain the password-change requirement until both new passwords are valid and equal', async () => {
		const router = createTestRouter()
		await router.push('/change-password')
		await router.isReady()
		const appStore = useAppStore()
		appStore.mustChangePassword = true
		const passwordView = mountView(ChangePasswordView, router)
		const inputs = passwordView.findAll('input')

		await inputs[0]!.setValue('Current1!')
		await inputs[1]!.setValue('NewPassword1!')
		await inputs[2]!.setValue('Different1!')
		await passwordView.get('form').trigger('submit')
		await nextTick()

		expect(appStore.mustChangePassword).toBe(true)
		expect(router.currentRoute.value.name).toBe('change-password')

		await inputs[2]!.setValue('NewPassword1!')
		const submitted = passwordView.get('form').trigger('submit')
		await vi.advanceTimersByTimeAsync(600)
		await submitted

		expect(appStore.mustChangePassword).toBe(false)
		expect(router.currentRoute.value.name).toBe('home')
	})
})
