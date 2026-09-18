import { reactive } from 'vue'

import { getProfile, usageAssignments } from '@/mocks/systemResources'
import type { AnswerStyleId } from '@/types'
import { formatNumber } from '@/utils/format'

// > AI 與檢索設定：問答流程的執行參數。模型本身在系統資源定義，這裡只選用設定檔 id
// TODO(api-integration): 欄位對齊舊版 /v2/model-settings 的 retrieval、prompts；串接時改由後端讀寫

export type AgentToolId = 'search_knowledge' | 'query_document_metadata' | 'read_document'
export type AiSettingsSection = 'routing' | 'channels' | 'merge' | 'rerank' | 'citation' | 'generate' | 'agent' | 'prompt' | 'styles' | 'glossary'
export type AiSettingsTab = 'retrieval' | 'agent' | 'content' | 'history'

export interface AnswerStyleSetting {
	id: AnswerStyleId
	name: string
	instruction: string
	isDefault: boolean
}

export interface AiSettings {
	models: { answer: string; planner: string; rerank: string }
	routing: { localEnabled: boolean; globalEnabled: boolean }
	channels: {
		vectorEnabled: boolean
		vectorTopK: number
		vectorIncludeOldVersions: boolean
		keywordEnabled: boolean
		keywordTopK: number
		keywordIncludeOldVersions: boolean
		graphEnabled: boolean
	}
	/** 語意權重 0–1，關鍵字權重為 1 減去此值。 */
	merge: { vectorWeight: number; candidateLimit: number }
	rerank: { enabled: boolean }
	/** minScore 為 0–1，與後端 minRelevanceScore 一致。 */
	citation: { minScore: number; limit: number }
	agent: { enabled: boolean; ruleShortcutEnabled: boolean; maxSteps: number; budgetSeconds: number; readMaxChars: number; tools: AgentToolId[] }
	prompts: { systemBase: string; styles: AnswerStyleSetting[]; glossary: string[] }
}

export interface AiSettingsChange {
	section: AiSettingsSection
	label: string
	from: string
	to: string
}

export interface AiSettingsRevision {
	id: string
	savedAt: string
	actor: string
	note: string
	changes: AiSettingsChange[]
	/** 儲存前的完整設定，供還原使用。 */
	snapshot: AiSettings
}

export const AI_SETTINGS_TAB_OF: Record<AiSettingsSection, AiSettingsTab> = {
	routing: 'retrieval',
	channels: 'retrieval',
	merge: 'retrieval',
	rerank: 'retrieval',
	citation: 'retrieval',
	generate: 'retrieval',
	agent: 'agent',
	prompt: 'content',
	styles: 'content',
	glossary: 'content',
}

export const AGENT_TOOLS: ReadonlyArray<{ id: AgentToolId; label: string; description: string }> = [
	{ id: 'search_knowledge', label: '知識搜尋', description: '以目前的檢索設定搜尋段落，是回答的主要依據。' },
	{ id: 'query_document_metadata', label: '查詢文件資訊', description: '查文件的版本、生效日期、負責單位等欄位。' },
	{ id: 'read_document', label: '全文讀取', description: '讀取整份文件內容，字數受下方上限限制。' },
]

export const AI_SETTINGS_LIMITS = {
	topK: { min: 1, max: 100 },
	candidateLimit: { min: 1, max: 200 },
	citationLimit: { min: 1, max: 20 },
	maxSteps: { min: 1, max: 10 },
	budgetSeconds: { min: 1, max: 120 },
	readMaxChars: { min: 500, max: 60000 },
	systemBaseMaxLength: 4000,
	instructionMaxLength: 1000,
	glossaryMaxLength: 40,
} as const

