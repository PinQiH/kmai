import { citations, conversationFolders, conversationHistory, conversationMessagesById } from '@/mocks/data'

// @ 其餘展示用資料（文件、知識來源等）原樣轉接
export * from '@/mocks/data'
import type { Citation, ConversationFolder, ConversationMessage, ConversationSummary } from '@/types'

// > 前台問答的初始資料；store 以此建立自己的狀態，不直接依賴 Mock 資料來源
// TODO(api-integration): 改為呼叫 GET /api/v2/portal 底下的對話紀錄 API。

/** 取得對話清單快照。 */
export function getConversationHistorySnapshot(): ConversationSummary[] {
	return conversationHistory.map((conversation) => ({ ...conversation }))
}

/** 取得各對話的訊息快照。 */
export function getConversationMessagesSnapshot(): Record<string, ConversationMessage[]> {
	return Object.fromEntries(
		Object.entries(conversationMessagesById).map(([conversationId, messages]) => [
			conversationId,
			messages.map((message) => ({ ...message })),
		]),
	)
}

/** 取得對話資料夾快照。 */
export function getConversationFoldersSnapshot(): ConversationFolder[] {
	return conversationFolders.map((folder) => ({ ...folder }))
}

/** 取得展示用的預設引用。 */
export function getDemoCitationsSnapshot(): Citation[] {
	return citations.map((citation) => ({ ...citation }))
}
