export interface KnowledgeDocument {
	id: string
	title: string
	summary: string
	department: string
	category: string
	tags: string[]
	updatedAt: string
	version: string
	status: '已發布' | '待審核' | '處理中' | '失敗' | '已下架'
	visibility: '全公司' | '指定群組' | '僅自己'
	owner: string
}

export interface DocumentVersionEntry {
	version: string
	date: string
	author: string
	summary: string
	changes: string[]
	isCurrent?: boolean
	status?: string
}

export interface Citation {
	id: string
	documentId: string
	title: string
	section: string
	excerpt: string
	confidence: number
}

export interface ConversationMessage {
	id: string
	role: 'user' | 'assistant'
	content: string
	createdAt: string
	citations?: Citation[]
	isStreaming?: boolean
	trace?: AnswerTrace
}

export type ThinkingStageStatus = 'pending' | 'active' | 'done'

export interface ThinkingStage {
	id: string
	label: string
	detail: string
	status: ThinkingStageStatus
	elapsedMs: number
}

// > 每則回答自帶的處理紀錄，回答完成後仍可展開查看
export interface AnswerTrace {
	documentCount: number
	citationCount: number
	retrievedCount: number
	elapsedMs: number
	stages: ThinkingStage[]
}

export type AnswerSegment = { type: 'text'; value: string } | { type: 'citation'; index: number }

export type KnowledgeSourceKind = 'model' | 'knowledge-base' | 'notebook'

export interface KnowledgeSourceOption {
	id: string
	name: string
	description: string
	kind: KnowledgeSourceKind
	defaultWebSearchEnabled: boolean
	supportsWebSearch: boolean
	documentCount?: number
}

export interface AdminAssistantMessage {
	id: string
	role: 'user' | 'assistant'
	content: string
	createdAt: string
	requestId: string
	citations?: Citation[]
}

export type AssistantSessionStatus = 'active' | 'completed' | 'expired' | 'cancelled' | 'failed'
export type AssistantSessionEndReason = 'manual_end' | 'idle_timeout' | 'leave_admin' | 'logout'
export type AssistantRedactedField = 'password' | 'api-key' | 'access-token' | 'bearer-token'
export type AssistantLauncherEdge = 'left' | 'right'

export interface AssistantLauncherPosition {
	x: number
	y: number
}

export interface AssistantAuditMessage {
	id: string
	role: 'user' | 'assistant'
	content: string
	createdAt: string
	pageTitle: string
	routePath: string
	sourceId: string
	sourceKind: KnowledgeSourceKind
	sourceLabel: string
	webSearchEnabled: boolean
	requestId: string
	redactedFields: AssistantRedactedField[]
}

export interface AssistantAuditSession {
	id: string
	userId: string
	userName: string
	department: string
	startedAt: string
	endedAt: string | null
	status: AssistantSessionStatus
	endReason: AssistantSessionEndReason | null
	modelLabel: string
	durationMs: number
	messages: AssistantAuditMessage[]
}

export interface ConversationSummary {
	id: string
	title: string
	updatedAt: string
	messageCount: number
	previewAnswer: string
	// @ 釘選取代了原本的收藏：置頂顯示，語意單一
	isPinned: boolean
	isArchived: boolean
}

export type NavigationAction = 'new-conversation' | 'search-conversation'

export interface NavigationItem {
	title: string
	icon: string
	// @ 帶 action 的項目不做路由跳轉，改觸發對應行為
	to?: string
	action?: NavigationAction
	hint?: string
	adminOnly?: boolean
}

export interface HealthMetric {
	label: string
	value: string
	detail: string
	status: 'good' | 'warning' | 'critical'
}

export interface ActivityItem {
	id: string
	title: string
	detail: string
	time: string
	type: 'document' | 'question' | 'system'
}

// > 營運監控：指標、日誌、告警規則與電子郵件通知
export type MetricStatus = 'good' | 'warning' | 'critical'

export interface ServiceMetric {
	id: string
	label: string
	value: number
	unit: string
	// @ 與前一個相同長度區間相比的變化百分比，正值代表上升
	deltaPercent: number
	// @ 上升是否代表變糟：延遲與錯誤率為 true，請求量這類中性指標為 false
	higherIsWorse: boolean
	status: MetricStatus
	detail: string
	// @ 由舊到新的取樣值，長度即取樣點數
	series: number[]
}

export interface ServiceHealth {
	id: string
	name: string
	component: string
	status: MetricStatus
	latencyMs: number
	successRate: number
	checkedAt: string
	note: string
}

export type LogLevel = 'error' | 'warn' | 'info' | 'debug'

export interface LogEntry {
	id: string
	occurredAt: string
	timestamp: string
	level: LogLevel
	service: string
	message: string
	traceId: string
	fields: Record<string, string>
}

export type AlertSeverity = 'critical' | 'warning' | 'info'
export type AlertComparison = '>' | '>=' | '<' | '<='

export interface AlertRule {
	id: string
	name: string
	metricId: string
	metricLabel: string
	comparison: AlertComparison
	threshold: number
	unit: string
	durationMinutes: number
	severity: AlertSeverity
	recipientGroupId: string
	isEnabled: boolean
}

export interface RecipientGroup {
	id: string
	name: string
	description: string
	emails: string[]
	severities: AlertSeverity[]
}

export type AlertEventStatus = 'firing' | 'resolved' | 'silenced'

