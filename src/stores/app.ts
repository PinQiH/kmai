import { defineStore } from 'pinia'
import type { ThemeInstance } from 'vuetify'

import { APPEARANCE_STORAGE_KEY, settingsState, syncAppearanceFromStorage } from '@/mocks/systemSettings'
import { resolveThemeName, type ThemeMode, type ThemePreference } from '@/theme'
import type { AdminRole } from '@/types'
import { buildBackdropTheme, type BackdropTheme, type ImagePalette } from '@/utils/imagePalette'

const SYSTEM_COLOR_SCHEME_QUERY = '(prefers-color-scheme: dark)'

let removeSystemThemeListener: (() => void) | null = null
let removeAppearanceStorageListener: (() => void) | null = null

interface BackdropState {
	imageUrl: string
	scrim: BackdropTheme['scrim']
}

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
	// @ 目前套用中的背景圖；來源是後台「預設外觀」，前台只讀不寫
	backdrop: BackdropState | null
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
		// @ 新工作階段的預設外觀由管理端「系統設定」決定
		themePreference: settingsState.appearance.themePreference,
		themeMode: 'light',
		backdrop: null,
	}),
	getters: {
		// @ 單一來源：任何要套用主題的地方都經過這裡，避免各處自己拼主題名稱
		themeName: (state): string => resolveThemeName(state.themeMode, state.backdrop !== null),
		backdropScrim: (state): string | null => state.backdrop?.scrim[state.themeMode] ?? null,
	},
	actions: {
		applyTheme(theme: ThemeInstance): void {
			theme.change(this.themeName)
		},
		disposeTheme(): void {
			removeSystemThemeListener?.()
			removeSystemThemeListener = null
			removeAppearanceStorageListener?.()
			removeAppearanceStorageListener = null
		},
		initializeTheme(theme: ThemeInstance): void {
			this.disposeTheme()

			const colorSchemeQuery = getSystemColorSchemeQuery()
			if (this.themePreference === 'system') this.themeMode = resolveSystemThemeMode(colorSchemeQuery)
			// TODO(api-integration): 系統背景圖改由設定 API 取得
			this.setBackdrop(theme, settingsState.appearance.backdrop)

			// @ 後台在另一個分頁儲存背景圖時，已開啟的前台分頁即時跟著換
			if (typeof window !== 'undefined') {
				const handleAppearanceStorage = (event: StorageEvent): void => {
					if (event.key !== APPEARANCE_STORAGE_KEY) return
					syncAppearanceFromStorage()
					this.setBackdrop(theme, settingsState.appearance.backdrop)
				}
				window.addEventListener('storage', handleAppearanceStorage)
				removeAppearanceStorageListener = () => window.removeEventListener('storage', handleAppearanceStorage)
			}

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
		/*
		 * - 套用背景圖與由圖片算出的配色；傳入 null 則回到預設配色
		 * !! 背景圖主題須已在 createVuetify 註冊（createThemeDefinitions），
		 *    這裡只改寫顏色；未註冊的主題名稱 theme.change 會直接報錯。
		 */
		setBackdrop(theme: ThemeInstance, source: { imageUrl: string; palette: ImagePalette } | null): void {
			if (!source) {
				this.backdrop = null
				this.applyTheme(theme)
				return
			}
			const backdrop = buildBackdropTheme(source.palette)
			for (const mode of ['light', 'dark'] as const) {
				const registered = theme.themes.value[resolveThemeName(mode, true)]
				if (registered) Object.assign(registered.colors, backdrop.themes[mode].colors)
			}
			this.backdrop = { imageUrl: source.imageUrl, scrim: backdrop.scrim }
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
