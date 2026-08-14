import { documents, healthMetrics, recentActivities } from '@/mocks/data'
import type { ActivityItem, HealthMetric, KnowledgeDocument } from '@/types'

function cloneDocument(document: KnowledgeDocument): KnowledgeDocument {
	return { ...document, tags: [...document.tags] }
}

/** 取得管理端文件快照。 */
export function getAdminDocumentsSnapshot(): KnowledgeDocument[] {
	return documents.map(cloneDocument)
}

/** 依識別碼取得管理端文件快照。 */
export function getAdminDocumentById(documentId: string): KnowledgeDocument | undefined {
	const document = documents.find((item) => item.id === documentId)
	return document ? cloneDocument(document) : undefined
}

/** 取得管理總覽健康指標快照。 */
export function getHealthMetricsSnapshot(): HealthMetric[] {
	return healthMetrics.map((metric) => ({ ...metric }))
}

/** 取得管理總覽近期活動快照。 */
export function getRecentActivitiesSnapshot(): ActivityItem[] {
	return recentActivities.map((activity) => ({ ...activity }))
}
