import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ThemeInstance } from 'vuetify'

import { useAppStore } from '@/stores/app'
import { themeAccentLabels } from '@/theme'

// @ 只需要 store 實際會寫入的那一格，不必造出完整的 Vuetify 主題實例
function createThemeStub(): ThemeInstance {
	const name = { value: '' }
	return {
		global: { name },
		change(themeName: string): void {
			name.value = themeName
		},
	} as unknown as ThemeInstance
}

function stubSystemColorScheme(initialMatches: boolean): {
	emitChange: (matches: boolean) => void
	getChangeListenerCount: () => number
	mediaQuery: MediaQueryList
} {
	let matches = initialMatches
	const changeListeners = new Set<(event: MediaQueryListEvent) => void>()
	const mediaQuery = {
		get matches() {
			return matches
		},
		media: '(prefers-color-scheme: dark)',
		addEventListener: vi.fn((_type: string, listener: EventListenerOrEventListenerObject) => {
			if (typeof listener === 'function') changeListeners.add(listener as (event: MediaQueryListEvent) => void)
		}),
		removeEventListener: vi.fn((_type: string, listener: EventListenerOrEventListenerObject) => {
			if (typeof listener === 'function') changeListeners.delete(listener as (event: MediaQueryListEvent) => void)
		}),
	} as unknown as MediaQueryList
	vi.stubGlobal('matchMedia', vi.fn(() => mediaQuery))

	return {
		mediaQuery,
		getChangeListenerCount: () => changeListeners.size,
		emitChange(nextMatches: boolean): void {
			matches = nextMatches
			changeListeners.forEach((listener) => listener({ matches } as MediaQueryListEvent))
		},
	}
}

afterEach(() => {
	vi.unstubAllGlobals()
})

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
		expect(store.themePreference).toBe('dark')
		expect(store.themeMode).toBe('dark')
		expect(theme.global.name.value).toBe('kmaiRedDark')
	})

	it('should follow browser color scheme changes while system mode is selected', () => {
		const browserScheme = stubSystemColorScheme(true)
		const store = useAppStore()
		const theme = createThemeStub()

		store.initializeTheme(theme)

		expect(store.themePreference).toBe('system')
		expect(store.themeMode).toBe('dark')
		expect(theme.global.name.value).toBe('kmaiDark')
		expect(browserScheme.mediaQuery.addEventListener).toHaveBeenCalledWith('change', expect.any(Function))

		store.initializeTheme(theme)

		expect(browserScheme.mediaQuery.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function))
		expect(browserScheme.getChangeListenerCount()).toBe(1)

		browserScheme.emitChange(false)

		expect(store.themeMode).toBe('light')
		expect(theme.global.name.value).toBe('kmaiLight')

		store.disposeTheme()
		browserScheme.emitChange(true)

		expect(browserScheme.getChangeListenerCount()).toBe(0)
		expect(store.themeMode).toBe('light')
		expect(theme.global.name.value).toBe('kmaiLight')
	})

	it('should keep an explicit mode until system mode is selected again', () => {
		const browserScheme = stubSystemColorScheme(false)
		const store = useAppStore()
		const theme = createThemeStub()
		store.initializeTheme(theme)

		store.setThemePreference(theme, 'dark')
		browserScheme.emitChange(false)

		expect(store.themePreference).toBe('dark')
		expect(store.themeMode).toBe('dark')
		expect(theme.global.name.value).toBe('kmaiDark')

		store.setThemePreference(theme, 'system')

		expect(store.themePreference).toBe('system')
		expect(store.themeMode).toBe('light')
		expect(theme.global.name.value).toBe('kmaiLight')
	})

	it('should fall back to light mode when browser preference is unavailable', () => {
		const store = useAppStore()
		const theme = createThemeStub()

		store.initializeTheme(theme)

		expect(store.themePreference).toBe('system')
		expect(store.themeMode).toBe('light')
		expect(theme.global.name.value).toBe('kmaiLight')
	})

	it('should fall back to the default accent for a fresh session', () => {
		const store = useAppStore()

		expect(store.themeAccent).toBe('indigo')
		expect(store.themePreference).toBe('system')
		expect(themeAccentLabels[store.themeAccent]).toBe('Cubi 藍')
		expect(store.themeName).toBe('kmaiLight')
	})
})
