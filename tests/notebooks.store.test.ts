import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { CURRENT_USER_ID, useNotebooksStore } from '../src/stores/notebooks'
import type { Citation, NotebookCollaboratorRole } from '../src/types'

describe('notebooks store', () => {
	beforeEach(() => setActivePinia(createPinia()))

	it('should create a private notebook with the current user as owner', () => {
		const store = useNotebooksStore()
		const notebookId = store.createNotebook({ name: ' 我的研究 ', description: '測試資料' })
		const notebook = store.notebooks.find((item) => item.id === notebookId)

		expect(notebook?.name).toBe('我的研究')
		expect(notebook?.members).toEqual([
			expect.objectContaining({ name: '王小明', role: 'owner' }),
		])
		expect(notebook?.defaultWebSearchEnabled).toBe(false)
	})

	it('should ignore blank names and duplicate sharing targets', () => {
		const store = useNotebooksStore()
		expect(store.createNotebook({ name: '   ', description: '' })).toBeNull()

		const notebook = store.notebooks[0]
		const existingMember = notebook.members.find((member) => member.role !== 'owner')!
		store.addMember({ notebookId: notebook.id, member: { ...existingMember, id: 'duplicate' } })

		expect(notebook.members.filter((member) => member.name === existingMember.name)).toHaveLength(1)
	})

	it('should protect the owner while allowing collaborator role changes', () => {
		const store = useNotebooksStore()
		const notebook = store.notebooks[0]
		const owner = notebook.members.find((member) => member.role === 'owner')!
		const collaborator = notebook.members.find((member) => member.role !== 'owner')!

		store.updateMemberRole({ notebookId: notebook.id, memberId: collaborator.id, role: 'editor' })
		store.removeMember({ notebookId: notebook.id, memberId: owner.id })

		expect(collaborator.role).toBe('editor')
		expect(notebook.members).toContainEqual(owner)
	})

	it('should enforce owner editor and viewer permissions in store actions', async () => {
		const store = useNotebooksStore()
		const notebook = store.notebooks[0]
		const currentUser = notebook.members.find((member) => member.id === CURRENT_USER_ID)!
		const originalDocumentCount = notebook.documents.length

		currentUser.role = 'viewer'
		await store.addDocuments({ notebookId: notebook.id, files: [new File(['test'], 'viewer.txt')] })
		store.addMember({ notebookId: notebook.id, member: { id: 'user-new', name: '新成員', type: 'user', role: 'viewer' } })
		expect(notebook.documents).toHaveLength(originalDocumentCount)
		expect(notebook.members.some((member) => member.id === 'user-new')).toBe(false)

		currentUser.role = 'editor'
		await store.addDocuments({ notebookId: notebook.id, files: [new File(['test'], 'editor.txt')] })
		store.updateDefaultWebSearch({ notebookId: notebook.id, isEnabled: false })
		expect(notebook.documents).toHaveLength(originalDocumentCount + 1)
		expect(notebook.defaultWebSearchEnabled).toBe(true)

		currentUser.role = 'owner'
		store.updateDefaultWebSearch({ notebookId: notebook.id, isEnabled: false })
		expect(notebook.defaultWebSearchEnabled).toBe(false)
	})

	it('should save an AI answer for owners and editors', () => {
		const store = useNotebooksStore()
		const ownerNotebook = store.notebooks[0]
		const editorNotebook = store.notebooks[1]
		const editor = editorNotebook.members.find((member) => member.id === CURRENT_USER_ID)!
		editor.role = 'editor'

		expect(store.saveAnswerToNotebook({
			notebookId: ` ${ownerNotebook.id} `,
			answerId: ' answer-owner ',
			question: '  如何申請：差旅/住宿？  ',
			answer: '  請先填寫差旅申請。  ',
			citations: [],
		})).toBe('saved')
		expect(store.saveAnswerToNotebook({
			notebookId: editorNotebook.id,
			answerId: 'answer-editor',
			question: '編輯者也能儲存嗎？',
			answer: '可以。',
			citations: [],
		})).toBe('saved')

		expect(ownerNotebook.documents[0]).toMatchObject({
			name: '如何申請：差旅 住宿？.md',
			size: '1 KB',
			status: 'ready',
			source: {
				type: 'ai-answer',
				answerId: 'answer-owner',
				question: '如何申請：差旅/住宿？',
				content: '請先填寫差旅申請。',
			},
		})
		expect(editorNotebook.documents[0]?.source).toMatchObject({ type: 'ai-answer', answerId: 'answer-editor' })
	})

	it('should forbid viewers from saving an AI answer', () => {
		const store = useNotebooksStore()
		const notebook = store.notebooks[0]
		const currentUser = notebook.members.find((member) => member.id === CURRENT_USER_ID)!
		const originalDocumentCount = notebook.documents.length
		currentUser.role = 'viewer'

		expect(store.saveAnswerToNotebook({
			notebookId: notebook.id,
			answerId: 'answer-viewer',
			question: 'Viewer 可以儲存嗎？',
			answer: '不可以。',
			citations: [],
		})).toBe('forbidden')
		expect(notebook.documents).toHaveLength(originalDocumentCount)
	})

	it('should reject blank answer input and missing notebooks', () => {
		const store = useNotebooksStore()
		const validInput = {
			notebookId: store.notebooks[0].id,
			answerId: 'answer-valid',
			question: '有效問題',
			answer: '有效回答',
			citations: [],
		}

		for (const field of ['notebookId', 'answerId', 'question', 'answer'] as const) {
			expect(store.saveAnswerToNotebook({ ...validInput, [field]: '   ' })).toBe('invalid')
		}
		expect(store.saveAnswerToNotebook({ ...validInput, notebookId: 'notebook-missing' })).toBe('not-found')
	})

	it('should prevent saving the same answer twice in one notebook', () => {
		const store = useNotebooksStore()
		const notebook = store.notebooks[0]
		const input = {
			notebookId: notebook.id,
			answerId: 'answer-duplicate',
			question: '同一題',
			answer: '同一個回答',
			citations: [],
		}

		expect(store.saveAnswerToNotebook(input)).toBe('saved')
		expect(store.saveAnswerToNotebook(input)).toBe('already-saved')
		expect(notebook.documents.filter((document) => document.source.type === 'ai-answer' && document.source.answerId === input.answerId)).toHaveLength(1)
	})

	it('should store a defensive copy of answer citations', () => {
		const store = useNotebooksStore()
		const notebook = store.notebooks[0]
		const citations: Citation[] = [{
			id: 'citation-1',
			documentId: 'document-1',
			title: '差旅辦法',
			section: '住宿費用',
			excerpt: '每晚住宿上限為三千元。',
			confidence: 0.96,
		}]

		expect(store.saveAnswerToNotebook({
			notebookId: notebook.id,
			answerId: 'answer-with-citation',
			question: '住宿上限是多少？',
			answer: '每晚三千元。',
			citations,
		})).toBe('saved')
		const source = notebook.documents[0]?.source
		const storedCitations = source?.type === 'ai-answer' ? source.citations : undefined
		citations[0].title = '外部資料已被修改'

		expect(storedCitations).not.toBe(citations)
		expect(storedCitations?.[0]).not.toBe(citations[0])
		expect(storedCitations?.[0]?.title).toBe('差旅辦法')
	})

	it('should save one answer to multiple notebooks and report every saved target', () => {
		const store = useNotebooksStore()
		const [firstNotebook, secondNotebook] = store.notebooks
		const input = {
			answerId: 'answer-multiple-notebooks',
			question: '同一回答可以整理到多處嗎？',
			answer: '可以，每一本各保存一份。',
			citations: [],
		}

		expect(store.saveAnswerToNotebook({ ...input, notebookId: firstNotebook.id })).toBe('saved')
		expect(store.saveAnswerToNotebook({ ...input, notebookId: secondNotebook.id })).toBe('saved')
		expect(store.getSavedNotebookIds(input.answerId)).toEqual([firstNotebook.id, secondNotebook.id])
	})

	it('should add text and safe URL sources while rejecting unsafe URLs', () => {
		const store = useNotebooksStore()
		const notebook = store.notebooks[0]

		expect(store.addTextDocument({ notebookId: notebook.id, title: '研究摘要', content: '# 結論', format: 'markdown' })).toBe('added')
		expect(store.addUrlDocument({ notebookId: notebook.id, title: '參考資料', url: 'https://example.com/reference' })).toBe('added')
		expect(store.addUrlDocument({ notebookId: notebook.id, title: '危險網址', url: 'javascript:alert(1)' })).toBe('invalid')
		expect(notebook.documents[0]?.source).toMatchObject({ type: 'url', domain: 'example.com' })
		expect(notebook.documents[1]?.source).toMatchObject({ type: 'text', format: 'markdown', content: '# 結論' })
	})

	it('should limit large text file previews to the first 64 KB', async () => {
		const store = useNotebooksStore()
		const notebook = store.notebooks[0]
		const result = await store.addDocuments({
			notebookId: notebook.id,
			files: [new File(['a'.repeat(70 * 1024)], 'large-notes.txt', { type: 'text/plain' })],
		})
		const source = notebook.documents[0]?.source

		expect(result).toBe('added')
		expect(source).toMatchObject({ type: 'file', previewTruncated: true })
		if (source?.type !== 'file') throw new Error('Expected a file source')
		expect(source.previewText?.length).toBeLessThanOrEqual(64 * 1024)
	})

	it('should report a permission change that happens while a file is being read', async () => {
		const store = useNotebooksStore()
		const notebook = store.notebooks[0]
		const currentUser = notebook.members.find((member) => member.id === CURRENT_USER_ID)!
		let resolveText!: (content: string) => void
		const delayedFile = {
			name: 'delayed.txt',
			type: 'text/plain',
			size: 4,
			text: () => new Promise<string>((resolve) => { resolveText = resolve }),
		} as unknown as File
		const pendingResult = store.addDocuments({ notebookId: notebook.id, files: [delayedFile] })

		await Promise.resolve()
		currentUser.role = 'viewer'
		resolveText('test')

		expect(await pendingResult).toBe('forbidden')
		expect(notebook.documents.some((document) => document.name === delayedFile.name)).toBe(false)
	})

	it('should isolate initial document sources between Pinia instances', () => {
		const firstStore = useNotebooksStore()
		const firstSource = firstStore.notebooks[0].documents.find((document) => document.source.type === 'text')?.source
		if (firstSource?.type !== 'text') throw new Error('Expected an initial text source')
		firstSource.content = 'mutated content'

		setActivePinia(createPinia())
		const secondStore = useNotebooksStore()
		const secondSource = secondStore.notebooks[0].documents.find((document) => document.source.type === 'text')?.source

		expect(secondSource).toMatchObject({ type: 'text' })
		if (secondSource?.type !== 'text') throw new Error('Expected an initial text source')
		expect(secondSource.content).not.toBe('mutated content')
	})

	it('should reject attempts to create or promote a second owner', () => {
		const store = useNotebooksStore()
		const notebook = store.notebooks[0]
		const collaborator = notebook.members.find((member) => member.role !== 'owner')!
		const forgedOwnerRole = 'owner' as NotebookCollaboratorRole

		store.addMember({ notebookId: notebook.id, member: { id: 'forged-owner', name: '偽造擁有者', type: 'user', role: forgedOwnerRole } })
		store.updateMemberRole({ notebookId: notebook.id, memberId: collaborator.id, role: forgedOwnerRole })

		expect(notebook.members.some((member) => member.id === 'forged-owner')).toBe(false)
		expect(collaborator.role).not.toBe('owner')
	})

	it('should let the owner rename and delete a notebook', () => {
		const store = useNotebooksStore()
		const notebook = store.notebooks[0]

		expect(store.renameNotebook({ notebookId: notebook.id, name: '  新的產品研究  ' })).toBe(true)
		expect(notebook.name).toBe('新的產品研究')
		expect(store.deleteNotebook(notebook.id)).toBe(true)
		expect(store.notebooks.some((item) => item.id === notebook.id)).toBe(false)
	})

	it('should let the owner update the notebook name and description together', () => {
		const store = useNotebooksStore()
		const notebook = store.notebooks[0]

		expect(store.updateNotebookDetails({
			notebookId: notebook.id,
			name: '  市場研究  ',
			description: '  彙整訪談、競品與市場趨勢。  ',
		})).toBe(true)
		expect(notebook.name).toBe('市場研究')
		expect(notebook.description).toBe('彙整訪談、競品與市場趨勢。')
	})

	it('should reject invalid names and prevent non-owners from renaming or deleting', () => {
		const store = useNotebooksStore()
		const notebook = store.notebooks[0]
		const currentUser = notebook.members.find((member) => member.id === CURRENT_USER_ID)!
		const originalName = notebook.name
		const originalDescription = notebook.description

		expect(store.renameNotebook({ notebookId: notebook.id, name: '   ' })).toBe(false)
		expect(store.renameNotebook({ notebookId: notebook.id, name: '過長名稱'.repeat(20) })).toBe(false)
		expect(store.updateNotebookDetails({ notebookId: notebook.id, name: '有效名稱', description: '說明'.repeat(81) })).toBe(false)
		currentUser.role = 'editor'
		expect(store.renameNotebook({ notebookId: notebook.id, name: '編輯者改名' })).toBe(false)
		expect(store.updateNotebookDetails({ notebookId: notebook.id, name: '編輯者改名', description: '編輯者改描述' })).toBe(false)
		expect(store.deleteNotebook(notebook.id)).toBe(false)
		expect(notebook.name).toBe(originalName)
		expect(notebook.description).toBe(originalDescription)
		expect(store.notebooks).toContain(notebook)
	})
})
