import { defineStore } from 'pinia'

import type { Citation, DocumentSource, Notebook, NotebookCollaboratorRole, NotebookMember, NotebookRole, TextDocumentFormat } from '@/types'
import { canReadFileAsText, createUrlSnapshot, getFileExtension, parseHttpUrl } from '@/utils/documentSources'

export const CURRENT_USER_ID = 'user-current'
export type SaveAnswerToNotebookResult = 'saved' | 'already-saved' | 'not-found' | 'forbidden' | 'invalid'
export type AddNotebookSourceResult = 'added' | 'not-found' | 'forbidden' | 'invalid'

interface SaveAnswerToNotebookInput {
	notebookId: string
	answerId: string
	question: string
	answer: string
	citations: Citation[]
}

const NOTEBOOK_SOURCE_TITLE_MAX_LENGTH = 80
const NOTEBOOK_TEXT_MAX_LENGTH = 50_000
const NOTEBOOK_URL_MAX_LENGTH = 2_048
const FILE_PREVIEW_MAX_BYTES = 64 * 1024

const initialNotebooks: Notebook[] = [
	{
		id: 'notebook-product',
		name: '產品研究筆記',
		description: '整理市場資料、訪談紀錄與產品規格。',
		ownerName: '王小明',
		updatedAt: '2026-08-18T09:30:00+08:00',
		defaultWebSearchEnabled: true,
		documents: [
			{
				id: 'nb-doc-001',
				name: '2026-Q3-市場觀察.pdf',
				size: '2.4 MB',
				uploadedAt: '2026-08-18',
				status: 'ready',
				source: {
					type: 'file',
					fileName: '2026-Q3-市場觀察.pdf',
					mimeType: 'application/pdf',
					extension: 'pdf',
					previewText: '第三季市場調查顯示，企業客戶更重視知識內容的可追溯性、版本資訊與跨部門協作。建議產品規劃優先強化引用來源與文件治理。',
				},
			},
			{
				id: 'nb-doc-002',
				name: '產品訪談重點.md',
				size: '2 KB',
				uploadedAt: '2026-08-17',
				status: 'ready',
				source: {
					type: 'text',
					format: 'markdown',
					content: '# 產品訪談重點\n\n## 使用者需求\n\n- 回答必須標示引用來源\n- 儲存後仍能加入其他筆記本\n\n> 使用者希望在同一個工作區完成查找、整理與分享。',
				},
			},
			{
				id: 'nb-doc-003',
				name: '第三季市場趨勢',
				size: '網頁快照',
				uploadedAt: '2026-08-16',
				status: 'ready',
				source: {
					type: 'url',
					url: 'https://example.com/market/2026-q3',
					domain: 'example.com',
					capturedAt: '2026-08-16T11:20:00+08:00',
					snapshot: '這份網頁快照整理 2026 年第三季企業知識管理市場趨勢，包含可信任 AI、內容治理與個人化工作空間等觀察。',
				},
			},
		],
		members: [
			{ id: CURRENT_USER_ID, name: '王小明', type: 'user', role: 'owner' },
			{ id: 'group-product', name: '產品企劃部', type: 'group', role: 'viewer' },
		],
	},
	{
		id: 'notebook-onboarding',
		name: '新人培訓資料',
		description: '團隊流程與新人課程的個人整理。',
		ownerName: '王小明',
		updatedAt: '2026-08-16T14:10:00+08:00',
		defaultWebSearchEnabled: false,
		documents: [],
		members: [{ id: CURRENT_USER_ID, name: '王小明', type: 'user', role: 'owner' }],
	},
]

