<script setup lang="ts">
import { computed, ref, watch } from "vue"
import { useRoute, useRouter } from "vue-router"

import FilterSearchField from "@/components/FilterSearchField.vue"
import DocumentBatchReprocessDialog from "@/components/DocumentBatchReprocessDialog.vue"
import DocumentPreviewDrawer from "@/components/DocumentPreviewDrawer.vue"
import DocumentProcessingPanel from "@/components/DocumentProcessingPanel.vue"
import DocumentStrategyPanel from "@/components/DocumentStrategyPanel.vue"
import {
  fileTypeGroups,
  getFileTypeId,
  getFileTypeName,
} from "@/mocks/documentStrategies"
import { isDocumentProcessing } from "@/mocks/documentReprocess"
import { useProcessingJobs } from "@/composables/useProcessingJobs"
import PageHeader from "@/components/PageHeader.vue"
import StatePanel from "@/components/StatePanel.vue"
import { useAsyncData } from "@/composables/useAsyncData"
import {
  deleteAdminDocument,
  fetchAdminDocuments,
  getDocumentCategoryGroupsSnapshot,
  getOrganizationUnitsSnapshot,
  publishAdminDocuments,
} from "@/repositories/admin.repository"
import type { DocumentStatus, KnowledgeDocument } from "@/types"
import { getDocumentSourceIcon } from "@/utils/documentSources"
import {
  getDocumentLifecycle,
  getDocumentStatusPriority,
} from "@/utils/documentLifecycle"
import {
  COMPANY_KNOWLEDGE_SOURCES,
  getCompanyKnowledgeSourceById,
} from "@/utils/knowledgeSources"

/** 文件管理的三個視角：清單、需要處理的工作、處理策略。 */
type DocumentTab = "documents" | "attention" | "strategy"

type UploadedRangeKey =
  | "全部時間"
  | "最近 7 天"
  | "最近 30 天"
  | "最近 90 天"
  | "自訂範圍"

const ALL_STATUS = "全部狀態"
const ALL_CATEGORY = "全部大類別"
const ALL_SUB_CATEGORY = "全部小類別"
const ALL_DEPARTMENT = "全部單位"
const ALL_TOPIC = "全部知識主題"
const ALL_FILE_TYPE = "all"
const UNCLASSIFIED_FILE_TYPE = "unclassified"

// > 列表欄位：依上傳流程「檔案 → 分類 → 單位 → 狀態 → 時間」排列
const headers = [
  { title: "文件", key: "title", sortable: true },
  { title: "知識主題／分類", key: "category", sortable: true },
  { title: "編制單位", key: "department", sortable: true },
  { title: "狀態", key: "status", sortable: true },
  { title: "可見範圍", key: "visibility", sortable: true },
  { title: "更新時間", key: "updatedAt", sortable: true },
  { title: "操作", key: "actions", sortable: false, align: "end" as const },
]

const route = useRoute()
const router = useRouter()
const activeTab = ref<DocumentTab>("documents")
const search = ref<string | null>("")
const status = ref<DocumentStatus | typeof ALL_STATUS>(ALL_STATUS)
const mainCategory = ref<string>(ALL_CATEGORY)
const subCategory = ref<string>(ALL_SUB_CATEGORY)
const department = ref<string>(ALL_DEPARTMENT)
const knowledgeTopic = ref<string>(ALL_TOPIC)
const fileType = ref<string>(ALL_FILE_TYPE)
const isBatchReprocessOpen = ref(false)
const batchMessage = ref("")
const showProcessingLink = ref(false)
const uploadedRange = ref<UploadedRangeKey>("全部時間")
const uploadedFrom = ref("")
const uploadedTo = ref("")
const isFilterPanelOpen = ref(false)
const selected = ref<string[]>([])
const isDeleteDialogOpen = ref(false)
const isImportDialogOpen = ref(false)
const isPreviewOpen = ref(false)
const previewDocumentId = ref<string | null>(null)
const deleteTargetId = ref<string | null>(null)
const {
  data: managedDocuments,
  isLoading: isLoadingDocuments,
  errorMessage: documentsError,
  reload: reloadDocuments,
} = useAsyncData(fetchAdminDocuments, {
  initialValue: [] as KnowledgeDocument[],
  errorMessage: () => "目前無法載入文件清單，請稍後再試。",
})

