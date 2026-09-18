<script setup lang="ts">
import { computed, ref, watch } from "vue"
import { useRoute, useRouter } from "vue-router"
import DocumentLifecycleTrail from "@/components/DocumentLifecycleTrail.vue"
import DocumentPreviewDrawer from "@/components/DocumentPreviewDrawer.vue"
import DocumentFileActions from "@/components/DocumentFileActions.vue"
import DocumentChunkEditor from "@/components/DocumentChunkEditor.vue"
import DocumentReprocessDialog from "@/components/DocumentReprocessDialog.vue"
import DocumentStrategyEditor from "@/components/DocumentStrategyEditor.vue"
import ConfirmDialog from "@/components/ConfirmDialog.vue"
import PageHeader from "@/components/PageHeader.vue"
import { useUnsavedChangesGuard } from "@/composables/useUnsavedChangesGuard"
import StatePanel from "@/components/StatePanel.vue"
import {
  workspaceDocuments,
  getWorkspaceVersions,
  addWorkspaceVersion,
  suggestVersion,
} from "@/mocks/documentWorkspace"
import {
  downloadFile,
  prepareVersionFiles,
  versionFiles,
} from "@/mocks/documentFiles"
import { getDocumentVersionDetail } from "@/mocks/documentDetails"
import { getDocumentGraphSummary } from "@/mocks/graphAdmin"
import {
  getDocumentProcessingRecord,
  enqueueDocumentProcessing,
  enqueueAttachmentProcessing,
  removeProcessingFile,
} from "@/mocks/documentProcessing"
import {
  getDirectoryGroupsSnapshot,
  getDirectoryUsersSnapshot,
  getDocumentCategoryGroupsSnapshot,
  getOrganizationUnitsSnapshot,
} from "@/repositories/admin.repository"
import {
  getDocumentSourceIcon,
  getDocumentSourceLabel,
} from "@/utils/documentSources"
import { COMPANY_KNOWLEDGE_SOURCES } from "@/utils/knowledgeSources"

const route = useRoute()
// @ 詳細頁只放圖譜摘要，完整的實體檢視與編輯留在圖譜管理頁
const GRAPH_ENTITY_PREVIEW = 8
const graphSummary = computed(() =>
  getDocumentGraphSummary(String(route.params.id)),
)
const document = computed(() =>
  workspaceDocuments.find((item) => item.id === String(route.params.id)),
)
const activeTab = ref("metadata")
const title = ref("")
const knowledgeTopicId = ref("policy")
const mainCategory = ref<string | null>(null)
const subCategory = ref<string | null>(null)
const department = ref<string | null>(null)
const tags = ref<string[]>([])
const visibility = ref<"全公司" | "指定群組" | "指定使用者" | "僅自己">(
  "全公司",
)
const selectedGroupIds = ref<string[]>([])
const selectedUserIds = ref<string[]>([])
const isSaved = ref(false)
const isVersionDialogOpen = ref(false)
const isPreviewOpen = ref(false)
const selectedVersionNumber = ref("")
const newVersion = ref("")
const newVersionNote = ref("")
const newVersionFile = ref<File | File[] | null>(null)
const versionError = ref("")
const versionBusy = ref(false)
const deleteAttachmentTarget = ref<File | null>(null)
const categoryGroups = getDocumentCategoryGroupsSnapshot()
const mainCategoryOptions = categoryGroups.map((group) => group.name)
const departmentOptions = getOrganizationUnitsSnapshot().map(
  (unit) => unit.name,
)
// @ 「全公司知識」是聚合來源，不能當成文件的歸屬主題。
const knowledgeTopicOptions = COMPANY_KNOWLEDGE_SOURCES.filter(
  (source) => source.id !== "company",
).map((source) => ({ title: source.name, value: source.id }))
const groupOptions = getDirectoryGroupsSnapshot().map((group) => ({
  title: group.name,
  value: group.id,
}))
const userOptions = getDirectoryUsersSnapshot().map((user) => ({
  title: `${user.name} · ${user.department}`,
  value: user.id,
}))
const subCategoryOptions = computed(
  () =>
    categoryGroups.find((group) => group.name === mainCategory.value)
      ?.subCategories ?? [],
)
const documentVersions = computed(() =>
  document.value ? getWorkspaceVersions(document.value) : [],
)
const selectedVersion = computed(
  () =>
    documentVersions.value.find(
      (entry) => entry.version === selectedVersionNumber.value,
    ) ?? documentVersions.value[0],
)
// @ 處理紀錄跟著頁首選的版本走；舊版本可能沒有處理紀錄
const processingRecord = computed(() =>
  document.value && selectedVersion.value
    ? getDocumentProcessingRecord(document.value.id, selectedVersion.value.version)
    : undefined,
)
// @ 全頁共用一個版本上下文：頁首選哪一版，主檔、附件、切塊與內容就都跟著那一版，不再各分頁各自出現版本選單。
const currentVersion = computed(
  () =>
    documentVersions.value.find((entry) => entry.isCurrent) ??
    documentVersions.value[0],
)
const selectedVersionFiles = computed(() =>
  document.value && selectedVersion.value
    ? versionFiles[document.value.id]?.[selectedVersion.value.version]
    : undefined,
)
const attachments = computed(
  () => selectedVersionFiles.value?.attachments ?? [],
)
const mainFile = computed(() => selectedVersionFiles.value?.file)
const mainFileName = computed(() => {
  const source = document.value?.source
  if (!source) return ""
  if (source.type === "file") return source.fileName
  if (source.type === "url") return source.url
  return "文字內容（無原始檔案）"
})
const suggestedVersion = computed(() => suggestVersion(documentVersions.value))
const versionFile = computed(() =>
  Array.isArray(newVersionFile.value)
    ? newVersionFile.value[0]
    : newVersionFile.value,
)
const canUploadVersion = computed(() =>
  Boolean(
    versionFile.value &&
    versionFile.value.size <= 50 * 1024 * 1024 &&
    newVersionNote.value.trim() &&
    /^\d+\.\d+(?:\.\d+)?$/.test(newVersion.value),
  ),
)
const canSave = computed(
  () =>
    Boolean(title.value.trim() && mainCategory.value?.trim()) &&
    (visibility.value !== "指定群組" || selectedGroupIds.value.length > 0) &&
    (visibility.value !== "指定使用者" || selectedUserIds.value.length > 0),
)

