import { describe, expect, it } from 'vitest'
import type { ThemeDefinition } from 'vuetify'

import {
	clusterPalette,
	darkTheme,
	lightTheme,
	redDarkTheme,
	redLightTheme,
	resolveThemeName,
	systemRecordCategoryPalette,
	themeAccentLabels,
} from '../src/theme'
import { contrastRatio, deltaE, relativeLuminance } from './helpers/color'

/*
 * > 主題語意色的可見性與可分辨性
 * @ 起因：加入 Syscom 紅強調色後，品牌紅與 error 紅會撞在一起——
 *   「刪除」與「儲存」變成同一種紅，破壞性操作看不出來。
 *   純靠肉眼分不出「這兩個紅有沒有差」，這裡把門檻釘死。
 */

const themes: Array<{ name: string; theme: ThemeDefinition }> = [
	{ name: '靛藍-淺', theme: lightTheme },
	{ name: '靛藍-深', theme: darkTheme },
	{ name: 'Syscom 紅-淺', theme: redLightTheme },
	{ name: 'Syscom 紅-深', theme: redDarkTheme },
]

// @ 這四個都會被當成文字或圖示色使用，門檻是文字的 AA 4.5:1
const SEMANTIC_KEYS = ['primary', 'error', 'warning', 'success'] as const

function colorOf(theme: ThemeDefinition, key: string): string {
	const color = theme.colors?.[key]
	if (!color) throw new Error(`主題缺少 ${key}`)
	return color
}

