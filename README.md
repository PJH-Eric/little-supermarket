# 小小超市

給 3–6 歲幼兒的平板優先教育小遊戲。孩子依照購物清單、分類或數數任務找商品、放入購物籃，再按下結帳；支援單人、小幫手三段難度，以及由伺服器判定的線上合作、觀戰、邀請連結和聊天室。

## 本機啟動

```powershell
npm ci
npm start
```

開啟 <http://localhost:3030>。若只要玩單機，也可以直接開 `public/index.html`；此時不會啟用線上模式。

## 伺服器設定

前端只從 `public/js/config.js` 取得連線位置。可以用以下方式設定：

1. 同源：Render server 同時服務 `public` 時會自動使用同源。
2. GitHub Pages：在 repository 的 Settings → Secrets and variables → Actions → Variables 只建立 `GAME_SERVER_URL`；Pages workflow 會在部署時注入，並由設定模組自動將 HTTPS 對應為 WSS。
3. 臨時切換：在 Pages 網址後加入 `?serverUrl=https%3A%2F%2Fyour-render-service.onrender.com`。正式頁面使用 HTTPS 時，`GAME_SERVER_URL` 請使用 HTTPS，WebSocket 會自動使用 WSS。

Render server 的環境變數請至少設定：

```text
GAME_ALLOWED_ORIGIN=https://YOUR_GITHUB_USER.github.io
```

本機可複製 `.env.example` 為 `.env` 後自行載入，或直接在 PowerShell 設定環境變數。`/health` 可用來檢查服務是否醒著，`/api/rooms` 可讀取公開房間摘要。

## GitHub Pages 自動部署

工作流程位於 `.github/workflows/pages.yml`，推送到 `main` 後會：

1. 安裝 lockfile 指定的依賴。
2. 讀取 repository variable `GAME_SERVER_URL`，產生不含秘密的 `public/runtime-config.js`；WebSocket URL 由同一個網址自動推導。
3. 上傳 `public` 為 Pages artifact 並部署。

第一次使用時，請在 GitHub repository 的 Settings → Pages → Build and deployment 將 Source 設為 **GitHub Actions**。GitHub Pages 與 Render 的正式網址、origin 和帳號授權仍需由專案擁有者在平台上設定。

## Render 部署

`render.yaml` 已提供 Node web service 的 build、start 和 `/health` 設定。將 repository 連到 Render Blueprint 後，確認 `GAME_ALLOWED_ORIGIN` 為 GitHub Pages 的 origin。Render 免費方案可能休眠、冷啟動並重啟；房間狀態是暫存記憶體，伺服器重啟後房間會清空，這是本遊戲刻意接受的免費層限制。

## 測試與驗證

```powershell
npm test
npm run build:pages
npm run verify
```

規則測試覆蓋合法／非法拿商品、清單完成、結帳、結算和固定 seed。線上測試會啟動本機 server，以兩個 WebSocket client 驗證建立房間、加入、準備、開始、伺服器權威購物、觀戰權限、聊天室消毒與 `/health`。

## 資產與隱私

商品和角色圖形是原始 SVG/CSS；短音效由 Web Audio API 產生，沒有外部圖片或音訊授權依賴。遊戲不要求註冊、不做永久排行榜；暱稱與偏好只存在使用者自己的瀏覽器 localStorage，聊天室與房間狀態只在暫存伺服器記憶體中存在。
