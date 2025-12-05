// === Google Gemini 用 gameBot.js（丸ごとコピペしてください） ===

import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();

// ===============================
// <think> 対策用クリーニング関数
// ===============================
/**
 * モデル出力から <think> に関する内容を除去する
 * - <think>〜</think> のペア → その部分を丸ごと削除
 * - </think> だけがある場合 → 最初の </think> 以降を切り捨て
 * - 最後に念のため <think> / </think> を文字だけ消す
 */
function stripThinkTags(rawText) {
  if (!rawText) return rawText;

  let text = rawText;

  // パターン1: <think>〜</think> がある場合 → 丸ごと削除
  const withPairRemoved = text.replace(/<think>[\s\S]*?<\/think>/g, "");
  if (withPairRemoved !== text) {
    text = withPairRemoved.trim();
  } else if (text.includes("</think>")) {
    // パターン2: </think> だけが生えているケース
    // 例: "不正解\nヒント: ...</think>ユーザーは〜</think>"
    const firstEndIndex = text.indexOf("</think>");
    if (firstEndIndex !== -1) {
      text = text.slice(0, firstEndIndex).trim();
    }
  }

  // 念のため、残っているタグもすべて削除
  text = text.replace(/<\/?think>/g, "").trim();

  return text;
}

// ===============================
// Gemini 初期化
// ===============================

// ★ ここで使うモデル名（必要に応じて "gemini-2.5-flash-lite" などに変更可）
export const MODEL = "gemini-2.5-flash";

// ★ GEMINI_API_KEY は .env に設定しておくこと
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("GEMINI_API_KEY is not set");
}

const genAI = new GoogleGenerativeAI(apiKey);
const model = genAI.getGenerativeModel({ model: MODEL });

// ★ ここがゲームのルール（SYSTEM_PROMPT：元ファイルと同じ）
const SYSTEM_PROMPT = String.raw`
# あなたの役割

あなたはマルチテーマ対応の yes/no クイズゲーム「Yes/No マルチテーママスター」です。
グループチャット内の複数ユーザーと、次のルールに従ってゲームを進行します。

重要: あなたは思考過程を外部に表示してはいけません。
<think> や </think> を含むテキストを出力してはいけません。
ユーザーに見せるべき最終的な回答のみを出力してください。

================================
■ ゲームの目的
================================
- プレイヤーは、あなたが秘密裏に選んだ「答え（テーマに応じた1つの名前）」を当てる。
- あなたは、毎ゲームごとに「テーマ」と「答え」を選び、ユーザーの質問に「はい / いいえ」で答えながら進行する。

================================
■ テーマの種類
================================
ゲーム開始時、プレイヤーは次の3つの「テーマ」から1つを選ぶ。

(1) 国連加盟国の国名
  - 解答候補: 国連加盟国193カ国のうち1つ。
  - 解答入力例: 「日本」「France」「United States of America」など。

(2) 日本のG1出走経験がある競走馬名
  - 対象: 日本の中央競馬（JRA）のG1競走に出走したことがある実在のサラブレッド競走馬。
  - 解答候補: そのようなG1出走経験のある馬の正式名称。
  - 解答入力例: 「ディープインパクト」「オグリキャップ」「ナリタブライアン」「ジェンティルドンナ」など。

(3) 日本の中央重賞出走経験がある競走馬名
  - 対象: 日本の中央競馬（JRA）の重賞競走（G1・G2・G3）に出走したことがある実在のサラブレッド競走馬。
  - 解答候補: そのような中央重賞出走経験のある馬の正式名称。
  - 解答入力例: 「メジロマックイーン」「サイレンススズカ」「カレンチャン」「ステイゴールド」など。

================================
■ テーマ選択のルール（重要）
================================
- 各ゲームで「まだテーマが決まっていない状態」のとき、プレイヤーが送ってくる最初のメッセージは、通常「1」「2」「3」などのテーマ番号である。
- あなたは、その番号からテーマを特定し、そのゲームのテーマを確定させる。
- この「テーマ番号」に対するあなたの返答は、「yes/no の回答」ではない。したがって、
  - 残りターン数を減らしてはいけない。
  - 「残りターン数: ～」や「回答: はい／いいえ」といった行を出力してはいけない。

- テーマ番号に対する最初の返答は、必ず次の2行だけにすること（余計な文を足してはいけない）：

  テーマは『[テーマ名]』ですね。
  はい/いいえで答えられる質問をしてください。

  例:
  「2」が送られてきた場合のあなたの返答は、次のようにする：

  テーマは『日本のG1出走経験がある競走馬名』ですね。
  はい/いいえで答えられる質問をしてください。

- 以降、プレイヤーからのメッセージが「質問」や「解答」であれば、後述のルールに従って処理する。

（※ 以下、元の SYSTEM_PROMPT と同じ内容をそのまま残す ※）

================================
■ 質問フェーズ（最大10ターン）
================================
（中略：ご提示のプロンプト全文。ここはそのままでOK）
`;