watch(
  () => route.params.id,
  () => {
    const item = document.value
    title.value = item?.title ?? ""
    knowledgeTopicId.value = item?.knowledgeSourceId ?? "policy"
    mainCategory.value = item?.category ?? null
    subCategory.value = item?.subCategory ?? null
    department.value = item?.department ?? null
    tags.value = [...(item?.tags ?? [])]
    visibility.value = item?.visibility ?? "全公司"
    selectedGroupIds.value = [...(item?.visibilityGroupIds ?? [])]
    selectedUserIds.value = [...(item?.visibilityUserIds ?? [])]
    selectedVersionNumber.value = ""
    isPreviewOpen.value = false
    isVersionDialogOpen.value = false
    deleteAttachmentTarget.value = null
    versionError.value = ""
    isSaved.value = false
  },
  { immediate: true },
)
watch(
  () => route.query.tab,
  (tab) => {
    activeTab.value =
      typeof tab === "string" &&
      [
        "metadata",
        "access",
        "attachments",
        "versions",
        "strategy",
        "processing",
        "chunks",
      ].includes(tab)
        ? tab
        : "metadata"
  },
  { immediate: true },
)
// NOTE: 分頁切換回寫網址，避免網址停在舊分頁，重整或分享連結時落點錯誤
const router = useRouter()
watch(activeTab, (tab) => {
  if (route.query.tab === tab) return
  void router.replace({ query: { ...route.query, tab } })
})
watch(mainCategory, (_next, previous) => {
  if (!subCategory.value) return
  const previousOptions =
    categoryGroups.find((group) => group.name === previous)?.subCategories ?? []
  if (
    previousOptions.includes(subCategory.value) &&
    !subCategoryOptions.value.includes(subCategory.value)
  )
    subCategory.value = null
})
watch(
  documentVersions,
  (versions) => {
    if (
      !versions.some((entry) => entry.version === selectedVersionNumber.value)
    )
      selectedVersionNumber.value = versions[0]?.version ?? ""
  },
  { immediate: true },
)
watch(isVersionDialogOpen, (open) => {
  if (!open) return
  newVersion.value = suggestedVersion.value
  newVersionNote.value = ""
  newVersionFile.value = null
  versionError.value = ""
})
/** 沒有原始檔案時，讓管理者仍能下載這一版的抽取文字。 */
function downloadMainText(): void {
  const target = document.value
  const version = selectedVersion.value
  if (!target || !version) return
  const detail = getDocumentVersionDetail({
    documentId: target.id,
    version: version.version,
    versionSummary: version.summary,
  })
  const content = detail.sections
    .map((section) => `${section.heading}\n${section.body}`)
    .join("\n\n")
  const body = `${target.title}\n第 ${version.version} 版\n\n${content}`
  downloadFile(
    new Blob([body], { type: "text/plain;charset=utf-8" }),
    `${target.title}-v${version.version}.txt`,
  )
}
function normalizeText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}
function saveChanges(): void {
  if (!document.value || !canSave.value) return
  Object.assign(document.value, {
    title: title.value.trim(),
    knowledgeSourceId: knowledgeTopicId.value,
    category: mainCategory.value,
    subCategory: subCategory.value ?? undefined,
    department: department.value ?? "",
    tags: [...tags.value],
    visibility: visibility.value,
    visibilityGroupIds:
      visibility.value === "指定群組" ? [...selectedGroupIds.value] : [],
    visibilityUserIds:
      visibility.value === "指定使用者" ? [...selectedUserIds.value] : [],
  })
  isSaved.value = true
}
function publishDocument(): void {
  if (document.value?.status !== "待審核") return
  document.value.status = "已發布"
  isSaved.value = true
}
async function uploadVersion(): Promise<void> {
  const target = document.value
  const file = versionFile.value
  if (!target || !file || !canUploadVersion.value || versionBusy.value) return
  versionBusy.value = true
  try {
    const source = {
      type: "file" as const,
      fileName: file.name,
      extension: file.name.split(".").pop() ?? "",
      mimeType: file.type,
    }
    const files = await prepareVersionFiles(source, file)
    addWorkspaceVersion(target, newVersion.value, newVersionNote.value, files)
    enqueueDocumentProcessing(target.id, newVersion.value, target.owner)
    selectedVersionNumber.value = newVersion.value
    activeTab.value = "versions"
    isVersionDialogOpen.value = false
  } catch (cause) {
    versionError.value =
      cause instanceof Error ? cause.message : "無法建立版本。"
  } finally {
    versionBusy.value = false
  }
}
function addAttachment(event: Event): void {
  if (!document.value || !selectedVersion.value) return
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  if (files.some((file) => file.size > 50 * 1024 * 1024)) {
    versionError.value = "附件單檔上限為 50 MB。"
    input.value = ""
    return
  }
  const id = document.value.id
  const version = selectedVersion.value.version
  versionFiles[id] ??= {}
  if (!versionFiles[id][version])
    versionFiles[id][version] = {
      source: document.value.source,
      attachments: [],
      sections: getDocumentVersionDetail({
        documentId: id,
        version,
        versionSummary: selectedVersion.value.summary,
      }).sections,
    }
  versionFiles[id][version].attachments.push(...files)
  enqueueAttachmentProcessing(
    id,
    version,
    files.map((file) => file.name),
    mainFileName.value,
  )
  versionError.value = ""
  input.value = ""
}
function confirmDeleteAttachment(): void {
  if (!deleteAttachmentTarget.value || !selectedVersionFiles.value) return
  if (document.value && selectedVersion.value)
    removeProcessingFile(
      document.value.id,
      selectedVersion.value.version,
      deleteAttachmentTarget.value.name,
    )
  selectedVersionFiles.value.attachments =
    selectedVersionFiles.value.attachments.filter(
      (file) => file !== deleteAttachmentTarget.value,
    )
  deleteAttachmentTarget.value = null
}

