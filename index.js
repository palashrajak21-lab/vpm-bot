const express = require('express');
const axios = require('axios');
const { createCanvas, loadImage } = require('canvas');
const FormData = require('form-data');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PUBLIC_URL = process.env.PUBLIC_URL || 'https://vpm-bot.onrender.com';
const OPENAI_KEY = process.env.OPENAI_API_KEY;

// ── Storage ───────────────────────────────────────────────────
function loadClients() {
  try {
    const clients = JSON.parse(process.env.CLIENTS_DATA || '{}');
    Object.values(clients).forEach(c => {
      if (process.env.IG_TOKEN && (c.handle === 'visualpromediaofficial' || c.igUserId === '17841446468701004')) {
        c.igToken = process.env.IG_TOKEN;
        c.igUserId = process.env.IG_USER_ID || c.igUserId;
      }
      if (process.env.VOYAGER_IG_TOKEN && (c.handle === 'thevirtualvoyager1' || c.igUserId === '34969310299349798')) {
        c.igToken = process.env.VOYAGER_IG_TOKEN;
        c.igUserId = process.env.VOYAGER_IG_USER_ID || c.igUserId;
      }
    });
    return clients;
  } catch(e) { return {}; }
}

function isTrial(client) {
  return client.plan === 'trial';
}

function trialPostsLeft(client) {
  const used = client.trialPostsUsed || 0;
  return Math.max(0, 3 - used);
}

function isTrialExpired(client) {
  return isTrial(client) && trialPostsLeft(client) <= 0;
}
function saveClients(c) { console.log('CLIENTS_DATA_UPDATE:' + JSON.stringify(c)); }

const imageStore = {};
const sessions = {};
const userTemplates = {};
const userPhotos = {};

// ── Templates ─────────────────────────────────────────────────
const TEMPLATES = {
  'Dark Luxury': '🖤',
  'Light Clean': '🤍',
  'X Style':     '✖️',
  'Bold News':   '📰',
  'Quote Card':  '💬',
};

async function sendTemplateMenu(botToken, chatId) {
  const buttons = Object.entries(TEMPLATES).map(([name, emoji]) => [{ text: emoji + ' ' + name, callback_data: 'tpl:' + name }]);
  buttons.push([{ text: '📷 Use My Own Photo', callback_data: 'tpl:custom' }]);
  await axios.post('https://api.telegram.org/bot' + botToken + '/sendMessage', {
    chat_id: chatId,
    text: '🎨 *Choose Your Post Style*\n\nPick a template — you can change anytime with /template',
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: buttons }
  });
}

// ── AI Content Generation ─────────────────────────────────────
async function generateContent(userText) {
  const sys = `You are an expert Instagram content creator. The user gives you a topic or request.
You must respond with ONLY a JSON object — nothing else, no markdown, no explanation.

JSON format:
{
  "headline": "Short powerful headline, max 7 words",
  "subheadline": "One line supporting text, max 10 words",
  "body": "2-3 sentences of genuinely useful insight on this topic",
  "quote": "If this is a quote request, the exact famous quote. Otherwise same as headline",
  "author": "If this is a quote, the real person name. Otherwise null",
  "image_prompt": "Describe a photorealistic image that matches the topic. Be specific. No text in image.",
  "caption": "Instagram caption starting with a hook, then value, ending with a question. 100-150 words.",
  "hashtags": "#15 #relevant #hashtags"
}

Rules:
- If user asks for a quote: find a REAL famous quote, put it in "quote", person in "author"
- If user asks for tips/advice: write specific actionable body text
- image_prompt must MATCH the topic exactly
- headline must be emotional and scroll-stopping
- NEVER put the user instruction in any field — generate actual content`;

  try {
    const res = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: userText }
      ],
      max_tokens: 700,
      temperature: 0.8
    }, { headers: { 'Authorization': 'Bearer ' + OPENAI_KEY }, timeout: 40000 });

    const raw = res.data.choices[0].message.content.trim()
      .replace(/```json/g, '').replace(/```/g, '').trim();
    const data = JSON.parse(raw);
    return data;
  } catch(e) {
    console.log('GPT error:', e.message);
    // Simple fallback
    return {
      headline: userText.length > 40 ? userText.substring(0, 40) : userText,
      subheadline: 'A powerful insight',
      body: 'Focus drives results. Consistency beats talent. Start before you feel ready.',
      quote: userText,
      author: null,
      image_prompt: userText + ', professional photography, cinematic, no text',
      caption: userText + '\n\nWhat do you think? Comment below!',
      hashtags: '#motivation #success #mindset #growth #inspiration'
    };
  }
}

// ── DALL-E 3 Image ────────────────────────────────────────────
async function generateImage(prompt) {
  try {
    const res = await axios.post('https://api.openai.com/v1/images/generations', {
      model: 'dall-e-3',
      prompt: prompt + '. Photorealistic. No text. No words. High quality.',
      n: 1,
      size: '1024x1024',
      quality: 'standard'
    }, { headers: { 'Authorization': 'Bearer ' + OPENAI_KEY }, timeout: 45000 });
    const url = res.data.data[0].url;
    console.log('DALL-E 3 image generated');
    const buf = await downloadUrl(url);
    if (buf && buf.length > 10000) return buf;
  } catch(e) { console.log('DALL-E error:', e.response?.data?.error?.message || e.message); }
  // Fallback
  try {
    const url = 'https://image.pollinations.ai/prompt/' + encodeURIComponent(prompt + ', cinematic, no text') + '?width=1080&height=1080&nologo=true';
    const buf = await downloadUrl(url);
    if (buf && buf.length > 20000) return buf;
  } catch(e) {}
  return null;
}

async function downloadUrl(url) {
  const r = await axios.get(url, { responseType: 'arraybuffer', timeout: 20000 });
  return Buffer.from(r.data);
}

// ── Canvas Template Renderers ─────────────────────────────────
function wrapText(ctx, text, x, y, maxW, lineH) {
  const words = String(text || '').split(' ');
  let line = '';
  let currentY = y;
  words.forEach(w => {
    const test = line + (line ? ' ' : '') + w;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, currentY);
      line = w;
      currentY += lineH;
    } else { line = test; }
  });
  if (line) { ctx.fillText(line, x, currentY); currentY += lineH; }
  return currentY;
}

// Template 1: Dark Luxury ─────────────────────────────────────
async function renderDarkLuxury(data, photo, client) {
  const W = 1080, H = 1080;
  const c = createCanvas(W, H);
  const ctx = c.getContext('2d');

  // Deep dark gradient background
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#0a0a0a');
  grad.addColorStop(0.5, '#111111');
  grad.addColorStop(1, '#0d0d0d');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Gold border frame
  ctx.strokeStyle = '#c9a84c';
  ctx.lineWidth = 2;
  ctx.strokeRect(32, 32, W-64, H-64);
  ctx.strokeStyle = 'rgba(201,168,76,0.3)';
  ctx.lineWidth = 1;
  ctx.strokeRect(40, 40, W-80, H-80);

  // Gold decorative lines top
  ctx.fillStyle = '#c9a84c';
  ctx.fillRect(80, 80, 120, 2);
  ctx.fillRect(W-200, 80, 120, 2);

  // Brand top
  ctx.font = '500 18px sans-serif';
  ctx.fillStyle = '#c9a84c';
  ctx.textAlign = 'center';
  ctx.fillText((client.name || 'Visual Pro Media').toUpperCase(), W/2, 75);

  // Large quote mark
  ctx.font = 'bold 180px Georgia, serif';
  ctx.fillStyle = 'rgba(201,168,76,0.12)';
  ctx.textAlign = 'left';
  ctx.fillText('\u201C', 60, 400);

  // Main headline/quote
  const text = data.author ? data.quote : data.headline;
  const textLen = String(text || '').length;
  const fontSize = textLen < 60 ? 52 : textLen < 100 ? 42 : 34;
  ctx.font = 'italic ' + fontSize + 'px Georgia, serif';
  ctx.fillStyle = '#f0ece4';
  ctx.textAlign = 'center';
  wrapText(ctx, text, W/2, 280, W-200, fontSize * 1.4);

  // Author
  if (data.author) {
    ctx.font = '500 28px sans-serif';
    ctx.fillStyle = '#c9a84c';
    ctx.textAlign = 'center';
    ctx.fillText('— ' + data.author, W/2, 760);
    // Divider
    ctx.fillStyle = 'rgba(201,168,76,0.4)';
    ctx.fillRect(W/2-80, 780, 160, 1);
  } else {
    // Body text
    ctx.font = '300 24px sans-serif';
    ctx.fillStyle = 'rgba(240,236,228,0.7)';
    wrapText(ctx, data.body, W/2, 680, W-220, 38);
  }

  // Bottom gold decorative line
  ctx.fillStyle = '#c9a84c';
  ctx.fillRect(80, H-90, 120, 2);
  ctx.fillRect(W-200, H-90, 120, 2);

  // Handle bottom
  ctx.font = '400 18px sans-serif';
  ctx.fillStyle = 'rgba(201,168,76,0.8)';
  ctx.textAlign = 'center';
  ctx.fillText('@' + (client.handle || 'visualpromediaofficial'), W/2, H-55);

  return c.toBuffer('image/png');
}

// Template 2: Light Clean ─────────────────────────────────────
async function renderLightClean(data, photo, client) {
  const W = 1080, H = 1080;
  const c = createCanvas(W, H);
  const ctx = c.getContext('2d');

  // Light cream background
  ctx.fillStyle = '#f8f6f0';
  ctx.fillRect(0, 0, W, H);

  // Subtle texture dots
  ctx.fillStyle = 'rgba(0,0,0,0.025)';
  for (let x = 0; x < W; x += 30) for (let y = 0; y < H; y += 30) {
    ctx.beginPath(); ctx.arc(x, y, 1, 0, Math.PI*2); ctx.fill();
  }

  // Left photo area
  const photoX = 36, photoY = 80, photoW = 456, photoH = 862;
  if (photo) {
    try {
      const img = await loadImage(photo);
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(photoX, photoY, photoW, photoH, 20);
      ctx.clip();
      const sc = Math.max(photoW/img.width, photoH/img.height);
      ctx.drawImage(img, photoX+(photoW-img.width*sc)/2, photoY+(photoH-img.height*sc)/2, img.width*sc, img.height*sc);
      ctx.restore();
    } catch(e) {
      ctx.fillStyle = '#e0ddd5';
      ctx.beginPath(); ctx.roundRect(photoX,photoY,photoW,photoH,20); ctx.fill();
    }
  } else {
    ctx.fillStyle = '#e0ddd5';
    ctx.beginPath(); ctx.roundRect(photoX,photoY,photoW,photoH,20); ctx.fill();
  }

  // Right text area
  const tx = 536, tw = 500;

  // Dark blue category bar
  ctx.fillStyle = '#2c4a7a';
  ctx.fillRect(tx, 80, tw, 44);
  ctx.font = 'bold 15px sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.fillText('  ' + (data.author ? 'FEATURED QUOTE' : 'KEY INSIGHTS'), tx+8, 108);

  // Big bold headline
  const hl = (data.author ? data.quote : data.headline) || '';
  const hlSize = hl.length < 20 ? 64 : hl.length < 35 ? 54 : hl.length < 50 ? 44 : 36;
  ctx.font = 'bold ' + hlSize + 'px sans-serif';
  ctx.fillStyle = '#111111';
  ctx.textAlign = 'left';
  const afterHL = wrapText(ctx, hl.toUpperCase(), tx, 175, tw, hlSize * 1.1);

  // Author or body
  if (data.author) {
    ctx.font = 'bold 24px sans-serif';
    ctx.fillStyle = '#2c4a7a';
    wrapText(ctx, '— ' + data.author, tx, afterHL + 20, tw, 34);
  }
  ctx.font = '400 21px sans-serif';
  ctx.fillStyle = '#444444';
  wrapText(ctx, data.body, tx, Math.max(afterHL + 60, 540), tw, 32);

  // CTA
  ctx.font = 'bold 22px sans-serif';
  ctx.fillStyle = '#2c4a7a';
  ctx.textAlign = 'left';
  ctx.fillText('Swipe to know more >', tx, 880);

  // Bottom bar
  ctx.fillStyle = '#f0ede6';
  ctx.fillRect(0, 985, W, 95);
  ctx.fillStyle = 'rgba(0,0,0,0.1)';
  ctx.fillRect(0, 985, W, 1);
  ctx.font = 'bold 22px sans-serif';
  ctx.fillStyle = '#111111';
  ctx.textAlign = 'left';
  ctx.fillText(client.name || 'Visual Pro Media', 36, 1042);
  ctx.textAlign = 'right';
  ctx.fillText('@' + (client.handle || 'visualpromediaofficial'), W-36, 1042);

  return c.toBuffer('image/png');
}

