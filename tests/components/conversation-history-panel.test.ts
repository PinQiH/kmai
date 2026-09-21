import { createPinia, setActivePinia } from 'pinia'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { afterEach, describe, expect, it, vi } from 'vitest'

import ConversationHistoryPanel from '../../src/components/ConversationHistoryPanel.vue'
import { useConversationStore } from '../../src/stores/conversation'

globalThis.ResizeObserver = class ResizeObserverStub {
	observe(): void {}
	unobserve(): void {}
	disconnect(): void {}
} as typeof ResizeObserver

interface MountedPanel {
	router: Router
	wrapper: VueWrapper
}

async function mountPanel(): Promise<MountedPanel> {
	const pinia = createPinia()
	setActivePinia(pinia)
	const router = createRouter({
		history: createMemoryHistory(),
		routes: [
			{ path: '/', component: { template: '<div>首頁</div>' } },
			{ path: '/ask', component: { template: '<div>AI 問答</div>' } },
		],
	})
	await router.push('/')
	await router.isReady()

	const wrapper = mount(ConversationHistoryPanel, {
		attachTo: document.body,
		global: {
			plugins: [pinia, createVuetify({ components, directives }), router],
		},
	})

	return { router, wrapper }
}

// - 依資料夾名稱找到該列，避免用索引綁死清單順序
function findFolderRow(wrapper: VueWrapper, name: string) {
	const row = wrapper.findAll('.folder-item').find((item) => item.text().includes(name))
	if (!row) throw new Error(`找不到資料夾「${name}」`)
	return row
}

describe('ConversationHistoryPanel', () => {
	const wrappers: VueWrapper[] = []

	afterEach(() => {
		wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
		document.body.innerHTML = ''
	})

	it('should list system folders with their conversation counts', async () => {
		const { wrapper } = await mountPanel()
		wrappers.push(wrapper)

		expect(findFolderRow(wrapper, '全部').text()).toContain('4')
		expect(findFolderRow(wrapper, '未分類').text()).toContain('0')
		expect(findFolderRow(wrapper, '差旅與報支').text()).toContain('2')
	})

	it('should narrow the conversation list to the selected folder', async () => {
		const { wrapper } = await mountPanel()
		wrappers.push(wrapper)

		await findFolderRow(wrapper, '新人到職').get('.folder-open').trigger('click')

		expect(wrapper.findAll('.history-item')).toHaveLength(1)
		expect(wrapper.get('.history-title').text()).toBe('新進同仁第一週要完成哪些事情？')
	})

	it('should explain the empty state instead of showing a bare blank folder', async () => {
		const { wrapper } = await mountPanel()
		wrappers.push(wrapper)

		await findFolderRow(wrapper, '未分類').get('.folder-open').trigger('click')

		expect(wrapper.findAll('.history-item')).toHaveLength(0)
		expect(wrapper.get('.history-empty').text()).toContain('這個資料夾還沒有對話')
	})

	it('should create a folder inline and switch to it', async () => {
		const { wrapper } = await mountPanel()
		wrappers.push(wrapper)
		const conversationStore = useConversationStore()

		await wrapper.get('[aria-label="新增資料夾"]').trigger('click')
		const draft = wrapper.get('[aria-label="新資料夾名稱"]')
		await draft.setValue('客訴處理')
		await draft.trigger('keydown', { key: 'Enter' })
		await nextTick()

		expect(conversationStore.folders.some((folder) => folder.name === '客訴處理')).toBe(true)
		expect(conversationStore.selectedFolderId).not.toBe('all')
		expect(wrapper.text()).toContain('客訴處理')
	})

	it('should start a new conversation inside the folder that was clicked', async () => {
		const { router, wrapper } = await mountPanel()
		wrappers.push(wrapper)
		const conversationStore = useConversationStore()
		conversationStore.activeConversationId = 'conv-001'

		await findFolderRow(wrapper, '資訊安全').get('[aria-label="在「資訊安全」開新對話"]').trigger('click')
		await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/ask'))

		expect(conversationStore.selectedFolderId).toBe('folder-security')
		// @ 必須是一段乾淨的新對話，而不是把既有對話改歸類
		expect(conversationStore.activeConversationId).toBeNull()
		expect(conversationStore.messages).toEqual([])
	})

	it('should focus the rename field without throwing on a folder row', async () => {
		const { wrapper } = await mountPanel()
		wrappers.push(wrapper)

		// @ 就地編輯的輸入框位於 v-for 內，早期用 template ref 會丟 TypeError
		const vm = wrapper.vm as unknown as { startFolderDraft: (folderId: string) => Promise<void> }
		await expect(vm.startFolderDraft('folder-travel')).resolves.toBeUndefined()

		const field = wrapper.get('[aria-label="重新命名資料夾 差旅與報支"]')
		expect((field.element as HTMLInputElement).value).toBe('差旅與報支')
		expect(document.activeElement).toBe(field.element)
	})

	it('should batch move the checked conversations into a folder', async () => {
		const { wrapper } = await mountPanel()
		wrappers.push(wrapper)
		const conversationStore = useConversationStore()

		await wrapper.get('[data-testid="history-select-toggle"]').trigger('click')
		await wrapper.get('[aria-label="選取 新進同仁第一週要完成哪些事情？"]').setValue(true)
		await nextTick()

		expect(wrapper.get('.batch-count').text()).toBe('已選 1 筆')

		conversationStore.moveConversations({ conversationIds: conversationStore.selectedVisibleConversationIds, folderId: 'folder-travel' })

		expect(conversationStore.conversations.find((conversation) => conversation.id === 'conv-002')?.folderId).toBe('folder-travel')
	})
})
