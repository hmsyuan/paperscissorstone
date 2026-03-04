# 多人剪刀石頭布（Cloud Run 可部署）

這是一個純前端互動遊戲，透過 `server.mjs` 提供靜態檔服務，已可直接部署到 Google Cloud Run。

## 本機啟動

```bash
npm start
```

預設會啟在 `http://localhost:8080`。

## 部署到 Cloud Run

先確認已登入 gcloud 並設定專案：

```bash
gcloud auth login
gcloud config set project <YOUR_PROJECT_ID>
```

直接從原始碼部署：

```bash
gcloud run deploy rps-multiplayer \
  --source . \
  --region asia-east1 \
  --allow-unauthenticated
```

Cloud Run 會自動使用 `Dockerfile` 建置並啟動，服務會監聽 `PORT` 環境變數。