const statusOptions: Array<DocumentStatus | typeof ALL_STATUS> = [
  ALL_STATUS,
  "失敗",
  "待審核",
  "處理中",
  "已發布",
  "已下架",
]
const categoryGroups = getDocumentCategoryGroupsSnapshot()
const mainCategoryOptions = [
  ALL_CATEGORY,
  ...categoryGroups.map((group) => group.name),
]
const departmentOptions = [
  ALL_DEPARTMENT,
  ...getOrganizationUnitsSnapshot().map((unit) => unit.name),
]
// @ 「全公司知識」是聚合來源不是單一主題，選項要排除它。
const knowledgeTopics = COMPANY_KNOWLEDGE_SOURCES.filter(
  (source) => source.id !== "company",
)
const knowledgeTopicOptions = [
  ALL_TOPIC,
  ...knowledgeTopics.map((source) => source.name),
]
// @ 檔案類型與「處理策略」的檔案類型層一致，改完某類型策略後可直接篩出來批次重跑
const fileTypeOptions = [
  { title: "全部檔案類型", value: ALL_FILE_TYPE },
  ...fileTypeGroups.map((group) => ({ title: group.name, value: group.id })),
  { title: "未分類（使用全域策略）", value: UNCLASSIFIED_FILE_TYPE },
]
const uploadedRangeOptions: UploadedRangeKey[] = [
  "全部時間",
  "最近 7 天",
  "最近 30 天",
  "最近 90 天",
  "自訂範圍",
]
const rangeDaysByKey: Partial<Record<UploadedRangeKey, number>> = {
  "最近 7 天": 7,
  "最近 30 天": 30,
  "最近 90 天": 90,
}

const subCategoryOptions = computed(() => {
  const groups =
    mainCategory.value === ALL_CATEGORY
      ? categoryGroups
      : categoryGroups.filter((group) => group.name === mainCategory.value)
  const subCategories = groups.flatMap((group) => group.subCategories)
  return [ALL_SUB_CATEGORY, ...Array.from(new Set(subCategories))]
})

// @ 舊的 /admin/processing?tab=all 轉導過來會是 tab=documents，tab=attention 則直接停在需要處理的工作上
const documentTabs: DocumentTab[] = ["documents", "attention", "strategy"]
watch(
  () => route.query.tab,
  (queryTab) => {
    const nextTab = documentTabs.find((item) => item === queryTab)
    if (nextTab) activeTab.value = nextTab
  },
  { immediate: true },
)

// @ 上傳完成頁與圖譜管理會帶 ?documentId=（可能多筆）過來，只看那幾份文件
const documentIds = computed(() => {
  const value = route.query.documentId
  return (Array.isArray(value) ? value : [value]).filter(
    (id): id is string => typeof id === "string" && Boolean(id),
  )
})
const documentIdFilters = computed(() =>
  documentIds.value.map((id) => ({
    id,
    title: managedDocuments.value.find((document) => document.id === id)?.title ?? id,
  })),
)

// @ 分頁標籤的紅色計數在任何分頁都要正確，所以在頁面層算，不等子元件掛載後回報
const { attentionJobs } = useProcessingJobs()
const attentionCount = computed(
  () =>
    attentionJobs.value.filter(
      (job) =>
        !documentIds.value.length || documentIds.value.includes(job.documentId),
    ).length,
)

// @ 讓網址反映目前分頁，重新整理或分享連結時才會停在同一個視角
watch(activeTab, (tab) => {
  if (route.query.tab !== tab) router.replace({ query: { ...route.query, tab } })
})

/** 從列表跳到「需要處理」分頁，並把範圍收斂到這份文件。 */
function openProcessingForDocument(documentId: string): void {
  activeTab.value = "attention"
  router.replace({ query: { ...route.query, tab: "attention", documentId } })
}

function clearDocumentIdFilter(documentId?: string): void {
  const remainingIds = documentId
    ? documentIds.value.filter((id) => id !== documentId)
    : []
  const nextDocumentId = remainingIds.length ? remainingIds : undefined
  router.replace({ query: { ...route.query, documentId: nextDocumentId } })
}

