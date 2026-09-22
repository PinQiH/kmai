<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import type { VBtn } from 'vuetify/components'

import NotificationCenterDialog from '@/components/NotificationCenterDialog.vue'
import { useMarkAllNotificationsRead } from '@/composables/useMarkAllNotificationsRead'
import { CURRENT_NOTIFICATION_USER_ID } from '@/repositories/notifications.repository'
import { useNotificationsStore } from '@/stores/notifications'
import type { NotificationPriority } from '@/types'
import { formatNotificationMenuTimestamp, formatNotificationTimestamp } from '@/utils/notifications'

const notificationsStore = useNotificationsStore()
const markAllNotificationsRead = useMarkAllNotificationsRead()

const isCenterOpen = ref(false)
const centerInitialNotificationId = ref<string | null>(null)
const bellButton = ref<InstanceType<typeof VBtn>>()

const recentNotifications = computed(() => notificationsStore.currentUserNotifications.slice(0, 5))
const priorityMeta: Record<NotificationPriority, { color: string; icon: string; label: string }> = {
	// @ 與通知中心一致：一般通知用中性色，Archive Indigo 留給主要操作
	normal: { color: 'medium-emphasis', icon: 'mdi-bell-outline', label: '一般' },
	important: { color: 'warning', icon: 'mdi-bell-alert-outline', label: '重要' },
	urgent: { color: 'error', icon: 'mdi-alert-circle-outline', label: '緊急' },
}

function isUnread(notificationId: string): boolean {
	const notification = notificationsStore.currentUserNotifications.find((item) => item.id === notificationId)
	const recipient = notification?.recipients.find((item) => item.userId === CURRENT_NOTIFICATION_USER_ID)
	return !recipient?.readAt
}

/* > 從鈴鐺開啟通知中心彈窗；帶 notificationId 時直接展開該則 */
function openNotificationCenter(notificationId: string | null = null): void {
	centerInitialNotificationId.value = notificationId
	isCenterOpen.value = true
}

/* > 彈窗關閉後把焦點還給鈴鐺，鍵盤使用者不必從頭 Tab */
function focusBell(): void {
	centerInitialNotificationId.value = null
	void nextTick(() => (bellButton.value?.$el as HTMLElement | undefined)?.focus({ preventScroll: true }))
}
</script>

<template>
	<VMenu location="bottom end" :close-on-content-click="true">
		<template #activator="{ props: menuProps }">
			<VBadge
				:content="notificationsStore.unreadCount"
				:model-value="notificationsStore.unreadCount > 0"
				color="error"
				offset-x="4"
				offset-y="4"
			>
				<VBtn
					ref="bellButton"
					v-bind="menuProps"
					icon="mdi-bell-outline"
					:aria-label="`通知，${notificationsStore.unreadCount} 則未讀`"
				/>
			</VBadge>
		</template>

		<VCard class="notification-menu surface-border">
			<div class="d-flex align-center px-4 py-3">
				<div>
					<p class="font-weight-bold">通知</p>
					<p class="text-caption text-medium-emphasis">{{ notificationsStore.unreadCount }} 則未讀</p>
				</div>
				<VSpacer />
				<VBtn
					v-if="notificationsStore.unreadCount > 0"
					variant="text"
					size="small"
					data-testid="notification-menu-mark-all"
					@click.stop="markAllNotificationsRead()"
				>
					全部已讀
				</VBtn>
			</div>
			<VDivider />

			<VList v-if="recentNotifications.length > 0" lines="three" class="py-0">
				<template v-for="(notification, index) in recentNotifications" :key="notification.id">
					<VListItem
						:class="{ 'is-unread': isUnread(notification.id) }"
						@click="openNotificationCenter(notification.id)"
					>
						<template #prepend>
							<VIcon
								:icon="priorityMeta[notification.priority].icon"
								:color="priorityMeta[notification.priority].color"
								:aria-label="priorityMeta[notification.priority].label"
							/>
						</template>
						<VListItemTitle :class="isUnread(notification.id) ? 'font-weight-bold' : 'font-weight-regular'">
						{{ notification.title }}
					</VListItemTitle>
						<VListItemSubtitle class="notification-meta">
							<span class="notification-source" :title="notification.sourceLabel">
								{{ notification.sourceLabel }}
							</span>
							<time
								class="notification-time"
								:datetime="notification.sentAt"
								:title="formatNotificationTimestamp(notification.sentAt)"
								:aria-label="formatNotificationTimestamp(notification.sentAt)"
							>
								{{ formatNotificationMenuTimestamp(notification.sentAt) }}
							</time>
						</VListItemSubtitle>
						<template #append>
							<span v-if="isUnread(notification.id)" class="unread-dot" aria-label="未讀" />
						</template>
					</VListItem>
					<VDivider v-if="index < recentNotifications.length - 1" />
				</template>
			</VList>
			<div v-else class="pa-6 text-center">
				<VIcon icon="mdi-bell-sleep-outline" size="36" color="secondary" class="mb-2" />
				<p class="font-weight-medium">目前沒有通知</p>
			</div>

			<VDivider />
			<VCardActions class="pa-2">
				<VBtn block variant="text" @click="openNotificationCenter()">查看所有通知</VBtn>
			</VCardActions>
		</VCard>
	</VMenu>

	<NotificationCenterDialog
		v-model="isCenterOpen"
		:initial-notification-id="centerInitialNotificationId"
		@closed="focusBell"
	/>
</template>

<style scoped>
.notification-menu {
	width: min(360px, calc(100vw - 24px));
	max-height: min(480px, calc(100vh - 80px));
	overflow-y: auto;
}

.notification-menu :deep(.v-list-item-title) {
	display: -webkit-box;
	overflow: hidden;
	-webkit-box-orient: vertical;
	-webkit-line-clamp: 2;
	font-size: 0.875rem;
	line-height: 1.4;
	white-space: normal;
}

.notification-menu :deep(.notification-meta) {
	display: grid;
	grid-template-columns: minmax(0, 1fr) auto;
	align-items: center;
	gap: var(--space-sm);
	font-size: 0.75rem;
	line-height: 1.4;
}

.notification-source {
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.notification-time {
	font-variant-numeric: tabular-nums;
	white-space: nowrap;
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
</style>