// Template 3: X Style ─────────────────────────────────────────
async function renderXStyle(data, photo, client) {
  const W = 1080, H = 1080;
  const c = createCanvas(W, H);
  const ctx = c.getContext('2d');

  // Dark background with glow
  ctx.fillStyle = '#050508';
  ctx.fillRect(0, 0, W, H);

  // Corner green glow
  const g1 = ctx.createRadialGradient(0, H, 0, 0, H, 400);
  g1.addColorStop(0, 'rgba(0,180,80,0.18)');
  g1.addColorStop(1, 'transparent');
  ctx.fillStyle = g1;
  ctx.fillRect(0, 0, W, H);

  const g2 = ctx.createRadialGradient(W, 0, 0, W, 0, 350);
  g2.addColorStop(0, 'rgba(0,160,70,0.12)');
  g2.addColorStop(1, 'transparent');
  ctx.fillStyle = g2;
  ctx.fillRect(0, 0, W, H);

  // Dark card
  ctx.fillStyle = 'rgba(8,20,10,0.9)';
  ctx.beginPath();
  ctx.roundRect(80, 80, 920, 920, 48);
  ctx.fill();

  // Grid lines on card
  ctx.strokeStyle = 'rgba(0,200,80,0.06)';
  ctx.lineWidth = 1;
  for (let x = 80; x <= 1000; x += 92) {
    ctx.beginPath(); ctx.moveTo(x, 80); ctx.lineTo(x, 1000); ctx.stroke();
  }
  for (let y = 80; y <= 1000; y += 92) {
    ctx.beginPath(); ctx.moveTo(80, y); ctx.lineTo(1000, y); ctx.stroke();
  }

  // Green dots top right
  [0,1,2].forEach(i => {
    ctx.fillStyle = '#00cc66';
    ctx.beginPath();
    ctx.arc(860 + i*28, 132, 7, 0, Math.PI*2);
    ctx.fill();
  });

  // Brand top left
  ctx.font = 'bold 18px sans-serif';
  ctx.fillStyle = '#00cc66';
  ctx.textAlign = 'left';
  ctx.fillText(client.name || 'Visual Pro Media', 140, 140);

  // White headline
  const hl = (data.author ? data.quote : data.headline) || '';
  const hlLen = hl.length;
  const hlSize = hlLen < 25 ? 58 : hlLen < 45 ? 48 : hlLen < 70 ? 40 : 34;
  ctx.font = 'bold ' + hlSize + 'px sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  const afterHL = wrapText(ctx, hl, 140, 240, 800, hlSize * 1.2);

  // Green accent line
  ctx.fillStyle = '#00cc66';
  ctx.fillRect(140, afterHL + 20, 6, Math.min(200, 750 - afterHL));

  // Body/author
  if (data.author) {
    ctx.font = '500 26px sans-serif';
    ctx.fillStyle = '#00cc66';
    wrapText(ctx, '— ' + data.author, 162, afterHL + 32, 780, 38);
  } else {
    ctx.font = '300 25px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    wrapText(ctx, data.body, 162, afterHL + 32, 780, 38);
  }

  // Bottom URL pill
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(140, 900, 260, 46, 23);
  ctx.stroke();
  ctx.font = '400 16px sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.fillText('@' + (client.handle || 'visualpromediaofficial'), 270, 929);

  // Arrow button
  ctx.strokeStyle = '#00cc66';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(880, 923, 30, 0, Math.PI*2);
  ctx.stroke();
  ctx.font = 'bold 22px sans-serif';
  ctx.fillStyle = '#00cc66';
  ctx.textAlign = 'center';
  ctx.fillText('↗', 880, 932);

  return c.toBuffer('image/png');
}

// Template 4: Bold News ───────────────────────────────────────
async function renderBoldNews(data, photo, client) {
  const W = 1080, H = 1080;
  const c = createCanvas(W, H);
  const ctx = c.getContext('2d');

  // White background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  // Left photo or color block
  const hasPhoto = !!photo;
  if (hasPhoto) {
    try {
      const img = await loadImage(photo);
      const sc = Math.max(480/img.width, H/img.height);
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, 480, H);
      ctx.clip();
      ctx.drawImage(img, (480-img.width*sc)/2, (H-img.height*sc)/2, img.width*sc, img.height*sc);
      ctx.restore();
      // Dark overlay on photo
      const ov = ctx.createLinearGradient(0, 0, 480, 0);
      ov.addColorStop(0, 'rgba(0,0,0,0.3)');
      ov.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = ov;
      ctx.fillRect(0, 0, 480, H);
    } catch(e) {
      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(0, 0, 480, H);
    }
  } else {
    // Gradient left block
    const leftGrad = ctx.createLinearGradient(0, 0, 0, H);
    leftGrad.addColorStop(0, '#1a1a2e');
    leftGrad.addColorStop(1, '#16213e');
    ctx.fillStyle = leftGrad;
    ctx.fillRect(0, 0, 480, H);
  }

  // Vertical red accent line
  ctx.fillStyle = '#e63946';
  ctx.fillRect(478, 0, 6, H);

  // Red top bar
  ctx.fillStyle = '#e63946';
  ctx.fillRect(490, 0, 590, 72);
  ctx.font = 'bold 20px sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.fillText('  BREAKING NEWS', 496, 46);

  // Big headline right side
  const hl = (data.author ? data.quote : data.headline) || '';
  const hlLen = hl.length;
  const hlSize = hlLen < 25 ? 62 : hlLen < 45 ? 52 : hlLen < 65 ? 42 : 34;
  ctx.font = 'bold ' + hlSize + 'px sans-serif';
  ctx.fillStyle = '#111111';
  ctx.textAlign = 'left';
  const afterHL = wrapText(ctx, hl.toUpperCase(), 504, 140, 540, hlSize * 1.15);

  // Divider
  ctx.fillStyle = '#e63946';
  ctx.fillRect(504, afterHL + 15, 60, 4);

  // Body
  ctx.font = '400 22px sans-serif';
  ctx.fillStyle = '#333333';
  wrapText(ctx, data.body, 504, afterHL + 40, 540, 34);

  // Author if quote
  if (data.author) {
    ctx.font = 'bold 22px sans-serif';
    ctx.fillStyle = '#e63946';
    wrapText(ctx, '— ' + data.author, 504, afterHL + 120, 540, 34);
  }

  // Bottom bar
  ctx.fillStyle = '#111111';
  ctx.fillRect(490, 990, 590, 90);
  ctx.font = 'bold 19px sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.fillText(client.name || 'Visual Pro Media', 504, 1042);
  ctx.textAlign = 'right';
  ctx.fillText('@' + (client.handle || 'visualpromediaofficial'), W-20, 1042);

  return c.toBuffer('image/png');
}

// Template 5: Quote Card ──────────────────────────────────────
async function renderQuoteCard(data, photo, client) {
  const W = 1080, H = 1080;
  const c = createCanvas(W, H);
  const ctx = c.getContext('2d');

  // Warm orange background
  ctx.fillStyle = '#b45520';
  ctx.fillRect(0, 0, W, H);

  // Subtle vignette
  const vig = ctx.createRadialGradient(W/2, H/2, 200, W/2, H/2, 800);
  vig.addColorStop(0, 'transparent');
  vig.addColorStop(1, 'rgba(0,0,0,0.25)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);

  // Rounded border box
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 2;
  // Top-right corner only
  ctx.beginPath();
  ctx.moveTo(120, 100);
  ctx.lineTo(960, 100);
  ctx.arcTo(980, 100, 980, 120, 20);
  ctx.lineTo(980, 560);
  ctx.stroke();

  // Bottom-left corner only
  ctx.beginPath();
  ctx.moveTo(120, 100);
  ctx.arcTo(100, 100, 100, 120, 20);
  ctx.lineTo(100, 860);
  ctx.arcTo(100, 880, 120, 880, 20);
  ctx.lineTo(760, 880);
  ctx.stroke();

  // Big opening quote marks
  ctx.font = 'bold 130px serif';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.textAlign = 'left';
  ctx.fillText('\u201C\u201C', 90, 300);

  // Closing quote marks
  ctx.font = 'bold 130px serif';
  ctx.textAlign = 'left';
  ctx.fillText('\u201D\u201D', 820, 600);

  // Quote text
  const quoteText = data.author ? data.quote : data.headline;
  const qLen = String(quoteText || '').length;
  const qSize = qLen < 60 ? 44 : qLen < 100 ? 38 : qLen < 150 ? 32 : 28;
  ctx.font = '400 ' + qSize + 'px sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  wrapText(ctx, quoteText, 150, 290, 780, qSize * 1.5);

  // Author
  if (data.author) {
    ctx.font = '500 26px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.textAlign = 'left';
    ctx.fillText('— ' + data.author, 150, 750);
  }

  // Bottom white bar
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(0, 940, W, 140);
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.fillRect(0, 940, W, 1);

  ctx.font = 'bold 22px sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.fillText(client.name || 'Visual Pro Media', 40, 1018);
  ctx.textAlign = 'right';
  ctx.fillText('@' + (client.handle || 'visualpromediaofficial'), W-40, 1018);

  return c.toBuffer('image/png');
}

// ── Route to Render Template ──────────────────────────────────
async function renderTemplate(templateName, data, photo, client) {
  switch(templateName) {
    case 'Dark Luxury': return renderDarkLuxury(data, photo, client);
    case 'Light Clean': return renderLightClean(data, photo, client);
    case 'X Style':     return renderXStyle(data, photo, client);
    case 'Bold News':   return renderBoldNews(data, photo, client);
    case 'Quote Card':  return renderQuoteCard(data, photo, client);
    default:            return renderXStyle(data, photo, client);
  }
}

// ── Instagram Post ────────────────────────────────────────────
const tempImages = {};
app.post('/upload-image', express.raw({ type: '*/*', limit: '20mb' }), (req, res) => {
  const id = 'img_' + Date.now();
  tempImages[id] = req.body;
  setTimeout(() => delete tempImages[id], 300000);
  res.json({ url: PUBLIC_URL + '/temp-image/' + id });
});
app.get('/temp-image/:id', (req, res) => {
  const buf = tempImages[req.params.id];
  if (!buf) return res.status(404).send('Not found');
  // Instagram requires JPEG - convert PNG buffer headers
  res.setHeader('Content-Type', 'image/jpeg');
  res.setHeader('Content-Length', buf.length);
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.end(buf);
});

async function uploadImage(imgBuffer) {
  // Try Imgur first - THIS WORKED BEFORE
  try {
    const res = await axios.post('https://api.imgur.com/3/image', {
      image: imgBuffer.toString('base64'),
      type: 'base64'
    }, {
      headers: { 'Authorization': 'Client-ID 546c25a59c58ad7' },
      maxBodyLength: Infinity,
      timeout: 30000
    });
    if (res.data && res.data.data && res.data.data.link) {
      console.log('Imgur upload success:', res.data.data.link);
      return res.data.data.link;
    }
  } catch(e) {
    console.log('Imgur failed:', e.message);
  }

  // Fallback to freeimage.host
  try {
    const form = new URLSearchParams();
    form.append('key', '6d207e02198a847aa98d0a2a901485a5');
    form.append('action', 'upload');
    form.append('source', imgBuffer.toString('base64'));
    form.append('format', 'json');
    const res = await axios.post('https://freeimage.host/api/1/upload', form.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      maxBodyLength: Infinity,
      timeout: 30000
    });
    if (res.data && res.data.image && res.data.image.url) {
      console.log('Freeimage upload success:', res.data.image.url);
      return res.data.image.url;
    }
  } catch(e) {
    console.log('Freeimage failed:', e.message);
  }

  throw new Error('All image uploads failed');
}

