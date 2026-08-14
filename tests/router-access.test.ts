import { beforeEach, describe, expect, it, vi } from 'vitest'

import { canAccessRoute, router } from '../src/router'
import { useAppStore } from '../src/stores/app'
import { pinia } from '../src/stores'

describe('route access', () => {
	it('should reject private route when user is signed out', () => {
		expect(canAccessRoute({}, { isAuthenticated: false, isAdmin: false, mustChangePassword: false })).toBe(false)
	})

	it('should reject admin route for regular employee', () => {
		expect(canAccessRoute({ admin: true }, { isAuthenticated: true, isAdmin: false, mustChangePassword: false })).toBe(false)
	})

	it('should force password change before other private routes', () => {
		const context = { isAuthenticated: true, isAdmin: false, mustChangePassword: true }

		expect(canAccessRoute({}, context)).toBe(false)
		expect(canAccessRoute({ passwordChange: true }, context)).toBe(true)
	})

	it('should allow admin when all requirements are satisfied', () => {
		expect(canAccessRoute({ admin: true }, { isAuthenticated: true, isAdmin: true, mustChangePassword: false })).toBe(true)
	})
})

describe('router guard integration', () => {
	beforeEach(() => {
		vi.stubGlobal('scrollTo', vi.fn())
		const appStore = useAppStore(pinia)
		appStore.$reset()
	})

	it('should redirect signed-out user to login with original path', async () => {
		const appStore = useAppStore(pinia)
		appStore.logout()

		await router.push('/admin/documents')

		expect(router.currentRoute.value.name).toBe('login')
		expect(router.currentRoute.value.query.redirect).toBe('/admin/documents')
	})

	it('should redirect regular employee away from admin route', async () => {
		const appStore = useAppStore(pinia)
		appStore.isAuthenticated = true
		appStore.isAdmin = false

		await router.push('/admin')

		expect(router.currentRoute.value.name).toBe('forbidden')
	})
})
