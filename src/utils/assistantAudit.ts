import type { AssistantRedactedField, AssistantAuditSession } from '@/types'

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

/**
 * 取得小幫手 session 的狀態文字。
 * @param session 稽核 session。
 * @returns 例如「已完成」「已逾時」。
 */
export function assistantSessionStatusLabel(session: AssistantAuditSession): string {
	if (session.status === 'active') return '進行中'
	if (session.status === 'expired') return '已逾時'
	if (session.status === 'cancelled') return '已取消'
	if (session.status === 'failed') return '失敗'
	return '已完成'
}

/**
 * 取得小幫手 session 的結束原因文字。
 * @param session 稽核 session。
 * @returns 例如「手動結束」；尚未結束時回傳「尚未結束」。
 */
export function assistantSessionEndReasonLabel(session: AssistantAuditSession): string {
	if (session.endReason === 'manual_end') return '手動結束'
	if (session.endReason === 'idle_timeout') return '閒置逾時'
	if (session.endReason === 'leave_admin') return '離開管理後台'
	if (session.endReason === 'logout') return '登出'
	return '尚未結束'
}

/**
 * 計算 session 內使用者的提問數。
 * @param session 稽核 session。
 * @returns 使用者訊息筆數。
 */
export function countAssistantQuestions(session: AssistantAuditSession): number {
	return session.messages.filter((message) => message.role === 'user').length
}
