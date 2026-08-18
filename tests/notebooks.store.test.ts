import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { CURRENT_USER_ID, useNotebooksStore } from '../src/stores/notebooks'
import type { NotebookCollaboratorRole } from '../src/types'

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

	it('should enforce owner editor and viewer permissions in store actions', () => {
		const store = useNotebooksStore()
		const notebook = store.notebooks[0]
		const currentUser = notebook.members.find((member) => member.id === CURRENT_USER_ID)!
		const originalDocumentCount = notebook.documents.length

		currentUser.role = 'viewer'
		store.addDocuments({ notebookId: notebook.id, files: [new File(['test'], 'viewer.txt')] })
		store.addMember({ notebookId: notebook.id, member: { id: 'user-new', name: '新成員', type: 'user', role: 'viewer' } })
		expect(notebook.documents).toHaveLength(originalDocumentCount)
		expect(notebook.members.some((member) => member.id === 'user-new')).toBe(false)

		currentUser.role = 'editor'
		store.addDocuments({ notebookId: notebook.id, files: [new File(['test'], 'editor.txt')] })
		store.updateDefaultWebSearch({ notebookId: notebook.id, isEnabled: false })
		expect(notebook.documents).toHaveLength(originalDocumentCount + 1)
		expect(notebook.defaultWebSearchEnabled).toBe(true)

		currentUser.role = 'owner'
		store.updateDefaultWebSearch({ notebookId: notebook.id, isEnabled: false })
		expect(notebook.defaultWebSearchEnabled).toBe(false)
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
})
