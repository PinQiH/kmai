import { describe, expect, it } from 'vitest'

import { getAdminQuestionRecordsSnapshot } from '@/repositories/adminQuestions.repository'
import { filterAdminQuestionRecords } from '@/utils/systemRecords'

const NOW = Date.parse('2026-08-31T04:00:00.000Z')

describe('admin question records', () => {
	it('should keep each question-answer turn as an independent record', () => {
		const records = getAdminQuestionRecordsSnapshot()
		const travelConversation = records.filter((record) => record.conversationId === 'conversation-travel-001')

		expect(travelConversation).toHaveLength(2)
		expect(new Set(travelConversation.map((record) => record.id)).size).toBe(2)
		expect(travelConversation.every((record) => record.question && record.answer)).toBe(true)
	})

	it('should combine keyword, user, department, status and time filters', () => {
		const records = getAdminQuestionRecordsSnapshot()
		const result = filterAdminQuestionRecords(records, {
			keyword: 'employee@company.com',
			userId: 'user-current',
			department: '產品企劃部',
			status: 'completed',
			timeRange: '24h',
			now: NOW,
		})

		expect(result.map((record) => record.id)).toEqual(['question-002', 'question-001'])
	})

	it('should search full answers and request IDs without changing the source records', () => {
		const records = getAdminQuestionRecordsSnapshot()
		const originalQuestion = records[0]?.question
		const byAnswer = filterAdminQuestionRecords(records, {
			keyword: '直屬主管核准',
			userId: 'all',
			department: 'all',
			status: 'all',
			timeRange: 'all',
			now: NOW,
		})
		const byRequestId = filterAdminQuestionRecords(records, {
			keyword: 'req-qa-6c5120',
			userId: 'all',
			department: 'all',
			status: 'failed',
			timeRange: 'all',
			now: NOW,
		})

		expect(byAnswer.map((record) => record.id)).toEqual(['question-002'])
		expect(byRequestId.map((record) => record.id)).toEqual(['question-006'])
		expect(records[0]?.question).toBe(originalQuestion)
	})

	it('should return cloned citation and trace structures from the repository', () => {
		const first = getAdminQuestionRecordsSnapshot()
		const second = getAdminQuestionRecordsSnapshot()

		first[0]!.citations[0]!.title = '已修改'
		first[0]!.trace!.stages[0]!.label = '已修改'

		expect(second[0]!.citations[0]!.title).toBe('員工差旅與費用報支辦法')
		expect(second[0]!.trace!.stages[0]!.label).toBe('解析問題')
	})
})
