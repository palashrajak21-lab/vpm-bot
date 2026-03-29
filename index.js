const express = require('express');
const axios = require('axios');
const { createCanvas, loadImage } = require('canvas');
const FormData = require('form-data');
const path = require('path');

const app = express();
app.use(express.json());

const BOT_TOKEN = process.env.BOT_TOKEN;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const IG_TOKEN = process.env.IG_TOKEN;
const IG_USER_ID = process.env.IG_USER_ID;
const PUBLIC_URL = process.env.PUBLIC_URL;
const NEWS_API_KEY = 'db2114f841704eb4a888d9d91f0772d0';
const PEXELS_KEY = 'KRZnXX3HKwZdWXsHiGus1X7uYcWr0aeqaDIdoXq0aCx6SpY3q0bDuunf';
const TELEGRAM_API = 'https://api.telegram.org/bot' + BOT_TOKEN;

const imageStore = {};
const sessions = {};

// ── Detect news topic ─────────────────────────────────────────
function isNewsTopic(topic) {
  const words = ['news','latest','today','war','attack','crash','launch','win','lost','died','arrested','election','result','match','score','market','price','update','breaking','happened','recent','2025','2026','vs','killed','crisis','deal','ban','strike','movie','film','ipl','bitcoin','crypto'];
  const lower = topic.toLowerCase();
  return words.some(function(w) { return lower.includes(w); });
}

// ── NewsAPI ───────────────────────────────────────────────────
async function newsSearch(query) {
  try {
    const res = await axios.get('https://newsapi.org/v2/everything', {
      params: { q: query, sortBy: 'publishedAt', pageSize: 5, language: 'en', apiKey: NEWS_API_KEY },
      timeout: 8000
    });
    if (res.data.articles && res.data.articles.length > 0) {
      let text = '';
      res.data.articles.slice(0, 5).forEach(function(a) { text += a.title + '. ' + (a.description || '') + ' '; });
      const imgArticle = res.data.articles.find(function(a) { return a.urlToImage && a.urlToImage.startsWith('http'); });
      return { text: text.substring(0, 2000).trim(), imageUrl: imgArticle ? imgArticle.urlToImage : null };
    }
    return { text: '', imageUrl: null };
  } catch(e) { console.log('NewsAPI failed:', e.message); return { text: '', imageUrl: null }; }
}

// ── DuckDuckGo search ─────────────────────────────────────────
async function webSearch(query) {
  try {
    const res = await axios.get('https://api.duckduckgo.com/', {
      params: { q: query, format: 'json', no_html: 1, skip_disambig: 1 }, timeout: 6000
    });
    let results = '';
    if (res.data.AbstractText) results += res.data.AbstractText + ' ';
    if (res.data.RelatedTopics) res.data.RelatedTopics.slice(0, 6).forEach(function(t) { if (t.Text) results += t.Text + ' '; });
    return results.substring(0, 1500).trim();
  } catch(e) { console.log('DDG failed:', e.message); return ''; }
}

// ── Download any image URL ────────────────────────────────────
async function downloadImage(url) {
  try {
    const res = await axios.get(url, {
      responseType: 'arraybuffer', timeout: 15000,
      headers: { 'User-Agent': 'Mozilla/5.0' }, maxContentLength: 15 * 1024 * 1024
    });
    return Buffer.from(res.data);
  } catch(e) { console.log('Download failed:', e.message); return null; }
}

// ── Generate AI background image via Pollinations (free) ──────
async function generateAIImage(prompt) {
  try {
    const full = prompt + ', cinematic dark background, no text, no words, no letters, photorealistic, 4k, high quality';
    const url = 'https://image.pollinations.ai/prompt/' + encodeURIComponent(full) + '?width=1080&height=1080&nologo=true&seed=' + Math.floor(Math.random() * 9999);
    console.log('Generating AI image...');
    const buf = await downloadImage(url);
    if (buf && buf.byteLength > 30000) { console.log('AI image OK, size:', buf.byteLength); return buf; }
    console.log('AI image too small or failed');
    return null;
  } catch(e) { console.log('AI image failed:', e.message); return null; }
}

