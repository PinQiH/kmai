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
