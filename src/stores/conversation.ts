import { defineStore } from 'pinia'

import { citations, conversationHistory } from '@/mocks/data'
import type { AnswerSegment, ConversationMessage, ConversationSummary, ThinkingStage } from '@/types'

interface ConversationState {
	messages: ConversationMessage[]
	isResponding: boolean
	selectedScope: string
	selectedKnowledgeSourceId: string
	selectedSourceDefaultWebSearch: boolean
	webSearchOverride: boolean | null
	errorMessage: string
	thinkingStages: ThinkingStage[]
	retrievedCount: number
	conversations: ConversationSummary[]
	activeConversationId: string | null
	historyKeyword: string
	onlyArchived: boolean
}

// > 可視化階段：正式串接後改由後端串流事件驅動，這裡先以固定節奏模擬
const STAGE_PLAN = [
	{ id: 'parse', label: '解析問題', detail: '拆解語意、時間範圍與適用對象', plannedMs: 220 },
	{ id: 'retrieve', label: '檢索知識庫', detail: '', plannedMs: 760 },
	{ id: 'compare', label: '比對版本', detail: '確認生效版本與適用範圍', plannedMs: 420 },
	{ id: 'generate', label: '生成回答', detail: '整理內容並標註引用來源', plannedMs: 0 },
] as const

const SEARCHABLE_DOCUMENT_TOTAL = 1284
const STREAM_TICK_MS = 16
const STREAM_CHUNK_SIZE = 2

const SEARCH_RESULT_LIMIT = 20

// - 釘選優先，其次依更新時間新到舊
function comparePinnedFirst(left: ConversationSummary, right: ConversationSummary): number {
	if (left.isPinned !== right.isPinned) return left.isPinned ? -1 : 1
	return right.updatedAt.localeCompare(left.updatedAt)
}

// - 標題與回答預覽都納入比對，忽略大小寫
function matchesKeyword({ conversation, keyword }: { conversation: ConversationSummary; keyword: string }): boolean {
	const normalized = keyword.toLowerCase()
	return conversation.title.toLowerCase().includes(normalized) || conversation.previewAnswer.toLowerCase().includes(normalized)
}

function createStagePlan(): ThinkingStage[] {
	return STAGE_PLAN.map((stage) => ({ id: stage.id, label: stage.label, detail: stage.detail, status: 'pending', elapsedMs: 0 }))
}

// @ jsdom 與部分舊環境沒有 matchMedia，需先判斷再呼叫
function prefersReducedMotion(): boolean {
	return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function delay({ ms }: { ms: number }): Promise<void> {
	return new Promise((resolve) => window.setTimeout(resolve, ms))
}

/**
 * 將含有 [n] 標記的回答內容拆成文字與引用片段。
 * 以片段陣列渲染可避免使用 v-html，杜絕 XSS。
 * @param content 回答原文。
 * @returns 依序排列的文字與引用片段。
 */
export function parseAnswerSegments({ content }: { content: string }): AnswerSegment[] {
	const segments: AnswerSegment[] = []
	const pattern = /\[(\d+)\]/g
	let lastIndex = 0
	let match = pattern.exec(content)

	while (match !== null) {
		if (match.index > lastIndex) segments.push({ type: 'text', value: content.slice(lastIndex, match.index) })
		segments.push({ type: 'citation', index: Number(match[1]) })
		lastIndex = match.index + match[0].length
		match = pattern.exec(content)
	}

	if (lastIndex < content.length) segments.push({ type: 'text', value: content.slice(lastIndex) })
	return segments
}

// - 依日期分組標籤，供歷史對話清單顯示
export function formatHistoryTime({ isoDate }: { isoDate: string }): string {
	const target = new Date(isoDate)
	if (Number.isNaN(target.getTime())) return isoDate

	const timeText = target.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false })
	return `${String(target.getMonth() + 1).padStart(2, '0')}/${String(target.getDate()).padStart(2, '0')} ${timeText}`
}

function createMockAnswer(question: string, scope: string): ConversationMessage {
	const normalizedQuestion = question.toLowerCase()
	let content = `我在「${scope}」範圍內找到幾份可能相關的資料 [1]。這是展示回答；正式環境會依實際檢索結果整理答案並附上對應引用。`
	if (normalizedQuestion.includes('出差') || normalizedQuestion.includes('住宿') || normalizedQuestion.includes('差旅')) {
		content = '依目前有效的差旅辦法 [1]，國內住宿每晚原則上限為新台幣 3,000 元。若遇特殊地區或旺季，請在出差申請時事先說明。出差結束後，需在十個工作天內完成核銷並附上有效憑證 [2]。'
	} else if (normalizedQuestion.includes('新進') || normalizedQuestion.includes('到職')) {
		content = '新進同仁第一週應完成公司帳號啟用、設備點交、資訊安全訓練及主管安排的到職會談 [1]。完整清單請參考《新進同仁到職指南》。'
	} else if (normalizedQuestion.includes('資安') || normalizedQuestion.includes('客戶資料')) {
		content = '客戶資料需依分級申請存取權限 [1]，對外分享前必須確認接收者、用途與保存期限。若發現異常存取，請立即通知資訊安全部 [2]。'
	}

	return {
		id: crypto.randomUUID(),
		role: 'assistant',
		content,
		createdAt: new Date().toISOString(),
		citations,
	}
}

