import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ThemeInstance } from 'vuetify'

import { useAppStore } from '@/stores/app'
import { baseThemeColors } from '@/theme'
import { extractImagePalette } from '@/utils/imagePalette'

// @ 只需要 store 實際會讀寫的欄位，不必造出完整的 Vuetify 主題實例
function createThemeStub(): ThemeInstance {
	const name = { value: '' }
	const themes = {
		value: {
			kmaiBackdropLight: { dark: false, colors: { ...baseThemeColors.light } },
			kmaiBackdropDark: { dark: true, colors: { ...baseThemeColors.dark } },
		},
	}
	return {
		global: { name },
		themes,
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

	it('should keep the backdrop and the light/dark mode independent', () => {
		const store = useAppStore()
		const theme = createThemeStub()
		// @ 一張全綠的 2×2 圖片
		const palette = extractImagePalette(new Uint8ClampedArray(Array.from({ length: 4 }, () => [40, 140, 70, 255]).flat()))

		store.setBackdrop(theme, { imageUrl: 'data:image/jpeg;base64,AAAA', palette })

		expect(store.themeMode).toBe('light')
		expect(theme.global.name.value).toBe('kmaiBackdropLight')
		expect(theme.themes.value.kmaiBackdropLight.colors.primary).not.toBe(baseThemeColors.light.primary)
		expect(store.backdropScrim).toMatch(/^rgba\(/)

		store.toggleTheme(theme)

		// @ 切換明暗不得清掉背景圖，這是兩條軸分開的核心契約
		expect(store.backdrop).not.toBeNull()
		expect(store.themeMode).toBe('dark')
		expect(theme.global.name.value).toBe('kmaiBackdropDark')

		store.setBackdrop(theme, null)

		expect(store.backdrop).toBeNull()
		expect(theme.global.name.value).toBe('kmaiDark')
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

	it('should start without a backdrop for a fresh session', () => {
		const store = useAppStore()

		expect(store.backdrop).toBeNull()
		expect(store.themePreference).toBe('system')
		expect(store.themeName).toBe('kmaiLight')
	})
})
