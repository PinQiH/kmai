<script setup lang="ts">
interface ComponentProps {
	modelValue: string
	label?: string
	placeholder?: string
	autofocus?: boolean
	loading?: boolean
}

withDefaults(defineProps<ComponentProps>(), {
	label: '搜尋公司知識',
	placeholder: '輸入文件、流程或問題',
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
				<VBtn type="submit" color="primary" size="small" :disabled="!modelValue.trim() || loading">搜尋</VBtn>
			</template>
		</VTextField>
	</form>
</template>

<style scoped>
.search-input :deep(.v-field) {
	border-radius: 14px;
	background: rgb(var(--v-theme-surface));
}
</style>
