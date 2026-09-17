import { reactive } from 'vue'

// > 自動回信：欄位對齊舊版 /api/v2/admin/mail（km_mail_messages 與 km_system_settings.mail）
// TODO(api-integration): 改呼叫後端 messages、retry、settings、connection、session API
// @ 問答流程本身（檢索、引用門檻、系統提示詞、術語）沿用「AI 與檢索設定」，這裡只管信箱與觸發條件

export type MailStatus = 'pending' | 'processing' | 'replied' | 'drafted' | 'ignored' | 'failed'
export type MailIgnoredReason = 'subject_prefix_mismatch' | 'sender_domain_not_allowed' | 'self_addressed' | 'invalid_subject_pattern' | 'rejected_by_reviewer'
export type MailConnectionState = 'connected' | 'auth_prompt' | 'mfa_number' | 'mfa_code_required' | 'disconnected'

export interface MailRoutedScope {
	kind: 'collection' | 'notebook' | 'all'
	name: string
	// @ 判出範圍但該範圍沒有可用文件時退回全庫，要和「判不出來」分開顯示，兩者修法不同
	fallbackFrom?: { kind: 'collection' | 'notebook'; name: string }
}

export interface BotMail {
	id: string
	subject: string
	fromAddress: string
	fromName: string
	receivedAt: string
	bodyText: string
	status: MailStatus
	routeCode: string | null
	ignoredReason: MailIgnoredReason | null
	attemptCount: number
	lastError: string | null
	replyBody: string | null
	repliedAt: string | null
	/** 審核模式下核准或決定不寄出的管理者。 */
	reviewedBy: string | null
	/** 對應系統紀錄的問答紀錄，可回溯當時的引用。 */
	questionId: string | null
	routedScope: MailRoutedScope | null
}

export interface MailSettings {
	enabled: boolean
	/** 關閉時為審核模式：AI 回覆先存成待審核，管理者核准後才寄出。 */
	autoSend: boolean
	pollIntervalSeconds: number
	mailboxAddress: string
	// !! 讀取時一律為遮蔽值；原樣送回代表沿用舊密碼，不可寫進 log
	mailboxPassword: string
	selfAddresses: string[]
	allowedSenderDomains: string[]
	subjectPrefixPattern: string
	/** 空字串代表沿用 AI 與檢索設定的回答模型。 */
	llmProfileId: string
	replyPrompt: string
	/** 附在每封回覆最後的 AI 警語。 */
	disclaimer: string
	maxAttempts: number
	sessionRenewCron: string
}

export interface MailConnection {
	state: MailConnectionState
	detail: string
	mfaNumber: string
	checkedAt: string | null
}

export const PASSWORD_MASK = '**REDACTED**'
export const DEFAULT_SUBJECT_PATTERN = '^\\[KM_(?<route>[A-Za-z0-9_]+)\\]'
export const MAIL_PAGE_SIZE = 20
export const MAIL_STATUSES: MailStatus[] = ['pending', 'processing', 'replied', 'drafted', 'ignored', 'failed']

export const MAIL_STATUS_LABELS: Record<MailStatus, string> = {
	pending: '待處理',
	processing: '處理中',
	replied: '已回覆',
	drafted: '待審核',
	ignored: '已略過',
	failed: '失敗',
}

export const MAIL_STATUS_COLORS: Record<MailStatus, string> = {
	pending: 'secondary',
	processing: 'info',
	replied: 'success',
	drafted: 'warning',
	ignored: 'secondary',
	failed: 'error',
}

export const MAIL_IGNORED_REASON_LABELS: Record<MailIgnoredReason, string> = {
	subject_prefix_mismatch: '主旨不符合路由格式',
	sender_domain_not_allowed: '寄件者網域不在允許清單',
	self_addressed: '系統自己寄出的信（防迴圈）',
	invalid_subject_pattern: '主旨規則設定有誤',
	rejected_by_reviewer: '審核後決定不寄出',
}

export const CONNECTION_STATE_LABELS: Record<MailConnectionState, string> = {
	connected: '已連線',
	auth_prompt: '登入中',
	mfa_number: '等待 Authenticator 確認',
	mfa_code_required: '需要輸入驗證碼',
	disconnected: '未連線',
}

