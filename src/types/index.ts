export interface KnowledgeDocument {
	id: string
	knowledgeSourceId: string
	source: UserDocumentSource
	title: string
	summary: string
	/** 編制單位，對應上傳流程的「編制單位」欄位。 */
	department: string
	/** 大類別，對應上傳流程的「大類別」欄位。 */
	category: string
	/** 小類別，上傳時可留空。 */
	subCategory?: string
	tags: string[]
	/** 文件首次上傳日期（YYYY-MM-DD）。 */
	uploadedAt: string
	updatedAt: string
	version: string
	status: '已發布' | '待審核' | '處理中' | '失敗' | '已下架'
	visibility: '全公司' | '指定群組' | '指定使用者' | '僅自己'
	visibilityGroupIds?: string[]
	visibilityUserIds?: string[]
	owner: string
}

/** 文件狀態；同時是生命週期的判讀依據。 */
export type DocumentStatus = KnowledgeDocument['status']

/** 單一處理步驟的執行結果。 */
export interface DocumentProcessingStep {
	id: string
	name: string
	state: '已完成' | '進行中' | '等待中' | '失敗' | '未執行'
	detail: string
	finishedAt: string | null
	/** 這一步實際耗用的時間，展開處理細節時顯示。 */
	durationLabel?: string
	/** 不致失敗但需要留意的狀況，例如部分頁面辨識率偏低。 */
	warnings?: string[]
}

/** 處理工作底下的單一檔案；一份文件含一個主文件與零到多個附件。 */
export interface DocumentProcessingFile {
	id: string
	name: string
	role: '主文件' | '附件'
	extension: string
	state: DocumentProcessingStep['state']
	progress: number
	/** 目前所在步驟名稱。 */
	stage: string
	note?: string
	/** 這個檔案自己的處理步驟；主文件與整份工作相同，附件各自獨立。 */
	steps?: DocumentProcessingStep[]
}

/** 一份文件的處理紀錄，供列表、預覽與管理頁共用。 */
export interface DocumentProcessingRecord {
	version?: string
	cancelled?: boolean
	documentId: string
	jobId: string
	progress: number
	uploadedBy: string
	uploadedAt: string
	startedAt: string
	lastUpdatedAt: string
	failureReason: string | null
	reviewNote: string | null
	steps: DocumentProcessingStep[]
	/** 主文件與附件的個別處理狀態；未提供時視為只有主文件。 */
	files?: DocumentProcessingFile[]
}

export interface DocumentVersionEntry {
	version: string
	date: string
	author: string
	summary: string
	changes: string[]
	/** Markdown 格式的更新說明；有值時取代 changes 清單顯示。 */
	notes?: string
	isCurrent?: boolean
	status?: string
}

export interface Citation {
	id: string
	chunkId?: string
	documentId: string
	title: string
	section: string
	excerpt: string
	confidence: number
}

export interface DocumentContentSection {
	id: string
	heading: string
	body: string
}

export type DocumentSourceType = 'file' | 'text' | 'url' | 'ai-answer'
export type TextDocumentFormat = 'plain-text' | 'markdown'

export interface FileDocumentSource {
	type: 'file'
	fileName: string
	mimeType: string
	extension: string
	previewText?: string
	previewTruncated?: boolean
}

export interface TextDocumentSource {
	type: 'text'
	format: TextDocumentFormat
	content: string
}

export interface UrlDocumentSource {
	type: 'url'
	url: string
	domain: string
	capturedAt: string
	snapshot: string
}

export interface AiAnswerDocumentSource {
	type: 'ai-answer'
	answerId: string
	question: string
	content: string
	citations: Citation[]
}

export type UserDocumentSource = FileDocumentSource | TextDocumentSource | UrlDocumentSource
export type DocumentSource = UserDocumentSource | AiAnswerDocumentSource

export interface ConversationMessage {
	id: string
	role: 'user' | 'assistant'
	content: string
	createdAt: string
	citations?: Citation[]
	feedback?: AnswerFeedback
	isStreaming?: boolean
	trace?: AnswerTrace
}

export type AnswerFeedbackValue = 'helpful' | 'unhelpful'

export interface AnswerFeedback {
	value: AnswerFeedbackValue
	reason?: string
	submittedAt: string
}

export type ThinkingStageStatus = 'pending' | 'active' | 'done'

export interface ThinkingStage {
	id: string
	label: string
	detail: string
	status: ThinkingStageStatus
	elapsedMs: number
	// > 後台稽核用：該階段實際呼叫的模型與 token 數，前台不顯示
	modelLabel?: string
	tokens?: number
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

export type AnswerStyleId = 'balanced' | 'concise' | 'step-by-step'
export type AnswerModelId = 'gpt-4.1-mini' | 'llama3.1:8b'

export interface AnswerSettings {
	answerStyleId: AnswerStyleId
	answerModelId: AnswerModelId
}

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
	// @ 單一歸屬的專案資料夾；null 代表未分類
	folderId: string | null
}

