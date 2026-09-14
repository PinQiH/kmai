import { reactive } from 'vue'
import { documents, documentVersionHistoryById } from '@/mocks/data'
import { versionFiles, type VersionFiles } from '@/mocks/documentFiles'
import type { DocumentVersionEntry, KnowledgeDocument } from '@/types'

export const workspaceDocuments = reactive(documents.map((item) => ({ ...item, tags: [...item.tags] })))
const histories = reactive<Record<string, DocumentVersionEntry[]>>({})

export function getWorkspaceVersions(document: KnowledgeDocument): DocumentVersionEntry[] {
	return histories[document.id] ?? documentVersionHistoryById[document.id] ?? [{
		version: document.version, date: document.updatedAt, author: document.owner,
		summary: document.summary, changes: [], isCurrent: true,
	}]
}

export function suggestVersion(versions: DocumentVersionEntry[]): string {
	const numbers = versions.map((entry) => entry.version.match(/^(\d+)\.(\d+)(?:\.(\d+))?$/)).filter((match) => match !== null)
	numbers.sort((a, b) => Number(b[1]) - Number(a[1]) || Number(b[2]) - Number(a[2]) || Number(b[3] ?? 0) - Number(a[3] ?? 0))
	const latest = numbers[0]
	return latest ? (latest[3] === undefined ? `${latest[1]}.${Number(latest[2]) + 1}` : `${latest[1]}.${latest[2]}.${Number(latest[3]) + 1}`) : '1.0'
}

export function addWorkspaceVersion(document: KnowledgeDocument, version: string, summary: string, files: VersionFiles): void {
	if (!/^\d+\.\d+(?:\.\d+)?$/.test(version) || !summary.trim()) throw new Error('請填寫有效的版本號與版本說明。')
	const existing = getWorkspaceVersions(document)
	if (existing.some((entry) => entry.version.split('.').map(Number).join('.') === version.split('.').map(Number).join('.'))) throw new Error('此版本號已存在。')
	histories[document.id] = [{ version, summary: summary.trim(), changes: [summary.trim()], date: new Date().toISOString().slice(0, 10), author: document.owner, isCurrent: false, status: '等待處理' }, ...existing]
	versionFiles[document.id] ??= {}
	versionFiles[document.id][version] = files
}

export function addWorkspaceDocument(document: KnowledgeDocument, summary: string, files: VersionFiles): void {
	workspaceDocuments.unshift(document)
	histories[document.id] = [{ version: document.version, summary, changes: [summary], date: document.uploadedAt, author: document.owner, isCurrent: false, status: '等待處理' }]
	versionFiles[document.id] = { [document.version]: files }
}
