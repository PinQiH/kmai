import { defineStore } from 'pinia'
import type { ThemeInstance } from 'vuetify'

import { resolveThemeName, type ThemeAccent, type ThemeMode } from '@/theme'
import type { AdminRole } from '@/types'

interface AppState {
	adminRole: AdminRole
	isAdmin: boolean
	isAuthenticated: boolean
	isNavigationOpen: boolean
	isNavigationRail: boolean
	mustChangePassword: boolean
	// @ 明暗模式與強調色是兩條正交的軸：模式跟隨系統偏好，強調色由使用者指定
	themeMode: ThemeMode
	themeAccent: ThemeAccent
	hasThemePreference: boolean
}

// @ jsdom 與部分舊環境沒有 matchMedia，需先判斷再呼叫
function prefersDarkScheme(): boolean {
	return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches
}

export const useAppStore = defineStore('app', {
	state: (): AppState => ({
		adminRole: 'system-admin',
		isAdmin: true,
		isAuthenticated: true,
		isNavigationOpen: false,
		isNavigationRail: false,
		mustChangePassword: false,
		themeMode: 'light',
		themeAccent: 'indigo',
		hasThemePreference: false,
	}),
	getters: {
		// @ 單一來源：任何要套用主題的地方都經過這裡，避免各處自己拼主題名稱
		themeName: (state): string => resolveThemeName(state.themeAccent, state.themeMode),
	},
	actions: {
		applyTheme(theme: ThemeInstance): void {
			theme.global.name.value = this.themeName
		},
		initializeTheme(theme: ThemeInstance): void {
			// @ 首次載入跟隨系統偏好；使用者手動切換過之後改以 store 狀態為準
			if (!this.hasThemePreference) this.themeMode = prefersDarkScheme() ? 'dark' : 'light'
			this.applyTheme(theme)
		},
		toggleTheme(theme: ThemeInstance): void {
			this.themeMode = this.themeMode === 'light' ? 'dark' : 'light'
			this.hasThemePreference = true
			this.applyTheme(theme)
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
