import type { ThemeDefinition } from 'vuetify'

/*
 * > 知識圖譜的主題群色票
 * @ 五個色相刻意壓低彩度，與暖灰底一致；不是螢光或漸層。
 *   這是 DESIGN.md 之外的新增（章程原本只有單一 Archive Indigo），
 *   理由：分群是圖譜頁的核心資訊，只用單色無法表達五個群的邊界。
 * !! 兩組色票對各自 surface 的對比有測試保護（graph-palette.test.ts），
 *    調色後請確認測試仍過，不要只憑肉眼。
 */
export const clusterPalette = {
	light: ['#31649b', '#7d4e7a', '#96453f', '#3f7355', '#8a6a2c'],
	dark: ['#8fb6e0', '#c99bc6', '#e39b94', '#8fc9a8', '#d8bd7e'],
}

export const lightTheme: ThemeDefinition = {
	dark: false,
	colors: {
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
	},
}

export const darkTheme: ThemeDefinition = {
	dark: true,
	colors: {
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
	},
}
