import express from "express";
import axios from "axios";
import fs from "fs";
import FormData from "form-data";

const app = express();
app.use(express.json());

// 🔐 ENV VARIABLES
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const IG_TOKEN = process.env.IG_TOKEN;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const PUBLIC_URL = process.env.PUBLIC_URL;
const IG_USER_ID = process.env.IG_USER_ID;

// 🚨 BASIC CHECK
if (!PUBLIC_URL) {
  throw new Error("PUBLIC_URL not set in environment variables");
}

// ✅ HEALTH CHECK
app.get("/", (req, res) => {
  res.send("Bot is running 🚀");
});

// 🧠 AI TEXT → JSON (SAFE PARSE)
async function generateContent(prompt) {
  const res = await axios.post(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      model: "llama3-70b-8192",
      messages: [
        {
          role: "user",
          content: `Give response ONLY in JSON:
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

  if (s === -1 || e === -1) {
    console.error("RAW:", raw);
    throw new Error("Invalid JSON from AI");
  }

  let jsonString = raw.substring(s, e + 1);

  // 🔥 CLEAN JSON (IMPORTANT FIX)
  jsonString = jsonString
    .replace(/\n/g, " ")
    .replace(/\r/g, "")
    .replace(/\t/g, " ")
    .replace(/[\u0000-\u001F]+/g, "");

  try {
    return JSON.parse(jsonString);
  } catch (err) {
    console.error("BROKEN JSON:", jsonString);
    throw err;
  }
}

// 🎨 IMAGE GENERATION (DUMMY - replace with real API)
async function generateImage(prompt) {
  const imageUrl = `https://dummyimage.com/1024x1024/000/fff&text=${encodeURIComponent(
    prompt
  )}`;

  const response = await axios({
    url: imageUrl,
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

// 📤 UPLOAD IMAGE (MAKE PUBLIC)
app.get("/image.jpg", (req, res) => {
  res.sendFile(process.cwd() + "/image.jpg");
});

// 📸 POST TO INSTAGRAM
async function postToInstagram(imageUrl, caption) {
  // Step 1: Create Media
  const createRes = await axios.post(
    `https://graph.facebook.com/v19.0/${IG_USER_ID}/media`,
    {
      image_url: imageUrl,
      caption: caption,
      access_token: IG_TOKEN
    }
  );

  const creationId = createRes.data.id;

  // Step 2: Publish
  await axios.post(
    `https://graph.facebook.com/v19.0/${IG_USER_ID}/media_publish`,
    {
      creation_id: creationId,
      access_token: IG_TOKEN
    }
  );
}

// 🚀 MAIN ROUTE
app.post("/post", async (req, res) => {
  try {
    const userPrompt = req.body.prompt;

    // 1. Generate content
    const data = await generateContent(userPrompt);

    // 2. Generate image
    const imagePath = await generateImage(data.image_prompt);

    // 3. Public URL
    const imageUrl = `${PUBLIC_URL}/image.jpg`;

    // 4. Post to Instagram
    await postToInstagram(imageUrl, data.caption);

    res.json({
      success: true,
      caption: data.caption,
      image_prompt: data.image_prompt
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// 🚀 START SERVER
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
