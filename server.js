// Backend proxy for Lowe — using the DeepSeek API.
//
// The mini program / web app client must NEVER hold your DeepSeek API key.
// This server holds it (as an environment variable), calls DeepSeek,
// and returns clean JSON.
//
// Setup:
//   npm install express node-fetch cors
//   DEEPSEEK_API_KEY=sk-xxxx node server.js

const express = require("express");
const fetch = require("node-fetch");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

const API_KEY = process.env.DEEPSEEK_API_KEY;
const MODEL = "deepseek-v4-flash";
const ENDPOINT = "https://api.deepseek.com/chat/completions";
const SCHOOL_NAME = "Hunan Institute of Technology (湖南工学院)";

// ---- Knowledge base ----
// Each entry is a real, verified piece of official information, with a
// source you can point to. Never add invented/unverified content here —
// the whole point of this feature is that everything is traceable.
// Add more entries as you collect verified notices, FAQ text, or
// screenshots (the existing photo-translate feature is a natural way to
// capture a physical/scanned notice into text you can paste in here).
const KNOWLEDGE_BASE = [
  {
    title: "2026-2027 Academic Year Awards & Honors — Application Categories",
    source: "Student Work Service Platform (学生工作服务平台), 评奖评优申请 section, viewed by a student September 2026",
    content: `The 2026-2027 academic year Awards & Honors (评先评优) application window is from August 22, 2026 00:00 to September 15, 2026 23:59. The available award/honor categories listed on the platform are: National Defense Education Scholarship (国防教育奖学金) 1st/2nd/3rd class, Outstanding Entrepreneurial Student (优秀创业大学生), Outstanding Student (优秀学生), Outstanding Student Role Model (优秀学生标兵), Outstanding Student Cadre (优秀学生干部), Outstanding Student Cadre Role Model (优秀学生干部标兵), and Outstanding Student Scholarship (优秀学生奖学金) 1st/2nd/3rd class. Students apply by logging into the Student Work Service Platform, going to 评奖评优 → 评奖评优申请, and clicking Apply (申请) next to the relevant category.`
  },
  {
    title: "Student Work Service Platform — Login",
    source: "Student Work Service Platform homepage, viewed by a student September 2026",
    content: `The Student Work Service Platform is accessed at https://xg.hnit.edu.cn/index. Students log in with their student ID and password (initial password provided in enrollment materials). A "Retrieve Password" (找回密码) option is available on the login page.`
  }
];

function knowledgeBaseAsText() {
  return KNOWLEDGE_BASE.map(
    (doc, i) => `[Source ${i + 1}: "${doc.title}" — ${doc.source}]\n${doc.content}`
  ).join("\n\n");
}

async function callDeepSeek(content) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${API_KEY}`
    },
    body: JSON.stringify({ model: MODEL, messages: [{ role: "user", content }] })
  });
  const data = await res.json();
  if (data.error) {
    console.error("DeepSeek API error:", JSON.stringify(data.error));
    throw new Error(data.error.message || JSON.stringify(data.error));
  }
  const text = data?.choices?.[0]?.message?.content || "";
  try {
    return JSON.parse(text.replace(/```json|```/g, "").trim());
  } catch (e) {
    console.error("Could not parse model output as JSON. Raw text:", text);
    throw new Error("Model did not return valid JSON: " + text.slice(0, 200));
  }
}

app.post("/translate", async (req, res) => {
  const { direction, text, myLanguage } = req.body;
  try {
    if (direction === "toZh") {
      const data = await callDeepSeek(
        `You are helping a foreign student in China who cannot speak Chinese communicate with a Chinese teacher or school staff member. Translate the following message, written in ${myLanguage}, into natural, polite, appropriately formal Mandarin Chinese. Respond ONLY with valid JSON, no markdown fences: {"chinese": "...", "pinyin": "...", "note": "a very short note only if there is an important tone consideration, else empty string"}\n\nMessage: """${text}"""`
      );
      res.json(data);
    } else {
      const data = await callDeepSeek(
        `Translate the following Chinese text into ${myLanguage}, clearly and naturally for a student who does not read Chinese. Respond ONLY with valid JSON, no markdown fences: {"translation": "...", "pinyin": "..."}\n\nChinese text: """${text}"""`
      );
      res.json(data);
    }
  } catch (e) {
    res.status(500).json({ error: "translation_failed", detail: e.message });
  }
});

app.post("/draft", async (req, res) => {
  const { text, myLanguage } = req.body;
  try {
    const data = await callDeepSeek(
      `You are helping an international student in China draft a short, polite, appropriately formal message in Chinese to send to a teacher or school administrator. The student describes in ${myLanguage} what they want to say. Respond ONLY with valid JSON, no markdown fences: {"chinese": "...", "pinyin": "...", "gloss": "a natural back-translation into ${myLanguage}"}\n\nWhat the student wants to say: """${text}"""`
    );
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: "draft_failed", detail: e.message });
  }
});

app.post("/translate-image", async (req, res) => {
  const { imageBase64, myLanguage } = req.body;
  try {
    const data = await callDeepSeek([
      {
        type: "text",
        text: `Translate all the Chinese text visible in this image into ${myLanguage}. Respond ONLY with valid JSON, no markdown fences: {"translation": "...", "summary": "one short sentence describing the document"}`
      },
      { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imageBase64}` } }
    ]);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: "image_translation_failed", detail: e.message });
  }
});

app.post("/ask", async (req, res) => {
  const { question, myLanguage } = req.body;
  try {
    const data = await callDeepSeek(
      `You are Lowe, the official school information assistant for ${SCHOOL_NAME}. You help international students with accurate, source-grounded information.

STRICT RULES:
1. Only use facts from the OFFICIAL SOURCES below. Never invent, guess, or fill in dates, numbers, names, or requirements that are not explicitly present in the sources.
2. If the answer is not clearly contained in the sources, set "found" to false and use this exact answer (translated naturally into ${myLanguage}): "According to the official website, this information has not yet been released. I'll let you know as soon as it is."
3. If you do find the answer, set "found" to true, answer clearly and helpfully in ${myLanguage}, and list which source(s) you used by their exact title.
4. Preserve official Chinese names/terms in parentheses on first mention where it helps avoid ambiguity (e.g., "Outstanding Student Scholarship (优秀学生奖学金)").
5. Never mix invented information with real information — if only part of the question is answerable from the sources, answer only that part and say the rest is not yet available.

OFFICIAL SOURCES:
${knowledgeBaseAsText()}

STUDENT QUESTION: """${question}"""

Respond ONLY with valid JSON, no markdown fences: {"answer": "...", "citations": ["exact source title", "..."], "found": true|false}`
    );
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: "ask_failed", detail: e.message });
  }
});

app.get("/", (req, res) => res.send("Lowe backend (DeepSeek) is running."));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Lowe backend proxy (DeepSeek) running on port ${PORT}`));
