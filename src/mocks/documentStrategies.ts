import { reactive } from 'vue'

import { getAssignedProfile, getProfile, type AiProfile, type UsageId } from '@/mocks/systemResources'
import { processingStages, type ProcessingStageId } from '@/mocks/documentProcessing'
import { workspaceDocuments } from '@/mocks/documentWorkspace'
import type { UserDocumentSource } from '@/types'

/** 策略參數；不同策略用到的欄位不同，未使用的欄位維持預設值。 */
export interface StrategyOptions {
	maxChunkLength: number
	chunkOverlap: number
	splitAtEveryHeading: boolean
	useBuiltinHeadings: boolean
	customHeadings: string
	/** 指定的系統資源設定檔；null 代表沿用上一層（全域未指定時用系統預設）。 */
	resourceProfileId: string | null
	summaryLength: string
}

export const DEFAULT_STRATEGY_OPTIONS: StrategyOptions = {
	maxChunkLength: 800,
	chunkOverlap: 120,
	splitAtEveryHeading: false,
	useBuiltinHeadings: true,
	customHeadings: '',
	resourceProfileId: null,
	summaryLength: '中等（約 300 字）',
}

/** 單一步驟的策略設定。 */
export interface StageStrategy {
	strategyId: string
	options: StrategyOptions
}

export interface StrategyConfig {
	stages: Record<string, StageStrategy>
}

type StageOverrides = Partial<Record<string, StageStrategy>>

function createDefaultConfig(): StrategyConfig {
	return {
		stages: Object.fromEntries(processingStages.map((stage) => [
			stage.id,
			{ strategyId: stage.strategies[0]!.id, options: { ...DEFAULT_STRATEGY_OPTIONS } },
		])),
	}
}

// > 檔案類型：全域與文件之間的中間層
export interface FileTypeGroup {
	id: string
	name: string
	description: string
	/** 對應的副檔名（小寫、不含點）；網頁與貼上文字依來源類型判斷，不看副檔名。 */
	extensions: string[]
}

export const fileTypeGroups: FileTypeGroup[] = [
	{ id: 'pdf', name: 'PDF', description: '.pdf，含掃描檔與圖片型 PDF。', extensions: ['pdf'] },
	{ id: 'word', name: 'Word 文件', description: '.doc、.docx', extensions: ['doc', 'docx'] },
	{ id: 'sheet', name: '試算表', description: '.xls、.xlsx、.csv', extensions: ['xls', 'xlsx', 'csv'] },
	{ id: 'slide', name: '簡報', description: '.ppt、.pptx', extensions: ['ppt', 'pptx'] },
	{ id: 'text', name: '純文字與 Markdown', description: '.txt、.md，以及直接貼上的文字。', extensions: ['txt', 'md'] },
	{ id: 'web', name: '網頁擷取', description: '以網址建立的文件。', extensions: [] },
]

/** 依來源判斷檔案類型；不在清單內的副檔名回傳 undefined，代表直接沿用全域。 */
export function getFileTypeId(source: UserDocumentSource | undefined): string | undefined {
	if (!source) return undefined
	if (source.type === 'url') return 'web'
	if (source.type === 'text') return 'text'
	const extension = source.extension.toLowerCase().replace(/^\./, '')
	return fileTypeGroups.find((group) => group.extensions.includes(extension))?.id
}

/** 依副檔名判斷檔案類型，供附件使用；url 與 text 視為網頁擷取與純文字。 */
export function getFileTypeIdByExtension(extension: string): string | undefined {
	const normalized = extension.toLowerCase().replace(/^\./, '')
	if (normalized === 'url') return 'web'
	if (normalized === 'text') return 'text'
	return fileTypeGroups.find((group) => group.extensions.includes(normalized))?.id
}

export function getFileTypeName(fileTypeId: string | undefined): string {
	return fileTypeGroups.find((group) => group.id === fileTypeId)?.name ?? '未分類檔案類型'
}

/** 取得文件對應的檔案類型代號。 */
export function getDocumentFileTypeId(documentId: string): string | undefined {
	return getFileTypeId(workspaceDocuments.find((document) => document.id === documentId)?.source)
}

/** 全域策略：沒有檔案類型設定、也沒有文件設定時的最終預設。 */
export const globalStrategyConfig = reactive<StrategyConfig>(createDefaultConfig())

