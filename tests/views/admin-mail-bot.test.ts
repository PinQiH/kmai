import { createPinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it } from 'vitest'

import {
	PASSWORD_MASK,
	approveReply,
	describeRoutedScope,
	formatSeconds,
	getMail,
	mailBotState,
	rejectReply,
	resetMailBotState,
	retryMail,
	saveMailSettings,
	submitMfaCode,
	summarizeMailReplies,
	testSubjectPattern,
} from '@/mocks/mailBot'
import { useToastStore } from '@/stores/toast'
import { fetchAdminQuestionRecords } from '@/repositories/adminQuestions.repository'
import { filterAdminQuestionRecords } from '@/utils/systemRecords'
import AdminMailBotView from '@/views/admin/AdminMailBotView.vue'

globalThis.ResizeObserver = class ResizeObserverStub {
	observe(): void {}
	unobserve(): void {}
	disconnect(): void {}
} as typeof ResizeObserver

beforeEach(() => resetMailBotState())

describe('mail bot state', () => {
	it('01. 只有已回覆、待審核或失敗的信可以重新處理', () => {
		expect(retryMail('mail-1008')).toBe(true)
		expect(getMail('mail-1008')).toMatchObject({ status: 'processing', lastError: null, attemptCount: 0 })
		expect(retryMail('mail-1007')).toBe(false)
		expect(retryMail('mail-1012')).toBe(false)
	})

	it('02. 主旨規則取出具名群組 route 當路由代碼', () => {
		expect(testSubjectPattern('^\\[KM_(?<route>[A-Za-z0-9_]+)\\]', '[KM_HR]請假規定')).toEqual({ valid: true, matched: true, route: 'HR' })
		expect(testSubjectPattern('^\\[KM_(?<route>\\w+)\\]', '請假規定')).toMatchObject({ valid: true, matched: false })
		expect(testSubjectPattern('[KM_(', '[KM_HR]')).toMatchObject({ valid: false })
	})

	it('03. 啟用時信箱不可空白，網域格式錯誤不可儲存', () => {
		const result = saveMailSettings({ ...mailBotState.settings, mailboxAddress: '', allowedSenderDomains: ['not a domain'] })
		expect(result.ok).toBe(false)
		if (!result.ok) expect(Object.keys(result.errors)).toEqual(expect.arrayContaining(['mailboxAddress', 'allowedSenderDomains']))
	})

	it('04. 儲存時正規化網域與位址，密碼回到遮蔽值', () => {
		const result = saveMailSettings({ ...mailBotState.settings, mailboxPassword: 'new-secret', allowedSenderDomains: ['@Syscom.com.tw', 'syscom.com.tw'], selfAddresses: [' KM-Bot@Syscom.com.tw '] })
		expect(result.ok).toBe(true)
		expect(mailBotState.settings).toMatchObject({ allowedSenderDomains: ['syscom.com.tw'], selfAddresses: ['km-bot@syscom.com.tw'], mailboxPassword: PASSWORD_MASK })
	})

	it('05. 驗證碼必須是 4 到 8 位數字', () => {
		mailBotState.connection.state = 'mfa_code_required'
		expect(submitMfaCode('12a').ok).toBe(false)
		expect(submitMfaCode('123456').ok).toBe(true)
		expect(mailBotState.connection.state).toBe('connected')
	})

	it('06. 審核通過可帶修改後內文寄出，並記錄審核者', () => {
		expect(approveReply('mail-1004', '林怡君', '修改後的回覆').ok).toBe(true)
		expect(getMail('mail-1004')).toMatchObject({ status: 'replied', replyBody: '修改後的回覆', reviewedBy: '林怡君' })
		expect(approveReply('mail-1004', '林怡君').ok).toBe(false)
	})

	it('07. 審核不寄出改記為已略過，空白內文不可寄出', () => {
		expect(approveReply('mail-1004', '林怡君', '  ').ok).toBe(false)
		expect(rejectReply('mail-1004', '林怡君').ok).toBe(true)
		expect(getMail('mail-1004')).toMatchObject({ status: 'ignored', ignoredReason: 'rejected_by_reviewer' })
	})

	it('08. 統計只計入區間內的信，成功率不含待審核與處理中', () => {
		const now = Date.parse('2026-09-17T10:00:00+08:00')
		const day = summarizeMailReplies(mailBotState.mails, '24h', now)
		// @ 9/16 10:00 之後：1004～1013 共 10 封
		expect(day.total).toBe(10)
		expect(day).toMatchObject({ replied: 3, failed: 1, drafted: 1, ignored: 3, inProgress: 2, successRate: 75 })
		expect(day.byRoute[0]).toMatchObject({ routeCode: 'HR' })
		expect(day.ignoredReasons.map((item) => item.reason)).toEqual(expect.arrayContaining(['subject_prefix_mismatch', 'self_addressed']))
		expect(summarizeMailReplies([], 'all', now)).toMatchObject({ total: 0, successRate: null, averageReplySeconds: null })
		expect(formatSeconds(3900)).toBe('1 小時 5 分')
	})

	it('09. AI 問答紀錄可依來源篩出自動回信，舊紀錄視為前台提問', async () => {
		const records = await fetchAdminQuestionRecords()
		const base = { keyword: '', userId: 'all', department: 'all', status: 'all' as const, timeRange: 'all' as const, now: Date.now() }
		const mail = filterAdminQuestionRecords(records, { ...base, source: 'mail' })
		expect(mail.length).toBeGreaterThan(0)
		expect(mail.every((record) => record.mailId && getMail(record.mailId)?.questionId === record.id)).toBe(true)
		expect(filterAdminQuestionRecords(records, { ...base, source: 'web' })).toHaveLength(records.length - mail.length)
	})

	it('10. 退回全庫時說明原本判定的範圍', () => {
		expect(describeRoutedScope({ kind: 'all', name: '全公司知識庫', fallbackFrom: { kind: 'notebook', name: '報價筆記' } })).toContain('原本判定為筆記本「報價筆記」')
	})
})

