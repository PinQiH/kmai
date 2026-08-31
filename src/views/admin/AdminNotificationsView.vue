<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

import PageHeader from '@/components/PageHeader.vue'
import StatePanel from '@/components/StatePanel.vue'
import { useNotificationsStore } from '@/stores/notifications'
import type {
	AppNotification,
	AutomaticNotificationRule,
	NotificationAudienceType,
	NotificationEventType,
	NotificationPriority,
	NotificationRole,
	NotificationRuleInput,
	SendNotificationInput,
} from '@/types'
import {
	formatElapsedTime,
	formatNotificationScheduleInput,
	formatNotificationTimestamp,
	isNotificationScheduled,
	normalizeNotificationActionTarget,
	parseNotificationSchedule,
	summarizeNotificationPerformance,
} from '@/utils/notifications'

type AdminNotificationTab = 'notifications' | 'rules'
type FeedbackTone = 'success' | 'error' | 'info'
type ActionMode = 'none' | 'library' | 'notebooks' | 'custom'
type SendTimeMode = 'now' | 'scheduled'

interface ActionResolution {
	actionTo: string | null | undefined
	actionLabel: string | null
}

const route = useRoute()
const notificationsStore = useNotificationsStore()

const activeTab = ref<AdminNotificationTab>('notifications')
const search = ref('')
const feedbackMessage = ref('')
const feedbackTone = ref<FeedbackTone>('success')
const formError = ref('')
const isSendDialogOpen = ref(false)
const isSending = ref(false)
const expandedNotificationIds = ref<string[]>([])
const sendActionMode = ref<ActionMode>('none')
const sendCustomActionUrl = ref('')
const sendTimeMode = ref<SendTimeMode>('now')
const scheduledSendAt = ref('')
const sendDraft = ref<SendNotificationInput>(createEmptyNotificationDraft())
const ruleDraft = ref<NotificationRuleInput | null>(null)
const editingRuleId = ref<string | null>(null)
const ruleActionMode = ref<ActionMode>('none')
const ruleCustomActionUrl = ref('')
const deleteRuleTarget = ref<AutomaticNotificationRule | null>(null)

const priorityMeta: Record<NotificationPriority, { color: string; icon: string; label: string }> = {
	normal: { color: 'primary', icon: 'mdi-bell-outline', label: '一般' },
	important: { color: 'warning', icon: 'mdi-bell-alert-outline', label: '重要' },
	urgent: { color: 'error', icon: 'mdi-alert-circle-outline', label: '緊急' },
}
const priorityOptions: Array<{ title: string; value: NotificationPriority }> = [
	{ title: '一般', value: 'normal' },
	{ title: '重要', value: 'important' },
	{ title: '緊急', value: 'urgent' },
]
const audienceOptions: Array<{ title: string; value: NotificationAudienceType }> = [
	{ title: '全體使用者', value: 'all' },
	{ title: '指定部門', value: 'department' },
	{ title: '指定角色', value: 'role' },
	{ title: '指定使用者', value: 'selected' },
]
const eventOptions: Array<{ title: string; value: NotificationEventType }> = [
	{ title: '文件處理完成', value: 'document-ready' },
	{ title: '文件處理失敗', value: 'document-failed' },
	{ title: '文件需要審核', value: 'document-review-required' },
	{ title: '文件即將到期', value: 'document-expiring' },
	{ title: '筆記本分享', value: 'notebook-shared' },
	{ title: '筆記本提及使用者', value: 'notebook-mentioned' },
	{ title: '取得內容權限', value: 'permission-granted' },
	{ title: '系統維護通知', value: 'system-maintenance' },
]
const sendTimeOptions: Array<{ title: string; value: SendTimeMode }> = [
	{ title: '立即發送', value: 'now' },
	{ title: '指定時間', value: 'scheduled' },
]
const actionOptions: Array<{ title: string; value: ActionMode }> = [
	{ title: '不設定行動按鈕', value: 'none' },
	{ title: '前往知識庫', value: 'library' },
	{ title: '前往個人筆記本', value: 'notebooks' },
	{ title: '自訂網址', value: 'custom' },
]
const actionPresets: Record<Exclude<ActionMode, 'none' | 'custom'>, { target: string; label: string }> = {
	library: { target: '/library', label: '前往知識庫' },
	notebooks: { target: '/notebooks', label: '前往個人筆記本' },
}
const notificationHeaders = [
	{ title: '通知', key: 'title' },
	{ title: '來源', key: 'sourceLabel', width: 150 },
	{ title: '發送對象', key: 'audienceLabel', width: 180 },
	{ title: '發送時間', key: 'sentAt', width: 190 },
	{ title: '人數', key: 'recipientCount', align: 'end' as const, width: 90 },
	{ title: '', key: 'data-table-expand', width: 56 },
]
const recipientHeaders = [
	{ title: '使用者', key: 'name', width: 180 },
	{ title: '送達時間', key: 'deliveredAt', width: 190 },
	{ title: '首次查看', key: 'firstViewedAt', width: 190 },
	{ title: '最後查看', key: 'lastViewedAt', width: 190 },
	{ title: '查看耗時', key: 'timeToViewSeconds', align: 'end' as const, width: 120 },
	{ title: '查看次數', key: 'viewCount', align: 'end' as const, width: 100 },
	{ title: '首次點擊', key: 'firstActionClickedAt', width: 190 },
	{ title: '最後點擊', key: 'lastActionClickedAt', width: 190 },
	{ title: '點擊次數', key: 'actionClickCount', align: 'end' as const, width: 100 },
]

