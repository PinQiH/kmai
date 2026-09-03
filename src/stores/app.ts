import { defineStore } from 'pinia'
import type { ThemeInstance } from 'vuetify'

import { resolveThemeName, type ThemeAccent, type ThemeMode, type ThemePreference } from '@/theme'
import type { AdminRole } from '@/types'

const SYSTEM_COLOR_SCHEME_QUERY = '(prefers-color-scheme: dark)'

let removeSystemThemeListener: (() => void) | null = null

interface AppState {
	adminRole: AdminRole
	isAdmin: boolean
	isAuthenticated: boolean
	isNavigationOpen: boolean
	isNavigationRail: boolean
	mustChangePassword: boolean
	// @ 明暗偏好與實際套用模式分開，system 才能持續跟隨瀏覽器設定
	themePreference: ThemePreference
	themeMode: ThemeMode
	themeAccent: ThemeAccent
}

// - 取得瀏覽器深淺色偏好
function getSystemColorSchemeQuery(): MediaQueryList | null {
	if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null
	return window.matchMedia(SYSTEM_COLOR_SCHEME_QUERY)
}

// - 將瀏覽器偏好解析為實際主題模式
function resolveSystemThemeMode(colorSchemeQuery: MediaQueryList | null): ThemeMode {
	return colorSchemeQuery?.matches ? 'dark' : 'light'
}

export const useAppStore = defineStore('app', {
	state: (): AppState => ({
		adminRole: 'system-admin',
		isAdmin: true,
		isAuthenticated: true,
		isNavigationOpen: false,
		isNavigationRail: false,
		mustChangePassword: false,
		themePreference: 'system',
		themeMode: 'light',
		themeAccent: 'indigo',
	}),
	getters: {
		// @ 單一來源：任何要套用主題的地方都經過這裡，避免各處自己拼主題名稱
		themeName: (state): string => resolveThemeName(state.themeAccent, state.themeMode),
	},
	actions: {
		applyTheme(theme: ThemeInstance): void {
			theme.change(this.themeName)
		},
		disposeTheme(): void {
			removeSystemThemeListener?.()
			removeSystemThemeListener = null
		},
		initializeTheme(theme: ThemeInstance): void {
			this.disposeTheme()

			const colorSchemeQuery = getSystemColorSchemeQuery()
			if (this.themePreference === 'system') this.themeMode = resolveSystemThemeMode(colorSchemeQuery)
			this.applyTheme(theme)

			if (!colorSchemeQuery || typeof colorSchemeQuery.addEventListener !== 'function') return
			const handleSystemThemeChange = (event: MediaQueryListEvent): void => {
				if (this.themePreference !== 'system') return
				this.themeMode = event.matches ? 'dark' : 'light'
				this.applyTheme(theme)
			}
			colorSchemeQuery.addEventListener('change', handleSystemThemeChange)
			removeSystemThemeListener = () => {
				if (typeof colorSchemeQuery.removeEventListener === 'function') colorSchemeQuery.removeEventListener('change', handleSystemThemeChange)
			}
		},
		setThemePreference(theme: ThemeInstance, preference: ThemePreference): void {
			this.themePreference = preference
			this.themeMode = preference === 'system'
				? resolveSystemThemeMode(getSystemColorSchemeQuery())
				: preference
			this.applyTheme(theme)
		},
		toggleTheme(theme: ThemeInstance): void {
			this.setThemePreference(theme, this.themeMode === 'light' ? 'dark' : 'light')
		},
		// - 切換強調色不影響明暗模式，兩者互不覆蓋
		setThemeAccent(theme: ThemeInstance, accent: ThemeAccent): void {
			this.themeAccent = accent
			this.applyTheme(theme)
		},
		toggleNavigation(): void {
			this.isNavigationOpen = !this.isNavigationOpen
		},
		// - 桌面版側邊欄在完整寬度與 icon rail 之間切換
		toggleNavigationRail(): void {
			this.isNavigationRail = !this.isNavigationRail
		},
		logout(): void {
			this.adminRole = null
			this.isAuthenticated = false
			this.isAdmin = false
		},
	},
})
