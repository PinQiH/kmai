import { describe, expect, it } from 'vitest'
import type { ThemeDefinition } from 'vuetify'

import { clusterPalette, darkTheme, lightTheme, resolveThemeName, systemRecordCategoryPalette } from '../src/theme'
import { buildBackdropTheme, extractImagePalette } from '../src/utils/imagePalette'
import { contrastRatio, deltaE, relativeLuminance } from './helpers/color'

/*
 * > 主題語意色的可見性與可分辨性
 * @ 起因：主色若與 error 紅太接近，「刪除」與「儲存」會變成同一種紅，破壞性操作看不出來。
 *   背景圖配色的主色由使用者的圖片決定，任何色相都可能出現，
 *   所以用一圈色相（每 15°）加上灰階與極亮、極暗的圖片，把門檻釘死。
 */

// - 以單一顏色填滿的 2×2 圖片，模擬「整張圖都是這個顏色」
function solidImage(red: number, green: number, blue: number): Uint8ClampedArray {
	return new Uint8ClampedArray(Array.from({ length: 4 }, () => [red, green, blue, 255]).flat())
}

function hueToRgb(hue: number): [number, number, number] {
	const channel = (n: number): number => {
		const k = (n + hue / 30) % 12
		return Math.round((0.5 - 0.4 * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255)
	}
	return [channel(0), channel(8), channel(4)]
}

const backdropSamples: Array<{ label: string; pixels: Uint8ClampedArray }> = [
	...Array.from({ length: 24 }, (_, index) => ({ label: `色相 ${index * 15}°`, pixels: solidImage(...hueToRgb(index * 15)) })),
	{ label: '灰階', pixels: solidImage(128, 128, 128) },
	{ label: '近白', pixels: solidImage(250, 248, 240) },
	{ label: '近黑', pixels: solidImage(12, 14, 20) },
	{ label: '品牌紅', pixels: solidImage(199, 0, 10) },
]

const themes: Array<{ name: string; theme: ThemeDefinition }> = [
	{ name: '預設-淺', theme: lightTheme },
	{ name: '預設-深', theme: darkTheme },
	...backdropSamples.flatMap(({ label, pixels }) => {
		const { themes: generated } = buildBackdropTheme(extractImagePalette(pixels))
		return [
			{ name: `背景圖（${label}）-淺`, theme: generated.light },
			{ name: `背景圖（${label}）-深`, theme: generated.dark },
		]
	}),
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

	it('03. 紅色背景圖的主色是紅色時，error 會換成別的色相', () => {
		const { themes: generated } = buildBackdropTheme(extractImagePalette(solidImage(199, 0, 10)))

		// @ 沿用 #B42318 的話與紅色主色只有 ΔE 14，正是這個測試要擋的情況
		expect(colorOf(generated.light, 'error')).not.toBe(colorOf(lightTheme, 'error'))
		expect(colorOf(generated.dark, 'error')).not.toBe(colorOf(darkTheme, 'error'))
	})

	it('04. 灰階圖片沒有可用色相，主色退回 Cubi 藍的色相', () => {
		const { themes: generated } = buildBackdropTheme(extractImagePalette(solidImage(128, 128, 128)))
		const difference = deltaE(colorOf(generated.light, 'primary'), colorOf(lightTheme, 'primary'))

		expect(difference, `灰階圖片的主色與 Cubi 藍差了 ΔE ${difference.toFixed(1)}`).toBeLessThan(15)
	})

	it('05. 深色版的主色必須比淺色版亮，否則就是漏了主題切換', () => {
		for (const { name, theme } of themes.filter((item) => item.name.endsWith('-深'))) {
			const light = themes.find((item) => item.name === name.replace(/-深$/, '-淺'))?.theme
			if (!light) throw new Error(`${name} 缺少對應的淺色主題`)
			expect(relativeLuminance(colorOf(theme, 'primary')), name).toBeGreaterThan(relativeLuminance(colorOf(light, 'primary')))
		}
	})

	it('06. 明暗模式與背景圖是兩條獨立的軸，四種組合都有對應主題', () => {
		expect(resolveThemeName('light')).toBe('kmaiLight')
		expect(resolveThemeName('dark')).toBe('kmaiDark')
		expect(resolveThemeName('light', true)).toBe('kmaiBackdropLight')
		expect(resolveThemeName('dark', true)).toBe('kmaiBackdropDark')
	})

	it('07. 背景圖遮罩隨圖片亮度調整：越暗的圖，淺色模式遮罩越濃', () => {
		const alpha = (rgba: string): number => Number(rgba.match(/([\d.]+)\)$/)?.[1])
		const darkImage = buildBackdropTheme(extractImagePalette(solidImage(12, 14, 20)))
		const brightImage = buildBackdropTheme(extractImagePalette(solidImage(250, 248, 240)))

		expect(alpha(darkImage.scrim.light)).toBeGreaterThan(alpha(brightImage.scrim.light))
		expect(alpha(brightImage.scrim.dark)).toBeGreaterThan(alpha(darkImage.scrim.dark))
	})

	it('08. 每個主題的 surface variant 文字都達到文字的 AA 門檻', () => {
		for (const { name, theme } of themes) {
			const surfaceVariant = colorOf(theme, 'surface-variant')
			const onSurfaceVariant = colorOf(theme, 'on-surface-variant')
			const ratio = contrastRatio(onSurfaceVariant, surfaceVariant)

			expect(
				ratio,
				`${name} 的 on-surface-variant (${onSurfaceVariant}) 對 ${surfaceVariant} 只有 ${ratio.toFixed(2)}:1`,
			).toBeGreaterThanOrEqual(4.5)
		}
	})
})

/*
 * > 圖譜焦點環的可見性
 * @ 起因：焦點環原本用 primary 畫，而 primary #315C91 對第一群節點色 #31649b
 *   對比只有 1.12:1——鍵盤焦點在那一群節點上等於看不見，而且換強調色只會換一群受害。
 *   改成內圈 surface、外圈 on-surface 後與節點顏色無關，這裡把該前提釘死。
 */
describe('圖譜焦點環', () => {
	it('09. 內圈（surface）對每個群組色都達到非文字元素的 AA 門檻', () => {
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

	it('10. 外圈（on-surface）對畫布背景達到非文字元素的 AA 門檻', () => {
		for (const { name, theme } of themes) {
			const ratio = contrastRatio(colorOf(theme, 'on-surface'), colorOf(theme, 'surface'))
			expect(ratio, `${name} 的外圈對畫布只有 ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(3)
		}
	})
})

describe('系統事件類別色票', () => {
	it('11. 每個事件類別都有獨立顏色，並與對應表面維持 AA 對比', () => {
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
