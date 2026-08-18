<script setup lang="ts">
interface ComponentProps {
	modelValue: string
	label?: string
	placeholder?: string
	submitLabel?: string
	autofocus?: boolean
	loading?: boolean
}

withDefaults(defineProps<ComponentProps>(), {
	label: '搜尋公司知識',
	placeholder: '輸入文件、流程或問題',
	submitLabel: '搜尋',
	autofocus: false,
	loading: false,
})

const emit = defineEmits<{
	'update:modelValue': [value: string]
	search: []
}>()
</script>

<template>
	<form class="search-input" role="search" @submit.prevent="emit('search')">
		<VTextField
			:model-value="modelValue"
			:label="label"
			:placeholder="placeholder"
			:autofocus="autofocus"
			:loading="loading"
			prepend-inner-icon="mdi-magnify"
			hide-details
			clearable
			@update:model-value="emit('update:modelValue', String($event ?? ''))"
		>
			<template #append-inner>
				<VBtn type="submit" color="primary" size="small" :disabled="!modelValue.trim() || loading">{{ submitLabel }}</VBtn>
			</template>
		</VTextField>
	</form>
</template>

<style scoped>
.search-input {
	position: relative;
	border-radius: 14px;
}

.search-input :deep(.v-field) {
	border-radius: 14px;
	background: rgb(var(--v-theme-surface));
}

/* @ 取得焦點時沿邊界掃描一次即結束，不做持續發光 */
.search-input::after {
	content: "";
	position: absolute;
	inset: -1px;
	z-index: 1;
	padding: 1.5px;
	border-radius: 15px;
	background: conic-gradient(from var(--sweep-angle, 0turn), transparent 0turn 0.62turn, rgb(var(--v-theme-primary)) 0.86turn, transparent 1turn);
	-webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
	mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
	-webkit-mask-composite: xor;
	mask-composite: exclude;
	opacity: 0;
	pointer-events: none;
}

.search-input:focus-within::after {
	animation: search-sweep 640ms var(--ease-out) 1;
}

@keyframes search-sweep {
	0% {
		opacity: 0;
		--sweep-angle: 0turn;
	}

	18% {
		opacity: 1;
	}

	78% {
		opacity: 1;
	}

	100% {
		opacity: 0;
		--sweep-angle: 1turn;
	}
}
</style>
