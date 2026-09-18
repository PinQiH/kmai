<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import FilterSearchField from '@/components/FilterSearchField.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import PageHeader from '@/components/PageHeader.vue'
import { useUnsavedChangesGuard } from '@/composables/useUnsavedChangesGuard'
import { aiSettingsState } from '@/mocks/aiSettings'
import {
	CONNECTION_STATE_LABELS,
	MAIL_IGNORED_REASON_LABELS,
	MAIL_PAGE_SIZE,
	MAIL_STATUSES,
	MAIL_STATUS_COLORS,
	MAIL_STATUS_LABELS,
	PASSWORD_MASK,
	approveReply,
	canRetry,
	confirmMfaNumber,
	describeRoutedScope,
	formatMailTime,
	formatSeconds,
	mailBotState,
	normalizeMailSettings,
	reconnectMailSession,
	rejectReply,
	requestMfaCode,
	retryMail,
	saveMailSettings,
	submitMfaCode,
	summarizeMailReplies,
	testMailConnection,
	testSubjectPattern,
	validateMailSettings,
	type MailSettings,
	type MailStatsRange,
	type MailStatus,
} from '@/mocks/mailBot'
import { describeProfile, getProfile, getProfilesByKind } from '@/mocks/systemResources'
import { useToastStore } from '@/stores/toast'

type MailBotTab = 'messages' | 'stats' | 'settings'
type StatusFilter = MailStatus | 'all'

// @ 與後端輪詢無關，只是讓畫面不需要手動重整
const REFRESH_INTERVAL_MS = 15_000
const tabs: MailBotTab[] = ['messages', 'stats', 'settings']
// TODO(api-integration): 審核者改由登入身分取得
const ACTOR = '林怡君'

const route = useRoute()
const router = useRouter()

const activeTab = ref<MailBotTab>(tabs.find((tab) => tab === route.query.tab) ?? 'messages')
watch(() => route.query.tab, (tab) => {
	activeTab.value = tabs.find((item) => item === tab) ?? 'messages'
})
watch(activeTab, (tab) => {
	const next = tab === 'messages' ? undefined : tab
	if (next !== route.query.tab) router.replace({ query: { ...route.query, tab: next } })
})

const toastStore = useToastStore()
function notify(text: string, tone: 'success' | 'error' | 'info' = 'success'): void {
	toastStore.show(text, tone)
}

const settings = computed(() => mailBotState.settings)
const connection = computed(() => mailBotState.connection)

// @ 「為什麼沒有寄出」是最常見的疑問，停用與審核模式一律寫在頁面上方
const modeNotice = computed(() => {
	if (!settings.value.enabled) return { type: 'info' as const, text: '自動回信已停用：系統不會收信，也不會回信。' }
	if (!settings.value.autoSend) return { type: 'warning' as const, text: '目前為審核模式：AI 回覆會先存成待審核，管理者核准後才寄出。' }
	return null
})
const botStatus = computed(() => {
	if (!settings.value.enabled) return { label: '已停用', color: 'secondary' }
	if (connection.value.state !== 'connected') return { label: '信箱未連線', color: 'error' }
	if (!settings.value.autoSend) return { label: '審核模式', color: 'warning' }
	return { label: '運作中', color: 'success' }
})

// > 信件紀錄
const statusFilter = ref<StatusFilter>('all')
const keywordInput = ref('')
const keyword = ref('')
const page = ref(1)
const selectedId = ref<string | null>(typeof route.query.mail === 'string' ? route.query.mail : null)
const lastRefreshedAt = ref(new Date().toISOString())

const statusCounts = computed(() => {
	const counts = {} as Record<MailStatus, number>
	for (const status of MAIL_STATUSES) counts[status] = mailBotState.mails.filter((item) => item.status === status).length
	return counts
})
const filteredMails = computed(() => {
	const text = keyword.value.toLocaleLowerCase('zh-TW')
	return mailBotState.mails
		.filter((item) => statusFilter.value === 'all' || item.status === statusFilter.value)
		.filter((item) => !text || [item.subject, item.fromAddress, item.fromName].join(' ').toLocaleLowerCase('zh-TW').includes(text))
		.sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))
})
const pageCount = computed(() => Math.max(1, Math.ceil(filteredMails.value.length / MAIL_PAGE_SIZE)))
const pagedMails = computed(() => {
	const current = Math.min(page.value, pageCount.value)
	return filteredMails.value.slice((current - 1) * MAIL_PAGE_SIZE, current * MAIL_PAGE_SIZE)
})
const selectedMail = computed(() => mailBotState.mails.find((item) => item.id === selectedId.value) ?? null)

watch(statusFilter, () => { page.value = 1 })

function applyKeyword(): void {
	keyword.value = keywordInput.value?.trim() ?? ''
	page.value = 1
}

function clearFilters(): void {
	statusFilter.value = 'all'
	keywordInput.value = ''
	applyKeyword()
}

// TODO(api-integration): 改為重新呼叫列表 API，背景刷新失敗不跳錯誤
function refresh(): void {
	lastRefreshedAt.value = new Date().toISOString()
}

let timer: ReturnType<typeof setInterval> | null = null
onMounted(() => { timer = setInterval(refresh, REFRESH_INTERVAL_MS) })
onBeforeUnmount(() => { if (timer) clearInterval(timer) })

function handleRetry(): void {
	if (!selectedMail.value) return
	if (retryMail(selectedMail.value.id)) notify('已排入重新處理，系統會重新產生回覆內容。')
}

// > 審核：只有待審核的信可以核准或決定不寄
const isEditingReply = ref(false)
const replyDraft = ref('')
const confirmReject = ref(false)
watch(selectedId, () => {
	isEditingReply.value = false
	replyDraft.value = selectedMail.value?.replyBody ?? ''
}, { immediate: true })

