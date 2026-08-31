import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import type { ThemeInstance } from 'vuetify'

import { useAppStore } from '@/stores/app'
import { themeAccentLabels } from '@/theme'

// @ 只需要 store 實際會寫入的那一格，不必造出完整的 Vuetify 主題實例
function createThemeStub(): ThemeInstance {
	return { global: { name: { value: '' } } } as unknown as ThemeInstance
}

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

	it('should clear the explicit admin role on logout', () => {
		const store = useAppStore()
		expect(store.adminRole).toBe('system-admin')

		store.logout()

		expect(store.adminRole).toBeNull()
		expect(store.isAdmin).toBe(false)
	})
})

describe('app store theme', () => {
	beforeEach(() => {
		setActivePinia(createPinia())
	})

	it('should keep the accent and the light/dark mode independent', () => {
		const store = useAppStore()
		const theme = createThemeStub()

		store.setThemeAccent(theme, 'red')

		expect(store.themeMode).toBe('light')
		expect(themeAccentLabels[store.themeAccent]).toBe('Syscom 紅')
		expect(theme.global.name.value).toBe('kmaiRedLight')

		store.toggleTheme(theme)

		// @ 切換明暗不得把強調色重設回預設，這是兩條軸分開的核心契約
		expect(store.themeAccent).toBe('red')
		expect(store.themeMode).toBe('dark')
		expect(theme.global.name.value).toBe('kmaiRedDark')
	})

	it('should fall back to the default accent for a fresh session', () => {
		const store = useAppStore()

		expect(store.themeAccent).toBe('indigo')
		expect(themeAccentLabels[store.themeAccent]).toBe('Cubi 藍')
		expect(store.themeName).toBe('kmaiLight')
	})
})