// @ 由管理總覽的「審核文件」帶入 ?status=待審核，讓列表預設就停在待處理的文件上
watch(
  () => route.query.status,
  (queryStatus) => {
    const nextStatus = statusOptions.find((option) => option === queryStatus)
    if (nextStatus) status.value = nextStatus
  },
  { immediate: true },
)

watch(
  () => route.query.fileType,
  (queryFileType) => {
    const option = fileTypeOptions.find((item) => item.value === queryFileType)
    if (option) {
      fileType.value = option.value
      isFilterPanelOpen.value = true
    }
  },
  { immediate: true },
)

function matchesFileType(document: KnowledgeDocument): boolean {
  if (fileType.value === ALL_FILE_TYPE) return true
  const documentFileType = getFileTypeId(document.source)
  return fileType.value === UNCLASSIFIED_FILE_TYPE
    ? !documentFileType
    : documentFileType === fileType.value
}

// @ 大類別改變後，原本選到的小類別可能不屬於它，必須退回「全部小類別」避免篩出空清單。
watch(mainCategory, () => {
  if (!subCategoryOptions.value.includes(subCategory.value))
    subCategory.value = ALL_SUB_CATEGORY
})

watch(uploadedRange, (nextRange) => {
  if (nextRange === "自訂範圍") return
  uploadedFrom.value = ""
  uploadedTo.value = ""
})

/** 依目前的上傳時間條件計算允許的起訖日（YYYY-MM-DD，含當日）。 */
const uploadedBounds = computed<{ from: string; to: string }>(() => {
  if (uploadedRange.value === "自訂範圍")
    return { from: uploadedFrom.value, to: uploadedTo.value }

  const days = rangeDaysByKey[uploadedRange.value]
  if (!days) return { from: "", to: "" }

  const startDate = new Date()
  startDate.setDate(startDate.getDate() - (days - 1))
  return { from: startDate.toISOString().slice(0, 10), to: "" }
})

function matchesUploadedRange(document: KnowledgeDocument): boolean {
  const { from, to } = uploadedBounds.value
  if (from && document.uploadedAt < from) return false
  if (to && document.uploadedAt > to) return false
  return true
}

const visibleDocuments = computed(() =>
  managedDocuments.value
    .filter((document) => {
      if (documentIds.value.length && !documentIds.value.includes(document.id))
        return false
      const keyword = (search.value ?? "").trim()
      const searchableText = `${document.title} ${document.department} ${document.category} ${document.subCategory ?? ""} ${document.owner} ${document.tags.join(" ")}`
      const matchesSearch = !keyword || searchableText.includes(keyword)
      const matchesStatus =
        status.value === ALL_STATUS || document.status === status.value
      const matchesMainCategory =
        mainCategory.value === ALL_CATEGORY ||
        document.category === mainCategory.value
      const matchesSubCategory =
        subCategory.value === ALL_SUB_CATEGORY ||
        document.subCategory === subCategory.value
      const matchesDepartment =
        department.value === ALL_DEPARTMENT ||
        document.department === department.value
      const matchesTopic =
        knowledgeTopic.value === ALL_TOPIC ||
        getKnowledgeTopicName(document) === knowledgeTopic.value
      return (
        matchesTopic &&
        matchesSearch &&
        matchesStatus &&
        matchesMainCategory &&
        matchesSubCategory &&
        matchesDepartment &&
        matchesFileType(document) &&
        matchesUploadedRange(document)
      )
    })
    // @ 預設順序即流程順序：卡住的（失敗、待審核）排前面，已完成與已下架排後面。
    .sort((left, right) => {
      const priorityGap =
        getDocumentStatusPriority(left.status) -
        getDocumentStatusPriority(right.status)
      return priorityGap !== 0
        ? priorityGap
        : right.uploadedAt.localeCompare(left.uploadedAt)
    }),
)

