import { citations } from '@/mocks/data'
import type { Citation, KnowledgeSourceOption } from '@/types'

export interface MockAssistantAnswer {
	content: string
	citations: Citation[]
}

interface CreateMockAssistantAnswerInput {
	question: string
	pageTitle: string
	source: KnowledgeSourceOption
	webSearchEnabled: boolean
}

/**
 * 產生後台短效小幫手的前端 Mock 回答。
 * @param input 問題、頁面脈絡與知識來源快照。
 * @returns Mock 回答及可顯示的引用。
 */
export function createMockAdminAssistantAnswer(input: CreateMockAssistantAnswerInput): MockAssistantAnswer {
	const normalizedQuestion = input.question.toLocaleLowerCase('zh-TW')
	let content = `我會以「${input.source.name}」協助這項管理工作。你可以請我草擬通知、整理內容、設計測試問題，或彙整成可交付的格式。`

	if (normalizedQuestion.includes('怎麼') || normalizedQuestion.includes('如何')) {
		content = '可以。請提供目標、對象、限制條件與希望的輸出格式；我會先整理需求，再產出可直接檢查或修改的草稿。若內容涉及停用、刪除或大量變更，我也會列出需要人工確認的風險。'
	} else if (normalizedQuestion.includes('通知') || normalizedQuestion.includes('公告') || normalizedQuestion.includes('範本')) {
		content = '以下是一份可調整的通知範本：\n\n【標題】系統維護通知\n【對象】受影響的使用者\n【內容】系統預計於指定時段進行維護，期間部分服務可能暫時無法使用。\n【影響時間】請填入開始與結束時間\n【使用者行動】請提前儲存作業，並於維護完成後重新登入。\n【聯絡窗口】請填入負責單位與聯絡方式。'
	} else if (normalizedQuestion.includes('文件')) {
		content = '文件管理工作可先整理成「目的、文件範圍、版本、發布狀態、可見對象、負責人與預定時間」七個欄位。我也可以依你提供的資料產出審核清單、公告草稿或批次處理說明。'
	}

	if (input.webSearchEnabled) content += '這次回答也套用了網路搜尋的單次覆寫設定。'
	return {
		content,
		citations: input.source.kind === 'model' ? [] : citations.slice(0, 2).map((citation) => ({ ...citation })),
	}
}