export interface AlertEvent {
	id: string
	occurredAt: string
	ruleName: string
	severity: AlertSeverity
	status: AlertEventStatus
	observed: string
	startedAt: string
	durationLabel: string
	notifiedCount: number
	notifyResult: '已寄出' | '寄送失敗' | '未通知'
}

// @ SMTP 帳密只由後端保管，型別中刻意不存在對應欄位
export interface EmailChannelSettings {
	smtpHost: string
	smtpPort: number
	encryption: 'TLS' | 'SSL' | '不加密'
	senderName: string
	senderAddress: string
	repeatIntervalMinutes: number
	groupWindowMinutes: number
	notifyOnResolved: boolean
	isQuietHoursEnabled: boolean
	quietHoursStart: string
	quietHoursEnd: string
}

// > 站內通知 Mock：人工發送、自動事件、逐人查看狀態與成效
export type NotificationPriority = 'normal' | 'important' | 'urgent'
export type NotificationSource = 'manual' | 'automatic'
export type NotificationAudienceType = 'all' | 'department' | 'role' | 'selected'
export type NotificationRole = 'user' | 'knowledge-admin' | 'system-admin'
export type NotificationEventType =
	| 'document-ready'
	| 'document-failed'
	| 'document-review-required'
	| 'document-expiring'
	| 'notebook-shared'
	| 'notebook-mentioned'
	| 'permission-granted'
	| 'system-maintenance'

export interface NotificationUser {
	id: string
	name: string
	email: string
	department: string
	role: NotificationRole
	roleLabel: string
}

export interface NotificationRecipient {
	userId: string
	deliveredAt: string
	readAt: string | null
	firstViewedAt: string | null
	lastViewedAt: string | null
	viewCount: number
	firstActionClickedAt: string | null
	lastActionClickedAt: string | null
	actionClickCount: number
}

export interface AppNotification {
	id: string
	title: string
	body: string
	priority: NotificationPriority
	source: NotificationSource
	sourceLabel: string
	audienceLabel: string
	actionLabel: string | null
	actionTo: string | null
	createdAt: string
	sentAt: string
	createdBy: string
	recipients: NotificationRecipient[]
}

export interface AutomaticNotificationRule {
	id: string
	name: string
	eventType: NotificationEventType
	eventLabel: string
	title: string
	body: string
	priority: NotificationPriority
	audienceType: NotificationAudienceType
	targetDepartment: string | null
	targetRole: NotificationRole | null
	targetUserIds: string[]
	actionLabel: string | null
	actionTo: string | null
	isEnabled: boolean
}

export interface SendNotificationInput {
	title: string
	body: string
	priority: NotificationPriority
	audienceType: NotificationAudienceType
	targetDepartment: string | null
	targetRole: NotificationRole | null
	targetUserIds: string[]
	actionLabel: string | null
	actionTo: string | null
}

export interface NotificationRuleInput {
	name: string
	eventType: NotificationEventType
	title: string
	body: string
	priority: NotificationPriority
	audienceType: NotificationAudienceType
	targetDepartment: string | null
	targetRole: NotificationRole | null
	targetUserIds: string[]
	actionLabel: string | null
	actionTo: string | null
	isEnabled: boolean
}

export interface NotificationPerformance {
	targetedCount: number
	viewedCount: number
	unviewedCount: number
	viewRate: number
	averageTimeToViewSeconds: number | null
	actionClickedCount: number
	actionClickRate: number
}

export type AdminRole = 'system-admin' | 'knowledge-admin' | null
export type AdminQuestionRecordStatus = 'completed' | 'failed'

export interface AdminQuestionRecord {
	id: string
	conversationId: string
	askedAt: string
	userId: string
	userName: string
	userEmail: string
	department: string
	question: string
	answer: string
	status: AdminQuestionRecordStatus
	modelLabel: string
	knowledgeScopeLabel: string
	durationMs: number
	requestId: string
	citations: Citation[]
	trace: AnswerTrace | null
}

export type SystemRecordCategory = 'auth' | 'ai' | 'job' | 'audit' | 'notification' | 'alert'
export type SystemRecordLevel = 'info' | 'success' | 'warning' | 'error'

export interface SystemRecordEntry {
	id: string
	occurredAt: string
	category: SystemRecordCategory
	level: SystemRecordLevel
	title: string
	summary: string
	statusLabel: string
	sourceId: string | null
	sourceTo: string | null
	actorLabel?: string
	resourceLabel?: string
	operationScope?: string
	requestId?: string
}

// > AI 問答的問題大綱項目：以每一則使用者問題為節點
export interface OutlineItem {
	id: string
	seq: number
	text: string
	summary: string
}

export type NotebookRole = 'owner' | 'editor' | 'viewer'
export type NotebookCollaboratorRole = Exclude<NotebookRole, 'owner'>
export type NotebookMemberType = 'user' | 'group'

export interface NotebookMember {
	id: string
	name: string
	type: NotebookMemberType
	role: NotebookRole
}

export interface NotebookDocument {
	id: string
	name: string
	size: string
	uploadedAt: string
	status: 'ready' | 'processing' | 'failed'
}

export interface Notebook {
	id: string
	name: string
	description: string
	ownerName: string
	updatedAt: string
	defaultWebSearchEnabled: boolean
	documents: NotebookDocument[]
	members: NotebookMember[]
}
