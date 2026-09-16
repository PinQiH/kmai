import { defineStore } from 'pinia'

import { useAssistantAuditStore } from '@/stores/assistantAudit'
import { useNotebooksStore } from '@/stores/notebooks'
import type {
	AdminAssistantMessage,
	AnswerModelId,
	AnswerSettings,
	AnswerStyleId,
	AssistantLauncherEdge,
	AssistantLauncherPosition,
	AssistantSessionEndReason,
	KnowledgeSourceOption,
} from '@/types'
import { createMockAdminAssistantAnswer } from '@/utils/adminAssistantMock'
import { DEFAULT_ANSWER_MODEL_ID, DEFAULT_ANSWER_STYLE_ID, getAnswerModelLabel, getAnswerStyleLabel } from '@/utils/answerSettings'
import { MODEL_ONLY_SOURCE } from '@/utils/knowledgeSources'

export const ASSISTANT_IDLE_TIMEOUT_MS = 15 * 60 * 1000
export const ASSISTANT_EXPIRY_WARNING_MS = 60 * 1000
export const ASSISTANT_MOCK_RESPONSE_MS = 500

export interface AssistantScopedDocument {
	id: string
	name: string
}

const CURRENT_USER = {
	id: 'user-current',
	name: '王小明',
	department: '產品企劃部',
} as const

interface AdminAssistantState {
	isOpen: boolean
	activeSessionId: string | null
	messages: AdminAssistantMessage[]
	selectedSource: KnowledgeSourceOption
	/** 限定文件；空陣列代表使用整個來源，與前台問答一致 */
	selectedDocuments: AssistantScopedDocument[]
	answerStyleId: AnswerStyleId
	answerModelId: AnswerModelId
	webSearchOverride: boolean | null
	isResponding: boolean
	errorMessage: string
	expiresAt: number | null
	isExpiryWarningVisible: boolean
	launcherPosition: AssistantLauncherPosition | null
	launcherEdge: AssistantLauncherEdge
	pendingRequestId: string | null
	lastFailedQuestion: string
	hasResponseFailure: boolean
	/** 從回饋案件發起的複測；套用回報者當時的設定 */
	retest: AssistantRetestContext | null
	/** 帶入輸入框但尚未送出的問題，面板讀取後清空 */
	draftQuestion: string
}

export interface AssistantRetestContext {
	caseId: string
	caseTitle: string
	reporterName: string
	question: string
	sourceId: string
	sourceName: string
	/** 來源已無法使用（例如筆記本被刪除）時為 false，面板需提示改用的來源 */
	sourceAvailable: boolean
	settingLabels: string[]
	webSearchEnabled: boolean
}