// ── Pexels fallback ───────────────────────────────────────────
async function pexelsImage(topic) {
  try {
    const t = topic.toLowerCase();
    let q = 'technology abstract blue';
    if (t.includes('gold') || t.includes('silver') || t.includes('market')) q = 'gold bars luxury finance';
    else if (t.includes('ai') || t.includes('tool') || t.includes('software')) q = 'artificial intelligence circuit neon blue';
    else if (t.includes('crypto') || t.includes('bitcoin')) q = 'cryptocurrency blockchain digital';
    else if (t.includes('ipl') || t.includes('cricket')) q = 'cricket stadium night floodlights';
    else if (t.includes('war') || t.includes('military')) q = 'world map global dramatic';
    else if (t.includes('movie') || t.includes('film')) q = 'cinema theater dramatic lights';
    else if (t.includes('motivation') || t.includes('success')) q = 'mountain summit sunrise achievement';
    else if (t.includes('business') || t.includes('startup')) q = 'city skyline modern business';
    const res = await axios.get('https://api.pexels.com/v1/search', {
      params: { query: q, per_page: 5, orientation: 'square' },
      headers: { 'Authorization': PEXELS_KEY }, timeout: 5000
    });
    if (res.data.photos && res.data.photos.length > 0) {
      const idx = Math.floor(Math.random() * Math.min(5, res.data.photos.length));
      return await downloadImage(res.data.photos[idx].src.large2x || res.data.photos[idx].src.large);
    }
  } catch(e) { console.log('Pexels failed:', e.message); }
  return null;
}

// ── Get background image ──────────────────────────────────────
async function getBackgroundImage(topic, newsImageUrl, imagePrompt) {
  const timeout = new Promise(function(r) { setTimeout(function() { r(null); }, 25000); });
  const work = async function() {
    // 1. AI generated image from Claude's prompt
    if (imagePrompt) {
      const buf = await generateAIImage(imagePrompt);
      if (buf) return buf;
    }
    // 2. Real news article photo
    if (newsImageUrl) {
      const buf = await downloadImage(newsImageUrl);
      if (buf && buf.byteLength > 10000) return buf;
    }
    // 3. Pexels stock photo
    return await pexelsImage(topic);
  };
  try { return await Promise.race([work(), timeout]); }
  catch(e) { console.log('getBackgroundImage error:', e.message); return null; }
}