function startEditReply(): void {
	replyDraft.value = selectedMail.value?.replyBody ?? ''
	isEditingReply.value = true
}

function handleApprove(): void {
	if (!selectedMail.value) return
	const result = approveReply(selectedMail.value.id, ACTOR, isEditingReply.value ? replyDraft.value : undefined)
	if (result.ok) isEditingReply.value = false
	notify(result.message, result.ok ? 'success' : 'error')
}

function handleReject(): void {
	confirmReject.value = false
	if (!selectedMail.value) return
	const result = rejectReply(selectedMail.value.id, ACTOR)
	notify(result.message, result.ok ? 'success' : 'error')
}

function retryHint(status: MailStatus): string {
	if (status === 'pending' || status === 'processing') return '信件還在處理中，完成後才能重新處理。'
	return '已略過的信不會產生回覆；請先調整觸發條件，之後的來信才會處理。'
}

// > 回信統計
const statsRange = ref<MailStatsRange>('7d')
const statsRangeOptions = [
	{ title: '最近 24 小時', value: '24h' },
	{ title: '最近 7 天', value: '7d' },
	{ title: '全部', value: 'all' },
]
// @ 以最後更新時間為基準，自動更新時統計跟著變
const stats = computed(() => summarizeMailReplies(mailBotState.mails, statsRange.value, Date.parse(lastRefreshedAt.value)))

function showStatus(status: StatusFilter): void {
	statusFilter.value = status
	activeTab.value = 'messages'
}

// > 設定
const cloneSettings = (value: MailSettings): MailSettings => JSON.parse(JSON.stringify(value))
const draft = ref<MailSettings>(cloneSettings(settings.value))
const submitted = ref(false)
const errors = computed(() => validateMailSettings(normalizeMailSettings(draft.value)))
const hasErrors = computed(() => Object.keys(errors.value).length > 0)
const isDirty = computed(() => JSON.stringify(normalizeMailSettings(draft.value)) !== JSON.stringify(settings.value))

function fieldError(field: keyof MailSettings): string[] {
	// @ 格式錯誤即時提示；「啟用前需填信箱」這類跨欄位規則等按儲存再顯示
	const error = errors.value[field]
	if (!error) return []
	return submitted.value || field !== 'mailboxAddress' || draft.value.mailboxAddress ? [error] : []
}

function handleSave(): void {
	submitted.value = true
	const result = saveMailSettings(draft.value)
	if (!result.ok) return notify('有欄位需要修正，請檢查標示紅字的地方。', 'error')
	draft.value = cloneSettings(settings.value)
	submitted.value = false
	notify('自動回信設定已儲存。')
}

function handleReset(): void {
	draft.value = cloneSettings(settings.value)
	submitted.value = false
}

// @ 密碼欄聚焦時清掉遮蔽值方便輸入；沒有輸入就還原成遮蔽值，代表沿用舊密碼
function onPasswordFocus(): void {
	if (draft.value.mailboxPassword === PASSWORD_MASK) draft.value.mailboxPassword = ''
}
function onPasswordBlur(): void {
	if (!draft.value.mailboxPassword) draft.value.mailboxPassword = PASSWORD_MASK
}

const subjectSample = ref('[KM_HR]請假規定')
const subjectTest = computed(() => testSubjectPattern(draft.value.subjectPrefixPattern, subjectSample.value))

// @ 問答流程沿用 AI 與檢索設定，這裡只能另選回信用的模型
const inheritedAnswerProfile = computed(() => getProfile(aiSettingsState.current.models.answer))
const llmItems = computed(() => [
	{ title: `沿用 AI 與檢索設定（${inheritedAnswerProfile.value?.name ?? '未指定'}）`, subtitle: describeProfile(inheritedAnswerProfile.value), value: '' },
	...getProfilesByKind('llm').map((profile) => ({ title: profile.name, subtitle: describeProfile(profile), value: profile.id })),
])

// > 信箱連線
const testing = ref(false)
const mfaCode = ref('')
const isMfaCodeValid = computed(() => /^\d{4,8}$/.test(mfaCode.value.trim()))

function handleTestConnection(): void {
	testing.value = true
	const result = testMailConnection()
	testing.value = false
	notify(result.state === 'connected' ? '連線正常，可以收發信件。' : `連線狀態：${CONNECTION_STATE_LABELS[result.state]}`, result.state === 'connected' ? 'success' : 'error')
}

function handleSubmitMfaCode(): void {
	const result = submitMfaCode(mfaCode.value)
	// !! 驗證碼送出後立即清空，不保留
	mfaCode.value = ''
	notify(result.message, result.ok ? 'success' : 'error')
}

// > 離開保護：自動回信設定或修改中的回覆尚未儲存
const leaveGuard = useUnsavedChangesGuard(() => isDirty.value || (isEditingReply.value && Boolean(replyDraft.value.trim())))
</script>

