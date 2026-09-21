import { adminQuestionRecords } from '@/mocks/adminQuestions'
import type { AdminQuestionRecord } from '@/types'

// @ 假資料沒有網路延遲，加上固定延遲讓載入狀態在展示環境看得見
const MOCK_DELAY_MS = 320

/**
 * 取得管理端 AI 問答紀錄。
 * 前端 Mock 階段仍以獨立資料集模擬管理端 API，避免誤用目前使用者的對話 store。
 * @returns 問答紀錄；每次都回傳獨立副本。
 */
export async function fetchAdminQuestionRecords(): Promise<AdminQuestionRecord[]> {
	// TODO(api-integration): 改為呼叫後端問答紀錄 API。
	await new Promise((resolve) => window.setTimeout(resolve, MOCK_DELAY_MS))
	return readQuestionRecords()
}

function readQuestionRecords(): AdminQuestionRecord[] {
	return adminQuestionRecords.map((record) => ({
		...record,
		citations: record.citations.map((citation) => ({ ...citation })),
		scopedDocuments: record.scopedDocuments.map((document) => ({ ...document })),
		tokenUsage: record.tokenUsage ? { ...record.tokenUsage } : null,
		trace: record.trace
			? {
				...record.trace,
				stages: record.trace.stages.map((stage) => ({ ...stage })),
			}
			: null,
	}))
}