/** 逐檔案類型覆寫；只有被覆寫的步驟會出現在這裡。 */
export const fileTypeStrategyOverrides = reactive<Record<string, StageOverrides>>({})

/** 檔案類型是否已開啟策略覆寫（關閉時整組沿用全域）。 */
export const fileTypeOverrideEnabled = reactive<Record<string, boolean>>({})

/** 逐文件覆寫；只有被覆寫的步驟會出現在這裡。 */
export const documentStrategyOverrides = reactive<Record<string, StageOverrides>>({})

/** 文件是否已開啟策略覆寫（關閉時整組沿用檔案類型或全域）。 */
export const documentOverrideEnabled = reactive<Record<string, boolean>>({})

export type StrategySource = 'document' | 'fileType' | 'global'

export const strategySourceLabels: Record<StrategySource, string> = {
	document: '文件',
	fileType: '檔案類型',
	global: '全域',
}

export interface ResolvedStage {
	stageId: ProcessingStageId
	stageName: string
	strategyId: string
	strategyName: string
	options: StrategyOptions
	source: StrategySource
}

function getEnabledFileTypeOverrides(fileTypeId: string | undefined): StageOverrides | undefined {
	return fileTypeId && fileTypeOverrideEnabled[fileTypeId] ? fileTypeStrategyOverrides[fileTypeId] : undefined
}

/**
 * 取得每個步驟實際生效的策略與來源，優先順序：文件 > 檔案類型 > 全域。
 * - 只給 documentId：自動依文件來源判斷檔案類型。
 * - 只給 fileTypeId：檢視某檔案類型的設定（供編輯檔案類型策略用）。
 * - 都不給：全域設定。
 */
export function resolveStrategy(documentId?: string, fileTypeId?: string): ResolvedStage[] {
	const documentOverrides = documentId && documentOverrideEnabled[documentId] ? documentStrategyOverrides[documentId] : undefined
	const typeOverrides = getEnabledFileTypeOverrides(fileTypeId ?? (documentId ? getDocumentFileTypeId(documentId) : undefined))
	return processingStages.map((stage) => {
		const documentOverride = documentOverrides?.[stage.id]
		const typeOverride = typeOverrides?.[stage.id]
		const base = documentOverride ?? typeOverride ?? globalStrategyConfig.stages[stage.id]!
		return {
			stageId: stage.id,
			stageName: stage.name,
			strategyId: base.strategyId,
			strategyName: stage.strategies.find((strategy) => strategy.id === base.strategyId)?.name ?? base.strategyId,
			options: { ...base.options },
			source: documentOverride ? 'document' : typeOverride ? 'fileType' : 'global',
		}
	})
}

/** 取得「移除目前這一層」後會沿用的設定：文件往上是檔案類型或全域，檔案類型往上是全域。 */
export function resolveInheritedStrategy(documentId?: string): ResolvedStage[] {
	return resolveStrategy(undefined, documentId ? getDocumentFileTypeId(documentId) : undefined)
}

/** 取得每個步驟目前生效的策略名稱，供處理進度等唯讀畫面顯示。 */
export function getStrategyNames(documentId?: string): Record<string, string> {
	return Object.fromEntries(resolveStrategy(documentId).map((stage) => [stage.stageId, stage.strategyName]))
}

/** 寫入一批步驟設定；documentId 優先，其次 fileTypeId，都省略時寫入全域。 */
export function saveStrategy(
	stages: Array<{ stageId: string; strategyId: string; options: StrategyOptions }>,
	documentId?: string,
	fileTypeId?: string,
): void {
	for (const stage of stages) {
		const value: StageStrategy = { strategyId: stage.strategyId, options: { ...stage.options } }
		if (documentId) {
			documentStrategyOverrides[documentId] ??= {}
			documentStrategyOverrides[documentId][stage.stageId] = value
		} else if (fileTypeId) {
			fileTypeStrategyOverrides[fileTypeId] ??= {}
			fileTypeStrategyOverrides[fileTypeId][stage.stageId] = value
		} else {
			globalStrategyConfig.stages[stage.stageId] = value
		}
	}
}

