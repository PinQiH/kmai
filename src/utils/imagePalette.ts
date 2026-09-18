import type { ThemeDefinition } from 'vuetify'

import { baseThemeColors, type ThemeMode } from '@/theme'

/*
 * > 背景圖自動配色
 * @ 流程：圖片縮到 64×64 取樣 → 量化分組挑出種子色 → 依種子色色相產生淺／深兩組主題色。
 * @ 門檻與 tests/theme-palette.test.ts 相同：文字色對表面 AA 4.5:1、語意色兩兩 ΔE > 25。
 *   產生時先留一點餘裕（ΔE 28），避免四捨五入到 hex 後剛好掉到門檻下。
 */

export interface ImagePalette {
	// @ 圖片中最具代表性的顏色，主題色的色相由它決定
	seed: string
	// @ 前幾名彼此有差異的顏色，只供畫面展示
	swatches: string[]
	// @ 0（全黑）到 1（全白），用來決定遮罩濃度
	averageLuminance: number
}

export interface BackdropTheme {
	themes: Record<ThemeMode, ThemeDefinition>
	// @ 疊在背景圖上的半透明遮罩，讓圖片不搶文字
	scrim: Record<ThemeMode, string>
}

type Rgb = [number, number, number]

const SAMPLE_SIZE = 64
const MAX_IMAGE_EDGE = 1920
const MAX_FILE_BYTES = 10 * 1024 * 1024
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const TEXT_CONTRAST = 4.5
const MIN_DELTA_E = 28
// @ 黑白或低彩度圖片沒有可用色相，退回 Cubi 藍的色相
const FALLBACK_HUE = 213

// > 色彩工具

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value))

function hexToRgb(hex: string): Rgb {
	const value = hex.replace('#', '')
	return [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16)) as Rgb
}

function rgbToHex(rgb: Rgb): string {
	return `#${rgb.map((channel) => Math.round(channel).toString(16).padStart(2, '0')).join('').toUpperCase()}`
}

function rgbToHsl([red, green, blue]: Rgb): Rgb {
	const [r, g, b] = [red / 255, green / 255, blue / 255]
	const max = Math.max(r, g, b)
	const min = Math.min(r, g, b)
	const lightness = (max + min) / 2
	if (max === min) return [0, 0, lightness * 100]
	const delta = max - min
	const saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min)
	let hue = max === r ? (g - b) / delta + (g < b ? 6 : 0) : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4
	hue *= 60
	return [hue, saturation * 100, lightness * 100]
}

function hslToHex(hue: number, saturation: number, lightness: number): string {
	const s = saturation / 100
	const l = lightness / 100
	const a = s * Math.min(l, 1 - l)
	const channel = (n: number): number => {
		const k = (n + hue / 30) % 12
		return (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255
	}
	return rgbToHex([channel(0), channel(8), channel(4)])
}

function linearChannels(hex: string): Rgb {
	return hexToRgb(hex).map((value) => {
		const raw = value / 255
		return raw <= 0.04045 ? raw / 12.92 : ((raw + 0.055) / 1.055) ** 2.4
	}) as Rgb
}

function relativeLuminance(hex: string): number {
	const [r, g, b] = linearChannels(hex)
	return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** 兩色的 WCAG 對比（1 到 21）。 */
export function contrastRatio(first: string, second: string): number {
	const a = relativeLuminance(first)
	const b = relativeLuminance(second)
	return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

function toLab(hex: string): Rgb {
	const [r, g, b] = linearChannels(hex)
	const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047
	const y = 0.2126 * r + 0.7152 * g + 0.0722 * b
	const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883
	const f = (t: number): number => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
	return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))]
}

function deltaE(first: string, second: string): number {
	const a = toLab(first)
	const b = toLab(second)
	return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
}

function hueDistance(first: number, second: number): number {
	const difference = Math.abs(first - second) % 360
	return difference > 180 ? 360 - difference : difference
}

// > 取色