const DEFAULT_DISCLAIMER = '此信由 AI 依公司知識庫自動產生，內容可能有誤，請以引用的正式文件為準。若仍有疑問，請直接回覆此信。'

const initialSettings: MailSettings = {
	enabled: true,
	autoSend: true,
	pollIntervalSeconds: 60,
	mailboxAddress: 'km-helpdesk@syscom.com.tw',
	mailboxPassword: PASSWORD_MASK,
	selfAddresses: ['km-helpdesk@syscom.com.tw', 'km-bot@syscom.com.tw'],
	allowedSenderDomains: ['syscom.com.tw'],
	subjectPrefixPattern: DEFAULT_SUBJECT_PATTERN,
	llmProfileId: '',
	replyPrompt: '請用禮貌、簡潔的口吻回覆，條列重點。',
	disclaimer: DEFAULT_DISCLAIMER,
	maxAttempts: 3,
	sessionRenewCron: '0 9 * * 1',
}

const initialConnection: MailConnection = { state: 'connected', detail: '收件匣同步正常', mfaNumber: '', checkedAt: '2026-09-17T09:15:00+08:00' }

function message(input: Partial<BotMail> & Pick<BotMail, 'id' | 'subject' | 'fromAddress' | 'fromName' | 'receivedAt' | 'bodyText' | 'status'>): BotMail {
	return { routeCode: null, ignoredReason: null, attemptCount: 0, lastError: null, replyBody: null, repliedAt: null, reviewedBy: null, questionId: null, routedScope: null, ...input }
}

