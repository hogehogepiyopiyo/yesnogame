import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import { chatWithGameMaster } from "./gameBot.js";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

// public フォルダ内のファイルを静的配信（index.html など）
app.use(express.static("public"));

/**
 * 部屋ごとのチャットログ
 * roomId(=sessionId) -> [{ type: "user"|"gpt", name: "名前", text: "本文", kind?: "question"|"answer"|"free", timestamp: number }, ...]
 */
const roomLogs = new Map();

/**
 * 指定した部屋IDのログ配列を取得（なければ作る）
 */
function getRoomLog(roomId) {
  if (!roomLogs.has(roomId)) {
    roomLogs.set(roomId, []);
  }
  return roomLogs.get(roomId);
}

// チャット送信用API
app.post("/api/chat", async (req, res) => {
  try {
    const { sessionId, message, name, kind } = req.body;

    if (!message) {
      return res.status(400).json({ error: "message が必要です" });
    }

    // 部屋ID（セッションID）がない場合は仮のID
    const sid = sessionId || "default-room";
    const userName = name && String(name).trim() ? String(name).trim() : "名無し";

    // kind の正規化（question / answer / free）
    let msgKind;
    if (kind === "answer") {
      msgKind = "answer";
    } else if (kind === "free") {
      msgKind = "free";
    } else {
      msgKind = "question";
    }

    // この部屋のログを取得
    const logs = getRoomLog(sid);

    // 1. ユーザーの発言をログに追加
    logs.push({
      type: "user",
      name: userName,
      text: message,
      kind: msgKind,
      timestamp: Date.now(),
    });

    // 2. 「相談チャット」の場合は GPT には送らず、ここで終了
    if (msgKind === "free") {
      return res.json({ sessionId: sid });
    }

    // 3. GPTに問い合わせ（質問か解答かを渡す）
    const reply = await chatWithGameMaster(sid, message, msgKind);

    // 4. GPTの返答をログに追加
    logs.push({
      type: "gpt",
      name: "GPT",
      text: reply,
      timestamp: Date.now(),
    });

    // レスポンス（必要最低限）
    res.json({ reply, sessionId: sid });
  } catch (err) {
    console.error("サーバーでエラー発生:", err);
    res.status(500).json({ error: "サーバー側でエラーが発生しました。" });
  }
});

// 部屋ごとのチャットログを取得するAPI
app.get("/api/log", (req, res) => {
  const { sessionId } = req.query;
  const sid = sessionId || "default-room";
  const logs = getRoomLog(sid);

  res.json({
    sessionId: sid,
    messages: logs,
  });
});

// サーバー起動
app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
