import { workspaceDocuments as documents } from '@/mocks/documentWorkspace'
import {
	directoryGroups,
	directoryUsers,
	documentCategoryGroups,
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

// @ 假資料沒有網路延遲，加上固定延遲讓載入狀態在展示環境看得見
const MOCK_DELAY_MS = 320

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
export async function fetchHealthMetrics(): Promise<HealthMetric[]> {
	// TODO(api-integration): 改為呼叫後端系統健康度 API。
	await new Promise((resolve) => window.setTimeout(resolve, MOCK_DELAY_MS))
	return readHealthMetrics()
}

function readHealthMetrics(): HealthMetric[] {
	return healthMetrics.map((metric) => ({ ...metric }))
}

/** 取得管理總覽近期活動快照。 */
export async function fetchRecentActivities(): Promise<ActivityItem[]> {
	// TODO(api-integration): 改為呼叫後端近期動態 API。
	await new Promise((resolve) => window.setTimeout(resolve, MOCK_DELAY_MS))
	return readRecentActivities()
}

function readRecentActivities(): ActivityItem[] {
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
