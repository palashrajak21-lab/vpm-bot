const express = require('express');
const axios = require('axios');
const { createCanvas, loadImage } = require('canvas');
const FormData = require('form-data');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Constants ─────────────────────────────────────────────────
const NEWS_API_KEY = 'db2114f841704eb4a888d9d91f0772d0';
const PEXELS_KEY = 'KRZnXX3HKwZdWXsHiGus1X7uYcWr0aeqaDIdoXq0aCx6SpY3q0bDuunf';
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'vpm2024admin';
const PUBLIC_URL = process.env.PUBLIC_URL || 'https://vpm-bot.onrender.com';

// ── Client Database (stored in memory + env var) ─────────────
let clientsCache = null;

function loadClients() {
  if (clientsCache) return clientsCache;
  try {
    // Try file first
    const DB_FILE = path.join(__dirname, 'clients.json');
    if (fs.existsSync(DB_FILE)) {
      clientsCache = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      return clientsCache;
    }
    // Try environment variable
    if (process.env.CLIENTS_DATA) {
      clientsCache = JSON.parse(process.env.CLIENTS_DATA);
      return clientsCache;
    }
  } catch(e) { console.log('Load clients error:', e.message); }
  clientsCache = {};
  return clientsCache;
}

function saveClients(clients) {
  clientsCache = clients;
  // Save to file
  try {
    const DB_FILE = path.join(__dirname, 'clients.json');
    fs.writeFileSync(DB_FILE, JSON.stringify(clients, null, 2));
  } catch(e) { console.log('Save to file failed:', e.message); }
  // Log encoded data so you can save it as env var
  console.log('CLIENTS_DATA_UPDATE:' + JSON.stringify(clients));
}

function getClient(botToken) {
  const clients = loadClients();
  return Object.values(clients).find(c => c.botToken === botToken) || null;
}

// ── Auto refresh Instagram tokens ────────────────────────────
async function refreshToken(client) {
  try {
    const res = await axios.get('https://graph.instagram.com/refresh_access_token', {
      params: { grant_type: 'ig_refresh_token', access_token: client.igToken }
    });
    if (res.data && res.data.access_token) {
      console.log('Token refreshed for:', client.name);
      return res.data.access_token;
    }
  } catch(e) {
    console.log('Token refresh failed for', client.name, ':', e.message);
  }
  return null;
}

async function refreshAllTokens() {
  console.log('Running token refresh check...');
  const clients = loadClients();
  let updated = false;
  for (const id of Object.keys(clients)) {
    const client = clients[id];
    if (!client.igToken || !client.active) continue;
    // Check if token was last refreshed more than 50 days ago
    const lastRefresh = client.lastTokenRefresh ? new Date(client.lastTokenRefresh) : new Date(client.createdAt);
    const daysSince = (Date.now() - lastRefresh.getTime()) / (1000 * 60 * 60 * 24);
    console.log(client.name, '- days since last refresh:', Math.round(daysSince));
    if (daysSince >= 50) {
      console.log('Refreshing token for:', client.name);
      const newToken = await refreshToken(client);
      if (newToken) {
        clients[id].igToken = newToken;
        clients[id].lastTokenRefresh = new Date().toISOString();
        updated = true;
        console.log('Token updated for:', client.name);
      }
    }
  }
  if (updated) saveClients(clients);
}

// Run token refresh every 24 hours
// setInterval(refreshAllTokens, 24 * 60 * 60 * 1000); // Disabled - tokens last 60 days
// Also run on startup after 30 seconds
// setTimeout(refreshAllTokens, 30000); // Disabled - tokens last 60 days

// ── Per-client session/image store ────────────────────────────
const imageStore = {};
const sessions = {};

// ── Helpers ───────────────────────────────────────────────────
function isNewsTopic(topic) {
  const words = ['news','latest','today','war','attack','crash','launch','win','lost','died','arrested','election','result','match','score','market','price','update','breaking','happened','recent','2025','2026','vs','killed','crisis','deal','ban','strike','movie','film','ipl','bitcoin','crypto'];
  return words.some(w => topic.toLowerCase().includes(w));
}

async function newsSearch(query) {
  try {
    const res = await axios.get('https://newsapi.org/v2/everything', {
      params: { q: query, sortBy: 'publishedAt', pageSize: 5, language: 'en', apiKey: NEWS_API_KEY },
      timeout: 8000
    });
    if (res.data.articles && res.data.articles.length > 0) {
      let text = '';
      res.data.articles.slice(0, 5).forEach(a => { text += a.title + '. ' + (a.description || '') + ' '; });
      const img = res.data.articles.find(a => a.urlToImage && a.urlToImage.startsWith('http'));
      return { text: text.substring(0, 2000).trim(), imageUrl: img ? img.urlToImage : null };
    }
  } catch(e) { console.log('NewsAPI failed:', e.message); }
  return { text: '', imageUrl: null };
}

async function webSearch(query) {
  try {
    const res = await axios.get('https://api.duckduckgo.com/', {
      params: { q: query, format: 'json', no_html: 1, skip_disambig: 1 }, timeout: 6000
    });
    let r = '';
    if (res.data.AbstractText) r += res.data.AbstractText + ' ';
    if (res.data.RelatedTopics) res.data.RelatedTopics.slice(0, 6).forEach(t => { if (t.Text) r += t.Text + ' '; });
    return r.substring(0, 1500).trim();
  } catch(e) { return ''; }
}

async function downloadImage(url) {
  try {
    const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 12000, headers: { 'User-Agent': 'Mozilla/5.0' } });
    return Buffer.from(res.data);
  } catch(e) { return null; }
}

async function generateAIImage(prompt) {
  try {
    const full = prompt + ', cinematic dark background, no text, no words, photorealistic 4k';
    const url = 'https://image.pollinations.ai/prompt/' + encodeURIComponent(full) + '?width=1080&height=1080&nologo=true&seed=' + Math.floor(Math.random() * 9999);
    const buf = await downloadImage(url);
    if (buf && buf.byteLength > 30000) return buf;
  } catch(e) {}
  return null;
}

async function pexelsImage(topic) {
  try {
    const t = topic.toLowerCase();
    let q = 'technology abstract blue';
    if (t.includes('gold') || t.includes('silver')) q = 'gold bars luxury finance';
    else if (t.includes('ai') || t.includes('tool')) q = 'artificial intelligence circuit neon blue';
    else if (t.includes('crypto') || t.includes('bitcoin')) q = 'cryptocurrency blockchain digital';
    else if (t.includes('ipl') || t.includes('cricket')) q = 'cricket stadium night floodlights';
    else if (t.includes('war') || t.includes('military')) q = 'world map global dramatic';
    else if (t.includes('movie') || t.includes('film')) q = 'cinema theater dramatic lights';
    else if (t.includes('motivation') || t.includes('success')) q = 'mountain summit sunrise achievement';
    const res = await axios.get('https://api.pexels.com/v1/search', {
      params: { query: q, per_page: 5, orientation: 'square' },
      headers: { Authorization: PEXELS_KEY }, timeout: 5000
    });
    if (res.data.photos && res.data.photos.length > 0) {
      const idx = Math.floor(Math.random() * Math.min(5, res.data.photos.length));
      return await downloadImage(res.data.photos[idx].src.large2x || res.data.photos[idx].src.large);
    }
  } catch(e) {}
  return null;
}

