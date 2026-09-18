import { mount } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import { createMemoryHistory, createRouter } from 'vue-router'
import { describe, expect, it } from 'vitest'

import DocumentGraphSummary from '@/components/DocumentGraphSummary.vue'
import DocumentVersionList from '@/components/DocumentVersionList.vue'
import { getDocumentGraphSummary } from '@/mocks/graphAdmin'
import type { DocumentVersionEntry } from '@/types'

function plugins() {
	const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }] })
	return [router, createVuetify({ components })]
}

const versions: DocumentVersionEntry[] = [
	{ version: 'v3', date: '2026-09-01', author: '林怡君', summary: '更新住宿上限', changes: ['調整日本地區上限'], isCurrent: false, status: '等待處理' },
	{ version: 'v2', date: '2026-08-01', author: '林怡君', summary: '', changes: [], isCurrent: true },
] as DocumentVersionEntry[]

describe('DocumentVersionList', () => {
	it('should mark the current and the viewing version', () => {
		const wrapper = mount(DocumentVersionList, { props: { documentId: 'doc-x', versions, modelValue: 'v3' }, global: { plugins: plugins() } })
		const rows = wrapper.findAll('.version-row')

		expect(rows[0]!.classes()).toContain('is-viewing')
		expect(rows[0]!.text()).toContain('等待處理')
		expect(rows[0]!.text()).toContain('檢視中')
		expect(rows[1]!.text()).toContain('目前有效版本')
		expect(rows[1]!.text()).toContain('（沒有版本說明）')
	})

	it('should switch the viewing version and ask to upload a new one', async () => {
		const wrapper = mount(DocumentVersionList, { props: { documentId: 'doc-x', versions, modelValue: 'v3' }, global: { plugins: plugins() } })

		await wrapper.findAll('.version-row')[1]!.findAll('button').find((button) => button.text().includes('檢視這一版'))!.trigger('click')
		await wrapper.findAll('button').find((button) => button.text().includes('上傳新版本'))!.trigger('click')

		expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['v2'])
		expect(wrapper.emitted('upload')).toHaveLength(1)
	})
})

describe('DocumentGraphSummary', () => {
	it('should summarise the entities extracted from a document', () => {
		const summary = getDocumentGraphSummary('doc-001')
		expect(summary.entities.length).toBeGreaterThan(0)

		const wrapper = mount(DocumentGraphSummary, { props: { documentId: 'doc-001' }, global: { plugins: plugins() } })

		expect(wrapper.text()).toContain(`這份文件抽出 ${summary.entities.length} 個實體`)
		expect(wrapper.findAll('.v-chip').length).toBeLessThanOrEqual(9)
	})

	it('should explain when the document is not in the graph yet', () => {
		const wrapper = mount(DocumentGraphSummary, { props: { documentId: 'no-such-document' }, global: { plugins: plugins() } })

		expect(wrapper.text()).toContain('尚未納入知識圖譜')
	})
})
