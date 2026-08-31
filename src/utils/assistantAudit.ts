import type { AssistantRedactedField, AssistantAuditSession, SystemRecordEntry } from '@/types'

export interface SanitizedAuditContent {
	content: string
	redactedFields: AssistantRedactedField[]
}

interface SecretPattern {
	field: AssistantRedactedField
	pattern: RegExp
	replace: (substring: string, ...args: string[]) => string
}

const REDACTED_TEXT = '[已遮蔽機密]'
const redactAssignedSecret = (_match: string, prefix: string, quote: string): string => (
	`${prefix}${quote || ''}${REDACTED_TEXT}${quote || ''}`
)
const SECRET_PATTERNS: SecretPattern[] = [
	{
		field: 'password',
		pattern: /((?:["']?(?:password|passwd|密碼)["']?)\s*[:=：]\s*)(?:(["'])(?:\\.|(?!\2).)*\2|[^\s,;，；}\]]+)/giu,
		replace: redactAssignedSecret,
	},
	{
		field: 'api-key',
		pattern: /((?:["']?(?:api[_ -]?key|secret[_ -]?key)["']?)\s*[:=：]\s*)(?:(["'])(?:\\.|(?!\2).)*\2|[^\s,;，；}\]]+)/giu,
		replace: redactAssignedSecret,
	},
	{
		field: 'access-token',
		pattern: /((?:["']?(?:access[_ -]?token|refresh[_ -]?token|token)["']?)\s*[:=：]\s*)(?:(["'])(?:\\.|(?!\2).)*\2|[^\s,;，；}\]]+)/giu,
		replace: redactAssignedSecret,
	},
	{
		field: 'bearer-token',
		pattern: /\bBearer\s+[A-Za-z0-9._~+/-]+=*/giu,
		replace: () => `Bearer ${REDACTED_TEXT}`,
	},
]

/**
 * 遮蔽不得寫入稽核資料的明確機密格式。
 * @param content 使用者或模型的原始訊息。
 * @returns 遮蔽後文字及命中的機密種類。
 */
export function sanitizeAuditContent(content: string): SanitizedAuditContent {
	let sanitizedContent = content
	const redactedFields = new Set<AssistantRedactedField>()

	for (const secretPattern of SECRET_PATTERNS) {
		if (!secretPattern.pattern.test(sanitizedContent)) continue
		secretPattern.pattern.lastIndex = 0
		sanitizedContent = sanitizedContent.replace(secretPattern.pattern, secretPattern.replace)
		redactedFields.add(secretPattern.field)
	}

	return { content: sanitizedContent, redactedFields: [...redactedFields] }
}

function sessionStatusLabel(session: AssistantAuditSession): string {
	if (session.status === 'active') return '進行中'
	if (session.status === 'expired') return '已逾時'
	if (session.status === 'cancelled') return '已取消'
	if (session.status === 'failed') return '失敗'
	return '已完成'
}

function sessionEndReasonLabel(session: AssistantAuditSession): string {
	if (session.endReason === 'manual_end') return '手動結束'
	if (session.endReason === 'idle_timeout') return '閒置逾時'
	if (session.endReason === 'leave_admin') return '離開後台'
	if (session.endReason === 'logout') return '登出'
	return '進行中'
}

function sourceKindLabel(session: AssistantAuditSession): string {
	const sourceKind = [...session.messages].reverse().find((message) => message.role === 'user')?.sourceKind
	if (sourceKind === 'knowledge-base') return '知識庫'
	if (sourceKind === 'notebook') return '筆記本'
	return '模型'
}

/**
 * 將短效 AI 小幫手稽核 session 轉成統一系統紀錄。
 * @param sessions 目前頁籤內保存的稽核 session。
 * @returns 可併入系統紀錄表的 AI 問答列。
 */
export function buildAssistantSystemRecords(sessions: AssistantAuditSession[]): SystemRecordEntry[] {
	return sessions.map((session) => {
		const questionCount = session.messages.filter((message) => message.role === 'user').length
		const latestSource = [...session.messages].reverse().find((message) => message.role === 'user')?.sourceLabel ?? '模型一般知識'
		const statusLabel = sessionStatusLabel(session)
		return {
			id: `record-assistant-${session.id}`,
			occurredAt: session.endedAt ?? session.startedAt,
			category: 'ai',
			level: session.status === 'failed' ? 'error' : session.status === 'cancelled' ? 'warning' : 'success',
			title: '後台 AI 小幫手對話',
			summary: `${session.userName} · ${questionCount} 則提問 · ${sourceKindLabel(session)}／${latestSource} · ${sessionEndReasonLabel(session)}`,
			statusLabel,
			sourceId: session.id,
			sourceTo: `/admin/logs?assistantSessionId=${encodeURIComponent(session.id)}`,
			actorLabel: session.userName,
			resourceLabel: session.id,
			operationScope: 'admin.assistant.chat',
			requestId: session.messages[0]?.requestId,
		}
	})
}