const activeFilters = computed(() => {
  const filters: Array<{ key: string; label: string; clear: () => void }> = []
  if ((search.value ?? "").trim())
    filters.push({
      key: "search",
      label: `關鍵字：${(search.value ?? "").trim()}`,
      clear: () => {
        search.value = ""
      },
    })
  if (status.value !== ALL_STATUS)
    filters.push({
      key: "status",
      label: `狀態：${status.value}`,
      clear: () => {
        status.value = ALL_STATUS
      },
    })
  if (mainCategory.value !== ALL_CATEGORY)
    filters.push({
      key: "main",
      label: `大類別：${mainCategory.value}`,
      clear: () => {
        mainCategory.value = ALL_CATEGORY
      },
    })
  if (subCategory.value !== ALL_SUB_CATEGORY)
    filters.push({
      key: "sub",
      label: `小類別：${subCategory.value}`,
      clear: () => {
        subCategory.value = ALL_SUB_CATEGORY
      },
    })
  if (knowledgeTopic.value !== ALL_TOPIC)
    filters.push({
      key: "topic",
      label: `知識主題：${knowledgeTopic.value}`,
      clear: () => {
        knowledgeTopic.value = ALL_TOPIC
      },
    })
  if (department.value !== ALL_DEPARTMENT)
    filters.push({
      key: "department",
      label: `編制單位：${department.value}`,
      clear: () => {
        department.value = ALL_DEPARTMENT
      },
    })
  if (fileType.value !== ALL_FILE_TYPE)
    filters.push({
      key: "fileType",
      label: `檔案類型：${fileType.value === UNCLASSIFIED_FILE_TYPE ? "未分類" : getFileTypeName(fileType.value)}`,
      clear: () => {
        fileType.value = ALL_FILE_TYPE
      },
    })
  if (uploadedRange.value !== "全部時間") {
    const customLabel = `${uploadedFrom.value || "不限"} 至 ${uploadedTo.value || "今天"}`
    filters.push({
      key: "uploaded",
      label: `上傳時間：${uploadedRange.value === "自訂範圍" ? customLabel : uploadedRange.value}`,
      clear: () => {
        uploadedRange.value = "全部時間"
      },
    })
  }
  return filters
})

const selectedDocuments = computed(() =>
  selected.value
    .map((documentId) =>
      managedDocuments.value.find((document) => document.id === documentId),
    )
    .filter((document): document is KnowledgeDocument => Boolean(document)),
)
// @ 只有「待審核」且目前沒有在重新處理的文件能核准；處理中就發布，使用者會看到不完整的內容
const pendingReviewSelection = computed(() =>
  selectedDocuments.value.filter((document) => document.status === "待審核"),
)
const reviewableSelection = computed(() =>
  pendingReviewSelection.value.filter(
    (document) => !isDocumentProcessing(document.id),
  ),
)
const approveHint = computed(() => {
  if (reviewableSelection.value.length) return ""
  if (pendingReviewSelection.value.length)
    return "選取的待審核文件正在重新處理，完成後才能核准"
  return "只有「待審核」的文件可以核准，選取中沒有待審核文件"
})

/** 取得文件所屬知識主題的名稱；找不到對應來源時回退為未指定。 */
function getKnowledgeTopicName(document: KnowledgeDocument): string {
  return (
    getCompanyKnowledgeSourceById(document.knowledgeSourceId)?.name ??
    "未指定主題"
  )
}

function openPreview(documentId: string): void {
  previewDocumentId.value = documentId
  isPreviewOpen.value = true
}

function clearAllFilters(): void {
  search.value = ""
  status.value = ALL_STATUS
  mainCategory.value = ALL_CATEGORY
  subCategory.value = ALL_SUB_CATEGORY
  department.value = ALL_DEPARTMENT
  knowledgeTopic.value = ALL_TOPIC
  fileType.value = ALL_FILE_TYPE
  uploadedRange.value = "全部時間"
  // @ 文件篩選是靠網址帶進來的，不一起清掉的話「清除全部條件」後空清單仍然是空的
  if (documentIds.value.length) clearDocumentIdFilter()
}

function openDeleteDialog(documentId: string): void {
  deleteTargetId.value = documentId
  isDeleteDialogOpen.value = true
}

async function confirmDelete(): Promise<void> {
  const documentId = deleteTargetId.value
  if (!documentId) return
  await deleteAdminDocument(documentId)
  selected.value = selected.value.filter((id) => id !== documentId)
  deleteTargetId.value = null
  isDeleteDialogOpen.value = false
  await reloadDocuments()
}

