# 孤兒產生器（Cloud Run 可部署）

多遊戲大廳工具（含對戰 UI）：
- 剪刀石頭布（牌桌式出拳）
- 黑白猜（硬幣開獎）
- 擲骰子比大小（骰杯/骰面區）
- 五子棋（15x15 棋盤）
- 黑白棋（8x8 棋盤）
- 暗棋（4x8 棋盤，翻子/移動）

共同機制：
- 先在大廳設定暱稱再選遊戲，可隨時退出並切換
- 每款遊戲有主持人與踢人機制
- 每款遊戲有獨立聊天室
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