async function getBackgroundImage(topic, newsImageUrl, imagePrompt) {
  const timeout = new Promise(r => setTimeout(() => r(null), 22000));
  const work = async () => {
    if (imagePrompt) { const b = await generateAIImage(imagePrompt); if (b) return b; }
    if (newsImageUrl) { const b = await downloadImage(newsImageUrl); if (b && b.byteLength > 10000) return b; }
    return await pexelsImage(topic);
  };
  return Promise.race([work(), timeout]).catch(() => null);
}

// ── Draw template with client branding ───────────────────────
async function drawTemplate(quote, author, keyPoints, bgBuffer, client) {
  const S = 1080;
  const canvas = createCanvas(S, S);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#0a0f1e';
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  for (let x = 0; x < S; x += 48)
    for (let y = 0; y < S; y += 48) {
      ctx.beginPath(); ctx.arc(x, y, 2.4, 0, Math.PI * 2); ctx.fill();
    }

  const cx = 72, cy = 72, cw = S - 144, ch = S - 144;

  if (bgBuffer) {
    try {
      const img = await loadImage(bgBuffer);
      ctx.save();
      ctx.beginPath(); ctx.roundRect(cx, cy, cw, ch, 36); ctx.clip();
      const scale = Math.max(cw / img.width, ch / img.height);
      const iw = img.width * scale, ih = img.height * scale;
      ctx.drawImage(img, cx + (cw - iw) / 2, cy + (ch - ih) / 2, iw, ih);
      ctx.fillStyle = 'rgba(5,8,25,0.80)'; ctx.fillRect(cx, cy, cw, ch);
      ctx.restore();
    } catch(e) {
      ctx.fillStyle = '#0f1629';
      ctx.beginPath(); ctx.roundRect(cx, cy, cw, ch, 36); ctx.fill();
    }
  } else {
    ctx.fillStyle = '#0f1629';
    ctx.beginPath(); ctx.roundRect(cx, cy, cw, ch, 36); ctx.fill();
  }

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
    ctx.fillText((client.name || 'V')[0].toUpperCase(), avX, avY + 11);
  }

  // Client name + handle
  const nameX = avX + avR + 26, nameY = cy + 88;
  ctx.fillStyle = '#ffffff'; ctx.font = 'bold 34px sans-serif'; ctx.textAlign = 'left';
  ctx.fillText(client.name || 'Visual Pro Media', nameX, nameY);

  const nameW = ctx.measureText(client.name || 'Visual Pro Media').width;
  const bR = 17, bCX = nameX + nameW + bR + 8, bCY = nameY - bR + 4;
  ctx.fillStyle = '#1d9bf0'; ctx.beginPath(); ctx.arc(bCX, bCY, bR, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(bCX-8,bCY); ctx.lineTo(bCX-2,bCY+6); ctx.lineTo(bCX+8,bCY-7); ctx.stroke();

  ctx.fillStyle = 'rgba(255,255,255,0.65)'; ctx.font = '26px sans-serif';
  ctx.fillText('@' + (client.handle || 'visualpromediaofficial'), nameX, cy + 126);

  // X logo
  const xs = 28, xx = cx + cw - 68, xy = cy + 56;
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(xx,xy); ctx.lineTo(xx+xs,xy+xs); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(xx+xs,xy); ctx.lineTo(xx,xy+xs); ctx.stroke();

  ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(cx+36,cy+168); ctx.lineTo(cx+cw-36,cy+168); ctx.stroke();

  const hasList = keyPoints && keyPoints.length > 0;

  if (hasList) {
    const hLen = quote.length;
    const hSize = hLen < 40 ? 46 : hLen < 70 ? 38 : 32;
    ctx.font = 'bold ' + hSize + 'px Georgia, serif';
    ctx.fillStyle = '#ffffff'; ctx.textAlign = 'left';
    const maxW = cw - 88;
    const qwords = quote.split(' '); const qlines = []; let qline = '';
    for (const w of qwords) {
      const test = qline + (qline ? ' ' : '') + w;
      if (ctx.measureText(test).width > maxW && qline) { qlines.push(qline); qline = w; }
      else qline = test;
    }
    if (qline) qlines.push(qline);
    let qy = cy + 220;
    qlines.forEach(l => { ctx.fillText(l, cx+44, qy); qy += hSize * 1.4; });
    ctx.strokeStyle = '#1d9bf0'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(cx+44, qy+10); ctx.lineTo(cx+44+80, qy+10); ctx.stroke();

    const colors = ['#1d9bf0','#f91880','#00ba7c','#ff6b00','#9b59b6'];
    const listStart = qy + 50;
    const available = (cy + ch - 230) - listStart;
    const itemH = Math.min(100, available / Math.min(keyPoints.length, 5));

    keyPoints.slice(0, 5).forEach((point, i) => {
      const iy = listStart + i * itemH;
      ctx.fillStyle = colors[i % colors.length];
      ctx.beginPath(); ctx.roundRect(cx+44, iy-4, 44, 44, 8); ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.font = 'bold 22px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(String(i+1), cx+44+22, iy+22);
      const ptSize = point.length > 30 ? 26 : 30;
      ctx.fillStyle = '#ffffff'; ctx.font = 'bold ' + ptSize + 'px sans-serif'; ctx.textAlign = 'left';
      const maxPW = cw - 140;
      const pwords = point.split(' '); let pline = '', pY = iy + 22;
      pwords.forEach(w => {
        const test = pline + (pline ? ' ' : '') + w;
        if (ctx.measureText(test).width > maxPW && pline) { ctx.fillText(pline, cx+100, pY); pline = w; pY += ptSize + 4; }
        else pline = test;
      });
      if (pline) ctx.fillText(pline, cx+100, pY);
    });
  } else {
    ctx.fillStyle = 'rgba(29,155,240,0.15)'; ctx.font = 'bold 260px serif'; ctx.textAlign = 'left';
    ctx.fillText('\u201C', cx+32, cy+460);
    const qLen = quote.length;
    const fSize = qLen < 50 ? 52 : qLen < 90 ? 44 : qLen < 140 ? 36 : 30;
    ctx.font = 'bold ' + fSize + 'px Georgia, serif';
    ctx.fillStyle = '#ffffff'; ctx.textAlign = 'left';
    const maxW = cw - 88, words = quote.split(' ');
    const lines = []; let line = '';
    for (const w of words) {
      const test = line + (line ? ' ' : '') + w;
      if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; }
      else line = test;
    }
    if (line) lines.push(line);
    const lh = fSize * 1.5, totalH = lines.length * lh;
    const areaTop = cy + 168, areaBot = cy + ch - 248;
    let ty = areaTop + (areaBot - areaTop - totalH) / 2 + fSize;
    lines.forEach(l => { ctx.fillText(l, cx+44, ty); ty += lh; });
    if (author) {
      ctx.fillStyle = '#1d9bf0'; ctx.font = 'bold 28px sans-serif';
      ctx.fillText('- ' + author, cx+44, areaBot+14);
    }
  }

  ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(cx+36,cy+ch-214); ctx.lineTo(cx+cw-36,cy+ch-214); ctx.stroke();

  const statsY = cy + ch - 158;
  [['12.4K','#f91880'],['3.8K','#1d9bf0'],['24.1K','#00ba7c']].forEach((s, i) => {
    const sx = cx + 44 + i * (cw-88)/3;
    ctx.fillStyle = s[1]; ctx.beginPath(); ctx.arc(sx+15,statsY,15,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.font = '26px sans-serif'; ctx.textAlign = 'left';
    ctx.fillText(s[0], sx+38, statsY+9);
  });

  ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(cx+36,cy+ch-96); ctx.lineTo(cx+cw-36,cy+ch-96); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.font = '22px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('Follow for daily insights  @' + (client.handle || 'visualpromediaofficial'), S/2, cy+ch-44);

  ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, S-58, S, 58);
  ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.font = '22px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText((client.name || 'Visual Pro Media') + '  Business  Leadership  Growth', S/2, S-18);

  return canvas.toBuffer('image/png');
}

