import { addWorkspaceDocument, addWorkspaceVersion, workspaceDocuments as documents } from '@/mocks/documentWorkspace'
import {
	directoryGroups,
	directoryUsers,
	documentCategoryGroups,
	healthMetrics,
	organizationUnits,
	recentActivities,
} from '@/mocks/data'
import { enqueueAttachmentProcessing, enqueueDocumentProcessing, removeProcessingFile } from '@/mocks/documentProcessing'
import { getDocumentVersionDetail } from '@/mocks/documentDetails'
import { versionFiles, type VersionFiles } from '@/mocks/documentFiles'
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
 * 建立管理端文件並排入處理佇列。
 * @param input 文件內容、版本說明與版本檔案。
 * @returns 建立後的文件識別碼。
 */
export async function createAdminDocument(input: {
	document: KnowledgeDocument
	versionNote: string
	files: VersionFiles
}): Promise<string> {
	// TODO(api-integration): 改為呼叫 POST /api/v2/admin/documents（multipart）。
	await new Promise((resolve) => window.setTimeout(resolve, MOCK_DELAY_MS))
	addWorkspaceDocument(input.document, input.versionNote, input.files)
	enqueueDocumentProcessing(input.document.id, input.document.version, input.document.owner)
	return input.document.id
}

/**
 * 為文件建立新版本並排入處理佇列。
 * @param input 文件、版本號、版本說明與版本檔案。
 */
export async function createDocumentVersion(input: {
	document: KnowledgeDocument
	version: string
	versionNote: string
	files: VersionFiles
}): Promise<void> {
	// TODO(api-integration): 改為呼叫 POST /api/v2/admin/documents/:documentId/versions。
	await new Promise((resolve) => window.setTimeout(resolve, MOCK_DELAY_MS))
	addWorkspaceVersion(input.document, input.version, input.versionNote, input.files)
	enqueueDocumentProcessing(input.document.id, input.version, input.document.owner)
}

/**
 * 為指定版本新增附件並排入處理佇列。
 * @param input 文件、版本、附件檔案與主檔名稱。
 */
export async function addDocumentAttachments(input: {
	document: KnowledgeDocument
	version: string
	versionSummary: string
	files: File[]
	mainFileName: string
}): Promise<void> {
	// TODO(api-integration): 改為呼叫 POST /api/v2/admin/documents/:documentId/attachments。
	await new Promise((resolve) => window.setTimeout(resolve, MOCK_DELAY_MS))
	const { document, version } = input
	versionFiles[document.id] ??= {}
	versionFiles[document.id][version] ??= {
		source: document.source,
		attachments: [],
		sections: getDocumentVersionDetail({ documentId: document.id, version, versionSummary: input.versionSummary }).sections,
	}
	versionFiles[document.id][version].attachments.push(...input.files)
	enqueueAttachmentProcessing(document.id, version, input.files.map((file) => file.name), input.mainFileName)
}

/**
 * 移除指定版本的附件。
 * @param input 文件識別碼、版本與附件名稱。
 */
export async function removeDocumentAttachment(input: {
	documentId: string
	version: string
	fileName: string
}): Promise<void> {
	// TODO(api-integration): 改為呼叫 DELETE /api/v2/admin/documents/:documentId/attachments/:fileName。
	await new Promise((resolve) => window.setTimeout(resolve, MOCK_DELAY_MS))
	removeProcessingFile(input.documentId, input.version, input.fileName)
	const files = versionFiles[input.documentId]?.[input.version]
	if (!files) return
	files.attachments = files.attachments.filter((file) => file.name !== input.fileName)
}

/**
 * 為指定版本建立處理工作。
 * @param input 文件識別碼、版本與擁有者。
 */
export async function createProcessingJob(input: { documentId: string; version: string; owner: string }): Promise<void> {
	// TODO(api-integration): 改為呼叫 POST /api/v2/admin/ingestion-jobs。
	await new Promise((resolve) => window.setTimeout(resolve, MOCK_DELAY_MS))
	enqueueDocumentProcessing(input.documentId, input.version, input.owner)
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
