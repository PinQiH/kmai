<script setup lang="ts">
import type { DocumentVersionEntry } from '@/types'

interface ComponentProps {
	versions: DocumentVersionEntry[]
}

defineProps<ComponentProps>()
</script>

<template>
	<ol v-if="versions.length" class="version-timeline" aria-label="文件版本時間軸">
		<li v-for="version in versions" :key="`${version.version}-${version.date}`" class="version-entry">
			<div class="timeline-rail" aria-hidden="true">
				<span class="timeline-marker" :class="{ 'timeline-marker--current': version.isCurrent }" />
			</div>
			<article class="version-content">
				<div class="version-heading">
					<div class="d-flex flex-wrap align-center ga-2">
						<h3>第 {{ version.version }} 版</h3>
						<VChip v-if="version.isCurrent || version.status" :color="version.isCurrent ? 'primary' : undefined" variant="tonal" size="x-small">
							{{ version.status ?? '目前版本' }}
						</VChip>
					</div>
					<div class="version-meta">
						<time :datetime="version.date">{{ version.date }}</time>
						<span aria-hidden="true">·</span>
						<span>{{ version.author }}</span>
					</div>
				</div>
				<p class="version-summary">{{ version.summary }}</p>
				<ul v-if="version.changes.length" class="version-changes" aria-label="本版更新內容">
					<li v-for="change in version.changes" :key="change">{{ change }}</li>
				</ul>
			</article>
		</li>
	</ol>
	<p v-else class="version-empty" role="status">尚無版本紀錄。</p>
</template>

<style scoped>
.version-timeline {
	margin: 0;
	padding: 0;
	list-style: none;
}

.version-entry {
	display: grid;
	grid-template-columns: 24px minmax(0, 1fr);
	gap: var(--space-md);
}

.timeline-rail {
	position: relative;
	display: flex;
	justify-content: center;
}

.timeline-rail::after {
	position: absolute;
	top: 18px;
	bottom: 0;
	width: 1px;
	background: rgb(var(--v-theme-outline));
	content: '';
}

.version-entry:last-child .timeline-rail::after {
	display: none;
}

.timeline-marker {
	position: relative;
	z-index: 1;
	width: 12px;
	height: 12px;
	margin-top: 5px;
	border: 2px solid rgb(var(--v-theme-outline));
	border-radius: 50%;
	background: rgb(var(--v-theme-surface));
}

.timeline-marker--current {
	border-color: rgb(var(--v-theme-primary));
	background: rgb(var(--v-theme-primary));
	box-shadow: 0 0 0 4px rgba(var(--v-theme-primary), 0.12);
}

.version-content {
	padding-bottom: var(--space-xl);
}

.version-heading {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: var(--space-md);
}

.version-heading h3 {
	font-size: 1rem;
	font-weight: 700;
}

.version-meta {
	display: flex;
	flex: 0 0 auto;
	align-items: center;
	gap: var(--space-xs);
	color: var(--ink-muted);
	font-size: 0.8rem;
}

.version-summary {
	max-width: var(--reading-max-width);
	margin-top: var(--space-sm);
	color: var(--ink-muted);
	line-height: 1.65;
}

.version-changes {
	display: grid;
	gap: var(--space-xs);
	margin-top: var(--space-sm);
	padding-left: 1.2rem;
	color: var(--ink-strong);
	font-size: 0.9rem;
	line-height: 1.6;
}

.version-empty {
	margin: 0;
	padding-block: var(--space-lg);
	color: var(--ink-muted);
	text-align: center;
}

@media (max-width: 600px) {
	.version-heading {
		flex-direction: column;
		gap: var(--space-xs);
	}
}
</style>
