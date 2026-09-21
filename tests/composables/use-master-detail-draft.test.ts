import { nextTick } from 'vue'
import { describe, expect, it } from 'vitest'

import { useMasterDetailDraft } from '@/composables/useMasterDetailDraft'

interface RoleDraft {
	name: string
	capabilityCodes: string[]
}

const roles: Record<string, RoleDraft> = {
	editor: { name: '編輯者', capabilityCodes: ['doc.read', 'doc.write'] },
	viewer: { name: '檢視者', capabilityCodes: ['doc.read'] },
}

function setup(initialId: string | null = 'editor') {
	return useMasterDetailDraft<RoleDraft>({
		initialId,
		draftFromSelection: (id) => {
			const role = id ? roles[id] : undefined
			return role ? { name: role.name, capabilityCodes: [...role.capabilityCodes] } : { name: '', capabilityCodes: [] }
		},
	})
}

describe('useMasterDetailDraft', () => {
	it('should load the selected item into the form', () => {
		const draft = setup()

		expect(draft.form.name).toBe('編輯者')
		expect(draft.isDirty.value).toBe(false)
		expect(draft.isCreating.value).toBe(false)
	})

	it('should start empty and count as creating when nothing is selected', () => {
		const draft = setup(null)

		expect(draft.form.name).toBe('')
		expect(draft.isCreating.value).toBe(true)
	})

	it('should ignore array order when deciding whether the form is dirty', () => {
		const draft = setup()

		draft.form.capabilityCodes = ['doc.write', 'doc.read']
		expect(draft.isDirty.value).toBe(false)

		draft.form.capabilityCodes = ['doc.read']
		expect(draft.isDirty.value).toBe(true)
	})

	it('should switch straight away when there is nothing unsaved', async () => {
		const draft = setup()

		draft.requestSelect('viewer')
		await nextTick()

		expect(draft.selectedId.value).toBe('viewer')
		expect(draft.pendingId.value).toBeUndefined()
		expect(draft.form.name).toBe('檢視者')
	})

	it('should hold the switch until the edits are discarded', async () => {
		const draft = setup()
		draft.form.name = '尚未儲存'

		draft.requestSelect('viewer')
		await nextTick()

		expect(draft.selectedId.value).toBe('editor')
		expect(draft.pendingId.value).toBe('viewer')

		draft.discardAndSwitch()
		await nextTick()

		expect(draft.selectedId.value).toBe('viewer')
		expect(draft.form.name).toBe('檢視者')
	})

	it('should restore the current item when the held target is the one already selected', async () => {
		const draft = setup()
		draft.form.name = '尚未儲存'
		draft.pendingId.value = 'editor'

		draft.discardAndSwitch()
		await nextTick()

		expect(draft.form.name).toBe('編輯者')
		expect(draft.isDirty.value).toBe(false)
	})

	it('should clear the field error and the form-level error together', () => {
		const draft = setup()
		draft.errors.value = { name: '請輸入名稱', code: '代碼重複', form: '整體錯誤' }

		draft.clearError('name')

		expect(draft.errors.value).toEqual({ code: '代碼重複' })
	})

	it('should drop field errors when the selection changes', async () => {
		const draft = setup()
		draft.errors.value = { name: '請輸入名稱' }

		draft.requestSelect('viewer')
		await nextTick()

		expect(draft.errors.value).toEqual({})
	})
})
