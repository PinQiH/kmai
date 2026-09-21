import { describe, expect, it } from 'vitest'

import { clusterPalette, darkTheme, lightTheme } from '../src/theme'
import { contrastRatio, deltaE, relativeLuminance } from './helpers/color'

/*
 * > 知識圖譜群組色票的對比檢查
 * @ 起因：深色主題的色票覆寫因選擇器失效而從未套用，深色底上畫深色節點，
 *   使用者回報「顏色有點不清楚」。純靠肉眼看不出是「顏色選錯」還是「規則沒生效」，
 *   這裡把色票本身的對比釘死，讓調色出問題時測試先失敗。
 */

describe('知識圖譜群組色票', () => {
	it('01. 淺色主題 - 每個群組色對 surface 的對比達非文字元素的 AA 門檻', () => {
		const surface = lightTheme.colors?.surface as string

		for (const [index, color] of clusterPalette.light.entries()) {
			const ratio = contrastRatio(color, surface)
			// @ WCAG 非文字元素（圖形物件）的門檻是 3:1
			expect(ratio, `cluster-${index} (${color}) 對 ${surface} 的對比只有 ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(3)
		}
	})

	it('02. 深色主題 - 每個群組色對 surface 的對比達非文字元素的 AA 門檻', () => {
		const surface = darkTheme.colors?.surface as string

		for (const [index, color] of clusterPalette.dark.entries()) {
			const ratio = contrastRatio(color, surface)
			expect(ratio, `cluster-${index} (${color}) 對 ${surface} 的對比只有 ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(3)
		}
	})

	it('03. 兩組色票的長度一致，且足夠涵蓋所有主題群', () => {
		expect(clusterPalette.dark.length).toBe(clusterPalette.light.length)
		expect(clusterPalette.light.length).toBeGreaterThanOrEqual(5)
	})

	it('04. 深色色票必須比淺色色票亮，否則就是漏了主題切換', () => {
		clusterPalette.light.forEach((lightColor, index) => {
			const darkColor = clusterPalette.dark[index]
			expect(
				relativeLuminance(darkColor),
				`cluster-${index} 的深色版 ${darkColor} 不比淺色版 ${lightColor} 亮`,
			).toBeGreaterThan(relativeLuminance(lightColor))
		})
	})

	/*
	 * @ 用 CIE Lab 的 ΔE 而非亮度差：亮度是單一維度，會把色相差 93 度的靛藍與梅紫
	 *   誤判為「太接近」。ΔE 量的是人眼實際感知到的整體差異，才是類別色的正確指標。
	 *   門檻 25 是類別色的常見建議值（實測本色票最小 29.1）。
	 */
	it('05. 同一組色票內兩兩可區分，不會有看起來一樣的顏色', () => {
		for (const [name, palette] of Object.entries(clusterPalette)) {
			for (let i = 0; i < palette.length; i += 1) {
				for (let j = i + 1; j < palette.length; j += 1) {
					const difference = deltaE(palette[i], palette[j])
					expect(
						difference,
						`${name} 的 ${palette[i]} 與 ${palette[j]} 感知差異只有 ΔE ${difference.toFixed(1)}`,
					).toBeGreaterThan(25)
				}
			}
		}
	})
})
