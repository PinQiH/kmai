import { defineStore } from 'pinia'

import type { Notebook, NotebookCollaboratorRole, NotebookMember, NotebookRole } from '@/types'

export const CURRENT_USER_ID = 'user-current'

const initialNotebooks: Notebook[] = [
	{
		id: 'notebook-product',
		name: '產品研究筆記',
		description: '整理市場資料、訪談紀錄與產品規格。',
		ownerName: '王小明',
		updatedAt: '2026-08-18T09:30:00+08:00',
		defaultWebSearchEnabled: true,
		documents: [
			{ id: 'nb-doc-001', name: '2026-Q3-市場觀察.pdf', size: '2.4 MB', uploadedAt: '2026-08-18', status: 'ready' },
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

export const useNotebooksStore = defineStore('notebooks', {
	state: () => ({
		notebooks: initialNotebooks.map((notebook) => ({
			...notebook,
			documents: notebook.documents.map((document) => ({ ...document })),
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
		addDocuments({ notebookId, files }: { notebookId: string; files: File[] }): void {
			const notebook = this.notebooks.find((item) => item.id === notebookId)
			if (!notebook || !this.canEditContent(notebookId)) return
			for (const file of files) {
				notebook.documents.unshift({
					id: crypto.randomUUID(),
					name: file.name,
					size: formatFileSize(file.size),
					uploadedAt: new Date().toISOString().slice(0, 10),
					status: 'ready',
				})
			}
			notebook.updatedAt = new Date().toISOString()
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
