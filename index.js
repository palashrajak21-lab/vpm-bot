const express = require('express');
const axios = require('axios');
const { createCanvas } = require('canvas');
const FormData = require('form-data');

const app = express();
app.use(express.json());

const BOT_TOKEN = process.env.BOT_TOKEN;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const IG_TOKEN = process.env.IG_TOKEN;
const IG_USER_ID = process.env.IG_USER_ID;
const PUBLIC_URL = process.env.PUBLIC_URL;
const TELEGRAM_API = 'https://api.telegram.org/bot' + BOT_TOKEN;

const imageStore = {};
const sessions = {};

function drawTemplate(quote, author, keyPoints) {
  const S = 1080;
  const canvas = createCanvas(S, S);
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = '#f7f9f9';
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = 'rgba(0,0,0,0.022)';
  for (let x = 0; x < S; x += 48) {
    for (let y = 0; y < S; y += 48) {
      ctx.beginPath(); ctx.arc(x, y, 2.4, 0, Math.PI * 2); ctx.fill();
    }
  }

  // White card
  const cx = 72, cy = 72, cw = S - 144, ch = S - 144;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.roundRect(cx, cy, cw, ch, 36); ctx.fill();
  ctx.strokeStyle = '#e1e8ed'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.roundRect(cx, cy, cw, ch, 36); ctx.stroke();

  // Avatar
  const avR = 44, avX = cx + 52 + avR, avY = cy + 60 + avR;
  ctx.fillStyle = '#1d9bf0';
  ctx.beginPath(); ctx.arc(avX, avY, avR, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffffff'; ctx.font = 'bold 32px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('V', avX, avY + 11);

  // Name + badge
  const nameX = avX + avR + 26, nameY = cy + 88;
  ctx.fillStyle = '#0f1419'; ctx.font = 'bold 34px sans-serif'; ctx.textAlign = 'left';
  ctx.fillText('Visual Pro Media', nameX, nameY);
  const nameW = ctx.measureText('Visual Pro Media').width;
  const badgeR = 17, badgeCX = nameX + nameW + badgeR + 8, badgeCY = nameY - badgeR + 4;
  ctx.fillStyle = '#1d9bf0';
  ctx.beginPath(); ctx.arc(badgeCX, badgeCY, badgeR, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(badgeCX - 8, badgeCY); ctx.lineTo(badgeCX - 2, badgeCY + 6); ctx.lineTo(badgeCX + 8, badgeCY - 7);
  ctx.stroke();
  ctx.fillStyle = '#536471'; ctx.font = '26px sans-serif'; ctx.textAlign = 'left';
  ctx.fillText('@visualpromediaofficial', nameX, cy + 126);

  // X logo
  const xs = 28, xx = cx + cw - 68, xy = cy + 56;
  ctx.strokeStyle = '#0f1419'; ctx.lineWidth = 4.5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(xx, xy); ctx.lineTo(xx + xs, xy + xs); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(xx + xs, xy); ctx.lineTo(xx, xy + xs); ctx.stroke();

  // Top divider
  ctx.strokeStyle = '#eff3f4'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(cx + 36, cy + 168); ctx.lineTo(cx + cw - 36, cy + 168); ctx.stroke();

  const hasList = keyPoints && keyPoints.length > 0;

  if (hasList) {
    // TOOLS POST LAYOUT
    // Hook line at top
    const hookFSize = quote.length < 40 ? 46 : quote.length < 70 ? 38 : 32;
    ctx.font = 'bold ' + hookFSize + 'px Georgia, serif';
    ctx.fillStyle = '#0f1419'; ctx.textAlign = 'left';
    const maxW = cw - 88;
    const qwords = quote.split(' ');
    const qlines = []; let qline = '';
    for (let i = 0; i < qwords.length; i++) {
      const test = qline + (qline ? ' ' : '') + qwords[i];
      if (ctx.measureText(test).width > maxW && qline) { qlines.push(qline); qline = qwords[i]; }
      else qline = test;
    }
    if (qline) qlines.push(qline);
    let qy = cy + 220;
    qlines.forEach(function(l) { ctx.fillText(l, cx + 44, qy); qy += hookFSize * 1.4; });

    // Divider under hook
    ctx.strokeStyle = '#1d9bf0'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(cx + 44, qy + 10); ctx.lineTo(cx + 44 + 80, qy + 10); ctx.stroke();

    // Tool list
    const colors = ['#1d9bf0','#f91880','#00ba7c','#ff6b00','#9b59b6'];
    const toolStart = qy + 50;
    const toolSpacing = Math.min(100, (cy + ch - 220 - toolStart) / tools.length);

    keyPoints.slice(0, 5).forEach(function(tool, i) {
      const ty = toolStart + i * toolSpacing;

      // Number badge
      ctx.fillStyle = colors[i % colors.length];
      ctx.beginPath(); ctx.roundRect(cx + 44, ty - 28, 44, 44, 8); ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.font = 'bold 22px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(String(i + 1), cx + 44 + 22, ty + 4);

      // Tool name
      ctx.fillStyle = '#0f1419'; ctx.font = 'bold 30px sans-serif'; ctx.textAlign = 'left';
      ctx.fillText(tool, cx + 44 + 60, ty + 4);
    });

  } else {
    // QUOTE/MOTIVATIONAL POST LAYOUT
    ctx.fillStyle = 'rgba(29,155,240,0.06)'; ctx.font = 'bold 260px serif'; ctx.textAlign = 'left';
    ctx.fillText('\u201C', cx + 32, cy + 460);

    const qLen = quote.length;
    const fSize = qLen < 50 ? 52 : qLen < 90 ? 44 : qLen < 140 ? 36 : 30;
    ctx.font = 'bold ' + fSize + 'px Georgia, serif';
    ctx.fillStyle = '#0f1419'; ctx.textAlign = 'left';
    const maxW = cw - 88, words = quote.split(' ');
    const lines = []; let line = '';
    for (let i = 0; i < words.length; i++) {
      const test = line + (line ? ' ' : '') + words[i];
      if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = words[i]; }
      else line = test;
    }
    if (line) lines.push(line);
    const lh = fSize * 1.5, totalH = lines.length * lh;
    const areaTop = cy + 168, areaBot = cy + ch - 248;
    let ty = areaTop + (areaBot - areaTop - totalH) / 2 + fSize;
    for (let j = 0; j < lines.length; j++) { ctx.fillText(lines[j], cx + 44, ty); ty += lh; }
    if (author) {
      ctx.fillStyle = '#1d9bf0'; ctx.font = 'bold 28px sans-serif'; ctx.textAlign = 'left';
      ctx.fillText('- ' + author, cx + 44, areaBot + 14);
    }
  }

  // Bottom stats
  ctx.strokeStyle = '#eff3f4'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(cx + 36, cy + ch - 214); ctx.lineTo(cx + cw - 36, cy + ch - 214); ctx.stroke();
  const statsY = cy + ch - 158;
  const stats = [['12.4K','#f91880'],['3.8K','#1d9bf0'],['24.1K','#00ba7c']];
  const statSpacing = (cw - 88) / 3;
  stats.forEach(function(s, i) {
    const sx = cx + 44 + i * statSpacing;
    ctx.fillStyle = s[1]; ctx.beginPath(); ctx.arc(sx + 15, statsY, 15, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#536471'; ctx.font = '26px sans-serif'; ctx.textAlign = 'left';
    ctx.fillText(s[0], sx + 38, statsY + 9);
  });
  ctx.strokeStyle = '#eff3f4'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(cx + 36, cy + ch - 96); ctx.lineTo(cx + cw - 36, cy + ch - 96); ctx.stroke();
  ctx.fillStyle = '#8899a6'; ctx.font = '22px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('Follow for daily insights  @visualpromediaofficial', S / 2, cy + ch - 44);
  ctx.fillStyle = '#f0f2f5'; ctx.fillRect(0, S - 58, S, 58);
  ctx.fillStyle = '#8899a6'; ctx.font = '22px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('Visual Pro Media  Business  Leadership  Growth', S / 2, S - 18);
  return canvas.toBuffer('image/png');
}

async function sendText(chatId, text) {
  await axios.post(TELEGRAM_API + '/sendMessage', { chat_id: chatId, text: text, parse_mode: 'Markdown' });
}

async function sendPhoto(chatId, buf, caption) {
  const form = new FormData();
  form.append('chat_id', String(chatId));
  form.append('caption', caption);
  form.append('photo', buf, { filename: 'post.png', contentType: 'image/png' });
  await axios.post(TELEGRAM_API + '/sendPhoto', form, { headers: form.getHeaders() });
}

const NEWS_API_KEY = 'db2114f841704eb4a888d9d91f0772d0';

function isNewsTopic(topic) {
  const newsWords = ['news', 'latest', 'today', 'war', 'attack', 'crash', 'launch', 'win', 'lost', 'died', 'arrested', 'election', 'result', 'match', 'score', 'market', 'price', 'update', 'breaking', 'happened', 'recent', '2025', '2026', 'vs', 'killed', 'crisis', 'deal', 'ban', 'strike', 'movie', 'film', 'ipl', 'bitcoin', 'crypto'];
  const lower = topic.toLowerCase();
  return newsWords.some(function(w) { return lower.includes(w); });
}

async function newsSearch(query) {
  try {
    const res = await axios.get('https://newsapi.org/v2/everything', {
      params: { q: query, sortBy: 'publishedAt', pageSize: 5, language: 'en', apiKey: NEWS_API_KEY },
      timeout: 8000
    });
    if (res.data.articles && res.data.articles.length > 0) {
      let context = '';
      res.data.articles.slice(0, 5).forEach(function(a) {
        context += a.title + '. ' + (a.description || '') + ' ';
      });
      console.log('NewsAPI found', res.data.articles.length, 'articles');
      return context.substring(0, 2000).trim();
    }
    return '';
  } catch(e) {
    console.log('NewsAPI failed:', e.message);
    return '';
  }
}

async function webSearch(query) {
  try {
    const res = await axios.get('https://api.duckduckgo.com/', {
      params: { q: query, format: 'json', no_html: 1, skip_disambig: 1 },
      timeout: 6000
    });
    const data = res.data;
    let results = '';
    if (data.AbstractText) results += data.AbstractText + ' ';
    if (data.RelatedTopics) {
      data.RelatedTopics.slice(0, 6).forEach(function(t) {
        if (t.Text) results += t.Text + ' ';
      });
    }
    return results.substring(0, 1500).trim();
  } catch(e) {
    console.log('DDG failed:', e.message);
    return '';
  }
}

async function generateContent(topic) {
  console.log('Topic:', topic);
  let searchResults = '';
  if (isNewsTopic(topic)) {
    console.log('News topic — using NewsAPI');
    searchResults = await newsSearch(topic);
    if (!searchResults) searchResults = await webSearch(topic);
  } else {
    console.log('General topic — using DuckDuckGo');
    searchResults = await webSearch(topic);
  }
  console.log('Search results length:', searchResults.length);

  const systemPrompt = `You are an expert Instagram content creator for Visual Pro Media.

CRITICAL RULE: The most important facts/data MUST go in the "key_points" array so they show ON the image. The caption only elaborates/explains.

Examples:
- "gold silver price" → key_points: ["GOLD: $2,045/oz +1.2%", "SILVER: $23.80/oz +0.8%", "Market: Bullish trend"]
- "US Iran war news" → key_points: ["US strikes Iran bases", "Oil prices surge 8%", "Markets on high alert"]  
- "best AI tools remove background" → key_points: ["Remove.bg", "Canva AI", "Adobe Firefly"]
- "IPL match result" → key_points: ["MI beat CSK by 6 wickets", "Rohit scores 89 runs", "CSK all out at 156"]
- "Bitcoin price" → key_points: ["BTC: $67,420 +3.2%", "ETH: $3,890 +1.8%", "Market Cap: $2.4T"]

POST TYPES:
1. NEWS/PRICES/SPORTS: key facts with numbers/scores in key_points
2. TOOLS: real tool names in key_points  
3. TRENDING: hook connecting to business, key_points has 2-3 key insights
4. QUOTE: famous person quote, key_points empty []
5. MOTIVATIONAL: bold statement, key_points empty []

Respond ONLY with JSON. No explanation. No markdown. No backticks.
{
  "quote": "catchy hook line max 10 words shown as headline",
  "author": "person name if direct quote else empty",
  "key_points": ["Point 1 with data", "Point 2 with data", "Point 3 with data"],
  "caption": "elaboration 2-3 paragraphs max 180 words — expand on the key points",
  "cta": "call to action",
  "hashtags": "10 hashtags with # separated by spaces"
}`;

  const userMsg = searchResults
    ? 'Create Instagram post about: ' + topic + '\n\nContext:\n' + searchResults
    : 'Create Instagram post about: ' + topic;

  const res = await axios.post('https://api.anthropic.com/v1/messages', {
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMsg }]
  }, { headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' } });

  let raw = res.data.content[0].text;
  console.log('Claude response:', raw.substring(0, 200));
  const s = raw.indexOf('{'), e = raw.lastIndexOf('}');
  if (s === -1 || e === -1) throw new Error('No JSON');
  raw = raw.substring(s, e + 1);
  let cleaned = '';
  for (let i = 0; i < raw.length; i++) {
    const code = raw.charCodeAt(i);
    if (code === 10 || code === 13 || code >= 32) cleaned += raw[i];
  }
  try { return JSON.parse(cleaned); } catch(e1) {
    return JSON.parse(cleaned.replace(/[-]/g, ' '));
  }
}


async function uploadImage(imgBuffer) {
  // Upload to freeimage.host - free, no signup needed
  const base64 = imgBuffer.toString('base64');
  const form = new URLSearchParams();
  form.append('key', '6d207e02198a847aa98d0a2a901485a5');
  form.append('action', 'upload');
  form.append('source', base64);
  form.append('format', 'json');
  const res = await axios.post('https://freeimage.host/api/1/upload', form.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    maxBodyLength: Infinity,
    timeout: 30000
  });
  console.log('Upload response:', JSON.stringify(res.data).substring(0, 200));
  if (res.data && res.data.image && res.data.image.url) {
    return res.data.image.url;
  }
  throw new Error('Upload failed: ' + JSON.stringify(res.data));
}

async function postToInstagram(imgId, caption) {
  const buf = imageStore[imgId];
  if (!buf) throw new Error('Image not in store');
  console.log('Uploading image...');
  const imageUrl = await uploadImage(buf);
  console.log('Image URL:', imageUrl);
  const create = await axios.post('https://graph.instagram.com/v21.0/' + IG_USER_ID + '/media', {
    image_url: imageUrl, caption: caption, access_token: IG_TOKEN
  });
  let status = 'IN_PROGRESS', attempts = 0;
  while (status === 'IN_PROGRESS' && attempts < 12) {
    await new Promise(function(r) { setTimeout(r, 3000); });
    const sr = await axios.get('https://graph.instagram.com/v21.0/' + create.data.id + '?fields=status_code&access_token=' + IG_TOKEN);
    status = sr.data.status_code; attempts++;
  }
  if (status !== 'FINISHED') throw new Error('Not ready: ' + status);
  const publish = await axios.post('https://graph.instagram.com/v21.0/' + IG_USER_ID + '/media_publish', {
    creation_id: create.data.id, access_token: IG_TOKEN
  });
  return publish.data.id;
}

app.get('/img/:id', function(req, res) {
  const buf = imageStore[req.params.id];
  if (!buf) return res.status(404).send('Not found');
  res.setHeader('Content-Type', 'image/jpeg');
  res.setHeader('Content-Disposition', 'inline; filename="post.jpg"');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.setHeader('Access-Control-Allow-Origin', '*');
  // Convert PNG to JPEG buffer for Instagram compatibility
  res.send(buf);
});

// Also serve as .jpg extension for Instagram
app.get('/img/:id.jpg', function(req, res) {
  const buf = imageStore[req.params.id];
  if (!buf) return res.status(404).send('Not found');
  res.setHeader('Content-Type', 'image/jpeg');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.send(buf);
});

app.post('/webhook', async function(req, res) {
  res.sendStatus(200);
  const msg = req.body && req.body.message;
  if (!msg) return;
  const chatId = msg.chat.id;
  const text = (msg.text || '').trim();
  const lower = text.toLowerCase();
  try {
    if (lower === '/start') {
      await sendText(chatId, 'Welcome to *Visual Pro Media Bot!*\n\nPowered by Claude AI + NewsAPI + Web Search!\n\nSend me ANYTHING:\n\n📰 *News* - _US Iran war latest_\n🎬 *Movies* - _Dhurandar movie connect to AI_\n🏏 *Sports* - _IPL 2025 results_\n🛠 *Tools* - _best AI tools to remove background_\n💡 *Quotes* - _Ratan Tata_\n🔥 *Motivation* - _never give up_\n\nReply *approve* to post\nReply *redo* to regenerate');
      return;
    }
    if (lower === 'approve' && sessions[chatId]) {
      const s = sessions[chatId];
      await sendText(chatId, 'Posting to Instagram...');
      const postId = await postToInstagram(s.imgId, s.caption + '\n\n' + s.cta + '\n\n' + s.hashtags);
      delete sessions[chatId];
      await sendText(chatId, 'Posted! Check @visualpromediaofficial\n\nPost ID: ' + postId);
      return;
    }
    if ((lower === 'redo' || lower === 'cancel') && sessions[chatId]) {
      delete sessions[chatId];
      await sendText(chatId, 'Cancelled. Send a new topic!');
      return;
    }
    const isNews = isNewsTopic(text);
    await sendText(chatId, (isNews ? '📰 Fetching latest news + ' : '🔍 Searching web + ') + 'Claude AI creating post about:\n*"' + text + '"*\n\nPlease wait ~20 seconds...');
    const data = await generateContent(text);
    console.log('Tools received:', JSON.stringify(data.tools));
    const kp = data.key_points || data.tools || [];
    console.log('Key points for image:', JSON.stringify(kp));
    const imgBuf = drawTemplate(data.quote || text, data.author || '', kp);
    const imgId = 'img_' + Date.now();
    imageStore[imgId] = imgBuf;
    setTimeout(function() { delete imageStore[imgId]; }, 600000);
    sessions[chatId] = { imgId: imgId, caption: data.caption, cta: data.cto || data.cta, hashtags: data.hashtags };
    // Trim caption to fit Telegram 1024 char limit
    const fullPreview = data.caption + '\n\n' + data.cta + '\n\n' + data.hashtags + '\n\nReply approve to post | redo to regenerate';
    const trimmed = fullPreview.length > 1000 ? fullPreview.substring(0, 1000) + '...\n\nReply approve to post | redo to regenerate' : fullPreview;
    await sendPhoto(chatId, imgBuf, trimmed);
  } catch (err) {
    console.error(err && err.response ? JSON.stringify(err.response.data) : err.message);
    await sendText(chatId, 'Something went wrong. Please try again!');
  }
});

app.get('/', function(req, res) { res.send('VPM Bot running with Claude AI!'); });
const PORT = process.env.PORT || 3000;
app.listen(PORT, function() { console.log('Bot live on port ' + PORT); });
