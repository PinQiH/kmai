<script setup lang="ts">
import AnimatedNumber from '@/components/AnimatedNumber.vue'
import type { ThinkingStage } from '@/types'

interface ComponentProps {
	stages: ThinkingStage[]
	retrievedCount: number
}

defineProps<ComponentProps>()

function formatElapsed({ elapsedMs }: { elapsedMs: number }): string {
	return `${(elapsedMs / 1000).toFixed(1)}s`
}
</script>

<template>
	<div class="thinking-trace surface-border" role="status" aria-live="polite">
		<p class="trace-caption">Syscom Cubi 正在處理</p>
		<ol class="stage-list">
			<li
				v-for="(stage, index) in stages"
				:key="stage.id"
				class="stage rise-in"
				:class="`stage--${stage.status}`"
				:style="{ '--rise-index': index }"
			>
				<span class="stage-marker" aria-hidden="true" />
				<div class="stage-body">
					<p class="stage-label">{{ stage.label }}</p>
					<p class="stage-detail">
						<template v-if="stage.id === 'retrieve' && stage.status !== 'pending'">
							已比對 <AnimatedNumber :value="retrievedCount" :duration-ms="700" /> 份可存取文件
						</template>
						<template v-else>{{ stage.detail }}</template>
					</p>
				</div>
				<span v-if="stage.status === 'done'" class="stage-time mono">{{ formatElapsed({ elapsedMs: stage.elapsedMs }) }}</span>
			</li>
		</ol>
	</div>
</template>

<style scoped>
.thinking-trace {
	max-width: 640px;
	padding: var(--space-md);
	border-radius: var(--radius-lg);
	background: rgb(var(--v-theme-surface));
}

.trace-caption {
	margin-bottom: var(--space-md);
	color: var(--ink-muted);
	font-size: 0.72rem;
	font-weight: 700;
	letter-spacing: 0.06em;
}

.stage-list {
	display: grid;
	gap: var(--space-md);
	margin: 0;
	padding: 0;
	list-style: none;
}

.stage {
	position: relative;
	display: flex;
	align-items: flex-start;
	gap: 12px;
	--rise-distance: 6px;
	--rise-step: 60ms;
}

/* @ 以垂直線串起各階段，讓流程看起來是一條管線而非四則訊息 */
.stage:not(:last-child)::before {
	content: "";
	position: absolute;
	left: 8px;
	top: 22px;
	bottom: -16px;
	width: 1.5px;
	background: rgb(var(--v-theme-outline));
}

.stage-marker {
	position: relative;
	flex: 0 0 auto;
	width: 18px;
	height: 18px;
	margin-top: 2px;
	border-radius: 50%;
}

.stage--pending .stage-marker {
	border: 1.5px solid rgb(var(--v-theme-outline));
}

.stage--active .stage-marker {
	border: 1.5px solid rgba(var(--v-theme-primary), 0.24);
}

/* @ 進行中的外圈用 conic-gradient 旋轉，取代通用 spinner */
.stage--active .stage-marker::after {
	content: "";
	position: absolute;
	inset: -1.5px;
	border-radius: 50%;
	background: conic-gradient(from 0turn, transparent 0turn 0.55turn, rgb(var(--v-theme-primary)) 1turn);
	-webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 2px));
	mask: radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 2px));
	animation: marker-spin 900ms linear infinite;
}

.stage--done .stage-marker {
	background: rgb(var(--v-theme-primary));
}

.stage--done .stage-marker::after {
	content: "";
	position: absolute;
	left: 6px;
	top: 3px;
	width: 4px;
	height: 8px;
	border: solid rgb(var(--v-theme-surface));
	border-width: 0 1.8px 1.8px 0;
	transform: rotate(45deg);
}

@keyframes marker-spin {
	to {
		transform: rotate(1turn);
	}
}

.stage-body {
	min-width: 0;
	flex: 1 1 auto;
}

.stage-label {
	color: var(--ink-strong);
	font-size: 0.88rem;
	font-weight: 650;
}

.stage--pending .stage-label,
.stage--pending .stage-detail {
	color: var(--ink-subtle);
}

/* @ 進行中的標籤做低幅度呼吸，讓等待有節奏而不刺眼 */
.stage--active .stage-label {
	color: rgb(var(--v-theme-primary));
	animation: stage-pulse 1.4s ease-in-out infinite;
}

.stage-detail {
	margin-top: 2px;
	color: var(--ink-muted);
	font-size: 0.8rem;
	line-height: 1.5;
}

@keyframes stage-pulse {
	0%,
	100% {
		opacity: 1;
	}

	50% {
		opacity: 0.55;
	}
}

.stage-time {
	flex: 0 0 auto;
	align-self: center;
	color: var(--ink-subtle);
	font-size: 0.72rem;
}
</style>
