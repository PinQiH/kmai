import {
	automaticNotificationRules,
	CURRENT_NOTIFICATION_USER_ID,
	emailChannelSettings,
	notifications,
	notificationUsers,
	recipientGroups,
} from '@/mocks/notifications'
import type {
	AppNotification,
	AutomaticNotificationRule,
	EmailChannelSettings,
	NotificationUser,
	RecipientGroup,
} from '@/types'

// > 通知的初始資料；store 以此建立自己的狀態，不直接依賴 Mock 資料來源
// TODO(api-integration): 通知與自動通知規則改為呼叫後端 API 後，這裡改為非同步。

// @ 目前登入者代號；接後端後改由 session 提供
export { CURRENT_NOTIFICATION_USER_ID }

/** 取得站內通知快照。 */
export function getNotificationsSnapshot(): AppNotification[] {
	return notifications.map((notification) => ({ ...notification }))
}

/** 取得自動通知規則快照。 */
export function getAutomaticNotificationRulesSnapshot(): AutomaticNotificationRule[] {
	return automaticNotificationRules.map((rule) => ({ ...rule }))
}

/** 取得可收件的使用者快照。 */
export function getNotificationUsersSnapshot(): NotificationUser[] {
	return notificationUsers.map((user) => ({ ...user }))
}

/** 取得收件群組快照。 */
export function getRecipientGroupsSnapshot(): RecipientGroup[] {
	return recipientGroups.map((group) => ({
		...group,
		memberUserIds: [...group.memberUserIds],
		emails: [...group.emails],
		severities: [...group.severities],
	}))
}

/** 取得 Email 通道設定快照。 */
export function getEmailChannelSettingsSnapshot(): EmailChannelSettings {
	return { ...emailChannelSettings }
}
