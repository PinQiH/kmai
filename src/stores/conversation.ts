import { defineStore } from 'pinia'

import { citations, conversationFolders, conversationHistory, conversationMessagesById } from '@/mocks/data'
import type {
	AnswerModelId,
	AnswerFeedback,
	AnswerFeedbackValue,
	AnswerSegment,
	AnswerSettings,
	AnswerStyleId,
	Citation,
	ConversationFolder,
	ConversationMessage,
	ConversationSummary,
	ThinkingStage,
} from '@/types'
import { DEFAULT_ANSWER_MODEL_ID, DEFAULT_ANSWER_STYLE_ID, getAnswerModelLabel, getAnswerStyleLabel } from '@/utils/answerSettings'
import { DEFAULT_ASK_SOURCE, MODEL_ONLY_SOURCE_ID } from '@/utils/knowledgeSources'

interface ConversationState {
	messages: ConversationMessage[]
	isResponding: boolean
	selectedScope: string
	selectedKnowledgeSourceId: string
	selectedDocuments: SelectedKnowledgeDocument[]
	selectedAnswerStyleId: AnswerStyleId
	selectedAnswerModelId: AnswerModelId
	errorMessage: string
	thinkingStages: ThinkingStage[]
	retrievedCount: number
	conversations: ConversationSummary[]
	conversationMessagesById: Record<string, ConversationMessage[]>
	activeConversationId: string | null
	historyKeyword: string
	onlyArchived: boolean
	folders: ConversationFolder[]
	selectedFolderId: FolderFilterId
	selectedConversationIds: string[]
}

/** 資料夾篩選值：兩個系統項目（全部／未分類）或實際的資料夾 id。 */
export type FolderFilterId = typeof ALL_FOLDER_ID | typeof UNFILED_FOLDER_ID | string