function seedSettings(): AiSettings {
	return {
		models: { answer: usageAssignments.answer, planner: usageAssignments.planner, rerank: usageAssignments.rerank },
		routing: { localEnabled: true, globalEnabled: true },
		channels: { vectorEnabled: true, vectorTopK: 20, vectorIncludeOldVersions: false, keywordEnabled: true, keywordTopK: 20, keywordIncludeOldVersions: false, graphEnabled: true },
		merge: { vectorWeight: 0.6, candidateLimit: 30 },
		rerank: { enabled: true },
		citation: { minScore: 0.72, limit: 6 },
		agent: { enabled: true, ruleShortcutEnabled: true, maxSteps: 6, budgetSeconds: 45, readMaxChars: 12000, tools: ['search_knowledge', 'read_document'] },
		prompts: {
			systemBase: '你是公司內部知識助理。只根據檢索到的公司文件回答，每個重點都要標註引用；文件沒有提到的內容，明確說明「目前知識庫沒有相關資料」，不要自行推測。',
			styles: [
				{ id: 'balanced', name: '標準', instruction: '先給結論，再用二到四段說明依據與例外情況。', isDefault: true },
				{ id: 'concise', name: '精簡', instruction: '用三句以內回答，只保留結論與最關鍵的條件。', isDefault: false },
				{ id: 'step-by-step', name: '步驟式', instruction: '以編號步驟說明操作流程，每一步註明負責單位或表單名稱。', isDefault: false },
			],
			glossary: ['Syscom Cubi', 'ACME Cloud', 'Project Alpha', '差旅報支系統', 'HRM 人資系統'],
		},
	}
}

export function cloneAiSettings(settings: AiSettings): AiSettings {
	return JSON.parse(JSON.stringify(settings)) as AiSettings
}

// > 驗證

function outOfRange(value: number, range: { min: number; max: number }): boolean {
	return !Number.isInteger(value) || value < range.min || value > range.max
}

/** 回傳各區塊的第一個錯誤訊息；沒有錯誤時為空物件。 */
export function validateAiSettings(settings: AiSettings): Partial<Record<AiSettingsSection, string>> {
	const errors: Partial<Record<AiSettingsSection, string>> = {}
	const { routing, channels, merge, citation, agent, prompts } = settings
	const L = AI_SETTINGS_LIMITS

	if (!routing.localEnabled && !routing.globalEnabled) errors.routing = '至少要開啟一條問題路線，否則問題無法被處理。'

	if (!channels.vectorEnabled && !channels.keywordEnabled) errors.channels = '語意搜尋與關鍵字搜尋不能同時關閉，否則問答找不到任何文件。'
	else if ((channels.vectorEnabled && outOfRange(channels.vectorTopK, L.topK)) || (channels.keywordEnabled && outOfRange(channels.keywordTopK, L.topK))) errors.channels = `取回份數必須是 ${L.topK.min} 到 ${L.topK.max} 的整數。`

	if (outOfRange(merge.candidateLimit, L.candidateLimit)) errors.merge = `候選上限必須是 ${L.candidateLimit.min} 到 ${L.candidateLimit.max} 的整數。`
	else if (merge.candidateLimit < citation.limit) errors.merge = '候選上限不能少於最多引用筆數。'

	if (settings.rerank.enabled && !getProfile(settings.models.rerank)) errors.rerank = '請選擇重新排序模型，或關閉重新排序。'

	if (citation.minScore < 0 || citation.minScore > 1) errors.citation = '最低分數必須介於 0% 到 100%。'
	else if (outOfRange(citation.limit, L.citationLimit)) errors.citation = `最多引用筆數必須是 ${L.citationLimit.min} 到 ${L.citationLimit.max} 的整數。`

	if (!getProfile(settings.models.answer)) errors.generate = '請選擇回答模型。'

	if (agent.enabled) {
		if (!agent.tools.length) errors.agent = '啟用工具調度時，至少要開放一個工具。'
		else if (outOfRange(agent.maxSteps, L.maxSteps)) errors.agent = `最多呼叫次數必須是 ${L.maxSteps.min} 到 ${L.maxSteps.max} 的整數。`
		else if (outOfRange(agent.budgetSeconds, L.budgetSeconds)) errors.agent = `時間預算必須是 ${L.budgetSeconds.min} 到 ${L.budgetSeconds.max} 秒的整數。`
		else if (outOfRange(agent.readMaxChars, L.readMaxChars)) errors.agent = `全文讀取上限必須是 ${formatNumber(L.readMaxChars.min)} 到 ${formatNumber(L.readMaxChars.max)} 字的整數。`
		else if (!getProfile(settings.models.planner)) errors.agent = '請選擇規劃模型。'
	}

	if (!prompts.systemBase.trim()) errors.prompt = '共用系統提示詞不能空白。'
	else if (prompts.systemBase.length > L.systemBaseMaxLength) errors.prompt = `共用系統提示詞最多 ${formatNumber(L.systemBaseMaxLength)} 字。`

	if (prompts.styles.some((style) => !style.name.trim() || !style.instruction.trim())) errors.styles = '每種回答風格都需要名稱與指令。'
	else if (prompts.styles.some((style) => style.instruction.length > L.instructionMaxLength)) errors.styles = `風格指令最多 ${L.instructionMaxLength} 字。`
	else if (prompts.styles.filter((style) => style.isDefault).length !== 1) errors.styles = '請指定一種預設風格。'

	return errors
}