const initialMails: BotMail[] = [
	message({ id: 'mail-1012', subject: '[KM_HR]育嬰留停期間勞健保怎麼處理', fromAddress: 'mcliu@syscom.com.tw', fromName: '劉美君', receivedAt: '2026-09-17T09:31:00+08:00', bodyText: '預計下個月開始育嬰留停，想確認期間勞健保是否要自己繳？', status: 'pending', routeCode: 'HR' }),
	message({ id: 'mail-1011', subject: '[KM_IT]印表機驅動安裝', fromAddress: 'cyho@syscom.com.tw', fromName: '何志遠', receivedAt: '2026-09-17T09:26:00+08:00', bodyText: '新筆電要裝 5 樓印表機的驅動，找不到安裝檔。', status: 'processing', routeCode: 'IT', attemptCount: 1, routedScope: { kind: 'collection', name: '資訊服務手冊' } }),
	message({
		id: 'mail-1010', subject: '[KM_HR]特休可以跨年度保留嗎？', fromAddress: 'bywchen@syscom.com.tw', fromName: '陳柏宇', receivedAt: '2026-09-17T09:12:00+08:00', status: 'replied', routeCode: 'HR', attemptCount: 1, repliedAt: '2026-09-17T09:12:40+08:00', questionId: 'question-mail-001',
		bodyText: '您好，我今年還有 5 天特休沒用完，想請問可以保留到明年嗎？需要另外申請嗎？謝謝。',
		routedScope: { kind: 'collection', name: '人事與行政制度' },
		replyBody: '陳柏宇您好：\n\n依《員工請假管理辦法》第 7 條：\n・當年度未休畢的特休可遞延至次年度 6 月 30 日前使用。\n・不需另外申請，系統每年 1 月 5 日自動結轉。\n・遞延後仍未休畢的天數依規定折發工資。',
	}),
	message({
		id: 'mail-1009', subject: '[KM_SALES]ACME Cloud 授權數可以中途增加嗎', fromAddress: 'amywu@syscom.com.tw', fromName: '吳佩珊', receivedAt: '2026-09-17T08:47:00+08:00', status: 'replied', routeCode: 'SALES', attemptCount: 1, repliedAt: '2026-09-17T08:48:05+08:00',
		bodyText: '客戶目前 50 個 ACME Cloud 授權，年中想再增加 20 個，計價方式與生效時間是？',
		routedScope: { kind: 'all', name: '全公司知識庫', fallbackFrom: { kind: 'notebook', name: '業務部報價筆記' } },
		replyBody: '吳佩珊您好：\n\nACME Cloud 支援年中加購授權：\n・加購授權自開通日起生效。\n・費用依剩餘合約月數按比例計算，與原合約同日到期。',
	}),
	message({
		id: 'mail-1008', subject: '[KM_IT]VPN 連不上，出現 809 錯誤', fromAddress: 'szhuang@syscom.com.tw', fromName: '黃思涵', receivedAt: '2026-09-17T08:20:00+08:00', status: 'failed', routeCode: 'IT', attemptCount: 3,
		bodyText: '今天在家連公司 VPN 一直出現錯誤 809，昨天還正常，有什麼辦法嗎？',
		routedScope: { kind: 'collection', name: '資訊服務手冊' },
		lastError: 'SMTP 421：郵件伺服器暫時拒絕連線，已達重試上限 3 次。',
		replyBody: '黃思涵您好：\n\n錯誤 809 通常是家用路由器擋住 VPN 連線埠，請先改用手機熱點測試；若熱點可連線，請依《遠端連線設定手冊》第 4 節改用 SSTP 連線。',
	}),
	message({
		id: 'mail-1013', subject: '[KM_HR]婚假可以分次請嗎', fromAddress: 'hcchou@syscom.com.tw', fromName: '周宏志', receivedAt: '2026-09-16T19:40:00+08:00', status: 'replied', routeCode: 'HR', attemptCount: 1, repliedAt: '2026-09-17T08:05:00+08:00', reviewedBy: '林怡君',
		bodyText: '下個月結婚，婚假 8 天可以拆成兩次請嗎？',
		routedScope: { kind: 'collection', name: '人事與行政制度' },
		replyBody: '周宏志您好：\n\n依《員工請假管理辦法》第 5 條，婚假 8 天應自結婚登記日前 10 日起三個月內請畢，可分次申請。',
	}),
	message({ id: 'mail-1007', subject: '想了解加班費申訴管道', fromAddress: 'employee@syscom.com.tw', fromName: '王小明', receivedAt: '2026-09-16T18:05:00+08:00', bodyText: '我上個月的加班費好像少算了，想了解申訴管道。', status: 'ignored', ignoredReason: 'subject_prefix_mismatch' }),
	message({ id: 'mail-1006', subject: '[KM_SALES]產品型錄索取', fromAddress: 'david.lin@acme-partner.com', fromName: 'David Lin', receivedAt: '2026-09-16T16:30:00+08:00', bodyText: 'Hi，想索取最新的產品型錄。', status: 'ignored', routeCode: 'SALES', ignoredReason: 'sender_domain_not_allowed' }),
	message({ id: 'mail-1005', subject: 'RE: [KM_HR]特休可以跨年度保留嗎？', fromAddress: 'km-helpdesk@syscom.com.tw', fromName: 'Cubi 知識小幫手', receivedAt: '2026-09-16T15:12:00+08:00', bodyText: '（系統寄出的回覆副本）', status: 'ignored', routeCode: 'HR', ignoredReason: 'self_addressed' }),
	message({
		id: 'mail-1004', subject: '[KM_HR]國內出差住宿費上限', fromAddress: 'ytchang@syscom.com.tw', fromName: '張雅婷', receivedAt: '2026-09-16T14:02:00+08:00', status: 'drafted', routeCode: 'HR', attemptCount: 1, questionId: 'question-mail-002',
		bodyText: '下週要去台中出差兩天，想確認住宿費每晚上限是多少？',
		routedScope: { kind: 'collection', name: '人事與行政制度' },
		replyBody: '張雅婷您好：\n\n依目前有效的差旅辦法，國內住宿每晚上限為新臺幣 3,000 元，需檢附收據，並於出差結束後十個工作天內完成核銷。',
	}),
]

// @ 補足分頁用的舊信件，讓列表超過一頁
for (let index = 0; index < 18; index += 1) {
	const day = String(15 - Math.floor(index / 4)).padStart(2, '0')
	initialMails.push(message({
		id: `mail-${1003 - index}`, subject: `[KM_HR]${['請假流程', '年終獎金發放日', '健康檢查補助', '員工旅遊補助'][index % 4]}詢問`, fromAddress: `staff${index + 1}@syscom.com.tw`, fromName: `同仁 ${index + 1}`, receivedAt: `2026-09-${day}T${String(10 + (index % 8)).padStart(2, '0')}:00:00+08:00`,
		bodyText: '想確認相關規定，謝謝。', status: 'replied', routeCode: 'HR', attemptCount: 1, repliedAt: `2026-09-${day}T${String(10 + (index % 8)).padStart(2, '0')}:01:00+08:00`,
		routedScope: { kind: 'collection', name: '人事與行政制度' }, replyBody: '您好：\n\n相關規定請參考人事與行政制度，重點如下……',
	}))
}

