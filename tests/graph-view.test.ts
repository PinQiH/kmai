import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

import { getKnowledgeGraphBySourceId } from '../src/mocks/graph'
import GraphView from '../src/views/GraphView.vue'

class ResizeObserverStub {
	observe(): void {}
	disconnect(): void {}
}

async function mountGraphView(
	prefersReducedMotion = true,
	knowledgeSourceId = 'policy',
	embedded = false,
	focus = '',
): Promise<VueWrapper> {
	vi.stubGlobal('ResizeObserver', ResizeObserverStub)
	vi.stubGlobal('matchMedia', vi.fn(() => ({
		matches: prefersReducedMotion,
		addEventListener: vi.fn(),
		removeEventListener: vi.fn(),
	})))

	const router = createRouter({
		history: createMemoryHistory(),
		routes: [
			{ path: '/graph', component: GraphView },
			{ path: '/documents/:id', component: { template: '<div />' } },
		],
	})
	await router.push({ path: '/graph', query: { source: knowledgeSourceId, ...(focus ? { focus } : {}) } })
	await router.isReady()

	return mount(GraphView, {
		props: { embedded, knowledgeSourceId },
		global: {
			plugins: [createVuetify({ components, directives }), router],
		},
	})
}

describe('GraphView', () => {
	afterEach(() => {
		vi.unstubAllGlobals()
	})

	it('should show every node label by default when layout is settled', async () => {
		const wrapper = await mountGraphView()
		const graph = getKnowledgeGraphBySourceId('policy')
		const labels = wrapper.findAll('.node-label')

		expect(labels).toHaveLength(graph.nodes.length)
		expect(new Set(labels.map((label) => label.text()))).toEqual(new Set(graph.nodes.map((node) => node.label)))
		wrapper.unmount()
	})

	it('should keep every node label visible when a node is selected', async () => {
		const wrapper = await mountGraphView(false)
		const graph = getKnowledgeGraphBySourceId('policy')
		const firstNode = graph.nodes[0]

		await wrapper.find(`[data-node-id="${firstNode.id}"]`).trigger('keydown', { key: 'Enter' })

		expect(wrapper.findAll('.node-label')).toHaveLength(graph.nodes.length)
		expect(wrapper.find('.node-label.is-emphasis').text()).toBe(firstNode.label)
		wrapper.unmount()
	})

	it('should show only nodes belonging to the selected knowledge base', async () => {
		const wrapper = await mountGraphView(true, 'information-security')
		const graph = getKnowledgeGraphBySourceId('information-security')

		expect(wrapper.findAll('.graph-node')).toHaveLength(graph.nodes.length)
		expect(wrapper.text()).toContain('資訊安全政策')
		expect(wrapper.text()).not.toContain('差旅管理辦法')
		wrapper.unmount()
	})

	it('should hide the page header and full-screen action when embedded', async () => {
		const wrapper = await mountGraphView(true, 'benefits', true)

		expect(wrapper.findComponent({ name: 'PageHeader' }).exists()).toBe(false)
		expect(wrapper.find('[aria-label="全螢幕檢視知識圖譜"]').exists()).toBe(false)
		expect(wrapper.find('.graph-detail').exists()).toBe(false)
		wrapper.unmount()
	})

	it('should select a scoped node when a document link provides its node id', async () => {
		const wrapper = await mountGraphView(true, 'benefits', true, 'n-onboarding')

		expect(wrapper.get('.graph-detail h2').text()).toBe('新人到職')
		expect(wrapper.get('[data-node-id="n-onboarding"]').attributes('aria-pressed')).toBe('true')
		wrapper.unmount()
	})
})
