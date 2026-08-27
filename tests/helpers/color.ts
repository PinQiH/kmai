/*
 * > 測試用的色彩量測工具
 * @ 原本內嵌在 graph-palette.test.ts，加入主題色票測試後抽出共用。
 *   兩個門檻各有用途：contrastRatio 管「看不看得見」，deltaE 管「分不分得出來」。
 */

function channels(hex: string, threshold: number): [number, number, number] {
	const value = hex.replace('#', '')
	const [r, g, b] = [0, 2, 4].map((offset) => {
		const raw = Number.parseInt(value.slice(offset, offset + 2), 16) / 255
		return raw <= threshold ? raw / 12.92 : Math.pow((raw + 0.055) / 1.055, 2.4)
	})
	return [r, g, b]
}

/** 將 hex 轉為 sRGB 相對亮度（WCAG 2.1 定義）。 */
export function relativeLuminance(hex: string): number {
	const [r, g, b] = channels(hex, 0.03928)
	return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/**
 * 計算兩色的 WCAG 對比。
 * @returns 1（相同）到 21（黑對白）之間的比值。
 */
export function contrastRatio(foreground: string, background: string): number {
	const a = relativeLuminance(foreground)
	const b = relativeLuminance(background)
	return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

/** 轉為 CIE L*a*b*，用於量測「人眼感知到的顏色差異」。 */
export function toLab(hex: string): [number, number, number] {
	const [r, g, b] = channels(hex, 0.04045)

	// @ sRGB → XYZ（D65）→ Lab
	const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047
	const y = 0.2126 * r + 0.7152 * g + 0.0722 * b
	const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883
	const f = (t: number): number => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
	const [fx, fy, fz] = [f(x), f(y), f(z)]

	return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

/**
 * 兩色的 CIE Lab 感知差異。
 * @returns ΔE，類別色的常見可分辨門檻約 25。
 */
export function deltaE(first: string, second: string): number {
	const a = toLab(first)
	const b = toLab(second)
	return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
}
