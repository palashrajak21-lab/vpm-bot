const express = require('express');
const bodyParser = require('body-parser');
const twilio = require('twilio');
const axios = require('axios');
const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use('/images', express.static(path.join(__dirname, 'tmp')));

// ── Credentials ───────────────────────────────────────────────
const TWILIO_SID      = 'ACdcf9005c7605d8b3a97c0f55ad7c6ac5';
const TWILIO_TOKEN    = 'dd9d4ad47808f9601d232e89ae86b560';
const TWILIO_WA_NUM   = 'whatsapp:+14155238886';
const ANTHROPIC_KEY   = process.env.ANTHROPIC_API_KEY;
const IG_TOKEN        = 'IGAActCgt3xEVBZAGFpX1VvaTZA1VlZAhZAUlGSjhVMkdOcmgweWRYWUxBZAXVwc25hcWxnV1I3Vnd2WlRmRzg0OWI2cVZALZATNGR0lSN1hnX09ZAZAURoTzhkM0JOTElBSFFvMzZA4TktJTDBNVTBXVFI3ME1PTXVuWnhtWFozNlFYTjZALbwZDZD';
const IG_USER_ID      = '17841446468701004';
const PUBLIC_URL      = process.env.PUBLIC_URL; // e.g. https://yourbot.up.railway.app

const client = twilio(TWILIO_SID, TWILIO_TOKEN);
const TMP_DIR = path.join(__dirname, 'tmp');
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR);

// ── Session store ─────────────────────────────────────────────
const sessions = {};

// ── Draw branded navy template ────────────────────────────────
function drawTemplate(quote, author) {
  const S = 1080;
  const canvas = createCanvas(S, S);
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = '#0a1e3d';
  ctx.fillRect(0, 0, S, S);

  // Subtle grid
  ctx.strokeStyle = '#1a3a6e';
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.15;
  for (let i = 0; i < S; i += 72) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, S); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(S, i); ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Gold outer border
  const m = 44;
  ctx.strokeStyle = '#c9a84c';
  ctx.lineWidth = 5;
  ctx.strokeRect(m, m, S - m * 2, S - m * 2);

  // Thin inner border
  ctx.strokeStyle = 'rgba(201,168,76,0.25)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(m + 14, m + 14, S - (m + 14) * 2, S - (m + 14) * 2);

  // Corner accents
  const cs = 40;
  ctx.strokeStyle = '#c9a84c';
  ctx.lineWidth = 5;
  [[m-2,m-2,1,1],[S-m+2,m-2,-1,1],[m-2,S-m+2,1,-1],[S-m+2,S-m+2,-1,-1]].forEach(([cx,cy,dx,dy]) => {
    ctx.beginPath(); ctx.moveTo(cx+dx*cs, cy); ctx.lineTo(cx,cy); ctx.lineTo(cx,cy+dy*cs); ctx.stroke();
  });

  // Header
  ctx.fillStyle = 'rgba(8,20,50,0.92)';
  ctx.fillRect(m+6, m+6, S-(m+6)*2, 110);
  ctx.fillStyle = '#c9a84c';
  ctx.font = 'bold 38px serif';
  ctx.textAlign = 'center';
  ctx.fillText('VISUAL PRO MEDIA', S/2, m + 65);
  ctx.fillStyle = 'rgba(201,168,76,0.6)';
  ctx.font = '22px sans-serif';
  ctx.fillText('@visualpromediaofficial', S/2, m + 98);

  // Divider line
  ctx.strokeStyle = 'rgba(201,168,76,0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(m+6, m+116); ctx.lineTo(S-m-6, m+116); ctx.stroke();

  // Big decorative quote mark
  ctx.fillStyle = 'rgba(201,168,76,0.1)';
  ctx.font = 'bold 220px serif';
  ctx.textAlign = 'left';
  ctx.fillText('\u201C', 52, 430);

  // Quote text — auto size + wrap
  const maxW = S - 160;
  const qLen = quote.length;
  const fSize = qLen < 80 ? 54 : qLen < 140 ? 44 : qLen < 200 ? 36 : 30;
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
  let ty = S/2 - (lines.length * lh)/2 + lh/2 - 30;
  lines.forEach(l => { ctx.fillText(l, S/2, ty); ty += lh; });

  // Author
  if (author) {
    ctx.font = '28px sans-serif';
    ctx.fillStyle = '#c9a84c';
    ctx.textAlign = 'center';
    ctx.fillText('— ' + author, S/2, S - m - 118);
  }

  // Footer
  ctx.fillStyle = 'rgba(8,20,50,0.92)';
  ctx.fillRect(m+6, S-m-100, S-(m+6)*2, 94);
  ctx.fillStyle = 'rgba(201,168,76,0.45)';
  ctx.font = '20px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('BUSINESS  |  LEADERSHIP  |  GROWTH', S/2, S-m-65);
  ctx.fillStyle = '#c9a84c';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText('FOLLOW FOR DAILY BUSINESS INSIGHTS', S/2, S-m-28);

  return canvas.toBuffer('image/png');
}