export interface SendAssistantQuestionInput {
	question: string
	pageTitle: string
	routePath: string
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function cloneModelSource(): KnowledgeSourceOption {
	return { ...MODEL_ONLY_SOURCE }
}

export const useAdminAssistantStore = defineStore('admin-assistant', {
	state: (): AdminAssistantState => ({
		isOpen: false,
		activeSessionId: null,
		messages: [],
		selectedSource: cloneModelSource(),
		selectedDocuments: [],
		answerStyleId: DEFAULT_ANSWER_STYLE_ID,
		answerModelId: DEFAULT_ANSWER_MODEL_ID,
		webSearchOverride: null,
		isResponding: false,
		errorMessage: '',
		expiresAt: null,
		isExpiryWarningVisible: false,
		launcherPosition: null,
		launcherEdge: 'right',
		pendingRequestId: null,
		lastFailedQuestion: '',
		hasResponseFailure: false,
		retest: null,
		draftQuestion: '',
	}),
	getters: {
		isWebSearchEnabled(state): boolean {
			if (!state.selectedSource.supportsWebSearch) return false
			return state.webSearchOverride ?? state.selectedSource.defaultWebSearchEnabled
		},
		/** 只有知識庫與筆記本可以限定文件，模型一般知識沒有文件可選 */
		supportsDocumentScope(state): boolean {
			return state.selectedSource.kind === 'knowledge-base' || state.selectedSource.kind === 'notebook'
		},
		answerModelLabel(state): string {
			return getAnswerModelLabel(state.answerModelId)
		},
		answerStyleLabel(state): string {
			return getAnswerStyleLabel(state.answerStyleId)
		},
		scopeSummary(state): string {
			if (!state.selectedDocuments.length) return state.selectedSource.name
			if (state.selectedDocuments.length === 1) return `${state.selectedSource.name} · ${state.selectedDocuments[0].name}`
			return `${state.selectedSource.name} · 已選 ${state.selectedDocuments.length} 份文件`
		},
	},
	actions: {
		openAssistant(): void {
			this.isOpen = true
		},
		minimizeAssistant(): void {
			this.isOpen = false
		},
		selectKnowledgeSource(source: KnowledgeSourceOption): void {
			// @ 換來源後舊的限定文件已不屬於這個來源，一律清掉
			if (this.selectedSource.id !== source.id) this.selectedDocuments = []
			this.selectedSource = { ...source }
			this.webSearchOverride = null
			this.errorMessage = ''
		},
		/**
		 * 設定限定文件；與前台問答一致，不選文件代表使用整個來源。
		 * @param documents 目前來源中被選取的文件。
		 */
		setSelectedDocuments(documents: AssistantScopedDocument[]): void {
			if (!this.supportsDocumentScope) {
				this.selectedDocuments = []
				return
			}
			const unique = new Map(documents.map((document) => [document.id, { ...document }]))
			this.selectedDocuments = [...unique.values()]
		},
		clearSelectedDocuments(): void {
			this.selectedDocuments = []
		},
		applyAnswerSettings(settings: AnswerSettings): void {
			this.answerStyleId = settings.answerStyleId
			this.answerModelId = settings.answerModelId
		},
		setWebSearchEnabled(isEnabled: boolean): void {
			if (!this.selectedSource.supportsWebSearch) {
				this.webSearchOverride = null
				return
			}
			this.webSearchOverride = isEnabled
		},
		/**
		 * 以回饋案件的提問與設定開啟小幫手複測；會結束進行中的對話，避免混入前後文。
		 * @param context 複測脈絡。
		 * @param source 對應的知識來源；已無法使用時傳 undefined，沿用目前來源。
		 */
		startRetest(
			context: Omit<AssistantRetestContext, 'sourceAvailable'>,
			source: KnowledgeSourceOption | undefined,
			settings: { documents: AssistantScopedDocument[]; answerStyleId: AnswerStyleId; answerModelId: AnswerModelId },
		): void {
			if (this.activeSessionId) this.endSession('manual_end')
			if (source) {
				this.selectKnowledgeSource(source)
				this.setWebSearchEnabled(context.webSearchEnabled)
				this.setSelectedDocuments(settings.documents)
			}
			this.answerStyleId = settings.answerStyleId
			this.answerModelId = settings.answerModelId
			this.retest = { ...context, settingLabels: [...context.settingLabels], sourceAvailable: Boolean(source) }
			this.draftQuestion = context.question
			this.isOpen = true
		},
		clearRetest(): void {
			this.retest = null
		},
		updateLauncherPosition(position: AssistantLauncherPosition, edge: AssistantLauncherEdge): void {
			this.launcherPosition = { ...position }
			this.launcherEdge = edge
		},
		startSession(startedAt = new Date().toISOString()): string {
			if (this.activeSessionId) return this.activeSessionId
			const sessionId = crypto.randomUUID()
			this.activeSessionId = sessionId
			useAssistantAuditStore().startSession({
				sessionId,
				startedAt,
				userId: CURRENT_USER.id,
				userName: CURRENT_USER.name,
				department: CURRENT_USER.department,
				modelLabel: `${this.answerModelLabel}（Mock）`,
			})
			return sessionId
		},
		/**
		 * 送出短效 AI 問題並同步建立使用者畫面與稽核副本。
		 * @param input 問題文字及送出當下的後台頁面脈絡。
		 * @returns Mock 回答流程完成後結束。
		 */
		async sendMessage(input: SendAssistantQuestionInput): Promise<void> {
			const question = input.question.trim()
			if (!question || this.isResponding) return

			if (this.selectedSource.kind === 'notebook') {
				const notebook = useNotebooksStore().notebooks.find((item) => item.id === this.selectedSource.id)
				if (!notebook) {
					this.errorMessage = '這本筆記本已無法使用，請重新選擇知識來源。'
					return
				}
				if (notebook.documents.length === 0) {
					this.errorMessage = '這本筆記本目前沒有文件，請先新增文件或改選其他來源。'
					return
				}
			}

			const askedAt = new Date().toISOString()
			const sessionId = this.startSession(askedAt)
			const requestId = `req-assistant-${crypto.randomUUID()}`
			const sourceSnapshot = { ...this.selectedSource }
			const webSearchEnabled = this.isWebSearchEnabled
			const documentSnapshot = this.selectedDocuments.map((document) => ({ ...document }))
			const userMessage: AdminAssistantMessage = {
				id: crypto.randomUUID(),
				role: 'user',
				content: question,
				createdAt: askedAt,
				requestId,
			}

			this.messages.push(userMessage)
			this.isResponding = true
			this.errorMessage = ''
			this.expiresAt = null
			this.isExpiryWarningVisible = false
			this.pendingRequestId = requestId
			useAssistantAuditStore().appendMessage({
				sessionId,
				...userMessage,
				pageTitle: input.pageTitle,
				routePath: input.routePath,
				source: sourceSnapshot,
				webSearchEnabled,
			})

			try {
				await delay(ASSISTANT_MOCK_RESPONSE_MS)
				if (this.pendingRequestId !== requestId || this.activeSessionId !== sessionId) return
				const answer = createMockAdminAssistantAnswer({
					question,
					pageTitle: input.pageTitle,
					source: sourceSnapshot,
					webSearchEnabled,
					documents: documentSnapshot,
					answerStyleLabel: this.answerStyleLabel,
					answerModelLabel: this.answerModelLabel,
				})
				const answeredAt = new Date().toISOString()
				const assistantMessage: AdminAssistantMessage = {
					id: crypto.randomUUID(),
					role: 'assistant',
					content: answer.content,
					createdAt: answeredAt,
					requestId,
					citations: answer.citations,
				}
				this.messages.push(assistantMessage)
				useAssistantAuditStore().appendMessage({
					sessionId,
					...assistantMessage,
					pageTitle: input.pageTitle,
					routePath: input.routePath,
					source: sourceSnapshot,
					webSearchEnabled,
				})
				this.hasResponseFailure = false
				this.expiresAt = Date.now() + ASSISTANT_IDLE_TIMEOUT_MS
			} catch {
				if (this.pendingRequestId !== requestId) return
				this.lastFailedQuestion = question
				this.hasResponseFailure = true
				this.errorMessage = '小幫手暫時無法回答，請稍後重試。'
				this.expiresAt = Date.now() + ASSISTANT_IDLE_TIMEOUT_MS
			} finally {
				if (this.pendingRequestId === requestId) {
					this.pendingRequestId = null
					this.isResponding = false
				}
			}
		},
		async retryLastQuestion(context: Omit<SendAssistantQuestionInput, 'question'>): Promise<void> {
			if (!this.lastFailedQuestion || this.isResponding) return
			const question = this.lastFailedQuestion
			this.lastFailedQuestion = ''
			await this.sendMessage({ ...context, question })
		},
		continueSession(now = Date.now()): void {
			if (!this.activeSessionId || this.isResponding) return
			this.expiresAt = now + ASSISTANT_IDLE_TIMEOUT_MS
			this.isExpiryWarningVisible = false
		},
		updateExpiryState(now = Date.now()): void {
			if (!this.activeSessionId || this.isResponding || this.expiresAt === null) {
				this.isExpiryWarningVisible = false
				return
			}
			const remainingMs = this.expiresAt - now
			if (remainingMs <= 0) {
				this.expireSession(now)
				return
			}
			this.isExpiryWarningVisible = remainingMs <= ASSISTANT_EXPIRY_WARNING_MS
		},
		cancelPendingResponse(): void {
			this.pendingRequestId = null
			this.isResponding = false
		},
		endSession(reason: AssistantSessionEndReason, now = Date.now()): void {
			const sessionId = this.activeSessionId
			const wasResponding = this.isResponding
			this.cancelPendingResponse()
			if (sessionId) {
				useAssistantAuditStore().endSession({
					sessionId,
					endedAt: new Date(now).toISOString(),
					status: wasResponding ? 'cancelled' : this.hasResponseFailure ? 'failed' : 'completed',
					endReason: reason,
				})
			}
			this.resetConversationState()
		},
		expireSession(now = Date.now()): void {
			const sessionId = this.activeSessionId
			if (!sessionId || this.isResponding) return
			useAssistantAuditStore().endSession({
				sessionId,
				endedAt: new Date(now).toISOString(),
				status: 'expired',
				endReason: 'idle_timeout',
			})
			this.resetConversationState()
		},
		resetConversationState(): void {
			this.isOpen = false
			this.activeSessionId = null
			this.messages = []
			this.selectedSource = cloneModelSource()
			this.selectedDocuments = []
			this.answerStyleId = DEFAULT_ANSWER_STYLE_ID
			this.answerModelId = DEFAULT_ANSWER_MODEL_ID
			this.webSearchOverride = null
			this.isResponding = false
			this.errorMessage = ''
			this.expiresAt = null
			this.isExpiryWarningVisible = false
			this.pendingRequestId = null
			this.lastFailedQuestion = ''
			this.hasResponseFailure = false
			this.retest = null
			this.draftQuestion = ''
		},
	},
})
