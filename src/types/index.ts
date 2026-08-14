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
}

export interface NavigationItem {
	title: string
	icon: string
	to: string
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
