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

interface RecordRecordExportInput {
	scope: 'system_event.export' | 'audit_record.export'
	rowCount: number
}

// TODO(api-integration): 稽核的操作者身分應改由登入 session 提供，不可由前端自行決定。
const AUDIT_ACTOR = {
	label: '林怡君',
	account: 'km.admin@company.com',
	ip: '10.20.1.42',
} as const

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
			const isAssistantScope = input.operationScope === 'admin_assistant_content.inspect'
			const operationLabel = isAssistantScope ? '調閱小幫手對話內容' : '調閱 AI 問答內容'
			this.inspectionRecords.unshift({
				id: `audit-${input.resourceId}-${Date.now()}-${sequence}`,
				occurredAt,
				category: 'audit',
				level: 'success',
				title: operationLabel,
				summary: `${AUDIT_ACTOR.label}調閱資源 ${input.resourceId}。`,
				statusLabel: '成功',
				sourceId: input.resourceId,
				sourceTo: null,
				actorLabel: AUDIT_ACTOR.label,
				actorAccount: AUDIT_ACTOR.account,
				actorIp: AUDIT_ACTOR.ip,
				resourceLabel: input.resourceId,
				resourceName: isAssistantScope ? '後台小幫手對話' : 'AI 問答紀錄',
				operationScope: input.operationScope,
				operationLabel,
				requestId,
			})
		},
		recordRecordExport(input: RecordRecordExportInput): void {
			const occurredAt = new Date().toISOString()
			const sequence = this.inspectionRecords.length + 1
			const isAuditScope = input.scope === 'audit_record.export'
			const resourceLabel = isAuditScope ? '操作稽核清單' : '系統事件清單'
			const operationLabel = `匯出${resourceLabel}`
			this.inspectionRecords.unshift({
				id: `audit-export-${Date.now()}-${sequence}`,
				occurredAt,
				category: 'audit',
				level: 'success',
				title: operationLabel,
				summary: `${AUDIT_ACTOR.label}匯出 ${resourceLabel} ${input.rowCount} 筆（僅欄位摘要，不含問答內容）。`,
				statusLabel: '成功',
				sourceId: null,
				sourceTo: null,
				actorLabel: AUDIT_ACTOR.label,
				actorAccount: AUDIT_ACTOR.account,
				actorIp: AUDIT_ACTOR.ip,
				resourceLabel,
				resourceName: `${resourceLabel}（${input.rowCount} 筆）`,
				operationScope: input.scope,
				operationLabel,
				requestId: `req-export-${Date.now()}-${sequence}`,
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