<template>
	<div class="page-shell">
		<PageHeader eyebrow="信件自動化" title="自動回信" description="寄到機器人信箱、且主旨符合規則的來信，會用 AI 問答找答案後回信，回覆最後附上 AI 警語；可以設定直接寄出，或先由管理者審核。這裡查看每封信的處理結果，並設定信箱與觸發條件。" />


		<div class="mailbox-bar">
			<VIcon icon="mdi-email-outline" size="20" class="text-medium-emphasis" />
			<code class="mailbox-address">{{ settings.mailboxAddress || '尚未設定信箱' }}</code>
			<VChip size="small" :color="botStatus.color" variant="tonal" label>{{ botStatus.label }}</VChip>
			<span class="mailbox-meta">信箱{{ CONNECTION_STATE_LABELS[connection.state] }} · 每 {{ settings.pollIntervalSeconds }} 秒收信</span>
		</div>
		<VAlert v-if="modeNotice" :type="modeNotice.type" variant="tonal" density="compact" class="mb-5">
			{{ modeNotice.text }}
			<template #append><VBtn size="small" variant="text" @click="activeTab = 'settings'">前往設定</VBtn></template>
		</VAlert>

		<VTabs v-model="activeTab" color="primary" show-arrows class="mb-5">
			<VTab value="messages">
				信件紀錄
				<VChip v-if="statusCounts.drafted" size="x-small" color="warning" variant="tonal" class="ms-2">待審核 {{ statusCounts.drafted }}</VChip>
			</VTab>
			<VTab value="stats">回信統計</VTab>
			<VTab value="settings">設定</VTab>
		</VTabs>

		<VWindow v-model="activeTab" class="mailbot-window">
			<VWindowItem value="messages">
				<div class="toolbar">
					<VChipGroup v-model="statusFilter" mandatory selected-class="text-primary" column aria-label="依狀態篩選">
						<VChip value="all" variant="outlined" filter>全部 {{ mailBotState.mails.length }}</VChip>
						<VChip v-for="status in MAIL_STATUSES" :key="status" :value="status" variant="outlined" filter>{{ MAIL_STATUS_LABELS[status] }} {{ statusCounts[status] }}</VChip>
					</VChipGroup>
					<FilterSearchField v-model="keywordInput" label="搜尋主旨或寄件者" density="compact" class="mail-search" @keyup.enter="applyKeyword" @click:clear="keywordInput = ''; applyKeyword()" />
				</div>
				<p class="refresh-line">
					每 15 秒自動更新 · 最後更新 <time :datetime="lastRefreshedAt">{{ formatMailTime(lastRefreshedAt) }}</time>
					<VBtn size="x-small" variant="text" prepend-icon="mdi-refresh" @click="refresh">立即更新</VBtn>
				</p>

				<div class="inbox" :class="{ 'has-selection': selectedMail }">
					<div class="mail-list-pane">
						<template v-if="pagedMails.length">
							<ul class="mail-list" aria-label="信件紀錄">
								<li v-for="item in pagedMails" :key="item.id">
									<button type="button" class="mail-row" :class="{ 'is-active': item.id === selectedId }" :aria-current="item.id === selectedId ? 'true' : undefined" @click="selectedId = item.id">
										<span class="mail-row-top">
											<strong class="mail-from">{{ item.fromName || item.fromAddress }}</strong>
											<time :datetime="item.receivedAt" class="mail-time">{{ formatMailTime(item.receivedAt) }}</time>
										</span>
										<span class="mail-subject">{{ item.subject || '（無主旨）' }}</span>
										<span class="mail-row-bottom">
											<VChip size="x-small" :color="MAIL_STATUS_COLORS[item.status]" variant="tonal" label>{{ MAIL_STATUS_LABELS[item.status] }}</VChip>
											<span class="mail-sub">{{ item.ignoredReason ? MAIL_IGNORED_REASON_LABELS[item.ignoredReason] : item.fromAddress }}</span>
										</span>
									</button>
								</li>
							</ul>
							<div v-if="pageCount > 1" class="pager">
								<VPagination v-model="page" :length="pageCount" density="compact" total-visible="5" />
							</div>
						</template>
						<div v-else class="empty-state">
							<strong>沒有符合的信件</strong>
							<span>換個狀態或清除搜尋字詞。</span>
							<VBtn size="small" variant="text" color="primary" @click="clearFilters">清除篩選</VBtn>
						</div>
					</div>

					<section v-if="selectedMail" class="reader" aria-labelledby="reader-subject">
						<VBtn class="reader-back" variant="text" size="small" prepend-icon="mdi-arrow-left" @click="selectedId = null">回到信件列表</VBtn>
						<header class="reader-head">
							<div class="reader-title-row">
								<h2 id="reader-subject" class="reader-subject">{{ selectedMail.subject || '（無主旨）' }}</h2>
								<VChip size="small" :color="MAIL_STATUS_COLORS[selectedMail.status]" variant="tonal" label>{{ MAIL_STATUS_LABELS[selectedMail.status] }}</VChip>
							</div>
							<p class="reader-from">{{ selectedMail.fromName }} &lt;{{ selectedMail.fromAddress }}&gt; · <time :datetime="selectedMail.receivedAt">{{ formatMailTime(selectedMail.receivedAt) }}</time></p>
						</header>

						<VAlert v-if="selectedMail.ignoredReason" type="info" variant="tonal" density="compact" class="mb-3">未處理原因：{{ MAIL_IGNORED_REASON_LABELS[selectedMail.ignoredReason] }}</VAlert>
						<VAlert v-if="selectedMail.lastError" type="error" variant="tonal" density="compact" class="mb-3">最後錯誤：{{ selectedMail.lastError }}</VAlert>

						<dl class="run-facts">
							<div><dt>路由代碼</dt><dd>{{ selectedMail.routeCode ?? '—' }}</dd></div>
							<div><dt>檢索範圍</dt><dd>{{ selectedMail.routedScope ? describeRoutedScope(selectedMail.routedScope) : '尚未進行檢索' }}</dd></div>
							<div><dt>嘗試次數</dt><dd class="num">{{ selectedMail.attemptCount }} / {{ settings.maxAttempts }}</dd></div>
								<div><dt>回覆時間</dt><dd class="num">{{ formatMailTime(selectedMail.repliedAt) }}</dd></div>
								<div v-if="selectedMail.reviewedBy"><dt>審核者</dt><dd>{{ selectedMail.reviewedBy }}{{ selectedMail.status === 'replied' ? ' 核准寄出' : ' 決定不寄出' }}</dd></div>
						</dl>

						<h3 class="reader-section">來信內容</h3>
						<div class="mail-body">{{ selectedMail.bodyText || '（無內文）' }}</div>

						<template v-if="selectedMail.replyBody">
							<h3 class="reader-section">
								{{ selectedMail.status === 'drafted' ? 'AI 擬好的回覆' : 'AI 回覆內容' }}
								<VChip v-if="selectedMail.status === 'drafted'" size="x-small" color="warning" variant="tonal" label>待審核，尚未寄出</VChip>
							</h3>
							<template v-if="isEditingReply">
								<VTextarea v-model="replyDraft" label="回覆內容" rows="6" auto-grow :error-messages="replyDraft.trim() ? [] : ['回覆內容不可空白']" hide-details="auto" />
								<p class="reply-disclaimer is-standalone">{{ settings.disclaimer }}</p>
							</template>
							<!-- !! 回覆內容由 AI 產生，只以純文字顯示，不用 v-html -->
							<div v-else class="mail-body is-reply">{{ selectedMail.replyBody }}<p class="reply-disclaimer">{{ settings.disclaimer }}</p></div>
							<RouterLink v-if="selectedMail.questionId" :to="{ path: '/admin/logs', query: { tab: 'questions', questionId: selectedMail.questionId } }" class="text-link">查看這次問答的引用與檢索紀錄</RouterLink>
						</template>

						<div class="reader-actions">
							<template v-if="selectedMail.status === 'drafted' && selectedMail.replyBody">
								<VBtn color="primary" variant="flat" prepend-icon="mdi-send-outline" :disabled="isEditingReply && !replyDraft.trim()" data-testid="mail-approve" @click="handleApprove">{{ isEditingReply ? '寄出修改後的回覆' : '核准並寄出' }}</VBtn>
								<VBtn v-if="!isEditingReply" variant="outlined" prepend-icon="mdi-pencil-outline" @click="startEditReply">修改回覆</VBtn>
								<VBtn v-else variant="text" @click="isEditingReply = false">取消修改</VBtn>
								<VBtn variant="text" color="error" @click="confirmReject = true">不寄出</VBtn>
								<VSpacer />
							</template>
							<VBtn color="primary" variant="outlined" prepend-icon="mdi-refresh" :disabled="!canRetry(selectedMail)" @click="handleRetry">重新處理</VBtn>
							<span v-if="!canRetry(selectedMail)" class="note">{{ retryHint(selectedMail.status) }}</span>
						</div>
					</section>
					<div v-else class="reader reader-empty">
						<VIcon icon="mdi-email-open-outline" size="28" />
						<p>選一封信，查看處理結果與 AI 回覆。</p>
					</div>
				</div>
			</VWindowItem>

			<VWindowItem value="stats">
				<div class="stats-head">
					<p class="note">統計寄到機器人信箱的信。每次問答的模型、Token 與引用，請到系統紀錄 › AI 問答紀錄 › 自動回信。</p>
					<VSelect v-model="statsRange" :items="statsRangeOptions" label="統計區間" density="compact" hide-details class="range-select" />
				</div>

				<template v-if="stats.total">
					<dl class="metric-row" data-testid="mail-stats">
						<div><dt>收到信件</dt><dd>{{ stats.total }}</dd><span>{{ stats.handled }} 封符合條件、走問答流程</span></div>
						<div><dt>寄送成功率</dt><dd :class="{ 'text-warning': stats.successRate !== null && stats.successRate < 90 }">{{ stats.successRate === null ? '—' : `${stats.successRate}%` }}</dd><span>已寄出 {{ stats.replied }} 封，失敗 {{ stats.failed }} 封</span></div>
						<div :class="{ 'is-warn': stats.drafted }">
							<dt>待審核</dt><dd>{{ stats.drafted }}</dd>
							<span v-if="stats.drafted"><button type="button" class="inline-link" @click="showStatus('drafted')">前往審核</button></span>
							<span v-else>沒有等待審核的回覆</span>
						</div>
						<div><dt>平均回信時間</dt><dd class="is-small">{{ formatSeconds(stats.averageReplySeconds) }}</dd><span>收信到寄出，含審核等待時間</span></div>
					</dl>
					<p v-if="stats.failed || stats.inProgress" class="note mb-2">
						<template v-if="stats.failed">有 {{ stats.failed }} 封寄送失敗，<button type="button" class="inline-link" @click="showStatus('failed')">查看並重新處理</button>。</template>
						<template v-if="stats.inProgress">另有 {{ stats.inProgress }} 封待處理或處理中，不列入成功率。</template>
					</p>

					<div class="stats-grid">
						<section aria-labelledby="route-stats-title">
							<h2 id="route-stats-title" class="section-heading">依路由代碼</h2>
							<p class="note mb-3">看哪個部門的信最多，以及哪裡失敗或被略過得多。</p>
							<div class="table-wrap">
								<table class="stats-table">
									<thead><tr><th scope="col">路由代碼</th><th scope="col" class="num">收信</th><th scope="col" class="num">已回覆</th><th scope="col" class="num">待審核</th><th scope="col" class="num">失敗</th><th scope="col" class="num">略過</th></tr></thead>
									<tbody>
										<tr v-for="row in stats.byRoute" :key="row.routeCode">
											<th scope="row">{{ row.routeCode }}</th>
											<td class="num">{{ row.total }}</td>
											<td class="num">{{ row.replied }}</td>
											<td class="num">{{ row.drafted }}</td>
											<td class="num" :class="{ 'text-error': row.failed }">{{ row.failed }}</td>
											<td class="num">{{ row.ignored }}</td>
										</tr>
									</tbody>
								</table>
							</div>
						</section>
						<section aria-labelledby="ignored-stats-title">
							<h2 id="ignored-stats-title" class="section-heading">略過原因</h2>
							<p class="note mb-3">略過太多時，檢查設定裡的觸發條件是否太嚴。</p>
							<ul v-if="stats.ignoredReasons.length" class="reason-list">
								<li v-for="item in stats.ignoredReasons" :key="item.reason">
									<span>{{ MAIL_IGNORED_REASON_LABELS[item.reason] }}</span>
									<span class="reason-bar" aria-hidden="true"><span :style="{ width: `${(item.count / stats.ignored) * 100}%` }" /></span>
									<strong class="num">{{ item.count }}</strong>
								</li>
							</ul>
							<p v-else class="note">這段期間沒有被略過的信。</p>
							<VBtn v-if="stats.ignored" size="small" variant="text" color="primary" class="mt-2 ms-n3" @click="showStatus('ignored')">查看已略過的信</VBtn>
						</section>
					</div>
				</template>
				<div v-else class="empty-state stats-empty">
					<strong>這段期間沒有收到信</strong>
					<span>換個統計區間看看。</span>
				</div>
			</VWindowItem>

			<VWindowItem value="settings">
				<form class="settings" novalidate @submit.prevent="handleSave">
					<section class="settings-section" aria-labelledby="set-send">
						<div class="settings-intro"><h2 id="set-send" class="section-heading">啟用與寄送</h2><p class="note">停用時完全不收信、不回信。剛上線或調整設定後，可以先關掉直接寄出，改由管理者審核。</p></div>
						<div class="settings-fields">
							<VSwitch v-model="draft.enabled" color="primary" label="啟用自動回信" hide-details />
							<VSwitch v-model="draft.autoSend" color="primary" :disabled="!draft.enabled" label="直接寄出回信" hint="關閉時改為審核模式：AI 回覆先存成待審核，管理者核准後才寄出。" persistent-hint />
							<VAlert v-if="draft.enabled && draft.autoSend" type="warning" variant="tonal" density="compact" class="mt-3">回信會直接寄給對方、不經人工審核，請確認觸發條件設定正確。</VAlert>
							<VAlert v-else-if="draft.enabled && !draft.autoSend && statusCounts.drafted" type="info" variant="tonal" density="compact" class="mt-3">目前有 {{ statusCounts.drafted }} 封待審核。改回直接寄出後，這些信仍需要逐封核准。</VAlert>
						</div>
					</section>

					<section class="settings-section" aria-labelledby="set-mailbox">
						<div class="settings-intro"><h2 id="set-mailbox" class="section-heading">信箱連線</h2><p class="note">機器人登入的 Microsoft 365 信箱。重新連線時若要求多重驗證，需要有人在手機上確認。</p></div>
						<div class="settings-fields">
							<VTextField v-model="draft.mailboxAddress" type="email" label="信箱位址" :error-messages="fieldError('mailboxAddress')" />
							<VTextField v-model="draft.mailboxPassword" type="password" label="信箱密碼" autocomplete="new-password" hint="不修改就維持原值，沿用既有密碼。" persistent-hint class="mb-2" @focus="onPasswordFocus" @blur="onPasswordBlur" />
							<div class="connection">
								<div class="connection-state">
									<VIcon :icon="connection.state === 'connected' ? 'mdi-check-circle-outline' : 'mdi-alert-circle-outline'" :color="connection.state === 'connected' ? 'success' : 'warning'" size="20" />
									<span><strong>{{ CONNECTION_STATE_LABELS[connection.state] }}</strong><template v-if="connection.detail"> · {{ connection.detail }}</template></span>
									<span v-if="connection.checkedAt" class="note num">檢查於 {{ formatMailTime(connection.checkedAt) }}</span>
								</div>
								<div class="connection-actions">
									<VBtn size="small" variant="outlined" :loading="testing" @click="handleTestConnection">測試連線</VBtn>
									<VBtn size="small" variant="text" @click="reconnectMailSession()">重新連線</VBtn>
								</div>
								<!-- !! 數字配對要顯眼：這是整個流程唯一需要人介入的一步 -->
								<div v-if="connection.state === 'mfa_number'" class="mfa" role="status">
									<span>請在 Microsoft Authenticator 按下</span>
									<strong class="mfa-number">{{ connection.mfaNumber }}</strong>
									<div class="connection-actions">
										<VBtn size="small" color="primary" variant="flat" @click="confirmMfaNumber()">我已在手機上確認</VBtn>
										<VBtn size="small" variant="text" @click="requestMfaCode()">改用簡訊驗證碼</VBtn>
									</div>
								</div>
								<div v-if="connection.state === 'mfa_code_required'" class="mfa">
									<VTextField v-model="mfaCode" label="驗證碼（簡訊、Email 或驗證器的一次性密碼）" inputmode="numeric" autocomplete="one-time-code" maxlength="8" density="compact" hide-details @keydown.enter.prevent="isMfaCodeValid && handleSubmitMfaCode()" />
									<VBtn color="primary" variant="flat" :disabled="!isMfaCodeValid" @click="handleSubmitMfaCode">送出驗證碼</VBtn>
								</div>
							</div>
						</div>
					</section>

					<section class="settings-section" aria-labelledby="set-trigger">
						<div class="settings-intro"><h2 id="set-trigger" class="section-heading">觸發條件</h2><p class="note">三個條件都符合才會回信，其餘來信記為「已略過」並註明原因。</p></div>
						<div class="settings-fields">
							<VTextField v-model="draft.subjectPrefixPattern" label="主旨路由規則（正規表達式）" class="mono-field" :error-messages="fieldError('subjectPrefixPattern')" hint="具名群組 route 會成為路由代碼，例如主旨「[KM_HR]請假規定」的代碼是 HR。" persistent-hint />
							<div class="pattern-test">
								<VTextField v-model="subjectSample" label="用範例主旨試試看" density="compact" hide-details />
								<p class="pattern-result" role="status">
									<template v-if="!subjectTest.valid">規則有誤，無法試跑</template>
									<template v-else-if="subjectTest.matched"><VIcon icon="mdi-check" size="16" color="success" /> 符合{{ subjectTest.route ? `，路由代碼 ${subjectTest.route}` : '，但沒有取出路由代碼' }}</template>
									<template v-else><VIcon icon="mdi-close" size="16" color="error" /> 不符合，這封信會被略過</template>
								</p>
							</div>
							<VCombobox v-model="draft.allowedSenderDomains" label="允許的寄件者網域" multiple chips closable-chips :error-messages="fieldError('allowedSenderDomains')" hint="輸入後按 Enter。不在清單內的來信一律略過。" persistent-hint class="mt-4" />
							<VCombobox v-model="draft.selfAddresses" label="本系統信箱位址（防迴圈）" multiple chips closable-chips :error-messages="fieldError('selfAddresses')" hint="需包含所有別名。系統不會回覆這些位址寄出的信。" persistent-hint class="mt-2" />
						</div>
					</section>

					<section class="settings-section" aria-labelledby="set-reply">
						<div class="settings-intro">
							<h2 id="set-reply" class="section-heading">AI 回覆</h2>
							<p class="note">找文件、引用門檻、系統提示詞與專有名詞都沿用 <RouterLink to="/admin/ai-settings" class="text-link">AI 與檢索設定</RouterLink>，回信只會搜尋寄件者有權查看的知識。</p>
						</div>
						<div class="settings-fields">
							<VSelect v-model="draft.llmProfileId" :items="llmItems" :item-props="(item) => ({ subtitle: item.subtitle })" label="回信使用的模型" />
							<VTextarea v-model="draft.replyPrompt" label="回信指示" rows="4" auto-grow counter="4000" :error-messages="fieldError('replyPrompt')" placeholder="例如：請用禮貌、簡潔的口吻回覆，條列重點，結尾附上承辦窗口分機。" hint="只影響「怎麼寫回信」，不影響找哪些文件；留白使用系統預設。" persistent-hint class="mb-2" />
							<VTextarea v-model="draft.disclaimer" label="AI 警語" rows="2" auto-grow counter="500" :error-messages="fieldError('disclaimer')" hint="附在每封回信最後，提醒收件者內容由 AI 產生。" persistent-hint />
						</div>
					</section>

					<section class="settings-section" aria-labelledby="set-run">
						<div class="settings-intro"><h2 id="set-run" class="section-heading">執行參數</h2><p class="note">一般不需要調整。</p></div>
						<div class="settings-fields run-grid">
							<VTextField v-model.number="draft.pollIntervalSeconds" type="number" min="30" max="3600" label="收信間隔（秒）" :error-messages="fieldError('pollIntervalSeconds')" hint="修改後需重啟背景服務才會套用。" persistent-hint />
							<VTextField v-model.number="draft.maxAttempts" type="number" min="1" max="10" label="失敗重試次數" :error-messages="fieldError('maxAttempts')" />
							<VTextField v-model="draft.sessionRenewCron" label="登入續期排程（cron）" class="mono-field run-wide" :error-messages="fieldError('sessionRenewCron')" hint="預設 0 9 * * 1（每週一早上九點）。刻意排在上班時間重新驗證，把不定時的登入失效換成可預期的一次手機確認。" persistent-hint />
						</div>
					</section>

					<div class="save-bar" :class="{ 'is-dirty': isDirty }">
						<span class="note">{{ isDirty ? (submitted && hasErrors ? '有欄位需要修正' : '有尚未儲存的變更') : '設定已是最新' }}</span>
						<VBtn variant="text" :disabled="!isDirty" @click="handleReset">還原變更</VBtn>
						<VBtn type="submit" color="primary" variant="flat" :disabled="!isDirty" data-testid="mail-settings-save">儲存設定</VBtn>
					</div>
				</form>
			</VWindowItem>
		</VWindow>

		<VDialog v-model="confirmReject" max-width="440">
			<VCard>
				<VCardTitle class="pt-5 px-6">不寄出這封回覆？</VCardTitle>
				<VCardText class="px-6">這封信會改記為「已略過」，寄件者不會收到任何回覆。之後仍可以按「重新處理」重新產生回覆。</VCardText>
				<VCardActions class="px-6 pb-5">
					<VSpacer />
					<VBtn variant="text" @click="confirmReject = false">取消</VBtn>
					<VBtn color="error" variant="flat" @click="handleReject">不寄出</VBtn>
				</VCardActions>
			</VCard>
		</VDialog>
		<ConfirmDialog
			:model-value="leaveGuard.isLeaveDialogOpen.value"
			title="有未儲存的修改"
			description="自動回信設定或修改中的回覆還沒有儲存，離開後會遺失。"
			cancel-label="留在這頁"
			confirm-label="放棄修改並離開"
			@update:model-value="leaveGuard.stay"
			@confirm="leaveGuard.confirmLeave"
		/>
	</div>
