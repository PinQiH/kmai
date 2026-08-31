<script setup lang="ts">
import { computed } from 'vue'

import { CURRENT_NOTIFICATION_USER_ID } from '@/mocks/notifications'
import { useNotificationsStore } from '@/stores/notifications'
import type { NotificationPriority } from '@/types'
import { formatNotificationTimestamp } from '@/utils/notifications'

const notificationsStore = useNotificationsStore()

const recentNotifications = computed(() => notificationsStore.currentUserNotifications.slice(0, 5))
const priorityMeta: Record<NotificationPriority, { color: string; icon: string; label: string }> = {
	normal: { color: 'primary', icon: 'mdi-bell-outline', label: '一般' },
	important: { color: 'warning', icon: 'mdi-bell-alert-outline', label: '重要' },
	urgent: { color: 'error', icon: 'mdi-alert-circle-outline', label: '緊急' },
}

function isUnread(notificationId: string): boolean {
	const notification = notificationsStore.currentUserNotifications.find((item) => item.id === notificationId)
	const recipient = notification?.recipients.find((item) => item.userId === CURRENT_NOTIFICATION_USER_ID)
	return !recipient?.readAt
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
					@click.stop="notificationsStore.markAllRead()"
				>
					全部已讀
				</VBtn>
			</div>
			<VDivider />

			<VList v-if="recentNotifications.length > 0" lines="three" class="py-0">
				<template v-for="(notification, index) in recentNotifications" :key="notification.id">
					<VListItem
						:to="{ path: '/notifications', query: { id: notification.id } }"
						:class="{ 'is-unread': isUnread(notification.id) }"
					>
						<template #prepend>
							<VIcon
								:icon="priorityMeta[notification.priority].icon"
								:color="priorityMeta[notification.priority].color"
								:aria-label="priorityMeta[notification.priority].label"
							/>
						</template>
						<VListItemTitle class="font-weight-medium">{{ notification.title }}</VListItemTitle>
						<VListItemSubtitle>
							{{ notification.sourceLabel }} · {{ formatNotificationTimestamp(notification.sentAt) }}
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
				<VBtn block variant="text" to="/notifications">查看所有通知</VBtn>
			</VCardActions>
		</VCard>
	</VMenu>
</template>

<style scoped>
.notification-menu {
	width: min(420px, calc(100vw - 24px));
	max-height: min(620px, calc(100vh - 80px));
	overflow-y: auto;
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
</style>
