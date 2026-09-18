import { afterEach, describe, expect, it } from 'vitest'

import {
	APPEARANCE_STORAGE_KEY,
	readStoredAppearance,
	resetSettingsState,
	saveAppearanceDefaults,
	settingsState,
	type SystemBackdrop,
} from '@/mocks/systemSettings'

/*
 * > 預設外觀的本機暫存
 * @ 起因：後台「切換到前台」會開新頁面，只放記憶體的背景圖在前台消失。
 * !! imageUrl 會放進 CSS url()，讀回時必須擋掉非 JPEG data URL 的值。
 */

const backdrop: SystemBackdrop = {
	imageUrl: 'data:image/jpeg;base64,/9j/AAAA',
	fileName: 'sunset.jpg',
	palette: { seed: '#C8577A', swatches: ['#C8577A', '#2B2F63'], averageLuminance: 0.3 },
}

afterEach(() => {
	localStorage.clear()
	resetSettingsState()
})

describe('預設外觀本機暫存', () => {
	it('01. 儲存後可在重新載入時讀回（模擬前台新分頁）', () => {
		expect(saveAppearanceDefaults({ themePreference: 'dark', backdrop })).toBeNull()

		expect(settingsState.appearance.backdrop?.fileName).toBe('sunset.jpg')
		expect(readStoredAppearance()).toEqual({ themePreference: 'dark', backdrop })
	})

	it('02. 移除背景圖後讀回的是 null，不會殘留舊圖', () => {
		saveAppearanceDefaults({ themePreference: 'system', backdrop })
		saveAppearanceDefaults({ themePreference: 'system', backdrop: null })

		expect(readStoredAppearance()?.backdrop).toBeNull()
	})

	it('03. 被竄改成非 JPEG data URL 的暫存值一律忽略', () => {
		const tampered = [
			{ ...backdrop, imageUrl: 'https://evil.example/x.jpg' },
			{ ...backdrop, imageUrl: 'data:image/jpeg;base64,AAAA"); background: url("https://evil.example' },
			{ ...backdrop, palette: { ...backdrop.palette, seed: 'red; color: red' } },
		]
		for (const value of tampered) {
			localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify({ themePreference: 'light', backdrop: value }))
			expect(readStoredAppearance(), value.imageUrl).toBeNull()
		}
	})

	it('04. 暫存內容不是合法 JSON 時回傳 null，不讓頁面壞掉', () => {
		localStorage.setItem(APPEARANCE_STORAGE_KEY, '{not json')

		expect(readStoredAppearance()).toBeNull()
	})
})
