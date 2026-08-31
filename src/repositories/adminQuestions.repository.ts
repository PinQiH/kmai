import { adminQuestionRecords } from '@/mocks/adminQuestions'
import type { AdminQuestionRecord } from '@/types'

/**
 * 取得管理端 AI 問答紀錄快照。
 * 前端 Mock 階段仍以獨立資料集模擬管理端 API，避免誤用目前使用者的對話 store。
 */
export function getAdminQuestionRecordsSnapshot(): AdminQuestionRecord[] {
	return adminQuestionRecords.map((record) => ({
		...record,
		citations: record.citations.map((citation) => ({ ...citation })),
		trace: record.trace
			? {
				...record.trace,
				stages: record.trace.stages.map((stage) => ({ ...stage })),
			}
			: null,
	}))
}