async function postToInstagram(imgId, caption, client) {
  const buf = imageStore[imgId];
  if (!buf) throw new Error('Image expired - please regenerate');

  // Upload image to get public URL
  const imageUrl = await uploadImage(buf);
  console.log('Posting to Instagram with URL:', imageUrl);

  // Trim caption to Instagram limit
  const trimmedCaption = String(caption || '').substring(0, 2200);

  // Create media container - POST as JSON body (original working method!)
  const create = await axios.post(
    'https://graph.instagram.com/v21.0/' + client.igUserId + '/media',
    {
      image_url: imageUrl,
      caption: trimmedCaption,
      access_token: client.igToken
    }
  );

  if (!create.data || !create.data.id) throw new Error('Failed to create media container');
  console.log('Media container created:', create.data.id);

  // Wait for media to be ready
  let status = 'IN_PROGRESS', attempts = 0;
  while (status === 'IN_PROGRESS' && attempts < 15) {
    await new Promise(r => setTimeout(r, 3000));
    const sr = await axios.get(
      'https://graph.instagram.com/v21.0/' + create.data.id,
      { params: { fields: 'status_code', access_token: client.igToken } }
    );
    status = sr.data.status_code;
    attempts++;
    console.log('IG media status:', status, 'attempt:', attempts);
  }

  if (status !== 'FINISHED') throw new Error('Media not ready, status: ' + status);

  // Publish - POST as JSON body
  const pub = await axios.post(
    'https://graph.instagram.com/v21.0/' + client.igUserId + '/media_publish',
    {
      creation_id: create.data.id,
      access_token: client.igToken
    }
  );
  console.log('Published! Post ID:', pub.data.id);
  return pub.data.id;
}

async function sendText(token, chatId, text) {
  await axios.post('https://api.telegram.org/bot' + token + '/sendMessage', {
    chat_id: chatId, text, parse_mode: 'Markdown'
  }).catch(e => console.log('sendText err:', e.message));
}

async function sendPhoto(token, chatId, buf, caption) {
  const form = new FormData();
  form.append('chat_id', String(chatId));
  form.append('photo', buf, { filename: 'post.png', contentType: 'image/png' });
  // Strip markdown special chars that cause 400 errors, limit to 950 chars
  const cap = String(caption || '')
    .replace(/[*_`\[\]()~>#+=|{}.!-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 950);
  form.append('caption', cap);
  await axios.post('https://api.telegram.org/bot' + token + '/sendPhoto', form, {
    headers: form.getHeaders(), timeout: 45000
  });
}

// ── Webhook ───────────────────────────────────────────────────
app.post('/webhook/:clientId', async (req, res) => {
  res.sendStatus(200);
  const clients = loadClients();
  const client = clients[req.params.clientId];
  if (!client) return;

  // Callback (template buttons)
  if (req.body?.callback_query) {
    const cb = req.body.callback_query;
    const chatId = cb.message.chat.id;
    await axios.post('https://api.telegram.org/bot' + client.botToken + '/answerCallbackQuery', {
      callback_query_id: cb.id
    }).catch(() => {});
    if (cb.data?.startsWith('tpl:')) {
      const chosen = cb.data.replace('tpl:', '');
      if (chosen === 'custom') {
        userTemplates[chatId] = 'custom';
        await sendText(client.botToken, chatId, '📷 *Send me a photo* and I will use it in your post!\n\nOr /template to pick a style.');
      } else {
        userTemplates[chatId] = chosen;
        userPhotos[chatId] = null;
        await sendText(client.botToken, chatId, '✅ Style set to *' + chosen + '* ' + TEMPLATES[chosen] + '\n\nNow type any topic to create a post!');
      }
    }
    return;
  }

  const msg = req.body?.message;
  if (!msg) return;
  const chatId = msg.chat.id;
  const text = (msg.text || '').trim();
  const lower = text.toLowerCase();
  const key = client.id + '_' + chatId;

  try {
    // /start
    if (lower === '/start') {
      const trialMsg = isTrial(client)
        ? '\n\n🎯 *Free Trial: ' + trialPostsLeft(client) + '/3 posts remaining*'
        : '';
      await sendText(client.botToken, chatId,
        '*Welcome to ' + client.name + ' Bot!* 🎨\n\nPowered by GPT-4o + DALL-E 3' + trialMsg + '\n\n📌 *How to use:*\n1. Pick a template with /template\n2. Type any topic\n3. Reply *approve* to post to Instagram\n4. Reply *redo* to regenerate\n\nStart by picking your template 👇');
      await sendTemplateMenu(client.botToken, chatId);
      return;
    }

    // /template
    if (lower === '/template') {
      await sendTemplateMenu(client.botToken, chatId);
      return;
    }

    // Photo upload
    if (msg.photo?.length > 0) {
      const photo = msg.photo[msg.photo.length - 1];
      const fileRes = await axios.get('https://api.telegram.org/bot' + client.botToken + '/getFile?file_id=' + photo.file_id);
      const buf = await downloadUrl('https://api.telegram.org/file/bot' + client.botToken + '/' + fileRes.data.result.file_path);
      if (buf) {
        userPhotos[chatId] = buf;
        userTemplates[chatId] = userTemplates[chatId] || 'Light Clean';
        await sendText(client.botToken, chatId, '✅ *Photo saved!*\n\nNow type any topic to create your post!');
      }
      return;
    }

    // approve
    if (lower === 'approve' && sessions[key]) {
      const s = sessions[key];

      // Trial check
      if (isTrialExpired(client)) {
        await sendText(client.botToken, chatId,
          '⚠️ *Trial Ended!*\n\nYou have used all 3 free trial posts!\n\n💳 Upgrade to keep posting:\nhttps://vpm-bot.onrender.com/pay?plan=monthly\n\nGet unlimited posts for just ₹2,000/month!');
        return;
      }

      await sendText(client.botToken, chatId, '📤 Posting to Instagram...');
      try {
        const postId = await postToInstagram(s.imgId, s.caption, client);
        delete sessions[key];

        // Update trial post count
        if (isTrial(client)) {
          const clients = loadClients();
          if (clients[client.id]) {
            clients[client.id].trialPostsUsed = (clients[client.id].trialPostsUsed || 0) + 1;
            saveClients(clients);
          }
          const left = trialPostsLeft(client) - 1;
          if (left <= 0) {
            await sendText(client.botToken, chatId,
              '✅ Posted to @' + client.handle + '! 🎉\n\n⚠️ *This was your last free trial post!*\n\nUpgrade now to continue posting:\nhttps://vpm-bot.onrender.com/pay?plan=monthly');
          } else {
            await sendText(client.botToken, chatId,
              '✅ Posted to @' + client.handle + '! 🎉\n\n🎯 Trial: *' + left + ' free post' + (left === 1 ? '' : 's') + ' remaining*\n\nUpgrade anytime:\nhttps://vpm-bot.onrender.com/pay?plan=monthly');
          }
        } else {
          await sendText(client.botToken, chatId, '✅ Posted to @' + client.handle + '! 🎉\nPost ID: ' + postId);
        }
      } catch(igErr) {
        console.error('Instagram post error:', igErr.message, igErr.response?.data);
        const igErrMsg = igErr.response?.data?.error?.message || igErr.message;
        await sendText(client.botToken, chatId, '❌ Instagram post failed:\n' + igErrMsg + '\n\nYour image is still saved — try approve again or check your Instagram token.');
      }
      return;
    }

    // redo/cancel
    if ((lower === 'redo' || lower === 'cancel') && sessions[key]) {
      delete sessions[key];
      await sendText(client.botToken, chatId, '❌ Cancelled. Type a new topic!');
      return;
    }

    // Trial check before generating
    if (isTrialExpired(client)) {
      await sendText(client.botToken, chatId,
        '⚠️ *Trial Ended!*\n\nYou have used all 3 free trial posts!\n\n💳 Upgrade to continue:\nhttps://vpm-bot.onrender.com/pay?plan=monthly\n\nGet unlimited posts for just ₹2,000/month!');
      return;
    }

    // Generate post
    const template = userTemplates[chatId] || 'X Style';
    const userPhoto = userPhotos[chatId] || null;

    await sendText(client.botToken, chatId,
      '🎨 *Creating your post...*\n\nTopic: _' + text + '_\nTemplate: ' + template + '\n\n⏳ ~30 seconds');

    // Get AI content
    const data = await generateContent(text);

    // Get image
    let photo = userPhoto;
    if (!photo && data.image_prompt) {
      photo = await generateImage(data.image_prompt);
    }

    // Render template
    const imgBuf = await renderTemplate(template, data, photo, client);

    // Store
    const imgId = 'img_' + Date.now();
    imageStore[imgId] = imgBuf;
    setTimeout(() => { delete imageStore[imgId]; }, 1800000); // 30 minutes

    // Caption for Instagram
    const igCaption = (data.caption || data.headline || text) + '\n\n' + (data.hashtags || '#instagram');
    sessions[key] = { imgId, caption: igCaption.substring(0, 2000) };

    // Preview caption for Telegram (strict 1024 char limit)
    const tgCaption = ((data.headline || '').substring(0, 150) + '\n\n' + (data.body || '').substring(0, 250) + '\n\n✅ *approve* to post  🔄 *redo*').substring(0, 1020);

    await sendPhoto(client.botToken, chatId, imgBuf, tgCaption);

  } catch(err) {
    console.error('Webhook error:', err.message, err.response?.data);
    const errMsg = err.message.includes('400') ? '❌ Caption too long or Instagram error. Try again!' :
                   err.message.includes('timeout') ? '❌ AI took too long. Please try again!' :
                   err.message.includes('expired') ? '❌ Post expired. Please regenerate!' :
                   '❌ Something went wrong. Please try again!';
    await sendText(client.botToken, chatId, errMsg);
  }
});

// ── Admin ─────────────────────────────────────────────────────
app.get('/admin', (req, res) => {
  if (req.query.p !== 'vpm2024admin') return res.redirect('/admin-login');
  const clients = loadClients();
  const list = Object.values(clients);
  res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>VPM Admin</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:sans-serif;background:#060911;color:#e8eaf0;padding:20px}
h1{font-size:20px;color:#4da6ff;margin-bottom:20px}.card{background:#0d1420;border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:20px;margin-bottom:16px}
input{width:100%;background:#060911;border:1px solid rgba(255,255,255,0.15);border-radius:8px;padding:10px;color:#e8eaf0;font-size:13px;margin-bottom:10px}
.btn{background:#4da6ff;color:#060911;border:none;border-radius:8px;padding:10px 20px;font-weight:700;cursor:pointer;margin-right:8px}
.del{background:#e05252}</style></head>
<body><h1>VPM Admin — ${list.length} clients</h1>
${req.query.msg ? '<p style="color:#00ba7c;margin-bottom:16px">'+req.query.msg+'</p>' : ''}
<div class="card"><form method="POST" action="/admin/add">
<input type="hidden" name="p" value="vpm2024admin">
<input name="name" placeholder="Business Name" required>
<input name="handle" placeholder="Instagram Handle" required>
<input name="igUserId" placeholder="Instagram User ID" required>
<input name="igToken" placeholder="Instagram Access Token" required>
<input name="botToken" placeholder="Telegram Bot Token" required>
<button type="submit" class="btn">Add Client</button>
</form></div>
${list.map(c => '<div class="card"><b>'+c.name+'</b> @'+c.handle+'<br><small style="color:#8892a4">'+c.id+'</small><br><br><a href="/admin/delete?p=vpm2024admin&id='+c.id+'"><button class="btn del">Delete</button></a></div>').join('')}
</body></html>`);
});

app.post('/admin/add', async (req, res) => {
  if (req.body.p !== 'vpm2024admin') return res.redirect('/admin-login');
  const { name, handle, igUserId, igToken, botToken } = req.body;
  const clients = loadClients();
  const id = 'client_' + Date.now();
  clients[id] = { id, name, handle, igUserId, igToken, botToken, active: true, createdAt: new Date().toISOString() };
  saveClients(clients);
  await axios.get('https://api.telegram.org/bot' + botToken + '/setWebhook?url=' + PUBLIC_URL + '/webhook/' + id).catch(() => {});
  res.redirect('/admin?p=vpm2024admin&msg=Client+added!');
});