/** 專有名詞正規化：去頭尾空白、去重（不分大小寫）、濾掉空字串。 */
export function normalizeGlossary(terms: string[]): string[] {
	const seen = new Set<string>()
	return terms.map((term) => term.trim()).filter((term) => {
		const key = term.toLocaleLowerCase('zh-TW')
		if (!term || seen.has(key)) return false
		seen.add(key)
		return true
	})
}

// > 差異摘要：儲存確認與變更紀錄共用

const onOff = (value: boolean): string => (value ? '開啟' : '關閉')
const pct = (value: number): string => `${Math.round(value * 100)}%`
const profileName = (id: string): string => getProfile(id)?.name ?? '未指定'
const toolNames = (tools: AgentToolId[]): string => AGENT_TOOLS.filter((tool) => tools.includes(tool.id)).map((tool) => tool.label).join('、') || '無'
const clip = (text: string): string => (text.length > 24 ? `${text.slice(0, 24)}…` : text)

type FieldSpec = [AiSettingsSection, string, (settings: AiSettings) => string]

const FIELD_SPECS: FieldSpec[] = [
	['routing', '單一主題路線', (s) => onOff(s.routing.localEnabled)],
	['routing', '跨文件路線', (s) => onOff(s.routing.globalEnabled)],
	['channels', '語意搜尋', (s) => onOff(s.channels.vectorEnabled)],
	['channels', '語意搜尋取回份數', (s) => String(s.channels.vectorTopK)],
	['channels', '語意搜尋包含舊版本', (s) => onOff(s.channels.vectorIncludeOldVersions)],
	['channels', '關鍵字搜尋', (s) => onOff(s.channels.keywordEnabled)],
	['channels', '關鍵字搜尋取回份數', (s) => String(s.channels.keywordTopK)],
	['channels', '關鍵字搜尋包含舊版本', (s) => onOff(s.channels.keywordIncludeOldVersions)],
	['channels', '知識圖譜擴充', (s) => onOff(s.channels.graphEnabled)],
	['merge', '語意／關鍵字權重', (s) => `${pct(s.merge.vectorWeight)} / ${pct(1 - s.merge.vectorWeight)}`],
	['merge', '候選上限', (s) => String(s.merge.candidateLimit)],
	['rerank', '重新排序', (s) => onOff(s.rerank.enabled)],
	['rerank', '重新排序模型', (s) => profileName(s.models.rerank)],
	['citation', '引用最低分數', (s) => pct(s.citation.minScore)],
	['citation', '最多引用筆數', (s) => String(s.citation.limit)],
	['generate', '回答模型', (s) => profileName(s.models.answer)],
	['agent', '工具調度', (s) => onOff(s.agent.enabled)],
	['agent', '規則快速判斷', (s) => onOff(s.agent.ruleShortcutEnabled)],
	['agent', '可用工具', (s) => toolNames(s.agent.tools)],
	['agent', '最多呼叫次數', (s) => String(s.agent.maxSteps)],
	['agent', '時間預算', (s) => `${s.agent.budgetSeconds} 秒`],
	['agent', '全文讀取上限', (s) => `${formatNumber(s.agent.readMaxChars)} 字`],
	['agent', '規劃模型', (s) => profileName(s.models.planner)],
	['prompt', '共用系統提示詞', (s) => clip(s.prompts.systemBase)],
	['styles', '預設回答風格', (s) => s.prompts.styles.find((style) => style.isDefault)?.name ?? '未指定'],
	['glossary', '專有名詞', (s) => `${s.prompts.glossary.length} 個`],
]

