<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import EntityEgoGraph from '@/components/EntityEgoGraph.vue'
import { GRAPH_CLUSTERS_BY_KNOWLEDGE_SOURCE, GRAPH_NODE_TYPES, type GraphNodeType } from '@/repositories/graph.repository'
import { getEntity, getEntityRelations, revertEntityEdits, setEntityHidden, updateEntity } from '@/repositories/graph.repository'
import { workspaceDocuments } from '@/repositories/documents.repository'

interface ComponentProps {
	entityId: string | null
}

const props = defineProps<ComponentProps>()
const emit = defineEmits<{ close: []; select: [entityId: string]; saved: [message: string] }>()

const label = ref('')
const type = ref<GraphNodeType>('專有名詞')
const aliases = ref<string[]>([])
const formError = ref('')

const entity = computed(() => (props.entityId ? getEntity(props.entityId) : undefined))
const relations = computed(() => (entity.value ? getEntityRelations(entity.value.id) : []))
const documents = computed(() => (entity.value?.documentIds ?? []).map((id) => ({ id, document: workspaceDocuments.find((item) => item.id === id) })))
const mergedInto = computed(() => (entity.value?.mergedInto ? getEntity(entity.value.mergedInto) : undefined))
const isReadonly = computed(() => entity.value?.status === 'merged')
const isDirty = computed(() => Boolean(entity.value) && (label.value !== entity.value!.label || type.value !== entity.value!.type || aliases.value.join('\n') !== entity.value!.aliases.join('\n')))
// @ 前台圖譜只收錄原始節點（n- 開頭），擷取出的別名與孤立節點沒有位置可以聚焦
const frontLink = computed(() => {
	const current = entity.value
	if (!current || !current.id.startsWith('n-') || current.status !== 'active') return null
	const source = Object.entries(GRAPH_CLUSTERS_BY_KNOWLEDGE_SOURCE).find(([, clusters]) => clusters.includes(current.cluster))?.[0]
	return source ? { path: '/library', query: { source, view: 'graph', focus: current.id } } : null
})

watch(entity, (current) => {
	label.value = current?.label ?? ''
	type.value = current?.type ?? '專有名詞'
	aliases.value = [...(current?.aliases ?? [])]
	formError.value = ''
}, { immediate: true })

// @ 別名需去空白與去重，因此不用 v-model（見專案記憶的 combobox 正規化規則）
function updateAliases(value: string[]): void {
	aliases.value = [...new Set(value.map((alias) => alias.trim()).filter(Boolean))]
}

function save(): void {
	if (!entity.value) return
	formError.value = updateEntity(entity.value.id, { label: label.value, type: type.value, aliases: aliases.value })
	if (!formError.value) emit('saved', `已更新「${entity.value.label}」，並標記為人工修正，之後重建會保留。`)
}

function revertEdits(): void {
	if (!entity.value) return
	formError.value = revertEntityEdits(entity.value.id)
	if (!formError.value) emit('saved', `「${entity.value.label}」已還原為擷取結果，之後重建會以擷取結果為準。`)
}

function toggleHidden(): void {
	if (!entity.value) return
	const hide = entity.value.status !== 'hidden'
	setEntityHidden(entity.value.id, hide)
	emit('saved', hide ? `已隱藏「${entity.value.label}」，前台圖譜與問答擴充不再使用它。` : `已恢復「${entity.value.label}」。`)
}

// @ 供父層離開保護判斷
defineExpose({ isDirty })
</script>