describe('主題語意色', () => {
	it('01. 每個主題的語意色對 surface 都達到文字的 AA 門檻', () => {
		for (const { name, theme } of themes) {
			const surface = colorOf(theme, 'surface')

			for (const key of SEMANTIC_KEYS) {
				const color = colorOf(theme, key)
				const ratio = contrastRatio(color, surface)
				expect(ratio, `${name} 的 ${key} (${color}) 對 ${surface} 只有 ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5)
			}
		}
	})

	/*
	 * @ 門檻 25 沿用群組色票的標準（類別色的常見建議值）。
	 *   primary 與 error 是這裡最關鍵的一組：一個是「主要操作」、一個是「破壞性操作」，
	 *   在同一排按鈕上並存，分不出來就會誤刪。
	 */
	it('02. 每個主題的語意色兩兩可區分', () => {
		for (const { name, theme } of themes) {
			for (let i = 0; i < SEMANTIC_KEYS.length; i += 1) {
				for (let j = i + 1; j < SEMANTIC_KEYS.length; j += 1) {
					const first = colorOf(theme, SEMANTIC_KEYS[i])
					const second = colorOf(theme, SEMANTIC_KEYS[j])
					const difference = deltaE(first, second)
					expect(
						difference,
						`${name} 的 ${SEMANTIC_KEYS[i]} (${first}) 與 ${SEMANTIC_KEYS[j]} (${second}) 感知差異只有 ΔE ${difference.toFixed(1)}`,
					).toBeGreaterThan(25)
				}
			}
		}
	})

	it('03. Syscom 紅主題用的是品牌色，且沒有沿用原本的 error 紅', () => {
		expect(colorOf(redLightTheme, 'primary')).toBe('#C7000A')
		expect(colorOf(redLightTheme, 'primary-darken-1')).toBe('#930000')

		// @ 沿用 #B42318 的話與品牌紅只有 ΔE 14，正是這個測試要擋的情況
		expect(colorOf(redLightTheme, 'error')).not.toBe(colorOf(lightTheme, 'error'))
		expect(colorOf(redDarkTheme, 'error')).not.toBe(colorOf(darkTheme, 'error'))
	})

	it('04. Syscom 紅主題的 info 仍是藍色，與紅色主色分得開', () => {
		for (const theme of [redLightTheme, redDarkTheme]) {
			const difference = deltaE(colorOf(theme, 'info'), colorOf(theme, 'primary'))
			expect(difference, `info 與 primary 的感知差異只有 ΔE ${difference.toFixed(1)}`).toBeGreaterThan(25)
		}
	})

	it('05. 深色版的主色必須比淺色版亮，否則就是漏了主題切換', () => {
		expect(relativeLuminance(colorOf(darkTheme, 'primary'))).toBeGreaterThan(relativeLuminance(colorOf(lightTheme, 'primary')))
		expect(relativeLuminance(colorOf(redDarkTheme, 'primary'))).toBeGreaterThan(relativeLuminance(colorOf(redLightTheme, 'primary')))
	})

	it('06. 強調色與明暗模式是兩條獨立的軸，四種組合都有對應主題', () => {
		expect(resolveThemeName('indigo', 'light')).toBe('kmaiLight')
		expect(resolveThemeName('indigo', 'dark')).toBe('kmaiDark')
		expect(resolveThemeName('red', 'light')).toBe('kmaiRedLight')
		expect(resolveThemeName('red', 'dark')).toBe('kmaiRedDark')
	})

	it('07. 系統預設配色為 Cubi 藍，且管理介面使用正式名稱', () => {
		expect(resolveThemeName('indigo', 'light')).toBe('kmaiLight')
		expect(themeAccentLabels.indigo).toBe('Cubi 藍')
		expect(themeAccentLabels.red).toBe('Syscom 紅')
	})
})

/*
 * > 圖譜焦點環的可見性
 * @ 起因：焦點環原本用 primary 畫，而 primary #315C91 對第一群節點色 #31649b
 *   對比只有 1.12:1——鍵盤焦點在那一群節點上等於看不見，而且換強調色只會換一群受害。
 *   改成內圈 surface、外圈 on-surface 後與節點顏色無關，這裡把該前提釘死。
 */
describe('圖譜焦點環', () => {
	it('08. 內圈（surface）對每個群組色都達到非文字元素的 AA 門檻', () => {
		const cases = [
			{ name: '淺色', surface: colorOf(lightTheme, 'surface'), palette: clusterPalette.light },
			{ name: '深色', surface: colorOf(darkTheme, 'surface'), palette: clusterPalette.dark },
		]

		for (const { name, surface, palette } of cases) {
			for (const [index, color] of palette.entries()) {
				const ratio = contrastRatio(surface, color)
				expect(ratio, `${name} cluster-${index} (${color}) 對內圈 ${surface} 只有 ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(3)
			}
		}
	})

	it('09. 外圈（on-surface）對畫布背景達到非文字元素的 AA 門檻', () => {
		for (const { name, theme } of themes) {
			const ratio = contrastRatio(colorOf(theme, 'on-surface'), colorOf(theme, 'surface'))
			expect(ratio, `${name} 的外圈對畫布只有 ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(3)
		}
	})
})

describe('系統事件類別色票', () => {
	it('10. 每個事件類別都有獨立顏色，並與對應表面維持 AA 對比', () => {
		const cases = [
			{ name: '淺色', surface: colorOf(lightTheme, 'surface'), palette: systemRecordCategoryPalette.light },
			{ name: '深色', surface: colorOf(darkTheme, 'surface'), palette: systemRecordCategoryPalette.dark },
		]

		for (const { name, surface, palette } of cases) {
			const colors = Object.values(palette)
			expect(new Set(colors).size, `${name}事件類別色不可重複`).toBe(colors.length)
			for (const [category, color] of Object.entries(palette)) {
				const colorChannels = color.match(/[a-f\d]{2}/gi)?.map((channel) => Number.parseInt(channel, 16)) ?? []
				const surfaceChannels = surface.match(/[a-f\d]{2}/gi)?.map((channel) => Number.parseInt(channel, 16)) ?? []
				const tonalSurface = `#${colorChannels
					.map((channel, index) => Math.round(channel * 0.12 + (surfaceChannels[index] ?? 0) * 0.88).toString(16).padStart(2, '0'))
					.join('')}`
				const ratio = contrastRatio(color, tonalSurface)
				expect(ratio, `${name} ${category} (${color}) 對 tonal surface ${tonalSurface} 僅 ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5)
			}
		}
	})
})
