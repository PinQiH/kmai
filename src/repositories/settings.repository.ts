import { APPEARANCE_STORAGE_KEY, settingsState, syncAppearanceFromStorage } from '@/mocks/systemSettings'
import type { AppearanceDefaults, BrandSettings } from '@/mocks/systemSettings'

/*
 * > 系統設定：品牌與全公司預設外觀
 * @ 目前仍以 Mock 狀態保存，外觀另外暫存於 localStorage（前後台分頁需要同步）。
 * TODO(api-integration): 改為呼叫 GET /api/v2/admin/branding 與對應的外觀設定 API。
 */

// @ 外觀暫存的 localStorage 鍵；App 監聽 storage 事件時需要比對
export { APPEARANCE_STORAGE_KEY, syncAppearanceFromStorage }

/** 取得目前的品牌設定。 */
export function getBrandSettings(): BrandSettings {
	return settingsState.brand
}

/** 取得全公司預設外觀。 */
export function getAppearanceDefaults(): AppearanceDefaults {
	return settingsState.appearance
}