/** 取得附件在處理工作中的狀態；找不到代表這個附件不在目前版本的處理紀錄裡。 */
function getAttachmentState(name: string): string {
  const file = processingRecord.value?.files?.find(
    (item) => item.role === "附件" && item.name === name,
  )
  return file ? `處理${file.state === "已完成" ? "完成" : `：${file.state} · ${file.stage}`}` : ""
}

// > 處理進度分頁：重新處理與切塊入口
const isReprocessOpen = ref(false)
const reprocessScope = ref("all")
const processingMessage = ref("")
// @ 主文件用 undefined，附件用檔案代號；可由 ?file= 直接帶入
const chunkFileId = ref<string | undefined>()
watch(
  () => route.query.file,
  (file) => {
    chunkFileId.value = typeof file === "string" ? file : undefined
  },
  { immediate: true },
)

function openReprocess(scope = "all"): void {
  reprocessScope.value = scope
  isReprocessOpen.value = true
}

// @ 「有效版本」以文件目前生效的版本為準；新上傳但尚未核准的版本不算
const isEffectiveVersion = computed(
  () => selectedVersion.value?.version === document.value?.version,
)

/** 歷史版本沒有處理紀錄時，替這個版本建立一筆新的處理工作。 */
function createVersionJob(): void {
  const target = document.value
  const version = selectedVersion.value?.version
  if (!target || !version) return
  enqueueDocumentProcessing(target.id, version, target.owner)
  processingMessage.value = `已為第 ${version} 版建立處理工作，尚未執行後端處理。`
}

function viewChunks(fileId: string | undefined): void {
  const file = processingRecord.value?.files?.find((item) => item.id === fileId)
  chunkFileId.value = file?.role === "附件" ? file.id : undefined
  activeTab.value = "chunks"
}

// > 離開保護：切塊或處理策略尚未儲存
const chunkEditor = ref<InstanceType<typeof DocumentChunkEditor> | null>(null)
const strategyEditor = ref<InstanceType<typeof DocumentStrategyEditor> | null>(null)
const leaveGuard = useUnsavedChangesGuard(
  () => Boolean(chunkEditor.value?.isDirty || strategyEditor.value?.isDirty),
)
</script>