async function approveSelected(): Promise<void> {
  const approvableIds = reviewableSelection.value.map((document) => document.id)
  const skipped = pendingReviewSelection.value.length - approvableIds.length
  const approved = await publishAdminDocuments(approvableIds)
  await reloadDocuments()
  batchMessage.value = `已核准並發布 ${approved} 份文件${skipped ? `；${skipped} 份仍在重新處理，未核准` : ""}。`
  showProcessingLink.value = false
  selected.value = []
}
</script>

<template>
  <div class="page-shell">
    <PageHeader
      eyebrow="內容生命週期"
      title="文件管理"
      description="管理文件內容、版本與發布狀態，並處理失敗或停滯的處理工作。"
    >
      <template #actions
        ><VBtn
          variant="outlined"
          prepend-icon="mdi-file-excel-outline"
          @click="isImportDialogOpen = true"
          >Excel 欄位匯入</VBtn
        ><VBtn variant="outlined" prepend-icon="mdi-download-outline"
          >匯出 metadata</VBtn
        ><VBtn
          color="primary"
          prepend-icon="mdi-upload"
          to="/admin/documents/upload"
          >新增文件</VBtn
        ></template
      >
    </PageHeader>

    <VAlert
      v-if="batchMessage"
      type="success"
      variant="tonal"
      closable
      class="mb-5"
      role="status"
      @click:close="batchMessage = ''"
      >{{ batchMessage }}
      <VBtn
        v-if="showProcessingLink"
        variant="text"
        size="small"
        @click="activeTab = 'attention'"
        >查看需要處理的工作</VBtn
      ></VAlert
    >

    <!-- @ 分頁不用 VWindow：VWindow 預設 overflow hidden，會把篩選器的浮動 label 與 chip 裁掉 -->
    <VTabs v-model="activeTab" color="primary" class="mb-4">
      <VTab value="documents">全部文件</VTab>
      <VTab value="attention"
        >需要處理
        <VChip
          v-if="attentionCount"
          size="x-small"
          color="error"
          class="ml-2"
          >{{ attentionCount }}</VChip
        ></VTab
      >
      <VTab value="strategy">處理策略</VTab>
    </VTabs>

    <div
      v-if="documentIdFilters.length && activeTab !== 'strategy'"
      class="document-id-filters"
      aria-label="目前套用的文件篩選"
    >
      <span class="filter-count">目前篩選</span>
      <VChip
        v-for="filter in documentIdFilters"
        :key="filter.id"
        closable
        size="small"
        prepend-icon="mdi-file-document-outline"
        :data-testid="`document-id-filter-${filter.id}`"
        @click:close="clearDocumentIdFilter(filter.id)"
      >
        文件：{{ filter.title }}
      </VChip>
      <VBtn variant="text" size="small" @click="clearDocumentIdFilter()"
        >查看全部文件</VBtn
      >
    </div>

    <DocumentProcessingPanel
      v-if="activeTab === 'attention'"
      :search="search ?? ''"
      :document-ids="documentIds"
    />

    <DocumentStrategyPanel v-else-if="activeTab === 'strategy'" />

    <VCard v-else class="surface-border">
      <div class="filter-bar">
        <div class="filter-primary">
          <FilterSearchField
            v-model="search"
            label="搜尋標題、單位、擁有者或標籤"
            density="comfortable"
          />
          <VSelect
            v-model="status"
            :items="statusOptions"
            label="狀態"
            hide-details
            density="comfortable"
          />
          <VBtn
            variant="outlined"
            :prepend-icon="
              isFilterPanelOpen ? 'mdi-chevron-up' : 'mdi-tune-variant'
            "
            :aria-expanded="isFilterPanelOpen"
            aria-controls="document-advanced-filters"
            @click="isFilterPanelOpen = !isFilterPanelOpen"
          >
            更多條件
          </VBtn>
        </div>

        <VExpandTransition>
          <div
            v-show="isFilterPanelOpen"
            id="document-advanced-filters"
            class="filter-advanced"
          >
            <VSelect
              v-model="mainCategory"
              data-testid="filter-main-category"
              :items="mainCategoryOptions"
              label="大類別"
              hide-details
              density="comfortable"
            />
            <VSelect
              v-model="subCategory"
              data-testid="filter-sub-category"
              :items="subCategoryOptions"
              label="小類別"
              hide-details
              density="comfortable"
            />
            <VSelect
              v-model="knowledgeTopic"
              data-testid="filter-knowledge-topic"
              :items="knowledgeTopicOptions"
              label="知識主題"
              hide-details
              density="comfortable"
            />
            <VSelect
              v-model="department"
              data-testid="filter-department"
              :items="departmentOptions"
              label="編制單位"
              hide-details
              density="comfortable"
            />
            <VSelect
              v-model="fileType"
              data-testid="filter-file-type"
              :items="fileTypeOptions"
              label="檔案類型"
              hide-details
              density="comfortable"
            />
            <VSelect
              v-model="uploadedRange"
              data-testid="filter-uploaded-range"
              :items="uploadedRangeOptions"
              label="上傳時間"
              hide-details
              density="comfortable"
            />
            <template v-if="uploadedRange === '自訂範圍'">
              <VTextField
                v-model="uploadedFrom"
                data-testid="filter-uploaded-from"
                label="上傳起日"
                type="date"
                hide-details
                density="comfortable"
              />
              <VTextField
                v-model="uploadedTo"
                data-testid="filter-uploaded-to"
                label="上傳迄日"
                type="date"
                hide-details
                density="comfortable"
              />
            </template>
          </div>
        </VExpandTransition>

        <div v-if="activeFilters.length" class="filter-chips">
          <span class="filter-count"
            >篩出 {{ visibleDocuments.length }} /
            {{ managedDocuments.length }} 份</span
          >
          <VChip
            v-for="filter in activeFilters"
            :key="filter.key"
            size="small"
            variant="tonal"
            closable
            :aria-label="`移除條件 ${filter.label}`"
            @click:close="filter.clear()"
          >
            {{ filter.label }}
          </VChip>
          <VBtn variant="text" size="small" @click="clearAllFilters"
            >全部清除</VBtn
          >
        </div>

        <div v-if="selected.length" class="filter-batch" role="status">
          <span
            >已選取 {{ selected.length }} 份文件，其中
            {{ reviewableSelection.length }} 份可核准發布<template
              v-if="approveHint"
              >（{{ approveHint }}）</template
            >。</span
          >
          <VSpacer />
          <VBtn variant="text" size="small" @click="selected = []"
            >取消選取</VBtn
          >
          <VBtn
            variant="tonal"
            size="small"
            prepend-icon="mdi-restart"
            data-testid="batch-reprocess"
            @click="isBatchReprocessOpen = true"
          >
            重新處理（{{ selected.length }}）
          </VBtn>
          <VBtn
            color="primary"
            variant="tonal"
            size="small"
            prepend-icon="mdi-check-all"
            :disabled="reviewableSelection.length === 0"
            @click="approveSelected"
          >
            核准並發布（{{ reviewableSelection.length }}）
          </VBtn>
        </div>
      </div>

      <VDivider />

      <StatePanel
        v-if="documentsError"
        class="ma-5"
        icon="mdi-cloud-alert-outline"
        title="無法載入文件清單"
        :description="documentsError"
        action-label="重新載入"
        @action="reloadDocuments"
      />
      <VSkeletonLoader
        v-else-if="isLoadingDocuments"
        type="table-heading, table-row@6"
        class="ma-5"
      />
      <StatePanel
        v-else-if="visibleDocuments.length === 0"
        class="ma-5"
        icon="mdi-file-search-outline"
        title="找不到符合條件的文件"
        description="請調整關鍵字、分類、單位或上傳時間，或清除全部條件重新查看。"
        action-label="清除全部條件"
        @action="clearAllFilters"
      />
      <div
        v-else
        class="document-table-wrap"
        tabindex="0"
        aria-label="文件列表，可水平捲動"
      >
        <VDataTable
          v-model="selected"
          :headers="headers"
          :items="visibleDocuments"
          item-value="id"
          show-select
          select-strategy="all"
          hover
        >
          <template #item.title="{ item }">
            <div class="cell-document">
              <VBtn
                variant="text"
                class="title-button"
                :aria-label="`預覽 ${item.title}`"
                @click="openPreview(item.id)"
                >{{ item.title }}</VBtn
              >
              <p class="cell-sub">
                <VIcon
                  :icon="getDocumentSourceIcon(item.source.type)"
                  size="14"
                  aria-hidden="true"
                />
                第 {{ item.version }} 版
              </p>
            </div>
          </template>
          <template #item.category="{ item }">
            <p class="cell-strong">{{ getKnowledgeTopicName(item) }}</p>
            <p class="cell-sub">
              {{ item.category
              }}<template v-if="item.subCategory">
                · {{ item.subCategory }}</template
              >
            </p>
          </template>
          <template #item.department="{ item }">
            <span class="cell-strong">{{ item.department }}</span>
          </template>
          <template #item.status="{ item }">
            <div class="cell-status">
              <span
                class="status-badge"
                :class="`tone-${getDocumentLifecycle(item.status).tone}`"
              >
                <VIcon
                  :icon="getDocumentLifecycle(item.status).icon"
                  size="15"
                  aria-hidden="true"
                />
                {{ item.status }}
              </span>
            </div>
          </template>
          <template #item.updatedAt="{ item }">
            <span class="cell-strong tabular">{{ item.updatedAt }}</span>
            <p class="cell-sub tabular">{{ item.uploadedAt }} 上傳</p>
          </template>
          <template #item.actions="{ item }">
            <div class="cell-actions">
              <VBtn
                color="primary"
                variant="tonal"
                size="small"
                prepend-icon="mdi-eye-outline"
                :aria-label="`預覽 ${item.title}`"
                @click="openPreview(item.id)"
                >預覽</VBtn
              >
              <VMenu location="bottom end">
                <template #activator="{ props: menuProps }">
                  <VBtn
                    v-bind="menuProps"
                    variant="text"
                    size="small"
                    icon="mdi-dots-vertical"
                    :aria-label="`開啟 ${item.title} 的更多操作`"
                  />
                </template>
                <VList density="compact">
                  <VListItem
                    :to="`/admin/documents/${item.id}/manage`"
                    title="管理文件"
                    prepend-icon="mdi-pencil-outline"
                  />
                  <!-- @ 只有卡在處理階段的文件才需要看處理工作；其餘分頁捷徑一律不放進列表選單。 -->
                  <VListItem
                    v-if="item.status === '處理中' || item.status === '失敗'"
                    title="查看處理工作"
                    prepend-icon="mdi-progress-clock"
                    @click="openProcessingForDocument(item.id)"
                  />
                  <VListItem
                    title="刪除文件"
                    prepend-icon="mdi-delete-outline"
                    base-color="error"
                    @click="openDeleteDialog(item.id)"
                  />
                </VList>
              </VMenu>
            </div>
          </template>
        </VDataTable>
      </div>
    </VCard>

    <DocumentBatchReprocessDialog
      v-model="isBatchReprocessOpen"
      :document-ids="selected"
      @done="
        (message) => {
          batchMessage = message
          showProcessingLink = true
          selected = []
        }
      "
    />
    <DocumentPreviewDrawer
      v-model="isPreviewOpen"
      :document-id="previewDocumentId"
    />

    <VDialog v-model="isDeleteDialogOpen" max-width="460">
      <VCard
        ><VCardTitle>永久刪除文件？</VCardTitle
        ><VCardText
          >刪除後無法復原，相關版本、附件與引用也會失效。若只是暫時不公開，請改用下架。</VCardText
        ><VCardActions
          ><VSpacer /><VBtn @click="isDeleteDialogOpen = false">取消</VBtn
          ><VBtn color="error" @click="confirmDelete"
            >永久刪除</VBtn
          ></VCardActions
        ></VCard
      >
    </VDialog>
    <VDialog v-model="isImportDialogOpen" max-width="560"
      ><VCard
        ><VCardTitle class="pa-6 pb-2">Excel 文件欄位匯入</VCardTitle
        ><VCardText class="pa-6 pt-2"
          ><p class="text-body-2 text-medium-emphasis mb-4">
            上傳 Excel 後將先預覽比對結果，不會直接覆蓋現有欄位。
          </p>
          <VFileInput
            label="選擇 Excel 檔案"
            accept=".xls,.xlsx"
            prepend-icon="mdi-file-excel-outline"
          /><VAlert type="info" variant="tonal"
            >展示模式不會讀取或保存檔案內容。</VAlert
          ></VCardText
        ><VCardActions class="pa-5"
          ><VSpacer /><VBtn @click="isImportDialogOpen = false">取消</VBtn
          ><VBtn color="primary" @click="isImportDialogOpen = false"
            >預覽比對</VBtn
          ></VCardActions
        ></VCard
      ></VDialog
    >
  </div>