// ★ セッションごとに会話履歴を保存（サーバー起動中のみ保持する簡易版）
const sessions = new Map();

/**
 * OpenAI/Groq 風の messages 配列を
 * Gemini の contents 配列に変換するユーティリティ
 *
 * messages: [{ role: "user"|"assistant", content: string }, ...]
 */
function toGeminiContents(messages) {
  const contents = [];

  // ★ 毎回、先頭に SYSTEM_PROMPT を渡す（Gemini には system ロールがないため）
  contents.push({
    role: "user",
    parts: [{ text: SYSTEM_PROMPT }],
  });

  for (const m of messages) {
    if (!m || !m.role) continue;

    if (m.role === "user") {
      contents.push({
        role: "user",
        parts: [{ text: m.content ?? "" }],
      });
    } else if (m.role === "assistant") {
      contents.push({
        role: "model",
        parts: [{ text: m.content ?? "" }],
      });
    }
  }

  return contents;
}

/**
 * sessionId: 部屋ID（例: "room-abc123"）
 * userText: ユーザーからのメッセージ
 * kind: "question" | "answer"
 */
export async function chatWithGameMaster(
  sessionId,
  userText,
  kind = "question"
) {
  // --- 初回セットアップ ---
  if (!sessions.has(sessionId)) {
    const initialMessages = [];

    // 最初のユーザーメッセージ
    initialMessages.push({
      role: "user",
      content: "ゲームを開始してください。",
    });

    // Gemini 用の contents に変換して呼び出し
    const initContents = toGeminiContents(initialMessages);
    const initRes = await model.generateContent({ contents: initContents });

    const initRaw = initRes.response.text() || "";
    const cleanedInitContent = stripThinkTags(initRaw);

    const cleanedInitReply = {
      role: "assistant",
      content: cleanedInitContent,
    };

    initialMessages.push(cleanedInitReply);
    sessions.set(sessionId, initialMessages);
  }

  const messages = sessions.get(sessionId);

  // --- 質問か解答かでラベル付け ---
  let content = userText;
  if (kind === "answer") {
    content = `【解答】${userText}`;
  } else if (kind === "question") {
    content = `【質問】${userText}`;
  }

  messages.push({ role: "user", content });

  // --- Gemini 呼び出し ---
  const contents = toGeminiContents(messages);
  const res = await model.generateContent({ contents });

  const rawReply = res.response.text() || "";

  // ★ ここで必ず <think> を除去
  const cleanedContent = stripThinkTags(rawReply);

  const assistantMessage = {
    role: "assistant",
    content: cleanedContent,
  };

  // セッションに保存
  messages.push(assistantMessage);
  sessions.set(sessionId, messages);

  // ★ 呼び出し元には「cleanedContent」だけ返す
  return cleanedContent;
}
