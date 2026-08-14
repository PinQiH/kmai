<script setup lang="ts">
interface ComponentProps {
	icon: string
	title: string
	description: string
	actionLabel?: string
}

defineProps<ComponentProps>()
defineEmits<{ action: [] }>()
</script>

<template>
	<div class="state-panel text-center pa-8" role="status">
		<VIcon :icon="icon" size="36" color="secondary" aria-hidden="true" />
		<h2 class="section-heading mt-4">{{ title }}</h2>
		<p class="text-medium-emphasis mt-2">{{ description }}</p>
		<VBtn v-if="actionLabel" class="mt-5" color="primary" variant="tonal" @click="$emit('action')">
			{{ actionLabel }}
		</VBtn>
	</div>
</template>

<style scoped>
.state-panel {
	border: 1px dashed rgb(var(--v-theme-outline));
	border-radius: 12px;
}
</style>
