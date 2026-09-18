import { reactive } from 'vue'

import type { ThemePreference } from '@/theme'
import type { ImagePalette } from '@/utils/imagePalette'
import type { DocumentVersionEntry } from '@/types'

// > 系統設定：品牌外觀、全公司預設外觀、系統版本公告、隱私權政策
// TODO(api-integration): 改呼叫後端 system settings API；目前狀態只存在前端記憶體，重新整理會還原
// @ 前台（側欄、登入頁、瀏覽器標題、帳號頁的「版本與隱私」）都直接讀這份狀態，改了立即生效
// @ 設定異動的稽核紀錄由後端寫入「系統紀錄」，這裡不另外保存

export type ReleaseStatus = 'draft' | 'published'
export type FieldErrors = Record<string, string>
export type Result = { ok: true } | { ok: false; errors: FieldErrors }

export interface BrandSettings {
	systemName: string
	/** 一般使用者端側欄與登入頁的副標題。 */
	portalName: string
	/** 管理後台側欄的副標題。 */
	adminName: string
	/** null 代表使用內建 Logo。 */
	logoDataUrl: string | null
	logoFileName: string | null
}

export interface SystemBackdrop {
	// @ readBackdropImage 重新編碼的 JPEG data URL，不是原始檔
	imageUrl: string
	fileName: string
	palette: ImagePalette
}

export interface AppearanceDefaults {
	themePreference: ThemePreference
	// @ 全系統共用、只能由後台設定；null 表示使用預設配色
	backdrop: SystemBackdrop | null
}

export interface SystemRelease {
	id: string
	version: string
	date: string
	author: string
	summary: string
	/** Markdown 格式的更新內容。 */
	notes: string
	status: ReleaseStatus
}

export interface PrivacyPolicy {
	/** Markdown 格式。 */
	content: string
	revision: number
	publishedAt: string
	publishedBy: string
}

export interface PrivacyDraft {
	content: string
	updatedAt: string
	updatedBy: string
}

export const SYSTEM_NAME_MAX = 30
export const SUBTITLE_MAX = 20
export const LOGO_MAX_BYTES = 512 * 1024
export const LOGO_TYPES = ['image/png', 'image/svg+xml', 'image/webp']
export const SUMMARY_MAX = 120
export const NOTES_MAX = 4000
export const PRIVACY_MAX = 8000
// @ 語意化版本：主.次.修，不接受前置 v 或預發布標記，避免排序與公告混亂
const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
// TODO(api-integration): 改由登入身分取得
export const ACTOR = '林怡君'

export const THEME_PREFERENCE_LABELS: Record<ThemePreference, string> = { system: '跟隨作業系統', light: '淺色', dark: '深色' }
export const RELEASE_STATUS_LABELS: Record<ReleaseStatus, string> = { draft: '草稿', published: '已發布' }

const DEFAULT_PRIVACY = `## 蒐集目的

Syscom Cubi 僅在授權範圍內處理公司知識與使用紀錄，用於提供**搜尋、問答、系統安全及服務改善**。

## 保存與查詢

- 使用者的提問、回饋與操作紀錄會依公司治理規範保存。
- 如需查詢或更正個人資料，請聯絡系統管理員。`

