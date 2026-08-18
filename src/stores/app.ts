import { defineStore } from 'pinia'
import type { ThemeInstance } from 'vuetify'

interface AppState {
	isAdmin: boolean
	isAuthenticated: boolean
	isNavigationOpen: boolean
	isNavigationRail: boolean
	mustChangePassword: boolean
	themeMode: 'light' | 'dark'
	hasThemePreference: boolean
}

// @ jsdom 與部分舊環境沒有 matchMedia，需先判斷再呼叫
function prefersDarkScheme(): boolean {
	return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches
}

export const useAppStore = defineStore('app', {
	state: (): AppState => ({
		isAdmin: true,
		isAuthenticated: true,
		isNavigationOpen: false,
		isNavigationRail: false,
		mustChangePassword: false,
		themeMode: 'light',
		hasThemePreference: false,
	}),
	actions: {
		initializeTheme(theme: ThemeInstance): void {
			// @ 首次載入跟隨系統偏好；使用者手動切換過之後改以 store 狀態為準
			if (!this.hasThemePreference) this.themeMode = prefersDarkScheme() ? 'dark' : 'light'
			theme.global.name.value = this.themeMode === 'dark' ? 'kmaiDark' : 'kmaiLight'
		},
		toggleTheme(theme: ThemeInstance): void {
			this.themeMode = this.themeMode === 'light' ? 'dark' : 'light'
			this.hasThemePreference = true
			theme.global.name.value = this.themeMode === 'dark' ? 'kmaiDark' : 'kmaiLight'
		},
		toggleNavigation(): void {
			this.isNavigationOpen = !this.isNavigationOpen
		},
		// - 桌面版側邊欄在完整寬度與 icon rail 之間切換
		toggleNavigationRail(): void {
			this.isNavigationRail = !this.isNavigationRail
		},
		logout(): void {
			this.isAuthenticated = false
			this.isAdmin = false
		},
	},
})
