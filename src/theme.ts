import type { ThemeDefinition } from 'vuetify'

/*
 * > 知識圖譜的主題群色票
 * @ 五個色相刻意壓低彩度，與暖灰底一致；不是螢光或漸層。
 *   這是 DESIGN.md 之外的新增（章程原本只有單一 Cubi 藍），
 *   理由：分群是圖譜頁的核心資訊，只用單色無法表達五個群的邊界。
 * !! 兩組色票對各自 surface 的對比有測試保護（graph-palette.test.ts），
 *    調色後請確認測試仍過，不要只憑肉眼。
 */
export const clusterPalette = {
	light: ['#31649b', '#7d4e7a', '#96453f', '#3f7355', '#8a6a2c'],
	dark: ['#8fb6e0', '#c99bc6', '#e39b94', '#8fc9a8', '#d8bd7e'],
}

/*
 * > 系統事件類別色票
 * @ 每一類保留獨立色相，搭配既有圖示與文字標籤，不以顏色作為唯一識別方式。
 * !! 類別文字會直接顯示在 tonal chip 上，色票需通過各自主題 surface 的 AA 對比測試。
 */
export const systemRecordCategoryPalette = {
	light: {
		auth: '#315C91',
		ai: '#7D4E7A',
		job: '#28724F',
		audit: '#8A5A00',
		notification: '#0F6B73',
		alert: '#B42318',
	},
	dark: {
		auth: '#8FB6E0',
		ai: '#D2A6CF',
		job: '#94D6B4',
		audit: '#D8BD7E',
		notification: '#7CCBD0',
		alert: '#FFB4AB',
	},
} as const

const lightColors = {
	background: '#F5F4F0',
	surface: '#FFFFFF',
	'surface-variant': '#ECEAE4',
	primary: '#315C91',
	'primary-darken-1': '#24466F',
	secondary: '#596673',
	error: '#B42318',
	warning: '#9A6700',
	success: '#28724F',
	info: '#315C91',
	'on-background': '#202428',
	'on-surface': '#202428',
	'on-surface-variant': '#202428',
	outline: '#D7D5CE',
}

const darkColors = {
	background: '#24282D',
	surface: '#2D3339',
	'surface-variant': '#373E45',
	primary: '#A9C8EC',
	'primary-darken-1': '#84A9D4',
	secondary: '#C2CBD4',
	error: '#FFB4AB',
	warning: '#E9C978',
	success: '#94D6B4',
	info: '#A9C8EC',
	'on-background': '#F0F2F4',
	'on-surface': '#F0F2F4',
	'on-surface-variant': '#F0F2F4',
	outline: '#707D89',
}

export const lightTheme: ThemeDefinition = { dark: false, colors: lightColors }
export const darkTheme: ThemeDefinition = { dark: true, colors: darkColors }

// @ 背景圖配色以預設色為底，只覆寫由圖片算出的顏色（見 utils/imagePalette.ts）
export const baseThemeColors = { light: lightColors, dark: darkColors } as const

export type ThemeMode = 'light' | 'dark'
export type ThemePreference = ThemeMode | 'system'

// @ 主題鍵沿用 kmai 前綴（內部識別碼未隨產品改名而更動）
const themeNames = {
	default: { light: 'kmaiLight', dark: 'kmaiDark' },
	backdrop: { light: 'kmaiBackdropLight', dark: 'kmaiBackdropDark' },
} as const satisfies Record<string, Record<ThemeMode, string>>

/*
 * > 所有要註冊到 Vuetify 的主題
 * @ 背景圖主題先以預設色佔位，使用者設定背景圖後才在 runtime 改寫顏色。
 *   先註冊的原因：Vuetify 對已存在的主題物件改色才會重新產生 CSS 變數。
 */
export function createThemeDefinitions(): Record<string, ThemeDefinition> {
	return {
		[themeNames.default.light]: lightTheme,
		[themeNames.default.dark]: darkTheme,
		[themeNames.backdrop.light]: { dark: false, colors: { ...lightColors } },
		[themeNames.backdrop.dark]: { dark: true, colors: { ...darkColors } },
	}
}

/**
 * 由明暗模式與是否使用背景圖解析出 Vuetify 主題名稱。
 * @param mode 明暗模式。
 * @param hasBackdrop 是否已設定背景圖。
 * @returns 已註冊於 Vuetify 的主題名稱。
 */
export function resolveThemeName(mode: ThemeMode, hasBackdrop = false): string {
	return themeNames[hasBackdrop ? 'backdrop' : 'default'][mode]
}
