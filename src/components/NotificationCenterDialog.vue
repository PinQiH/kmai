<script setup lang="ts">
import { type ComponentPublicInstance, computed, nextTick, ref, watch } from 'vue'
import { useDisplay } from 'vuetify'

import StatePanel from '@/components/StatePanel.vue'
import { useMarkAllNotificationsRead } from '@/composables/useMarkAllNotificationsRead'
import { CURRENT_NOTIFICATION_USER_ID } from '@/repositories/notifications.repository'
import { useNotificationsStore } from '@/stores/notifications'
import type { AppNotification, NotificationPriority } from '@/types'
import { formatNotificationTimestamp, getNotificationActionTargetKind } from '@/utils/notifications'

/*
 * > 通知中心對話框：從鈴鐺開啟，在不離開目前工作的前提下讀完通知
 * @ 篩選與選取跨次開啟保留，讓被打斷的使用者回來時停在原處；initialNotificationId 變動時才覆寫選取。
 * @ 「全部標示已讀」以 toast 提供復原，並保住正在閱讀的那則，避免畫面在眼前塌掉。
 * @ 窄螢幕改為「清單／詳情」單視圖切換，選取後只顯示詳情並提供返回清單。
 */

type NotificationFilter = 'all' | 'unread'

const isOpen = defineModel<boolean>({ required: true })
const props = defineProps<{ initialNotificationId?: string | null }>()
const emit = defineEmits<{ closed: [] }>()

const display = useDisplay()
const notificationsStore = useNotificationsStore()
const markAllNotificationsRead = useMarkAllNotificationsRead()

const activeFilter = ref<NotificationFilter>('all')
const selectedNotificationId = ref<string | null>(null)
const openedFromUnreadFilterId = ref<string | null>(null)
const detailSection = ref<ComponentPublicInstance>()

// @ 雙欄塌成單欄的斷點；版面切換全由這裡決定，樣式不另外寫 media query
const COMPACT_BREAKPOINT = 860
const isCompact = computed(() => display.width.value <= COMPACT_BREAKPOINT)

const priorityMeta: Record<NotificationPriority, { color: string; icon: string; label: string }> = {
	// @ 一般通知用中性色，把 Archive Indigo 留給選取狀態與主要操作
	normal: { color: 'medium-emphasis', icon: 'mdi-bell-outline', label: '一般' },
	important: { color: 'warning', icon: 'mdi-bell-alert-outline', label: '重要' },
	urgent: { color: 'error', icon: 'mdi-alert-circle-outline', label: '緊急' },
}

const visibleNotifications = computed(() => {
	if (activeFilter.value === 'all') return notificationsStore.currentUserNotifications
	return notificationsStore.currentUserNotifications.filter(
		(notification) => isUnread(notification) || notification.id === openedFromUnreadFilterId.value,
	)
})
const selectedNotification = computed(() =>
	visibleNotifications.value.find((notification) => notification.id === selectedNotificationId.value),
)
// @ 窄螢幕一次只顯示一邊：選了通知就看詳情，其餘時候看清單
const showsList = computed(() => !isCompact.value || !selectedNotification.value)
const showsDetail = computed(() => !isCompact.value || Boolean(selectedNotification.value))

watch(isOpen, (opened) => {
	if (!opened) {
		emit('closed')
		return
	}
	// @ 刻意不重設 activeFilter：習慣用未讀模式的人不該每次開啟都重按一次
	if (props.initialNotificationId) openNotification(props.initialNotificationId)
	else if (selectedNotificationId.value && !selectedNotification.value) selectedNotificationId.value = null
})
watch(
	() => props.initialNotificationId,
	(notificationId) => {
		if (!isOpen.value || !notificationId) return
		openNotification(notificationId)
	},
)
watch(activeFilter, (filter) => {
	if (filter !== 'unread') openedFromUnreadFilterId.value = null
})

function currentRecipient(notification: AppNotification) {
	return notification.recipients.find((recipient) => recipient.userId === CURRENT_NOTIFICATION_USER_ID)
}

function isUnread(notification: AppNotification): boolean {
	return !currentRecipient(notification)?.readAt
}

