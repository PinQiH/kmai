<script setup lang="ts">
/*
 * > 列表篩選搜尋框
 * @ 管理頁與清單的即時篩選共用：固定放大鏡圖示、可清除、不佔提示列，清除時回傳空字串而非 null。
 *   送出型的全站搜尋請用 SearchInput。density、variant、class 等其他屬性直接傳給 VTextField。
 */
interface ComponentProps {
	modelValue: string | null | undefined
	label?: string
	placeholder?: string
	// @ 沒有可見 label 時才需要；省略則用 placeholder 補上，確保螢幕閱讀器讀得到用途
	ariaLabel?: string
}

const props = withDefaults(defineProps<ComponentProps>(), {
	label: undefined,
	placeholder: undefined,
	ariaLabel: undefined,
})

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
	<VTextField
		:model-value="props.modelValue ?? ''"
		:label="label"
		:placeholder="placeholder"
		:aria-label="ariaLabel ?? (label ? undefined : placeholder)"
		prepend-inner-icon="mdi-magnify"
		clearable
		hide-details
		@update:model-value="emit('update:modelValue', $event ?? '')"
	/>
</template>
