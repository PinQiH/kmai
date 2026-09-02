import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

import { graphNodes } from '../src/mocks/graph'
import GraphView from '../src/views/GraphView.vue'

class ResizeObserverStub {
	observe(): void {}
	disconnect(): void {}
}

async function mountGraphView(prefersReducedMotion = true): Promise<VueWrapper> {
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
	await router.push('/graph')
	await router.isReady()

	return mount(GraphView, {
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
		const labels = wrapper.findAll('.node-label')

		expect(labels).toHaveLength(graphNodes.length)
		expect(new Set(labels.map((label) => label.text()))).toEqual(new Set(graphNodes.map((node) => node.label)))
		wrapper.unmount()
	})

	it('should keep every node label visible when a node is selected', async () => {
		const wrapper = await mountGraphView(false)
		const firstNode = graphNodes[0]

		await wrapper.find(`[data-node-id="${firstNode.id}"]`).trigger('keydown', { key: 'Enter' })

		expect(wrapper.findAll('.node-label')).toHaveLength(graphNodes.length)
		expect(wrapper.find('.node-label.is-emphasis').text()).toBe(firstNode.label)
		wrapper.unmount()
	})
})
