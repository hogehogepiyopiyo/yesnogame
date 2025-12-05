import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import { chatWithGameMaster, MODEL } from "./gameBot.js";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

// public フォルダ内のファイルを静的配信（index.html など）
app.use(express.static("public"));

/**
 * 部屋ごとのチャットログ
 * roomId(=sessionId) -> [{ type: "user"|"ai", name: "名前", text: "本文", kind?: "question"|"answer"|"free", timestamp: number }, ...]
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


// 追加：現在利用中のモデル名を返すAPI
app.get("/api/model", (req, res) => {
  res.json({ model: MODEL });
});


// チャット送信用API
app.post("/api/chat", async (req, res) => {
  try {
    const { sessionId, message, name, kind } = req.body;

    if (!message) {
      return res.status(400).json({ error: "message が必要です" });
    }

    // 部屋ID（セッションID）がない場合は仮のID
    const sid = sessionId || "default-room";
    const userName =
      name && String(name).trim() ? String(name).trim() : "名無し";

    // kind を正規化："question" | "answer" | "free"
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

    // 1. ユーザーの発言をログに追加（相談チャットも同じログに積む）
    logs.push({
      type: "user",
      name: userName,
      text: message,
      kind: msgKind,          // ★ ここで kind を保存
      timestamp: Date.now(),
    });

    // 2. kind==="free" の場合は AI に送らずここで終了
    if (msgKind === "free") {
      // AI を呼ばないので reply は null で返す
      return res.json({ reply: null, sessionId: sid });
    }

    // 3. 質問/回答は AI へ問い合わせ
    const reply = await chatWithGameMaster(sid, message, msgKind);

    // 4. AIの返答をログに追加
    logs.push({
      type: "ai",
      name: "AI",
      text: reply,
      timestamp: Date.now(),
    });


    // レスポンス（必要最低限）
    res.json({ reply, sessionId: sid });
  } catch (err) {
    console.error("サーバーでエラー発生:", err);

    let statusCode = 500;
    let clientErrorCode = "server_error";
    let clientMessage = "サーバー側でエラーが発生しました。";

    if (err instanceof Error && err.message.includes("Rate limit reached")) {
      statusCode = 429;
      clientErrorCode = "rate_limit";
      clientMessage =
        "現在、外部AIサービスの利用上限に達しています。しばらく時間をおいてから再度お試しください。";
    }

    res.status(statusCode).json({
      error: clientErrorCode,
      message: clientMessage,
    });
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