describe('AdminMailBotView', () => {
	async function mountView(path = '/admin/mail-bot') {
		const stub = { template: '<div />' }
		const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/admin/mail-bot', component: AdminMailBotView }, { path: '/admin/logs', component: stub }, { path: '/admin/ai-settings', component: stub }] })
		await router.push(path)
		await router.isReady()
		const wrapper = mount({ template: '<VApp><RouterView /></VApp>' }, { global: { plugins: [router, createPinia(), createVuetify({ components, directives })] }, attachTo: document.body })
		await flushPromises()
		return { wrapper, router }
	}

	it('11. 開啟失敗信件顯示錯誤與 AI 警語，可重新處理', async () => {
		const { wrapper } = await mountView('/admin/mail-bot?mail=mail-1008')
		expect(wrapper.text()).toContain('最後錯誤：SMTP 421')
		expect(wrapper.text()).toContain(mailBotState.settings.disclaimer)
		await wrapper.findAll('button').find((button) => button.text().includes('重新處理'))!.trigger('click')
		expect(getMail('mail-1008')?.status).toBe('processing')
		wrapper.unmount()
	})

	it('12. 待審核信件可核准寄出', async () => {
		const { wrapper } = await mountView('/admin/mail-bot?mail=mail-1004')
		expect(wrapper.text()).toContain('待審核，尚未寄出')
		await wrapper.find('[data-testid="mail-approve"]').trigger('click')
		expect(getMail('mail-1004')?.status).toBe('replied')
		expect(useToastStore().items[0]?.title).toContain('已寄出回覆給 ytchang@syscom.com.tw')
		wrapper.unmount()
	})

	it('13. 回信統計分頁顯示指標', async () => {
		const { wrapper } = await mountView('/admin/mail-bot?tab=stats')
		await flushPromises()
		expect(wrapper.find('[data-testid="mail-stats"]').exists() || wrapper.text().includes('這段期間沒有收到信')).toBe(true)
		wrapper.unmount()
	})

	it('14. 標題帶有分類小標', async () => {
		const { wrapper } = await mountView()
		expect(wrapper.find('.eyebrow').text()).toBe('信件自動化')
		wrapper.unmount()
	})

	it('15. 關閉直接寄出並儲存後，頁面顯示審核模式提醒', async () => {
		const { wrapper } = await mountView('/admin/mail-bot?tab=settings')
		const sendSwitch = wrapper.findAll('input[type="checkbox"]').find((input) => input.element.closest('.v-input')?.textContent?.includes('直接寄出回信'))
		await sendSwitch!.setValue(false)
		await wrapper.find('[data-testid="mail-settings-save"]').trigger('click')
		await flushPromises()
		expect(mailBotState.settings.autoSend).toBe(false)
		expect(wrapper.text()).toContain('目前為審核模式')
		wrapper.unmount()
	})
})