function clone<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T
}

export const mailBotState = reactive({
	settings: clone(initialSettings),
	connection: clone(initialConnection),
	mails: clone(initialMails),
})

export function resetMailBotState(): void {
	mailBotState.settings = clone(initialSettings)
	mailBotState.connection = clone(initialConnection)
	mailBotState.mails = clone(initialMails)
}

export function getMail(id: string): BotMail | undefined {
	return mailBotState.mails.find((item) => item.id === id)
}

export function canRetry(item: BotMail): boolean {
	return ['replied', 'drafted', 'failed'].includes(item.status)
}

/** 審核模式：核准待審核的回覆並寄出，可帶入修改後的內文。 */
export function approveReply(id: string, actor: string, body?: string): { ok: boolean; message: string } {
	const item = getMail(id)
	if (!item || item.status !== 'drafted') return { ok: false, message: '這封信已不在待審核狀態，請重新整理後再試。' }
	const text = (body ?? item.replyBody ?? '').trim()
	if (!text) return { ok: false, message: '回覆內容不可空白。' }
	item.replyBody = text
	item.status = 'replied'
	item.repliedAt = new Date().toISOString()
	item.reviewedBy = actor
	return { ok: true, message: `已寄出回覆給 ${item.fromAddress}。` }
}

/** 審核模式：決定不寄出，改記為已略過並保留原因。 */
export function rejectReply(id: string, actor: string): { ok: boolean; message: string } {
	const item = getMail(id)
	if (!item || item.status !== 'drafted') return { ok: false, message: '這封信已不在待審核狀態，請重新整理後再試。' }
	item.status = 'ignored'
	item.ignoredReason = 'rejected_by_reviewer'
	item.reviewedBy = actor
	return { ok: true, message: '已決定不寄出，這封信改記為已略過。' }
}

/** 重新走一次問答流程；後端會排入佇列，這裡只把狀態改為處理中。 */
export function retryMail(id: string): boolean {
	const item = getMail(id)
	if (!item || !canRetry(item)) return false
	item.status = 'processing'
	item.lastError = null
	item.reviewedBy = null
	item.attemptCount = 0
	return true
}

export interface SubjectPatternResult {
	valid: boolean
	error?: string
	matched?: boolean
	route?: string | null
}

