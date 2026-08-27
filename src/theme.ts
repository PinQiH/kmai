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
	outline: '#707D89',
}

export const lightTheme: ThemeDefinition = { dark: false, colors: lightColors }
export const darkTheme: ThemeDefinition = { dark: true, colors: darkColors }

/*
 * > Syscom 紅：品牌 Logo 的兩支紅（#C7000A 亮紅、#930000 深紅）
 * @ 只換強調色與必要的語意色，中性表面沿用同一套，維持 DESIGN.md 的紙感底色。
 * !! error 不能沿用原本的 #B42318：它與品牌紅 #C7000A 的 ΔE 只有 14，
 *    「刪除」與「儲存」會變成同一種紅，破壞性操作看不出來。
 *    改用深酒紅 #8E1B3D（ΔE 47.1），仍讀得出是警示紅但與品牌紅分得開。
 *    深色版同理：primary 亮化成 #F5A79E 後，error 必須往橘紅移到 #F79A5C（ΔE 30.5）。
 * @ info 兩個主題都保留靛藍：資訊態維持藍色，與紅色主色天然區隔。
 *    門檻由 tests/theme-palette.test.ts 釘死，調色後請跑測試，不要只憑肉眼。
 */
export const redLightTheme: ThemeDefinition = {
	dark: false,
	colors: {
		...lightColors,
		primary: '#C7000A',
		'primary-darken-1': '#930000',
		error: '#8E1B3D',
	},
}

export const redDarkTheme: ThemeDefinition = {
	dark: true,
	colors: {
		...darkColors,
		primary: '#F5A79E',
		'primary-darken-1': '#E08C82',
		error: '#F79A5C',
	},
}

export type ThemeMode = 'light' | 'dark'
export type ThemeAccent = 'indigo' | 'red'

export const themeAccentLabels: Record<ThemeAccent, string> = {
	indigo: 'Cubi 藍',
	red: 'Syscom 紅',
}

// @ 主題鍵沿用 kmai 前綴（內部識別碼未隨產品改名而更動）
const themeNames: Record<ThemeAccent, Record<ThemeMode, string>> = {
	indigo: { light: 'kmaiLight', dark: 'kmaiDark' },
	red: { light: 'kmaiRedLight', dark: 'kmaiRedDark' },
}

/**
 * 由強調色與明暗模式解析出 Vuetify 主題名稱。
 * @param accent 強調色。
 * @param mode 明暗模式。
 * @returns 已註冊於 Vuetify 的主題名稱。
 */
export function resolveThemeName(accent: ThemeAccent, mode: ThemeMode): string {
	return themeNames[accent][mode]
}