function openNotification(notificationId: string): void {
	const notification = notificationsStore.currentUserNotifications.find((item) => item.id === notificationId)
	if (!notification) return

	// @ 未讀篩選下記住這則，才不會因為剛標示已讀就從清單中消失
	if (activeFilter.value === 'unread' && isUnread(notification)) openedFromUnreadFilterId.value = notificationId
	selectedNotificationId.value = notificationId
	notificationsStore.markViewed(notificationId)
	// @ 窄螢幕切換到詳情視圖後把焦點帶過去，鍵盤與螢幕閱讀器才知道畫面換了
	if (isCompact.value) {
		void nextTick(() => (detailSection.value?.$el as HTMLElement | undefined)?.focus({ preventScroll: true }))
	}
}

function backToList(): void {
	selectedNotificationId.value = null
}

function markAllRead(): void {
	// @ 保住正在閱讀的那則，否則未讀篩選下整個清單與詳情會一起消失
	if (activeFilter.value === 'unread' && selectedNotificationId.value) {
		openedFromUnreadFilterId.value = selectedNotificationId.value
	}

	markAllNotificationsRead()
}

function handleInternalActionClick(notificationId: string): void {
	notificationsStore.markActionClicked(notificationId)
	// @ 保留選取狀態，使用者處理完再開鈴鐺時會停在同一則
	isOpen.value = false
}
</script>

<template>
	<VDialog
		v-model="isOpen"
		max-width="960"
		scrollable
		:content-props="{ 'aria-labelledby': 'notification-center-title' }"
	>
		<VCard class="notification-dialog" data-testid="notification-center-dialog">
			<VCardTitle class="notification-dialog-header">
				<div class="notification-dialog-heading">
					<h2 id="notification-center-title" class="section-heading">通知中心</h2>
					<p class="text-caption text-medium-emphasis">
						{{ notificationsStore.unreadCount }} 則未讀 · 展示資料，重新整理後會還原
					</p>
				</div>
				<VBtn
					variant="text"
					size="small"
					prepend-icon="mdi-check-all"
					:disabled="notificationsStore.unreadCount === 0"
					data-testid="notification-dialog-mark-all"
					@click="markAllRead"
				>
					全部標示已讀
				</VBtn>
				<VBtn icon="mdi-close" variant="text" size="small" aria-label="關閉通知中心" @click="isOpen = false" />
			</VCardTitle>
			<VDivider />

			<VCardText class="notification-dialog-body">
				<VBtnToggle
					v-model="activeFilter"
					mandatory
					color="primary"
					variant="outlined"
					density="comfortable"
					class="mb-5"
					aria-label="通知篩選"
				>
					<VBtn value="all">全部 {{ notificationsStore.currentUserNotifications.length }}</VBtn>
					<VBtn value="unread" data-testid="notification-dialog-filter-unread">
						未讀 {{ notificationsStore.unreadCount }}
					</VBtn>
				</VBtnToggle>

				<div v-if="visibleNotifications.length > 0" class="notification-layout" :class="{ 'is-compact': isCompact }">
					<VCard v-if="showsList" class="surface-border notification-list" aria-label="通知清單">
						<VList lines="three" class="py-0">
							<template v-for="(notification, index) in visibleNotifications" :key="notification.id">
								<VListItem
									data-testid="notification-dialog-item"
									:active="selectedNotificationId === notification.id"
									:class="{ 'is-unread': isUnread(notification) }"
									@click="openNotification(notification.id)"
								>
									<template #prepend>
										<VIcon
											:icon="priorityMeta[notification.priority].icon"
											:color="priorityMeta[notification.priority].color"
											:aria-label="priorityMeta[notification.priority].label"
										/>
									</template>
									<VListItemTitle :class="isUnread(notification) ? 'font-weight-bold' : 'font-weight-regular'">
										{{ notification.title }}
									</VListItemTitle>
									<VListItemSubtitle>
										{{ notification.sourceLabel }} · {{ formatNotificationTimestamp(notification.sentAt) }}
									</VListItemSubtitle>
									<template #append>
										<span v-if="isUnread(notification)" class="unread-mark">
											<span class="unread-dot" aria-hidden="true" />
											<span class="d-sr-only">未讀</span>
										</span>
									</template>
								</VListItem>
								<VDivider v-if="index < visibleNotifications.length - 1" />
							</template>
						</VList>
					</VCard>

					<VCard
						v-if="showsDetail && selectedNotification"
						ref="detailSection"
						class="surface-border pa-6 notification-detail"
						tabindex="-1"
						data-testid="notification-dialog-detail"
					>
						<VBtn
							v-if="isCompact"
							variant="text"
							size="small"
							prepend-icon="mdi-arrow-left"
							class="mb-4"
							data-testid="notification-dialog-back"
							@click="backToList"
						>
							返回通知清單
						</VBtn>
						<div class="d-flex align-start ga-3 mb-5">
							<VIcon
								:icon="priorityMeta[selectedNotification.priority].icon"
								:color="priorityMeta[selectedNotification.priority].color"
								size="28"
							/>
							<div>
								<VChip
									:color="priorityMeta[selectedNotification.priority].color"
									size="small"
									variant="tonal"
									class="mb-2"
								>
									{{ priorityMeta[selectedNotification.priority].label }}通知
								</VChip>
								<h3 class="section-heading">{{ selectedNotification.title }}</h3>
								<p class="text-caption text-medium-emphasis mt-1">
									{{ selectedNotification.sourceLabel }} · {{ formatNotificationTimestamp(selectedNotification.sentAt) }}
								</p>
							</div>
						</div>
						<p class="notification-body">{{ selectedNotification.body }}</p>
						<div v-if="selectedNotification.actionTo" class="mt-6">
							<VBtn
								v-if="getNotificationActionTargetKind(selectedNotification.actionTo) === 'internal'"
								color="primary"
								:to="selectedNotification.actionTo"
								data-testid="notification-dialog-action"
								@click="handleInternalActionClick(selectedNotification.id)"
							>
								{{ selectedNotification.actionLabel ?? '查看詳情' }}
							</VBtn>
							<VBtn
								v-else-if="getNotificationActionTargetKind(selectedNotification.actionTo) === 'external'"
								color="primary"
								append-icon="mdi-open-in-new"
								:href="selectedNotification.actionTo"
								target="_blank"
								rel="noopener noreferrer"
								data-testid="notification-dialog-action"
								@click="notificationsStore.markActionClicked(selectedNotification.id)"
							>
								{{ selectedNotification.actionLabel ?? '查看詳情' }}（開新分頁）
							</VBtn>
						</div>
					</VCard>
					<VCard v-else-if="showsDetail" class="surface-border notification-placeholder">
						<VIcon icon="mdi-email-open-outline" size="42" color="secondary" class="mb-3" />
						<p class="font-weight-bold">選擇一則通知</p>
						<p class="text-body-2 text-medium-emphasis mt-1">從左側挑一則，內容會顯示在這裡。</p>
					</VCard>
				</div>

				<StatePanel
					v-else
					icon="mdi-bell-sleep-outline"
					:title="activeFilter === 'unread' ? '目前沒有未讀通知' : '目前沒有通知'"
					:description="activeFilter === 'unread' ? '所有通知都已查看，可以切換到全部通知。' : '系統公告與處理結果會顯示在這裡。'"
					:action-label="activeFilter === 'unread' ? '查看全部通知' : undefined"
					@action="activeFilter = 'all'"
				/>
			</VCardText>
		</VCard>
	</VDialog>