<template>
  <div v-if="document" class="page-shell">
    <VBreadcrumbs
      :items="[
        { title: '文件管理', to: '/admin/documents' },
        { title: document.title },
      ]"
      class="px-0"
    />
    <PageHeader
      eyebrow="內容生命週期"
      :title="document.title"
      :description="`目前版本 ${document.version} · ${document.department} · ${document.owner} 維護`"
    >
      <template #actions>
        <VBtn
          variant="outlined"
          prepend-icon="mdi-eye-outline"
          @click="isPreviewOpen = true"
          >預覽文件</VBtn
        >
        <VBtn color="primary" :disabled="!canSave" @click="saveChanges"
          >儲存變更</VBtn
        >
        <VBtn
          v-if="document.status === '待審核'"
          color="primary"
          @click="publishDocument"
          >核准並發布</VBtn
        >
      </template>
    </PageHeader>
    <VAlert type="info" variant="tonal" density="compact" class="mb-4"
      >變更僅保留於本次前端工作階段，重新整理後清除；處理服務尚未串接。</VAlert
    >
    <VAlert
      v-if="isSaved"
      type="success"
      variant="tonal"
      class="mb-4"
      role="status"
      >文件設定已更新。</VAlert
    >
    <VCard class="surface-border pa-5 mb-5"
      ><DocumentLifecycleTrail
        :status="document.status"
        :record="processingRecord"
        :show-steps="false"
    /></VCard>
    <VCard class="surface-border version-context mb-5">
      <div class="context-version">
        <VSelect
          :model-value="selectedVersionNumber"
          :items="documentVersions"
          item-title="version"
          item-value="version"
          :item-props="
            (item) => ({
              subtitle: `${item.date} · ${item.isCurrent ? '目前有效版本' : (item.status ?? '歷史版本')}`,
            })
          "
          label="檢視版本"
          density="comfortable"
          hide-details
          data-testid="version-context-select"
          @update:model-value="selectedVersionNumber = $event"
        >
          <template #selection="{ item }"
            >第 {{ item.raw.version }} 版</template
          >
        </VSelect>
        <VChip
          size="small"
          variant="tonal"
          :color="
            selectedVersion?.isCurrent
              ? 'success'
              : selectedVersion?.status === '等待處理'
                ? 'warning'
                : undefined
          "
        >
          {{
            selectedVersion?.isCurrent
              ? "目前有效版本"
              : (selectedVersion?.status ?? "歷史版本")
          }}
        </VChip>
        <VBtn
          v-if="!selectedVersion?.isCurrent"
          variant="text"
          size="small"
          @click="selectedVersionNumber = currentVersion?.version ?? ''"
          >回到目前版本</VBtn
        >
      </div>
      <VDivider vertical class="context-divider" />
      <div class="context-file">
        <span
          class="file-chip"
          :class="`kind-${document.source.type}`"
          aria-hidden="true"
        >
          <VIcon
            :icon="getDocumentSourceIcon(document.source.type)"
            size="20"
          />
        </span>
        <div class="file-text">
          <p class="file-name">{{ mainFileName }}</p>
          <p class="tab-note">
            {{ getDocumentSourceLabel(document.source.type) }}
            <template v-if="mainFile">
              · {{ Math.ceil(mainFile.size / 1024) }} KB</template
            >
            <template v-else-if="document.source.type === 'file'">
              · 這一版的原始檔案不在本次工作階段中</template
            >
          </p>
        </div>
        <div class="file-actions">
          <DocumentFileActions
            v-if="mainFile"
            :file="mainFile"
            label="主要文件"
          />
          <template v-else-if="document.source.type === 'file'">
            <VBtn
              variant="text"
              size="small"
              prepend-icon="mdi-eye-outline"
              @click="isPreviewOpen = true"
              >預覽內容</VBtn
            >
            <VBtn
              variant="text"
              size="small"
              prepend-icon="mdi-download-off-outline"
              disabled
              >原始檔案未保存</VBtn
            >
          </template>
          <template v-else>
            <VBtn
              variant="text"
              size="small"
              prepend-icon="mdi-eye-outline"
              @click="isPreviewOpen = true"
              >預覽內容</VBtn
            >
            <VBtn
              variant="text"
              size="small"
              prepend-icon="mdi-download"
              @click="downloadMainText"
              >下載文字</VBtn
            >
          </template>
        </div>
      </div>
    </VCard>
    <VTabs v-model="activeTab" color="primary" show-arrows class="mb-5">
      <VTab value="metadata">文件欄位</VTab><VTab value="access">存取控制</VTab
      ><VTab value="attachments">附件</VTab><VTab value="versions">版本</VTab
      ><VTab value="processing">處理進度</VTab
      ><VTab value="chunks">原文與切塊</VTab
      ><VTab value="strategy">處理策略</VTab>
    </VTabs>
    <VWindow v-model="activeTab">
      <VWindowItem value="metadata">
        <VCard class="surface-border pa-6">
          <VTextField
            v-model="title"
            label="文件標題"
            :error-messages="
              !title.trim() ? '請輸入方便同仁辨識的文件標題' : undefined
            "
          />
          <VRow>
            <VCol cols="12" md="4">
              <VSelect
                v-model="knowledgeTopicId"
                data-testid="detail-knowledge-topic"
                label="知識主題"
                :items="knowledgeTopicOptions"
                item-title="title"
                item-value="value"
                hint="決定這份文件會出現在哪個知識庫"
                persistent-hint
              />
            </VCol>
            <VCol cols="12" md="4">
              <VCombobox
                v-model="mainCategory"
                data-testid="detail-main-category"
                label="大類別"
                :items="mainCategoryOptions"
                clearable
                no-data-text="沒有相符的既有類別，可直接使用你輸入的內容"
                hint="可從清單挑選，或直接輸入新的大類別"
                persistent-hint
                :error-messages="
                  !mainCategory ? '請選擇或輸入大類別' : undefined
                "
                @update:model-value="mainCategory = normalizeText($event)"
              />
            </VCol>
            <VCol cols="12" md="4">
              <VCombobox
                v-model="subCategory"
                data-testid="detail-sub-category"
                label="小類別"
                :items="subCategoryOptions"
                clearable
                :no-data-text="
                  mainCategory
                    ? '沒有相符的既有類別，可直接使用你輸入的內容'
                    : '請先填寫大類別，或直接輸入小類別'
                "
                hint="可留空，也可直接輸入新的小類別"
                persistent-hint
                @update:model-value="subCategory = normalizeText($event)"
              />
            </VCol>
          </VRow>
          <VRow>
            <VCol cols="12" md="6">
              <VCombobox
                v-model="department"
                data-testid="detail-department"
                label="編制單位"
                :items="departmentOptions"
                clearable
                no-data-text="沒有相符的既有單位，可直接使用你輸入的內容"
                hint="可從清單挑選，或直接輸入未建檔的單位"
                persistent-hint
                @update:model-value="department = normalizeText($event)"
              />
            </VCol>
          </VRow>
          <VCombobox
            v-model="tags"
            label="標籤"
            multiple
            chips
            closable-chips
            hint="輸入後按 Enter 即可建立新標籤"
            persistent-hint
          />
          <p class="tab-note mt-4">
            目前版本為第
            {{
              document.version
            }}
            版；版本號由「版本」分頁上傳新檔案時遞增，不在此處編輯。
          </p>
        </VCard>
      </VWindowItem>
      <VWindowItem value="access"
        ><VCard class="surface-border pa-6">
          <VRadioGroup v-model="visibility" label="可見範圍"
            ><VRadio
              v-for="value in ['全公司', '指定群組', '指定使用者', '僅自己']"
              :key="value"
              :label="value"
              :value="value"
          /></VRadioGroup>
          <VAutocomplete
            v-if="visibility === '指定群組'"
            v-model="selectedGroupIds"
            label="可查看群組"
            :items="groupOptions"
            multiple
            chips
            closable-chips
            :error-messages="
              !selectedGroupIds.length ? '請至少選擇一個群組' : undefined
            "
          />
          <VAutocomplete
            v-if="visibility === '指定使用者'"
            v-model="selectedUserIds"
            label="可查看使用者"
            :items="userOptions"
            multiple
            chips
            closable-chips
            :error-messages="
              !selectedUserIds.length ? '請至少選擇一位使用者' : undefined
            "
          />
          <p class="tab-note">
            可見範圍只在文件發布後生效；目前狀態為「{{ document.status }}」。
          </p>
        </VCard></VWindowItem
      >
      <VWindowItem value="attachments"
        ><VCard class="surface-border pa-6">
          <div class="section-head">
            <div>
              <h2 class="section-heading">附件</h2>
              <p class="tab-note">
                補充說明用的表單、簡報或圖片，屬於第
                {{
                  selectedVersion?.version
                }}
                版；切換頁首的檢視版本可查看其他版本的附件。
              </p>
            </div>
            <VSpacer />
            <span class="count-pill">{{ attachments.length }} 個檔案</span>
          </div>
          <label for="attachment-input" class="drop-zone">
            <VIcon
              icon="mdi-paperclip-plus"
              size="26"
              color="primary"
              aria-hidden="true"
            />
            <span class="drop-title">選擇或拖曳附件</span>
            <span class="tab-note">可多選，單檔上限 50 MB</span>
            <input
              id="attachment-input"
              class="visually-hidden"
              type="file"
              multiple
              aria-label="新增附件"
              @change="addAttachment"
            />
          </label>
          <VAlert
            v-if="versionError"
            type="error"
            variant="tonal"
            density="compact"
            class="mt-4"
            >{{ versionError }}</VAlert
          >
          <ul v-if="attachments.length" class="file-rows mt-4">
            <li
              v-for="(attachment, index) in attachments"
              :key="`${attachment.name}-${index}`"
              class="file-row"
            >
              <span class="file-chip" aria-hidden="true"
                ><VIcon icon="mdi-file-outline" size="18"
              /></span>
              <div class="file-text">
                <p class="file-name">{{ attachment.name }}</p>
                <p class="tab-note">
                  {{ Math.ceil(attachment.size / 1024) }} KB
                  <template v-if="getAttachmentState(attachment.name)">
                    · {{ getAttachmentState(attachment.name) }}</template
                  >
                </p>
              </div>
              <div class="file-actions">
                <DocumentFileActions :file="attachment" />
                <VBtn
                  icon="mdi-delete-outline"
                  variant="text"
                  size="small"
                  :aria-label="`刪除 ${attachment.name}`"
                  @click="deleteAttachmentTarget = attachment"
                />
              </div>
            </li>
          </ul>
          <p v-else class="empty-line mt-4">這一版沒有附件。</p>
        </VCard></VWindowItem
      >
      <VWindowItem value="versions"
        ><VCard class="surface-border pa-6">
          <div class="section-head">
            <div>
              <h2 class="section-heading">版本紀錄</h2>
              <p class="tab-note">
                最新的版本在最上面。處理與審核期間，前台仍顯示目前有效版本。
              </p>
            </div>
            <VSpacer />
            <VBtn
              color="primary"
              prepend-icon="mdi-upload"
              @click="isVersionDialogOpen = true"
              >上傳新版本</VBtn
            >
          </div>
          <ol class="version-rows">
            <li
              v-for="entry in documentVersions"
              :key="entry.version"
              class="version-row"
              :class="{
                'is-current': entry.isCurrent,
                'is-viewing': entry.version === selectedVersionNumber,
              }"
            >
              <div class="version-mark">
                <span class="version-number">{{ entry.version }}</span>
                <span class="version-date">{{ entry.date }}</span>
              </div>
              <div class="version-main">
                <div class="version-line">
                  <VChip
                    size="x-small"
                    variant="flat"
                    :color="
                      entry.isCurrent
                        ? 'success'
                        : entry.status === '等待處理'
                          ? 'warning'
                          : 'surface-variant'
                    "
                  >
                    {{
                      entry.isCurrent
                        ? "目前有效版本"
                        : (entry.status ?? "歷史版本")
                    }}
                  </VChip>
                  <span
                    v-if="entry.version === selectedVersionNumber"
                    class="viewing-tag"
                    >檢視中</span
                  >
                  <span class="tab-note">{{ entry.author }}</span>
                </div>
                <p class="version-summary">
                  {{ entry.summary || "（沒有版本說明）" }}
                </p>
                <ul v-if="entry.changes.length" class="version-changes">
                  <li v-for="change in entry.changes" :key="change">
                    {{ change }}
                  </li>
                </ul>
              </div>
              <div class="version-actions">
                <VBtn
                  :variant="
                    entry.version === selectedVersionNumber ? 'tonal' : 'text'
                  "
                  size="small"
                  prepend-icon="mdi-text-box-search-outline"
                  @click="selectedVersionNumber = entry.version"
                >
                  檢視這一版
                </VBtn>
                <DocumentFileActions
                  v-if="versionFiles[document.id]?.[entry.version]?.file"
                  :file="versionFiles[document.id][entry.version].file!"
                  :label="`第 ${entry.version} 版`"
                />
              </div>
            </li>
          </ol> </VCard
      ></VWindowItem>
      <VWindowItem value="processing"
        ><VCard class="surface-border pa-6">
          <p class="tab-note mb-3" data-testid="processing-version-context">
            目前查看第 {{ selectedVersion?.version }} 版的處理狀況（{{
              isEffectiveVersion ? "目前有效版本" : "非目前有效版本"
            }}）；切換頁首的檢視版本可查看其他版本。
          </p>
          <DocumentLifecycleTrail
            :status="document.status"
            :record="processingRecord"
            :show-stages="false"
            actionable
            @view-chunks="viewChunks"
            @reprocess-file="openReprocess"
          />
          <VAlert
            v-if="processingMessage"
            type="success"
            variant="tonal"
            closable
            class="mt-4"
            role="status"
            @click:close="processingMessage = ''"
            >{{ processingMessage }}</VAlert
          >
          <div class="d-flex flex-wrap ga-3 mt-4">
            <VBtn
              v-if="processingRecord"
              color="primary"
              variant="tonal"
              prepend-icon="mdi-restart"
              data-testid="detail-reprocess"
              @click="openReprocess()"
              >重新處理第 {{ selectedVersion?.version }} 版…</VBtn
            >
            <VBtn
              v-else
              color="primary"
              variant="tonal"
              prepend-icon="mdi-plus"
              data-testid="detail-create-job"
              @click="createVersionJob"
              >建立第 {{ selectedVersion?.version }} 版的處理工作</VBtn
            >
            <VBtn
              variant="text"
              :to="{
                path: '/admin/processing',
                query: { tab: 'all', documentId: document.id },
              }"
              >在文件處理頁查看</VBtn
            >
          </div>
          <DocumentReprocessDialog
            v-model="isReprocessOpen"
            :record="processingRecord"
            :title="document.title"
            :initial-scope="reprocessScope"
            @done="processingMessage = $event"
          />
        </VCard>
        <VCard class="surface-border pa-6 mt-4" data-testid="detail-graph-summary">
          <p class="text-subtitle-1 font-weight-medium mb-2">知識圖譜</p>
          <template v-if="graphSummary.entities.length">
            <p class="tab-note mb-3">
              這份文件抽出 {{ graphSummary.entities.length }} 個實體、{{
                graphSummary.relationCount
              }}
              條相關關係。
              <template v-if="graphSummary.pendingReviewCount">
                其中 {{ graphSummary.pendingReviewCount }}
                個實體有待覆核的合併建議。</template
              >
            </p>
            <div class="d-flex flex-wrap ga-2 mb-4">
              <VChip
                v-for="entity in graphSummary.entities.slice(0, GRAPH_ENTITY_PREVIEW)"
                :key="entity.id"
                size="small"
                variant="tonal"
                >{{ entity.label }}</VChip
              >
              <VChip
                v-if="graphSummary.entities.length > GRAPH_ENTITY_PREVIEW"
                size="small"
                variant="text"
                >還有 {{ graphSummary.entities.length - GRAPH_ENTITY_PREVIEW }} 個</VChip
              >
            </div>
          </template>
          <p v-else class="tab-note mb-3">
            尚未納入知識圖譜。文件處理完成後，下一次圖譜重建才會出現。
          </p>
          <VBtn
            variant="text"
            prepend-icon="mdi-graph-outline"
            :to="{
              path: '/admin/graph',
              query: { tab: 'entities', documentId: document.id },
            }"
            >在圖譜管理查看</VBtn
          >
        </VCard></VWindowItem
      >
      <VWindowItem value="chunks">
        <DocumentChunkEditor
          v-if="selectedVersion"
          ref="chunkEditor"
          v-model:file-id="chunkFileId"
          :document="document"
          :version="selectedVersion"
        />
      </VWindowItem>
      <VWindowItem value="strategy"
        ><VCard class="surface-border pa-6"
          ><DocumentStrategyEditor ref="strategyEditor" :document-id="document.id" /></VCard
      ></VWindowItem>
    </VWindow>
    <DocumentPreviewDrawer v-model="isPreviewOpen" :document-id="document.id" />
  </div>
  <div v-else class="page-shell">
    <StatePanel
      title="找不到這份文件"
      description="文件可能已移除，或工作階段已結束。"
      icon="mdi-file-alert-outline"
      action-label="返回文件管理"
      @action="$router.push('/admin/documents')"
    />
  </div>
  <VDialog
    v-model="isVersionDialogOpen"
    max-width="560"
    :persistent="versionBusy"
    ><VCard
      ><VCardTitle class="pa-6 pb-2">上傳新版本</VCardTitle
      ><VCardText class="pa-6 pt-2">
        <div class="dialog-field">
          <VFileInput
            v-model="newVersionFile"
            label="選擇主要檔案"
            hide-details="auto"
            :error-messages="
              versionFile && versionFile.size > 50 * 1024 * 1024
                ? '檔案超過 50 MB'
                : undefined
            "
          />
          <p class="field-hint">單檔上限 50 MB。</p>
        </div>
        <div class="dialog-field">
          <VTextField
            v-model="newVersion"
            label="新版本號"
            hide-details="auto"
          />
          <p class="field-hint">
            建議版本號 {{ suggestedVersion }}，可自行修改。
          </p>
        </div>
        <div class="dialog-field">
          <VTextarea
            v-model="newVersionNote"
            label="版本說明"
            rows="3"
            hide-details="auto"
          />
          <p class="field-hint">說明這一版改了什麼，會顯示在版本紀錄。</p>
        </div>
        <VAlert
          v-if="versionError"
          type="error"
          variant="tonal"
          density="compact"
          >{{ versionError }}</VAlert
        > </VCardText
      ><VCardActions class="pa-5"
        ><VSpacer /><VBtn
          :disabled="versionBusy"
          @click="isVersionDialogOpen = false"
          >取消</VBtn
        ><VBtn
          color="primary"
          :disabled="!canUploadVersion"
          :loading="versionBusy"
          @click="uploadVersion"
          >加入處理佇列</VBtn
        ></VCardActions
      ></VCard
    ></VDialog
  >
  <ConfirmDialog
    :model-value="Boolean(deleteAttachmentTarget)"
    title="刪除附件？"
    :description="`確定要刪除「${deleteAttachmentTarget?.name ?? ''}」嗎？`"
    @update:model-value="deleteAttachmentTarget = null"
    @confirm="confirmDeleteAttachment"
  />
  <ConfirmDialog
    :model-value="leaveGuard.isLeaveDialogOpen.value"
    title="有未儲存的修改"
    description="切塊或處理策略還沒有儲存，離開後會遺失。"
    cancel-label="留在這頁"
    confirm-label="放棄修改並離開"
    @update:model-value="leaveGuard.stay"
    @confirm="leaveGuard.confirmLeave"
  />
