# Kmai Frontend

## GitHub Pages

推送至 `main` 分支後，GitHub Actions 會自動建置並部署至：

`https://pinqih.github.io/kmai/`

首次部署前，請在 GitHub repository 的 `Settings > Pages` 將 `Source` 設為 `GitHub Actions`。專案使用 Hash Router，直接重新整理內頁時不需要額外的伺服器 rewrite 設定。

供全公司員工使用的 AI 知識管理前端展示。專案使用 Vue 3、TypeScript、Vuetify、Vue Router 與 Pinia，資料目前由 Mock repository 提供。

## 開發

```powershell
npm.cmd install
npm.cmd run dev
```

開啟終端機顯示的本機網址。展示帳號與密碼已預先填入登入頁，也可直接造訪首頁。

## 驗證

```powershell
npm.cmd run build
npm.cmd test
```

## 手動驗證重點

1. 從首頁搜尋「差旅」，確認可開啟搜尋結果與文件詳情。
2. 從搜尋結果按「用這些結果詢問 AI」，確認回答、引用抽屜與文件連結可操作。
3. 切換淺色／深色模式，確認主要文字、邊界與焦點仍清楚。
4. 進入管理工作區，測試文件篩選、批次選取、新增文件步驟與失敗工作重跑。
5. 將視窗縮小至 375px，確認導覽改為抽屜，核心內容沒有水平溢出。
6. 以管理者身分從前台點擊「管理後台」，確認側欄切換為管理功能；再點擊「返回員工前台」。

## Mock 邊界

- 資料變更只存在目前瀏覽器記憶體，重新整理後會還原。
- 文件上傳、AI 回答與處理工作均為前端模擬。
- 不會將表單資料、密碼或模型設定傳送至任何服務。