</template>

<style scoped>
.notification-dialog {
	max-height: min(760px, calc(100vh - 64px));
}

.notification-dialog-header {
	display: flex;
	align-items: center;
	gap: var(--space-sm);
	padding: var(--space-md) var(--space-lg);
}

.notification-dialog-heading {
	flex: 1;
	min-width: 0;
}

/* @ 由對話框本身負責捲動，清單不再自帶捲軸，避免滾輪在兩層之間錯位 */
.notification-dialog-body {
	padding: var(--space-lg);
}

.notification-layout {
	display: grid;
	grid-template-columns: minmax(280px, 0.9fr) minmax(0, 1.1fr);
	gap: var(--space-lg);
	align-items: stretch;
}

.notification-list {
	overflow: hidden;
}

.is-unread {
	background: var(--tint-hover);
}

.unread-mark {
	display: inline-flex;
	align-items: center;
}

.unread-dot {
	width: 8px;
	height: 8px;
	border-radius: 50%;
	background: rgb(var(--v-theme-primary));
}

.notification-detail,
.notification-placeholder {
	min-height: 280px;
}

.notification-detail:focus-visible {
	outline: 3px solid rgb(var(--v-theme-primary));
	outline-offset: 2px;
}

.notification-placeholder {
	display: grid;
	place-content: center;
	padding: var(--space-xl);
	text-align: center;
}

.notification-body {
	line-height: 1.85;
	white-space: pre-line;
}

.notification-layout.is-compact {
	grid-template-columns: minmax(0, 1fr);
}
</style>
