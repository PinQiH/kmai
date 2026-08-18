<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

interface ComponentProps {
	value: number | string
	durationMs?: number
}

interface ParsedValue {
	numeric: number
	decimals: number
	prefix: string
	suffix: string
}

const props = withDefaults(defineProps<ComponentProps>(), { durationMs: 900 })

const displayNumber = ref(0)
let frameId = 0

// - 從顯示字串拆出數值與前後綴，例如 "97.8%" 會拆成 97.8 與 "%"
function parseValue({ raw }: { raw: number | string }): ParsedValue {
	if (typeof raw === 'number') return { numeric: raw, decimals: 0, prefix: '', suffix: '' }

	const match = raw.match(/^(\D*?)([\d,]+(?:\.\d+)?)(.*)$/)
	if (!match) return { numeric: Number.NaN, decimals: 0, prefix: raw, suffix: '' }

	const [, prefix, numberText, suffix] = match
	const normalized = numberText.replace(/,/g, '')
	const decimals = normalized.includes('.') ? (normalized.split('.')[1]?.length ?? 0) : 0
	return { numeric: Number(normalized), decimals, prefix, suffix }
}

const parsed = computed(() => parseValue({ raw: props.value }))
const isAnimatable = computed(() => Number.isFinite(parsed.value.numeric))

const formattedNumber = computed(() =>
	displayNumber.value.toLocaleString('zh-TW', {
		minimumFractionDigits: parsed.value.decimals,
		maximumFractionDigits: parsed.value.decimals,
	}),
)

// @ jsdom 與部分舊環境沒有 matchMedia，需先判斷再呼叫
function prefersReducedMotion(): boolean {
	return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

// - 以 requestAnimationFrame 從 0 遞增到目標值，尾段用 ease-out 收斂
function runCountUp({ target }: { target: number }): void {
	window.cancelAnimationFrame(frameId)

	if (!Number.isFinite(target)) return
	if (prefersReducedMotion() || props.durationMs <= 0) {
		displayNumber.value = target
		return
	}

	const startTime = performance.now()

	function step(now: number): void {
		const progress = Math.min((now - startTime) / props.durationMs, 1)
		const eased = 1 - Math.pow(1 - progress, 3)
		displayNumber.value = target * eased
		if (progress < 1) frameId = window.requestAnimationFrame(step)
		else displayNumber.value = target
	}

	frameId = window.requestAnimationFrame(step)
}

onMounted(() => runCountUp({ target: parsed.value.numeric }))

watch(() => parsed.value.numeric, (nextTarget) => runCountUp({ target: nextTarget }))

onBeforeUnmount(() => window.cancelAnimationFrame(frameId))
</script>

<template>
	<span class="animated-number mono">
		<template v-if="isAnimatable">{{ parsed.prefix }}{{ formattedNumber }}{{ parsed.suffix }}</template>
		<template v-else>{{ value }}</template>
	</span>
</template>
