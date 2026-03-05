# 孤兒產生器（Cloud Run 可部署）

這是一個可多人連線的網頁剪刀石頭布遊戲：
- 支援主持人設定回合模式（全員下一輪 / 只保留輸家 / 只保留贏家）
- 勝負結果以 😄 / 😢 表情快速提示
- 支援「先搶到主持權者為主持人」，主持人可主動踢除其他玩家，也可放棄主持權讓其他人重新搶
- 內建即時聊天室，可在遊戲旁邊同步聊天
- 後端 `server.mjs` 維護共用遊戲狀態（玩家、出拳、倒數、結果）
- 前端透過 `/api/state` 輪詢同步，因此不同裝置/分頁都會看到同一局

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

Cloud Run 會使用 `Dockerfile` 建置，容器啟動後監聽 `PORT`。