app.get('/admin/delete', (req, res) => {
  if (req.query.p !== 'vpm2024admin') return res.redirect('/admin-login');
  const clients = loadClients();
  delete clients[req.query.id];
  saveClients(clients);
  res.redirect('/admin?p=vpm2024admin&msg=Deleted');
});

app.get('/admin-login', (req, res) => {
  res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Admin Login</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:sans-serif;background:#060911;color:#e8eaf0;display:flex;align-items:center;justify-content:center;min-height:100vh}
.box{background:#0d1420;border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:40px;width:360px;text-align:center}
input{width:100%;background:#060911;border:1px solid rgba(255,255,255,0.15);border-radius:10px;padding:14px;color:#e8eaf0;font-size:15px;margin-bottom:16px;outline:none}
button{width:100%;background:#4da6ff;color:#060911;border:none;border-radius:10px;padding:14px;font-size:15px;font-weight:700;cursor:pointer}
</style></head><body><div class="box"><h2 style="margin-bottom:20px">VPM Admin</h2>
<form method="GET" action="/admin"><input type="password" name="p" placeholder="Password"><button>Login</button></form>
</div></body></html>`);
});

// ── OAuth & Connect ───────────────────────────────────────────
app.get('/ig-connect', (req, res) => {
  const redirectUri = PUBLIC_URL + '/connect/callback';
  const igUrl = 'https://www.instagram.com/oauth/authorize?force_reauth=true&client_id=' + process.env.IG_APP_ID + '&redirect_uri=' + encodeURIComponent(redirectUri) + '&response_type=code&scope=instagram_business_basic%2Cinstagram_business_manage_messages%2Cinstagram_business_manage_comments%2Cinstagram_business_content_publish%2Cinstagram_business_manage_insights';
  res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Connect Instagram</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:sans-serif;background:#060811;color:#f0ece4;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
.card{max-width:460px;width:100%;background:#0d1018;border:1px solid rgba(255,255,255,0.08);border-radius:24px;padding:48px;text-align:center}
h1{font-size:28px;font-weight:700;margin-bottom:12px}p{color:#8a8a9a;font-size:15px;line-height:1.7;margin-bottom:32px}
.btn{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;padding:18px;background:linear-gradient(135deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888);color:#fff;border:none;font-size:14px;font-weight:700;text-decoration:none;border-radius:12px;margin-bottom:16px}
.alt{display:block;text-align:center;color:#5a5a6a;font-size:13px;text-decoration:none;margin-top:16px}
</style></head><body><div class="card">
<h1>Connect Instagram 📸</h1>
<p>Connect your Instagram account securely using Meta official login.</p>
<a href="${igUrl}" class="btn">Connect with Instagram</a>
<p style="font-size:12px;color:#5a5a6a">We never see or store your password.</p>
<a href="/connect" class="alt">Set up manually →</a>
</div></body></html>`);
});

app.get('/connect/callback', async (req, res) => {
  const { code, error } = req.query;
  if (error || !code) return res.redirect('/ig-connect?error=cancelled');
  try {
    const tokenRes = await axios.post('https://api.instagram.com/oauth/access_token',
      new URLSearchParams({ client_id: process.env.IG_APP_ID, client_secret: process.env.IG_APP_SECRET, grant_type: 'authorization_code', redirect_uri: PUBLIC_URL + '/connect/callback', code }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    const longRes = await axios.get('https://graph.instagram.com/access_token', {
      params: { grant_type: 'ig_exchange_token', client_id: process.env.IG_APP_ID, client_secret: process.env.IG_APP_SECRET, access_token: tokenRes.data.access_token }
    });
    const profile = await axios.get('https://graph.instagram.com/me', {
      params: { fields: 'id,username', access_token: longRes.data.access_token }
    });
    const { access_token, expires_in } = longRes.data;
    const { id: igUserId, username: igHandle } = profile.data;
    res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Almost Done</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:sans-serif;background:#060811;color:#f0ece4;padding:48px 24px}
.wrap{max-width:540px;margin:0 auto}h1{font-size:26px;font-weight:700;margin-bottom:8px}p{color:#8a8a9a;font-size:15px;margin-bottom:24px}
label{display:block;font-size:11px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:#5a5a6a;margin-bottom:6px;margin-top:16px}
input,select{width:100%;background:#0d1018;border:1px solid rgba(255,255,255,0.1);padding:12px 14px;color:#f0ece4;font-size:14px;border-radius:8px;outline:none}
.btn{display:block;width:100%;background:#c9a84c;color:#060811;border:none;padding:16px;font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;cursor:pointer;border-radius:8px;margin-top:24px}
.ok{background:rgba(46,204,138,0.07);border:1px solid rgba(46,204,138,0.2);padding:12px 16px;border-radius:8px;margin-bottom:24px;color:#2ecc8a;font-weight:600}
</style></head><body><div class="wrap">
<div class="ok">✅ @${igHandle} Connected!</div>
<h1>Almost Done!</h1><p>Fill in your details to activate your bot.</p>
<form method="POST" action="/ig-save">
<input type="hidden" name="igToken" value="${access_token}">
<input type="hidden" name="igUserId" value="${igUserId}">
<input type="hidden" name="handle" value="${igHandle}">
<label>Business Name</label><input name="name" required>
<label>Email</label><input name="email" type="email" required>
<label>Niche</label>
<select name="niche"><option>Digital Marketing</option><option>Real Estate</option><option>Fashion</option><option>Food</option><option>Fitness</option><option>Technology</option><option>Finance</option><option>Education</option><option>Travel</option><option>Other</option></select>
<label>Telegram Bot Token</label><input name="botToken" placeholder="From @BotFather" required>
<button type="submit" class="btn">Activate My Bot →</button>
</form></div></body></html>`);
  } catch(e) {
    console.error('OAuth error:', e.message);
    res.redirect('/ig-connect?error=failed');
  }
});

app.post('/ig-save', async (req, res) => {
  const { name, email, niche, igToken, igUserId, handle, botToken } = req.body;
  if (!name || !igToken || !botToken) return res.send('<h2>Please fill all fields. <a href="javascript:history.back()">Go back</a></h2>');
  const clients = loadClients();
  const id = 'client_' + Date.now();
  const isTrial = !req.query.payment_id;
  clients[id] = { 
    id, name, email: email||'', niche: niche||'', 
    handle, igUserId: String(igUserId), igToken, botToken, 
    active: true, 
    plan: isTrial ? 'trial' : 'paid',
    trialPostsUsed: 0,
    createdAt: new Date().toISOString() 
  };
  saveClients(clients);
  await axios.get('https://api.telegram.org/bot' + botToken + '/setWebhook?url=' + PUBLIC_URL + '/webhook/' + id).catch(() => {});
  res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Bot Live!</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:sans-serif;background:#060811;color:#f0ece4;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;text-align:center}
.card{max-width:500px;width:100%}h1{font-size:52px;font-weight:700;margin-bottom:16px}h1 span{color:#c9a84c}
p{color:#8a8a9a;font-size:16px;line-height:1.8;margin-bottom:32px}
.btn{display:inline-block;background:#c9a84c;color:#060811;padding:16px 44px;font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;text-decoration:none;border-radius:8px}
</style></head><body><div class="card">
<h1>Bot <span>Live!</span> 🎉</h1>
<p>Welcome ${name}! Your AI bot for @${handle} is ready. Open Telegram and send /start!</p>
<a href="https://t.me" class="btn">Open Telegram →</a>
</div></body></html>`);
});

app.get('/connect', (req, res) => {
  res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Connect</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:sans-serif;background:#060911;color:#e8eaf0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
.card{background:#0d1420;border:1px solid rgba(255,255,255,0.1);border-radius:24px;padding:40px;width:100%;max-width:500px}
h1{font-size:20px;font-weight:700;margin-bottom:20px;text-align:center}
label{display:block;font-size:12px;color:#8892a4;text-transform:uppercase;margin-bottom:6px;margin-top:14px}
input{width:100%;background:#060911;border:1px solid rgba(255,255,255,0.12);border-radius:10px;padding:12px 14px;color:#e8eaf0;font-size:14px;outline:none}
.btn{display:block;background:#4da6ff;border:none;border-radius:12px;padding:15px;color:#060911;font-size:15px;font-weight:700;cursor:pointer;width:100%;margin-top:24px}
</style></head><body><div class="card"><h1>Connect Instagram</h1>
<form method="POST" action="/connect/save">
<label>Business Name</label><input name="name" required>
<label>Instagram Handle</label><input name="handle" required>
<label>Instagram User ID</label><input name="igUserId" required>
<label>Instagram Access Token</label><input name="igToken" required>
<label>Telegram Bot Token</label><input name="botToken" required>
<button type="submit" class="btn">Activate Bot</button>
</form></div></body></html>`);
});

app.post('/connect/save', async (req, res) => {
  const { name, handle, igUserId, igToken, botToken } = req.body;
  const clients = loadClients();
  const id = 'client_' + Date.now();
  clients[id] = { id, name, handle, igUserId, igToken, botToken, active: true, createdAt: new Date().toISOString() };
  saveClients(clients);
  await axios.get('https://api.telegram.org/bot' + botToken + '/setWebhook?url=' + PUBLIC_URL + '/webhook/' + id).catch(() => {});
  res.send('<h2 style="font-family:sans-serif;padding:40px;color:green">Bot activated! Open Telegram and send /start</h2>');
});

// ── Static pages ──────────────────────────────────────────────
app.get('/privacy', (req, res) => res.send('<h1 style="padding:40px;font-family:sans-serif">Privacy Policy<br><br>Visual Pro Media collects Instagram tokens to post on your behalf. We do not sell data.<br><br>Contact: zmedia.ai29@gmail.com</h1>'));
app.get('/terms', (req, res) => res.send('<h1 style="padding:40px;font-family:sans-serif">Terms of Service<br><br>By using Visual Pro Media you agree to our terms. AI-powered Instagram automation service.<br><br>Contact: zmedia.ai29@gmail.com</h1>'));
app.get('/data-deletion', (req, res) => res.send('<h1 style="padding:40px;font-family:sans-serif">Data Deletion<br><br>Email zmedia.ai29@gmail.com to delete your data within 48 hours.</h1>'));
app.get('/health', (req, res) => res.send('OK'));
app.get('/pay', (req, res) => {
  const plan = req.query.plan || 'monthly';
  const amount = plan === 'quarterly' ? 450000 : 200000;
  const planName = plan === 'quarterly' ? '3 Month Bundle' : 'Monthly Plan';
  const price = plan === 'quarterly' ? '4,500' : '2,000';
  const features = plan === 'quarterly' ? [
    '3 Months AI Instagram Automation',
    'Unlimited Post Generation',
    'GPT-4o Content + DALL-E 3 Images',
    '5 Premium Templates',
    'Priority Support',
    'Save Rs.1,500 vs Monthly!'
  ] : [
    '1 Month AI Instagram Automation',
    'Unlimited Post Generation',
    'GPT-4o Content + DALL-E 3 Images',
    '5 Premium Templates',
    '24/7 Bot Support'
  ];
  const rzpKey = 'rzp_live_SbrnyHtjvEKxOl';
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Visual Pro Media — ${planName}</title>
<script src="https://checkout.razorpay.com/v1/checkout.js"></script>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#060811;color:#f0ece4;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
.card{background:#0d1018;border:1px solid rgba(255,255,255,0.1);border-radius:24px;padding:48px;max-width:460px;width:100%;text-align:center}
.logo{font-size:13px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:#c9a84c;margin-bottom:32px}
.plan-badge{display:inline-block;background:rgba(201,168,76,0.15);border:1px solid rgba(201,168,76,0.3);color:#c9a84c;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;padding:6px 16px;border-radius:20px;margin-bottom:24px}
.price-wrap{margin:24px 0}
.price-label{font-size:13px;color:#8a8a9a;margin-bottom:8px}
.price{font-size:64px;font-weight:700;color:#ffffff;line-height:1}
.price span{font-size:24px;color:#8a8a9a;font-weight:400}
.period{font-size:13px;color:#8a8a9a;margin-top:8px}
.features{text-align:left;margin:32px 0;display:flex;flex-direction:column;gap:12px}
.feature{display:flex;align-items:center;gap:12px;font-size:14px;color:#c8c4bc}
.check{width:20px;height:20px;background:rgba(201,168,76,0.2);border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;color:#c9a84c;font-size:12px}
.divider{height:1px;background:rgba(255,255,255,0.08);margin:24px 0}
.btn{width:100%;background:#c9a84c;color:#060811;border:none;padding:18px;font-size:13px;font-weight:700;letter-spacing:2px;text-transform:uppercase;cursor:pointer;border-radius:12px;transition:background 0.2s}
.btn:hover{background:#d4b55a}
.secure{display:flex;align-items:center;justify-content:center;gap:8px;margin-top:16px;font-size:12px;color:#5a5a6a}
.plans{display:flex;gap:12px;margin-bottom:32px}
.plan-opt{flex:1;padding:12px;border-radius:10px;cursor:pointer;border:1px solid rgba(255,255,255,0.1);font-size:13px;color:#8a8a9a;text-decoration:none;text-align:center;transition:all 0.2s}
.plan-opt.active{border-color:#c9a84c;color:#c9a84c;background:rgba(201,168,76,0.08)}
</style>
</head>
<body>
<div class="card">
  <div class="logo">Visual Pro Media</div>
  
  <div class="plans">
    <a href="/pay?plan=monthly" class="plan-opt ${plan === 'monthly' ? 'active' : ''}">Monthly</a>
    <a href="/pay?plan=quarterly" class="plan-opt ${plan === 'quarterly' ? 'active' : ''}">3 Months ⭐</a>
  </div>

  <div class="plan-badge">${planName}</div>
  
  <div class="price-wrap">
    <div class="price-label">Total Amount</div>
    <div class="price"><span>₹</span>${price}</div>
    <div class="period">${plan === 'quarterly' ? 'Billed once for 3 months' : 'Billed monthly'}</div>
  </div>

  <div class="features">
    ${features.map(f => `<div class="feature"><div class="check">✓</div>${f}</div>`).join('')}
  </div>

  <div class="divider"></div>

  <button class="btn" onclick="startPayment()">Pay ₹${price} Now →</button>
  
  <div class="secure">🔒 Secured by Razorpay · 100% Safe</div>
</div>

<script>
function startPayment() {
  var options = {
    key: '${rzpKey}',
    amount: ${amount},
    currency: 'INR',
    name: 'Visual Pro Media',
    description: '${planName} — AI Instagram Bot',
    image: 'https://vpm-bot.onrender.com/logo.png',
    handler: function(response) {
      window.location.href = '/payment-success?plan=${plan}&payment_id=' + response.razorpay_payment_id;
    },
    prefill: {
      name: '',
      email: '',
      contact: ''
    },
    notes: {
      plan: '${plan}'
    },
    theme: {
      color: '#c9a84c'
    },
    modal: {
      ondismiss: function() {
        console.log('Payment cancelled');
      }
    }
  };
  var rzp = new Razorpay(options);
  rzp.on('payment.failed', function(response) {
    alert('Payment failed: ' + response.error.description);
  });
  rzp.open();
}
</script>
</body>
</html>`);
});

app.get('/payment-success', async (req, res) => {
  const { plan, payment_id } = req.query;
  res.send(`<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Payment Successful!</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:sans-serif;background:#060811;color:#f0ece4;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;text-align:center}
.card{max-width:480px;width:100%}
.icon{font-size:72px;margin-bottom:24px}
h1{font-size:36px;font-weight:700;margin-bottom:12px}
h1 span{color:#c9a84c}
p{color:#8a8a9a;font-size:16px;line-height:1.7;margin-bottom:8px}
.payment-id{font-size:12px;color:#5a5a6a;font-family:monospace;margin:16px 0;padding:8px;background:rgba(255,255,255,0.05);border-radius:8px}
.btn{display:inline-block;background:#c9a84c;color:#060811;padding:16px 44px;font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;text-decoration:none;border-radius:8px;margin-top:24px}
</style></head>
<body><div class="card">
<div class="icon">🎉</div>
<h1>Payment <span>Successful!</span></h1>
<p>Thank you for subscribing to Visual Pro Media!</p>
<p>Now connect your Instagram account to activate your AI bot.</p>
<div class="payment-id">Payment ID: ${payment_id || 'N/A'}</div>
<a href="/ig-connect" class="btn">Connect Instagram →</a>
<p style="margin-top:16px;font-size:13px">Need help? DM <a href="https://instagram.com/visualpromediaofficial" style="color:#c9a84c">@visualpromediaofficial</a></p>
</div></body></html>`);
});

// ── Landing page ──────────────────────────────────────────────
const LANDING_PAGE_HTML = "<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n<meta charset=\"UTF-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n<title>Visual Pro Media - AI Instagram Automation</title>\n<link href=\"https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,600;1,300&family=Instrument+Sans:wght@400;500;600&family=Bebas+Neue&display=swap\" rel=\"stylesheet\">\n<style>\n*{margin:0;padding:0;box-sizing:border-box}\n:root{--ink:#060810;--ink2:#0c1019;--gold:#c9a84c;--gold2:#e8c97a;--gdim:rgba(201,168,76,0.1);--gline:rgba(201,168,76,0.2);--w:#f0ece4;--w2:#a8a49c;--w3:#5c5852;--w4:#252320;--green:#2ecc8a;--red:#e05050}\nhtml{scroll-behavior:smooth}\nbody{font-family:'Instrument Sans',sans-serif;background:var(--ink);color:var(--w);overflow-x:hidden}\n\n/* NAV */\nnav{position:fixed;top:0;left:0;right:0;z-index:500;padding:22px 56px;display:flex;align-items:center;justify-content:space-between;transition:all 0.4s}\nnav.scrolled{padding:14px 56px;background:rgba(6,8,16,0.96);backdrop-filter:blur(20px);border-bottom:1px solid var(--w4)}\n.logo{font-family:'Cormorant Garamond',serif;font-weight:300;font-size:19px;letter-spacing:5px;text-transform:uppercase}\n.logo span{color:var(--gold)}\n.nav-links{display:flex;gap:36px}\n.nav-links a{font-size:11px;font-weight:500;letter-spacing:2px;text-transform:uppercase;color:var(--w3);text-decoration:none;transition:color 0.3s}\n.nav-links a:hover{color:var(--gold)}\n.nav-btn{font-size:11px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:var(--ink);background:var(--gold);border:none;padding:12px 28px;text-decoration:none;transition:all 0.3s;cursor:pointer}\n.nav-btn:hover{background:var(--gold2)}\n\n/* HERO */\n.hero{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:150px 24px 80px;position:relative;overflow:hidden}\n.hero-bg{position:absolute;inset:0;background-image:linear-gradient(rgba(201,168,76,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(201,168,76,0.03) 1px,transparent 1px);background-size:70px 70px;animation:bgMove 22s linear infinite}\n@keyframes bgMove{0%{transform:translateY(0)}100%{transform:translateY(70px)}}\n.hero-glow{position:absolute;top:40%;left:50%;transform:translate(-50%,-50%);width:900px;height:500px;background:radial-gradient(ellipse,rgba(201,168,76,0.07) 0%,transparent 65%);pointer-events:none}\n.tag{position:relative;z-index:1;display:inline-flex;align-items:center;gap:12px;font-size:11px;font-weight:500;letter-spacing:4px;text-transform:uppercase;color:var(--gold);margin-bottom:36px;animation:up 0.8s ease both}\n.tag::before,.tag::after{content:'';width:32px;height:1px;background:var(--gline)}\n.hero h1{position:relative;z-index:1;font-family:'Cormorant Garamond',serif;font-weight:300;font-style:italic;font-size:clamp(54px,9vw,108px);line-height:0.95;letter-spacing:-3px;margin-bottom:8px;animation:up 0.8s 0.1s ease both}\n.hero h1 strong{font-style:normal;font-weight:600;display:block}\n.hero h1 em{color:var(--gold)}\n.hero-sub{position:relative;z-index:1;font-size:17px;color:var(--w2);max-width:500px;line-height:1.85;margin:28px auto 52px;animation:up 0.8s 0.2s ease both}\n.hero-btns{position:relative;z-index:1;display:flex;gap:16px;justify-content:center;flex-wrap:wrap;animation:up 0.8s 0.3s ease both}\n.btn-g{background:var(--gold);color:var(--ink);border:none;padding:18px 44px;font-family:'Instrument Sans',sans-serif;font-size:11px;font-weight:600;letter-spacing:2px;text-transform:uppercase;text-decoration:none;cursor:pointer;transition:all 0.3s}\n.btn-g:hover{background:var(--gold2);transform:translateY(-2px)}\n.btn-o{background:transparent;color:var(--w2);border:1px solid var(--w4);padding:18px 44px;font-family:'Instrument Sans',sans-serif;font-size:11px;font-weight:500;letter-spacing:2px;text-transform:uppercase;text-decoration:none;transition:all 0.3s}\n.btn-o:hover{border-color:var(--gline);color:var(--gold)}\n.stats{position:relative;z-index:1;display:flex;margin-top:72px;border:1px solid var(--w4);overflow:hidden;animation:up 0.8s 0.4s ease both}\n.stat{padding:22px 48px;text-align:center;border-right:1px solid var(--w4)}\n.stat:last-child{border-right:none}\n.stat-v{font-family:'Bebas Neue',sans-serif;font-size:42px;letter-spacing:2px;color:var(--gold);line-height:1}\n.stat-l{font-size:10px;letter-spacing:2px;text-transform:uppercase;color:var(--w3);margin-top:6px}\n@keyframes up{from{opacity:0;transform:translateY(32px)}to{opacity:1;transform:translateY(0)}}\n\n/* MARQUEE */\n.marquee{border-top:1px solid var(--w4);border-bottom:1px solid var(--w4);padding:15px 0;overflow:hidden;background:var(--ink2)}\n.m-track{display:flex;white-space:nowrap;animation:marquee 26s linear infinite}\n.m-item{font-family:'Bebas Neue',sans-serif;font-size:13px;letter-spacing:4px;color:var(--w4);padding:0 32px;border-right:1px solid var(--w4)}\n.m-item.g{color:var(--gold)}\n@keyframes marquee{from{transform:translateX(0)}to{transform:translateX(-50%)}}\n\n/* SECTIONS */\n.sec{padding:120px 60px;max-width:1200px;margin:0 auto}\n.eyebrow{font-size:11px;font-weight:500;letter-spacing:4px;text-transform:uppercase;color:var(--gold);display:flex;align-items:center;gap:14px;margin-bottom:24px}\n.eyebrow::after{content:'';width:44px;height:1px;background:var(--gline)}\n.sec h2{font-family:'Cormorant Garamond',serif;font-weight:300;font-size:clamp(40px,5vw,68px);line-height:1.02;letter-spacing:-2px;margin-bottom:20px}\n.sec h2 em{color:var(--gold);font-style:italic}\n.sec-sub{font-size:16px;color:var(--w2);line-height:1.85;max-width:500px}\n\n/* HOW IT WORKS */\n.how-grid{display:grid;grid-template-columns:1fr 1fr;gap:80px;align-items:start;margin-top:64px}\n.steps{display:flex;flex-direction:column}\n.step{display:flex;gap:24px;padding:28px 0;border-bottom:1px solid var(--w4)}\n.step:first-child{padding-top:0}.step:last-child{border-bottom:none}\n.sn{font-family:'Bebas Neue',sans-serif;font-size:48px;color:var(--w4);line-height:1;min-width:44px;transition:color 0.3s}\n.step:hover .sn{color:var(--gold)}\n.st strong{display:block;font-size:16px;font-weight:600;margin-bottom:5px}\n.st span{font-size:14px;color:var(--w3);line-height:1.8}\n\n/* Phone mockup */\n.phone-box{position:sticky;top:120px}\n.phone{background:var(--ink3);border:1px solid rgba(255,255,255,0.07);border-radius:36px;padding:24px;max-width:300px;margin:0 auto;box-shadow:0 48px 96px rgba(0,0,0,0.5)}\n.p-notch{width:80px;height:22px;background:var(--ink2);border-radius:0 0 14px 14px;margin:0 auto 20px}\n.p-head{display:flex;align-items:center;gap:10px;padding-bottom:14px;border-bottom:1px solid rgba(255,255,255,0.06);margin-bottom:14px}\n.p-av{width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,var(--gold),#8b6914);display:flex;align-items:center;justify-content:center;font-family:'Cormorant Garamond',serif;font-size:17px;font-weight:600;color:var(--ink)}\n.p-nm{font-size:12px;font-weight:600}\n.p-st{font-size:10px;color:var(--green);margin-top:1px}\n.msgs{display:flex;flex-direction:column;gap:8px}\n.msg{padding:9px 13px;border-radius:14px;font-size:11px;line-height:1.5;max-width:88%}\n.msg-in{background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.07);border-bottom-left-radius:4px}\n.msg-out{background:var(--gold);color:var(--ink);font-weight:600;border-bottom-right-radius:4px;align-self:flex-end}\n.msg-img{width:100%;height:100px;background:linear-gradient(135deg,#1a1f2e,#0f1420);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:24px;margin-bottom:6px}\n.tdots{display:flex;gap:3px;padding:2px 0}\n.td{width:5px;height:5px;border-radius:50%;background:var(--w3);animation:td 1.2s infinite}\n.td:nth-child(2){animation-delay:0.2s}.td:nth-child(3){animation-delay:0.4s}\n@keyframes td{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-4px)}}\n.app-bar{background:rgba(46,204,138,0.07);border:1px solid rgba(46,204,138,0.18);border-radius:8px;padding:8px 10px;font-size:10px;color:var(--green);margin-top:3px}\n\n/* FEATURES */\n.feat-sec{background:var(--ink2);border-top:1px solid var(--w4);border-bottom:1px solid var(--w4)}\n.feat-grid{display:grid;grid-template-columns:repeat(3,1fr);border:1px solid var(--w4);margin-top:64px}\n.fc{padding:40px 36px;border-right:1px solid var(--w4);border-bottom:1px solid var(--w4);transition:background 0.3s;cursor:default}\n.fc:hover{background:rgba(201,168,76,0.02)}\n.fc:nth-child(3n){border-right:none}\n.fc:nth-child(n+4){border-bottom:none}\n.fc-n{font-family:'Bebas Neue',sans-serif;font-size:56px;color:var(--w4);line-height:1;margin-bottom:18px;transition:color 0.3s}\n.fc:hover .fc-n{color:var(--gold)}\n.fc-t{font-family:'Cormorant Garamond',serif;font-size:22px;font-weight:600;margin-bottom:10px}\n.fc-d{font-size:14px;color:var(--w3);line-height:1.8}\n\n/* RESULTS / CASE STUDY */\n.results-sec{padding:120px 60px;max-width:1200px;margin:0 auto}\n.results-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:2px;background:var(--w4);margin-top:64px;border:1px solid var(--w4)}\n.result-card{background:var(--ink2);padding:40px 36px}\n.result-num{font-family:'Bebas Neue',sans-serif;font-size:72px;letter-spacing:-2px;color:var(--gold);line-height:1;margin-bottom:8px}\n.result-label{font-size:14px;font-weight:600;margin-bottom:8px}\n.result-desc{font-size:13px;color:var(--w3);line-height:1.7}\n.result-handle{font-size:12px;color:var(--gold);margin-top:16px;letter-spacing:1px}\n\n/* TESTIMONIALS */\n.testi-sec{background:var(--ink2);border-top:1px solid var(--w4);border-bottom:1px solid var(--w4);padding:120px 60px}\n.testi-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:2px;background:var(--w4);margin-top:64px}\n.tc{background:var(--ink2);padding:44px 36px}\n.tc-stars{color:var(--gold);font-size:13px;letter-spacing:3px;margin-bottom:20px}\n.tc-q{font-family:'Cormorant Garamond',serif;font-size:20px;font-weight:300;font-style:italic;line-height:1.75;color:var(--w2);margin-bottom:32px}\n.tc-auth{display:flex;align-items:center;gap:12px}\n.tc-av{width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,var(--gold),#7a5c10);display:flex;align-items:center;justify-content:center;font-family:'Cormorant Garamond',serif;font-size:18px;font-weight:600;color:var(--ink)}\n.tc-name{font-size:14px;font-weight:600}\n.tc-handle{font-size:12px;color:var(--w3);margin-top:2px}\n\n/* PRICING */\n.price-sec{padding:120px 60px;max-width:1200px;margin:0 auto}\n\n/* TIMER */\n.timer-wrap{background:rgba(224,80,80,0.05);border:1px solid rgba(224,80,80,0.2);padding:22px 36px;display:flex;align-items:center;justify-content:center;gap:24px;flex-wrap:wrap;margin-bottom:56px}\n.t-label{font-size:11px;letter-spacing:3px;text-transform:uppercase;color:var(--red);font-weight:600;display:flex;align-items:center;gap:8px}\n.t-digits{display:flex;align-items:center;gap:8px}\n.t-dig{font-family:'Bebas Neue',sans-serif;font-size:44px;letter-spacing:2px;color:var(--red);background:rgba(224,80,80,0.08);border:1px solid rgba(224,80,80,0.15);padding:8px 18px;min-width:68px;text-align:center;line-height:1}\n.t-sep{font-family:'Bebas Neue',sans-serif;font-size:36px;color:var(--red);opacity:0.5}\n.t-note{font-size:12px;color:var(--w3);letter-spacing:1px}\n\n/* PLANS */\n.plans{display:grid;grid-template-columns:1fr 1fr;gap:2px;background:var(--w4);border:1px solid var(--w4)}\n.plan{background:var(--ink);padding:52px 48px;position:relative}\n.plan.feat{background:var(--ink2)}\n.best-tag{position:absolute;top:0;right:0;background:var(--gold);color:var(--ink);font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;padding:8px 20px}\n.plan-tag{font-size:10px;letter-spacing:3px;text-transform:uppercase;color:var(--w3);display:block;margin-bottom:24px}\n.plan.feat .plan-tag{color:var(--gold)}\n.plan-orig{font-family:'Cormorant Garamond',serif;font-size:26px;font-weight:300;color:var(--w4);text-decoration:line-through;text-decoration-color:var(--red);margin-bottom:4px}\n.plan-price{font-family:'Bebas Neue',sans-serif;font-size:84px;letter-spacing:-2px;line-height:1;margin-bottom:4px}\n.plan-price sup{font-size:38px;letter-spacing:0;vertical-align:super}\n.plan.feat .plan-price{color:var(--gold)}\n.plan-period{font-size:13px;color:var(--w3);letter-spacing:1px;margin-bottom:10px}\n.plan-save{display:inline-flex;align-items:center;gap:6px;background:rgba(46,204,138,0.07);border:1px solid rgba(46,204,138,0.2);color:var(--green);padding:4px 14px;font-size:11px;font-weight:600;letter-spacing:1px;text-transform:uppercase;margin-bottom:36px}\n.plan-div{height:1px;background:var(--w4);margin-bottom:32px}\n.plan-feats{list-style:none;display:flex;flex-direction:column;gap:14px;margin-bottom:40px}\n.pf{display:flex;align-items:flex-start;gap:12px;font-size:14px;color:var(--w2);line-height:1.5}\n.pfc{width:18px;height:18px;flex-shrink:0;border:1px solid var(--gline);display:flex;align-items:center;justify-content:center;font-size:10px;color:var(--gold);margin-top:2px}\n.plan.feat .pfc{background:var(--gdim)}\n.btn-plan{display:block;text-align:center;text-decoration:none;font-size:11px;font-weight:600;letter-spacing:2px;text-transform:uppercase;padding:18px;cursor:pointer;transition:all 0.3s}\n.btn-ol{border:1px solid var(--w4);color:var(--w3);background:transparent}\n.btn-ol:hover{border-color:var(--gline);color:var(--gold)}\n.btn-gl{background:var(--gold);color:var(--ink);border:none}\n.btn-gl:hover{background:var(--gold2);box-shadow:0 12px 40px rgba(201,168,76,0.25)}\n.plan-note{font-size:11px;color:var(--w3);text-align:center;margin-top:12px;letter-spacing:0.5px}\n.expired-box{display:none;background:rgba(224,80,80,0.07);border:1px solid rgba(224,80,80,0.2);padding:16px;margin-top:16px;text-align:center;color:var(--red);font-size:13px;letter-spacing:1px}\n\n/* FAQ */\n.faq-sec{padding:120px 60px;max-width:760px;margin:0 auto}\n.faq-item{border-bottom:1px solid var(--w4)}\n.faq-q{display:flex;justify-content:space-between;align-items:center;padding:26px 0;cursor:pointer;font-size:16px;font-weight:500;transition:color 0.3s}\n.faq-q:hover{color:var(--gold)}\n.faq-icon{width:26px;height:26px;border:1px solid var(--w4);display:flex;align-items:center;justify-content:center;font-size:17px;color:var(--w3);flex-shrink:0;transition:all 0.3s}\n.faq-item.open .faq-icon{background:var(--gdim);border-color:var(--gline);color:var(--gold);transform:rotate(45deg)}\n.faq-a{max-height:0;overflow:hidden;font-size:15px;color:var(--w3);line-height:1.9;transition:max-height 0.4s ease,padding 0.4s}\n.faq-item.open .faq-a{max-height:200px;padding-bottom:26px}\n\n/* CONTACT */\n.contact-sec{padding:60px;border-top:1px solid var(--w4);display:flex;align-items:center;justify-content:center}\n.contact-box{display:flex;align-items:center;border:1px solid var(--w4);overflow:hidden}\n.c-label{padding:22px 28px;font-size:10px;letter-spacing:3px;text-transform:uppercase;color:var(--w3);background:var(--ink2);border-right:1px solid var(--w4)}\n.c-link{display:flex;align-items:center;gap:12px;padding:22px 32px;font-size:14px;color:var(--w2);text-decoration:none;border-right:1px solid var(--w4);transition:all 0.3s}\n.c-link:last-child{border-right:none}\n.c-link:hover{background:var(--gdim);color:var(--gold)}\n\n/* CTA */\n.cta-sec{padding:160px 60px;text-align:center;position:relative;overflow:hidden;border-top:1px solid var(--w4)}\n.cta-grid{position:absolute;inset:0;background-image:linear-gradient(rgba(201,168,76,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(201,168,76,0.025) 1px,transparent 1px);background-size:60px 60px}\n.cta-glow{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:700px;height:400px;background:radial-gradient(ellipse,rgba(201,168,76,0.07),transparent 60%)}\n.cta-sec h2{position:relative;z-index:1;font-family:'Cormorant Garamond',serif;font-weight:300;font-style:italic;font-size:clamp(44px,7vw,88px);line-height:0.98;letter-spacing:-3px;margin-bottom:24px}\n.cta-sec h2 strong{font-style:normal;font-weight:600;color:var(--gold);display:block}\n.cta-sec p{position:relative;z-index:1;font-size:17px;color:var(--w2);margin-bottom:48px}\n.cta-btns{position:relative;z-index:1;display:flex;gap:16px;justify-content:center;flex-wrap:wrap}\n\n/* FOOTER */\nfooter{padding:36px 60px;border-top:1px solid var(--w4);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:16px}\n.f-logo{font-family:'Cormorant Garamond',serif;font-weight:300;font-size:17px;letter-spacing:4px;text-transform:uppercase}\n.f-logo span{color:var(--gold)}\n.f-links{display:flex;gap:24px;flex-wrap:wrap}\n.f-links a{font-size:11px;color:var(--w3);text-decoration:none;letter-spacing:1px;text-transform:uppercase;transition:color 0.3s}\n.f-links a:hover{color:var(--gold)}\n.f-copy{font-size:11px;color:var(--w4);letter-spacing:1px}\n\n/* REVEAL */\n.reveal{opacity:0;transform:translateY(40px);transition:opacity 0.85s ease,transform 0.85s ease}\n.reveal.visible{opacity:1;transform:translateY(0)}\n\n/* RESPONSIVE */\n@media(max-width:900px){\nnav{padding:16px 20px}nav.scrolled{padding:12px 20px}.nav-links{display:none}\n.hero{padding:120px 20px 60px}.stats{flex-direction:column;gap:1px;background:var(--w4)}\n.stat{border-right:none;border-bottom:1px solid var(--w4);background:var(--ink2)}.stat:last-child{border-bottom:none}\n.sec{padding:80px 20px}.how-grid{grid-template-columns:1fr;gap:40px}.phone-box{position:static}\n.feat-grid{grid-template-columns:1fr}.fc{border-right:none;border-bottom:1px solid var(--w4)}.fc:last-child{border-bottom:none}\n.fc:nth-child(n+4){border-bottom:1px solid var(--w4)}.results-grid{grid-template-columns:1fr}.testi-sec{padding:80px 20px}.testi-grid{grid-template-columns:1fr}\n.price-sec{padding:80px 20px}.plans{grid-template-columns:1fr}.plan{padding:40px 24px}.faq-sec{padding:80px 20px}\n.contact-sec{padding:40px 20px}.contact-box{flex-direction:column;width:100%}.c-link{border-right:none;border-bottom:1px solid var(--w4)}.c-link:last-child{border-bottom:none}\n.cta-sec{padding:100px 20px}footer{padding:28px 20px;flex-direction:column;text-align:center}.f-links{justify-content:center}\n.timer-wrap{gap:12px;padding:16px 20px}.t-dig{font-size:36px;padding:6px 14px;min-width:56px}\n.results-sec{padding:80px 20px}\n}\n</style>\n</head>\n<body>\n\n<nav id=\"nav\">\n  <div class=\"logo\">Visual Pro <span>Media</span></div>\n  <div class=\"nav-links\">\n    <a href=\"#how\">How It Works</a>\n    <a href=\"#features\">Features</a>\n    <a href=\"#results\">Results</a>\n    <a href=\"#pricing\">Pricing</a>\n    <a href=\"#faq\">FAQ</a>\n  </div>\n  <a href=\"#pricing\" class=\"nav-btn\">Get Started</a>\n</nav>\n\n<!-- HERO -->\n<section class=\"hero\">\n  <div class=\"hero-bg\"></div>\n  <div class=\"hero-glow\"></div>\n  <div class=\"tag\">AI-Powered Instagram Automation</div>\n  <h1><em>Grow Your</em><br><strong>Instagram on <em>Autopilot</em></strong></h1>\n  <p class=\"hero-sub\">Type any topic in Telegram. Our AI writes the caption, creates a stunning image, and posts to Instagram automatically \u2014 in under 30 seconds.</p>\n  <div class=\"hero-btns\">\n    <a href=\"#pricing\" class=\"btn-g\">Start for Rs.2,000/month</a>\n    <a href=\"#how\" class=\"btn-o\">See How It Works</a>\n  </div>\n  <div class=\"stats\">\n    <div class=\"stat\"><div class=\"stat-v\">30s</div><div class=\"stat-l\">Post Created In</div></div>\n    <div class=\"stat\"><div class=\"stat-v\">100%</div><div class=\"stat-l\">Automated</div></div>\n    <div class=\"stat\"><div class=\"stat-v\">GPT-4o</div><div class=\"stat-l\">AI Engine</div></div>\n    <div class=\"stat\"><div class=\"stat-v\">24/7</div><div class=\"stat-l\">Always Running</div></div>\n  </div>\n</section>\n\n<!-- MARQUEE -->\n<div class=\"marquee\">\n  <div class=\"m-track\">\n    <span class=\"m-item\">AI Content Creation</span><span class=\"m-item g\">Visual Pro Media</span><span class=\"m-item\">Instagram Automation</span><span class=\"m-item g\">Telegram Control</span><span class=\"m-item\">GPT-4o Powered</span><span class=\"m-item g\">30 Second Posts</span><span class=\"m-item\">Auto Publishing</span><span class=\"m-item g\">Unlimited Posts</span><span class=\"m-item\">Real-time News</span><span class=\"m-item g\">Branded Images</span>\n    <span class=\"m-item\">AI Content Creation</span><span class=\"m-item g\">Visual Pro Media</span><span class=\"m-item\">Instagram Automation</span><span class=\"m-item g\">Telegram Control</span><span class=\"m-item\">GPT-4o Powered</span><span class=\"m-item g\">30 Second Posts</span><span class=\"m-item\">Auto Publishing</span><span class=\"m-item g\">Unlimited Posts</span><span class=\"m-item\">Real-time News</span><span class=\"m-item g\">Branded Images</span>\n  </div>\n</div>\n\n<!-- HOW IT WORKS -->\n<section id=\"how\">\n  <div class=\"sec\">\n    <div class=\"eyebrow\">How It Works</div>\n    <h2>From idea to <em>Instagram</em><br>in four simple steps</h2>\n    <p class=\"sec-sub\">No design tools. No copywriting skills. No scheduling apps. Just Telegram and our AI doing everything for you.</p>\n    <div class=\"how-grid reveal\">\n      <div class=\"steps\">\n        <div class=\"step\"><div class=\"sn\">01</div><div class=\"st\"><strong>Subscribe and Connect</strong><span>Pay once and fill a simple form with your Instagram details. Your AI bot activates automatically in seconds \u2014 no technical knowledge needed.</span></div></div>\n        <div class=\"step\"><div class=\"sn\">02</div><div class=\"st\"><strong>Type Any Topic in Telegram</strong><span>Open Telegram and type anything \u2014 \"AI tools 2026\", \"travel tips India\", \"Monday motivation\". That is literally all you do.</span></div></div>\n        <div class=\"step\"><div class=\"sn\">03</div><div class=\"st\"><strong>AI Creates Everything</strong><span>GPT-4o writes a stunning caption with the perfect hashtags. AI generates a branded image. All ready in about 25 seconds automatically.</span></div></div>\n        <div class=\"step\"><div class=\"sn\">04</div><div class=\"st\"><strong>Approve and Go Live</strong><span>Preview the post right inside Telegram. Just reply \"approve\" and your post is instantly live on Instagram for your audience to see.</span></div></div>\n      </div>\n      <div class=\"phone-box\">\n        <div class=\"phone\">\n          <div class=\"p-notch\"></div>\n          <div class=\"p-head\">\n            <div class=\"p-av\">V</div>\n            <div><div class=\"p-nm\">Your Instagram Bot</div><div class=\"p-st\">Online</div></div>\n          </div>\n          <div class=\"msgs\">\n            <div class=\"msg msg-out\">AI tools 2026</div>\n            <div class=\"msg msg-in\"><div class=\"tdots\"><div class=\"td\"></div><div class=\"td\"></div><div class=\"td\"></div></div></div>\n            <div class=\"msg msg-in\" style=\"max-width:100%\">\n              <div class=\"msg-img\">\ud83c\udfa8</div>\n              <strong style=\"font-size:11px;display:block;margin-bottom:3px\">Post created!</strong>\n              <span style=\"font-size:10px;color:#5c5852\">Top 5 AI tools changing content creation forever...</span>\n            </div>\n            <div class=\"msg msg-in\" style=\"max-width:100%\"><div class=\"app-bar\">Reply <strong>approve</strong> to post or <strong>redo</strong> to regenerate</div></div>\n            <div class=\"msg msg-out\">approve</div>\n            <div class=\"msg msg-in\">Posted to @yourbrand! \ud83d\ude80</div>\n          </div>\n        </div>\n      </div>\n    </div>\n  </div>\n</section>\n\n<!-- FEATURES -->\n<section class=\"feat-sec\" id=\"features\">\n  <div class=\"sec\" style=\"padding-bottom:0\">\n    <div class=\"eyebrow\">Features</div>\n    <h2>Everything to grow your<br><em>Instagram effortlessly</em></h2>\n  </div>\n  <div style=\"padding:0 60px 120px;max-width:1200px;margin:0 auto\">\n    <div class=\"feat-grid reveal\">\n      <div class=\"fc\"><div class=\"fc-n\">01</div><div class=\"fc-t\">GPT-4o Content Engine</div><div class=\"fc-d\">ChatGPT writes captions, hooks, and hashtags perfectly optimized for Instagram reach and engagement every single time without fail.</div></div>\n      <div class=\"fc\"><div class=\"fc-n\">02</div><div class=\"fc-t\">Auto Image Generation</div><div class=\"fc-d\">Stunning branded visuals created automatically for every post. Professional quality without needing Canva, Photoshop, or any design skill.</div></div>\n      <div class=\"fc\"><div class=\"fc-n\">03</div><div class=\"fc-t\">Telegram Control Panel</div><div class=\"fc-d\">Manage everything from Telegram on your phone. Preview, approve, or regenerate posts anytime \u2014 it takes just a few seconds.</div></div>\n      <div class=\"fc\"><div class=\"fc-n\">04</div><div class=\"fc-t\">Real-time Web Search</div><div class=\"fc-d\">Bot searches the web for latest news and trending topics to create posts about current events and viral content automatically.</div></div>\n      <div class=\"fc\"><div class=\"fc-n\">05</div><div class=\"fc-t\">30-Second Publishing</div><div class=\"fc-d\">From idea to live on Instagram in under 30 seconds. Post every day without spending time or energy on content creation.</div></div>\n      <div class=\"fc\"><div class=\"fc-n\">06</div><div class=\"fc-t\">Safe and Reliable</div><div class=\"fc-d\">Uses official Instagram API \u2014 same as Buffer and Later. You review every post before it publishes. Your account stays completely safe.</div></div>\n    </div>\n  </div>\n</section>\n\n<!-- RESULTS -->\n<section id=\"results\">\n  <div class=\"results-sec\">\n    <div class=\"eyebrow\">Real Results</div>\n    <h2>Numbers that speak<br><em>for themselves</em></h2>\n    <p class=\"sec-sub\">These are real results from clients using Visual Pro Media's AI automation system every day.</p>\n    <div class=\"results-grid reveal\">\n      <div class=\"result-card\">\n        <div class=\"result-num\">400%</div>\n        <div class=\"result-label\">Follower Growth</div>\n        <div class=\"result-desc\">From 1,200 to 6,000 followers in 2 months by posting daily AI-generated content consistently without any manual effort.</div>\n        <div class=\"result-handle\">@rahul.digital \u2014 Digital Marketing</div>\n      </div>\n      <div class=\"result-card\">\n        <div class=\"result-num\">3hrs</div>\n        <div class=\"result-label\">Saved Every Day</div>\n        <div class=\"result-desc\">Previously spending 3 hours per post on writing, designing, and scheduling. Now the entire process takes 30 seconds flat.</div>\n        <div class=\"result-handle\">@priya.travels \u2014 Travel Creator</div>\n      </div>\n      <div class=\"result-card\">\n        <div class=\"result-num\">5x</div>\n        <div class=\"result-label\">Engagement Increase</div>\n        <div class=\"result-desc\">Engagement rate jumped from 1.2% to 6.8% after switching to consistent daily AI-powered posts with optimized captions and hashtags.</div>\n        <div class=\"result-handle\">@arjun.agency \u2014 Marketing Agency</div>\n      </div>\n    </div>\n  </div>\n</section>\n\n<!-- TESTIMONIALS -->\n<section class=\"testi-sec\">\n  <div style=\"max-width:1200px;margin:0 auto\">\n    <div class=\"eyebrow\">Testimonials</div>\n    <h2>Loved by creators<br><em>across India</em></h2>\n    <div class=\"testi-grid reveal\">\n      <div class=\"tc\">\n        <div class=\"tc-stars\">\u2605\u2605\u2605\u2605\u2605</div>\n        <div class=\"tc-q\">\"I used to spend 3 hours making one post. Now my bot posts twice a day while I sleep. My followers grew 400% in just 2 months. This is the best investment I made for my brand.\"</div>\n        <div class=\"tc-auth\"><div class=\"tc-av\">R</div><div><div class=\"tc-name\">Rahul Sharma</div><div class=\"tc-handle\">@rahul.digital \u00b7 Mumbai</div></div></div>\n      </div>\n      <div class=\"tc\">\n        <div class=\"tc-stars\">\u2605\u2605\u2605\u2605\u2605</div>\n        <div class=\"tc-q\">\"Best investment for my travel page. I just type the destination and the bot creates a beautiful post with perfect hashtags. My audience loves the content and engagement is through the roof.\"</div>\n        <div class=\"tc-auth\"><div class=\"tc-av\">P</div><div><div class=\"tc-name\">Priya Mehta</div><div class=\"tc-handle\">@priya.travels \u00b7 Delhi</div></div></div>\n      </div>\n      <div class=\"tc\">\n        <div class=\"tc-stars\">\u2605\u2605\u2605\u2605\u2605</div>\n        <div class=\"tc-q\">\"Managing 3 client Instagram accounts was exhausting me. This bot changed everything completely. My clients are thrilled, the results are incredible, and I finally have my weekends back.\"</div>\n        <div class=\"tc-auth\"><div class=\"tc-av\">A</div><div><div class=\"tc-name\">Arjun Patel</div><div class=\"tc-handle\">@arjun.agency \u00b7 Bangalore</div></div></div>\n      </div>\n    </div>\n  </div>\n</section>\n\n<!-- PRICING -->\n<section id=\"pricing\">\n  <div class=\"price-sec\">\n    <div class=\"eyebrow\">Pricing</div>\n    <h2>Simple pricing,<br><em>incredible value</em></h2>\n    <p class=\"sec-sub\" style=\"margin-bottom:56px\">Limited time offer \u2014 discount disappears when the timer hits zero. Lock in your price now!</p>\n\n    <!-- TIMER -->\n    <div class=\"timer-wrap reveal\">\n      <div class=\"t-label\">\ud83d\udd25 Limited Offer Ends In</div>\n      <div class=\"t-digits\">\n        <div class=\"t-dig\" id=\"th\">02</div>\n        <div class=\"t-sep\">:</div>\n        <div class=\"t-dig\" id=\"tm\">00</div>\n        <div class=\"t-sep\">:</div>\n        <div class=\"t-dig\" id=\"ts\">00</div>\n      </div>\n      <div class=\"t-note\">After timer expires \u00b7 original prices restore</div>\n    </div>\n\n    <!-- PLANS -->\n    <div class=\"plans reveal\">\n\n      <!-- MONTHLY -->\n      <div class=\"plan\">\n        <span class=\"plan-tag\">Monthly Plan</span>\n        <div class=\"plan-orig\" id=\"m-orig\">Rs.3,000 / month</div>\n        <div class=\"plan-price\" id=\"m-price\"><sup>Rs.</sup>2000</div>\n        <div class=\"plan-period\">per month \u00b7 cancel anytime</div>\n        <div class=\"plan-save\" id=\"m-save\">33% OFF \u00b7 Save Rs.1,000</div>\n        <div class=\"plan-div\"></div>\n        <ul class=\"plan-feats\">\n          <li class=\"pf\"><div class=\"pfc\">\u2713</div>Unlimited Instagram posts</li>\n          <li class=\"pf\"><div class=\"pfc\">\u2713</div>GPT-4o AI content creation</li>\n          <li class=\"pf\"><div class=\"pfc\">\u2713</div>Auto image generation</li>\n          <li class=\"pf\"><div class=\"pfc\">\u2713</div>Telegram bot control</li>\n          <li class=\"pf\"><div class=\"pfc\">\u2713</div>Real-time web search</li>\n          <li class=\"pf\"><div class=\"pfc\">\u2713</div>Priority support</li>\n        </ul>\n        <a href=\"/pay?plan=monthly\" class=\"btn-plan btn-ol\" id=\"m-btn\">Get Monthly Access</a>\n        <div class=\"plan-note\">\ud83d\udd12 Secured by Razorpay</div>\n      </div>\n\n      <!-- 3 MONTH -->\n      <div class=\"plan feat\">\n        <div class=\"best-tag\">Best Value</div>\n        <span class=\"plan-tag\">3 Month Bundle</span>\n        <div class=\"plan-orig\" id=\"q-orig\">Rs.5,000 for 3 months</div>\n        <div class=\"plan-price\" id=\"q-price\"><sup>Rs.</sup>4500</div>\n        <div class=\"plan-period\">for 3 months \u00b7 save Rs.500 vs monthly</div>\n        <div class=\"plan-save\" id=\"q-save\">10% OFF \u00b7 Save Rs.500</div>\n        <div class=\"plan-div\"></div>\n        <ul class=\"plan-feats\">\n          <li class=\"pf\"><div class=\"pfc\">\u2713</div>Unlimited Instagram posts</li>\n          <li class=\"pf\"><div class=\"pfc\">\u2713</div>GPT-4o AI content creation</li>\n          <li class=\"pf\"><div class=\"pfc\">\u2713</div>Auto image generation</li>\n          <li class=\"pf\"><div class=\"pfc\">\u2713</div>Telegram bot control</li>\n          <li class=\"pf\"><div class=\"pfc\">\u2713</div>Real-time web search</li>\n          <li class=\"pf\"><div class=\"pfc\">\u2713</div><strong>3 months guaranteed access</strong></li>\n        </ul>\n        <a href=\"/ig-connect\" class=\"btn-plan\" style=\"display:block;text-align:center;margin-bottom:10px;background:transparent;border:2px solid #c9a84c;color:#c9a84c;\">\ud83c\udfaf Start Free Trial (3 Posts)</a>\n        <a href=\"/pay?plan=quarterly\" class=\"btn-plan btn-gl\" id=\"q-btn\">Get 3 Month Bundle</a>\n        <div class=\"plan-note\">\ud83d\udd12 Secured by Razorpay \u00b7 Best deal</div>\n      </div>\n    </div>\n    <div class=\"expired-box\" id=\"expired-box\">Offer expired \u2014 prices have returned to original rates.</div>\n  </div>\n</section>\n\n<!-- FAQ -->\n<section id=\"faq\">\n  <div class=\"faq-sec\">\n    <div class=\"eyebrow\">FAQ</div>\n    <h2>Questions <em>answered</em></h2>\n    <div style=\"margin-top:56px\">\n      <div class=\"faq-item\"><div class=\"faq-q\" onclick=\"toggleFaq(this.parentElement)\">Do I need any technical knowledge? <div class=\"faq-icon\">+</div></div><div class=\"faq-a\">Zero technical knowledge needed. After payment you fill a simple form with your Instagram details. We set everything up. You just open Telegram and start typing topics to post.</div></div>\n      <div class=\"faq-item\"><div class=\"faq-q\" onclick=\"toggleFaq(this.parentElement)\">Is my Instagram account safe? <div class=\"faq-icon\">+</div></div><div class=\"faq-a\">100% safe. We use the official Instagram API \u2014 the same method used by Buffer, Later, and Hootsuite. You review every single post before it publishes. Nothing goes live without your approval.</div></div>\n      <div class=\"faq-item\"><div class=\"faq-q\" onclick=\"toggleFaq(this.parentElement)\">How many posts can I create per month? <div class=\"faq-icon\">+</div></div><div class=\"faq-a\">Unlimited posts! There is absolutely no cap. Post once a day or ten times a day \u2014 your bot is always ready whenever you need it, 24 hours a day, 7 days a week.</div></div>\n      <div class=\"faq-item\"><div class=\"faq-q\" onclick=\"toggleFaq(this.parentElement)\">Can I cancel anytime? <div class=\"faq-icon\">+</div></div><div class=\"faq-a\">Yes, cancel anytime with no questions asked and no cancellation fees. Just message us on Instagram or email and we cancel your subscription the same day.</div></div>\n      <div class=\"faq-item\"><div class=\"faq-q\" onclick=\"toggleFaq(this.parentElement)\">What if I need help setting up? <div class=\"faq-icon\">+</div></div><div class=\"faq-a\">We provide personal hands-on support via Instagram DM and email. Message us and we will personally walk you through the entire setup within 24 hours. We make sure you are fully live before we leave.</div></div>\n    </div>\n  </div>\n</section>\n\n<!-- CONTACT -->\n<div class=\"contact-sec\">\n  <div class=\"contact-box\">\n    <div class=\"c-label\">Contact and Support</div>\n    <a href=\"https://www.instagram.com/visualpromediaofficial\" target=\"_blank\" class=\"c-link\">\ud83d\udcf8 &nbsp;@visualpromediaofficial</a>\n    <a href=\"/cdn-cgi/l/email-protection#3e44535b5a575f105f570c077e59535f5752105d5153\" class=\"c-link\">\u2709 &nbsp;<span class=\"__cf_email__\" data-cfemail=\"403a2d252429216e2129727900272d21292c6e232f2d\">[email&#160;protected]</span></a>\n  </div>\n</div>\n\n<!-- CTA -->\n<div class=\"cta-sec\">\n  <div class=\"cta-grid\"></div>\n  <div class=\"cta-glow\"></div>\n  <h2>Ready to grow<br><strong>on autopilot?</strong></h2>\n  <p>Join creators and brands posting daily without effort. Setup in 5 minutes.</p>\n  <div class=\"cta-btns\">\n    <a href=\"/ig-connect\" class=\"btn-g\" style=\"background:transparent;border:2px solid #c9a84c;color:#c9a84c;\">\ud83c\udfaf Start Free Trial</a>\n    <a href=\"/pay?plan=quarterly\" class=\"btn-g\">Get 3 Months \u2014 Rs.4,500</a>\n    <a href=\"/pay?plan=monthly\" class=\"btn-o\">Start Monthly \u2014 Rs.2,000</a>\n  </div>\n</div>\n\n<!-- FOOTER -->\n<footer>\n  <div class=\"f-logo\">Visual Pro <span>Media</span></div>\n  <div class=\"f-links\">\n    <a href=\"https://www.instagram.com/visualpromediaofficial\" target=\"_blank\">Instagram</a>\n    <a href=\"/cdn-cgi/l/email-protection#abd1c6cecfc2ca85cac29992ebccc6cac2c785c8c4c6\">Email</a>\n    <a href=\"/privacy\">Privacy</a>\n    <a href=\"/terms\">Terms</a>\n    <a href=\"/data-deletion\">Data Deletion</a>\n  </div>\n  <div class=\"f-copy\">2026 Visual Pro Media. All rights reserved.</div>\n</footer>\n\n<script data-cfasync=\"false\" src=\"/cdn-cgi/scripts/5c5dd728/cloudflare-static/email-decode.min.js\"></script><script>\n// Nav scroll\nwindow.addEventListener('scroll',function(){document.getElementById('nav').classList.toggle('scrolled',window.scrollY>50);});\n\n// FAQ\nfunction toggleFaq(el){var o=el.classList.contains('open');document.querySelectorAll('.faq-item').forEach(function(i){i.classList.remove('open');});if(!o)el.classList.add('open');}\n\n// Timer\n(function(){\n  var KEY='vpm_timer_v5';\n  var end=parseInt(localStorage.getItem(KEY)||'0');\n  if(!end||end<Date.now()){end=Date.now()+2*60*60*1000;localStorage.setItem(KEY,String(end));}\n  function pad(n){return String(n).padStart(2,'0');}\n  function tick(){\n    var diff=end-Date.now();\n    if(diff<=0){\n      document.getElementById('th').textContent='00';\n      document.getElementById('tm').textContent='00';\n      document.getElementById('ts').textContent='00';\n      document.getElementById('m-price').innerHTML='<sup>Rs.</sup>3000';\n      document.getElementById('q-price').innerHTML='<sup>Rs.</sup>5000';\n      document.getElementById('m-save').style.display='none';\n      document.getElementById('q-save').style.display='none';\n      document.getElementById('m-orig').style.display='none';\n      document.getElementById('q-orig').style.display='none';\n      document.getElementById('m-btn').textContent='Get Monthly Access';\n      document.getElementById('q-btn').textContent='Get 3 Month Bundle';\n      document.getElementById('expired-box').style.display='block';\n      return;\n    }\n    var h=Math.floor(diff/3600000);\n    var m=Math.floor((diff%3600000)/60000);\n    var s=Math.floor((diff%60000)/1000);\n    document.getElementById('th').textContent=pad(h);\n    document.getElementById('tm').textContent=pad(m);\n    document.getElementById('ts').textContent=pad(s);\n    setTimeout(tick,1000);\n  }\n  tick();\n})();\n\n// Scroll reveal\nvar obs=new IntersectionObserver(function(entries){entries.forEach(function(e){if(e.isIntersecting)e.target.classList.add('visible');});},{threshold:0.08});\ndocument.querySelectorAll('.reveal').forEach(function(el){obs.observe(el);});\n</script>\n</body>\n</html>\n";

app.get('/', (req, res) => res.send(LANDING_PAGE_HTML));
app.get('/landing', (req, res) => res.send(LANDING_PAGE_HTML));
app.get('/start', (req, res) => res.send(LANDING_PAGE_HTML));

// ── Keep alive ────────────────────────────────────────────────
setInterval(() => { axios.get(PUBLIC_URL + '/health').catch(() => {}); }, 600000);

// ── Start ─────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('VPM SaaS Bot running! Port: ' + PORT));