/**
 * 從圖片像素取出種子色與展示用色票。
 * @param pixels RGBA 像素（canvas getImageData 的 data）。
 * @returns 種子色、色票與平均亮度；沒有有效像素時回傳 Cubi 藍。
 */
export function extractImagePalette(pixels: Uint8ClampedArray): ImagePalette {
	const buckets = new Map<number, { count: number; r: number; g: number; b: number }>()
	let luminanceSum = 0
	let pixelCount = 0

	for (let index = 0; index < pixels.length; index += 4) {
		// @ 透明像素不是圖片的顏色，略過
		if (pixels[index + 3] < 128) continue
		const [r, g, b] = [pixels[index], pixels[index + 1], pixels[index + 2]]
		luminanceSum += relativeLuminance(rgbToHex([r, g, b]))
		pixelCount += 1
		// @ 每個通道量化成 16 階，相近的顏色歸在同一組
		const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4)
		const bucket = buckets.get(key) ?? { count: 0, r: 0, g: 0, b: 0 }
		bucket.count += 1
		bucket.r += r
		bucket.g += g
		bucket.b += b
		buckets.set(key, bucket)
	}

	if (pixelCount === 0) return { seed: baseThemeColors.light.primary, swatches: [baseThemeColors.light.primary], averageLuminance: 1 }

	// @ 排序依「數量 × 鮮豔度」：只看數量會挑到大片灰色天空，只看鮮豔度會挑到零星雜點
	const ranked = [...buckets.values()]
		.map((bucket) => {
			const rgb: Rgb = [bucket.r / bucket.count, bucket.g / bucket.count, bucket.b / bucket.count]
			const [hue, saturation, lightness] = rgbToHsl(rgb)
			const vividness = (saturation / 100) * (1 - Math.abs(lightness - 50) / 50)
			return { hex: rgbToHex(rgb), hue, lightness, score: bucket.count * (0.15 + vividness) }
		})
		.sort((first, second) => second.score - first.score)

	const picked: typeof ranked = []
	for (const candidate of ranked) {
		const isDistinct = picked.every((item) => hueDistance(item.hue, candidate.hue) > 18 || Math.abs(item.lightness - candidate.lightness) > 25)
		if (isDistinct) picked.push(candidate)
		if (picked.length === 5) break
	}

	return {
		seed: picked[0].hex,
		swatches: picked.map((item) => item.hex),
		averageLuminance: luminanceSum / pixelCount,
	}
}

// > 產生主題

/*
 * - 沿著亮度找出第一個對所有背景都達 AA 的顏色
 * @ 淺色模式往暗找、深色模式往亮找；找不到就用最極端的一個（實務上不會發生）。
 */
function readableColor(hue: number, saturation: number, startLightness: number, mode: ThemeMode, backgrounds: string[]): string {
	const step = mode === 'light' ? -1 : 1
	let color = hslToHex(hue, saturation, startLightness)
	for (let lightness = startLightness; lightness >= 5 && lightness <= 95; lightness += step) {
		color = hslToHex(hue, saturation, lightness)
		if (backgrounds.every((background) => contrastRatio(color, background) >= TEXT_CONTRAST)) return color
	}
	return color
}

interface SemanticRole {
	key: 'error' | 'warning' | 'success'
	// @ 第一個色相是預設主題的色相，後面是與主色撞色時的替代色相
	hues: number[]
	saturation: Record<ThemeMode, number>
}

const SEMANTIC_ROLES: SemanticRole[] = [
	{ key: 'error', hues: [4, 340, 25, 320], saturation: { light: 76, dark: 90 } },
	{ key: 'warning', hues: [40, 50, 30, 60, 20, 14], saturation: { light: 100, dark: 70 } },
	{ key: 'success', hues: [151, 170, 135, 190], saturation: { light: 48, dark: 45 } },
]

