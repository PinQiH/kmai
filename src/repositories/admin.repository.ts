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

/**
 * 取得管理端文件清單。
 * @returns 文件副本；修改結果需呼叫寫入函式再重新取得。
 */
export async function fetchAdminDocuments(): Promise<KnowledgeDocument[]> {
	// TODO(api-integration): 改為呼叫 GET /api/v2/admin/documents（支援 page、pageSize 與篩選）。
	await new Promise((resolve) => window.setTimeout(resolve, MOCK_DELAY_MS))
	return documents.map(cloneDocument)
}

/**
 * 刪除管理端文件。
 * @param documentId 文件識別碼。
 */
export async function deleteAdminDocument(documentId: string): Promise<void> {
	// TODO(api-integration): 改為呼叫 DELETE /api/v2/admin/documents/:documentId。
	await new Promise((resolve) => window.setTimeout(resolve, MOCK_DELAY_MS))
	const index = documents.findIndex((document) => document.id === documentId)
	if (index >= 0) documents.splice(index, 1)
}

/**
 * 批次核准並發布文件。
 * @param documentIds 要核准的文件識別碼。
 * @returns 實際變更的份數；不存在的識別碼會被略過。
 */
export async function publishAdminDocuments(documentIds: string[]): Promise<number> {
	// TODO(api-integration): 改為呼叫 POST /api/v2/admin/documents/:documentId/review。
	await new Promise((resolve) => window.setTimeout(resolve, MOCK_DELAY_MS))
	const targets = new Set(documentIds)
	let changed = 0
	for (const document of documents) {
		if (!targets.has(document.id)) continue
		document.status = '已發布'
		changed += 1
	}
	return changed
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
