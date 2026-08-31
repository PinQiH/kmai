<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import PageHeader from '@/components/PageHeader.vue'
import StatePanel from '@/components/StatePanel.vue'
import { CURRENT_NOTIFICATION_USER_ID } from '@/mocks/notifications'
import { useNotificationsStore } from '@/stores/notifications'
import type { AppNotification, NotificationPriority } from '@/types'
import { formatNotificationTimestamp, getNotificationActionTargetKind } from '@/utils/notifications'

type NotificationFilter = 'all' | 'unread'

const route = useRoute()
const router = useRouter()
const notificationsStore = useNotificationsStore()

const activeFilter = ref<NotificationFilter>('all')
const selectedNotificationId = ref<string | null>(null)
const openedFromUnreadFilterId = ref<string | null>(null)

const priorityMeta: Record<NotificationPriority, { color: string; icon: string; label: string }> = {
	normal: { color: 'primary', icon: 'mdi-bell-outline', label: '一般' },
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

watch(
	() => route.query.id,
	(notificationId) => selectFromRoute(notificationId),
)
watch(activeFilter, (filter) => {
	if (filter !== 'unread') openedFromUnreadFilterId.value = null
})

onMounted(() => selectFromRoute(route.query.id))

function currentRecipient(notification: AppNotification) {
	return notification.recipients.find((recipient) => recipient.userId === CURRENT_NOTIFICATION_USER_ID)
}

function isUnread(notification: AppNotification): boolean {
	return !currentRecipient(notification)?.readAt
}

function selectFromRoute(notificationId: unknown): void {
	if (typeof notificationId !== 'string') return
	if (!notificationsStore.currentUserNotifications.some((notification) => notification.id === notificationId)) return

	selectedNotificationId.value = notificationId
	notificationsStore.markViewed(notificationId)
}

function selectNotification(notification: AppNotification): void {
	if (activeFilter.value === 'unread' && isUnread(notification)) {
		openedFromUnreadFilterId.value = notification.id
	}

	if (route.query.id === notification.id) {
		selectedNotificationId.value = notification.id
		notificationsStore.markViewed(notification.id)
		return
	}

	void router.replace({ path: '/notifications', query: { id: notification.id } })
}

function markAllRead(): void {
	notificationsStore.markAllRead()
}

function recordActionClick(notificationId: string): void {
	notificationsStore.markActionClicked(notificationId)
}
</script>

<template>
	<div class="page-shell">
		<PageHeader eyebrow="個人通知" title="通知中心" description="查看系統公告、文件處理結果與分享提醒。">
			<template #actions>
				<VBtn
					variant="tonal"
					prepend-icon="mdi-check-all"
					:disabled="notificationsStore.unreadCount === 0"
					@click="markAllRead"
				>
					全部標示已讀
				</VBtn>
			</template>
		</PageHeader>

		<VAlert type="info" variant="tonal" class="mb-6">
			這是前端 Mock。查看狀態只保留在目前頁籤，重新整理後會還原成展示資料。
		</VAlert>

		<VBtnToggle v-model="activeFilter" mandatory color="primary" variant="outlined" class="mb-5" aria-label="通知篩選">
			<VBtn value="all">全部 {{ notificationsStore.currentUserNotifications.length }}</VBtn>
			<VBtn value="unread" data-testid="notification-filter-unread">未讀 {{ notificationsStore.unreadCount }}</VBtn>
		</VBtnToggle>

		<div v-if="visibleNotifications.length > 0" class="notification-layout">
			<VCard class="surface-border notification-list" aria-label="通知清單">
				<VList lines="three" class="py-0">
					<template v-for="(notification, index) in visibleNotifications" :key="notification.id">
						<VListItem
							data-testid="notification-item"
							:active="selectedNotificationId === notification.id"
							:class="{ 'is-unread': isUnread(notification) }"
							@click="selectNotification(notification)"
						>
							<template #prepend>
								<VIcon
									:icon="priorityMeta[notification.priority].icon"
									:color="priorityMeta[notification.priority].color"
									:aria-label="priorityMeta[notification.priority].label"
								/>
							</template>
							<VListItemTitle class="font-weight-bold">{{ notification.title }}</VListItemTitle>
							<VListItemSubtitle>
								{{ notification.sourceLabel }} · {{ formatNotificationTimestamp(notification.sentAt) }}
							</VListItemSubtitle>
							<template #append>
								<span v-if="isUnread(notification)" class="unread-dot" aria-label="未讀" />
							</template>
						</VListItem>
						<VDivider v-if="index < visibleNotifications.length - 1" />
					</template>
				</VList>
			</VCard>

			<VCard v-if="selectedNotification" class="surface-border pa-6 notification-detail" data-testid="notification-detail">
				<div class="d-flex align-start ga-3 mb-5">
					<VIcon
						:icon="priorityMeta[selectedNotification.priority].icon"
						:color="priorityMeta[selectedNotification.priority].color"
						size="28"
					/>
					<div>
						<VChip :color="priorityMeta[selectedNotification.priority].color" size="small" variant="tonal" class="mb-2">
							{{ priorityMeta[selectedNotification.priority].label }}通知
						</VChip>
						<h2 class="section-heading">{{ selectedNotification.title }}</h2>
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
						data-testid="notification-action"
						@click="recordActionClick(selectedNotification.id)"
					>
						{{ selectedNotification.actionLabel ?? '查看詳情' }}
					</VBtn>
					<VBtn
						v-else-if="getNotificationActionTargetKind(selectedNotification.actionTo) === 'external'"
						color="primary"
						:href="selectedNotification.actionTo"
						target="_blank"
						rel="noopener noreferrer"
						data-testid="notification-action"
						@click="recordActionClick(selectedNotification.id)"
					>
						{{ selectedNotification.actionLabel ?? '查看詳情' }}
					</VBtn>
				</div>
			</VCard>
			<VCard v-else class="surface-border notification-placeholder">
				<VIcon icon="mdi-email-open-outline" size="42" color="secondary" class="mb-3" />
				<p class="font-weight-bold">選擇一則通知</p>
				<p class="text-body-2 text-medium-emphasis mt-1">開啟通知後會在後台 Mock 紀錄查看時間。</p>
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
	</div>
</template>

<style scoped>
.notification-layout {
	display: grid;
	grid-template-columns: minmax(300px, 0.9fr) minmax(0, 1.1fr);
	gap: var(--space-lg);
	align-items: start;
}

.notification-list {
	overflow: hidden;
}

.is-unread {
	background: var(--tint-hover);
}

.unread-dot {
	width: 8px;
	height: 8px;
	border-radius: 50%;
	background: rgb(var(--v-theme-primary));
}

.notification-detail,
.notification-placeholder {
	min-height: 300px;
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

@media (max-width: 860px) {
	.notification-layout {
		grid-template-columns: minmax(0, 1fr);
	}
}
</style>