function createInitialState() {
	return {
		brand: { systemName: 'Syscom Cubi', portalName: '凌群知識庫', adminName: '管理後台', logoDataUrl: null, logoFileName: null } as BrandSettings,
		appearance: { themePreference: 'system', backdrop: null } as AppearanceDefaults,
		releases: [
			{ id: 'rel-030', version: '0.3.0', date: '', author: '系統管理團隊', summary: '新增自動回信與使用者存取管理。', notes: '- 新增**自動回信**管理頁\n- 使用者、角色與群組可直接在後台維護', status: 'draft' },
			{ id: 'rel-020', version: '0.2.0', date: '2026-08-18', author: '系統管理團隊', summary: '新增個人筆記本與文件範圍控制，並改善導覽體驗。', notes: '- 新增個人筆記本與文件上傳介面\n- 加入筆記本分享與成員權限設定\n- 問答頁可限定知識來源與指定文件', status: 'published' },
			{ id: 'rel-010', version: '0.1.0', date: '2026-08-14', author: '系統管理團隊', summary: 'Syscom Cubi 知識管理平台第一個展示版本。', notes: '- 提供企業知識搜尋與 AI 問答\n- 支援文件版本與引用追溯\n- 建立管理端健康度與處理監控', status: 'published' },
			{ id: 'rel-005', version: '0.0.5', date: '2026-08-01', author: '產品開發團隊', summary: '完成內部測試版本，確認主要知識查詢流程。', notes: '- 完成側邊導覽與權限路由\n- 加入文件列表與搜尋結果頁\n- 建立淺色及深色主題', status: 'published' },
		] as SystemRelease[],
		privacy: { content: DEFAULT_PRIVACY, revision: 1, publishedAt: '2026-07-01T09:00:00+08:00', publishedBy: '系統管理團隊' } as PrivacyPolicy,
		privacyDraft: null as PrivacyDraft | null,
		/** 已被取代的舊版，新到舊排列；只增不改，供稽核查閱。 */
		privacyHistory: [] as PrivacyPolicy[],
	}
}

export const settingsState = reactive(createInitialState())

export function resetSettingsState(): void {
	Object.assign(settingsState, createInitialState())
}

let sequence = 0
function nextId(prefix: string): string {
	sequence += 1
	return `${prefix}-${Date.now().toString(36)}-${sequence}`
}

function today(): string {
	return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Taipei' }).format(new Date())
}

// > 版本比較：依主.次.修逐段比數字，不能用字串比較（0.10.0 > 0.9.0）
export function compareVersions(a: string, b: string): number {
	const pa = a.split('.').map(Number)
	const pb = b.split('.').map(Number)
	for (let index = 0; index < 3; index += 1) {
		const diff = (pa[index] ?? 0) - (pb[index] ?? 0)
		if (diff) return diff
	}
	return 0
}

export function getSortedReleases(): SystemRelease[] {
	return [...settingsState.releases].sort((a, b) => compareVersions(b.version, a.version))
}

export function getCurrentRelease(): SystemRelease | null {
	return getSortedReleases().find((release) => release.status === 'published') ?? null
}

/** 帳號頁只看得到已發布版本，最新一版標示為目前版本。 */
export function getPublishedReleaseHistory(): DocumentVersionEntry[] {
	const current = getCurrentRelease()
	return getSortedReleases()
		.filter((release) => release.status === 'published')
		.map((release) => ({ version: release.version, date: release.date, author: release.author, summary: release.summary, changes: [], notes: release.notes, isCurrent: release.id === current?.id }))
}

// > 品牌

export function validateBrand(input: Pick<BrandSettings, 'systemName' | 'portalName' | 'adminName'>): FieldErrors {
	const errors: FieldErrors = {}
	const systemName = input.systemName.trim()
	if (!systemName) errors.systemName = '請輸入系統名稱。'
	else if (systemName.length > SYSTEM_NAME_MAX) errors.systemName = `系統名稱最多 ${SYSTEM_NAME_MAX} 個字。`
	const subtitles = [['portalName', input.portalName, '前台副標題'], ['adminName', input.adminName, '後台副標題']] as const
	for (const [key, value, label] of subtitles) {
		if (!value.trim()) errors[key] = `請輸入${label}。`
		else if (value.trim().length > SUBTITLE_MAX) errors[key] = `${label}最多 ${SUBTITLE_MAX} 個字。`
	}
	return errors
}

export function validateLogoFile(file: Pick<File, 'type' | 'size'>): string | null {
	if (!LOGO_TYPES.includes(file.type)) return '只接受 PNG、SVG 或 WebP 圖檔。'
	if (file.size > LOGO_MAX_BYTES) return `圖檔需小於 ${LOGO_MAX_BYTES / 1024} KB。`
	return null
}