/**
 * 專案資料夾：把問答紀錄分門別類地歸納。
 * @ 刻意採單層、單一歸屬（非標籤）：問答紀錄天然屬於單一專案，
 *   交叉檢索的需求由既有的關鍵字搜尋吸收。
 */
export interface ConversationFolder {
	id: string
	name: string
	createdAt: string
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
	isEnabled: boolean
}

export interface RecipientGroup {
	id: string
	name: string
	description: string
	/** 站內通知的成員；Email 通知則使用 emails */
	memberUserIds: string[]
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
	delivery: AlertDeliverySnapshot
}

// > 告警觸發當下依自動通知規則實際送出的結果。
// > 必須是快照：規則之後可能被修改，歷史紀錄要反映「當時怎麼通知」，不可用現行規則即時推算。
// > Email 是否真的寄達屬於後端 SMTP 的非同步結果，前端無從得知，因此這裡只記送出對象數，不記寄達與否。
export type AlertDeliveryOutcome = 'notified' | 'no-rule' | 'silenced'

export interface AlertDeliverySnapshot {
	outcome: AlertDeliveryOutcome
	matchedRuleNames: string[]
	inAppRecipientCount: number
	emailRecipientCount: number
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
export type NotificationAudienceType = 'all' | 'department' | 'role' | 'selected' | 'group'
export type NotificationRole = 'user' | 'knowledge-admin' | 'system-admin'
export type NotificationDeliveryChannel = 'in-app' | 'email'
export type NotificationEventType =
	| 'document-ready'
	| 'document-failed'
	| 'document-review-required'
	| 'document-expiring'
	| 'notebook-shared'
	| 'notebook-mentioned'
	| 'permission-granted'
	| 'system-alert-triggered'
	| 'system-alert-resolved'
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
	/** audienceType 為 group 時使用的收件群組 */
	targetGroupId: string | null
	actionLabel: string | null
	actionTo: string | null
	deliveryChannels: NotificationDeliveryChannel[]
	isEnabled: boolean
	/** 只有系統告警事件會用到；空陣列代表不分嚴重度都通知 */
	alertSeverities: AlertSeverity[]
}

export interface SendNotificationInput {
	title: string
	body: string
	priority: NotificationPriority
	audienceType: NotificationAudienceType
	targetDepartment: string | null
	targetRole: NotificationRole | null
	targetUserIds: string[]
	/** audienceType 為 group 時使用的收件群組 */
	targetGroupId: string | null
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
	/** audienceType 為 group 時使用的收件群組 */
	targetGroupId: string | null
	actionLabel: string | null
	actionTo: string | null
	deliveryChannels: NotificationDeliveryChannel[]
	isEnabled: boolean
	/** 只有系統告警事件會用到；空陣列代表不分嚴重度都通知 */
	alertSeverities: AlertSeverity[]
}

export interface AutomaticNotificationTriggerResult {
	notificationId: string | null
	emailRecipientCount: number
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

// > 問答當下被限定的文件；空陣列代表未限定，整個知識範圍都可檢索
export interface AdminQuestionScopeDocument {
	id: string
	title: string
}

// > token 用量不是問答內容，因此可直接顯示於列表，不需留下調閱稽核
export interface AdminQuestionTokenUsage {
	promptTokens: number
	completionTokens: number
	embeddingTokens: number
	totalTokens: number
}

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
	scopedDocuments: AdminQuestionScopeDocument[]
	tokenUsage: AdminQuestionTokenUsage | null
	durationMs: number
	requestId: string
	citations: Citation[]
	trace: AnswerTrace | null
	/** 問答來源；未填視為前台提問。 */
	source?: AdminQuestionSource
	/** 來自自動回信時，對應的信件 id。 */
	mailId?: string
}

export type AdminQuestionSource = 'web' | 'mail'

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
	// > 稽核要能回答「誰」，光有姓名不夠，必須連帳號與來源 IP
	actorAccount?: string
	actorIp?: string
	resourceLabel?: string
	// > 對象要讓人看得懂，ID 是給機器對帳的，名稱才是給人讀的
	resourceName?: string
	operationScope?: string
	// > operationScope 是機器碼，operationLabel 是同一件事的人話說法
	operationLabel?: string
	requestId?: string
	// > 展開列顯示的詳情；由產生紀錄的一方決定要揭露哪些欄位，畫面只負責依序呈現
	details?: SystemRecordDetail[]
}

export interface SystemRecordDetail {
	label: string
	value: string
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
	source: DocumentSource
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

/** 編制單位選項。 */
export interface OrganizationUnit {
	id: string
	name: string
	parentName: string
}

/** 文件大類別與其下小類別。 */
export interface DocumentCategoryGroup {
	id: string
	name: string
	subCategories: string[]
}

/** 可指定為文件可見對象的使用者。 */
export interface DirectoryUser {
	id: string
	name: string
	email: string
	department: string
}

/** 可指定為文件可見對象的群組。 */
export interface DirectoryGroup {
	id: string
	name: string
	description: string
}
