import express from "express";
import axios from "axios";
import fs from "fs";

const app = express();
app.use(express.json());

// 🔐 ENV
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const IG_TOKEN = process.env.IG_TOKEN;
const IG_USER_ID = process.env.IG_USER_ID;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const PUBLIC_URL = process.env.PUBLIC_URL;

// ✅ ROOT CHECK
app.get("/", (req, res) => {
  res.send("Bot is running 🚀");
});

// 🧠 AI GENERATION
async function generateContent(prompt) {
  const res = await axios.post(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      model: "llama3-70b-8192",
      messages: [
        {
          role: "user",
          content: `Reply ONLY in JSON:
          {
            "caption": "...",
            "image_prompt": "..."
          }
          Topic: ${prompt}`
        }
      ]
    },
    {
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json"
      }
    }
  );

  const raw = res.data.choices[0].message.content;

  const s = raw.indexOf("{");
  const e = raw.lastIndexOf("}");

  let jsonString = raw.substring(s, e + 1);

  jsonString = jsonString
    .replace(/\n/g, " ")
    .replace(/[\u0000-\u001F]+/g, "");

  return JSON.parse(jsonString);
}

// 🎨 IMAGE (dummy for now — replace later with real API)
async function generateImage(prompt) {
  const url = `https://dummyimage.com/1024x1024/000/fff&text=${encodeURIComponent(prompt)}`;

  const response = await axios({
    url,
    method: "GET",
    responseType: "stream"
  });

  const path = "./image.jpg";
  const writer = fs.createWriteStream(path);

  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on("finish", () => resolve(path));
    writer.on("error", reject);
  });
}

// 📤 PUBLIC IMAGE
app.get("/image.jpg", (req, res) => {
  res.sendFile(process.cwd() + "/image.jpg");
});

// 📸 INSTAGRAM POST
async function postToInstagram(imageUrl, caption) {
  const create = await axios.post(
    `https://graph.facebook.com/v19.0/${IG_USER_ID}/media`,
    {
      image_url: imageUrl,
      caption,
      access_token: IG_TOKEN
    }
  );

  await axios.post(
    `https://graph.facebook.com/v19.0/${IG_USER_ID}/media_publish`,
    {
      creation_id: create.data.id,
      access_token: IG_TOKEN
    }
  );
}

// 📩 TELEGRAM SEND MESSAGE
async function sendTelegram(chatId, text) {
  await axios.post(
    `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,
    {
      chat_id: chatId,
      text: text
    }
  );
}

// 🤖 TELEGRAM WEBHOOK (MAIN FIX)
app.post(`/webhook`, async (req, res) => {
  try {
    const message = req.body.message;
    if (!message) return res.sendStatus(200);

    const chatId = message.chat.id;
    const userText = message.text;

    await sendTelegram(chatId, "⚡ Creating your post...");

    // 1. AI
    const data = await generateContent(userText);

    // 2. Image
    await generateImage(data.image_prompt);

    const imageUrl = `${PUBLIC_URL}/image.jpg`;

    // 3. Instagram
    await postToInstagram(imageUrl, data.caption);

    await sendTelegram(chatId, "✅ Posted on Instagram successfully 🚀");

    res.sendStatus(200);
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

// 🚀 START
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log("Server running 🚀");
});
