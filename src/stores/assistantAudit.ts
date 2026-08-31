import { defineStore } from 'pinia'

import type {
	AssistantAuditMessage,
	AssistantAuditSession,
	AssistantSessionEndReason,
	AssistantSessionStatus,
	KnowledgeSourceOption,
	SystemRecordEntry,
} from '@/types'
import { sanitizeAuditContent } from '@/utils/assistantAudit'

interface StartAuditSessionInput {
	sessionId: string
	startedAt: string
	userId: string
	userName: string
	department: string
	modelLabel: string
}

interface AppendAuditMessageInput {
	sessionId: string
	id: string
	role: 'user' | 'assistant'
	content: string
	createdAt: string
	pageTitle: string
	routePath: string
	source: KnowledgeSourceOption
	webSearchEnabled: boolean
	requestId: string
}

interface EndAuditSessionInput {
	sessionId: string
	endedAt: string
	status: Exclude<AssistantSessionStatus, 'active'>
	endReason: AssistantSessionEndReason
}

interface RecordContentInspectionInput {
	resourceId: string
	operationScope: 'ai_question_content.inspect' | 'admin_assistant_content.inspect'
}

function cloneSession(session: AssistantAuditSession): AssistantAuditSession {
	return {
		...session,
		messages: session.messages.map((message) => ({
			...message,
			redactedFields: [...message.redactedFields],
		})),
	}
}

export const useAssistantAuditStore = defineStore('assistant-audit', {
	state: () => ({
		inspectionRecords: [] as SystemRecordEntry[],
		sessions: [] as AssistantAuditSession[],
	}),
	getters: {
		getSessionById: (state) => (sessionId: string): AssistantAuditSession | null => {
			const session = state.sessions.find((item) => item.id === sessionId)
			return session ? cloneSession(session) : null
		},
	},
	actions: {
		recordContentInspection(input: RecordContentInspectionInput): void {
			const occurredAt = new Date().toISOString()
			const sequence = this.inspectionRecords.length + 1
			const requestId = `req-inspect-${Date.now()}-${sequence}`
			this.inspectionRecords.unshift({
				id: `audit-${input.resourceId}-${Date.now()}-${sequence}`,
				occurredAt,
				category: 'audit',
				level: 'success',
				title: '調閱 AI 問答內容',
				summary: `系統管理員調閱資源 ${input.resourceId}。`,
				statusLabel: '成功',
				sourceId: input.resourceId,
				sourceTo: null,
				actorLabel: '目前系統管理員',
				resourceLabel: input.resourceId,
				operationScope: input.operationScope,
				requestId,
			})
		},
		startSession(input: StartAuditSessionInput): void {
			if (this.sessions.some((session) => session.id === input.sessionId)) return
			this.sessions.unshift({
				id: input.sessionId,
				userId: input.userId,
				userName: input.userName,
				department: input.department,
				startedAt: input.startedAt,
				endedAt: null,
				status: 'active',
				endReason: null,
				modelLabel: input.modelLabel,
				durationMs: 0,
				messages: [],
			})
		},
		appendMessage(input: AppendAuditMessageInput): void {
			const session = this.sessions.find((item) => item.id === input.sessionId)
			if (!session || session.status !== 'active') return
			const sanitized = sanitizeAuditContent(input.content)
			const auditMessage: AssistantAuditMessage = {
				id: input.id,
				role: input.role,
				content: sanitized.content,
				createdAt: input.createdAt,
				pageTitle: input.pageTitle,
				routePath: input.routePath,
				sourceId: input.source.id,
				sourceKind: input.source.kind,
				sourceLabel: input.source.name,
				webSearchEnabled: input.webSearchEnabled,
				requestId: input.requestId,
				redactedFields: [...sanitized.redactedFields],
			}
			session.messages.push(auditMessage)
			session.durationMs = Math.max(0, Date.parse(input.createdAt) - Date.parse(session.startedAt))
		},
		endSession(input: EndAuditSessionInput): void {
			const session = this.sessions.find((item) => item.id === input.sessionId)
			if (!session || session.status !== 'active') return
			session.endedAt = input.endedAt
			session.status = input.status
			session.endReason = input.endReason
			session.durationMs = Math.max(0, Date.parse(input.endedAt) - Date.parse(session.startedAt))
		},
	},
})