// - 逐段輸出回答內容，模擬 token 串流
async function streamInto({ message, content }: { message: ConversationMessage; content: string }): Promise<void> {
	for (let index = STREAM_CHUNK_SIZE; index < content.length; index += STREAM_CHUNK_SIZE) {
		message.content = content.slice(0, index)
		await delay({ ms: STREAM_TICK_MS })
	}
	message.content = content
}

export const useConversationStore = defineStore('conversation', {
	state: (): ConversationState => ({
		messages: [],
		isResponding: false,
		selectedScope: '自動判斷',
		selectedKnowledgeSourceId: 'company',
		selectedSourceDefaultWebSearch: false,
		webSearchOverride: null,
		errorMessage: '',
		thinkingStages: [],
		retrievedCount: 0,
		conversations: conversationHistory.map((conversation) => ({ ...conversation })),
		activeConversationId: null,
		historyKeyword: '',
		onlyArchived: false,
	}),
	getters: {
		isWebSearchEnabled(state): boolean {
			return state.webSearchOverride ?? state.selectedSourceDefaultWebSearch
		},
		webSearchSettingSource(state): 'default' | 'override' {
			return state.webSearchOverride === null ? 'default' : 'override'
		},
		// - 目前正在串流的回答訊息，用來決定顯示完整流程或收合摘要
		streamingMessage(state): ConversationMessage | null {
			const lastMessage = state.messages[state.messages.length - 1]
			return lastMessage?.role === 'assistant' && lastMessage.isStreaming ? lastMessage : null
		},
		completedStages(state): ThinkingStage[] {
			return state.thinkingStages.filter((stage) => stage.status === 'done')
		},
		// - 套用關鍵字與封存篩選，並讓釘選的對話置頂
		filteredConversations(state): ConversationSummary[] {
			const keyword = state.historyKeyword.trim()
			return state.conversations
				.filter((conversation) => {
					if (state.onlyArchived !== conversation.isArchived) return false
					if (!keyword) return true
					return matchesKeyword({ conversation, keyword })
				})
				.sort(comparePinnedFirst)
		},
		pinnedConversations(): ConversationSummary[] {
			return (this.filteredConversations as ConversationSummary[]).filter((conversation) => conversation.isPinned)
		},
		unpinnedConversations(): ConversationSummary[] {
			return (this.filteredConversations as ConversationSummary[]).filter((conversation) => !conversation.isPinned)
		},
	},
	actions: {
		selectKnowledgeSource({ id, name, defaultWebSearchEnabled }: { id: string; name: string; defaultWebSearchEnabled: boolean }): void {
			this.selectedKnowledgeSourceId = id
			this.selectedScope = name
			this.selectedSourceDefaultWebSearch = defaultWebSearchEnabled
			this.webSearchOverride = null
		},
		syncSelectedSourceDefault({ id, defaultWebSearchEnabled }: { id: string; defaultWebSearchEnabled: boolean }): void {
			if (this.selectedKnowledgeSourceId !== id) return
			this.selectedSourceDefaultWebSearch = defaultWebSearchEnabled
		},
		setWebSearchEnabled(isEnabled: boolean): void {
			this.webSearchOverride = isEnabled
		},
		resetWebSearchToDefault(): void {
			this.webSearchOverride = null
		},
		async askQuestion(question: string): Promise<void> {
			const trimmedQuestion = question.trim()
			if (!trimmedQuestion || this.isResponding) return

			this.messages.push({
				id: crypto.randomUUID(),
				role: 'user',
				content: trimmedQuestion,
				createdAt: new Date().toISOString(),
			})
			this.isResponding = true
			this.errorMessage = ''
			this.retrievedCount = 0
			this.thinkingStages = createStagePlan()

			const isReducedMotion = prefersReducedMotion()
			const askStartTime = Date.now()

			try {
				// TODO(api-integration): 改為串接 AI 串流回答 API，階段狀態由後端事件推送。
				const searchDescription = this.isWebSearchEnabled ? `${this.selectedScope}＋網路搜尋` : this.selectedScope
				const answer = createMockAnswer(trimmedQuestion, searchDescription)

				// > 前置階段：解析、檢索、比對版本
				for (const [index, stage] of this.thinkingStages.entries()) {
					if (stage.id === 'generate') break

					stage.status = 'active'
					if (stage.id === 'retrieve') this.retrievedCount = SEARCHABLE_DOCUMENT_TOTAL

					const startTime = Date.now()
					await delay({ ms: isReducedMotion ? 0 : STAGE_PLAN[index].plannedMs })
					stage.elapsedMs = Date.now() - startTime
					stage.status = 'done'
				}

				// > 生成階段：先推入空白訊息，再逐字補齊內容
				const generateStage = this.thinkingStages[this.thinkingStages.length - 1]
				generateStage.status = 'active'
				const generateStartTime = Date.now()

				this.messages.push({
					id: answer.id,
					role: 'assistant',
					content: '',
					createdAt: answer.createdAt,
					isStreaming: !isReducedMotion,
				})
				const liveMessage = this.messages[this.messages.length - 1]

				if (isReducedMotion) liveMessage.content = answer.content
				else await streamInto({ message: liveMessage, content: answer.content })

				generateStage.elapsedMs = Date.now() - generateStartTime
				generateStage.status = 'done'

				liveMessage.isStreaming = false
				liveMessage.citations = answer.citations
				// @ 文件數需對 documentId 去重，同一份文件的多段引用只算一份
				const citedDocumentIds = new Set((answer.citations ?? []).map((citation) => citation.documentId))
				liveMessage.trace = {
					documentCount: citedDocumentIds.size,
					citationCount: answer.citations?.length ?? 0,
					retrievedCount: this.retrievedCount,
					elapsedMs: Date.now() - askStartTime,
					stages: this.thinkingStages.map((stage) => ({ ...stage })),
				}

				this.syncActiveConversation({ question: trimmedQuestion, answer: liveMessage.content })
			} catch {
				this.errorMessage = '目前無法產生回答，請稍後重新送出問題。'
			} finally {
				this.isResponding = false
			}
		},
		// - 將本次問答同步回歷史清單，沒有進行中的對話就開一筆新的
		syncActiveConversation({ question, answer }: { question: string; answer: string }): void {
			const existing = this.conversations.find((conversation) => conversation.id === this.activeConversationId)
			if (existing) {
				existing.messageCount = this.messages.length
				existing.previewAnswer = answer
				existing.updatedAt = new Date().toISOString()
				return
			}

			const created: ConversationSummary = {
				id: crypto.randomUUID(),
				title: question,
				updatedAt: new Date().toISOString(),
				messageCount: this.messages.length,
				previewAnswer: answer,
				isPinned: false,
				isArchived: false,
			}
			this.conversations.unshift(created)
			this.activeConversationId = created.id
		},
		/**
		 * 開啟既有對話。
		 * @ 後端還沒有對話儲存 API，目前以重新提問模擬取回內容。
		 * @param conversationId 對話識別碼。
		 */
		async openConversation(conversationId: string): Promise<void> {
			const target = this.conversations.find((conversation) => conversation.id === conversationId)
			if (!target || this.isResponding) return

			this.activeConversationId = conversationId
			this.messages = []
			this.thinkingStages = []
			this.retrievedCount = 0
			this.errorMessage = ''
			// TODO(api-integration): 改為向後端取回該對話的完整訊息，而非重新提問。
			await this.askQuestion(target.title)
		},
		startNewConversation(): void {
			this.messages = []
			this.thinkingStages = []
			this.retrievedCount = 0
			this.errorMessage = ''
			this.activeConversationId = null
		},
		toggleArchive(conversationId: string): void {
			const target = this.conversations.find((conversation) => conversation.id === conversationId)
			if (!target) return
			target.isArchived = !target.isArchived
		},
		togglePin(conversationId: string): void {
			const target = this.conversations.find((conversation) => conversation.id === conversationId)
			if (!target) return
			target.isPinned = !target.isPinned
		},
		/**
		 * 重新命名對話。空白名稱會被忽略，避免產生無標題的項目。
		 * @param conversationId 對話識別碼。
		 * @param title 新的名稱。
		 */
		renameConversation({ conversationId, title }: { conversationId: string; title: string }): void {
			const trimmedTitle = title.trim()
			if (!trimmedTitle) return
			const target = this.conversations.find((conversation) => conversation.id === conversationId)
			if (!target) return
			// TODO(api-integration): 串接後改為呼叫更新對話標題 API。
			target.title = trimmedTitle
		},
		// - 供命令面板使用：跨封存狀態搜尋，釘選優先
		searchConversations(keyword: string): ConversationSummary[] {
			const trimmedKeyword = keyword.trim()
			if (!trimmedKeyword) {
				return this.conversations.filter((conversation) => !conversation.isArchived).sort(comparePinnedFirst).slice(0, SEARCH_RESULT_LIMIT)
			}
			return this.conversations
				.filter((conversation) => matchesKeyword({ conversation, keyword: trimmedKeyword }))
				.sort(comparePinnedFirst)
				.slice(0, SEARCH_RESULT_LIMIT)
		},
		clearConversation(): void {
			this.messages = []
			this.thinkingStages = []
			this.retrievedCount = 0
		},
	},
})
