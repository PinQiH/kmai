<script setup lang="ts">
import { computed, ref } from 'vue'

import type { AssistantLauncherEdge, AssistantLauncherPosition } from '@/types'
import { clampAssistantPosition, snapAssistantPosition, type AssistantPositionOptions } from '@/utils/assistantPosition'

const DRAG_THRESHOLD_PX = 6

const props = defineProps<{
	position: AssistantLauncherPosition
	edge: AssistantLauncherEdge
	positionOptions?: AssistantPositionOptions
}>()

const emit = defineEmits<{
	toggle: []
	'position-change': [position: AssistantLauncherPosition, edge: AssistantLauncherEdge]
}>()

const launcherButton = ref<HTMLButtonElement>()
let activePointerId: number | null = null
let startPointer = { x: 0, y: 0 }
let startPosition = { x: 0, y: 0 }
let isDragging = false
let suppressNextClick = false

const launcherStyle = computed(() => ({
	transform: `translate3d(${props.position.x}px, ${props.position.y}px, 0)`,
}))

function viewport() {
	return { width: window.innerWidth, height: window.innerHeight }
}

function handlePointerDown(event: PointerEvent): void {
	if (event.pointerType === 'mouse' && event.button !== 0) return
	activePointerId = event.pointerId
	startPointer = { x: event.clientX, y: event.clientY }
	startPosition = { ...props.position }
	isDragging = false
	launcherButton.value?.setPointerCapture(event.pointerId)
}

function handlePointerMove(event: PointerEvent): void {
	if (activePointerId !== event.pointerId) return
	const deltaX = event.clientX - startPointer.x
	const deltaY = event.clientY - startPointer.y
	if (!isDragging && Math.hypot(deltaX, deltaY) < DRAG_THRESHOLD_PX) return

	isDragging = true
	const position = clampAssistantPosition(
		{ x: startPosition.x + deltaX, y: startPosition.y + deltaY },
		viewport(),
		props.positionOptions,
	)
	emit('position-change', position, position.x < window.innerWidth / 2 ? 'left' : 'right')
}

function finishPointer(event: PointerEvent): void {
	if (activePointerId !== event.pointerId) return
	launcherButton.value?.releasePointerCapture(event.pointerId)
	activePointerId = null
	if (!isDragging) return

	const snapped = snapAssistantPosition(props.position, viewport(), props.positionOptions)
	emit('position-change', snapped.position, snapped.edge)
	suppressNextClick = true
	isDragging = false
}

function handleClick(): void {
	if (suppressNextClick) {
		suppressNextClick = false
		return
	}
	emit('toggle')
}

function focus(): void {
	launcherButton.value?.focus()
}

defineExpose({ focus })
</script>

<template>
	<button
		ref="launcherButton"
		type="button"
		class="assistant-launcher"
		:class="`is-${edge}`"
		:style="launcherStyle"
		aria-label="開啟 AI 小幫手"
		data-testid="admin-assistant-launcher"
		@pointerdown="handlePointerDown"
		@pointermove="handlePointerMove"
		@pointerup="finishPointer"
		@pointercancel="finishPointer"
		@click="handleClick"
	>
		<VIcon icon="mdi-robot-happy-outline" size="30" aria-hidden="true" />
		<span class="assistant-presence" aria-hidden="true" />
	</button>
</template>

<style scoped>
.assistant-launcher {
	position: fixed;
	top: 0;
	left: 0;
	z-index: 2401;
	display: grid;
	place-items: center;
	width: 56px;
	height: 56px;
	padding: 0;
	touch-action: none;
	user-select: none;
	border: 2px solid rgb(var(--v-theme-surface));
	border-radius: 50%;
	background: linear-gradient(145deg, rgb(var(--v-theme-primary)), rgb(var(--v-theme-secondary)));
	box-shadow: 0 10px 28px rgb(0 0 0 / 24%);
	color: rgb(var(--v-theme-on-primary));
	cursor: grab;
}

.assistant-launcher:active {
	cursor: grabbing;
}

.assistant-launcher:focus-visible {
	outline: 3px solid rgb(var(--v-theme-primary));
	outline-offset: 3px;
}

.assistant-presence {
	position: absolute;
	right: 1px;
	bottom: 1px;
	width: 14px;
	height: 14px;
	border: 2px solid rgb(var(--v-theme-surface));
	border-radius: 50%;
	background: rgb(var(--v-theme-success));
}
</style>
