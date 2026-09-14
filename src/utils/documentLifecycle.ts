import type { DocumentProcessingRecord, DocumentStatus } from '@/types'

/**
 * 文件生命週期：上傳 → 處理 → 審核 → 發布。
 * 「失敗」停在處理階段，「已下架」則是發布後被停用，兩者都不是新的順序，而是既有階段的結果。
 */
export const DOCUMENT_LIFECYCLE_STAGES = [
	{ id: 'upload', step: 1, name: '已上傳', description: '檔案與文件資訊已送出，等待系統處理。' },
	{ id: 'process', step: 2, name: '系統處理', description: '文字抽取、切段、向量化、建索引、知識圖譜、AI 摘要與品質診斷依序執行。' },
	{ id: 'review', step: 3, name: '人工審核', description: '處理完成，等維護人員確認內容與可見範圍。' },
	{ id: 'publish', step: 4, name: '已發布', description: '使用者可在知識庫搜尋與閱讀這份文件。' },
] as const

export const DOCUMENT_LIFECYCLE_TOTAL_STEPS = DOCUMENT_LIFECYCLE_STAGES.length

export type DocumentLifecycleTone = 'info' | 'warning' | 'success' | 'error' | 'secondary'

export interface DocumentLifecycleState {
	/** 目前所在階段（1–4），供徽章顯示「第 n 步」。 */
	step: number
	stageName: string
	tone: DocumentLifecycleTone
	icon: string
	/** 一句話說明現在發生什麼事。 */
	headline: string
	/** 一句話說明下一步該由誰做什麼。 */
	nextAction: string
	/** 需要人介入才會前進。 */
	needsAttention: boolean
	/** 已離開正常流程（下架）。 */
	isRetired: boolean
}

const lifecycleByStatus: Record<DocumentStatus, DocumentLifecycleState> = {
	處理中: {
		step: 2,
		stageName: '系統處理',
		tone: 'info',
		icon: 'mdi-progress-clock',
		headline: '系統正在解析與建立索引',
		nextAction: '處理完成後會自動轉為待審核，不需要人工操作。',
		needsAttention: false,
		isRetired: false,
	},
	失敗: {
		step: 2,
		stageName: '處理失敗',
		tone: 'error',
		icon: 'mdi-alert-circle-outline',
		headline: '處理在系統階段中斷',
		nextAction: '查看失敗原因，排除後重新執行處理。',
		needsAttention: true,
		isRetired: false,
	},
	待審核: {
		step: 3,
		stageName: '人工審核',
		tone: 'warning',
		icon: 'mdi-clipboard-text-clock-outline',
		headline: '系統處理已完成，等待人工確認',
		nextAction: '確認內容與可見範圍後發布，使用者才看得到。',
		needsAttention: true,
		isRetired: false,
	},
	已發布: {
		step: 4,
		stageName: '已發布',
		tone: 'success',
		icon: 'mdi-check-circle-outline',
		headline: '使用者可搜尋與閱讀',
		nextAction: '內容有變動時上傳新版本，會重新走一次處理與審核。',
		needsAttention: false,
		isRetired: false,
	},
	已下架: {
		step: 4,
		stageName: '已下架',
		tone: 'secondary',
		icon: 'mdi-archive-off-outline',
		headline: '曾經發布，目前已停止提供',
		nextAction: '確認仍適用時可重新發布，確定不再使用則刪除。',
		needsAttention: false,
		isRetired: true,
	},
}

/** 由文件狀態判讀生命週期位置與下一步。 */
export function getDocumentLifecycle(status: DocumentStatus): DocumentLifecycleState {
	return lifecycleByStatus[status]
}

// @ 列表預設順序：先讓人看到卡住的文件，再看進行中的，最後才是已完成與已下架。
const listPriorityByStatus: Record<DocumentStatus, number> = {
	失敗: 0,
	待審核: 1,
	處理中: 2,
	已發布: 3,
	已下架: 4,
}

/** 取得列表排序權重，數字越小越需要先處理。 */
export function getDocumentStatusPriority(status: DocumentStatus): number {
	return listPriorityByStatus[status]
}

/** 依處理紀錄組出一句可直接顯示的進度摘要。 */
export function getProcessingSummary(record: DocumentProcessingRecord | undefined): string {
	if (!record) return '沒有處理紀錄'
	const failedStep = record.steps.find((step) => step.state === '失敗')
	if (failedStep) return `${failedStep.name}失敗 · ${failedStep.detail}`
	const runningStep = record.steps.find((step) => step.state === '進行中')
	if (runningStep) return `${runningStep.name} · ${runningStep.detail}`
	const waitingStep = record.steps.find((step) => step.state === '等待中')
	if (waitingStep) return `${waitingStep.name} · ${waitingStep.detail}`
	return '所有處理步驟皆已完成'
}
