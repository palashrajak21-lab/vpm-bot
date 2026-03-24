const express = require('express');
const axios = require('axios');
const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());
app.use('/images', express.static(path.join(__dirname, 'tmp')));

// ── Credentials ───────────────────────────────────────────────
const TELEGRAM_TOKEN  = '7651985462:AAHC_StUMFvGprQiQDTzOI5L0wVX3TotKps';
const GROQ_KEY        = process.env.GROQ_API_KEY;
const IG_TOKEN        = 'IGAActCgt3xEVBZAGFpX1VvaTZA1VlZAhZAUlGSjhVMkdOcmgweWRYWUxBZAXVwc25hcWxnV1I3Vnd2WlRmRzg0OWI2cVZALZATNGR0lSN1hnX09ZAZAURoTzhkM0JOTElBSFFvMzZA4TktJTDBNVTBXVFI3ME1PTXVuWnhtWFozNlFYTjZALbwZDZD';
const IG_USER_ID      = '17841446468701004';
const PUBLIC_URL      = process.env.PUBLIC_URL;
const TELEGRAM_API    = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

const TMP = path.join(__dirname, 'tmp');
if (!fs.existsSync(TMP)) fs.mkdirSync(TMP);

// ── Session store ─────────────────────────────────────────────
const sessions = {};

// ── Draw branded navy template ────────────────────────────────
function drawTemplate(quote, author) {
  const S = 1080;
  const canvas = createCanvas(S, S);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#0a1e3d';
  ctx.fillRect(0, 0, S, S);

  ctx.strokeStyle = '#1a3a6e';
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.15;
  for (let i = 0; i < S; i += 72) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, S); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(S, i); ctx.stroke();
  }
  ctx.globalAlpha = 1;

  const m = 44;
  ctx.strokeStyle = '#c9a84c';
  ctx.lineWidth = 5;
  ctx.strokeRect(m, m, S-m*2, S-m*2);

  ctx.strokeStyle = 'rgba(201,168,76,0.25)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(m+14, m+14, S-(m+14)*2, S-(m+14)*2);

  const cs = 40;
  ctx.strokeStyle = '#c9a84c';
  ctx.lineWidth = 5;
  [[m-2,m-2,1,1],[S-m+2,m-2,-1,1],[m-2,S-m+2,1,-1],[S-m+2,S-m+2,-1,-1]].forEach(([cx,cy,dx,dy])=>{
    ctx.beginPath(); ctx.moveTo(cx+dx*cs,cy); ctx.lineTo(cx,cy); ctx.lineTo(cx,cy+dy*cs); ctx.stroke();
  });

  ctx.fillStyle = 'rgba(8,20,50,0.92)';
  ctx.fillRect(m+6, m+6, S-(m+6)*2, 110);
  ctx.fillStyle = '#c9a84c';
  ctx.font = 'bold 38px serif';
  ctx.textAlign = 'center';
  ctx.fillText('VISUAL PRO MEDIA', S/2, m+65);
  ctx.fillStyle = 'rgba(201,168,76,0.6)';
  ctx.font = '22px sans-serif';
  ctx.fillText('@visualpromediaofficial', S/2, m+98);

  ctx.strokeStyle = 'rgba(201,168,76,0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(m+6, m+116); ctx.lineTo(S-m-6, m+116); ctx.stroke();

  ctx.fillStyle = 'rgba(201,168,76,0.1)';
  ctx.font = 'bold 220px serif';
  ctx.textAlign = 'left';
  ctx.fillText('\u201C', 52, 430);

  const maxW = S - 160;
  const fSize = quote.length < 80 ? 54 : quote.length < 140 ? 44 : quote.length < 200 ? 36 : 30;
  ctx.font = `italic ${fSize}px serif`;
  ctx.fillStyle = '#e8edf5';
  ctx.textAlign = 'center';

  const words = quote.split(' ');
  let lines = [], line = '';
  for (const w of words) {
    const test = line + (line ? ' ' : '') + w;
    if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; }
    else line = test;
  }
  if (line) lines.push(line);
  const lh = fSize * 1.55;
  let ty = S/2 - (lines.length*lh)/2 + lh/2 - 30;
  lines.forEach(l => { ctx.fillText(l, S/2, ty); ty += lh; });

  if (author) {
    ctx.font = '28px sans-serif';
    ctx.fillStyle = '#c9a84c';
    ctx.fillText('— ' + author, S/2, S-m-118);
  }

  ctx.fillStyle = 'rgba(8,20,50,0.92)';
  ctx.fillRect(m+6, S-m-100, S-(m+6)*2, 94);
  ctx.fillStyle = 'rgba(201,168,76,0.45)';
  ctx.font = '20px sans-serif';
  ctx.fillText('BUSINESS  |  LEADERSHIP  |  GROWTH', S/2, S-m-65);
  ctx.fillStyle = '#c9a84c';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText('FOLLOW FOR DAILY BUSINESS INSIGHTS', S/2, S-m-28);

  return canvas.toBuffer('image/png');
}

// ── Telegram: send text ───────────────────────────────────────
async function sendText(chatId, text) {
  await axios.post(`${TELEGRAM_API}/sendMessage`, {
    chat_id: chatId,
    text,
    parse_mode: 'Markdown'
  });
}

