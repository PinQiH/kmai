import { beforeEach, describe, expect, it } from 'vitest'

import {
	compareVersions,
	createReleaseDraft,
	deleteReleaseDraft,
	getCurrentRelease,
	getPublishedReleaseHistory,
	publishPrivacyDraft,
	publishRelease,
	resetSettingsState,
	saveBrand,
	savePrivacyDraft,
	settingsState,
	updateRelease,
	validateLogoFile,
} from '@/mocks/systemSettings'
import { diffLines } from '@/utils/lineDiff'

describe('systemSettings', () => {
	beforeEach(() => resetSettingsState())

	it('should compare versions numerically', () => {
		expect(compareVersions('0.10.0', '0.9.0')).toBeGreaterThan(0)
		expect(compareVersions('1.0.0', '1.0.0')).toBe(0)
	})

	it('should reject blank brand fields and trim valid names', () => {
		expect(saveBrand({ ...settingsState.brand, systemName: '  ' }).ok).toBe(false)
		expect(saveBrand({ ...settingsState.brand, adminName: '' }).ok).toBe(false)

		const result = saveBrand({ ...settingsState.brand, systemName: '  新名稱 ' })
		expect(result.ok).toBe(true)
		expect(settingsState.brand.systemName).toBe('新名稱')
	})

	it('should validate logo type and size', () => {
		expect(validateLogoFile({ type: 'image/gif', size: 10 })).not.toBeNull()
		expect(validateLogoFile({ type: 'image/png', size: 10 * 1024 * 1024 })).not.toBeNull()
		expect(validateLogoFile({ type: 'image/png', size: 1024 })).toBeNull()
	})

	it('should keep drafts hidden until published', () => {
		const draft = settingsState.releases.find((release) => release.status === 'draft')!
		expect(getPublishedReleaseHistory().some((entry) => entry.version === draft.version)).toBe(false)

		expect(publishRelease(draft.id).ok).toBe(true)
		expect(getCurrentRelease()?.version).toBe(draft.version)
		expect(getPublishedReleaseHistory()[0]).toMatchObject({ version: draft.version, isCurrent: true })
	})

	it('should reject duplicate or older release versions', () => {
		expect(createReleaseDraft({ version: '0.2.0', summary: 'x', notes: '- a' }).ok).toBe(false)
		expect(createReleaseDraft({ version: '0.1.5', summary: 'x', notes: '- a' }).ok).toBe(false)
		expect(createReleaseDraft({ version: 'v0.4', summary: 'x', notes: '- a' }).ok).toBe(false)
		expect(createReleaseDraft({ version: '0.4.0', summary: 'x', notes: '  ' }).ok).toBe(false)
		expect(createReleaseDraft({ version: '0.4.0', summary: 'x', notes: '- a' }).ok).toBe(true)
	})

	it('should lock version number and forbid deleting published releases', () => {
		const published = settingsState.releases.find((release) => release.version === '0.2.0')!
		expect(updateRelease(published.id, { version: '9.9.9', summary: '修正', notes: '- a' }).ok).toBe(true)
		expect(published.version).toBe('0.2.0')
		expect(deleteReleaseDraft(published.id).ok).toBe(false)
	})

	it('should publish privacy draft as a new revision', () => {
		expect(publishPrivacyDraft().ok).toBe(false)
		expect(savePrivacyDraft('   ').ok).toBe(false)

		expect(savePrivacyDraft('新版政策內容').ok).toBe(true)
		expect(settingsState.privacy.revision).toBe(1)
		expect(publishPrivacyDraft().ok).toBe(true)
		expect(settingsState.privacy).toMatchObject({ content: '新版政策內容', revision: 2 })
		expect(settingsState.privacyDraft).toBeNull()
		// @ 被取代的舊版要完整保留，才能回答「某時點使用者看到哪一版」
		expect(settingsState.privacyHistory).toHaveLength(1)
		expect(settingsState.privacyHistory[0].revision).toBe(1)
		expect(settingsState.privacyHistory[0].content).toContain('蒐集目的')
	})

	it('should diff lines by longest common subsequence', () => {
		expect(diffLines('a\nb\nc', 'a\nc\nd')).toEqual([
			{ type: 'same', text: 'a' },
			{ type: 'removed', text: 'b' },
			{ type: 'same', text: 'c' },
			{ type: 'added', text: 'd' },
		])
	})
})