export function diffAiSettings(base: AiSettings, next: AiSettings): AiSettingsChange[] {
	const changes: AiSettingsChange[] = FIELD_SPECS
		.map(([section, label, read]) => ({ section, label, from: read(base), to: read(next) }))
		.filter((change) => change.from !== change.to)
	// @ 提示詞全文可能只差幾個字，摘要看不出差異，另外比對全文
	if (base.prompts.systemBase !== next.prompts.systemBase && !changes.some((change) => change.section === 'prompt')) changes.push({ section: 'prompt', label: '共用系統提示詞', from: '原內容', to: '已修改內容' })
	for (const style of next.prompts.styles) {
		const before = base.prompts.styles.find((item) => item.id === style.id)
		if (before && (before.name !== style.name || before.instruction !== style.instruction)) changes.push({ section: 'styles', label: `「${before.name}」風格內容`, from: '原內容', to: '已修改內容' })
	}
	const added = next.prompts.glossary.filter((term) => !base.prompts.glossary.includes(term))
	const removed = base.prompts.glossary.filter((term) => !next.prompts.glossary.includes(term))
	const glossaryChange = changes.find((change) => change.section === 'glossary')
	if (added.length || removed.length) {
		const detail = [added.length ? `新增 ${added.join('、')}` : '', removed.length ? `移除 ${removed.join('、')}` : ''].filter(Boolean).join('；')
		if (glossaryChange) glossaryChange.to = `${glossaryChange.to}（${detail}）`
		else changes.push({ section: 'glossary', label: '專有名詞', from: `${base.prompts.glossary.length} 個`, to: `${next.prompts.glossary.length} 個（${detail}）` })
	}
	return changes
}

// > 儲存與還原

export function saveAiSettings(next: AiSettings, actor: string, note = ''): { ok: true; revision: AiSettingsRevision } | { ok: false; message: string } {
	const errors = validateAiSettings(next)
	const firstError = Object.values(errors)[0]
	if (firstError) return { ok: false, message: firstError }
	const normalized = cloneAiSettings(next)
	normalized.prompts.glossary = normalizeGlossary(normalized.prompts.glossary)
	normalized.prompts.systemBase = normalized.prompts.systemBase.trim()
	const changes = diffAiSettings(aiSettingsState.current, normalized)
	if (!changes.length) return { ok: false, message: '沒有需要儲存的變更。' }
	const revision: AiSettingsRevision = { id: crypto.randomUUID(), savedAt: new Date().toISOString(), actor, note: note.trim(), changes, snapshot: cloneAiSettings(aiSettingsState.current) }
	aiSettingsState.current = normalized
	aiSettingsState.revisions.unshift(revision)
	// @ 問答類模型選用與系統資源共用同一份指派，系統資源頁的「使用中」才會即時反映
	usageAssignments.answer = normalized.models.answer
	usageAssignments.planner = normalized.models.planner
	usageAssignments.rerank = normalized.models.rerank
	return { ok: true, revision }
}