// ── Generate content ──────────────────────────────────────────
async function generateContent(topic) {
  let searchResults = '', newsImageUrl = null;
  if (isNewsTopic(topic)) {
    const nd = await newsSearch(topic);
    searchResults = nd.text; newsImageUrl = nd.imageUrl;
    if (!searchResults) searchResults = await webSearch(topic);
  } else {
    searchResults = await webSearch(topic);
  }

  const res = await axios.post('https://api.anthropic.com/v1/messages', {
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1200,
    system: `You are an expert Instagram content creator. Choose best post type automatically.
Respond ONLY with JSON. No backticks. No explanation.
{
  "quote": "catchy hook max 10 words",
  "author": "person name or empty",
  "key_points": ["fact 1", "fact 2", "fact 3"],
  "caption": "2-3 paragraphs max 180 words",
  "cta": "call to action",
  "hashtags": "10 hashtags with #",
  "image_prompt": "vivid scene description for AI image, no people faces, no text, cinematic"
}`,
    messages: [{ role: 'user', content: 'Instagram post about: ' + topic + (searchResults ? '\n\nContext:\n' + searchResults : '') }]
  }, { headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' } });

  let raw = res.data.content[0].text;
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

// ── Upload image to Imgur (free, reliable) ───────────────────
async function uploadImage(imgBuffer) {
  // Try Imgur first
  try {
    const res = await axios.post('https://api.imgur.com/3/image', {
      image: imgBuffer.toString('base64'),
      type: 'base64'
    }, {
      headers: { 'Authorization': 'Client-ID 546c25a59c58ad7' },
      maxBodyLength: Infinity, timeout: 30000
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
      maxBodyLength: Infinity, timeout: 30000
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

// ── Post to Instagram ─────────────────────────────────────────
async function postToInstagram(imgId, caption, client) {
  const buf = imageStore[imgId];
  if (!buf) throw new Error('Image not in store');

  // Upload image
  const imageUrl = await uploadImage(buf);
  console.log('Posting to Instagram with URL:', imageUrl);
  console.log('Client:', client.name, 'IG User ID:', client.igUserId);

  // Trim caption to Instagram limit (2200 chars)
  const trimmedCaption = caption.length > 2200 ? caption.substring(0, 2197) + '...' : caption;

  // Create media container
  const create = await axios.post('https://graph.instagram.com/v21.0/' + client.igUserId + '/media', {
    image_url: imageUrl,
    caption: trimmedCaption,
    access_token: client.igToken
  });

  if (!create.data || !create.data.id) throw new Error('Failed to create media container');
  console.log('Media container created:', create.data.id);

  // Wait for media to be ready
  let status = 'IN_PROGRESS', attempts = 0;
  while (status === 'IN_PROGRESS' && attempts < 15) {
    await new Promise(r => setTimeout(r, 3000));
    const sr = await axios.get('https://graph.instagram.com/v21.0/' + create.data.id + '?fields=status_code&access_token=' + client.igToken);
    status = sr.data.status_code;
    attempts++;
    console.log('IG media status:', status, 'attempt:', attempts);
  }

  if (status !== 'FINISHED') throw new Error('Media not ready, status: ' + status);

  // Publish
  const pub = await axios.post('https://graph.instagram.com/v21.0/' + client.igUserId + '/media_publish', {
    creation_id: create.data.id,
    access_token: client.igToken
  });
  console.log('Published! Post ID:', pub.data.id);
  return pub.data.id;
}

// ── Telegram send helpers ─────────────────────────────────────
async function sendText(botToken, chatId, text) {
  await axios.post('https://api.telegram.org/bot' + botToken + '/sendMessage', { chat_id: chatId, text, parse_mode: 'Markdown' });
}

async function sendPhoto(botToken, chatId, buf, caption) {
  const form = new FormData();
  form.append('chat_id', String(chatId));
  form.append('caption', caption);
  form.append('photo', buf, { filename: 'post.png', contentType: 'image/png' });
  await axios.post('https://api.telegram.org/bot' + botToken + '/sendPhoto', form, { headers: form.getHeaders() });
}

// ── Image serving ─────────────────────────────────────────────
app.get('/img/:id', (req, res) => {
  const buf = imageStore[req.params.id];
  if (!buf) return res.status(404).send('Not found');
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.send(buf);
});

// ── Admin Panel ───────────────────────────────────────────────
app.get('/admin', (req, res) => {
  const clients = loadClients();
  const clientList = Object.values(clients);
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>VPM Admin Panel</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&display=swap');
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Space Grotesk',sans-serif;background:#060911;color:#e8eaf0;min-height:100vh}
  .header{background:linear-gradient(135deg,#0d1b2a,#1a2744);padding:24px 40px;border-bottom:1px solid rgba(255,255,255,0.08);display:flex;align-items:center;justify-content:space-between}
  .logo{font-size:22px;font-weight:700;color:#4da6ff;letter-spacing:-0.5px}
  .logo span{color:#fff}
  .stats{display:flex;gap:24px}
  .stat{text-align:right}
  .stat-num{font-size:28px;font-weight:700;color:#4da6ff}
  .stat-label{font-size:12px;color:#8892a4;letter-spacing:1px;text-transform:uppercase}
  .container{max-width:1100px;margin:0 auto;padding:40px 24px}
  .section-title{font-size:13px;font-weight:600;color:#4da6ff;letter-spacing:2px;text-transform:uppercase;margin-bottom:20px}
  .add-form{background:#0d1420;border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:32px;margin-bottom:40px}
  .form-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px}
  .form-group{display:flex;flex-direction:column;gap:8px}
  .form-group label{font-size:12px;font-weight:500;color:#8892a4;letter-spacing:1px;text-transform:uppercase}
  .form-group input{background:#060911;border:1px solid rgba(255,255,255,0.12);border-radius:10px;padding:12px 16px;color:#e8eaf0;font-family:inherit;font-size:14px;outline:none;transition:border-color 0.2s}
  .form-group input:focus{border-color:#4da6ff}
  .form-group input::placeholder{color:#3a4455}
  .btn-add{background:#4da6ff;color:#060911;border:none;border-radius:10px;padding:14px 32px;font-family:inherit;font-size:15px;font-weight:700;cursor:pointer;transition:background 0.2s;width:100%}
  .btn-add:hover{background:#6ab8ff}
  .clients-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:20px}
  .client-card{background:#0d1420;border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:24px;position:relative;transition:border-color 0.2s}
  .client-card:hover{border-color:rgba(77,166,255,0.3)}
  .client-header{display:flex;align-items:center;gap:14px;margin-bottom:16px}
  .client-avatar{width:48px;height:48px;border-radius:50%;background:linear-gradient(135deg,#1d9bf0,#4da6ff);display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:700;color:#fff;flex-shrink:0}
  .client-name{font-size:18px;font-weight:600}
  .client-handle{font-size:13px;color:#4da6ff;margin-top:2px}
  .client-meta{display:flex;flex-direction:column;gap:8px;margin-bottom:16px}
  .meta-row{display:flex;align-items:center;gap:8px;font-size:12px}
  .meta-label{color:#8892a4;min-width:80px}
  .meta-value{color:#e8eaf0;font-family:monospace;font-size:11px;background:#060911;padding:3px 8px;border-radius:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:160px}
  .status-badge{display:inline-flex;align-items:center;gap:6px;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:500}
  .status-active{background:rgba(0,186,124,0.15);color:#00ba7c}
  .status-dot{width:6px;height:6px;border-radius:50%;background:currentColor}
  .btn-delete{position:absolute;top:16px;right:16px;background:rgba(229,62,62,0.1);border:1px solid rgba(229,62,62,0.2);color:#e53e3e;border-radius:8px;padding:6px 12px;font-size:12px;cursor:pointer;font-family:inherit;transition:all 0.2s}
  .btn-delete:hover{background:rgba(229,62,62,0.2)}
  .webhook-info{background:#0a1628;border:1px solid rgba(77,166,255,0.2);border-radius:12px;padding:16px;margin-top:16px}
  .webhook-title{font-size:11px;color:#4da6ff;font-weight:600;letter-spacing:1px;text-transform:uppercase;margin-bottom:8px}
  .webhook-url{font-size:11px;font-family:monospace;color:#8892a4;word-break:break-all;line-height:1.6}
  .empty-state{text-align:center;padding:60px;color:#3a4455}
  .empty-icon{font-size:48px;margin-bottom:16px}
  .password-form{max-width:400px;margin:100px auto;background:#0d1420;border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:40px;text-align:center}
  .password-form h2{margin-bottom:24px;font-size:24px}
  .alert{background:rgba(229,62,62,0.1);border:1px solid rgba(229,62,62,0.3);color:#e53e3e;border-radius:8px;padding:12px;margin-bottom:16px;font-size:14px}
</style>
</head>
<body>
<div class="header">
  <div class="logo"><span>Visual Pro</span> Media · Admin</div>
  <div class="stats">
    <div class="stat">
      <div class="stat-num">${clientList.length}</div>
      <div class="stat-label">Total Clients</div>
    </div>
    <div class="stat">
      <div class="stat-num">${clientList.filter(c => c.active).length}</div>
      <div class="stat-label">Active</div>
    </div>
  </div>
</div>
<div class="container">
  <div class="add-form">
    <div class="section-title">Add New Client</div>
    <form method="POST" action="/admin/add">
      <input type="hidden" name="password" value="${req.query.p || ''}">
      <div class="form-grid">
        <div class="form-group">
          <label>Business Name</label>
          <input name="name" placeholder="e.g. Tech Startup India" required>
        </div>
        <div class="form-group">
          <label>Instagram Handle</label>
          <input name="handle" placeholder="e.g. techstartupindia (no @)" required>
        </div>
        <div class="form-group">
          <label>Instagram User ID</label>
          <input name="igUserId" placeholder="e.g. 17841446468701004" required>
        </div>
        <div class="form-group">
          <label>Instagram Access Token</label>
          <input name="igToken" placeholder="IGAAct..." required>
        </div>
        <div class="form-group">
          <label>Telegram Bot Token</label>
          <input name="botToken" placeholder="1234567890:AAH..." required>
        </div>
        <div class="form-group">
          <label>Client Email (optional)</label>
          <input name="email" placeholder="client@example.com">
        </div>
      </div>
      <button type="submit" class="btn-add">+ Add Client & Activate Bot</button>
    </form>
  </div>

  ${req.query.msg ? `<div style="background:rgba(0,186,124,0.1);border:1px solid rgba(0,186,124,0.3);color:#00ba7c;border-radius:10px;padding:12px 16px;margin-bottom:20px;font-size:14px">${decodeURIComponent(req.query.msg)}</div>` : ''}
  <div class="section-title">Active Clients (${clientList.length})</div>
  ${clientList.length === 0 ? `<div class="empty-state"><div class="empty-icon">🤖</div><div>No clients yet. Add your first client above!</div></div>` :
  `<div class="clients-grid">${clientList.map(c => `
    <div class="client-card">
      <form method="POST" action="/admin/delete" style="display:inline">
        <input type="hidden" name="id" value="${c.id}">
        <input type="hidden" name="password" value="${req.query.p || ''}">
        <div style="position:absolute;top:16px;right:16px;display:flex;gap:8px">
          <a href="/admin/edit?p=${req.query.p || ''}&id=${c.id}" style="background:rgba(77,166,255,0.1);border:1px solid rgba(77,166,255,0.2);color:#4da6ff;border-radius:8px;padding:6px 12px;font-size:12px;text-decoration:none;font-family:inherit">Edit</a>
          <a href="/admin/exchange-token?p=${req.query.p || ''}&id=${c.id}" onclick="return confirm('Exchange token for ' + c.name + '? Paste fresh token in Edit first!')" style="background:rgba(0,186,124,0.1);border:1px solid rgba(0,186,124,0.2);color:#00ba7c;border-radius:8px;padding:6px 12px;font-size:12px;text-decoration:none;font-family:inherit">Token</a>
          <button class="btn-delete" onclick="return confirm('Delete ' + c.name + '?')">Remove</button>
        </div>
      </form>
      <div class="client-header">
        <div class="client-avatar">${(c.name||'?')[0].toUpperCase()}</div>
        <div>
          <div class="client-name">${c.name}</div>
          <div class="client-handle">@${c.handle}</div>
        </div>
      </div>
      <div class="client-meta">
        <div class="meta-row"><span class="meta-label">IG User ID</span><span class="meta-value">${c.igUserId}</span></div>
        <div class="meta-row"><span class="meta-label">Bot Token</span><span class="meta-value">${c.botToken.substring(0,20)}...</span></div>
        ${c.email ? `<div class="meta-row"><span class="meta-label">Email</span><span class="meta-value">${c.email}</span></div>` : ''}
        <div class="meta-row"><span class="meta-label">Token refresh</span><span class="meta-value" style="color:${c.lastTokenRefresh ? '#00ba7c' : '#ff6b6b'}">${c.lastTokenRefresh ? 'Last: ' + new Date(c.lastTokenRefresh).toLocaleDateString() : 'Auto in 50 days'}</span></div>
      </div>
      <span class="status-badge status-active"><span class="status-dot"></span>Active</span>
      <div class="webhook-info">
        <div class="webhook-title">Webhook URL (set this in Telegram)</div>
        <div class="webhook-url">${PUBLIC_URL}/webhook/${c.id}</div>
      </div>
    </div>`).join('')}</div>`}
</div>
</body>
</html>`);
});

// ── Admin: Add client ─────────────────────────────────────────
app.post('/admin/add', (req, res) => {
  const { password, name, handle, igUserId, igToken, botToken, email } = req.body;
  if (password !== ADMIN_PASSWORD) return res.send('<h2>Wrong password</h2>');
  const clients = loadClients();
  const id = 'client_' + Date.now();
  clients[id] = { id, name, handle, igUserId, igToken, botToken, email: email || '', active: true, createdAt: new Date().toISOString() };
  saveClients(clients);

  // Auto-set webhook
  axios.get(`https://api.telegram.org/bot${botToken}/setWebhook?url=${PUBLIC_URL}/webhook/${id}`)
    .then(r => console.log('Webhook set for', name, r.data))
    .catch(e => console.log('Webhook failed for', name, e.message));

  res.redirect('/admin?p=' + password + '&success=1');
});

// ── Admin: Delete client ──────────────────────────────────────
app.post('/admin/delete', (req, res) => {
  const { password, id } = req.body;
  if (password !== ADMIN_PASSWORD) return res.send('<h2>Wrong password</h2>');
  const clients = loadClients();
  delete clients[id];
  saveClients(clients);
  res.redirect('/admin?p=' + password);
});

// ── Admin: Exchange IG token (short-lived → long-lived) ───────
app.get('/admin/exchange-token', async (req, res) => {
  const { p, id } = req.query;
  if (p !== ADMIN_PASSWORD) return res.send('<h2>Wrong password</h2>');
  const clients = loadClients();
  const client = clients[id];
  if (!client) return res.send('Client not found');
  try {
    console.log('Exchanging token for:', client.name);
    const result = await axios.get('https://graph.instagram.com/access_token', {
      params: {
        grant_type: 'ig_exchange_token',
        client_id: process.env.IG_APP_ID,
        client_secret: process.env.IG_APP_SECRET,
        access_token: client.igToken
      }
    });
    if (result.data && result.data.access_token) {
      clients[id].igToken = result.data.access_token;
      clients[id].lastTokenRefresh = new Date().toISOString();
      saveClients(clients);
      console.log('Token exchanged successfully for:', client.name);
      res.redirect('/admin?p=' + p + '&msg=Token+exchanged+successfully+for+' + encodeURIComponent(client.name));
    } else {
      res.send('Exchange failed: ' + JSON.stringify(result.data));
    }
  } catch(e) {
    console.log('Exchange error:', e.response ? JSON.stringify(e.response.data) : e.message);
    res.send(`<h2 style="color:red;font-family:sans-serif;padding:20px">Exchange Failed</h2><p style="font-family:sans-serif;padding:0 20px;color:#888">${e.response ? JSON.stringify(e.response.data) : e.message}</p><br><a href="/admin?p=${p}" style="padding:20px;color:#4da6ff">Back to Admin</a>`);
  }
});

// ── Admin: Edit client ────────────────────────────────────────
app.get('/admin/edit', (req, res) => {
  const { p, id } = req.query;
  if (p !== ADMIN_PASSWORD) return res.redirect('/');
  const clients = loadClients();
  const c = clients[id];
  if (!c) return res.redirect('/admin?p=' + p);
  res.send('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Edit Client</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:sans-serif;background:#060911;color:#e8eaf0;padding:40px 20px}.card{max-width:600px;margin:0 auto;background:#0d1420;border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:32px}h2{color:#4da6ff;margin-bottom:24px}label{display:block;font-size:12px;color:#8892a4;text-transform:uppercase;margin-bottom:6px;margin-top:14px}input{width:100%;background:#060911;border:1px solid rgba(255,255,255,0.15);border-radius:8px;padding:11px 13px;color:#e8eaf0;font-size:13px;font-family:monospace;outline:none}.btn{background:#4da6ff;color:#060911;border:none;border-radius:10px;padding:13px;font-size:14px;font-weight:700;width:100%;cursor:pointer;margin-top:20px;font-family:sans-serif}.back{display:block;text-align:center;color:#8892a4;margin-top:12px;text-decoration:none;font-size:13px}</style></head><body><div class="card"><h2>Edit: ' + c.name + '</h2><form method="POST" action="/admin/edit"><input type="hidden" name="password" value="' + p + '"><input type="hidden" name="id" value="' + id + '"><label>Business Name</label><input name="name" value="' + c.name + '" required><label>Instagram Handle</label><input name="handle" value="' + c.handle + '" required><label>Instagram User ID</label><input name="igUserId" value="' + c.igUserId + '" required><label>Instagram Token</label><input name="igToken" value="' + c.igToken + '" required><label>Telegram Bot Token</label><input name="botToken" value="' + c.botToken + '" required><label>Email</label><input name="email" value="' + (c.email||'') + '"><button class="btn" type="submit">Save Changes</button></form><a class="back" href="/admin?p=' + p + '">Cancel</a></div></body></html>');
});

app.post('/admin/edit', async (req, res) => {
  const { password, id, name, handle, igUserId, igToken, botToken, email } = req.body;
  if (password !== ADMIN_PASSWORD) return res.send('<h2>Wrong password</h2>');
  const clients = loadClients();
  if (!clients[id]) return res.redirect('/admin?p=' + password);
  clients[id] = { ...clients[id], name, handle, igUserId, igToken, botToken, email: email||'' };
  saveClients(clients);
  await axios.get('https://api.telegram.org/bot' + botToken + '/setWebhook?url=' + PUBLIC_URL + '/webhook/' + id).catch(e => console.log('Webhook failed:', e.message));
  res.redirect('/admin?p=' + password + '&edited=1');
});

// ── Admin: Edit client page ───────────────────────────────────
app.get('/admin/edit', (req, res) => {
  const { p, id } = req.query;
  if (p !== ADMIN_PASSWORD) return res.redirect('/');
  const clients = loadClients();
  const c = clients[id];
  if (!c) return res.redirect('/admin?p=' + p);
  res.send('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Edit Client</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:sans-serif;background:#060911;color:#e8eaf0;padding:40px 20px}.card{max-width:600px;margin:0 auto;background:#0d1420;border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:32px}h2{color:#4da6ff;margin-bottom:24px;font-size:20px}.fg{margin-bottom:16px}label{display:block;font-size:12px;color:#8892a4;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px}input{width:100%;background:#060911;border:1px solid rgba(255,255,255,0.12);border-radius:10px;padding:12px 14px;color:#e8eaf0;font-size:13px;font-family:monospace;outline:none}.btn{background:#4da6ff;color:#060911;border:none;border-radius:10px;padding:14px;font-size:15px;font-weight:700;width:100%;cursor:pointer;margin-top:8px;font-family:sans-serif}.back{display:block;text-align:center;color:#8892a4;margin-top:12px;text-decoration:none;font-size:14px}</style></head><body><div class="card"><h2>Edit: ' + c.name + '</h2><form method="POST" action="/admin/edit"><input type="hidden" name="password" value="' + p + '"><input type="hidden" name="id" value="' + id + '"><div class="fg"><label>Business Name</label><input name="name" value="' + c.name + '" required></div><div class="fg"><label>Instagram Handle</label><input name="handle" value="' + c.handle + '" required></div><div class="fg"><label>Instagram User ID</label><input name="igUserId" value="' + c.igUserId + '" required></div><div class="fg"><label>Instagram Token</label><input name="igToken" value="' + c.igToken + '" required></div><div class="fg"><label>Telegram Bot Token</label><input name="botToken" value="' + c.botToken + '" required></div><div class="fg"><label>Email (optional)</label><input name="email" value="' + (c.email||'') + '"></div><button type="submit" class="btn">Save Changes</button></form><a href="/admin?p=' + p + '" class="back">Cancel</a></div></body></html>');
});

app.post('/admin/edit', async (req, res) => {
  const { password, id, name, handle, igUserId, igToken, botToken, email } = req.body;
  if (password !== ADMIN_PASSWORD) return res.send('<h2>Wrong password</h2>');
  const clients = loadClients();
  if (!clients[id]) return res.redirect('/admin?p=' + password);
  clients[id] = { ...clients[id], name, handle, igUserId, igToken, botToken, email: email||'' };
  saveClients(clients);
  await axios.get('https://api.telegram.org/bot' + botToken + '/setWebhook?url=' + PUBLIC_URL + '/webhook/' + id).catch(e => console.log('Webhook failed:', e.message));
  res.redirect('/admin?p=' + password);
});

// ── Admin: Edit client page ───────────────────────────────────
app.get('/admin/edit', (req, res) => {
  const { p, id } = req.query;
  if (p !== ADMIN_PASSWORD) return res.redirect('/');
  const clients = loadClients();
  const c = clients[id];
  if (!c) return res.redirect('/admin?p=' + p);
  res.send(`<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Edit Client</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:sans-serif;background:#060911;color:#e8eaf0;padding:40px 20px}
.card{max-width:600px;margin:0 auto;background:#0d1420;border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:32px}
h2{color:#4da6ff;margin-bottom:24px;font-size:20px}
.form-group{margin-bottom:16px}
label{display:block;font-size:12px;color:#8892a4;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px}
input{width:100%;background:#060911;border:1px solid rgba(255,255,255,0.12);border-radius:10px;padding:12px 14px;color:#e8eaf0;font-size:14px;font-family:monospace;outline:none}
input:focus{border-color:#4da6ff}
.btn-save{background:#4da6ff;color:#060911;border:none;border-radius:10px;padding:14px;font-size:15px;font-weight:700;width:100%;cursor:pointer;margin-top:8px;font-family:sans-serif}
.btn-cancel{display:block;text-align:center;color:#8892a4;margin-top:12px;text-decoration:none;font-size:14px}
</style></head>
<body><div class="card">
<h2>Edit Client: ${c.name}</h2>
<form method="POST" action="/admin/edit">
  <input type="hidden" name="password" value="${p}">
  <input type="hidden" name="id" value="${id}">
  <div class="form-group"><label>Business Name</label><input name="name" value="${c.name}" required></div>
  <div class="form-group"><label>Instagram Handle</label><input name="handle" value="${c.handle}" required></div>
  <div class="form-group"><label>Instagram User ID</label><input name="igUserId" value="${c.igUserId}" required></div>
  <div class="form-group"><label>Instagram Token</label><input name="igToken" value="${c.igToken}" required></div>
  <div class="form-group"><label>Telegram Bot Token</label><input name="botToken" value="${c.botToken}" required></div>
  <div class="form-group"><label>Email (optional)</label><input name="email" value="${c.email || ''}"></div>
  <button type="submit" class="btn-save">Save Changes</button>
</form>
<a href="/admin?p=${p}" class="btn-cancel">Cancel</a>
</div></body></html>`);
});

// ── Admin: Save edit ──────────────────────────────────────────
app.post('/admin/edit', async (req, res) => {
  const { password, id, name, handle, igUserId, igToken, botToken, email } = req.body;
  if (password !== ADMIN_PASSWORD) return res.send('<h2>Wrong password</h2>');
  const clients = loadClients();
  if (!clients[id]) return res.redirect('/admin?p=' + password);
  clients[id] = { ...clients[id], name, handle, igUserId, igToken, botToken, email: email || '' };
  saveClients(clients);
  // Reset webhook with new bot token
  await axios.get('https://api.telegram.org/bot' + botToken + '/setWebhook?url=' + PUBLIC_URL + '/webhook/' + id)
    .catch(e => console.log('Webhook reset failed:', e.message));
  res.redirect('/admin?p=' + password);
});

// ── Admin login page ──────────────────────────────────────────
app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>VPM Admin Login</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:sans-serif;background:#060911;color:#e8eaf0;display:flex;align-items:center;justify-content:center;min-height:100vh}
  .box{background:#0d1420;border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:40px;width:380px;text-align:center}
  h2{margin-bottom:8px;font-size:22px}
  p{color:#8892a4;font-size:14px;margin-bottom:28px}
  input{width:100%;background:#060911;border:1px solid rgba(255,255,255,0.15);border-radius:10px;padding:14px;color:#e8eaf0;font-size:15px;margin-bottom:16px;outline:none}
  button{width:100%;background:#4da6ff;color:#060911;border:none;border-radius:10px;padding:14px;font-size:15px;font-weight:700;cursor:pointer}
</style></head>
<body><div class="box">
  <h2>VPM Admin Panel</h2>
  <p>Visual Pro Media · Bot Management</p>
  <form method="GET" action="/admin">
    <input type="password" name="p" placeholder="Enter admin password" required>
    <button type="submit">Login</button>
  </form>
</div></body></html>`);
});

// ── Per-client webhook ────────────────────────────────────────
app.post('/webhook/:clientId', async (req, res) => {
  res.sendStatus(200);
  const clients = loadClients();
  const client = clients[req.params.clientId];
  if (!client) return;

  const msg = req.body && req.body.message;
  if (!msg) return;
  const chatId = msg.chat.id;
  const text = (msg.text || '').trim();
  const lower = text.toLowerCase();
  const sessionKey = client.id + '_' + chatId;

  try {
    if (lower === '/start') {
      await sendText(client.botToken, chatId,
        `Welcome to *${client.name} Bot!*\n\nPowered by Claude AI + Web Search!\n\nSend me anything:\n📰 _Latest news on any topic_\n🛠 _Best AI tools for..._\n💡 _Famous person quotes_\n🔥 _Motivational topics_\n\nReply *approve* to post to Instagram\nReply *redo* to regenerate`);
      return;
    }

    if (lower === 'approve' && sessions[sessionKey]) {
      const s = sessions[sessionKey];
      await sendText(client.botToken, chatId, 'Posting to Instagram...');
      const postId = await postToInstagram(s.imgId, s.caption + '\n\n' + s.cta + '\n\n' + s.hashtags, client);
      delete sessions[sessionKey];
      await sendText(client.botToken, chatId, `✅ Posted to @${client.handle}!\n\nPost ID: ${postId}`);
      return;
    }

    if ((lower === 'redo' || lower === 'cancel') && sessions[sessionKey]) {
      delete sessions[sessionKey];
      await sendText(client.botToken, chatId, 'Cancelled. Send a new topic!');
      return;
    }

    await sendText(client.botToken, chatId, `Creating post about:\n*"${text}"*\n\nGenerating AI image + content... ~25 seconds`);

    const data = await generateContent(text);
    const bgBuf = await getBackgroundImage(text, data._newsImageUrl, data.image_prompt);
    const kp = data.key_points || [];
    const imgBuf = await drawTemplate(data.quote || text, data.author || '', kp, bgBuf, client);

    const imgId = 'img_' + Date.now();
    imageStore[imgId] = imgBuf;
    setTimeout(() => { delete imageStore[imgId]; }, 600000);
    sessions[sessionKey] = { imgId, caption: data.caption, cta: data.cta, hashtags: data.hashtags };

    const preview = data.caption + '\n\n' + data.cta + '\n\n' + data.hashtags + '\n\nReply approve to post | redo to regenerate';
    await sendPhoto(client.botToken, chatId, imgBuf, preview.length > 1000 ? preview.substring(0, 1000) + '...\n\nReply approve | redo' : preview);

  } catch(err) {
   console.error('Webhook error:', err.message, err.response?.data);
    await sendText(client.botToken, chatId, 'Something went wrong. Please try again!');
  }
});


// ── Privacy Policy & Terms ────────────────────────────────────
app.get('/privacy', (req, res) => {
  res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Privacy Policy - Visual Pro Media</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:sans-serif;background:#060911;color:#e8eaf0;padding:40px 20px;max-width:800px;margin:0 auto}h1{color:#4da6ff;margin-bottom:24px}h2{color:#4da6ff;margin:24px 0 12px;font-size:18px}p{color:#8892a4;line-height:1.7;margin-bottom:12px}</style></head>
<body>
<h1>Privacy Policy</h1>
<p>Last updated: March 2026</p>
<h2>What we collect</h2>
<p>We collect your Instagram account information and access tokens solely for the purpose of publishing content on your behalf. We also collect your Telegram bot token to enable our messaging service.</p>
<h2>How we use your data</h2>
<p>Your data is used exclusively to create and publish Instagram posts as authorized by you. We do not sell, share, or use your data for any other purpose.</p>
<h2>Data storage</h2>
<p>Your tokens are stored securely on our servers and are never shared with third parties.</p>
<h2>Your rights</h2>
<p>You can request deletion of your data at any time by contacting us. We will remove all your information within 24 hours.</p>
<h2>Contact</h2>
<p>For any privacy concerns, contact us at: support@visualpromedia.com</p>
</body></html>`);
});

app.get('/terms', (req, res) => {
  res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Terms of Service - Visual Pro Media</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:sans-serif;background:#060911;color:#e8eaf0;padding:40px 20px;max-width:800px;margin:0 auto}h1{color:#4da6ff;margin-bottom:24px}h2{color:#4da6ff;margin:24px 0 12px;font-size:18px}p{color:#8892a4;line-height:1.7;margin-bottom:12px}</style></head>
<body>
<h1>Terms of Service</h1>
<p>Last updated: March 2026</p>
<h2>Service Description</h2>
<p>Visual Pro Media provides an AI-powered Instagram content creation and publishing service via Telegram bot.</p>
<h2>User Responsibilities</h2>
<p>Users are responsible for ensuring they have the right to publish content to their Instagram accounts. Users must comply with Instagram's Terms of Service and Community Guidelines.</p>
<h2>Service Usage</h2>
<p>Our service is intended for legitimate business use only. Users agree not to use the service to post spam, misleading content, or content that violates any laws.</p>
<h2>Limitation of Liability</h2>
<p>Visual Pro Media is not responsible for any content published through our service or any consequences arising from such publications.</p>
<h2>Contact</h2>
<p>For any questions, contact us at: support@visualpromedia.com</p>
</body></html>`);
});

app.get('/data-deletion', (req, res) => {
  res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Data Deletion - Visual Pro Media</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:sans-serif;background:#060911;color:#e8eaf0;padding:40px 20px;max-width:800px;margin:0 auto}h1{color:#4da6ff;margin-bottom:24px}p{color:#8892a4;line-height:1.7;margin-bottom:12px}</style></head>
<body>
<h1>Data Deletion Request</h1>
<p>To request deletion of your data from Visual Pro Media, please contact us at support@visualpromedia.com with your Instagram username.</p>
<p>We will delete all your data within 24 hours and confirm via email.</p>
</body></html>`);
});

app.listen(process.env.PORT || 3000, () => {
  console.log('VPM SaaS Bot running!');
  // Keep server alive - ping every 10 minutes
  setInterval(() => {
    axios.get(PUBLIC_URL).then(() => console.log('Keep alive ping')).catch(() => {});
  }, 10 * 60 * 1000);
});

// ── Client Onboarding Page (Simple) ─────────────────────────
app.get('/connect', (req, res) => {
  const { error, success } = req.query;
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Connect Your Instagram - Visual Pro Media</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#060911;color:#e8eaf0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
  .card{background:#0d1420;border:1px solid rgba(255,255,255,0.1);border-radius:24px;padding:40px;width:100%;max-width:500px}
  .logo{text-align:center;margin-bottom:28px}
  .logo-text{font-size:22px;font-weight:700;color:#4da6ff}
  .logo-sub{font-size:13px;color:#8892a4;margin-top:4px}
  h1{font-size:20px;font-weight:700;margin-bottom:8px;text-align:center}
  .subtitle{font-size:14px;color:#8892a4;text-align:center;margin-bottom:28px;line-height:1.5}
  .steps{display:flex;flex-direction:column;gap:12px;margin-bottom:28px}
  .step{display:flex;gap:14px;padding:14px;background:#060911;border-radius:12px;border:1px solid rgba(255,255,255,0.06);align-items:flex-start}
  .step-num{width:28px;height:28px;border-radius:50%;background:#4da6ff;color:#060911;font-weight:700;font-size:13px;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px}
  .step-title{font-size:14px;font-weight:600;margin-bottom:3px}
  .step-desc{font-size:12px;color:#8892a4;line-height:1.5}
  .step-link{color:#4da6ff;text-decoration:none}
  label{display:block;font-size:12px;font-weight:500;color:#8892a4;letter-spacing:0.5px;text-transform:uppercase;margin-bottom:6px;margin-top:16px}
  input{width:100%;background:#060911;border:1px solid rgba(255,255,255,0.12);border-radius:10px;padding:12px 14px;color:#e8eaf0;font-size:14px;font-family:monospace;outline:none;transition:border-color 0.2s}
  input:focus{border-color:#4da6ff}
  input::placeholder{color:#3a4455;font-family:inherit;font-size:13px}
  .btn{display:block;background:#4da6ff;border:none;border-radius:12px;padding:15px;color:#060911;font-size:15px;font-weight:700;cursor:pointer;width:100%;margin-top:24px;font-family:inherit}
  .btn:hover{background:#6ab8ff}
  .error{background:rgba(229,62,62,0.1);border:1px solid rgba(229,62,62,0.3);color:#fc8181;border-radius:10px;padding:12px;margin-bottom:16px;font-size:13px}
  .success{background:rgba(0,186,124,0.1);border:1px solid rgba(0,186,124,0.3);color:#00ba7c;border-radius:10px;padding:12px;margin-bottom:16px;font-size:13px}
  .help-box{background:#0a1628;border:1px solid rgba(77,166,255,0.15);border-radius:12px;padding:16px;margin-top:20px}
  .help-title{font-size:12px;font-weight:600;color:#4da6ff;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px}
  .help-text{font-size:12px;color:#8892a4;line-height:1.7}
  .help-text b{color:#e8eaf0}
</style>
</head>
<body>
<div class="card">
  <div class="logo">
    <div class="logo-text">Visual Pro Media</div>
    <div class="logo-sub">AI-Powered Instagram Automation</div>
  </div>
  <h1>Set Up Your Bot</h1>
  <p class="subtitle">Follow these 3 steps to connect your Instagram and start posting automatically.</p>

  <div class="steps">
    <div class="step">
      <div class="step-num">1</div>
      <div>
        <div class="step-title">Create your Telegram bot</div>
        <div class="step-desc">Open Telegram → search <b>@BotFather</b> → type /newbot → follow steps → copy the token</div>
      </div>
    </div>
    <div class="step">
      <div class="step-num">2</div>
      <div>
        <div class="step-title">Get your Instagram token</div>
        <div class="step-desc">Your account manager will send you a token. Or visit <a class="step-link" href="https://developers.facebook.com" target="_blank">developers.facebook.com</a> to generate one.</div>
      </div>
    </div>
    <div class="step">
      <div class="step-num">3</div>
      <div>
        <div class="step-title">Fill the form below</div>
        <div class="step-desc">Enter your details and your bot will be active in seconds!</div>
      </div>
    </div>
  </div>

  \${error ? '<div class="error">' + decodeURIComponent(error) + '</div>' : ''}
  \${success ? '<div class="success">Your bot is now live! Open Telegram and send your bot a message to start posting.</div>' : ''}

  <form method="POST" action="/connect/save">
    <label>Business Name</label>
    <input name="name" placeholder="e.g. Tech Startup India" required>

    <label>Instagram Handle (without @)</label>
    <input name="handle" placeholder="e.g. techstartupindia" required>

    <label>Instagram User ID</label>
    <input name="igUserId" placeholder="e.g. 17841446468701004" required>

    <label>Instagram Access Token</label>
    <input name="igToken" placeholder="IGAAct..." required>

    <label>Telegram Bot Token</label>
    <input name="botToken" placeholder="1234567890:AAHxxx..." required>

    <button type="submit" class="btn">Activate My Bot</button>
  </form>

  <div class="help-box">
    <div class="help-title">Need help?</div>
    <div class="help-text">
      Contact your account manager or WhatsApp us at <b>+91 XXXXXXXXXX</b><br>
      We will set everything up for you in 5 minutes!
    </div>
  </div>
</div>
</body>
</html>`);
});

// ── Save client from connect form ─────────────────────────────
app.post('/connect/save', async (req, res) => {
  const { name, handle, igUserId, igToken, botToken } = req.body;
  if (!name || !handle || !igUserId || !igToken || !botToken) {
    return res.redirect('/connect?error=Please+fill+all+fields');
  }
  try {
    const clients = loadClients();
    const id = 'client_' + Date.now();
    clients[id] = { id, name, handle, igUserId, igToken, botToken, active: true, createdAt: new Date().toISOString() };
    saveClients(clients);
    // Auto-set webhook
    await axios.get('https://api.telegram.org/bot' + botToken + '/setWebhook?url=' + PUBLIC_URL + '/webhook/' + id);
    console.log('New client added:', name, handle);
    res.redirect('/connect?success=1');
  } catch(e) {
    console.error('Connect save error:', e.message);
    res.redirect('/connect?error=Something+went+wrong+please+try+again');
  }
});
