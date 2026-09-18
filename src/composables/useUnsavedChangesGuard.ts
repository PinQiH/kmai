import { computed, onBeforeUnmount, onMounted, ref, type ComputedRef, type Ref } from 'vue'
import { onBeforeRouteLeave, useRouter } from 'vue-router'

/*
 * > 未儲存修改的離開保護
 * @ 站內換頁：先攔下導覽，由頁面顯示確認框（搭配 ConfirmDialog），使用者確認後才繼續前往原目標。
 * @ 重新整理或關閉分頁：交給瀏覽器原生提示，文字由瀏覽器決定、無法自訂。
 */

export interface UnsavedChangesGuard {
	// @ 被攔下的目標網址；有值代表確認框應開啟
	leaveTarget: Ref<string | null>
	isLeaveDialogOpen: ComputedRef<boolean>
	stay: () => void
	confirmLeave: () => Promise<void>
}

/**
 * 在元件內註冊離開保護。
 * @param isDirty 目前是否有未儲存的修改；每次導覽時才讀取。
 * @returns 確認框狀態與「留下／離開」操作。
 */
export function useUnsavedChangesGuard(isDirty: () => boolean): UnsavedChangesGuard {
	const router = useRouter()
	const leaveTarget = ref<string | null>(null)
	let allowLeave = false

	onBeforeRouteLeave((to) => {
		if (allowLeave || !isDirty()) return true
		leaveTarget.value = to.fullPath
		return false
	})

	function stay(): void {
		leaveTarget.value = null
	}

	async function confirmLeave(): Promise<void> {
		const target = leaveTarget.value
		leaveTarget.value = null
		if (!target) return
		allowLeave = true
		try {
			await router.push(target)
		} finally {
			// @ 導覽被其他守衛擋下時，下次離開仍要再確認
			allowLeave = false
		}
	}

	function handleBeforeUnload(event: BeforeUnloadEvent): void {
		if (!isDirty()) return
		event.preventDefault()
		// NOTE: 舊版瀏覽器需要設定 returnValue 才會顯示提示
		event.returnValue = ''
	}

	onMounted(() => window.addEventListener('beforeunload', handleBeforeUnload))
	onBeforeUnmount(() => window.removeEventListener('beforeunload', handleBeforeUnload))

	return {
		leaveTarget,
		isLeaveDialogOpen: computed(() => Boolean(leaveTarget.value)),
		stay,
		confirmLeave,
	}
}
