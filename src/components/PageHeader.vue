<script setup lang="ts">
interface ComponentProps {
	eyebrow?: string
	title: string
	description?: string
}

defineProps<ComponentProps>()
</script>

<template>
	<header class="page-header mb-8">
		<div>
			<p v-if="eyebrow" class="eyebrow text-primary mb-2">{{ eyebrow }}</p>
			<h1 class="page-heading text-balance">{{ title }}</h1>
			<p v-if="description" class="text-medium-emphasis mt-3 reading-width">{{ description }}</p>
		</div>
		<div v-if="$slots.actions" class="page-header-actions">
			<slot name="actions" />
		</div>
	</header>
</template>

<style scoped>
.page-header {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: 24px;
}

.page-header-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

@media (max-width: 700px) {
	.page-header {
		flex-direction: column;
		gap: 20px;
		margin-bottom: 24px !important;
	}

	.page-header-actions {
		width: 100%;
	}

	.page-header-actions :deep(.v-btn) {
		flex: 1 1 auto;
	}
}
</style>