/** 移除單一步驟的覆寫，恢復使用上一層設定。 */
export function removeStageOverride(documentId: string | undefined, stageId: string, fileTypeId?: string): void {
	const overrides = documentId ? documentStrategyOverrides[documentId] : fileTypeId ? fileTypeStrategyOverrides[fileTypeId] : undefined
	if (!overrides) return
	delete overrides[stageId]
}

/** 將策略參數整理成人看得懂的摘要，只列出該策略用得到的欄位。 */
export function describeOptions(stageId: string, strategyId: string, options: StrategyOptions): string[] {
	const hasOptions = processingStages.find((stage) => stage.id === stageId)?.strategies.find((strategy) => strategy.id === strategyId)?.hasOptions
	if (!hasOptions) return []
	if (stageId === 'chunk') {
		const lines = [`最大 ${options.maxChunkLength} 字`, `重疊 ${options.chunkOverlap} 字`]
		if (strategyId === 'heading_aware' && options.splitAtEveryHeading) lines.push('每個標題起新段')
		return lines
	}
	if (stageId === 'summarize') return [options.summaryLength]
	return []
}

// > 策略與系統資源的對應：模型與解析參數不再逐步驟填寫，只選設定檔
// @ builtin、auto、graph_off 與建索引策略不呼叫系統資源，因此不在對應表中
const strategyUsages: Record<string, UsageId> = {
	ocr: 'parse',
	docling: 'parse',
	default_embed: 'embed',
	multilingual: 'embed',
	long_context: 'embed',
	entity_relation: 'graph',
	topic_only: 'graph',
	key_points: 'summarize',
	per_section: 'summarize',
	qa_pairs: 'summarize',
}

/** 取得策略會呼叫的用途；不使用系統資源的策略回傳 undefined。 */
export function getStrategyUsage(strategyId: string): UsageId | undefined {
	return strategyUsages[strategyId]
}

/** 取得步驟實際使用的設定檔：步驟有指定就用指定的，否則沿用系統預設。 */
export function resolveStageProfile(strategyId: string, options: StrategyOptions): AiProfile | undefined {
	const usageId = getStrategyUsage(strategyId)
	if (!usageId) return undefined
	return getProfile(options.resourceProfileId) ?? getAssignedProfile(usageId)
}

/** 計算有多少檔案類型或文件的策略直接指定了這個設定檔，供刪除前檢查與影響說明。 */
export function countProfileStrategyReferences(profileId: string): number {
	const layers: StageOverrides[] = [globalStrategyConfig.stages, ...Object.values(fileTypeStrategyOverrides), ...Object.values(documentStrategyOverrides)]
	return layers.filter((layer) => Object.values(layer).some((stage) => stage?.options.resourceProfileId === profileId)).length
}

/** 檢查切段參數；回傳空字串代表通過。 */
export function chunkOptionsError(options: StrategyOptions): string {
	if (!Number.isInteger(options.maxChunkLength) || options.maxChunkLength < 100 || options.maxChunkLength > 4000) {
		return '最大段落長度必須為 100 到 4,000 的整數。'
	}
	if (!Number.isInteger(options.chunkOverlap) || options.chunkOverlap < 0 || options.chunkOverlap >= options.maxChunkLength) {
		return '重疊字數必須為非負整數，且小於最大段落長度。'
	}
	return ''
}

// > 策略變更待重跑：文件層策略改了之後，要重新處理才會生效
// @ 只追蹤文件層；全域與檔案類型的變更影響面太大，一律只對之後的處理生效，不自動標記既有文件。
export const pendingStrategyStages = reactive<Record<string, string[]>>({})

/** 記錄某文件有哪些步驟的策略已變更、尚未重跑。 */
export function markStrategyChanged(documentId: string, stageIds: string[]): void {
	const merged = new Set([...(pendingStrategyStages[documentId] ?? []), ...stageIds])
	pendingStrategyStages[documentId] = processingStages.map((stage) => stage.id).filter((id) => merged.has(id))
}

export function clearStrategyChanged(documentId: string): void {
	delete pendingStrategyStages[documentId]
}

/** 取得要重跑時最早的起始步驟；沒有待重跑的變更時回傳 undefined。 */
export function getEarliestPendingStage(documentId: string): ProcessingStageId | undefined {
	return pendingStrategyStages[documentId]?.[0] as ProcessingStageId | undefined
}
