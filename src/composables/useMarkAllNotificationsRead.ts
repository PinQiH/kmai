import { useNotificationsStore } from '@/stores/notifications'
import { useToastStore } from '@/stores/toast'

/*
 * > 把目前使用者的通知全部標示為已讀，並提供復原
 * @ 已讀是不可逆的破壞性操作，任何入口（鈴鐺選單、通知中心）都必須走這裡，才不會有的能復原、有的不能。
 */
export function useMarkAllNotificationsRead() {
	const notificationsStore = useNotificationsStore()
	const toastStore = useToastStore()

	/**
	 * 標示全部已讀，並以帶「復原」的 toast 回饋。
	 * @returns 這次實際由未讀轉為已讀的筆數；全部本來就已讀時回傳 0 且不發出 toast。
	 */
	return function markAllNotificationsRead(): number {
		const changedIds = notificationsStore.markAllRead()
		if (changedIds.length === 0) return 0

		toastStore.success(`已將 ${changedIds.length} 則通知標示為已讀`, {
			action: {
				label: '復原',
				handler: () => {
					notificationsStore.restoreUnread(changedIds)
				},
			},
		})
		return changedIds.length
	}
}
