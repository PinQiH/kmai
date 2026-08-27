<script setup lang="ts">
import { computed } from 'vue'

import { buildSparkline } from '@/utils/monitoring'

type SparklineTone = 'primary' | 'success' | 'warning' | 'error'

interface ComponentProps {
	values: number[]
	/** 給螢幕閱讀器的說明，圖形本身不重複標示數值。 */
	label: string
	tone?: SparklineTone
	height?: number
}

const props = withDefaults(defineProps<ComponentProps>(), { tone: 'primary', height: 44 })

// @ viewBox 寬度固定，實際寬度交給 CSS 拉伸；線寬以 non-scaling-stroke 維持一致
const VIEW_WIDTH = 240

const geometry = computed(() => buildSparkline(props.values, VIEW_WIDTH, props.height))

// @ 端點圓點改用 CSS 定位：SVG 被水平拉伸，畫在 SVG 內的圓會變成橢圓
const lastPointOffset = computed(() => {
	const point = geometry.value.lastPoint
	return point ? `${(point.y / props.height) * 100}%` : '50%'
})
</script>

<template>
	<div
		class="sparkline"
		:style="{ '--spark-color': `rgb(var(--v-theme-${tone}))`, '--spark-height': `${height}px` }"
	>
		<svg
			:viewBox="`0 0 ${VIEW_WIDTH} ${height}`"
			preserveAspectRatio="none"
			role="img"
			:aria-label="label"
			focusable="false"
		>
			<path v-if="geometry.areaPath" class="sparkline-area" :d="geometry.areaPath" />
			<path
				v-if="geometry.linePath"
				class="sparkline-line"
				:d="geometry.linePath"
				vector-effect="non-scaling-stroke"
			/>
		</svg>
		<span v-if="geometry.lastPoint" class="sparkline-dot" :style="{ top: lastPointOffset }" aria-hidden="true" />
	</div>
</template>

<style scoped>
.sparkline {
	position: relative;
	height: var(--spark-height);
}

.sparkline svg {
	display: block;
	width: 100%;
	height: 100%;
}

.sparkline-area {
	fill: var(--spark-color);
	fill-opacity: 0.1;
}

.sparkline-line {
	fill: none;
	stroke: var(--spark-color);
	stroke-width: 1.5;
	stroke-linecap: round;
	stroke-linejoin: round;
}

.sparkline-dot {
	position: absolute;
	right: 0;
	width: 6px;
	height: 6px;
	margin-top: -3px;
	border-radius: 50%;
	background: var(--spark-color);
}
</style>
