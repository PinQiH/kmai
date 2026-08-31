<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

import AdminAssistantLauncher from '@/components/AdminAssistantLauncher.vue'
import AdminAssistantPanel from '@/components/AdminAssistantPanel.vue'
import { useAssistantIdleTimer } from '@/composables/useAssistantIdleTimer'
import { useAdminAssistantStore } from '@/stores/adminAssistant'
import { useNotebooksStore } from '@/stores/notebooks'
import type { AssistantLauncherEdge, AssistantLauncherPosition } from '@/types'
import { clampAssistantPosition, getDefaultAssistantPosition, type AssistantPositionOptions } from '@/utils/assistantPosition'
import { buildKnowledgeSourceOptions } from '@/utils/knowledgeSources'

const route = useRoute()
const assistantStore = useAdminAssistantStore()
const notebooksStore = useNotebooksStore()
const launcher = ref<InstanceType<typeof AdminAssistantLauncher>>()
const statusAnnouncement = ref('')
const positionOptions = ref<AssistantPositionOptions>({})
const { remainingLabel, syncTimer } = useAssistantIdleTimer()

const pageTitle = computed(() => String(route.meta.title ?? '管理後台'))
const sources = computed(() => buildKnowledgeSourceOptions(notebooksStore.notebooks))
const launcherPosition = computed(() => assistantStore.launcherPosition ?? getDefaultAssistantPosition(viewport(), positionOptions.value))

function viewport() {
	return { width: window.innerWidth, height: window.innerHeight }
}

function readSafeArea(): void {
	const probe = document.createElement('div')
	probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)'
	document.body.append(probe)
	const styles = window.getComputedStyle(probe)
	positionOptions.value = {
		safeArea: {
			top: Number.parseFloat(styles.paddingTop) || 0,
			right: Number.parseFloat(styles.paddingRight) || 0,
			bottom: Number.parseFloat(styles.paddingBottom) || 0,
			left: Number.parseFloat(styles.paddingLeft) || 0,
		},
	}
	probe.remove()
}

function handlePositionChange(position: AssistantLauncherPosition, edge: AssistantLauncherEdge): void {
	assistantStore.updateLauncherPosition(position, edge)
}

function constrainPosition(): void {
	readSafeArea()
	const position = assistantStore.launcherPosition ?? getDefaultAssistantPosition(viewport(), positionOptions.value)
	assistantStore.updateLauncherPosition(clampAssistantPosition(position, viewport(), positionOptions.value), assistantStore.launcherEdge)
	syncTimer()
}

function toggleAssistant(): void {
	if (assistantStore.isOpen) {
		minimizeAssistant()
		return
	}
	assistantStore.openAssistant()
}

async function minimizeAssistant(): Promise<void> {
	assistantStore.minimizeAssistant()
	await nextTick()
	launcher.value?.focus()
}

async function endSession(): Promise<void> {
	assistantStore.endSession('manual_end')
	await nextTick()
	launcher.value?.focus()
}

watch(
	() => assistantStore.isOpen,
	async (isOpen, wasOpen) => {
		if (isOpen || !wasOpen) return
		if (!assistantStore.activeSessionId) statusAnnouncement.value = 'AI 小幫手對話已結束，使用者畫面已清除。'
		await nextTick()
		launcher.value?.focus()
	},
)

onMounted(() => {
	readSafeArea()
	if (!assistantStore.launcherPosition) {
		assistantStore.updateLauncherPosition(getDefaultAssistantPosition(viewport(), positionOptions.value), 'right')
	}
	window.addEventListener('resize', constrainPosition)
})

onBeforeUnmount(() => {
	window.removeEventListener('resize', constrainPosition)
	assistantStore.endSession('leave_admin')
})
</script>

<template>
	<Teleport to="body">
		<div class="admin-assistant-widget">
			<p class="assistant-live-region" role="status" aria-live="polite">{{ statusAnnouncement }}</p>
			<AdminAssistantPanel
				v-if="assistantStore.isOpen"
				class="assistant-panel-position"
				:page-title="pageTitle"
				:route-path="route.fullPath"
				:sources="sources"
				:remaining-label="remainingLabel"
				@minimize="minimizeAssistant"
				@end="endSession"
			/>
			<AdminAssistantLauncher
				v-if="!assistantStore.isOpen"
				ref="launcher"
				:position="launcherPosition"
				:edge="assistantStore.launcherEdge"
				:position-options="positionOptions"
				@toggle="toggleAssistant"
				@position-change="handlePositionChange"
			/>
		</div>
	</Teleport>
</template>

<style scoped>
.assistant-panel-position {
	position: fixed;
	top: 0;
	right: 0;
	bottom: 0;
	z-index: 2400;
}

.assistant-live-region {
	position: fixed;
	width: 1px;
	height: 1px;
	overflow: hidden;
	clip: rect(0 0 0 0);
	white-space: nowrap;
}

@media (max-width: 600px) {
	.assistant-panel-position {
		left: 0;
	}
}
</style>