// ── Draw template ─────────────────────────────────────────────
async function drawTemplate(quote, author, keyPoints, bgBuffer) {
  const S = 1080;
  const canvas = createCanvas(S, S);
  const ctx = canvas.getContext('2d');

  // Dark page background
  ctx.fillStyle = '#0a0f1e';
  ctx.fillRect(0, 0, S, S);

  // Subtle dots
  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  for (let x = 0; x < S; x += 48) {
    for (let y = 0; y < S; y += 48) {
      ctx.beginPath(); ctx.arc(x, y, 2.4, 0, Math.PI * 2); ctx.fill();
    }
  }

  const cx = 72, cy = 72, cw = S - 144, ch = S - 144;

  // Background image
  if (bgBuffer) {
    try {
      const img = await loadImage(bgBuffer);
      ctx.save();
      ctx.beginPath(); ctx.roundRect(cx, cy, cw, ch, 36); ctx.clip();
      const scale = Math.max(cw / img.width, ch / img.height);
      const iw = img.width * scale, ih = img.height * scale;
      ctx.drawImage(img, cx + (cw - iw) / 2, cy + (ch - ih) / 2, iw, ih);
      // Strong dark overlay
      ctx.fillStyle = 'rgba(5,8,25,0.80)';
      ctx.fillRect(cx, cy, cw, ch);
      ctx.restore();
    } catch(e) {
      console.log('BG draw failed:', e.message);
      ctx.fillStyle = '#0f1629';
      ctx.beginPath(); ctx.roundRect(cx, cy, cw, ch, 36); ctx.fill();
    }
  } else {
    ctx.fillStyle = '#0f1629';
    ctx.beginPath(); ctx.roundRect(cx, cy, cw, ch, 36); ctx.fill();
  }

  // Card border
  ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.roundRect(cx, cy, cw, ch, 36); ctx.stroke();

  // Logo avatar
  const avR = 44, avX = cx + 52 + avR, avY = cy + 60 + avR;
  try {
    const logo = await loadImage(path.join(__dirname, 'logo.png'));
    ctx.save();
    ctx.beginPath(); ctx.arc(avX, avY, avR, 0, Math.PI * 2); ctx.clip();
    ctx.drawImage(logo, avX - avR, avY - avR, avR * 2, avR * 2);
    ctx.restore();
  } catch(e) {
    ctx.fillStyle = '#1d9bf0';
    ctx.beginPath(); ctx.arc(avX, avY, avR, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 32px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('V', avX, avY + 11);
  }

  // Name
  const nameX = avX + avR + 26, nameY = cy + 88;
  ctx.fillStyle = '#ffffff'; ctx.font = 'bold 34px sans-serif'; ctx.textAlign = 'left';
  ctx.fillText('Visual Pro Media', nameX, nameY);

  // Verified badge
  const nameW = ctx.measureText('Visual Pro Media').width;
  const bR = 17, bCX = nameX + nameW + bR + 8, bCY = nameY - bR + 4;
  ctx.fillStyle = '#1d9bf0'; ctx.beginPath(); ctx.arc(bCX, bCY, bR, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(bCX-8, bCY); ctx.lineTo(bCX-2, bCY+6); ctx.lineTo(bCX+8, bCY-7); ctx.stroke();

  // Handle
  ctx.fillStyle = 'rgba(255,255,255,0.65)'; ctx.font = '26px sans-serif';
  ctx.fillText('@visualpromediaofficial', nameX, cy + 126);

  // X logo
  const xs = 28, xx = cx + cw - 68, xy = cy + 56;
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(xx, xy); ctx.lineTo(xx+xs, xy+xs); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(xx+xs, xy); ctx.lineTo(xx, xy+xs); ctx.stroke();

  // Top divider
  ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(cx+36, cy+168); ctx.lineTo(cx+cw-36, cy+168); ctx.stroke();

  const hasList = keyPoints && keyPoints.length > 0;

  if (hasList) {
    // Hook line
    const hLen = quote.length;
    const hSize = hLen < 40 ? 46 : hLen < 70 ? 38 : 32;
    ctx.font = 'bold ' + hSize + 'px Georgia, serif';
    ctx.fillStyle = '#ffffff'; ctx.textAlign = 'left';
    const maxW = cw - 88;
    const qwords = quote.split(' '); const qlines = []; let qline = '';
    for (let i = 0; i < qwords.length; i++) {
      const test = qline + (qline ? ' ' : '') + qwords[i];
      if (ctx.measureText(test).width > maxW && qline) { qlines.push(qline); qline = qwords[i]; }
      else qline = test;
    }
    if (qline) qlines.push(qline);
    let qy = cy + 220;
    qlines.forEach(function(l) { ctx.fillText(l, cx+44, qy); qy += hSize * 1.4; });

    // Blue accent line
    ctx.strokeStyle = '#1d9bf0'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(cx+44, qy+10); ctx.lineTo(cx+44+80, qy+10); ctx.stroke();

    // Key points
    const colors = ['#1d9bf0','#f91880','#00ba7c','#ff6b00','#9b59b6'];
    const listStart = qy + 50;
    const available = (cy + ch - 230) - listStart;
    const maxItems = Math.min(keyPoints.length, 5);
    const itemH = Math.min(100, available / maxItems);

    keyPoints.slice(0, 5).forEach(function(point, i) {
      const iy = listStart + i * itemH;
      // Number badge
      ctx.fillStyle = colors[i % colors.length];
      ctx.beginPath(); ctx.roundRect(cx+44, iy-4, 44, 44, 8); ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.font = 'bold 22px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(String(i+1), cx+44+22, iy+22);
      // Point text
      const ptSize = point.length > 30 ? 26 : 30;
      ctx.fillStyle = '#ffffff'; ctx.font = 'bold ' + ptSize + 'px sans-serif'; ctx.textAlign = 'left';
      const maxPW = cw - 140;
      const pwords = point.split(' '); let pline = '', pY = iy + 22;
      pwords.forEach(function(w) {
        const test = pline + (pline ? ' ' : '') + w;
        if (ctx.measureText(test).width > maxPW && pline) {
          ctx.fillText(pline, cx+100, pY); pline = w; pY += ptSize + 4;
        } else pline = test;
      });
      if (pline) ctx.fillText(pline, cx+100, pY);
    });

  } else {
    // Quote layout
    ctx.fillStyle = 'rgba(29,155,240,0.15)'; ctx.font = 'bold 260px serif'; ctx.textAlign = 'left';
    ctx.fillText('\u201C', cx+32, cy+460);
    const qLen = quote.length;
    const fSize = qLen < 50 ? 52 : qLen < 90 ? 44 : qLen < 140 ? 36 : 30;
    ctx.font = 'bold ' + fSize + 'px Georgia, serif';
    ctx.fillStyle = '#ffffff'; ctx.textAlign = 'left';
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
    lines.forEach(function(l) { ctx.fillText(l, cx+44, ty); ty += lh; });
    if (author) {
      ctx.fillStyle = '#1d9bf0'; ctx.font = 'bold 28px sans-serif';
      ctx.fillText('- ' + author, cx+44, areaBot+14);
    }
  }

  // Bottom divider
  ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(cx+36, cy+ch-214); ctx.lineTo(cx+cw-36, cy+ch-214); ctx.stroke();

  // Stats
  const statsY = cy + ch - 158;
  [['12.4K','#f91880'],['3.8K','#1d9bf0'],['24.1K','#00ba7c']].forEach(function(s, i) {
    const sx = cx + 44 + i * (cw-88)/3;
    ctx.fillStyle = s[1]; ctx.beginPath(); ctx.arc(sx+15, statsY, 15, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.font = '26px sans-serif'; ctx.textAlign = 'left';
    ctx.fillText(s[0], sx+38, statsY+9);
  });

  // Footer divider
  ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(cx+36, cy+ch-96); ctx.lineTo(cx+cw-36, cy+ch-96); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.font = '22px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('Follow for daily insights  @visualpromediaofficial', S/2, cy+ch-44);

  // Bottom strip
  ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, S-58, S, 58);
  ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.font = '22px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('Visual Pro Media  Business  Leadership  Growth', S/2, S-18);

  return canvas.toBuffer('image/png');
}

// ── Claude AI content generation ──────────────────────────────
async function generateContent(topic) {
  console.log('Topic:', topic);
  let searchResults = '', newsImageUrl = null;
  if (isNewsTopic(topic)) {
    const nd = await newsSearch(topic);
    searchResults = nd.text; newsImageUrl = nd.imageUrl;
    if (!searchResults) searchResults = await webSearch(topic);
  } else {
    searchResults = await webSearch(topic);
  }
  console.log('Search length:', searchResults.length, '| News image:', newsImageUrl ? 'YES' : 'NO');

  const res = await axios.post('https://api.anthropic.com/v1/messages', {
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1200,
    system: `You are an expert Instagram content creator for Visual Pro Media.

Choose the best post type:
1. NEWS/PRICES/SPORTS: key facts with numbers in key_points
2. TOOLS: real tool names in key_points
3. TRENDING: connect to business/AI angle
4. QUOTE: famous person real quote
5. MOTIVATIONAL: bold statement

CRITICAL: Also write an "image_prompt" — a short vivid description for AI image generation. It must be RELEVANT to the topic. Examples:
- Gold prices → "gleaming gold bars on dark marble, dramatic studio lighting, luxury finance"
- AI tools → "futuristic glowing blue circuit board, neon lights, dark background, abstract tech"
- Cricket/IPL → "cricket stadium at night with bright floodlights, aerial view, green pitch"
- War/conflict → "dramatic world map with glowing hotspots, dark geopolitical atmosphere"
- Movie → "dramatic cinema hall with spotlights, empty seats, luxury theater"
- Motivation → "mountain summit at sunrise, dramatic clouds, golden light, epic landscape"

Respond ONLY with JSON. No backticks. No explanation.
{
  "quote": "catchy hook max 10 words",
  "author": "person name or empty",
  "key_points": ["fact 1", "fact 2", "fact 3"],
  "caption": "2-3 paragraphs max 180 words",
  "cta": "call to action",
  "hashtags": "10 hashtags with #",
  "image_prompt": "short vivid description for AI image, no people faces, no text"
}`,
    messages: [{ role: 'user', content: 'Create Instagram post about: ' + topic + (searchResults ? '\n\nContext:\n' + searchResults : '') }]
  }, { headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' } });

  let raw = res.data.content[0].text;
  console.log('Claude response preview:', raw.substring(0, 250));
  const s = raw.indexOf('{'), e = raw.lastIndexOf('}');
  if (s === -1 || e === -1) throw new Error('No JSON');
  raw = raw.substring(s, e+1);
  let cleaned = '';
  for (let i = 0; i < raw.length; i++) {
    const c = raw.charCodeAt(i);
    if (c === 10 || c === 13 || c >= 32) cleaned += raw[i];
  }
  try { const p = JSON.parse(cleaned); p._newsImageUrl = newsImageUrl; return p; }
  catch(e1) { const p = JSON.parse(cleaned.replace(/[\x00-\x1f]/g, ' ')); p._newsImageUrl = newsImageUrl; return p; }
}

// ── Instagram posting ─────────────────────────────────────────
async function uploadImage(imgBuffer) {
  const base64 = imgBuffer.toString('base64');
  const form = new URLSearchParams();
  form.append('key', '6d207e02198a847aa98d0a2a901485a5');
  form.append('action', 'upload');
  form.append('source', base64);
  form.append('format', 'json');
  const res = await axios.post('https://freeimage.host/api/1/upload', form.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    maxBodyLength: Infinity, timeout: 30000
  });
  if (res.data && res.data.image && res.data.image.url) return res.data.image.url;
  throw new Error('Upload failed');
}

async function postToInstagram(imgId, caption) {
  const buf = imageStore[imgId];
  if (!buf) throw new Error('Image not in store');
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
    console.log('IG status:', status);
  }
  if (status !== 'FINISHED') throw new Error('Not ready: ' + status);
  const pub = await axios.post('https://graph.instagram.com/v21.0/' + IG_USER_ID + '/media_publish', {
    creation_id: create.data.id, access_token: IG_TOKEN
  });
  return pub.data.id;
}

// ── Image serving ─────────────────────────────────────────────
app.get('/img/:id', function(req, res) {
  const buf = imageStore[req.params.id];
  if (!buf) return res.status(404).send('Not found');
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.send(buf);
});

// ── Telegram webhook ──────────────────────────────────────────
app.post('/webhook', async function(req, res) {
  res.sendStatus(200);
  const msg = req.body && req.body.message;
  if (!msg) return;
  const chatId = msg.chat.id;
  const text = (msg.text || '').trim();
  const lower = text.toLowerCase();

  try {
    if (lower === '/start') {
      await axios.post(TELEGRAM_API + '/sendMessage', { chat_id: chatId, parse_mode: 'Markdown', text: 'Welcome to *Visual Pro Media Bot!*\n\nPowered by Claude AI + AI Images!\n\nSend me anything:\n📰 _US Iran war latest news_\n🏏 _IPL 2026 results_\n🛠 _best AI tools to remove background_\n💡 _Ratan Tata_\n🔥 _never give up_\n\nReply *approve* to post to Instagram\nReply *redo* to regenerate' });
      return;
    }

    if (lower === 'approve' && sessions[chatId]) {
      const s = sessions[chatId];
      await axios.post(TELEGRAM_API + '/sendMessage', { chat_id: chatId, text: 'Posting to Instagram...' });
      const postId = await postToInstagram(s.imgId, s.caption + '\n\n' + s.cta + '\n\n' + s.hashtags);
      delete sessions[chatId];
      await axios.post(TELEGRAM_API + '/sendMessage', { chat_id: chatId, text: 'Posted! Check @visualpromediaofficial\n\nPost ID: ' + postId });
      return;
    }

    if ((lower === 'redo' || lower === 'cancel') && sessions[chatId]) {
      delete sessions[chatId];
      await axios.post(TELEGRAM_API + '/sendMessage', { chat_id: chatId, text: 'Cancelled. Send a new topic!' });
      return;
    }

    await axios.post(TELEGRAM_API + '/sendMessage', { chat_id: chatId, text: 'Creating your post about:\n"' + text + '"\n\nGenerating AI image + content... ~25 seconds' });

    const data = await generateContent(text);
    console.log('image_prompt:', data.image_prompt);

    const bgBuf = await getBackgroundImage(text, data._newsImageUrl, data.image_prompt);
    const kp = data.key_points || [];
    console.log('Key points:', JSON.stringify(kp));

    const imgBuf = await drawTemplate(data.quote || text, data.author || '', kp, bgBuf);
    const imgId = 'img_' + Date.now();
    imageStore[imgId] = imgBuf;
    setTimeout(function() { delete imageStore[imgId]; }, 600000);
    sessions[chatId] = { imgId, caption: data.caption, cta: data.cta, hashtags: data.hashtags };

    const preview = data.caption + '\n\n' + data.cta + '\n\n' + data.hashtags + '\n\nReply approve to post | redo to regenerate';
    const trimmed = preview.length > 1000 ? preview.substring(0, 1000) + '...\n\nReply approve to post | redo to regenerate' : preview;

    const form = new FormData();
    form.append('chat_id', String(chatId));
    form.append('caption', trimmed);
    form.append('photo', imgBuf, { filename: 'post.png', contentType: 'image/png' });
    await axios.post(TELEGRAM_API + '/sendPhoto', form, { headers: form.getHeaders() });

  } catch(err) {
    console.error(err && err.response ? JSON.stringify(err.response.data) : err.message);
    await axios.post(TELEGRAM_API + '/sendMessage', { chat_id: chatId, text: 'Something went wrong. Please try again!' });
  }
});

app.get('/', function(req, res) { res.send('VPM Bot running!'); });
const PORT = process.env.PORT || 3000;
app.listen(PORT, function() { console.log('Bot live on port ' + PORT); });
