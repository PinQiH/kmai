<script setup lang="ts">
import { computed, defineComponent, h, type PropType } from 'vue'

import { parseMarkdownBlocks, parseMarkdownInline } from '@/utils/markdown'

interface Props {
	content: string
	/** 標題層級起點，避免與頁面既有標題層級衝突；預設 # 對應 h3。 */
	headingOffset?: number
}

const props = withDefaults(defineProps<Props>(), { headingOffset: 2 })
const blocks = computed(() => parseMarkdownBlocks(props.content))

// - 行內片段一律以文字節點輸出，不經過 innerHTML
const InlineText = defineComponent({
	props: { text: { type: String as PropType<string>, required: true } },
	setup(inlineProps) {
		return () => parseMarkdownInline(inlineProps.text).map((part) => {
			if (part.type === 'strong') return h('strong', part.text)
			if (part.type === 'code') return h('code', part.text)
			if (part.type === 'link') return h('a', { href: part.href, target: '_blank', rel: 'noopener noreferrer' }, part.text)
			return part.text
		})
	},
})
</script>

<template>
	<div class="markdown-content">
		<template v-for="(block, index) in blocks" :key="`${block.type}-${index}`">
			<component :is="`h${Math.min(block.level + headingOffset, 6)}`" v-if="block.type === 'heading'" class="md-heading" :class="`md-h${block.level}`"><InlineText :text="block.text" /></component>
			<blockquote v-else-if="block.type === 'quote'"><InlineText :text="block.text" /></blockquote>
			<pre v-else-if="block.type === 'code'"><code :data-language="block.language || undefined">{{ block.text }}</code></pre>
			<component :is="block.ordered ? 'ol' : 'ul'" v-else-if="block.type === 'list'">
				<li v-for="(item, itemIndex) in block.items" :key="itemIndex"><InlineText :text="item" /></li>
			</component>
			<p v-else><InlineText :text="block.text" /></p>
		</template>
	</div>
</template>

<style scoped>
.markdown-content { display: grid; gap: 12px; line-height: 1.75; max-width: 70ch; overflow-wrap: anywhere; }
.markdown-content :is(h3, h4, h5, h6, p, blockquote, ul, ol, pre) { margin: 0; }
.md-heading { font-weight: 700; line-height: 1.4; }
.md-h1 { font-size: 1.15rem; margin-top: 4px; }
.md-h2 { font-size: 1.05rem; margin-top: 4px; }
.md-h3 { font-size: 0.95rem; }
.markdown-content :is(ul, ol) { display: grid; gap: 4px; padding-left: 1.4rem; }
.markdown-content blockquote { padding-left: 12px; border-left: 1px solid rgb(var(--v-theme-outline)); color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity)); white-space: pre-wrap; }
.markdown-content pre { padding: 12px; overflow-x: auto; border-radius: 8px; background: rgba(var(--v-theme-on-surface), 0.06); font-size: 0.85rem; line-height: 1.6; }
.markdown-content :deep(code) { font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace; font-size: 0.875em; }
.markdown-content :deep(p code), .markdown-content :deep(li code) { padding: 1px 5px; border-radius: 4px; background: rgba(var(--v-theme-on-surface), 0.06); }
.markdown-content :deep(a) { color: rgb(var(--v-theme-primary)); text-underline-offset: 3px; }
.markdown-content :deep(a:focus-visible) { outline: 2px solid rgb(var(--v-theme-primary)); outline-offset: 2px; border-radius: 2px; }
</style>