</template>
<style scoped>
.tab-note {
  color: var(--ink-muted);
  font-size: 0.82rem;
  line-height: 1.6;
}
.section-head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: var(--space-md);
  margin-bottom: var(--space-lg);
}
.count-pill {
  padding: 2px 10px;
  border-radius: 999px;
  background: rgb(var(--v-theme-on-surface) / 8%);
  color: var(--ink-muted);
  font-size: 0.76rem;
  font-weight: 600;
}

/* > 頁首版本上下文與主要文件 */
.version-context {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-lg);
  padding: var(--space-md) var(--space-lg);
}
.context-version {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-sm);
}
.context-version > :first-child {
  width: 220px;
}
.context-divider {
  align-self: stretch;
  margin-block: 4px;
}
.context-file {
  display: flex;
  min-width: 260px;
  flex: 1 1 320px;
  align-items: center;
  gap: var(--space-md);
}
.file-chip {
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  width: 38px;
  height: 38px;
  border-radius: var(--radius-sm);
  background: rgb(var(--v-theme-primary) / 10%);
  color: rgb(var(--v-theme-primary));
}
.file-text {
  min-width: 0;
  flex: 1 1 auto;
}
.file-name {
  font-weight: 600;
  font-size: 0.9rem;
  overflow-wrap: anywhere;
}
.file-actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 2px;
}