<template>
	<VNavigationDrawer :model-value="Boolean(entity)" location="end" temporary width="460" class="entity-drawer" @update:model-value="!$event && emit('close')">
		<section v-if="entity" class="drawer-body" :aria-label="`實體「${entity.label}」`">
			<header class="drawer-head">
				<div>
					<p class="drawer-meta">{{ entity.type }} · {{ entity.cluster }}</p>
					<h2 class="section-heading">{{ entity.label }}</h2>
					<p class="drawer-meta">更新於 {{ entity.updatedAt }}</p>
				</div>
				<VBtn icon="mdi-close" variant="text" size="small" aria-label="關閉" @click="emit('close')" />
			</header>

			<VAlert v-if="isReadonly" type="info" variant="tonal" density="compact" class="mb-4">
				已在重建時合併至
				<button v-if="mergedInto" type="button" class="link-button" @click="emit('select', mergedInto.id)">{{ mergedInto.label }}</button>，
				名稱保留為別名，無法再編輯。
			</VAlert>
			<VAlert v-else-if="entity.status === 'hidden'" type="warning" variant="tonal" density="compact" class="mb-4">
				此實體已隱藏，不會出現在前台圖譜，也不會用於問答的圖譜擴充。
			</VAlert>

			<div v-if="entity.manuallyEdited && !isReadonly" class="confirm-strip" data-testid="entity-edited-strip">
				<div>
					<strong>人工修正</strong>
					<span>擷取結果是「{{ entity.extracted.label }}」（{{ entity.extracted.type }}）；重建時保留你的修改。</span>
				</div>
				<VBtn variant="text" size="small" data-testid="entity-revert" @click="revertEdits">還原為擷取結果</VBtn>
			</div>

			<fieldset class="form-section" :disabled="isReadonly">
				<legend>基本資料</legend>
				<VTextField v-model="label" label="名稱" maxlength="40" counter data-testid="entity-label" />
				<VSelect v-model="type" :items="GRAPH_NODE_TYPES" label="類型" />
				<VCombobox :model-value="aliases" label="別名" multiple chips closable-chips placeholder="輸入後按 Enter" data-testid="entity-aliases" @update:model-value="updateAliases" />
				<p class="field-hint">問題裡出現別名時，也會連到這個實體。</p>
				<p v-if="formError" class="text-error text-body-2 mb-2" role="alert">{{ formError }}</p>
				<div class="form-actions">
					<VBtn variant="text" :disabled="!isDirty" @click="label = entity.label; type = entity.type; aliases = [...entity.aliases]; formError = ''">還原</VBtn>
					<VBtn color="primary" variant="flat" :disabled="!isDirty || isReadonly" data-testid="entity-save" @click="save">儲存</VBtn>
				</div>
			</fieldset>

			<section class="drawer-section">
				<h3>關係 <span>{{ relations.length }}</span></h3>
				<EntityEgoGraph v-if="!isReadonly" :center="entity" :relations="relations" @select="emit('select', $event)" />
				<p v-if="!relations.length"class="empty-note">沒有任何關係。孤立實體通常是擷取雜訊，可考慮隱藏或合併到既有實體。</p>
				<ul v-else class="relation-list">
					<li v-for="relation in relations" :key="`${relation.direction}-${relation.entity.id}-${relation.label}`">
						<span class="relation-label">{{ relation.direction === 'out' ? relation.label : `被${relation.label}` }}</span>
						<button type="button" class="link-button" @click="emit('select', relation.entity.id)">{{ relation.entity.label }}</button>
						<span class="relation-type">{{ relation.entity.type }}</span>
					</li>
				</ul>
			</section>

			<section class="drawer-section">
				<h3>來源文件 <span>{{ documents.length }}</span></h3>
				<ul class="relation-list">
					<li v-for="item in documents" :key="item.id">
						<RouterLink v-if="item.document" :to="`/admin/documents/${item.id}/manage`" class="link-button">{{ item.document.title }}</RouterLink>
						<span v-else class="empty-note">{{ item.id }}（文件已刪除）</span>
						<span v-if="item.document" class="relation-type">{{ item.document.version }} · {{ item.document.status }}</span>
					</li>
				</ul>
			</section>

			<footer class="drawer-foot">
				<VBtn v-if="frontLink" variant="text" prepend-icon="mdi-open-in-new" :to="frontLink">在前台圖譜查看</VBtn>
				<VSpacer />
				<VBtn v-if="!isReadonly" variant="outlined" :color="entity.status === 'hidden' ? undefined : 'error'" :prepend-icon="entity.status === 'hidden' ? 'mdi-eye-outline' : 'mdi-eye-off-outline'" data-testid="entity-toggle-hidden" @click="toggleHidden">
					{{ entity.status === 'hidden' ? '恢復顯示' : '隱藏實體' }}
				</VBtn>
			</footer>
		</section>
	</VNavigationDrawer>
</template>

<style scoped>
.drawer-body { display: grid; gap: var(--space-md); padding: var(--space-lg); }
.drawer-head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-sm); }
.drawer-meta { margin: 0; color: var(--ink-muted); font-size: 0.78rem; }
.confirm-strip { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-sm); padding: 10px 12px; border-radius: var(--radius-sm); background: rgb(var(--v-theme-on-surface) / 4%); font-size: 0.84rem; }
.confirm-strip div { display: grid; flex: 1 1 220px; gap: 2px; }
.confirm-strip span { color: var(--ink-muted); font-size: 0.8rem; }
.form-section { margin: 0; padding: 0; border: 0; }
.form-section legend, .drawer-section h3 { margin-bottom: var(--space-sm); font-size: 0.92rem; font-weight: 700; }
.drawer-section h3 span { color: var(--ink-muted); font-weight: 500; font-variant-numeric: tabular-nums; }
.field-hint { margin: -12px 0 var(--space-sm); color: var(--ink-muted); font-size: 0.76rem; }
.form-actions { display: flex; justify-content: flex-end; gap: var(--space-sm); }
.relation-list { display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; font-size: 0.86rem; }
.relation-list li { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px; }
.relation-label { min-width: 4.5em; color: var(--ink-muted); font-size: 0.8rem; }
.relation-type { color: var(--ink-muted); font-size: 0.76rem; }
.empty-note { margin: 0; color: var(--ink-muted); font-size: 0.84rem; }
.link-button { color: rgb(var(--v-theme-primary)); text-decoration: underline; text-underline-offset: 2px; }
.link-button:focus-visible { outline: 2px solid rgb(var(--v-theme-primary)); outline-offset: 2px; }
.drawer-foot { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-sm); padding-top: var(--space-md); border-top: 1px solid rgb(var(--v-theme-outline)); }
</style>
