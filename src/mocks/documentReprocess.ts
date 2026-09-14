import { enqueueDocumentProcessing, getDocumentProcessingRecord, hasEditedChunks, processingStages, reprocessJob, type ProcessingStageId } from '@/mocks/documentProcessing'
import { clearStrategyChanged, getEarliestPendingStage } from '@/mocks/documentStrategies'
import { getWorkspaceVersions, workspaceDocuments } from '@/mocks/documentWorkspace'
import type { DocumentProcessingRecord } from '@/types'

/** 批次起始步驟：'auto' 依各文件狀況決定，其餘為統一指定的步驟。 */
export type BatchStartStage = 'auto' | ProcessingStageId

/**
 * 批次處理的版本範圍。
 * - all：所有版本，含歷史版本（預設）；問答與檢索會用到歷史版本，各版本要用同一套策略的結果。
 * - active：只跑目前有效版本＋比它新、尚未發布的版本；歷史版本維持舊策略的結果。
 */
export type BatchVersionScope = 'active' | 'all'

/** ready 重跑既有工作、create 替沒有紀錄的版本建立新工作，其餘為略過原因。 */
export type BatchPlanStatus = 'ready' | 'create' | 'running' | 'archived'

export interface BatchPlanItem {
	documentId: string
	title: string
	version: string
	/** 版本角色，供畫面說明。 */
	versionRole: '有效版本' | '待發布新版本' | '歷史版本'
	status: BatchPlanStatus
	jobId?: string
	fromStage: ProcessingStageId
	/** 文件有策略變更待套用；策略屬於整份文件，每個版本都會標。 */
	hasPendingStrategy: boolean
	/** 這次重跑會覆蓋人工修改過的切塊（主文件或任一附件）。 */
	overwritesChunks: boolean
}

function getStageIndex(stageId: string | undefined): number {
	return processingStages.findIndex((stage) => stage.id === stageId)
}

/** 比較版本號（1.10 > 1.9）；回傳正數代表 left 較新。 */
export function compareVersions(left: string, right: string): number {
	const a = left.split('.').map(Number)
	const b = right.split('.').map(Number)
	for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
		const gap = (a[index] ?? 0) - (b[index] ?? 0)
		if (gap) return gap
	}
	return 0
}

/** 工作仍在佇列或處理中：沒取消、沒失敗、也還沒完成。 */
export function isJobActive(record: DocumentProcessingRecord): boolean {
	const attachmentsRunning = (record.files ?? []).some((file) => file.role === '附件' && (file.state === '進行中' || file.state === '等待中'))
	return !record.cancelled && !record.failureReason && (record.progress < 100 || attachmentsRunning)
}

/** 判斷文件目前有效版本是否仍在處理中；處理中的文件不能核准發布。 */
export function isDocumentProcessing(documentId: string): boolean {
	const document = workspaceDocuments.find((item) => item.id === documentId)
	const record = document ? getDocumentProcessingRecord(documentId, document.version) : undefined
	return Boolean(record && isJobActive(record))
}

/** 單一版本未指定起始步驟時的預設：失敗步驟 > 最早變更策略的步驟 > 只改過切塊從向量化 > 從頭。 */
export function getAutoStartStage(record: DocumentProcessingRecord): ProcessingStageId {
	const failed = record.steps.find((step) => step.state === '失敗')
	if (failed) return failed.id as ProcessingStageId
	const pending = getEarliestPendingStage(record.documentId)
	if (pending) return pending
	if (hasEditedChunks(record.documentId, record.version)) return 'embed'
	return 'parse'
}

export function planBatchReprocess(documentIds: string[], startStage: BatchStartStage, versionScope: BatchVersionScope): BatchPlanItem[] {
	return documentIds.flatMap((documentId): BatchPlanItem[] => {
		const document = workspaceDocuments.find((item) => item.id === documentId)
		if (!document) return []
		const versions = getWorkspaceVersions(document)
			.map((entry) => entry.version)
			.filter((version) => versionScope === 'all' || compareVersions(version, document.version) >= 0)
			.sort((left, right) => compareVersions(right, left))

		return versions.map((version): BatchPlanItem => {
			const isEffective = version === document.version
			const versionRole = isEffective ? '有效版本' : compareVersions(version, document.version) > 0 ? '待發布新版本' : '歷史版本'
			const record = getDocumentProcessingRecord(documentId, version)
			const hasPendingStrategy = Boolean(getEarliestPendingStage(documentId))
			const base = { documentId, title: document.title, version, versionRole, jobId: record?.jobId, hasPendingStrategy } as const
			// @ 已下架的文件使用者看不到，批次重跑只是浪費資源；真的需要時到文件詳細頁個別處理
			if (document.status === '已下架') return { ...base, status: 'archived', fromStage: 'parse', overwritesChunks: false }
			if (!record) return { ...base, status: 'create', fromStage: 'parse', overwritesChunks: false }
			const fromStage = startStage === 'auto' ? getAutoStartStage(record) : startStage
			const overwritesChunks = getStageIndex(fromStage) <= getStageIndex('chunk') && (hasEditedChunks(documentId, version)
				|| (record.files ?? []).some((file) => file.role === '附件' && hasEditedChunks(documentId, version, file.id)))
			return { ...base, status: isJobActive(record) ? 'running' : 'ready', fromStage, overwritesChunks }
		})
	})
}

/** 取得文件的版本數，用來判斷一次重跑是否涵蓋所有版本。 */
export function getVersionCount(documentId: string): number {
	const document = workspaceDocuments.find((item) => item.id === documentId)
	return document ? getWorkspaceVersions(document).length : 0
}

/**
 * 判斷這批項目是否已讓某文件「所有版本」都套用新策略：每個版本都有排入，且起跑點涵蓋最早變更的步驟。
 * 歷史版本也會被檢索，只跑部分版本時標記要保留，提醒還有版本停在舊策略。
 */
function coversAllVersions(documentId: string, items: BatchPlanItem[]): boolean {
	const pending = getEarliestPendingStage(documentId)
	if (!pending) return false
	const queued = items.filter((item) => item.documentId === documentId && (item.status === 'ready' || item.status === 'create'))
	return queued.length === getVersionCount(documentId)
		&& queued.every((item) => item.status === 'create' || getStageIndex(item.fromStage) <= getStageIndex(pending))
}

/** 執行批次重跑；只處理 ready 與 create 的項目，回傳實際排入的版本數。 */
export function runBatchReprocess(plan: BatchPlanItem[]): number {
	const clearable = new Set(plan.map((item) => item.documentId).filter((documentId) => coversAllVersions(documentId, plan)))
	let queued = 0
	for (const item of plan) {
		if (item.status === 'create') {
			const owner = workspaceDocuments.find((document) => document.id === item.documentId)?.owner ?? ''
			enqueueDocumentProcessing(item.documentId, item.version, owner)
			queued += 1
			continue
		}
		if (item.status !== 'ready' || !item.jobId) continue
		reprocessJob(item.jobId, item.fromStage, `批次重新處理，從「${processingStages[getStageIndex(item.fromStage)]?.name}」開始。`)
		queued += 1
	}
	for (const documentId of clearable) clearStrategyChanged(documentId)
	return queued
}

/** 文件層策略變更後重跑這份文件的所有版本，從最早變更的步驟開始；回傳排入的版本數。 */
export function reprocessAllVersions(documentId: string, fromStage: ProcessingStageId): number {
	return runBatchReprocess(planBatchReprocess([documentId], fromStage, 'all'))
}