</template>

<style scoped>
.document-id-filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-xs);
  margin-bottom: var(--space-md);
}

.filter-bar {
  display: grid;
  gap: var(--space-md);
  padding: var(--space-md);
}

.filter-primary {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.filter-primary > :first-child {
  max-width: 420px;
}
.filter-primary > :nth-child(2) {
  max-width: 200px;
}

.filter-advanced {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: var(--space-sm);
  padding: var(--space-md);
  border: 1px solid rgb(var(--v-theme-outline));
  border-radius: var(--radius-sm);
  background: color-mix(
    in srgb,
    rgb(var(--v-theme-surface-variant)) 45%,
    rgb(var(--v-theme-surface))
  );
}

.filter-chips {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-xs) var(--space-sm);
}

.filter-count {
  color: var(--ink-muted);
  font-size: 0.8rem;
  font-variant-numeric: tabular-nums;
}

.filter-batch {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-sm);
  padding: 8px var(--space-md);
  border-radius: var(--radius-sm);
  background: rgb(var(--v-theme-primary) / 8%);
  font-size: 0.84rem;
}

.document-table-wrap {
  max-width: 100%;
  overflow-x: auto;
}
.document-table-wrap :deep(table) {
  min-width: 1040px;
}
.document-table-wrap :deep(td) {
  padding-block: 10px;
  vertical-align: top;
}