/** 驗證主旨規則可編譯，並可選擇用範例主旨試跑。 */
export function testSubjectPattern(pattern: string, sample?: string): SubjectPatternResult {
	if (!pattern.trim()) return { valid: false, error: '請輸入主旨規則' }
	if (pattern.length > 200) return { valid: false, error: '主旨規則最多 200 個字元' }
	let regex: RegExp
	try {
		regex = new RegExp(pattern)
	} catch {
		return { valid: false, error: '不是有效的正規表達式' }
	}
	if (sample === undefined) return { valid: true }
	const matched = regex.exec(sample)
	return { valid: true, matched: Boolean(matched), route: matched?.groups?.route ?? null }
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const DOMAIN_PATTERN = /^@?[a-z0-9.-]+\.[a-z]{2,}$/

export type MailSettingsErrors = Partial<Record<keyof MailSettings, string>>

// @ 與舊版後端 mailSettingsPatchSchema 的限制一致
export function validateMailSettings(settings: MailSettings): MailSettingsErrors {
	const errors: MailSettingsErrors = {}
	if (settings.mailboxAddress && !EMAIL_PATTERN.test(settings.mailboxAddress)) errors.mailboxAddress = '信箱位址格式不正確'
	if (settings.enabled && !settings.mailboxAddress) errors.mailboxAddress = '啟用自動回信前必須先填信箱位址'
	if (settings.selfAddresses.some((address) => !EMAIL_PATTERN.test(address))) errors.selfAddresses = '有位址格式不正確'
	if (settings.selfAddresses.length > 20) errors.selfAddresses = '最多 20 個位址'
	if (settings.allowedSenderDomains.some((domain) => !DOMAIN_PATTERN.test(domain.toLowerCase()))) errors.allowedSenderDomains = '有網域格式不正確，例如 syscom.com.tw'
	if (settings.allowedSenderDomains.length > 50) errors.allowedSenderDomains = '最多 50 個網域'
	const pattern = testSubjectPattern(settings.subjectPrefixPattern)
	if (!pattern.valid) errors.subjectPrefixPattern = pattern.error
	if (settings.replyPrompt.length > 4000) errors.replyPrompt = '最多 4000 字'
	if (settings.disclaimer.length > 500) errors.disclaimer = '最多 500 字'
	if (!Number.isInteger(settings.pollIntervalSeconds) || settings.pollIntervalSeconds < 30 || settings.pollIntervalSeconds > 3600) errors.pollIntervalSeconds = '需介於 30 到 3600 秒'
	if (!Number.isInteger(settings.maxAttempts) || settings.maxAttempts < 1 || settings.maxAttempts > 10) errors.maxAttempts = '需介於 1 到 10 次'
	if (!settings.sessionRenewCron.trim() || settings.sessionRenewCron.trim().split(/\s+/).length !== 5) errors.sessionRenewCron = '請輸入 5 段的 cron 格式，例如 0 9 * * 1'
	return errors
}

export function normalizeMailSettings(settings: MailSettings): MailSettings {
	const unique = (list: string[]) => Array.from(new Set(list.map((item) => item.trim().toLowerCase()).filter(Boolean)))
	return {
		...clone(settings),
		mailboxAddress: settings.mailboxAddress.trim().toLowerCase(),
		selfAddresses: unique(settings.selfAddresses),
		allowedSenderDomains: unique(settings.allowedSenderDomains.map((domain) => domain.trim().replace(/^@/, ''))),
		subjectPrefixPattern: settings.subjectPrefixPattern.trim(),
		sessionRenewCron: settings.sessionRenewCron.trim(),
		pollIntervalSeconds: Number(settings.pollIntervalSeconds),
		maxAttempts: Number(settings.maxAttempts),
	}
}

export function saveMailSettings(input: MailSettings): { ok: true } | { ok: false; errors: MailSettingsErrors } {
	const next = normalizeMailSettings(input)
	const errors = validateMailSettings(next)
	if (Object.keys(errors).length) return { ok: false, errors }
	// @ 密碼欄留白或維持遮蔽值代表沿用舊密碼
	next.mailboxPassword = PASSWORD_MASK
	mailBotState.settings = next
	return { ok: true }
}

export function testMailConnection(): MailConnection {
	mailBotState.connection = { ...mailBotState.connection, checkedAt: new Date().toISOString() }
	return mailBotState.connection
}

/** 重新登入信箱；Mock 模擬微軟要求在 Authenticator 按數字。 */
export function reconnectMailSession(): MailConnection {
	mailBotState.connection = { state: 'mfa_number', detail: '請在手機上確認登入', mfaNumber: '47', checkedAt: new Date().toISOString() }
	return mailBotState.connection
}

export function requestMfaCode(): MailConnection {
	mailBotState.connection = { state: 'mfa_code_required', detail: '已傳送驗證碼到綁定的手機', mfaNumber: '', checkedAt: new Date().toISOString() }
	return mailBotState.connection
}

export function confirmMfaNumber(): MailConnection {
	mailBotState.connection = { state: 'connected', detail: '收件匣同步正常', mfaNumber: '', checkedAt: new Date().toISOString() }
	return mailBotState.connection
}

// !! 驗證碼是一次性機密，呼叫端送出後立即清空，不寫進 console 或 store
export function submitMfaCode(code: string): { ok: boolean; message: string } {
	if (!/^\d{4,8}$/.test(code.trim())) return { ok: false, message: '驗證碼必須是 4 到 8 位數字' }
	confirmMfaNumber()
	return { ok: true, message: '驗證成功，信箱已重新連線' }
}

export function formatMailTime(iso: string | null): string {
	if (!iso) return '—'
	const date = new Date(iso)
	if (Number.isNaN(date.getTime())) return '—'
	return new Intl.DateTimeFormat('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(date)
}

// - 把檢索範圍描述成管理者看得懂的一句話
export function describeRoutedScope(scope: MailRoutedScope): string {
	const label = (kind: 'collection' | 'notebook', name: string) => `${kind === 'collection' ? '知識主題' : '筆記本'}「${name}」`
	if (scope.kind !== 'all') return label(scope.kind, scope.name)
	if (scope.fallbackFrom) return `${scope.name}（原本判定為${label(scope.fallbackFrom.kind, scope.fallbackFrom.name)}，但該範圍查無可用文件）`
	return `${scope.name}（未判定出特定範圍）`
}

// > 回信統計
export type MailStatsRange = '24h' | '7d' | 'all'

export interface MailRouteStats {
	routeCode: string
	total: number
	replied: number
	drafted: number
	failed: number
	ignored: number
}

export interface MailReplyStats {
	total: number
	handled: number
	replied: number
	drafted: number
	failed: number
	ignored: number
	inProgress: number
	/** 已寄出 ÷（已寄出＋失敗），沒有可計算的信時為 null。 */
	successRate: number | null
	averageReplySeconds: number | null
	byRoute: MailRouteStats[]
	ignoredReasons: Array<{ reason: MailIgnoredReason; count: number }>
}

const RANGE_MS: Record<Exclude<MailStatsRange, 'all'>, number> = { '24h': 86_400_000, '7d': 7 * 86_400_000 }

export function summarizeMailReplies(mails: BotMail[], range: MailStatsRange, now = Date.now()): MailReplyStats {
	const cutoff = range === 'all' ? Number.NEGATIVE_INFINITY : now - RANGE_MS[range]
	const scoped = mails.filter((item) => Date.parse(item.receivedAt) >= cutoff)
	const count = (status: MailStatus) => scoped.filter((item) => item.status === status).length
	const replied = count('replied')
	const failed = count('failed')
	// @ 審核模式的信含等人核准的時間，平均回信時間會偏長，判讀時要一併看審核筆數
	const replyDurations = scoped
		.filter((item) => item.status === 'replied' && item.repliedAt)
		.map((item) => (Date.parse(item.repliedAt!) - Date.parse(item.receivedAt)) / 1000)
		.filter((seconds) => Number.isFinite(seconds) && seconds >= 0)

	const routes = new Map<string, MailRouteStats>()
	for (const item of scoped) {
		// @ 主旨不符合格式的信取不到代碼，歸在同一列，才看得出有多少信寫錯主旨
		const routeCode = item.routeCode ?? '（無代碼）'
		const row = routes.get(routeCode) ?? { routeCode, total: 0, replied: 0, drafted: 0, failed: 0, ignored: 0 }
		row.total += 1
		if (item.status === 'replied' || item.status === 'drafted' || item.status === 'failed' || item.status === 'ignored') row[item.status] += 1
		routes.set(routeCode, row)
	}

	const reasons = new Map<MailIgnoredReason, number>()
	for (const item of scoped) if (item.ignoredReason) reasons.set(item.ignoredReason, (reasons.get(item.ignoredReason) ?? 0) + 1)

	return {
		total: scoped.length,
		handled: scoped.length - scoped.filter((item) => item.ignoredReason && item.ignoredReason !== 'rejected_by_reviewer').length,
		replied,
		drafted: count('drafted'),
		failed,
		ignored: count('ignored'),
		inProgress: count('pending') + count('processing'),
		successRate: replied + failed ? Math.round((replied / (replied + failed)) * 100) : null,
		averageReplySeconds: replyDurations.length ? Math.round(replyDurations.reduce((sum, value) => sum + value, 0) / replyDurations.length) : null,
		byRoute: [...routes.values()].sort((a, b) => b.total - a.total),
		ignoredReasons: [...reasons.entries()].map(([reason, total]) => ({ reason, count: total })).sort((a, b) => b.count - a.count),
	}
}

export function formatSeconds(seconds: number | null): string {
	if (seconds === null) return '—'
	if (seconds < 60) return `${seconds} 秒`
	const minutes = Math.floor(seconds / 60)
	if (minutes < 60) return seconds % 60 ? `${minutes} 分 ${seconds % 60} 秒` : `${minutes} 分`
	const hours = Math.floor(minutes / 60)
	return minutes % 60 ? `${hours} 小時 ${minutes % 60} 分` : `${hours} 小時`
}