export function saveBrand(input: BrandSettings): Result {
	const errors = validateBrand(input)
	if (Object.keys(errors).length) return { ok: false, errors }
	settingsState.brand = {
		systemName: input.systemName.trim(),
		portalName: input.portalName.trim(),
		adminName: input.adminName.trim(),
		logoDataUrl: input.logoDataUrl,
		logoFileName: input.logoFileName,
	}
	return { ok: true }
}

// > 預設外觀

/*
 * > 預設外觀的本機暫存
 * @ 後台「切換到前台」是開新頁面，整個應用重新載入，只放記憶體的設定會遺失；
 *   先存在 localStorage，前後台分頁與重新整理後都讀得到。
 * TODO(api-integration): 接後端後改由設定 API 讀寫，移除這段暫存
 * !! 讀回的資料視為不可信：imageUrl 會放進 CSS url()，只接受 base64 JPEG data URL，
 *    否則被竄改的暫存值可以注入任意 CSS。
 */
export const APPEARANCE_STORAGE_KEY = 'km.appearance-defaults'

const HEX_COLOR = /^#[0-9A-F]{6}$/i
const JPEG_DATA_URL = /^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/

function isStoredBackdrop(value: unknown): value is SystemBackdrop {
	if (!value || typeof value !== 'object') return false
	const backdrop = value as Partial<SystemBackdrop>
	const palette = backdrop.palette
	return typeof backdrop.imageUrl === 'string'
		&& JPEG_DATA_URL.test(backdrop.imageUrl)
		&& typeof backdrop.fileName === 'string'
		&& !!palette
		&& typeof palette.seed === 'string' && HEX_COLOR.test(palette.seed)
		&& Array.isArray(palette.swatches) && palette.swatches.every((color) => typeof color === 'string' && HEX_COLOR.test(color))
		&& typeof palette.averageLuminance === 'number' && Number.isFinite(palette.averageLuminance)
}

/** 讀取本機暫存的預設外觀；沒有資料、格式不符或無法存取時回傳 null。 */
export function readStoredAppearance(): AppearanceDefaults | null {
	try {
		const raw = localStorage.getItem(APPEARANCE_STORAGE_KEY)
		if (!raw) return null
		const value = JSON.parse(raw) as Partial<AppearanceDefaults>
		if (!['system', 'light', 'dark'].includes(value.themePreference as string)) return null
		if (value.backdrop !== null && !isStoredBackdrop(value.backdrop)) return null
		return { themePreference: value.themePreference as ThemePreference, backdrop: value.backdrop }
	} catch {
		return null
	}
}

// - 以本機暫存覆蓋目前的預設外觀；沒有暫存時維持原值
export function syncAppearanceFromStorage(): void {
	const stored = readStoredAppearance()
	if (stored) settingsState.appearance = stored
}

/**
 * 儲存預設外觀。
 * @returns 失敗時的錯誤訊息；成功回傳 null。
 */
export function saveAppearanceDefaults(input: AppearanceDefaults): string | null {
	const next: AppearanceDefaults = { themePreference: input.themePreference, backdrop: input.backdrop }
	try {
		localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(next))
	} catch {
		// @ 多半是背景圖超過瀏覽器的儲存上限（約 5 MB）
		return '瀏覽器儲存空間不足，無法保存這張背景圖，請改用較小的圖片。'
	}
	settingsState.appearance = next
	return null
}

syncAppearanceFromStorage()

// > 版本

export interface ReleaseInput {
	version: string
	summary: string
	notes: string
}

