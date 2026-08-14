# 實作交接

## Mock 資料與 API 串接待辦

目前前端以記憶體 Mock 完成可操作流程。串接後端時依下列邊界替換，不要讓頁面直接呼叫 HTTP：

- `src/repositories/knowledge.repository.ts`：替換文件搜尋與文件詳情，保留員工端發布狀態與 ACL 防線。
- `src/stores/conversation.ts`：替換 AI 串流回答，保留 `try/finally`、引用資料與錯誤狀態。
- `src/views/LoginView.vue`、`ChangePasswordView.vue`：串接登入與首次密碼變更，從 API 回傳建立使用者角色。
- `src/views/AccountView.vue`：串接個人資料與問題回報。
- `src/views/admin/AdminUploadView.vue`：串接單筆／批次上傳與逐檔處理結果。
- `src/mocks/data.ts`：API 全面接妥後移除 Mock 文件、健康度與活動資料。

## 安全邊界

- API Key、Token 與密碼不得保存於前端 store、localStorage、Mock 或 log。
- 員工端文件 ACL 必須由後端再次執行；前端過濾只用於介面防呆，不是安全邊界。
- 破壞性管理操作需由後端再次驗證權限並保留稽核紀錄。

## 後續測試

- 後端接妥後新增 API contract tests 與錯誤狀態測試。
- 瀏覽器執行環境可用後，補 Playwright：登入、搜尋到問答、引用焦點、文件上傳、刪除確認與 375px responsive smoke tests。