</template>

<style scoped>
.mailbot-window { overflow: visible; }
.note { margin: 0; color: var(--ink-muted); font-size: 0.84rem; }
.num { font-variant-numeric: tabular-nums; }
.text-link { color: rgb(var(--v-theme-primary)); font-size: 0.84rem; text-underline-offset: 2px; }
.text-link:focus-visible { outline: 2px solid rgb(var(--v-theme-primary)); outline-offset: 2px; }

.mailbox-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 6px var(--space-sm); margin-bottom: var(--space-md); padding: 10px var(--space-md); border: 1px solid rgb(var(--v-theme-outline)); border-radius: var(--radius-md); background: rgb(var(--v-theme-surface)); }
.mailbox-address { padding: 2px 6px; font-family: inherit; font-weight: 600; border-radius: 4px; background: rgb(var(--v-theme-on-surface) / 6%); font-size: 0.88rem; }
.mailbox-meta { margin-left: auto; color: var(--ink-muted); font-size: 0.8rem; font-variant-numeric: tabular-nums; }

.toolbar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-sm); }
.mail-search { max-width: 300px; min-width: 220px; }
.refresh-line { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; margin: 4px 0 var(--space-sm); color: var(--ink-muted); font-size: 0.78rem; font-variant-numeric: tabular-nums; }

