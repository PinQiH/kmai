import { defineStore } from 'pinia'
import type { ThemeInstance } from 'vuetify'

interface AppState {
	isAdmin: boolean
	isAuthenticated: boolean
	isNavigationOpen: boolean
	mustChangePassword: boolean
	themeMode: 'light' | 'dark'
}

export const useAppStore = defineStore('app', {
	state: (): AppState => ({
		isAdmin: true,
		isAuthenticated: true,
		isNavigationOpen: false,
		mustChangePassword: false,
		themeMode: 'light',
	}),
	actions: {
		initializeTheme(theme: ThemeInstance): void {
			theme.global.name.value = this.themeMode === 'dark' ? 'kmaiDark' : 'kmaiLight'
		},
		toggleTheme(theme: ThemeInstance): void {
			this.themeMode = this.themeMode === 'light' ? 'dark' : 'light'
			theme.global.name.value = this.themeMode === 'dark' ? 'kmaiDark' : 'kmaiLight'
		},
		toggleNavigation(): void {
			this.isNavigationOpen = !this.isNavigationOpen
		},
		logout(): void {
			this.isAuthenticated = false
			this.isAdmin = false
		},
	},
})