// - 列出某個語意色的候選：預設色（若可讀）優先，其後依替代色相排列
function semanticCandidates(role: SemanticRole, mode: ThemeMode, backgrounds: string[]): string[] {
	const base = baseThemeColors[mode][role.key]
	const isReadable = backgrounds.every((background) => contrastRatio(base, background) >= TEXT_CONTRAST)
	const alternatives = role.hues.map((hue) => readableColor(hue, role.saturation[mode], mode === 'light' ? 45 : 70, mode, backgrounds))
	return [...new Set(isReadable ? [base, ...alternatives] : alternatives)]
}

/*
 * - 挑出與主色及彼此都分得開的一組語意色
 * @ 三個語意色一起搜尋，不能逐一貪婪挑選：暖色主色時 error 若先占走橘紅，
 *   warning 就沒有位置了。候選依偏好排序，第一組全部合格的就採用（預設色優先）；
 *   全都不合格時取「最近距離最大」的一組，盡量拉開。
 */
interface SemanticPick {
	colors: Record<SemanticRole['key'], string>
	// @ 主色與三個語意色兩兩之間的最近 ΔE
	distance: number
}

function pickSemantics(primary: string, mode: ThemeMode, backgrounds: string[]): SemanticPick {
	const [errors, warnings, successes] = SEMANTIC_ROLES.map((role) => semanticCandidates(role, mode, backgrounds))
	let best = { error: errors[0], warning: warnings[0], success: successes[0] }
	let bestDistance = -1

	for (const error of errors) {
		for (const warning of warnings) {
			for (const success of successes) {
				const colors = [primary, error, warning, success]
				let distance = Infinity
				for (let i = 0; i < colors.length; i += 1) {
					for (let j = i + 1; j < colors.length; j += 1) distance = Math.min(distance, deltaE(colors[i], colors[j]))
				}
				if (distance > MIN_DELTA_E) return { colors: { error, warning, success }, distance }
				if (distance > bestDistance) {
					best = { error, warning, success }
					bestDistance = distance
				}
			}
		}
	}
	return { colors: best, distance: bestDistance }
}

// @ 主色色相的偏移順序：先試原色相，找不到合格語意色時才逐步遠離
const PRIMARY_HUE_SHIFTS = [0, -12, 12, -24, 24, -36, 36]

/*
 * - 挑出主色與語意色
 * @ 黃、橘色相的主色會和 warning 撞在一起，語意色怎麼換都拉不開（ΔE 只有 18 左右），
 *   這時讓主色色相逐步偏移，取第一組合格的；全都不合格時取最近距離最大的一組。
 */
function pickPrimaryAndSemantics(hue: number, saturation: number, mode: ThemeMode, backgrounds: string[]): { primary: string; pick: SemanticPick } {
	let best: { primary: string; pick: SemanticPick } | null = null
	for (const shift of PRIMARY_HUE_SHIFTS) {
		const primary = readableColor((hue + shift + 360) % 360, saturation, mode === 'dark' ? 70 : 45, mode, backgrounds)
		const pick = pickSemantics(primary, mode, backgrounds)
		if (pick.distance > MIN_DELTA_E) return { primary, pick }
		if (!best || pick.distance > best.pick.distance) best = { primary, pick }
	}
	return best as { primary: string; pick: SemanticPick }
}

