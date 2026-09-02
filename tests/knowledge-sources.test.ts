import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it } from 'vitest'

import { useNotebooksStore } from '@/stores/notebooks'
import { buildAskKnowledgeSourceGroups } from '@/utils/knowledgeSources'

describe('buildAskKnowledgeSourceGroups', () => {
	it('should separate Syscom library and personal notebooks without the all-company source', () => {
		setActivePinia(createPinia())
		const notebooksStore = useNotebooksStore()
		const groups = buildAskKnowledgeSourceGroups(notebooksStore.notebooks)
		const syscomGroup = groups.find((group) => group.id === 'syscom-library')
		const notebookGroup = groups.find((group) => group.id === 'personal-notebooks')
		const allSources = groups.flatMap((group) => group.sources)

		expect(syscomGroup?.label).toBe('凌群知識庫')
		expect(syscomGroup?.sources.map((source) => source.id)).toEqual(['policy', 'benefits', 'information-security', 'operations'])
		expect(notebookGroup?.label).toBe('我的筆記本')
		expect(notebookGroup?.sources.every((source) => source.kind === 'notebook')).toBe(true)
		expect(allSources.some((source) => source.name === '全公司知識')).toBe(false)
	})
})