const userOptions = computed(() =>
	notificationsStore.users.map((user) => ({ title: `${user.name} · ${user.department}`, value: user.id })),
)
const roleOptions = computed(() =>
	Array.from(new Map(notificationsStore.users.map((user) => [user.role, user.roleLabel])).entries())
		.map(([value, title]) => ({ title, value })),
)
const visibleNotifications = computed(() => {
	const keyword = search.value.trim().toLocaleLowerCase('zh-TW')
	if (!keyword) return notificationsStore.notifications

	return notificationsStore.notifications.filter((notification) =>
		[notification.title, notification.sourceLabel, notification.audienceLabel, notification.createdBy]
			.join(' ')
			.toLocaleLowerCase('zh-TW')
			.includes(keyword),
	)
})
const notificationRows = computed(() =>
	visibleNotifications.value.map((notification) => ({
		...notification,
		isScheduled: isNotificationScheduled(notification, new Date(notificationsStore.deliveryClock)),
		recipientCount: notification.recipients.length,
		performance: summarizeNotificationPerformance(notification),
	})),
)

watch(
	() => route.query.notificationId,
	(notificationId) => {
		if (typeof notificationId !== 'string') return
		if (!notificationsStore.notifications.some((notification) => notification.id === notificationId)) return
		activeTab.value = 'notifications'
		expandedNotificationIds.value = [notificationId]
	},
	{ immediate: true },
)

function createEmptyNotificationDraft(): SendNotificationInput {
	return {
		title: '',
		body: '',
		priority: 'normal',
		audienceType: 'all',
		targetDepartment: null,
		targetRole: null,
		targetUserIds: [],
		actionLabel: null,
		actionTo: null,
	}
}

function createEmptyRuleDraft(): NotificationRuleInput {
	return {
		name: '',
		eventType: 'document-ready',
		title: '',
		body: '',
		priority: 'normal',
		audienceType: 'all',
		targetDepartment: null,
		targetRole: null,
		targetUserIds: [],
		actionLabel: null,
		actionTo: null,
		isEnabled: true,
	}
}

function notify(message: string, tone: FeedbackTone = 'success'): void {
	feedbackMessage.value = message
	feedbackTone.value = tone
}

function resolveAction(mode: ActionMode, customUrl: string, customLabel: string | null): ActionResolution {
	if (mode === 'none') return { actionTo: null, actionLabel: null }
	if (mode === 'library' || mode === 'notebooks') {
		const preset = actionPresets[mode]
		return { actionTo: preset.target, actionLabel: customLabel?.trim() || preset.label }
	}

	const actionTo = normalizeNotificationActionTarget(customUrl)
	return { actionTo, actionLabel: actionTo ? customLabel?.trim() || '查看詳情' : null }
}

