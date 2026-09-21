import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h, ref } from 'vue'
import { RouterView, createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, describe, expect, it } from 'vitest'

import { useUnsavedChangesGuard, type UnsavedChangesGuard } from '@/composables/useUnsavedChangesGuard'

// NOTE: 每個測試掛載的編輯頁都要卸載，否則 beforeunload 監聽器會留到下一個測試
const mounted: Array<{ unmount: () => void }> = []
afterEach(() => {
	mounted.splice(0).forEach((wrapper) => wrapper.unmount())
})

async function setup() {
	const isDirty = ref(false)
	let guard!: UnsavedChangesGuard
	const Editor = defineComponent({
		setup() {
			guard = useUnsavedChangesGuard(() => isDirty.value)
			return () => h('div', 'editor')
		},
	})
	const router = createRouter({
		history: createMemoryHistory(),
		routes: [
			{ path: '/editor', component: Editor },
			{ path: '/other', component: { render: () => h('div', 'other') } },
		],
	})
	await router.push('/editor')
	await router.isReady()
	const wrapper = mount(defineComponent({ render: () => h(RouterView) }), { global: { plugins: [router] } })
	mounted.push(wrapper)
	await flushPromises()
	return { isDirty, guard: () => guard, router, wrapper }
}

describe('useUnsavedChangesGuard', () => {
	it('should let navigation through when nothing changed', async () => {
		const { router, guard } = await setup()

		await router.push('/other')

		expect(router.currentRoute.value.path).toBe('/other')
		expect(guard().isLeaveDialogOpen.value).toBe(false)
	})

	it('should hold navigation and remember the target while dirty', async () => {
		const { router, isDirty, guard } = await setup()
		isDirty.value = true

		await router.push('/other?tab=1')

		expect(router.currentRoute.value.path).toBe('/editor')
		expect(guard().leaveTarget.value).toBe('/other?tab=1')
		expect(guard().isLeaveDialogOpen.value).toBe(true)
	})

	it('should stay on the page when the user chooses to keep editing', async () => {
		const { router, isDirty, guard } = await setup()
		isDirty.value = true
		await router.push('/other')

		guard().stay()

		expect(guard().isLeaveDialogOpen.value).toBe(false)
		expect(router.currentRoute.value.path).toBe('/editor')
	})

	it('should continue to the held target after confirmation', async () => {
		const { router, isDirty, guard } = await setup()
		isDirty.value = true
		await router.push('/other?tab=1')

		await guard().confirmLeave()

		expect(router.currentRoute.value.fullPath).toBe('/other?tab=1')
	})

	it('should ask the browser to confirm reloads only while dirty', async () => {
		const { isDirty } = await setup()
		const clean = new Event('beforeunload', { cancelable: true })
		window.dispatchEvent(clean)
		expect(clean.defaultPrevented).toBe(false)

		isDirty.value = true
		const dirty = new Event('beforeunload', { cancelable: true })
		window.dispatchEvent(dirty)
		expect(dirty.defaultPrevented).toBe(true)
	})

	it('should stop listening for reloads after unmount', async () => {
		const { isDirty, wrapper } = await setup()
		isDirty.value = true
		mounted.splice(mounted.indexOf(wrapper), 1)
		wrapper.unmount()

		const event = new Event('beforeunload', { cancelable: true })
		window.dispatchEvent(event)

		expect(event.defaultPrevented).toBe(false)
	})
})
