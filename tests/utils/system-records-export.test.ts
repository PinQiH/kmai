import { setActivePinia, createPinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { alertEvents } from '@/mocks/monitoring'
import { fetchAdminQuestionRecords } from '@/repositories/adminQuestions.repository'
import { useAssistantAuditStore } from '@/stores/assistantAudit'
import type { SystemRecordEntry } from '@/types'
import { buildCsvFileName, downloadCsvFile, escapeCsvField, toCsvContent, type CsvColumn } from '@/utils/csv'
import { ALL_FILTER, describeAlertDeliverySnapshot, filterAlertEvents, isUnresolvedAlert } from '@/utils/monitoring'
import { filterAuditRecords } from '@/utils/systemRecords'

const NOW = Date.parse('2026-09-17T04:00:00.000Z')

function auditRecord(overrides: Partial<SystemRecordEntry> = {}): SystemRecordEntry {
	return {
		id: 'audit-1',
		occurredAt: '2026-09-17T03:30:00.000Z',
		category: 'audit',
		level: 'success',
		title: '調閱 AI 問答內容',
		summary: '系統管理員調閱資源 question-001。',
		statusLabel: '成功',
		sourceId: 'question-001',
		sourceTo: null,
		actorLabel: '王稽核',
		resourceLabel: 'question-001',
		operationScope: 'ai_question_content.inspect',
		requestId: 'req-inspect-001',
		...overrides,
	}
}

describe('filterAuditRecords', () => {
	it('should combine actor, time range and keyword filters', async () => {
		const records = [
			auditRecord(),
			auditRecord({ id: 'audit-2', actorLabel: '李管理', requestId: 'req-inspect-002' }),
			auditRecord({ id: 'audit-3', occurredAt: '2026-09-01T00:00:00.000Z', requestId: 'req-inspect-003' }),
		]

		const byActor = filterAuditRecords(records, { keyword: '', actorLabel: '王稽核', timeRange: 'all', now: NOW })
		const byTimeRange = filterAuditRecords(records, { keyword: '', actorLabel: 'all', timeRange: '24h', now: NOW })
		const byRequestId = filterAuditRecords(records, {
			keyword: 'req-inspect-002',
			actorLabel: 'all',
			timeRange: 'all',
			now: NOW,
		})

		expect(byActor.map((record) => record.id)).toEqual(['audit-1', 'audit-3'])
		expect(byTimeRange.map((record) => record.id)).toEqual(['audit-1', 'audit-2'])
		expect(byRequestId.map((record) => record.id)).toEqual(['audit-2'])
	})

	it('should search the operation scope and keep newest records first', async () => {
		const records = [
			auditRecord({ id: 'older', occurredAt: '2026-09-17T01:00:00.000Z' }),
			auditRecord({ id: 'newer', occurredAt: '2026-09-17T03:00:00.000Z' }),
			auditRecord({ id: 'other-scope', operationScope: 'audit_record.export' }),
		]

		const byScope = filterAuditRecords(records, {
			keyword: 'ai_question_content',
			actorLabel: 'all',
			timeRange: 'all',
			now: NOW,
		})

		expect(byScope.map((record) => record.id)).toEqual(['newer', 'older'])
	})

	it('should fall back to sourceId and title when optional audit fields are missing', async () => {
		const records = [
			auditRecord({
				actorLabel: undefined,
				resourceLabel: undefined,
				operationScope: undefined,
				requestId: undefined,
			}),
		]

		// > 搜尋範圍刻意對齊表格顯示的 resourceLabel ?? sourceId 與 operationScope ?? title
		const bySourceId = filterAuditRecords(records, {
			keyword: 'question-001',
			actorLabel: 'all',
			timeRange: 'all',
			now: NOW,
		})
		const byTitle = filterAuditRecords(records, { keyword: '調閱', actorLabel: 'all', timeRange: 'all', now: NOW })

		expect(bySourceId).toHaveLength(1)
		expect(byTitle).toHaveLength(1)
	})
})

describe('csv export helpers', () => {
	it('should escape quotes and neutralize formula injection', async () => {
		expect(escapeCsvField('王稽核')).toBe('"王稽核"')
		expect(escapeCsvField('說"你好"')).toBe('"說""你好"""')
		expect(escapeCsvField('=1+1')).toBe('"\'=1+1"')
		expect(escapeCsvField('@SUM(A1)')).toBe('"\'@SUM(A1)"')
	})

	it('should build CSV content with a header row', async () => {
		const columns: CsvColumn<SystemRecordEntry>[] = [
			{ label: '操作者', value: (record) => record.actorLabel ?? '' },
			{ label: 'Request ID', value: (record) => record.requestId ?? '' },
		]

		const content = toCsvContent(columns, [auditRecord()])

		expect(content).toBe('"操作者","Request ID"\r\n"王稽核","req-inspect-001"')
	})

	it('should stamp the export file name with the current time', async () => {
		expect(buildCsvFileName('system-audit', new Date(2026, 8, 17, 14, 5))).toBe('system-audit-20260917-1405.csv')
	})

	it('should keep commas and line breaks inside a quoted field', async () => {
		expect(escapeCsvField('台北,高雄\r\n第二行')).toBe('"台北,高雄\r\n第二行"')
		expect(escapeCsvField('-5')).toBe('"\'-5"')
	})

	it('should download the CSV with a UTF-8 BOM and release the object url', async () => {
		vi.useFakeTimers()
		const createObjectURL = vi.fn((_blob: Blob) => 'blob:csv')
		const revokeObjectURL = vi.fn()
		Object.assign(URL, { createObjectURL, revokeObjectURL })
		const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

		downloadCsvFile('audit.csv', '"欄位"')

		expect(click).toHaveBeenCalledOnce()
		const blob = createObjectURL.mock.calls[0]![0]
		expect(blob.type).toBe('text/csv;charset=utf-8;')
		expect(revokeObjectURL).not.toHaveBeenCalled()

		vi.advanceTimersByTime(1000)
		expect(revokeObjectURL).toHaveBeenCalledWith('blob:csv')

		click.mockRestore()
		// NOTE: FileReader 內部依賴計時器，要先切回真實計時器才讀得到內容
		vi.useRealTimers()
		// @ 用位元組比對：文字解碼會把開頭的 BOM 吃掉；jsdom 的 Blob 沒有 arrayBuffer()，改用 FileReader
		const buffer = await new Promise<ArrayBuffer>((resolve) => {
			const reader = new FileReader()
			reader.onload = () => resolve(reader.result as ArrayBuffer)
			reader.readAsArrayBuffer(blob)
		})
		expect([...new Uint8Array(buffer).slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
	})
})

describe('assistant audit store export trail', () => {
	beforeEach(() => {
		setActivePinia(createPinia())
	})

	it('should record an audit entry for an export without keeping question content', async () => {
		const store = useAssistantAuditStore()

		store.recordRecordExport({ scope: 'audit_record.export', rowCount: 12 })

		const [record] = store.inspectionRecords
		expect(record?.category).toBe('audit')
		expect(record?.operationScope).toBe('audit_record.export')
		expect(record?.resourceLabel).toBe('操作稽核清單')
		expect(record?.summary).toContain('12 筆')
		expect(record?.requestId).toMatch(/^req-export-/)
	})
})

describe('alert history filtering', () => {
	const now = Date.parse('2026-08-31T04:00:00.000Z')

	it('should keep resolved alerts in history but not in the unresolved list', async () => {
		const history = filterAlertEvents(alertEvents, { status: ALL_FILTER, severity: ALL_FILTER, keyword: '', timeRange: 'all', now })
		const unresolved = alertEvents.filter(isUnresolvedAlert)

		expect(history.some((event) => event.status === 'resolved')).toBe(true)
		expect(unresolved.every((event) => event.status !== 'resolved')).toBe(true)
		expect(history.length).toBeGreaterThan(unresolved.length)
	})

	it('should combine severity, status and keyword filters newest first', async () => {
		const result = filterAlertEvents(alertEvents, {
			status: 'resolved',
			severity: 'critical',
			keyword: '',
			timeRange: 'all',
			now,
		})

		expect(result.length).toBeGreaterThan(0)
		expect(result.every((event) => event.status === 'resolved' && event.severity === 'critical')).toBe(true)
		expect(result.every((event, index) => index === 0 || Date.parse(result[index - 1]!.occurredAt) >= Date.parse(event.occurredAt))).toBe(true)
	})

	it('should limit history by time range', async () => {
		const lastDay = filterAlertEvents(alertEvents, { status: ALL_FILTER, severity: ALL_FILTER, keyword: '', timeRange: '24h', now })

		expect(lastDay.every((event) => Date.parse(event.occurredAt) >= now - 24 * 60 * 60 * 1000)).toBe(true)
	})
})

describe('alert delivery snapshot', () => {
	it('should describe routed channels instead of assuming email', async () => {
		const inAppOnly = describeAlertDeliverySnapshot({
			outcome: 'notified',
			matchedRuleNames: ['告警解除通知維運'],
			inAppRecipientCount: 1,
			emailRecipientCount: 0,
		})
		const both = describeAlertDeliverySnapshot({
			outcome: 'notified',
			matchedRuleNames: ['嚴重告警通知值班主管'],
			inAppRecipientCount: 2,
			emailRecipientCount: 1,
		})

		expect(inAppOnly).toBe('依「告警解除通知維運」通知：站內 1 人')
		expect(inAppOnly).not.toContain('Email')
		expect(both).toBe('依「嚴重告警通知值班主管」通知：站內 2 人、Email 1 位')
	})

	it('should say nobody was notified when no rule matched or the alert was silenced', async () => {
		const empty = { matchedRuleNames: [], inAppRecipientCount: 0, emailRecipientCount: 0 }

		expect(describeAlertDeliverySnapshot({ ...empty, outcome: 'no-rule' })).toBe('沒有符合的自動通知規則，未通知')
		expect(describeAlertDeliverySnapshot({ ...empty, outcome: 'silenced' })).toBe('觸發時在靜音期間，未通知')
	})

	it('should flag a matched rule that had no valid recipient', async () => {
		const result = describeAlertDeliverySnapshot({
			outcome: 'notified',
			matchedRuleNames: ['警告與資訊告警通知維運'],
			inAppRecipientCount: 0,
			emailRecipientCount: 0,
		})

		expect(result).toBe('符合「警告與資訊告警通知維運」，但沒有有效收件人')
	})

	it('should find alert history by the notification rule that handled it', async () => {
		const now = Date.parse('2026-08-31T04:00:00.000Z')
		const result = filterAlertEvents(alertEvents, {
			status: ALL_FILTER,
			severity: ALL_FILTER,
			keyword: '值班主管',
			timeRange: 'all',
			now,
		})

		expect(result.length).toBeGreaterThan(0)
		expect(result.every((event) => event.delivery.matchedRuleNames.includes('嚴重告警通知值班主管'))).toBe(true)
	})
})

describe('admin question records token usage and scoped documents', () => {
	it('should expose token usage and scoped documents on every record', async () => {
		const records = await fetchAdminQuestionRecords()

		expect(records.every((record) => Array.isArray(record.scopedDocuments))).toBe(true)
		expect(records.every((record) => record.tokenUsage !== null)).toBe(true)
	})

	it('should keep prompt tokens on a failed answer because the provider still bills them', async () => {
		const failed = (await fetchAdminQuestionRecords()).find((record) => record.status === 'failed')

		expect(failed?.tokenUsage?.completionTokens).toBe(0)
		expect(failed?.tokenUsage?.promptTokens).toBeGreaterThan(0)
	})

	it('should keep the scoped document list independent between snapshots', async () => {
		const first = await fetchAdminQuestionRecords()
		const scoped = first.find((record) => record.scopedDocuments.length > 0)
		scoped!.scopedDocuments[0]!.title = '已修改'

		const second = await fetchAdminQuestionRecords()
		expect(second.find((record) => record.id === scoped!.id)?.scopedDocuments[0]?.title).not.toBe('已修改')
	})
})

describe('audit records readability', () => {
	beforeEach(() => {
		setActivePinia(createPinia())
	})

	it('should answer who did what to which target on an inspection', async () => {
		const store = useAssistantAuditStore()

		store.recordContentInspection({
			resourceId: 'question-001',
			operationScope: 'ai_question_content.inspect',
		})

		const [record] = store.inspectionRecords
		expect(record?.actorLabel).toBeTruthy()
		expect(record?.actorAccount).toBeTruthy()
		expect(record?.actorIp).toBeTruthy()
		expect(record?.operationLabel).toBe('調閱 AI 問答內容')
		expect(record?.resourceLabel).toBe('question-001')
		expect(record?.occurredAt).toBeTruthy()
	})

	it('should find audit records by account and source ip', async () => {
		const records = [
			auditRecord({ actorAccount: 'km.admin@company.com', actorIp: '10.20.1.42' }),
			auditRecord({ id: 'audit-2', actorAccount: 'sys.admin@company.com', actorIp: '10.20.1.7' }),
		]

		const byAccount = filterAuditRecords(records, {
			keyword: 'sys.admin',
			actorLabel: 'all',
			timeRange: 'all',
			now: NOW,
		})
		const byIp = filterAuditRecords(records, { keyword: '10.20.1.42', actorLabel: 'all', timeRange: 'all', now: NOW })

		expect(byAccount.map((record) => record.id)).toEqual(['audit-2'])
		expect(byIp.map((record) => record.id)).toEqual(['audit-1'])
	})
})