function actionModeFromTarget(actionTo: string | null): ActionMode {
	if (!actionTo) return 'none'
	if (actionTo === actionPresets.library.target) return 'library'
	if (actionTo === actionPresets.notebooks.target) return 'notebooks'
	return 'custom'
}

function validateAudience(
	audienceType: NotificationAudienceType,
	targetDepartment: string | null,
	targetRole: NotificationRole | null,
	targetUserIds: string[],
): string | null {
	if (audienceType === 'department' && !targetDepartment) return '請選擇要接收通知的部門。'
	if (audienceType === 'role' && !targetRole) return '請選擇要接收通知的角色。'
	if (audienceType === 'selected' && targetUserIds.length === 0) return '請至少選擇一位使用者。'
	return null
}

function getRuleAudienceLabel(rule: AutomaticNotificationRule): string {
	if (rule.audienceType === 'all') return '全體使用者'
	if (rule.audienceType === 'department') return rule.targetDepartment ?? '未指定部門'
	if (rule.audienceType === 'role') {
		return roleOptions.value.find((option) => option.value === rule.targetRole)?.title ?? '未指定角色'
	}
	return `${rule.targetUserIds.length} 位指定使用者`
}

function validateContent(title: string, body: string): string | null {
	if (!title.trim()) return '請輸入通知標題。'
	if (!body.trim()) return '請輸入通知內容。'
	if (title.trim().length > 80) return '通知標題最多 80 個字元，請縮短後再儲存。'
	if (body.trim().length > 500) return '通知內容最多 500 個字元，請縮短後再儲存。'
	return null
}

function validateAction(action: ActionResolution): string | null {
	if (action.actionTo === undefined) {
		return '請輸入有效的站內路徑或 http／https 網址；不接受 javascript、data 或 // 開頭的網址。'
	}
	return null
}

function recipientRows(notification: AppNotification) {
	return notification.recipients.map((recipient) => {
		const user = notificationsStore.users.find((item) => item.id === recipient.userId)
		const deliveredAt = Date.parse(recipient.deliveredAt)
		const firstViewedAt = Date.parse(recipient.firstViewedAt ?? '')
		const timeToViewSeconds = Number.isFinite(deliveredAt) && Number.isFinite(firstViewedAt)
			? Math.max(0, Math.round((firstViewedAt - deliveredAt) / 1000))
			: null

		return {
			...recipient,
			name: user?.name ?? '未知使用者',
			email: user?.email ?? '—',
			department: user?.department ?? '—',
			timeToViewSeconds,
		}
	})
}

function openSendDialog(): void {
	sendDraft.value = createEmptyNotificationDraft()
	sendActionMode.value = 'none'
	sendCustomActionUrl.value = ''
	sendTimeMode.value = 'now'
	scheduledSendAt.value = formatNotificationScheduleInput(new Date(Date.now() + 5 * 60 * 1000))
	formError.value = ''
	isSendDialogOpen.value = true
}

function scheduleMockDelivery(sentAt: string): void {
	const remainingMilliseconds = Date.parse(sentAt) - Date.now()
	if (remainingMilliseconds <= 0) {
		notificationsStore.refreshDeliveryClock()
		return
	}

	window.setTimeout(
		() => scheduleMockDelivery(sentAt),
		Math.min(remainingMilliseconds, 2_147_483_647),
	)
}

