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

app.get("/", (req, res) => res.send("Lowe backend (DeepSeek) is running."));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Lowe backend proxy (DeepSeek) running on port ${PORT}`));

