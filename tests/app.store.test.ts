import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { useAppStore } from '@/stores/app'

describe('app store navigation', () => {
	beforeEach(() => {
		setActivePinia(createPinia())
	})

	it('should keep the temporary navigation closed on first render', () => {
		const store = useAppStore()

		expect(store.isNavigationOpen).toBe(false)
	})

	it('should toggle the temporary navigation when requested', () => {
		const store = useAppStore()

		store.toggleNavigation()

		expect(store.isNavigationOpen).toBe(true)
	})
})