function sendNotification(): void {
	if (isSending.value) return

	const action = resolveAction(sendActionMode.value, sendCustomActionUrl.value, sendDraft.value.actionLabel)
	const scheduledAt = sendTimeMode.value === 'scheduled' ? parseNotificationSchedule(scheduledSendAt.value) : undefined
	const validationError = validateContent(sendDraft.value.title, sendDraft.value.body)
		?? validateAudience(
			sendDraft.value.audienceType,
			sendDraft.value.targetDepartment,
			sendDraft.value.targetRole,
			sendDraft.value.targetUserIds,
		)
		?? validateAction(action)
		?? (sendTimeMode.value === 'scheduled' && !scheduledAt
			? '請選擇有效的預定發送日期與時間。'
			: null)
		?? (scheduledAt && Date.parse(scheduledAt) <= Date.now()
			? '預定發送時間必須晚於現在，請重新選擇。'
			: null)
	if (validationError) {
		formError.value = validationError
		return
	}

	isSending.value = true
	const notificationId = notificationsStore.sendNotification({
		...sendDraft.value,
		actionTo: action.actionTo ?? null,
		actionLabel: action.actionLabel,
	}, scheduledAt)
	isSending.value = false
	if (!notificationId) {
		formError.value = '找不到符合條件的收件人，請重新選擇發送對象。'
		return
	}

	isSendDialogOpen.value = false
	if (scheduledAt) scheduleMockDelivery(scheduledAt)
	notify(sendTimeMode.value === 'scheduled'
		? `通知「${sendDraft.value.title.trim()}」已排定於 ${formatNotificationTimestamp(scheduledAt ?? null)} 發送。`
		: `通知「${sendDraft.value.title.trim()}」已送出，前台鈴鐺與通知中心已同步更新。`)
}

function setRuleEnabled(ruleId: string, isEnabled: boolean | null): void {
	const updated = notificationsStore.setRuleEnabled(ruleId, Boolean(isEnabled))
	if (updated) notify(`自動通知規則已${isEnabled ? '啟用' : '停用'}。`, 'info')
}

function openCreateRule(): void {
	editingRuleId.value = null
	ruleDraft.value = createEmptyRuleDraft()
	ruleActionMode.value = 'none'
	ruleCustomActionUrl.value = ''
	formError.value = ''
}

function openEditRule(rule: AutomaticNotificationRule): void {
	editingRuleId.value = rule.id
	ruleDraft.value = {
		name: rule.name,
		eventType: rule.eventType,
		title: rule.title,
		body: rule.body,
		priority: rule.priority,
		audienceType: rule.audienceType,
		targetDepartment: rule.targetDepartment,
		targetRole: rule.targetRole,
		targetUserIds: [...rule.targetUserIds],
		actionLabel: rule.actionLabel,
		actionTo: rule.actionTo,
		isEnabled: rule.isEnabled,
	}
	ruleActionMode.value = actionModeFromTarget(rule.actionTo)
	ruleCustomActionUrl.value = ruleActionMode.value === 'custom' ? rule.actionTo ?? '' : ''
	formError.value = ''
}

function closeRuleDialog(): void {
	ruleDraft.value = null
	editingRuleId.value = null
	formError.value = ''
}

function saveRule(): void {
	const draft = ruleDraft.value
	if (!draft) return

	const action = resolveAction(ruleActionMode.value, ruleCustomActionUrl.value, draft.actionLabel)
	const validationError = !draft.name.trim()
		? '請輸入規則名稱。'
		: validateContent(draft.title, draft.body)
			?? validateAudience(draft.audienceType, draft.targetDepartment, draft.targetRole, draft.targetUserIds)
			?? validateAction(action)
	if (validationError) {
		formError.value = validationError
		return
	}

	const input: NotificationRuleInput = {
		...draft,
		actionTo: action.actionTo ?? null,
		actionLabel: action.actionLabel,
	}
	const saved = editingRuleId.value
		? notificationsStore.updateRule(editingRuleId.value, input)
		: Boolean(notificationsStore.createRule(input))
	if (!saved) {
		formError.value = '規則資料無效，請確認後再儲存。'
		return
	}

	const ruleName = draft.name.trim()
	closeRuleDialog()
	notify(`自動通知規則「${ruleName}」已儲存。`)
}

function confirmDeleteRule(): void {
	const target = deleteRuleTarget.value
	if (!target) return

	const deleted = notificationsStore.deleteRule(target.id)
	deleteRuleTarget.value = null
	if (deleted) notify(`已刪除規則「${target.name}」，既有通知紀錄仍保留。`)
}

