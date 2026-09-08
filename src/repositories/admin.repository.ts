import {
	directoryGroups,
	directoryUsers,
	documentCategoryGroups,
	documents,
	healthMetrics,
	organizationUnits,
	recentActivities,
} from '@/mocks/data'
import type {
	ActivityItem,
	DirectoryGroup,
	DirectoryUser,
	DocumentCategoryGroup,
	HealthMetric,
	KnowledgeDocument,
	OrganizationUnit,
} from '@/types'

function cloneDocument(document: KnowledgeDocument): KnowledgeDocument {
	return { ...document, source: { ...document.source }, tags: [...document.tags] }
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

/** 取得編制單位快照。 */
export function getOrganizationUnitsSnapshot(): OrganizationUnit[] {
	return organizationUnits.map((unit) => ({ ...unit }))
}

/** 取得文件大類別與小類別快照。 */
export function getDocumentCategoryGroupsSnapshot(): DocumentCategoryGroup[] {
	return documentCategoryGroups.map((group) => ({ ...group, subCategories: [...group.subCategories] }))
}

/** 取得可指定可見範圍的使用者快照。 */
export function getDirectoryUsersSnapshot(): DirectoryUser[] {
	return directoryUsers.map((user) => ({ ...user }))
}

/** 取得可指定可見範圍的群組快照。 */
export function getDirectoryGroupsSnapshot(): DirectoryGroup[] {
	return directoryGroups.map((group) => ({ ...group }))
}
