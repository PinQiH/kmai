import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { useAdminAssistantStore } from '@/stores/adminAssistant'

const TIMER_TICK_MS = 1000

export function useAssistantIdleTimer() {
	const assistantStore = useAdminAssistantStore()
	const remainingMs = ref(0)
	let intervalId: number | null = null

	const remainingLabel = computed(() => {
		if (remainingMs.value <= 0) return ''
		const totalSeconds = Math.ceil(remainingMs.value / 1000)
		const minutes = Math.floor(totalSeconds / 60)
		const seconds = totalSeconds % 60
		return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
	})

	function stopTimer(): void {
		if (intervalId === null) return
		window.clearInterval(intervalId)
		intervalId = null
	}

	function syncTimer(): void {
		assistantStore.updateExpiryState(Date.now())
		remainingMs.value = assistantStore.expiresAt === null
			? 0
			: Math.max(0, assistantStore.expiresAt - Date.now())
	}

	function startTimer(): void {
		stopTimer()
		if (assistantStore.expiresAt === null || assistantStore.isResponding) {
			remainingMs.value = 0
			return
		}
		syncTimer()
		intervalId = window.setInterval(syncTimer, TIMER_TICK_MS)
	}

	watch(
		() => [assistantStore.expiresAt, assistantStore.isResponding] as const,
		startTimer,
	)

	onMounted(() => {
		startTimer()
		document.addEventListener('visibilitychange', syncTimer)
	})

	onBeforeUnmount(() => {
		stopTimer()
		document.removeEventListener('visibilitychange', syncTimer)
	})

	return { remainingMs, remainingLabel, syncTimer }
}
