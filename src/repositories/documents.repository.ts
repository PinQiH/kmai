/*
 * > 文件工作區、版本檔案、處理進度、切塊與處理策略
 * @ 目前仍轉接 Mock 資料；view 與 component 一律從這裡取用，串接後端時只需改這一層。
 * TODO(api-integration): 對應 GET/POST /api/v2/admin/documents 與 /api/v2/admin/ingestion-jobs、/api/v2/admin/ingestion-strategies。
 */

export * from '@/mocks/documentWorkspace'
export * from '@/mocks/documentFiles'
export * from '@/mocks/documentDetails'
export * from '@/mocks/documentProcessing'
export * from '@/mocks/documentStrategies'
export * from '@/mocks/documentReprocess'
export * from '@/mocks/documentChunks'
export * from '@/mocks/documentContent'