function simulateRule(ruleId: string): void {
	const rule = notificationsStore.rules.find((item) => item.id === ruleId)
	const notificationId = notificationsStore.triggerAutomaticRule(ruleId)
	if (!notificationId) {
		notify(rule?.isEnabled ? '此規則目前找不到可通知的使用者。' : '規則尚未啟用，請先開啟後再模擬事件。', 'error')
		return
	}

	notify(`已模擬「${rule?.eventLabel ?? '系統事件'}」，並產生一則站內通知。`)
}
</script>

<template>
	<div class="page-shell">
		<PageHeader eyebrow="訊息與觸發規則" title="通知管理" description="立即或排程發送站內通知、管理自動規則，並直接展開每則通知查看成效。">
			<template #actions><VBtn color="primary" prepend-icon="mdi-send-outline" @click="openSendDialog">發送通知</VBtn></template>
		</PageHeader>

		<VAlert type="info" variant="tonal" class="mb-6">這是純前端 Mock，不會寄送 Email 或保存資料；排程通知只模擬預定時間，重新整理後會還原通知、規則與成效紀錄。</VAlert>
		<VAlert v-if="feedbackMessage" :type="feedbackTone" variant="tonal" closable class="mb-6" role="status" @click:close="feedbackMessage = ''">{{ feedbackMessage }}</VAlert>

		<VTabs v-model="activeTab" color="primary" class="mb-5"><VTab value="notifications">通知紀錄</VTab><VTab value="rules">自動規則</VTab></VTabs>

		<VWindow v-model="activeTab" class="notification-window">
			<VWindowItem value="notifications">
				<div class="admin-toolbar mb-5">
					<VTextField :model-value="search" label="搜尋通知" placeholder="輸入標題、來源或發送對象" prepend-inner-icon="mdi-magnify" clearable hide-details @update:model-value="search = $event ?? ''" />
					<VBtn variant="outlined" prepend-icon="mdi-plus" @click="openSendDialog">新增並發送</VBtn>
				</div>

				<VCard v-if="notificationRows.length > 0" class="surface-border overflow-hidden">
					<VDataTable v-model:expanded="expandedNotificationIds" :headers="notificationHeaders" :items="notificationRows" item-value="id" show-expand hover class="notification-record-table" data-testid="notification-record-table">
						<template #item.title="{ item }"><div class="py-2"><div class="d-flex align-center ga-2"><VIcon :icon="priorityMeta[item.priority].icon" :color="priorityMeta[item.priority].color" size="18" /><span class="font-weight-bold">{{ item.title }}</span></div><p class="text-caption text-medium-emphasis mt-1">{{ item.createdBy }}</p></div></template>
						<template #item.sourceLabel="{ item }"><div class="d-flex flex-wrap ga-1"><VChip size="small" variant="tonal" :color="item.source === 'manual' ? 'primary' : 'secondary'">{{ item.sourceLabel }}</VChip><VChip v-if="item.isScheduled" size="small" variant="tonal" color="warning">已排程</VChip></div></template>
						<template #item.sentAt="{ item }"><span class="text-caption text-medium-emphasis">{{ item.isScheduled ? '預定' : '已發送' }}</span><br>{{ formatNotificationTimestamp(item.sentAt) }}</template>
						<template #expanded-row="{ columns, item }">
							<tr data-testid="notification-performance-row"><td :colspan="columns.length" class="pa-0"><div class="notification-performance pa-5">
								<VAlert v-if="item.isScheduled" type="warning" variant="tonal" density="compact" class="mb-4">這則通知尚未發送，查看與點擊成效會在預定時間到達後開始累計。</VAlert>
								<div class="performance-summary mb-5">
									<div><span>目標人數</span><strong>{{ item.performance.targetedCount }}</strong></div><div><span>已查看</span><strong>{{ item.performance.viewedCount }}</strong></div><div><span>未查看</span><strong>{{ item.performance.unviewedCount }}</strong></div><div><span>查看率</span><strong>{{ item.performance.viewRate }}%</strong></div><div><span>平均查看時間</span><strong>{{ formatElapsedTime(item.performance.averageTimeToViewSeconds) }}</strong></div><div><span>點擊人數</span><strong>{{ item.actionTo ? item.performance.actionClickedCount : '—' }}</strong></div><div><span>點擊率</span><strong>{{ item.actionTo ? `${item.performance.actionClickRate}%` : '—' }}</strong></div>
								</div>
								<VAlert v-if="!item.actionTo" type="info" variant="tonal" density="compact" class="mb-4">這則通知未設定行動按鈕，因此沒有點擊成效。</VAlert>
								<div class="recipient-table"><VDataTable :headers="recipientHeaders" :items="recipientRows(item)" item-value="userId" density="compact">
									<template #item.name="{ item: recipient }"><div class="py-2"><p class="font-weight-medium">{{ recipient.name }}</p><p class="text-caption text-medium-emphasis">{{ recipient.email }} · {{ recipient.department }}</p></div></template><template #item.deliveredAt="{ item: recipient }">{{ formatNotificationTimestamp(recipient.deliveredAt) }}</template><template #item.firstViewedAt="{ item: recipient }">{{ formatNotificationTimestamp(recipient.firstViewedAt) }}</template><template #item.lastViewedAt="{ item: recipient }">{{ formatNotificationTimestamp(recipient.lastViewedAt) }}</template><template #item.timeToViewSeconds="{ item: recipient }">{{ formatElapsedTime(recipient.timeToViewSeconds) }}</template><template #item.firstActionClickedAt="{ item: recipient }">{{ item.actionTo ? formatNotificationTimestamp(recipient.firstActionClickedAt) : '—' }}</template><template #item.lastActionClickedAt="{ item: recipient }">{{ item.actionTo ? formatNotificationTimestamp(recipient.lastActionClickedAt) : '—' }}</template><template #item.actionClickCount="{ item: recipient }">{{ item.actionTo ? recipient.actionClickCount : '—' }}</template>
								</VDataTable></div><p class="text-caption text-medium-emphasis mt-3">「查看」代表開啟通知內容；「點擊」代表使用行動按鈕。</p>
							</div></td></tr>
						</template>
					</VDataTable>
				</VCard>
				<StatePanel v-else icon="mdi-bell-off-outline" title="找不到符合的通知" description="請修改搜尋文字，或清除條件查看全部通知。" action-label="清除搜尋" @action="search = ''" />
			</VWindowItem>

			<VWindowItem value="rules">
				<div class="admin-toolbar mb-5"><div><h2 class="section-heading">自動通知規則</h2><p class="text-body-2 text-medium-emphasis mt-1">從固定系統事件建立通知，並可用模擬事件確認結果。</p></div><VBtn color="primary" prepend-icon="mdi-plus" @click="openCreateRule">新增規則</VBtn></div>
				<div v-if="notificationsStore.rules.length > 0" class="rule-grid">
					<VCard v-for="rule in notificationsStore.rules" :key="rule.id" class="surface-border pa-5"><div class="d-flex align-start ga-3"><VIcon :icon="priorityMeta[rule.priority].icon" :color="priorityMeta[rule.priority].color" size="28" /><div class="flex-grow-1"><div class="d-flex align-start ga-3"><div class="flex-grow-1"><h3 class="text-subtitle-1 font-weight-bold">{{ rule.name }}</h3><p class="text-body-2 text-medium-emphasis mt-1">{{ rule.eventLabel }}</p></div><VSwitch :model-value="rule.isEnabled" color="primary" hide-details :aria-label="`${rule.name}${rule.isEnabled ? '已啟用' : '已停用'}`" @update:model-value="setRuleEnabled(rule.id, $event)" /></div><VDivider class="my-4" /><p class="font-weight-medium">{{ rule.title }}</p><p class="text-body-2 mt-2">{{ rule.body }}</p><div class="d-flex align-center flex-wrap ga-2 mt-4"><VChip size="small" variant="outlined">{{ getRuleAudienceLabel(rule) }}</VChip><VChip size="small" variant="outlined" :color="rule.isEnabled ? 'success' : 'secondary'">{{ rule.isEnabled ? '已啟用' : '已停用' }}</VChip><VSpacer /><VBtn variant="text" size="small" @click="openEditRule(rule)">編輯</VBtn><VBtn variant="text" size="small" color="error" @click="deleteRuleTarget = rule">刪除</VBtn><VBtn variant="tonal" size="small" :disabled="!rule.isEnabled" @click="simulateRule(rule.id)">模擬事件</VBtn></div></div></div></VCard>
				</div>
				<StatePanel v-else icon="mdi-bell-cog-outline" title="尚未建立自動通知規則" description="新增規則後，可以模擬固定系統事件並產生通知。" action-label="新增第一則規則" @action="openCreateRule" />
			</VWindowItem>
		</VWindow>

		<VDialog v-model="isSendDialogOpen" max-width="760">
			<VCard>
				<VCardTitle class="pa-6 pb-2">發送站內通知</VCardTitle>
				<VCardText class="pa-6 pt-2">
					<VAlert type="info" variant="tonal" density="compact" class="mb-5">
						立即發送會同步到前台通知中心；指定時間僅在目前頁籤模擬排程。
					</VAlert>
					<VTextField v-model="sendDraft.title" label="通知標題" maxlength="80" counter="80" />
					<VTextarea v-model="sendDraft.body" label="通知內容" maxlength="500" counter="500" rows="4" />
					<div class="form-grid">
						<VSelect v-model="sendDraft.priority" :items="priorityOptions" label="重要程度" />
						<VSelect v-model="sendDraft.audienceType" :items="audienceOptions" label="發送對象" />
					</div>
					<VSelect v-if="sendDraft.audienceType === 'department'" v-model="sendDraft.targetDepartment" :items="notificationsStore.departments" label="選擇部門" />
					<VSelect v-if="sendDraft.audienceType === 'role'" v-model="sendDraft.targetRole" :items="roleOptions" label="選擇角色" />
					<VAutocomplete v-if="sendDraft.audienceType === 'selected'" v-model="sendDraft.targetUserIds" :items="userOptions" label="選擇使用者" multiple chips closable-chips />
					<div class="form-grid">
						<VSelect v-model="sendTimeMode" :items="sendTimeOptions" label="發送時間" />
						<VTextField v-if="sendTimeMode === 'scheduled'" v-model="scheduledSendAt" type="datetime-local" label="預定發送時間" />
					</div>
					<VSelect v-model="sendActionMode" :items="actionOptions" label="行動按鈕目的地" />
					<VTextField v-if="sendActionMode === 'custom'" v-model="sendCustomActionUrl" label="自訂網址" placeholder="/library 或 https://example.com" maxlength="2048" />
					<VTextField v-if="sendActionMode !== 'none'" v-model="sendDraft.actionLabel" label="按鈕文字" placeholder="未填時使用預設文字" maxlength="40" />
					<VCard variant="tonal" class="pa-4 mt-2">
						<p class="text-caption text-medium-emphasis mb-2">通知預覽</p>
						<div class="d-flex align-start ga-3">
							<VIcon :icon="priorityMeta[sendDraft.priority].icon" :color="priorityMeta[sendDraft.priority].color" />
							<div><p class="font-weight-bold">{{ sendDraft.title.trim() || '通知標題' }}</p><p class="text-body-2 mt-1">{{ sendDraft.body.trim() || '通知內容會顯示在這裡。' }}</p></div>
						</div>
					</VCard>
					<p v-if="formError" class="text-error text-body-2 mt-4" role="alert">{{ formError }}</p>
				</VCardText>
				<VCardActions class="pa-5"><VSpacer /><VBtn @click="isSendDialogOpen = false">取消</VBtn><VBtn color="primary" :loading="isSending" :disabled="isSending" @click="sendNotification">{{ sendTimeMode === 'scheduled' ? '建立排程' : '確認發送' }}</VBtn></VCardActions>
			</VCard>
		</VDialog>

		<VDialog :model-value="Boolean(ruleDraft)" max-width="780" @update:model-value="closeRuleDialog">
			<VCard v-if="ruleDraft">
				<VCardTitle class="pa-6 pb-2">{{ editingRuleId ? '編輯自動通知規則' : '新增自動通知規則' }}</VCardTitle>
				<VCardText class="pa-6 pt-2">
					<VTextField v-model="ruleDraft.name" label="規則名稱" maxlength="80" />
					<VSelect v-model="ruleDraft.eventType" :items="eventOptions" label="觸發事件" />
					<VTextField v-model="ruleDraft.title" label="通知標題" maxlength="80" counter="80" />
					<VTextarea v-model="ruleDraft.body" label="通知內容" maxlength="500" counter="500" rows="4" />
					<div class="form-grid">
						<VSelect v-model="ruleDraft.priority" :items="priorityOptions" label="重要程度" />
						<VSelect v-model="ruleDraft.audienceType" :items="audienceOptions" label="發送對象" />
					</div>
					<VSelect v-if="ruleDraft.audienceType === 'department'" v-model="ruleDraft.targetDepartment" :items="notificationsStore.departments" label="選擇部門" />
					<VSelect v-if="ruleDraft.audienceType === 'role'" v-model="ruleDraft.targetRole" :items="roleOptions" label="選擇角色" />
					<VAutocomplete v-if="ruleDraft.audienceType === 'selected'" v-model="ruleDraft.targetUserIds" :items="userOptions" label="選擇使用者" multiple chips closable-chips />
					<VSelect v-model="ruleActionMode" :items="actionOptions" label="行動按鈕目的地" />
					<VTextField v-if="ruleActionMode === 'custom'" v-model="ruleCustomActionUrl" label="自訂網址" placeholder="/library 或 https://example.com" maxlength="2048" />
					<VTextField v-if="ruleActionMode !== 'none'" v-model="ruleDraft.actionLabel" label="按鈕文字" placeholder="未填時使用預設文字" maxlength="40" />
					<VSwitch v-model="ruleDraft.isEnabled" label="儲存後立即啟用" color="primary" />
					<p v-if="formError" class="text-error text-body-2 mt-2" role="alert">{{ formError }}</p>
				</VCardText>
				<VCardActions class="pa-5"><VSpacer /><VBtn @click="closeRuleDialog">取消</VBtn><VBtn color="primary" @click="saveRule">儲存規則</VBtn></VCardActions>
			</VCard>
		</VDialog>

		<VDialog :model-value="Boolean(deleteRuleTarget)" max-width="480" @update:model-value="deleteRuleTarget = null"><VCard v-if="deleteRuleTarget"><VCardTitle class="pa-6 pb-2">刪除自動通知規則？</VCardTitle><VCardText class="pa-6 pt-2">刪除「{{ deleteRuleTarget.name }}」後不再產生新通知；已發送的通知與成效紀錄會保留。</VCardText><VCardActions class="pa-5"><VSpacer /><VBtn @click="deleteRuleTarget = null">返回</VBtn><VBtn color="error" @click="confirmDeleteRule">確認刪除</VBtn></VCardActions></VCard></VDialog>
	</div>