function buildColors(seed: string, mode: ThemeMode): Record<string, string> {
	const [seedHue, seedSaturation] = rgbToHsl(hexToRgb(seed))
	const isGrey = seedSaturation < 10
	const hue = isGrey ? FALLBACK_HUE : seedHue
	const saturation = isGrey ? 45 : clamp(seedSaturation, 38, 72)
	const isDark = mode === 'dark'

	// @ 中性色只帶一點點色相，維持紙感，不讓整個介面染成圖片的顏色
	const neutrals = isDark
		? { background: hslToHex(hue, 12, 15), surface: hslToHex(hue, 12, 19), 'surface-variant': hslToHex(hue, 11, 24), ink: hslToHex(hue, 10, 94), outline: hslToHex(hue, 9, 46) }
		: { background: hslToHex(hue, 18, 95), surface: hslToHex(hue, 25, 99), 'surface-variant': hslToHex(hue, 16, 91), ink: hslToHex(hue, 14, 13), outline: hslToHex(hue, 12, 83) }
	const backgrounds = [neutrals.background, neutrals.surface, neutrals['surface-variant']]

	const { primary, pick } = pickPrimaryAndSemantics(hue, saturation, mode, backgrounds)
	const [primaryHue, , primaryLightness] = rgbToHsl(hexToRgb(primary))
	const semantics = pick.colors

	return {
		...baseThemeColors[mode],
		background: neutrals.background,
		surface: neutrals.surface,
		'surface-variant': neutrals['surface-variant'],
		primary,
		'primary-darken-1': hslToHex(primaryHue, saturation, clamp(primaryLightness - 10, 5, 95)),
		...semantics,
		'on-background': neutrals.ink,
		'on-surface': neutrals.ink,
		'on-surface-variant': neutrals.ink,
		outline: neutrals.outline,
	}
}

/**
 * 由圖片色票產生淺／深兩組 Vuetify 主題色與遮罩。
 * @param palette extractImagePalette 的結果。
 * @returns 可直接套用到 Vuetify 主題的顏色與背景遮罩。
 */
export function buildBackdropTheme(palette: ImagePalette): BackdropTheme {
	const luminance = clamp(palette.averageLuminance, 0, 1)
	return {
		themes: {
			light: { dark: false, colors: buildColors(palette.seed, 'light') },
			dark: { dark: true, colors: buildColors(palette.seed, 'dark') },
		},
		// @ 圖越暗，淺色模式要越多白；圖越亮，深色模式要越多黑
		scrim: {
			light: `rgba(245, 244, 240, ${(0.25 + (1 - luminance) * 0.3).toFixed(2)})`,
			dark: `rgba(18, 20, 24, ${(0.4 + luminance * 0.3).toFixed(2)})`,
		},
	}
}

// > 讀取使用者上傳的圖片（瀏覽器限定）

export class BackdropImageError extends Error {}

/**
 * 驗證並讀取背景圖：縮到最長邊 1920px 重新編碼為 JPEG，並取出色票。
 * @ 重新編碼可去掉原檔的 EXIF 等中繼資料，也讓存下來的資料量可控。
 * @param file 使用者選擇的圖片檔。
 * @returns JPEG data URL 與色票。
 * @throws BackdropImageError 檔案類型、大小不符或無法解碼時。
 */
export async function readBackdropImage(file: File): Promise<{ imageUrl: string; palette: ImagePalette }> {
	if (!ACCEPTED_TYPES.includes(file.type)) throw new BackdropImageError('只支援 JPG、PNG 或 WebP 圖片。')
	if (file.size > MAX_FILE_BYTES) throw new BackdropImageError('圖片超過 10 MB，請先壓縮後再上傳。')

	let bitmap: ImageBitmap
	try {
		bitmap = await createImageBitmap(file)
	} catch {
		throw new BackdropImageError('圖片無法讀取，檔案可能已損壞，請換一張再試。')
	}

	try {
		const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height))
		const canvas = document.createElement('canvas')
		canvas.width = Math.max(1, Math.round(bitmap.width * scale))
		canvas.height = Math.max(1, Math.round(bitmap.height * scale))
		canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)

		const sample = document.createElement('canvas')
		sample.width = SAMPLE_SIZE
		sample.height = SAMPLE_SIZE
		const context = sample.getContext('2d', { willReadFrequently: true })
		if (!context) throw new BackdropImageError('瀏覽器無法處理這張圖片，請改用其他瀏覽器再試。')
		context.drawImage(bitmap, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE)

		return {
			imageUrl: canvas.toDataURL('image/jpeg', 0.85),
			palette: extractImagePalette(context.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data),
		}
	} finally {
		bitmap.close()
	}
}
