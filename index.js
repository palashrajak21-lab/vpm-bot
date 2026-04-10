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
const OPENAI_KEY = process.env.OPENAI_API_KEY;
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
const userTemplates = {}; // stores chosen template per user: chatId -> templateName
const userPhotos = {};    // stores uploaded photo per user: chatId -> buffer


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
  // Try DALL-E 3 first (OpenAI)
  try {
    const res = await axios.post('https://api.openai.com/v1/images/generations', {
      model: 'dall-e-3',
      prompt: prompt + ', photorealistic, high quality, no text overlays',
      n: 1,
      size: '1024x1024',
      quality: 'standard'
    }, {
      headers: {
        'Authorization': 'Bearer ' + OPENAI_KEY,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });
    if (res.data && res.data.data && res.data.data[0] && res.data.data[0].url) {
      console.log('DALL-E 3 image generated successfully');
      const buf = await downloadImage(res.data.data[0].url);
      if (buf && buf.byteLength > 10000) return buf;
    }
  } catch(e) {
    console.log('DALL-E 3 failed:', e.response?.data?.error?.message || e.message);
  }
  // Fallback to Pollinations
  try {
    const full = prompt + ', cinematic, no text, photorealistic 4k';
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


// ── Template Configs (Based on Clean Templates) ─────────────
// All coordinates in 1080x1080 space
// Templates are now clean (no original text to cover)
const TEMPLATE_CONFIGS = {

  'X Style': {
    // dark_luxury.jpg = dark black/green card template
    bg: 'dark',
    // Headline - big bold WHITE text upper card area
    headline: {
      x: 160, y: 260, maxW: 760,
      color: '#ffffff', size: 54,
      weight: 'bold', font: 'Arial, sans-serif',
      lineH: 70, italic: false
    },
    // Green vertical accent line LEFT of body text
    accentLine: { x: 160, y: 460, w: 5, h: 200, color: '#00cc66' },
    // Body text RIGHT of accent line
    body: {
      x: 182, y: 480, maxW: 740,
      color: 'rgba(255,255,255,0.7)',
      size: 27, lineH: 42,
      font: 'Arial, sans-serif'
    },
    // Author
    author: { x: 182, y: 790, color: '#00cc66', size: 24, font: 'Arial, sans-serif' },
    // Brand bottom - ABOVE the pill buttons (pills are at y~920)
    brandName: { x: 540, y: 1010, color: '#ffffff', size: 22, weight: 'bold', align: 'center' },
    handle: { x: 540, y: 1042, color: '#00cc66', size: 20, align: 'center' },
  },

  'Dark Luxury': {
    // light_clean.jpg = cream/off-white texture background
    bg: 'light',
    // Small date top center
    dateText: { x: 540, y: 80, color: '#888880', size: 20, align: 'center' },
    // Big centered italic headline
    headline: {
      x: 540, y: 320, maxW: 860,
      color: '#1a1a1a', size: 50,
      weight: '400', italic: true,
      font: 'Georgia, serif',
      lineH: 70, align: 'center'
    },
    // Centered body text
    body: {
      x: 540, y: 540, maxW: 800,
      color: '#3a3a3a', size: 27,
      font: 'Georgia, serif',
      lineH: 44, align: 'center'
    },
    // Author
    author: { x: 540, y: 850, color: '#777777', size: 24, italic: true, align: 'center', font: 'Georgia, serif' },
    // Brand bottom
    brandName: { x: 540, y: 1015, color: '#2a2a2a', size: 21, weight: 'bold', align: 'center' },
    handle: { x: 540, y: 1045, color: '#777777', size: 18, align: 'center' },
  },

  'Light Clean': {
    // news_style.jpg = white/light gray split layout
    bg: 'light',
    splitLayout: true,
    photo: { x: 36, y: 80, w: 456, h: 862, radius: 24 },
    category: { x: 546, y: 114, color: '#ffffff', size: 16, weight: 'bold' },
    headline: {
      x: 538, y: 175, maxW: 505,
      color: '#111111', size: 54,
      weight: 'bold', lineH: 62, uppercase: true
    },
    body: {
      x: 538, y: 520, maxW: 505,
      color: '#333333', size: 22, lineH: 33
    },
    cta: {
      x: 538, y: 880,
      color: '#1a3a6b', size: 23,
      weight: 'bold', text: 'Swipe to know more >'
    },
    brandName: { x: 36, y: 1048, color: '#111111', size: 22, weight: 'bold' },
    handle: { x: 1044, y: 1048, color: '#111111', size: 22, align: 'right' },
  },

  'News Style': {
    // x_style.jpg = cream/green gradient with two pill shapes
    bg: 'light',
    headline: {
      x: 540, y: 240, maxW: 820,
      color: '#1a2a0a', size: 50,
      weight: 'bold', lineH: 64,
      align: 'center'
    },
    body: {
      x: 540, y: 490, maxW: 820,
      color: '#2a3a1a', size: 25,
      lineH: 38, align: 'center'
    },
    author: { x: 540, y: 820, color: '#3a4a2a', size: 22, italic: true, align: 'center' },
    brandName: { x: 40, y: 960, color: '#1a2a0a', size: 20, weight: 'bold' },
    handle: { x: 1040, y: 960, color: '#3a4a2a', size: 20, align: 'right' },
  },

  'Quote Card': {
    // quote_card.jpg = orange/brown bg, quote marks already on template
    bg: 'dark',
    headline: {
      x: 200, y: 340, maxW: 700,
      color: '#ffffff', size: 38,
      weight: '400', lineH: 56,
      font: 'sans-serif'
    },
    author: {
      x: 200, y: 740,
      color: 'rgba(255,255,255,0.85)',
      size: 26, font: 'sans-serif'
    },
    brandName: { x: 36, y: 1020, color: '#111111', size: 21, weight: 'bold' },
    handle: { x: 1044, y: 1020, color: '#333333', size: 21, align: 'right' },
  }
};

// ── Smart Template Renderer ───────────────────────────────────
function wrapLines(ctx, text, maxW) {
  const words = (text || '').split(' ');
  const lines = []; let line = '';
  for (const w of words) {
    const test = line + (line ? ' ' : '') + w;
    if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; }
    else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

function drawZoneText(ctx, zone, text) {
  if (!zone || !text) return zone ? zone.y : 0;
  const weight = zone.weight || 'normal';
  const italic = zone.italic ? 'italic ' : '';
  ctx.font = italic + weight + ' ' + (zone.size || 28) + 'px ' + (zone.font || 'sans-serif');
  ctx.fillStyle = zone.color || '#ffffff';
  ctx.textAlign = zone.align || 'left';
  // Add subtle shadow for readability
  if (zone.shadow) {
    ctx.shadowColor = zone.shadow;
    ctx.shadowBlur = 4;
  } else {
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
  }
  const display = zone.uppercase ? text.toUpperCase() : text;
  const lines = wrapLines(ctx, display, zone.maxW || 700);
  const lh = zone.lineH || (zone.size || 28) * 1.35;
  let y = zone.y;
  lines.forEach(l => {
    if (y < 1065) { ctx.fillText(l, zone.x, y); y += lh; }
  });
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  return y;
}

async function drawSmartTemplate(quote, author, keyPoints, templateBuffer, photoBuffer, client, templateName, aiData) {
  const S = 1080;
  const canvas = createCanvas(S, S);
  const ctx = canvas.getContext('2d');
  const cfg = TEMPLATE_CONFIGS[templateName] || TEMPLATE_CONFIGS['Quote Card'];

  // AI decides the sizes dynamically
  const sizeMultiplier = aiData && aiData.suggested_headline_size === 'large' ? 1.1
    : aiData && aiData.suggested_headline_size === 'small' ? 0.75 : 1.0;
  const isTextHeavy = aiData && aiData.text_heavy;

  // Dynamic config based on AI decision
  const dynCfg = JSON.parse(JSON.stringify(cfg)); // deep clone
  if (dynCfg.headline) {
    dynCfg.headline.size = Math.round((cfg.headline.size || 50) * sizeMultiplier);
    dynCfg.headline.lineH = Math.round(dynCfg.headline.size * 1.25);
    // If text heavy, start headline higher and make body start lower
    if (isTextHeavy && dynCfg.body) {
      dynCfg.body.size = Math.max(20, (cfg.body.size || 24) - 2);
    }
  }

  // 1 — Draw template background
  if (templateBuffer) {
    try {
      const tmpl = await loadImage(templateBuffer);
      const scale = Math.max(S / tmpl.width, S / tmpl.height);
      const tw = tmpl.width * scale, th = tmpl.height * scale;
      ctx.drawImage(tmpl, (S - tw) / 2, (S - th) / 2, tw, th);
    } catch(e) {
      ctx.fillStyle = cfg.bg === 'dark' ? '#111' : '#f5f5f0';
      ctx.fillRect(0, 0, S, S);
    }
  }

  // 2 — Place photo for split layout
  if (dynCfg.splitLayout && dynCfg.photo && photoBuffer) {
    try {
      const p = dynCfg.photo;
      const img = await loadImage(photoBuffer);
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(p.x, p.y, p.w, p.h, p.radius || 0);
      ctx.clip();
      const sc = Math.max(p.w / img.width, p.h / img.height);
      const iw = img.width * sc, ih = img.height * sc;
      ctx.drawImage(img, p.x + (p.w - iw) / 2, p.y + (p.h - ih) / 2, iw, ih);
      ctx.restore();
    } catch(e) { console.log('Photo err:', e.message); }
  }

  const headline = quote || aiData?.headline || 'Your Story';
  const bodyText = keyPoints && keyPoints.length > 0
    ? keyPoints.slice(0, 3).join('. ') + '.'
    : (aiData?.body || 'A powerful insight worth sharing with your audience.');
  const today = new Date().toLocaleDateString('en-GB').split('/').join('.');

  // 3 — Draw date
  if (dynCfg.dateText) drawZoneText(ctx, dynCfg.dateText, today);

  // 4 — Category label
  if (dynCfg.category) {
    const cat = isTextHeavy ? 'KEY INSIGHTS' : (author ? 'FEATURED QUOTE' : 'FEATURED POST');
    drawZoneText(ctx, dynCfg.category, '  ' + cat);
  }

  // 5 — Accent line
  if (dynCfg.accentLine) {
    ctx.fillStyle = dynCfg.accentLine.color;
    ctx.fillRect(dynCfg.accentLine.x, dynCfg.accentLine.y, dynCfg.accentLine.w, dynCfg.accentLine.h);
  }

  // 6 — Headline
  const afterHeadline = drawZoneText(ctx, dynCfg.headline, headline);

  // 7 — Body (only if AI says text_heavy OR template has body zone)
  if (dynCfg.body && bodyText && !author) {
    // Dynamically position body after headline if needed
    if (afterHeadline && afterHeadline > dynCfg.body.y) {
      dynCfg.body.y = afterHeadline + 20;
    }
    drawZoneText(ctx, dynCfg.body, bodyText);
  }

  // 8 — Author (for quotes)
  if (author && dynCfg.author) {
    drawZoneText(ctx, dynCfg.author, '— ' + author);
  }

  // 9 — CTA
  if (dynCfg.cta) {
    ctx.font = 'bold ' + dynCfg.cta.size + 'px sans-serif';
    ctx.fillStyle = dynCfg.cta.color;
    ctx.textAlign = 'left';
    ctx.fillText(dynCfg.cta.text, dynCfg.cta.x, dynCfg.cta.y);
  }

  // 10 — Brand
  drawZoneText(ctx, dynCfg.brandName, client.name || 'Visual Pro Media');
  drawZoneText(ctx, dynCfg.handle, '@' + (client.handle || 'visualpromediaofficial'));

  return canvas.toBuffer('image/png');
}


// ── Generate content + AI Layout Decision ────────────────────
async function generateContent(text, templateName) {
  const templateDescriptions = {
    'X Style': 'Dark black card with green accents. Has headline top, body text middle with accent line.',
    'Dark Luxury': 'Cream texture background, elegant. Centered italic headline + body paragraph + author.',
    'Light Clean': 'White split layout photo LEFT text RIGHT. Has category bar, big bold headline, body, CTA.',
    'News Style': 'Cream gradient. Centered headline and body text.',
    'Quote Card': 'Orange background with quote box. Quote text + author name only.',
  };

  const templateInfo = templateDescriptions[templateName] || templateDescriptions['Light Clean'];

  const systemPrompt = `You are a world-class Instagram content strategist and copywriter. You write content that gets massive engagement - the kind that stops people from scrolling. You think like the best copywriters in the world.

The user will give you a topic or request. Your job is to:
1. Deeply understand what they want
2. Create the BEST possible content for that topic - better than what they could write themselves
3. Make the headline emotional, powerful, and impossible to ignore
4. Make the body text genuinely insightful and valuable
5. If it is a quote request - find the most powerful, relevant quote from a real person
6. If it is motivational - make it truly inspiring, not generic
7. If it is news/tips - make it feel fresh, urgent, and actionable

CONTENT QUALITY RULES:
- Headlines must be POWERFUL and EMOTIONAL - not generic. Bad: "Work Hard". Good: "The 5am habit that made me a millionaire"
- Body text must feel like it was written by an expert - specific, insightful, not vague
- Quotes must be REAL, VERIFIED quotes from real people - not made up
- For business content - add specific actionable advice that actually works
- For motivational - connect to real human emotions and struggles
- For news - make it feel relevant and urgent
- Use power words: "secret", "proven", "massive", "transform", "unlock", "exactly"
- Write like you are talking to ONE specific person, not a crowd
- Every sentence must earn its place

INSTAGRAM CAPTION RULES:
- Start with a HOOK that grabs attention in first line (before "more" button)
- Use line breaks for readability  
- End with a question to drive comments
- Include emoji naturally, not forced
- Make it feel human and authentic, not corporate

Return a JSON object with these fields:
{
  "headline": "POWERFUL headline - max 8 words, emotionally charged, scroll-stopping",
  "quote": "If this is a quote request - the exact real quote. Otherwise same as headline",
  "author": "Real person name if this is a quote, otherwise null",
  "body": "2-3 sentences of genuinely valuable, specific insight. Not vague. Real advice.",
  "key_points": ["Specific point 1", "Specific point 2", "Specific point 3"],
  "image_prompt": "Very detailed DALL-E 3 prompt. Include: subject description, style (photorealistic/illustration/cinematic), mood (dramatic/peaceful/energetic), lighting, colors, composition. If person mentioned - describe them specifically with age, appearance, setting.",
  "caption": "Full Instagram caption with hook, value, and question. Use line breaks. 150-200 words.",
  "cta": "Strong call to action (save this, share with someone who needs this, etc)",
  "hashtags": "#relevant #hashtags (15 targeted hashtags mixing popular and niche)",
  "text_heavy": true if topic needs detailed explanation, false if quote/minimal,
  "suggested_headline_size": "large" if headline under 20 chars, "medium" if 20-40, "small" if over 40
}

Template: ${templateName}
Template layout info: ${templateInfo}

IMPORTANT: Return ONLY valid JSON. No explanation. No markdown. Just the JSON object.`;

  const response = await axios.post('https://api.openai.com/v1/chat/completions', {
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: text }
    ],
    max_tokens: 1200,
    temperature: 0.85
  }, {
    headers: {
      'Authorization': 'Bearer ' + OPENAI_KEY,
      'Content-Type': 'application/json'
    },
    timeout: 30000
  });

  const raw = response.data.choices[0].message.content.trim();
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON in response');
  const data = JSON.parse(jsonMatch[0]);
  const hl = data.headline || text;
  data.suggested_headline_size = hl.length < 20 ? 'large' : hl.length < 40 ? 'medium' : 'small';
  return data;
}

// ── Get background image