// ── Save image to tmp and return public URL ───────────────────
function saveImage(buffer, filename) {
  const filepath = path.join(TMP_DIR, filename);
  fs.writeFileSync(filepath, buffer);
  return `${PUBLIC_URL}/images/${filename}`;
}

// ── Claude: generate quote + caption ─────────────────────────
async function generateContent(topic) {
  const res = await axios.post('https://api.anthropic.com/v1/messages', {
    model: 'claude-sonnet-4-20250514',
    max_tokens: 900,
    system: `You are an expert Instagram content creator for business accounts. Respond ONLY with valid JSON, no preamble, no backticks. Format:
{
  "quote": "One powerful quote sentence max 160 chars, for the image",
  "author": "Author name or empty string",
  "caption": "Instagram caption body 2-3 short punchy paragraphs, motivational tone, max 160 words",
  "cta": "Strong call-to-action line",
  "hashtags": "12 relevant hashtags starting with # separated by spaces"
}`,
    messages: [{ role: 'user', content: `Create an Instagram business post about: ${topic}` }]
  }, {
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01'
    }
  });
  const text = res.data.content.map(i => i.text || '').join('');
  return JSON.parse(text.replace(/```json|```/g, '').trim());
}

// ── Instagram: post image ─────────────────────────────────────
async function postToInstagram(imageUrl, caption) {
  const create = await axios.post(
    `https://graph.instagram.com/v21.0/${IG_USER_ID}/media`,
    { image_url: imageUrl, caption, access_token: IG_TOKEN }
  );
  const publish = await axios.post(
    `https://graph.instagram.com/v21.0/${IG_USER_ID}/media_publish`,
    { creation_id: create.data.id, access_token: IG_TOKEN }
  );
  return publish.data.id;
}

// ── Send WhatsApp text ────────────────────────────────────────
async function sendText(to, msg) {
  await client.messages.create({ from: TWILIO_WA_NUM, to: `whatsapp:${to}`, body: msg });
}

// ── Send WhatsApp image + caption ────────────────────────────
async function sendImage(to, imageUrl, caption) {
  await client.messages.create({
    from: TWILIO_WA_NUM,
    to: `whatsapp:${to}`,
    mediaUrl: [imageUrl],
    body: caption
  });
}

// ── Webhook ───────────────────────────────────────────────────
app.post('/webhook', async (req, res) => {
  res.sendStatus(200);
  const from = req.body.From?.replace('whatsapp:', '');
  const body = (req.body.Body || '').trim();
  if (!from || !body) return;
  const lower = body.toLowerCase();

  try {
    // APPROVE
    if (lower === 'approve' && sessions[from]) {
      const s = sessions[from];
      await sendText(from, '⏳ Posting to Instagram now...');
      const postId = await postToInstagram(s.imageUrl, `${s.caption}\n\n${s.cta}\n\n${s.hashtags}`);
      // Clean up tmp file
      try { fs.unlinkSync(path.join(TMP_DIR, s.filename)); } catch(e) {}
      delete sessions[from];
      await sendText(from, `✅ *Posted successfully to @visualpromediaofficial!*\n\nPost ID: ${postId}\n\nSend me another idea anytime! 💡`);
      return;
    }

    // REDO / CANCEL
    if (['redo','cancel','reject','no'].includes(lower) && sessions[from]) {
      try { fs.unlinkSync(path.join(TMP_DIR, sessions[from].filename)); } catch(e) {}
      delete sessions[from];
      await sendText(from, '❌ Cancelled! Send me a new topic idea anytime.');
      return;
    }

    // NEW IDEA
    await sendText(from, `✨ Generating your branded post about:\n*"${body}"*\n\nPlease wait ~15 seconds...`);

    const data = await generateContent(body);
    const imgBuffer = drawTemplate(data.quote, data.author || '');
    const filename = `post_${from.replace(/\D/g,'')}_${Date.now()}.png`;
    const imageUrl = saveImage(imgBuffer, filename);

    sessions[from] = {
      quote: data.quote,
      author: data.author,
      caption: data.caption,
      cta: data.cta,
      hashtags: data.hashtags,
      imageUrl,
      filename
    };

    const preview = `*Caption preview:*\n\n${data.caption}\n\n${data.cta}\n\n${data.hashtags}\n\n─────────────────\nReply *approve* → post to Instagram\nReply *redo* → generate new version`;

    await sendImage(from, imageUrl, preview);

  } catch (err) {
    console.error(err?.response?.data || err.message);
    await sendText(from, '❌ Something went wrong. Try sending your idea again!');
  }
});

app.get('/', (_, res) => res.send('Visual Pro Media Bot is running! 🚀'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Bot live on port ${PORT}`));