interface SelectedKnowledgeDocument {
	id: string
	name: string
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
export const ANSWER_FEEDBACK_REASON_MAX_LENGTH = 500

// @ 系統項目用保留字而非 null：v-for 的 key 與 aria-current 都需要一個可比對的字串
export const ALL_FOLDER_ID = 'all'
export const UNFILED_FOLDER_ID = 'unfiled'
export const FOLDER_NAME_MAX_LENGTH = 30

/** 資料夾操作的結果；UI 依此決定要顯示的訊息。 */
export type FolderMutationResult = 'ok' | 'empty-name' | 'too-long' | 'duplicated' | 'not-found'

// - 名稱比對統一去頭尾空白並忽略大小寫，避免出現肉眼看不出差異的兩個資料夾
function normalizeFolderName(name: string): string {
	return name.trim().toLocaleLowerCase()
}

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

// - 資料夾篩選：全部不限縮，未分類只看 folderId 為 null 者
function matchesFolder({ conversation, folderId }: { conversation: ConversationSummary; folderId: string }): boolean {
	if (folderId === ALL_FOLDER_ID) return true
	if (folderId === UNFILED_FOLDER_ID) return conversation.folderId === null
	return conversation.folderId === folderId
}

function cloneConversationMessages(messages: ConversationMessage[]): ConversationMessage[] {
	return messages.map(({ citations: messageCitations, feedback, isStreaming, trace, ...message }) => ({
		...message,
		...(messageCitations ? { citations: messageCitations.map((citation) => ({ ...citation })) } : {}),
		...(feedback ? { feedback: { ...feedback } } : {}),
		...(isStreaming !== undefined ? { isStreaming: false } : {}),
		...(trace
			? {
				trace: {
					...trace,
					stages: trace.stages.map((stage) => ({ ...stage })),
				},
			}
			: {}),
	}))
}

function cloneConversationHistory(history: Record<string, ConversationMessage[]>): Record<string, ConversationMessage[]> {
	return Object.fromEntries(
		Object.entries(history).map(([conversationId, messages]) => [conversationId, cloneConversationMessages(messages)]),
	)
}

function createStagePlan(usesRetrieval = true): ThinkingStage[] {
	return STAGE_PLAN
		.filter((stage) => usesRetrieval || stage.id === 'parse' || stage.id === 'generate')
		.map((stage) => ({ id: stage.id, label: stage.label, detail: stage.detail, status: 'pending', elapsedMs: 0 }))
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

function createScopedCitations(documents: SelectedKnowledgeDocument[]): Citation[] {
	return documents.map((document, index) => ({
		id: `cite-scoped-${document.id}`,
		chunkId: `${document.id}-mock-chunk`,
		documentId: document.id,
		title: document.name,
		section: '限定文件',
		excerpt: '這是文件限定功能的展示引用；正式環境會回傳實際命中的原文片段。',
		confidence: Math.max(0.8, 0.94 - index * 0.02),
	}))
}

function createMockAnswer(
	question: string,
	scope: string,
	includeCitations = true,
	selectedDocuments: SelectedKnowledgeDocument[] = [],
): ConversationMessage {
	const normalizedQuestion = question.toLowerCase()
	const hasDocumentScope = includeCitations && selectedDocuments.length > 0
	const answerCitations = hasDocumentScope ? createScopedCitations(selectedDocuments) : (includeCitations ? citations : [])
	const scopedCitationMarkers = answerCitations.map((_, index) => `[${index + 1}]`).join(' ')
	let content = hasDocumentScope
		? `我只會在「${scope}」範圍內整理答案 ${scopedCitationMarkers}。這是展示回答；正式環境會依限定文件的實際檢索結果回傳答案與原文引用。`
		: includeCitations
		? `我在「${scope}」範圍內找到幾份可能相關的資料 [1]。這是展示回答；正式環境會依實際檢索結果整理答案並附上對應引用。`
		: `我會直接使用「${scope}」回答，不檢索知識庫、不搜尋網路，也不產生引用。這是展示回答；正式環境會由選定模型產生內容。`
	if (!hasDocumentScope && includeCitations && (normalizedQuestion.includes('出差') || normalizedQuestion.includes('住宿') || normalizedQuestion.includes('差旅'))) {
		content = '依目前有效的差旅辦法 [1]，國內住宿每晚原則上限為新台幣 3,000 元。若遇特殊地區或旺季，請在出差申請時事先說明。出差結束後，需在十個工作天內完成核銷並附上有效憑證 [2]。'
	} else if (!hasDocumentScope && includeCitations && (normalizedQuestion.includes('新進') || normalizedQuestion.includes('到職'))) {
		content = '新進同仁第一週應完成公司帳號啟用、設備點交、資訊安全訓練及主管安排的到職會談 [1]。完整清單請參考《新進同仁到職指南》。'
	} else if (!hasDocumentScope && includeCitations && (normalizedQuestion.includes('資安') || normalizedQuestion.includes('客戶資料'))) {
		content = '客戶資料需依分級申請存取權限 [1]，對外分享前必須確認接收者、用途與保存期限。若發現異常存取，請立即通知資訊安全部 [2]。'
	}

	return {
		id: crypto.randomUUID(),
		role: 'assistant',
		content,
		createdAt: new Date().toISOString(),
		citations: answerCitations,
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
		selectedScope: DEFAULT_ASK_SOURCE.name,
		selectedKnowledgeSourceId: DEFAULT_ASK_SOURCE.id,
		selectedDocuments: [],
		selectedAnswerStyleId: DEFAULT_ANSWER_STYLE_ID,
		selectedAnswerModelId: DEFAULT_ANSWER_MODEL_ID,
		errorMessage: '',
		thinkingStages: [],
		retrievedCount: 0,
		conversations: conversationHistory.map((conversation) => ({ ...conversation })),
		conversationMessagesById: cloneConversationHistory(conversationMessagesById),
		activeConversationId: null,
		historyKeyword: '',
		onlyArchived: false,
		folders: conversationFolders.map((folder) => ({ ...folder })),
		selectedFolderId: ALL_FOLDER_ID,
		selectedConversationIds: [],
	}),
	getters: {
		answerStyleLabel(state): string {
			return getAnswerStyleLabel(state.selectedAnswerStyleId)
		},
		answerModelLabel(state): string {
			return getAnswerModelLabel(state.selectedAnswerModelId)
		},
		answerModelShortLabel(state): string {
			return getAnswerModelLabel(state.selectedAnswerModelId, true)
		},
		// - 目前正在串流的回答訊息，用來決定顯示完整流程或收合摘要
		streamingMessage(state): ConversationMessage | null {
			const lastMessage = state.messages[state.messages.length - 1]
			return lastMessage?.role === 'assistant' && lastMessage.isStreaming ? lastMessage : null
		},
		completedStages(state): ThinkingStage[] {
			return state.thinkingStages.filter((stage) => stage.status === 'done')
		},
		// - 套用資料夾、關鍵字與封存篩選，並讓釘選的對話置頂
		filteredConversations(state): ConversationSummary[] {
			const keyword = state.historyKeyword.trim()
			return state.conversations
				.filter((conversation) => {
					if (state.onlyArchived !== conversation.isArchived) return false
					if (!matchesFolder({ conversation, folderId: state.selectedFolderId })) return false
					if (!keyword) return true
					return matchesKeyword({ conversation, keyword })
				})
				.sort(comparePinnedFirst)
		},
		// - 目前選取的資料夾；系統項目（全部／未分類）沒有對應實體，回傳 null
		selectedFolder(state): ConversationFolder | null {
			return state.folders.find((folder) => folder.id === state.selectedFolderId) ?? null
		},
		/**
		 * 各資料夾在目前封存狀態下的對話數。
		 * @ 不套用關鍵字：側邊欄的數字代表資料夾規模，會隨搜尋跳動反而難判讀。
		 */
		folderCounts(state): Record<string, number> {
			const counts: Record<string, number> = { [ALL_FOLDER_ID]: 0, [UNFILED_FOLDER_ID]: 0 }
			for (const folder of state.folders) counts[folder.id] = 0

			for (const conversation of state.conversations) {
				if (state.onlyArchived !== conversation.isArchived) continue
				counts[ALL_FOLDER_ID] += 1
				const key = conversation.folderId ?? UNFILED_FOLDER_ID
				if (key in counts) counts[key] += 1
			}
			return counts
		},
		// - 批次搬移時實際會被套用的對話：僅限目前清單可見者，避免搬到看不見的項目
		selectedVisibleConversationIds(state): string[] {
			const visibleIds = new Set((this.filteredConversations as ConversationSummary[]).map((conversation) => conversation.id))
			return state.selectedConversationIds.filter((id) => visibleIds.has(id))
		},
		pinnedConversations(): ConversationSummary[] {
			return (this.filteredConversations as ConversationSummary[]).filter((conversation) => conversation.isPinned)
		},
		unpinnedConversations(): ConversationSummary[] {
			return (this.filteredConversations as ConversationSummary[]).filter((conversation) => !conversation.isPinned)
		},
	},
	actions: {
		selectKnowledgeSource({ id, name }: { id: string; name: string }): void {
			if (id === MODEL_ONLY_SOURCE_ID) return
			if (this.selectedKnowledgeSourceId !== id) this.selectedDocuments = []
			this.selectedKnowledgeSourceId = id
			this.selectedScope = name
		},
		/**
		 * 限定目前知識來源可使用的文件，空陣列代表搜尋整個來源。
		 * @param sourceId 文件所屬的知識來源識別碼。
		 * @param documents 使用者選取的文件快照。
		 */
		setSelectedDocuments({ sourceId, documents }: { sourceId: string; documents: SelectedKnowledgeDocument[] }): void {
			if (this.selectedKnowledgeSourceId !== sourceId) return
			this.selectedDocuments = Array.from(
				new Map(
					documents
						.filter((document) => document.id.trim() && document.name.trim())
						.map((document) => [document.id, { id: document.id, name: document.name }]),
				).values(),
			)
		},
		clearSelectedDocuments(): void {
			this.selectedDocuments = []
		},
		syncSelectedSourceName({ id, name }: { id: string; name: string }): void {
			if (this.selectedKnowledgeSourceId !== id) return
			this.selectedScope = name
		},
		applyAnswerSettings({ answerStyleId, answerModelId }: AnswerSettings): void {
			this.selectedAnswerStyleId = answerStyleId
			this.selectedAnswerModelId = answerModelId
		},
		/**
		 * 更新單筆 AI 回答的評價，倒讚必須附上原因。
		 * @param messageId AI 回答訊息識別碼。
		 * @param value 評價值；null 代表取消目前評價。
		 * @param reason 倒讚原因。
		 * @returns 是否成功更新評價。
		 */
		setAnswerFeedback({ messageId, value, reason = '' }: { messageId: string; value: AnswerFeedbackValue | null; reason?: string }): boolean {
			const target = this.messages.find((message) => message.id === messageId && message.role === 'assistant')
			if (!target) return false

			const trimmedReason = reason.trim()
			if (value === 'unhelpful' && (!trimmedReason || trimmedReason.length > ANSWER_FEEDBACK_REASON_MAX_LENGTH)) return false

			const feedback: AnswerFeedback | null = value
				? {
					value,
					...(value === 'unhelpful' ? { reason: trimmedReason } : {}),
					submittedAt: new Date().toISOString(),
				}
				: null
			if (feedback) target.feedback = feedback
			else delete target.feedback

			const savedMessage = this.activeConversationId
				? this.conversationMessagesById[this.activeConversationId]?.find((message) => message.id === messageId)
				: undefined
			if (savedMessage && feedback) savedMessage.feedback = { ...feedback }
			else if (savedMessage) delete savedMessage.feedback
			return true
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
				const documentScope = this.selectedDocuments.length === 0
					? this.selectedScope
					: `${this.selectedScope}（限定 ${this.selectedDocuments.length} 份文件）`
				const answer = createMockAnswer(trimmedQuestion, documentScope, true, this.selectedDocuments)

				// > 前置階段：解析、檢索、比對版本
				for (const [index, stage] of this.thinkingStages.entries()) {
					if (stage.id === 'generate') break

					stage.status = 'active'
					if (stage.id === 'retrieve') {
						this.retrievedCount = this.selectedDocuments.length || SEARCHABLE_DOCUMENT_TOTAL
					}

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
				this.conversationMessagesById[existing.id] = cloneConversationMessages(this.messages)
				return
			}

			// @ 在某個資料夾底下開始的對話直接歸入該資料夾；系統項目底下則維持未分類
			const inheritedFolderId = this.folders.some((folder) => folder.id === this.selectedFolderId) ? this.selectedFolderId : null
			const created: ConversationSummary = {
				id: crypto.randomUUID(),
				title: question,
				updatedAt: new Date().toISOString(),
				messageCount: this.messages.length,
				previewAnswer: answer,
				isPinned: false,
				isArchived: false,
				folderId: inheritedFolderId,
			}
			this.conversations.unshift(created)
			this.conversationMessagesById[created.id] = cloneConversationMessages(this.messages)
			this.activeConversationId = created.id
		},
		/**
		 * 從前端 Mock 歷史載入既有對話，不重新執行檢索或生成回答。
		 * @param conversationId 對話識別碼。
		 */
		openConversation(conversationId: string): void {
			const target = this.conversations.find((conversation) => conversation.id === conversationId)
			const savedMessages = this.conversationMessagesById[conversationId]
			if (!target || !savedMessages || this.isResponding) return

			this.activeConversationId = conversationId
			this.messages = cloneConversationMessages(savedMessages)
			this.thinkingStages = []
			this.retrievedCount = 0
			this.errorMessage = ''
		},
		startNewConversation(): void {
			this.selectKnowledgeSource(DEFAULT_ASK_SOURCE)
			this.clearSelectedDocuments()
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

		/* > 專案資料夾 */

		/**
		 * 切換目前檢視的資料夾，並清掉上一個資料夾殘留的批次選取。
		 * @param folderId 資料夾識別碼，或系統項目 all／unfiled。
		 */
		selectFolder(folderId: FolderFilterId): void {
			if (this.selectedFolderId === folderId) return
			this.selectedFolderId = folderId
			this.selectedConversationIds = []
		},
		/**
		 * 新增資料夾，名稱不可空白、重複或過長。
		 * @param name 使用者輸入的名稱。
		 * @returns 成功時回傳新資料夾 id，失敗時回傳失敗原因。
		 */
		createFolder(name: string): { result: FolderMutationResult; folderId?: string } {
			const trimmedName = name.trim()
			if (!trimmedName) return { result: 'empty-name' }
			if (trimmedName.length > FOLDER_NAME_MAX_LENGTH) return { result: 'too-long' }
			if (this.folders.some((folder) => normalizeFolderName(folder.name) === normalizeFolderName(trimmedName))) return { result: 'duplicated' }

			// TODO(api-integration): 串接後改為呼叫建立資料夾 API，id 由後端產生。
			const created: ConversationFolder = { id: crypto.randomUUID(), name: trimmedName, createdAt: new Date().toISOString() }
			this.folders.push(created)
			return { result: 'ok', folderId: created.id }
		},
		/**
		 * 重新命名資料夾。
		 * @param folderId 資料夾識別碼。
		 * @param name 新名稱。
		 * @returns 操作結果。
		 */
		renameFolder({ folderId, name }: { folderId: string; name: string }): FolderMutationResult {
			const target = this.folders.find((folder) => folder.id === folderId)
			if (!target) return 'not-found'

			const trimmedName = name.trim()
			if (!trimmedName) return 'empty-name'
			if (trimmedName.length > FOLDER_NAME_MAX_LENGTH) return 'too-long'
			if (this.folders.some((folder) => folder.id !== folderId && normalizeFolderName(folder.name) === normalizeFolderName(trimmedName))) return 'duplicated'

			// TODO(api-integration): 串接後改為呼叫更新資料夾 API。
			target.name = trimmedName
			return 'ok'
		},
		/**
		 * 刪除資料夾。
		 * @ 只刪資料夾本身，裡面的對話退回未分類——刪錯資料夾不該連帶失去問答紀錄。
		 * @param folderId 資料夾識別碼。
		 * @returns 操作結果。
		 */
		deleteFolder(folderId: string): FolderMutationResult {
			const targetIndex = this.folders.findIndex((folder) => folder.id === folderId)
			if (targetIndex < 0) return 'not-found'

			// TODO(api-integration): 串接後改為呼叫刪除資料夾 API。
			this.folders.splice(targetIndex, 1)
			for (const conversation of this.conversations) {
				if (conversation.folderId === folderId) conversation.folderId = null
			}
			if (this.selectedFolderId === folderId) this.selectFolder(ALL_FOLDER_ID)
			return 'ok'
		},
		/**
		 * 把一批對話搬到指定資料夾。
		 * @param conversationIds 要搬移的對話識別碼。
		 * @param folderId 目標資料夾；null 代表移出資料夾（未分類）。
		 * @returns 實際搬移的筆數。
		 */
		moveConversations({ conversationIds, folderId }: { conversationIds: string[]; folderId: string | null }): number {
			if (folderId !== null && !this.folders.some((folder) => folder.id === folderId)) return 0

			// TODO(api-integration): 串接後改為呼叫批次搬移 API。
			const targetIds = new Set(conversationIds)
			let movedCount = 0
			for (const conversation of this.conversations) {
				if (!targetIds.has(conversation.id) || conversation.folderId === folderId) continue
				conversation.folderId = folderId
				movedCount += 1
			}
			return movedCount
		},
		toggleConversationSelection(conversationId: string): void {
			const existingIndex = this.selectedConversationIds.indexOf(conversationId)
			if (existingIndex >= 0) this.selectedConversationIds.splice(existingIndex, 1)
			else this.selectedConversationIds.push(conversationId)
		},
		clearConversationSelection(): void {
			this.selectedConversationIds = []
		},
	},
})