/** 還原到某次儲存前的設定；會產生一筆新的變更紀錄，而不是刪除歷史。 */
export function restoreAiSettingsRevision(revisionId: string, actor: string): { ok: true; revision: AiSettingsRevision } | { ok: false; message: string } {
	const target = aiSettingsState.revisions.find((revision) => revision.id === revisionId)
	if (!target) return { ok: false, message: '找不到這筆變更紀錄。' }
	return saveAiSettings(target.snapshot, actor, `還原 ${new Date(target.savedAt).toLocaleString('zh-TW', { hour12: false })} 之前的設定`)
}

// > 狀態與假資料變更紀錄（初始化會呼叫 diffAiSettings，須放在 FIELD_SPECS 之後）

interface RevisionSeed {
	daysAgo: number
	actor: string
	note: string
	/** 把「儲存後」的設定改回「儲存前」 */
	undo: (settings: AiSettings) => void
}

// @ 假資料：由新到舊，每筆描述這次儲存改了什麼；往回套用 undo 推出儲存前的快照
const REVISION_SEEDS: RevisionSeed[] = [
	{ daysAgo: 1, actor: '林怡君', note: '回饋「海外住宿上限」找不到附表，門檻略降', undo: (s) => { s.citation.minScore = 0.78 } },
	{ daysAgo: 3, actor: '陳建宏', note: '新增兩個系統名稱，避免模型改寫成英文縮寫', undo: (s) => { s.prompts.glossary = s.prompts.glossary.filter((term) => term !== '差旅報支系統' && term !== 'HRM 人資系統') } },
	{ daysAgo: 6, actor: '林怡君', note: '表單編號類問題常漏找，提高關鍵字權重並擴大候選', undo: (s) => { s.merge.vectorWeight = 0.7; s.merge.candidateLimit = 20; s.channels.keywordTopK = 10 } },
	{ daysAgo: 9, actor: '王大同', note: '開放全文讀取，處理整份辦法的比較題', undo: (s) => { s.agent.tools = ['search_knowledge']; s.agent.maxSteps = 4; s.agent.budgetSeconds = 30 } },
	{ daysAgo: 14, actor: '陳建宏', note: '回答模型改用 GPT-4.1 mini，Qwen 本機版回答過短', undo: (s) => { s.models.answer = 'llm-economy'; s.citation.limit = 4 } },
	{ daysAgo: 21, actor: '林怡君', note: '', undo: (s) => { s.prompts.systemBase = '你是公司內部知識助理，請根據檢索到的文件回答問題並標註引用。'; s.channels.graphEnabled = false } },
	{ daysAgo: 30, actor: '系統管理員', note: '上線初始設定：啟用重新排序', undo: (s) => { s.rerank.enabled = false; s.routing.globalEnabled = false } },
]

function seedRevisions(current: AiSettings): AiSettingsRevision[] {
	let after = cloneAiSettings(current)
	return REVISION_SEEDS.map((seed, index) => {
		const before = cloneAiSettings(after)
		seed.undo(before)
		const revision: AiSettingsRevision = {
			id: `rev-seed-${index + 1}`,
			savedAt: new Date(Date.now() - seed.daysAgo * 86_400_000 - (index * 37 + 90) * 60_000).toISOString(),
			actor: seed.actor,
			note: seed.note,
			changes: diffAiSettings(before, after),
			snapshot: before,
		}
		after = before
		return revision
	})
}

function seedState(): { current: AiSettings; revisions: AiSettingsRevision[] } {
	const current = seedSettings()
	return { current, revisions: seedRevisions(current) }
}

export const aiSettingsState = reactive<{ current: AiSettings; revisions: AiSettingsRevision[] }>(seedState())

/** 測試用：回到初始設定與變更紀錄。 */
export function resetAiSettingsState(): void {
	const seed = seedState()
	aiSettingsState.current = seed.current
	aiSettingsState.revisions = seed.revisions
}
