// Express 앱 정의 (로컬: server.js 가 listen, Vercel: api/index.js 가 export)
require("dotenv").config();
const path = require("path");
const express = require("express");
const multer = require("multer");
const OpenAI = require("openai");

const MAX_MB = 4; // Vercel 서버리스 요청 본문 한도(약 4.5MB)를 고려
const ALLOWED = ["image/png", "image/jpeg", "image/webp"];
const MODEL = process.env.OPENAI_IMAGE_MODEL || "gpt-image-2.5-sunburst";

const app = express();
// 메모리 저장: Vercel 은 파일시스템이 읽기 전용이라 디스크에 쓰지 않음
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_MB * 1024 * 1024 },
  fileFilter: (req, file, cb) =>
    ALLOWED.includes(file.mimetype) ? cb(null, true) : cb(new Error("PNG, JPG, WEBP 이미지만 업로드할 수 있어요.")),
});

let openai = null;
function getClient() {
  if (!process.env.OPENAI_API_KEY) return null;
  return (openai ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY }));
}

app.use(express.static(path.join(__dirname, "public")));

app.get("/api/health", (req, res) => {
  res.json({ ok: true, mock: process.env.MOCK === "true", hasKey: !!process.env.OPENAI_API_KEY });
});

app.post("/api/transform", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "이미지 파일이 없어요." });
    const { prompt = "", extra = "" } = req.body;
    if (!prompt) return res.status(400).json({ error: "스타일 프롬프트가 없어요." });

    // MOCK=true: OpenAI 호출 없이 원본을 그대로 돌려줌 (연결 테스트용)
    if (process.env.MOCK === "true") {
      await new Promise((r) => setTimeout(r, 800));
      return res.json({ image: `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}` });
    }

    const client = getClient();
    if (!client) return res.status(500).json({ error: "서버에 OPENAI_API_KEY 가 설정되지 않았어요." });

    const file = await OpenAI.toFile(req.file.buffer, req.file.originalname || "image.png", { type: req.file.mimetype });
    const result = await client.images.edit({
      model: MODEL,
      image: file,
      prompt: `${prompt} ${extra}`.trim().slice(0, 1000),
      size: "1024x1024",
      quality: process.env.OPENAI_IMAGE_QUALITY || "medium", // low|medium|high|xhigh|max|auto
      output_format: "png",
    });

    const b64 = result.data?.[0]?.b64_json;
    if (b64) return res.json({ image: `data:image/png;base64,${b64}` });
    if (result.data?.[0]?.url) return res.json({ url: result.data[0].url });
    res.status(502).json({ error: "OpenAI 응답에 이미지가 없어요." });
  } catch (err) {
    console.error("[transform]", err);
    const friendly = {
      401: "서버의 OpenAI API 키가 올바르지 않아요.",
      403: "이 모델을 사용할 권한이 없어요. OpenAI 계정(조직 인증) 설정을 확인해 주세요.",
      404: "이미지 모델을 찾을 수 없어요. 모델 이름을 확인해 주세요.",
      429: "요청이 너무 많아요. 잠시 후 다시 시도해 주세요.",
    }[err.status];
    res.status(err.status || 500).json({ error: friendly || err.message || "서버 오류" });
  }
});

// multer 등 오류 처리
app.use((err, req, res, next) => {
  const msg = err.code === "LIMIT_FILE_SIZE" ? `파일 크기는 ${MAX_MB}MB 이하여야 해요.` : err.message;
  res.status(400).json({ error: msg });
});

module.exports = app;
