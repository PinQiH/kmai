import { describe, expect, it } from 'vitest'

import {
	addCaseNote,
	assignCase,
	buildRunFromTrace,
	closeCase,
	getCase,
	getCaseSignals,
	getDocumentSummaries,
	getOpenCases,
	isOverdue,
	reopenCase,
	reportAnswerFeedback,
	reportIssue,
	startCase,
} from '@/mocks/feedbackAdmin'
import { pinia } from '@/stores'
import { useNotificationsStore } from '@/stores/notifications'

const ACTOR = '王小明'
const settings = { sourceId: 'policy', sourceName: '公司制度', documentIds: [], documentNames: [], answerStyleId: 'balanced', answerModelId: 'gpt-4.1-mini', webSearchEnabled: false } as const

function notificationsFor(userId: string) {
	return useNotificationsStore(pinia).notifications.filter((item) => item.recipients.some((recipient) => recipient.userId === userId))
}

describe('feedback admin cases', () => {
	it('should queue an unhelpful answer with its run snapshot and notify knowledge admins', () => {
		const before = getOpenCases().length
		const citations = [{ id: 'c1', documentId: 'doc-001', title: '員工差旅與費用報支辦法', section: '一', excerpt: '…', confidence: 0.5 }]
		const created = reportAnswerFeedback({
			question: '加班費怎麼算？',
			answer: '平日加班前兩小時按 1.34 倍計算。',
			reason: '沒有提到假日加班。',
			citations,
			run: buildRunFromTrace({ question: '加班費怎麼算？', citations, settings }),
			reporter: { userId: 'user-current', name: '王小明', email: 'employee@company.com' },
		})

		expect(getOpenCases()).toHaveLength(before + 1)
		expect(created).toMatchObject({ kind: 'answer', status: 'new', title: '加班費怎麼算？' })
		expect(created.run?.steps.map((step) => step.id)).toEqual(['query', 'semantic', 'keyword', 'graph', 'rerank', 'generate'])
		expect(created.run?.settings.sourceName).toBe('公司制度')
		expect(getCaseSignals(created).map((signal) => signal.id)).toContain('low-confidence')
		expect(notificationsFor('user-km-admin')[0]?.actionTo).toBe(`/admin/feedback?case=${created.id}`)
	})

	it('should queue an issue report with trimmed text and attachments', () => {
		const created = reportIssue({
			category: '其他',
			title: '  無法登入  ',
			description: ' 一直轉圈 ',
			attachments: [{ id: 'a1', name: 'shot.png', type: 'image/png', size: 1200, url: 'blob:mock' }],
			reporter: { name: '王小明', email: 'employee@company.com' },
		})

		expect(created.id).toMatch(/^is-\d{4}$/)
		expect(created).toMatchObject({ kind: 'issue', title: '無法登入', detail: '一直轉圈' })
		expect(created.attachments).toHaveLength(1)
	})

	it('should flag retired citations, missing citations and results dropped by the rerank threshold', () => {
		expect(getCaseSignals(getCase('fb-1049')!)[0]).toMatchObject({ id: 'retired-doc-008', tone: 'error' })
		expect(getCaseSignals(getCase('fb-1047')!).map((signal) => signal.id)).toEqual(['no-citation', 'dropped-doc-002', 'keyword-miss'])
	})

	it('should notify the assignee and reject handlers without permission', () => {
		expect(startCase('fb-1047', ACTOR)).toBe('')
		const item = getCase('fb-1047')!
		expect(item).toMatchObject({ status: 'investigating', assignee: ACTOR })
		expect(startCase('fb-1047', ACTOR)).not.toBe('')

		expect(assignCase('fb-1047', '黃雅婷', ACTOR)).toContain('權限')
		expect(assignCase('fb-1047', '陳志豪', ACTOR)).toBe('')
		expect(notificationsFor('user-it')[0]).toMatchObject({ title: '你被指派處理「新進人員要怎麼申請筆電？」', actionTo: '/admin/feedback?case=fb-1047' })

		expect(addCaseNote('fb-1047', '   ', ACTOR)).not.toBe('')
		expect(addCaseNote('fb-1047', '已確認到職指南有寫', ACTOR)).toBe('')
		expect(item.events.map((entry) => entry.text)).toEqual(['指派給 王小明', '開始處理', '指派給 陳志豪', '已確認到職指南有寫'])
	})

	it('should require a cause and explanation before closing, notify the reporter, then allow reopening', () => {
		expect(closeCase('fb-1049', 'resolved', null, '改用新版規範', ACTOR)).toContain('原因')
		expect(closeCase('fb-1049', 'resolved', 'outdated-document', '  ', ACTOR)).toContain('修正')
		expect(closeCase('fb-1049', 'resolved', 'outdated-document', '已下架舊版並上傳 2026 版', ACTOR)).toBe('')

		const item = getCase('fb-1049')!
		expect(item.status).toBe('resolved')
		expect(notificationsFor('user-sales')[0]).toMatchObject({ body: '已下架舊版並上傳 2026 版' })
		expect(assignCase('fb-1049', ACTOR, ACTOR)).not.toBe('')
		expect(reopenCase('fb-1049', '', ACTOR)).not.toBe('')
		expect(reopenCase('fb-1049', '使用者說還是舊的', ACTOR)).toBe('')
		expect(item).toMatchObject({ status: 'investigating', closedAt: undefined })
	})

	it('should mark old open cases as overdue and rank documents by open feedback', () => {
		expect(isOverdue(getCase('fb-1042')!)).toBe(true)
		expect(isOverdue(getCase('fb-1031')!)).toBe(false)
		expect(getDocumentSummaries()[0]).toMatchObject({ documentId: 'doc-001' })
	})
})