/* @ 兩欄都不設高度上限，只保留頁面本身的捲軸 */
.inbox { display: grid; grid-template-columns: minmax(280px, 380px) minmax(0, 1fr); align-items: stretch; border: 1px solid rgb(var(--v-theme-outline)); border-radius: var(--radius-md); background: rgb(var(--v-theme-surface)); }
.mail-list-pane { border-right: 1px solid rgb(var(--v-theme-outline)); }
.mail-list { margin: 0; padding: 0; list-style: none; }
.mail-list li + li { border-top: 1px solid rgb(var(--v-theme-outline) / 60%); }
.mail-list li:first-child .mail-row { border-top-left-radius: var(--radius-md); }
.mail-row { display: grid; width: 100%; gap: 3px; padding: 12px var(--space-md); color: inherit; text-align: left; transition: background-color 120ms ease-out; }
.mail-row:hover { background: rgb(var(--v-theme-primary) / 4%); }
.mail-row.is-active { background: rgb(var(--v-theme-primary) / 10%); }
.mail-row:focus-visible { outline: 2px solid rgb(var(--v-theme-primary)); outline-offset: -2px; }
.mail-row-top, .mail-row-bottom { display: flex; align-items: center; justify-content: space-between; gap: var(--space-sm); min-width: 0; }
.mail-row-bottom { justify-content: flex-start; margin-top: 2px; }
.mail-from { overflow: hidden; font-size: 0.86rem; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.mail-time, .mail-sub { flex: none; color: var(--ink-muted); font-size: 0.75rem; font-variant-numeric: tabular-nums; }
.mail-sub { overflow: hidden; flex: 1; text-overflow: ellipsis; white-space: nowrap; }
.mail-subject { overflow: hidden; font-size: 0.92rem; text-overflow: ellipsis; white-space: nowrap; }
.pager { padding: var(--space-sm); border-top: 1px solid rgb(var(--v-theme-outline) / 60%); }

.reader { min-width: 0; padding: var(--space-lg); }
.reader-back { display: none; margin: -8px 0 var(--space-sm) -8px; }
.reader-head { margin-bottom: var(--space-md); }
.reader-title-row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-sm); }
.reader-subject { margin: 0; font-size: 1.25rem; font-weight: 650; line-height: 1.35; overflow-wrap: anywhere; }
.reader-from { margin: 4px 0 0; color: var(--ink-muted); font-size: 0.84rem; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.run-facts { display: grid; gap: 4px; margin: 0 0 var(--space-md); font-size: 0.86rem; }
.run-facts > div { display: grid; grid-template-columns: 80px minmax(0, 1fr); gap: var(--space-sm); }
.run-facts dt { color: var(--ink-muted); }
.run-facts dd { margin: 0; }
.reader-section { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-sm); margin: var(--space-lg) 0 var(--space-sm); font-size: 0.95rem; font-weight: 650; }
.mail-body { max-width: 72ch; padding: var(--space-md); border-radius: var(--radius-md); background: rgb(var(--v-theme-on-surface) / 4%); font-size: 0.92rem; line-height: 1.75; white-space: pre-wrap; overflow-wrap: anywhere; }
.mail-body.is-reply { margin-bottom: var(--space-sm); border: 1px solid rgb(var(--v-theme-outline)); background: transparent; }
.reply-disclaimer { margin: var(--space-md) 0 0; padding-top: var(--space-sm); border-top: 1px dashed rgb(var(--v-theme-outline)); color: var(--ink-muted); font-size: 0.8rem; line-height: 1.6; }
.reader-actions { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-sm); margin-top: var(--space-lg); padding-top: var(--space-md); border-top: 1px solid rgb(var(--v-theme-outline)); }
.reader-empty { display: grid; place-content: center; justify-items: center; gap: 4px; min-height: 320px; color: var(--ink-muted); text-align: center; }
.reader-empty p { margin: 0; }

