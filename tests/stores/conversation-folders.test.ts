import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ALL_FOLDER_ID, FOLDER_NAME_MAX_LENGTH, UNFILED_FOLDER_ID, useConversationStore } from '../../src/stores/conversation'

describe('conversation store folders', () => {
	beforeEach(() => {
		setActivePinia(createPinia())
		vi.stubGlobal('crypto', { randomUUID: vi.fn(() => `generated-${Math.random()}`) })
	})

	it('should show every unarchived conversation until a folder is picked', () => {
		const store = useConversationStore()

		expect(store.selectedFolderId).toBe(ALL_FOLDER_ID)
		expect(store.filteredConversations.map((conversation) => conversation.id)).toEqual(['conv-001', 'conv-004', 'conv-002', 'conv-003'])

		store.selectFolder('folder-travel')

		expect(store.filteredConversations.map((conversation) => conversation.id)).toEqual(['conv-001', 'conv-004'])
	})

	it('should list only unfiled conversations under the unfiled system folder', () => {
		const store = useConversationStore()
		store.onlyArchived = true
		store.selectFolder(UNFILED_FOLDER_ID)

		expect(store.filteredConversations.map((conversation) => conversation.id)).toEqual(['conv-005', 'conv-006'])
	})

	it('should count conversations per folder within the current archive state', () => {
		const store = useConversationStore()

		expect(store.folderCounts[ALL_FOLDER_ID]).toBe(4)
		expect(store.folderCounts['folder-travel']).toBe(2)
		expect(store.folderCounts[UNFILED_FOLDER_ID]).toBe(0)

		store.onlyArchived = true

		expect(store.folderCounts[ALL_FOLDER_ID]).toBe(2)
		expect(store.folderCounts[UNFILED_FOLDER_ID]).toBe(2)
		expect(store.folderCounts['folder-travel']).toBe(0)
	})

	it('should reject blank, overlong and duplicated folder names', () => {
		const store = useConversationStore()
		const originalCount = store.folders.length

		expect(store.createFolder('   ').result).toBe('empty-name')
		expect(store.createFolder('x'.repeat(FOLDER_NAME_MAX_LENGTH + 1)).result).toBe('too-long')
		// @ 重複判斷需忽略大小寫與頭尾空白，否則會出現肉眼看不出差異的兩個資料夾
		expect(store.createFolder('  差旅與報支  ').result).toBe('duplicated')
		expect(store.folders).toHaveLength(originalCount)
	})

	it('should select the newly created folder so the next question lands in it', () => {
		const store = useConversationStore()

		const { result, folderId } = store.createFolder('客訴處理')

		expect(result).toBe('ok')
		expect(store.folders.some((folder) => folder.name === '客訴處理')).toBe(true)
		store.selectFolder(folderId!)
		expect(store.selectedFolderId).toBe(folderId)
	})

	it('should keep conversations when a folder is deleted and move them back to unfiled', () => {
		const store = useConversationStore()
		store.selectFolder('folder-travel')

		expect(store.deleteFolder('folder-travel')).toBe('ok')

		expect(store.folders.some((folder) => folder.id === 'folder-travel')).toBe(false)
		expect(store.conversations.find((conversation) => conversation.id === 'conv-001')?.folderId).toBeNull()
		// @ 刪掉的是目前檢視中的資料夾，必須退回「全部」，否則清單會停在不存在的篩選上
		expect(store.selectedFolderId).toBe(ALL_FOLDER_ID)
	})

	it('should report how many conversations a batch move actually changed', () => {
		const store = useConversationStore()

		const movedCount = store.moveConversations({ conversationIds: ['conv-001', 'conv-002'], folderId: 'folder-travel' })

		// @ conv-001 原本就在 folder-travel，只有 conv-002 真的被搬動
		expect(movedCount).toBe(1)
		expect(store.conversations.find((conversation) => conversation.id === 'conv-002')?.folderId).toBe('folder-travel')
	})

	it('should ignore a move to a folder that no longer exists', () => {
		const store = useConversationStore()

		expect(store.moveConversations({ conversationIds: ['conv-002'], folderId: 'missing-folder' })).toBe(0)
		expect(store.conversations.find((conversation) => conversation.id === 'conv-002')?.folderId).toBe('folder-onboarding')
	})

	it('should drop the batch selection when the folder changes', () => {
		const store = useConversationStore()
		store.toggleConversationSelection('conv-001')

		expect(store.selectedConversationIds).toEqual(['conv-001'])

		store.selectFolder('folder-onboarding')

		expect(store.selectedConversationIds).toEqual([])
	})

	it('should only move conversations that are visible in the current list', () => {
		const store = useConversationStore()
		store.toggleConversationSelection('conv-001')
		store.toggleConversationSelection('conv-005')

		// @ conv-005 已封存，在「進行中」清單裡看不到，不該被批次操作波及
		expect(store.selectedVisibleConversationIds).toEqual(['conv-001'])
	})

	it('should file a brand new conversation into the folder being viewed', () => {
		const store = useConversationStore()
		store.selectFolder('folder-security')
		store.messages = [{ id: 'message-1', role: 'user', content: '客戶資料可以分享給誰？', createdAt: '2026-09-21T10:00:00' }]

		store.syncActiveConversation({ question: '客戶資料可以分享給誰？', answer: '需依分級申請存取權限。' })

		const created = store.conversations.find((conversation) => conversation.id === store.activeConversationId)
		expect(created?.folderId).toBe('folder-security')
	})

	it('should leave a new conversation unfiled when a system folder is being viewed', () => {
		const store = useConversationStore()
		store.selectFolder(ALL_FOLDER_ID)
		store.messages = [{ id: 'message-1', role: 'user', content: '加班怎麼算？', createdAt: '2026-09-21T10:00:00' }]

		store.syncActiveConversation({ question: '加班怎麼算？', answer: '依出勤管理辦法計算。' })

		const created = store.conversations.find((conversation) => conversation.id === store.activeConversationId)
		expect(created?.folderId).toBeNull()
	})
})
