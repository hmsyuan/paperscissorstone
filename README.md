# 孤兒產生器（Cloud Run 可部署）

多遊戲版工具，包含：
- 剪刀石頭布
- 黑白猜
- 擲骰子比大小
- 五子棋
- 黑白棋
- 暗棋（簡化版）

功能：
- 先進入大廳選遊戲，可隨時退出當前遊戲改玩別的
- 每個遊戲有主持人與踢人機制
- 15 分鐘閒置自動斷線

## 本機啟動

```bash
npm start
```

## Cloud Run 部署

```bash
gcloud run deploy orphan-generator \
  --source . \
  --region asia-east1 \
  --allow-unauthenticated
```