.empty-state { display: grid; justify-items: center; gap: var(--space-xs); padding: var(--space-2xl) var(--space-md); color: var(--ink-muted); text-align: center; }
.empty-state strong { color: rgb(var(--v-theme-on-surface)); }

.stats-head { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: var(--space-sm); margin-bottom: var(--space-md); }
.stats-head .note { max-width: 72ch; }
.range-select { max-width: 180px; }
.metric-row { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--space-md); margin: 0 0 var(--space-md); }
.metric-row > div { display: grid; align-content: start; gap: 2px; padding: var(--space-md); border: 1px solid rgb(var(--v-theme-outline)); border-radius: var(--radius-md); background: rgb(var(--v-theme-surface)); }
.metric-row > div.is-warn dd { color: rgb(var(--v-theme-warning)); }
.metric-row dt { color: var(--ink-muted); font-size: 0.8rem; }
.metric-row dd { margin: 0; font-size: 1.6rem; font-weight: 700; font-variant-numeric: tabular-nums; line-height: 1.3; }
.metric-row dd.is-small { padding-block: 3px; font-size: 1.25rem; }
.metric-row span { color: var(--ink-muted); font-size: 0.76rem; }
.inline-link { color: rgb(var(--v-theme-primary)); text-decoration: underline; text-underline-offset: 2px; }
.inline-link:focus-visible { outline: 2px solid rgb(var(--v-theme-primary)); outline-offset: 2px; }
.stats-grid { display: grid; grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); gap: var(--space-xl); margin-top: var(--space-lg); }
.table-wrap { overflow-x: auto; }
.stats-table { width: 100%; min-width: 440px; border-collapse: collapse; font-size: 0.88rem; }
.stats-table th, .stats-table td { padding: 8px 6px; border-bottom: 1px solid rgb(var(--v-theme-outline) / 60%); text-align: left; }
.stats-table thead th { border-bottom-color: rgb(var(--v-theme-outline)); color: var(--ink-muted); font-weight: 500; }
.stats-table tbody th { font-weight: 600; }
.stats-table .num { text-align: right; font-variant-numeric: tabular-nums; }
.reason-list { display: grid; gap: var(--space-sm); margin: 0; padding: 0; list-style: none; font-size: 0.88rem; }
.reason-list li { display: grid; grid-template-columns: minmax(0, 1fr) 96px 32px; align-items: center; gap: var(--space-sm); }
.reason-bar { height: 6px; overflow: hidden; border-radius: 3px; background: rgb(var(--v-theme-on-surface) / 8%); }
.reason-bar span { display: block; height: 100%; border-radius: inherit; background: rgb(var(--v-theme-primary)); }
.reason-list strong { text-align: right; }
.stats-empty { border: 1px dashed rgb(var(--v-theme-outline)); border-radius: var(--radius-md); }
.reply-disclaimer.is-standalone { max-width: 72ch; margin-top: var(--space-sm); border-top: 0; padding-top: 0; }

