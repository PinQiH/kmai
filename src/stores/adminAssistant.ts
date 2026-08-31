import { defineStore } from 'pinia'

import { useAssistantAuditStore } from '@/stores/assistantAudit'
import { useNotebooksStore } from '@/stores/notebooks'
import type {
	AdminAssistantMessage,
	AssistantLauncherEdge,
	AssistantLauncherPosition,
	AssistantSessionEndReason,
	KnowledgeSourceOption,
} from '@/types'
import { createMockAdminAssistantAnswer } from '@/utils/adminAssistantMock'
import { MODEL_ONLY_SOURCE } from '@/utils/knowledgeSources'

export const ASSISTANT_IDLE_TIMEOUT_MS = 15 * 60 * 1000
export const ASSISTANT_EXPIRY_WARNING_MS = 60 * 1000
export const ASSISTANT_MOCK_RESPONSE_MS = 500

const ASSISTANT_MODEL_LABEL = 'gpt-4.1-mini（Mock）'
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
	}),
	getters: {
		isWebSearchEnabled(state): boolean {
			if (!state.selectedSource.supportsWebSearch) return false
			return state.webSearchOverride ?? state.selectedSource.defaultWebSearchEnabled
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
			this.selectedSource = { ...source }
			this.webSearchOverride = null
			this.errorMessage = ''
		},
		setWebSearchEnabled(isEnabled: boolean): void {
			if (!this.selectedSource.supportsWebSearch) {
				this.webSearchOverride = null
				return
			}
			this.webSearchOverride = isEnabled
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
				modelLabel: ASSISTANT_MODEL_LABEL,
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
			this.webSearchOverride = null
			this.isResponding = false
			this.errorMessage = ''
			this.expiresAt = null
			this.isExpiryWarningVisible = false
			this.pendingRequestId = null
			this.lastFailedQuestion = ''
			this.hasResponseFailure = false
		},
	},
})