export function validateRelease(input: ReleaseInput, editingId: string | null): FieldErrors {
	const errors: FieldErrors = {}
	const version = input.version.trim()
	if (!VERSION_PATTERN.test(version)) errors.version = '版本號格式為「主.次.修」，例如 0.3.0。'
	else if (settingsState.releases.some((release) => release.id !== editingId && release.version === version)) errors.version = `版本 ${version} 已存在。`
	else {
		const current = getCurrentRelease()
		// @ 新版本號必須大於已發布的最新版本，否則帳號頁的「目前版本」會倒退
		const editing = settingsState.releases.find((release) => release.id === editingId)
		if (current && editing?.status !== 'published' && compareVersions(version, current.version) <= 0) errors.version = `需大於目前版本 ${current.version}。`
	}
	if (!input.summary.trim()) errors.summary = '請用一句話說明這一版的重點。'
	else if (input.summary.trim().length > SUMMARY_MAX) errors.summary = `摘要最多 ${SUMMARY_MAX} 個字。`
	if (!input.notes.trim()) errors.notes = '請填寫這一版的更新內容。'
	else if (input.notes.trim().length > NOTES_MAX) errors.notes = `更新內容最多 ${NOTES_MAX} 個字。`
	return errors
}

export function createReleaseDraft(input: ReleaseInput): { ok: true; id: string } | { ok: false; errors: FieldErrors } {
	const errors = validateRelease(input, null)
	if (Object.keys(errors).length) return { ok: false, errors }
	const id = nextId('rel')
	settingsState.releases.push({ id, version: input.version.trim(), date: '', author: ACTOR, summary: input.summary.trim(), notes: input.notes.trim(), status: 'draft' })
	return { ok: true, id }
}

export function updateRelease(id: string, input: ReleaseInput): Result {
	const release = settingsState.releases.find((item) => item.id === id)
	if (!release) return { ok: false, errors: { form: '找不到這個版本，可能已被刪除。' } }
	// @ 已發布版本只允許修正文字，版本號鎖定，避免使用者看過的公告版號被改掉
	const version = release.status === 'published' ? release.version : input.version.trim()
	const errors = validateRelease({ ...input, version }, id)
	if (Object.keys(errors).length) return { ok: false, errors }
	Object.assign(release, { version, summary: input.summary.trim(), notes: input.notes.trim() })
	return { ok: true }
}

export function publishRelease(id: string): Result {
	const release = settingsState.releases.find((item) => item.id === id)
	if (!release || release.status !== 'draft') return { ok: false, errors: { form: '只有草稿可以發布。' } }
	const errors = validateRelease(release, id)
	if (Object.keys(errors).length) return { ok: false, errors }
	release.status = 'published'
	release.date = today()
	return { ok: true }
}

export function deleteReleaseDraft(id: string): Result {
	const index = settingsState.releases.findIndex((item) => item.id === id)
	if (index < 0 || settingsState.releases[index].status !== 'draft') return { ok: false, errors: { form: '已發布的版本不能刪除。' } }
	settingsState.releases.splice(index, 1)
	return { ok: true }
}

// > 隱私權政策：草稿與已發布內容分開，發布前使用者看到的永遠是上一版

export function validatePrivacy(content: string): string | null {
	const text = content.trim()
	if (!text) return '政策內容不可空白。'
	if (text.length > PRIVACY_MAX) return `政策內容最多 ${PRIVACY_MAX} 個字。`
	return null
}

export function savePrivacyDraft(content: string): Result {
	const error = validatePrivacy(content)
	if (error) return { ok: false, errors: { content: error } }
	settingsState.privacyDraft = { content: content.trim(), updatedAt: new Date().toISOString(), updatedBy: ACTOR }
	return { ok: true }
}

export function publishPrivacyDraft(): Result {
	const draft = settingsState.privacyDraft
	if (!draft) return { ok: false, errors: { form: '沒有可發布的草稿。' } }
	if (draft.content === settingsState.privacy.content) return { ok: false, errors: { form: '草稿與目前發布內容相同，不需要發布。' } }
	settingsState.privacyHistory.unshift({ ...settingsState.privacy })
	settingsState.privacy = { content: draft.content, revision: settingsState.privacy.revision + 1, publishedAt: new Date().toISOString(), publishedBy: ACTOR }
	settingsState.privacyDraft = null
	return { ok: true }
}

export function discardPrivacyDraft(): void {
	settingsState.privacyDraft = null
}

export function formatSettingsTime(value: string): string {
	const date = new Date(value)
	if (Number.isNaN(date.getTime())) return '—'
	return new Intl.DateTimeFormat('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Taipei' }).format(date)
}
