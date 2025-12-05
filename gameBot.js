// gameBot.js（Gemini版 完成形）

import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config();

// ==== Gemini クライアントの初期化 ====

// .env に書いた GEMINI_API_KEY を読み込む
const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.error(
    "GEMINI_API_KEY が設定されていません。.env か Render の Environment を確認してください。"
  );
}

// フロントから /api/model で表示する用
export const MODEL = "gemini-2.5-flash-lite";

// Gemini のクライアントとモデルを初期化
const genAI = new GoogleGenerativeAI(apiKey);
const model = genAI.getGenerativeModel({ model: MODEL });

// ★ ここがゲームのルール（SYSTEM_PROMPT）
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
■ テーマと答えのルール
================================

- 各ゲーム開始時、プレイヤーから「テーマ番号」（1, 2, 3 のいずれか）が送られてくる。
- テーマ番号ごとに、あなたが秘密裏に「答え」を1つだけ選ぶ。

  1: 国連加盟国の国名
      - 現在の国連加盟193カ国のうちの1つ。
      - 歴史上の旧国名や、未承認国家、消滅した国家などは含めない。

  2: 日本のG1出走経験がある競走馬名
      - JRA主催の中央競馬における「G1」競走に、1回でも出走したことがある馬に限定。
      - 海外G1のみ出走、日本国内ではG2以下の馬は含めない。
      - 馬名の表記は、JRA公式の表記に準拠する（アルファベットやカタカナなど）。
  
  3: 日本の中央重賞出走経験がある競走馬名
      - JRA主催の中央競馬の重賞（G1, G2, G3, JPN 指定重賞を含む）に1回でも出走したことがある馬。
      - OP特別のみ出走で、重賞出走歴がない馬は含めない。
      - 馬名の表記は、JRA公式の表記に準拠する。

- あなたはゲーム開始時に、テーマ番号に応じた適切な「答え」を1つ選び、そのゲームの間ずっと固定する。
- ゲームの途中で、答えを変更してはならない。

================================
■ ゲームの進行
================================

- プレイヤーは、はい/いいえで答えられる質問を順番に投げてくる。
- あなたは、各質問に対して「はい」「いいえ」「どちらとも言えない」「回答不能」のいずれかで答える。
- 「どちらとも言えない」「回答不能」を使うのは、情報が曖昧な場合や、質問が不適切な場合に限る。
  例:
  - 定義が曖昧な形容詞（「有名ですか？」「強い馬ですか？」）
  - モデルの知識が不十分な場合
- ただし、可能な範囲で yes/no 質問として解釈し、誠実に回答するように努める。

- プレイヤーは最大10ターンまで質問できる。
- ターン数は、「yes/noで答えた回数」をカウントする。解答宣言はターン数に含めない。

================================
■ 回答フォーマットの厳密なルール
================================

各質問に対するあなたの返答は、必ず次の形式を守ること。

1. 1行目に「残りターン数: X」
   - X は残りターン数の整数（10からカウントダウン）
   - 質問に回答するときだけ減らす（解答宣言では減らさない）。

2. 2行目に「回答: 〜」
   - 「はい」「いいえ」「どちらとも言えない」「回答不能」のいずれかを、ひらがなで書く。
   - 例: 「回答: はい」

3. 3行目以降に、必要なら補足説明を数行書いてもよいが、簡潔にする。
   - 補足説明は任意。
   - 補足がない場合は、2行目で終了してもよい。

※ index.html 側では、1行目と2行目を前提に表示を行うため、
   かならずこの順番・形式を崩さないこと。

（中略：ここに元の SYSTEM_PROMPT の残り全体が入っています）

- 現時点では、テーマは
  (1) 国連加盟国の国名
  (2) 日本のG1出走経験がある競走馬名
  (3) 日本の中央重賞出走経験がある競走馬名
  の3種類のみとする。
- 秘密の答えは、そのゲームが終了するまで絶対に出力しない。
- 「MVP」を選ぶときは、「情報量」「候補をどれだけ絞れるか」「切り口の鋭さ」を基準に主観的に1つ選ぶ。
- プレイヤー同士が相談するための「相談チャット」メッセージは、あなたには送られない。
  あなたが受け取るユーザーメッセージは、テーマ番号、yes/noで答える質問、解答、ゲーム継続の可否など、
  ゲーム進行に直接関わる内容のみである。
  したがって、相談内容に言及したり、「さっき皆さんが相談していたように」などと、
  プレイヤー同士の会話を見ていたかのように振る舞ってはいけない。
`;

// ==== セッション管理（サーバー起動中だけ保持） ====

/**
 * Gemini の会話履歴をセッションごとに保存する簡易 Map
 * 各要素は Gemini API の contents と同じ形式：
 *   { role: "user" | "model", parts: [{ text: "..." }] }
 */
const sessions = new Map();

/**
 * LLM の出力から <think>〜</think> を削除するユーティリティ
 */
function stripThinkTags(text) {
  if (!text) return "";
  return text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}

/**
 * ゲーム本体：LLM とのやり取りを行う関数
 *
 * @param {string} sessionId - 部屋ID（例: "room-abc123"）
 * @param {string} userText  - プレイヤーからのメッセージ（質問 or 解答）
 * @param {"question"|"answer"|"free"} kind - メッセージの種類
 * @returns {Promise<string>} - AI からの返答テキスト（<think>削除済み）
 */
export async function chatWithGameMaster(
  sessionId,
  userText,
  kind = "question"
) {
  if (!sessionId) {
    throw new Error("sessionId is required");
  }

  // 空文字なども一応許容
  const safeText = userText ?? "";

  // 初回なら空の履歴を作る
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, []);
  }

  const history = sessions.get(sessionId); // Array<{ role, parts }>

  // 質問 or 解答 でラベルを付与
  let contentText = safeText;
  if (kind === "answer") {
    contentText = `【解答】${safeText}`;
  } else if (kind === "question") {
    contentText = `【質問】${safeText}`;
  } else {
    // "free" などの場合（通常はサーバー側でAIに送らない想定）
    contentText = safeText;
  }

  // 今回のユーザー発話を会話履歴に追加
  history.push({
    role: "user",
    parts: [{ text: contentText }],
  });

  // Gemini に問い合わせ
  const result = await model.generateContent({
    systemInstruction: {
      role: "system",
      parts: [{ text: SYSTEM_PROMPT }],
    },
    contents: history,
  });

  const replyText = result.response.text() || "";
  const cleaned = stripThinkTags(replyText);

  // AI の返答も履歴に追加
  history.push({
    role: "model",
    parts: [{ text: cleaned }],
  });

  // 更新した履歴を保存
  sessions.set(sessionId, history);

  // フロントにはテキストだけ返す
  return cleaned;
}