/* > 附件 */
.drop-zone {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: var(--space-xl);
  border: 1px dashed rgb(var(--v-theme-outline));
  border-radius: var(--radius-sm);
  cursor: pointer;
}
.drop-zone:hover {
  border-color: rgb(var(--v-theme-primary));
  background: rgb(var(--v-theme-primary) / 4%);
}
.drop-title {
  margin-top: 4px;
  font-weight: 700;
}
.file-rows {
  display: grid;
  gap: var(--space-sm);
  margin: 0;
  padding: 0;
  list-style: none;
}
.file-row {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding: var(--space-sm) var(--space-md);
  border: 1px solid rgb(var(--v-theme-outline));
  border-radius: var(--radius-sm);
}
.empty-line {
  padding: var(--space-lg);
  border: 1px dashed rgb(var(--v-theme-outline));
  border-radius: var(--radius-sm);
  color: var(--ink-muted);
  text-align: center;
}

/* > 版本紀錄 */
.version-rows {
  display: grid;
  gap: var(--space-sm);
  margin: 0;
  padding: 0;
  list-style: none;
}
.version-row {
  display: grid;
  grid-template-columns: 82px minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--space-md);
  padding: var(--space-md);
  border: 1px solid rgb(var(--v-theme-outline));
  border-radius: var(--radius-sm);
}
.version-row.is-viewing {
  border-color: rgb(var(--v-theme-primary));
  background: rgb(var(--v-theme-primary) / 5%);
}
.version-mark {
  display: grid;
  gap: 2px;
  text-align: center;
}
.version-number {
  font-size: 1.05rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.version-date {
  color: var(--ink-muted);
  font-size: 0.72rem;
  font-variant-numeric: tabular-nums;
}
.version-main {
  min-width: 0;
}
.version-line {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-sm);
}
.viewing-tag {
  color: rgb(var(--v-theme-primary));
  font-size: 0.74rem;
  font-weight: 700;
}
.version-summary {
  margin-top: 4px;
  font-size: 0.88rem;
  overflow-wrap: anywhere;
}
.version-changes {
  display: flex;
  flex-wrap: wrap;
  gap: 4px var(--space-md);
  margin: 6px 0 0;
  padding-left: 1.1rem;
  color: var(--ink-muted);
  font-size: 0.78rem;
}
.version-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 2px;
}

.dialog-field {
  margin-bottom: 20px;
}
.dialog-field:last-of-type {
  margin-bottom: 12px;
}
.field-hint {
  margin-top: 6px;
  color: var(--ink-muted);
  font-size: 0.78rem;
  line-height: 1.5;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@media (max-width: 700px) {
  .version-row {
    grid-template-columns: 1fr;
  }
  .version-mark {
    display: flex;
    align-items: baseline;
    gap: var(--space-sm);
    text-align: left;
  }
  .version-actions {
    justify-content: flex-start;
  }
  .context-divider {
    display: none;
  }
}
</style>