.settings { display: grid; max-width: 1080px; }
.settings-section { display: grid; grid-template-columns: minmax(0, 280px) minmax(0, 1fr); gap: var(--space-lg) var(--space-2xl); padding: var(--space-xl) 0; border-top: 1px solid rgb(var(--v-theme-outline)); }
.settings-section:first-child { padding-top: var(--space-sm); border-top: 0; }
.settings-intro .section-heading { margin-bottom: 6px; }
.settings-fields { display: grid; gap: 4px; max-width: 620px; }
.mono-field :deep(input) { font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace; font-size: 0.9rem; }
.pattern-test { display: grid; gap: 6px; margin-top: var(--space-sm); padding: var(--space-sm) var(--space-md) var(--space-md); border-radius: var(--radius-md); background: rgb(var(--v-theme-on-surface) / 4%); }
.pattern-result { display: flex; align-items: center; gap: 4px; margin: 0; font-size: 0.84rem; }
.connection { display: grid; gap: var(--space-sm); margin-top: var(--space-sm); padding: var(--space-md); border: 1px solid rgb(var(--v-theme-outline)); border-radius: var(--radius-md); }
.connection-state { display: flex; flex-wrap: wrap; align-items: center; gap: 6px var(--space-sm); font-size: 0.88rem; }
.connection-actions { display: flex; flex-wrap: wrap; gap: var(--space-xs); }
.mfa { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-sm); padding: var(--space-md); border-radius: var(--radius-md); background: rgb(var(--v-theme-primary) / 8%); }
.mfa .v-text-field { min-width: 240px; flex: 1; }
.mfa-number { font-size: 2rem; font-variant-numeric: tabular-nums; line-height: 1; color: rgb(var(--v-theme-primary)); }
.run-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-sm) var(--space-md); }
.run-wide { grid-column: 1 / -1; }
.save-bar { position: sticky; bottom: 0; z-index: 2; display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: var(--space-sm); margin-top: var(--space-md); padding: var(--space-sm) 0; border-top: 1px solid rgb(var(--v-theme-outline)); background: rgb(var(--v-theme-background)); }
.save-bar .note { margin-right: auto; }
.save-bar.is-dirty .note { color: rgb(var(--v-theme-warning)); font-weight: 600; }

@media (prefers-reduced-motion: reduce) { .mail-row { transition: none; } }

@media (max-width: 960px) {
	.inbox { grid-template-columns: minmax(0, 1fr); }
	.mail-list-pane { border-right: 0; }
	.inbox.has-selection .mail-list-pane, .inbox:not(.has-selection) .reader { display: none; }
	.reader { padding: var(--space-md); }
	.reader-back { display: inline-flex; }
	.mailbox-meta { margin-left: 0; flex-basis: 100%; }
	.settings-section { grid-template-columns: minmax(0, 1fr); gap: var(--space-md); }
	.metric-row { grid-template-columns: repeat(2, minmax(0, 1fr)); }
	.stats-grid { grid-template-columns: minmax(0, 1fr); }
}

@media (max-width: 600px) {
	.mail-search { max-width: none; flex: 1 1 100%; }
	.run-grid { grid-template-columns: minmax(0, 1fr); }
	.range-select { max-width: none; flex: 1 1 100%; }
}
</style>