function formatFileSize(bytes: number): string {
	if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
	return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function cloneDocumentSource(source: DocumentSource): DocumentSource {
	if (source.type !== 'ai-answer') return { ...source }
	return {
		...source,
		citations: source.citations.map((citation) => ({ ...citation })),
	}
}

async function readFilePreview(file: File): Promise<{ text?: string; truncated: boolean }> {
	const truncated = file.size > FILE_PREVIEW_MAX_BYTES
	const previewBlob = truncated ? file.slice(0, FILE_PREVIEW_MAX_BYTES) : file
	const blobWithText = previewBlob as Blob & { text?: () => Promise<string> }
	if (typeof blobWithText.text === 'function') {
		return { text: await blobWithText.text().catch(() => undefined), truncated }
	}
	if (typeof FileReader === 'undefined') return { truncated }

	return new Promise((resolve) => {
		const reader = new FileReader()
		reader.addEventListener('load', () => resolve({ text: typeof reader.result === 'string' ? reader.result : undefined, truncated }), { once: true })
		reader.addEventListener('error', () => resolve({ truncated }), { once: true })
		reader.readAsText(previewBlob)
	})
}

function createAnswerFileName(question: string): string {
	const sanitizedQuestion = question
		.replace(/[\u0000-\u001f<>:"/\\|?*]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.replace(/[. ]+$/g, '')
	const truncatedQuestion = Array.from(sanitizedQuestion).slice(0, 60).join('').replace(/[. ]+$/g, '')
	const safeBaseName = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(truncatedQuestion)
		? `AI 回答-${truncatedQuestion}`
		: truncatedQuestion
	return `${safeBaseName || 'AI 回答'}.md`
}

export const useNotebooksStore = defineStore('notebooks', {
	state: () => ({
		notebooks: initialNotebooks.map((notebook) => ({
			...notebook,
			documents: notebook.documents.map((document) => ({
				...document,
				source: cloneDocumentSource(document.source),
			})),
			members: notebook.members.map((member) => ({ ...member })),
		})),
	}),
	getters: {
		getCurrentUserRole: (state) => (notebookId: string): NotebookRole | null => {
			return state.notebooks.find((notebook) => notebook.id === notebookId)?.members.find((member) => member.id === CURRENT_USER_ID)?.role ?? null
		},
		canEditContent(): (notebookId: string) => boolean {
			return (notebookId) => {
				const role = this.getCurrentUserRole(notebookId)
				return role === 'owner' || role === 'editor'
			}
		},
		canManageSharing(): (notebookId: string) => boolean {
			return (notebookId) => this.getCurrentUserRole(notebookId) === 'owner'
		},
		getSavedNotebookIds: (state) => (answerId: string): string[] => {
			const trimmedAnswerId = answerId.trim()
			if (!trimmedAnswerId) return []
			return state.notebooks
				.filter((notebook) => notebook.documents.some((document) => (
					document.source.type === 'ai-answer' && document.source.answerId === trimmedAnswerId
				)))
				.map((notebook) => notebook.id)
		},
	},
	actions: {
		createNotebook({ name, description }: { name: string; description: string }): string | null {
			const trimmedName = name.trim()
			if (!trimmedName) return null
			const id = crypto.randomUUID()
			this.notebooks.unshift({
				id,
				name: trimmedName,
				description: description.trim(),
				ownerName: '王小明',
				updatedAt: new Date().toISOString(),
				defaultWebSearchEnabled: false,
				documents: [],
				members: [{ id: CURRENT_USER_ID, name: '王小明', type: 'user', role: 'owner' }],
			})
			return id
		},
		renameNotebook({ notebookId, name }: { notebookId: string; name: string }): boolean {
			const trimmedName = name.trim()
			if (!trimmedName || trimmedName.length > 60 || !this.canManageSharing(notebookId)) return false
			const notebook = this.notebooks.find((item) => item.id === notebookId)
			if (!notebook) return false
			notebook.name = trimmedName
			notebook.updatedAt = new Date().toISOString()
			return true
		},
		updateNotebookDetails({ notebookId, name, description }: { notebookId: string; name: string; description: string }): boolean {
			const trimmedName = name.trim()
			const trimmedDescription = description.trim()
			if (!trimmedName || trimmedName.length > 60 || trimmedDescription.length > 160 || !this.canManageSharing(notebookId)) return false
			const notebook = this.notebooks.find((item) => item.id === notebookId)
			if (!notebook) return false
			notebook.name = trimmedName
			notebook.description = trimmedDescription
			notebook.updatedAt = new Date().toISOString()
			return true
		},
		deleteNotebook(notebookId: string): boolean {
			if (!this.canManageSharing(notebookId)) return false
			const notebookIndex = this.notebooks.findIndex((item) => item.id === notebookId)
			if (notebookIndex < 0) return false
			this.notebooks.splice(notebookIndex, 1)
			return true
		},
		async addDocuments({ notebookId, files }: { notebookId: string; files: File[] }): Promise<AddNotebookSourceResult> {
			if (!files.length) return 'invalid'
			if (!this.notebooks.some((item) => item.id === notebookId)) return 'not-found'
			if (!this.canEditContent(notebookId)) return 'forbidden'
			const sources = await Promise.all(files.map(async (file) => ({
				file,
				preview: canReadFileAsText(file)
					? await readFilePreview(file)
					: { text: undefined, truncated: false },
			})))
			const notebook = this.notebooks.find((item) => item.id === notebookId)
			if (!notebook) return 'not-found'
			if (!this.canEditContent(notebookId)) return 'forbidden'
			for (const { file, preview } of sources) {
				const previewText = preview.text?.trim() || undefined
				notebook.documents.unshift({
					id: crypto.randomUUID(),
					name: file.name,
					size: formatFileSize(file.size),
					uploadedAt: new Date().toISOString().slice(0, 10),
					status: 'ready',
					source: {
						type: 'file',
						fileName: file.name,
						mimeType: file.type || 'application/octet-stream',
						extension: getFileExtension(file.name),
						previewText,
						previewTruncated: previewText && preview.truncated ? true : undefined,
					},
				})
			}
			notebook.updatedAt = new Date().toISOString()
			return 'added'
		},
		addTextDocument({ notebookId, title, content, format }: { notebookId: string; title: string; content: string; format: TextDocumentFormat }): AddNotebookSourceResult {
			const trimmedTitle = title.trim()
			const trimmedContent = content.trim()
			if (
				!trimmedTitle
				|| !trimmedContent
				|| trimmedTitle.length > NOTEBOOK_SOURCE_TITLE_MAX_LENGTH
				|| trimmedContent.length > NOTEBOOK_TEXT_MAX_LENGTH
				|| !['plain-text', 'markdown'].includes(format)
			) return 'invalid'
			const notebook = this.notebooks.find((item) => item.id === notebookId)
			if (!notebook) return 'not-found'
			if (!this.canEditContent(notebookId)) return 'forbidden'
			const createdAt = new Date().toISOString()
			notebook.documents.unshift({
				id: crypto.randomUUID(),
				name: `${trimmedTitle}.${format === 'markdown' ? 'md' : 'txt'}`,
				size: formatFileSize(new TextEncoder().encode(trimmedContent).byteLength),
				uploadedAt: createdAt.slice(0, 10),
				status: 'ready',
				source: { type: 'text', format, content: trimmedContent },
			})
			notebook.updatedAt = createdAt
			return 'added'
		},
		addUrlDocument({ notebookId, title, url }: { notebookId: string; title: string; url: string }): AddNotebookSourceResult {
			const parsedUrl = parseHttpUrl(url)
			const trimmedTitle = title.trim()
			if (!parsedUrl || url.trim().length > NOTEBOOK_URL_MAX_LENGTH || trimmedTitle.length > NOTEBOOK_SOURCE_TITLE_MAX_LENGTH) return 'invalid'
			const notebook = this.notebooks.find((item) => item.id === notebookId)
			if (!notebook) return 'not-found'
			if (!this.canEditContent(notebookId)) return 'forbidden'
			const createdAt = new Date().toISOString()
			const displayTitle = trimmedTitle || parsedUrl.domain
			notebook.documents.unshift({
				id: crypto.randomUUID(),
				name: displayTitle,
				size: '網頁快照',
				uploadedAt: createdAt.slice(0, 10),
				status: 'ready',
				source: {
					type: 'url',
					url: parsedUrl.url,
					domain: parsedUrl.domain,
					capturedAt: createdAt,
					snapshot: createUrlSnapshot(displayTitle, parsedUrl.domain),
				},
			})
			notebook.updatedAt = createdAt
			return 'added'
		},
		/**
		 * 將 AI 回答保存成指定筆記本內的 Markdown 筆記。
		 * @param notebookId 目標筆記本識別碼。
		 * @param answerId 來源回答識別碼，用於避免重複保存。
		 * @param question 產生這筆回答的原始問題。
		 * @param answer AI 回答本文。
		 * @param citations 回答引用來源快照。
		 * @returns 儲存結果與可供畫面判斷的失敗原因。
		 */
		saveAnswerToNotebook({ notebookId, answerId, question, answer, citations }: SaveAnswerToNotebookInput): SaveAnswerToNotebookResult {
			const trimmedNotebookId = notebookId.trim()
			const trimmedAnswerId = answerId.trim()
			const trimmedQuestion = question.trim()
			const trimmedAnswer = answer.trim()
			if (!trimmedNotebookId || !trimmedAnswerId || !trimmedQuestion || !trimmedAnswer) return 'invalid'

			const notebook = this.notebooks.find((item) => item.id === trimmedNotebookId)
			if (!notebook) return 'not-found'
			if (!this.canEditContent(trimmedNotebookId)) return 'forbidden'
			if (notebook.documents.some((document) => document.source.type === 'ai-answer' && document.source.answerId === trimmedAnswerId)) return 'already-saved'

			const createdAt = new Date().toISOString()
			notebook.documents.unshift({
				id: crypto.randomUUID(),
				name: createAnswerFileName(trimmedQuestion),
				size: formatFileSize(new TextEncoder().encode(trimmedAnswer).byteLength),
				uploadedAt: createdAt.slice(0, 10),
				status: 'ready',
				source: {
					type: 'ai-answer',
					answerId: trimmedAnswerId,
					question: trimmedQuestion,
					content: trimmedAnswer,
					citations: citations.map((citation) => ({ ...citation })),
				},
			})
			notebook.updatedAt = createdAt
			return 'saved'
		},
		addMember({ notebookId, member }: { notebookId: string; member: NotebookMember & { role: NotebookCollaboratorRole } }): void {
			const notebook = this.notebooks.find((item) => item.id === notebookId)
			if (!notebook || (member.role as NotebookRole) === 'owner' || !this.canManageSharing(notebookId) || notebook.members.some((item) => item.name === member.name && item.type === member.type)) return
			notebook.members.push({ ...member })
		},
		updateMemberRole({ notebookId, memberId, role }: { notebookId: string; memberId: string; role: NotebookCollaboratorRole }): void {
			if ((role as NotebookRole) === 'owner' || !this.canManageSharing(notebookId)) return
			const member = this.notebooks.find((item) => item.id === notebookId)?.members.find((item) => item.id === memberId)
			if (!member || member.role === 'owner') return
			member.role = role
		},
		removeMember({ notebookId, memberId }: { notebookId: string; memberId: string }): void {
			const notebook = this.notebooks.find((item) => item.id === notebookId)
			if (!notebook || !this.canManageSharing(notebookId)) return
			notebook.members = notebook.members.filter((member) => member.id !== memberId || member.role === 'owner')
		},
		updateDefaultWebSearch({ notebookId, isEnabled }: { notebookId: string; isEnabled: boolean }): void {
			const notebook = this.notebooks.find((item) => item.id === notebookId)
			if (!notebook || !this.canManageSharing(notebookId)) return
			notebook.defaultWebSearchEnabled = isEnabled
			notebook.updatedAt = new Date().toISOString()
		},
	},
})