.cell-document {
  display: grid;
  gap: 2px;
  min-width: 240px;
}

.title-button {
  justify-content: flex-start;
  height: auto;
  min-height: 0;
  padding: 0;
  font-size: 0.92rem;
  font-weight: 700;
  letter-spacing: 0;
  text-transform: none;
}

.title-button :deep(.v-btn__overlay) {
  display: none;
}
.title-button:hover {
  color: rgb(var(--v-theme-primary));
  text-decoration: underline;
}

.cell-strong {
  font-size: 0.88rem;
  font-weight: 600;
}

.cell-sub {
  display: flex;
  align-items: center;
  gap: 4px;
  margin: 0;
  color: var(--ink-muted);
  font-size: 0.75rem;
}

.tabular {
  font-variant-numeric: tabular-nums;
}

.cell-status {
  display: flex;
  align-items: center;
}

.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  width: fit-content;
  padding: 3px 10px;
  border-radius: 999px;
  background: rgb(var(--v-theme-on-surface) / 8%);
  color: var(--ink-strong);
  font-size: 0.78rem;
  font-weight: 700;
  white-space: nowrap;
}

.status-badge.tone-success {
  background: rgb(var(--v-theme-success) / 14%);
  color: rgb(var(--v-theme-success));
}
.status-badge.tone-warning {
  background: rgb(var(--v-theme-warning) / 18%);
  color: rgb(var(--v-theme-warning));
}
.status-badge.tone-error {
  background: rgb(var(--v-theme-error) / 14%);
  color: rgb(var(--v-theme-error));
}
.status-badge.tone-info {
  background: rgb(var(--v-theme-primary) / 14%);
  color: rgb(var(--v-theme-primary));
}
.status-badge.tone-secondary {
  background: rgb(var(--v-theme-on-surface) / 9%);
  color: var(--ink-muted);
}

.cell-status :deep(.v-progress-linear) {
  max-width: 160px;
  margin-block: 4px;
}

.status-step,
.status-hint {
  color: var(--ink-muted);
  font-size: 0.74rem;
  line-height: 1.45;
}

.status-hint.is-error {
  color: rgb(var(--v-theme-error));
}

.cell-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
}

@media (max-width: 900px) {
  .filter-primary {
    align-items: stretch;
    flex-direction: column;
  }
  .filter-primary > * {
    max-width: none !important;
  }
}
</style>