</template>

<style scoped>
.notification-window { overflow: visible; }
.admin-toolbar { display: flex; align-items: center; justify-content: space-between; gap: var(--space-md); }
.admin-toolbar > .v-input { max-width: 420px; }
.rule-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-lg); }
.form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-sm); }
.notification-performance { background: rgb(var(--v-theme-surface-variant), 0.28); }
.performance-summary { display: grid; grid-template-columns: repeat(7, minmax(110px, 1fr)); gap: var(--space-sm); }
.performance-summary > div { display: grid; gap: var(--space-xs); padding: var(--space-md); border: 1px solid rgb(var(--v-theme-outline)); border-radius: var(--radius-md); background: rgb(var(--v-theme-surface)); }
.performance-summary span { color: var(--ink-subtle); font-size: 0.8rem; }
.performance-summary strong { font-size: 1.1rem; }
.recipient-table { overflow-x: auto; }
.notification-record-table :deep(table) { min-width: 880px; }
.recipient-table :deep(table) { min-width: 1600px; }
@media (max-width: 1100px) { .performance-summary { grid-template-columns: repeat(4, minmax(120px, 1fr)); } }
@media (max-width: 900px) { .rule-grid, .performance-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 640px) { .admin-toolbar { align-items: stretch; flex-direction: column; } .admin-toolbar > .v-input { max-width: none; } .rule-grid, .form-grid, .performance-summary { grid-template-columns: minmax(0, 1fr); } }
</style>