// ── Telegram: send photo with caption ────────────────────────
async function sendPhoto(chatId, imageBuffer, caption) {
  const FormData = require('form-data');
  const form = new FormData();
  form.append('chat_id', chatId);
  form.append('caption', caption, { contentType: 'text/plain' });
  form.append('photo', imageBuffer, { filename: 'post.png', contentType: 'image/png' });
  form.append('parse_mode', 'Markdown');
  await axios.post(`${TELEGRAM_API}/sendPhoto`, form, { headers: form.getHeaders() });
}

// ── Groq: generate content (free) ────────────────────────────
async function generateContent(topic) {
  const res = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
    model: 'llama-3.3-70b-versatile',
    max_tokens: 900,
    messages: [
      {
        role: 'system',
        content: `You are an expert Instagram content creator for business accounts. Respond ONLY with valid JSON, no preamble, no backticks. Format:
{
  "quote": "One powerful quote max 160 chars for the image",
  "author": "Author name or empty string",
  "caption": "Instagram caption 2-3 short punchy paragraphs, motivational tone, max 160 words",
  "cta": "Strong call-to-action line",
  "hashtags": "12 relevant hashtags starting with # separated by spaces"
}`
      },
      { role: 'user', content: `Create an Instagram business post about: ${topic}` }
    ]
  }, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${GROQ_KEY}`
    }
  });
  let raw = res.data.choices[0].message.content;
  raw = raw.replace(/```json|```/g, '').trim();
  raw = raw.replace(/[�--]/g, '');
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON in response');
  return JSON.parse(match[0]);
}

// ── Instagram: post image via public URL ──────────────────────
async function postToInstagram(imgBuffer, caption) {
  const filename = `ig_${Date.now()}.png`;
  const filepath = path.join(TMP, filename);
  fs.writeFileSync(filepath, imgBuffer);
  const imageUrl = `${PUBLIC_URL}/images/${filename}`;

  const create = await axios.post(
    `https://graph.instagram.com/v21.0/${IG_USER_ID}/media`,
    { image_url: imageUrl, caption, access_token: IG_TOKEN }
  );
  const publish = await axios.post(
    `https://graph.instagram.com/v21.0/${IG_USER_ID}/media_publish`,
    { creation_id: create.data.id, access_token: IG_TOKEN }
  );

  setTimeout(() => { try { fs.unlinkSync(filepath); } catch(e){} }, 60000);
  return publish.data.id;
}

// ── Webhook handler ───────────────────────────────────────────
app.post('/webhook', async (req, res) => {
  res.sendStatus(200);
  const msg = req.body?.message;
  if (!msg) return;

  const chatId = msg.chat.id;
  const text   = (msg.text || '').trim();
  const lower  = text.toLowerCase();

  try {
    // /start command
    if (lower === '/start') {
      await sendText(chatId,
        `👋 *Welcome to Visual Pro Media Bot!*\n\n` +
        `I generate branded Instagram posts for @visualpromediaofficial.\n\n` +
        `*How to use:*\n` +
        `1️⃣ Send me any business topic or idea\n` +
        `2️⃣ I'll generate a branded image + caption\n` +
        `3️⃣ Reply *approve* to post to Instagram\n` +
        `4️⃣ Reply *redo* to generate a new version\n\n` +
        `💡 Try sending: _consistency builds empires_`
      );
      return;
    }

    // APPROVE
    if (lower === 'approve' && sessions[chatId]) {
      const s = sessions[chatId];
      await sendText(chatId, '⏳ Posting to Instagram now...');
      const fullCaption = `${s.caption}\n\n${s.cta}\n\n${s.hashtags}`;
      const postId = await postToInstagram(s.imgBuffer, fullCaption);
      delete sessions[chatId];
      await sendText(chatId,
        `✅ *Posted successfully!*\n\n` +
        `Check @visualpromediaofficial on Instagram 🎉\n\n` +
        `Post ID: \`${postId}\`\n\n` +
        `Send me another idea anytime! 💡`
      );
      return;
    }

    // REDO / CANCEL
    if (['redo','cancel','no'].includes(lower) && sessions[chatId]) {
      delete sessions[chatId];
      await sendText(chatId, '❌ Cancelled! Send me a new topic idea anytime.');
      return;
    }

    // NEW IDEA
    await sendText(chatId, `✨ Generating your branded post about:\n*"${text}"*\n\nPlease wait ~15 seconds...`);

    const data = await generateContent(text);
    const imgBuffer = drawTemplate(data.quote, data.author || '');

    sessions[chatId] = {
      imgBuffer,
      caption: data.caption,
      cta: data.cta,
      hashtags: data.hashtags
    };

    const preview =
      `*Caption preview:*\n\n` +
      `${data.caption}\n\n` +
      `${data.cta}\n\n` +
      `${data.hashtags}\n\n` +
      `─────────────────\n` +
      `Reply *approve* → post to Instagram\n` +
      `Reply *redo* → generate new version`;

    await sendPhoto(chatId, imgBuffer, preview);

  } catch (err) {
    console.error(err?.response?.data || err.message);
    await sendText(chatId, '❌ Something went wrong. Please try again!');
  }
});

app.get('/', (_, res) => res.send('Visual Pro Media Telegram Bot is running! 🚀'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Bot live on port ${PORT}`));
