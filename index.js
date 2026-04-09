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


// ── Template Layout Definitions ─────────────────────────────
const TEMPLATE_LAYOUTS = {
  'X Style': {
    type: 'text_only',
    bg: '#000000',
    cardColor: 'rgba(10,30,10,0.85)',
    cardX: 60, cardY: 80, cardW: 960, cardH: 920, cardRadius: 60,
    accentColor: '#00cc66',
    textColor: '#ffffff',
    subColor: 'rgba(255,255,255,0.7)',
    titleFont: 'bold 52px sans-serif',
    bodyFont: '28px sans-serif',
    titleY: 280, bodyY: 520,
  },
  'Dark Luxury': {
    type: 'text_only',
    bg: '#f5f0e8',
    cardColor: null,
    accentColor: '#1a1a1a',
    textColor: '#1a1a1a',
    subColor: 'rgba(0,0,0,0.65)',
    titleFont: 'italic bold 56px Georgia, serif',
    bodyFont: '28px Georgia, serif',
    titleY: 360, bodyY: 580,
    centered: true
  },
  'Light Clean': {
    type: 'split',
    photoX: 36, photoY: 80, photoW: 456, photoH: 860, photoRadius: 28,
    textX: 530, textStartY: 100, textW: 510,
    bg: '#f8f8f6',
    accentColor: '#1a3a6b',
    accentBg: '#2c4a7a',
    textColor: '#111111',
    subColor: 'rgba(0,0,0,0.65)',
    bottomBg: 'rgba(255,255,255,0.9)',
    bottomTextColor: '#111111'
  },
  'News Style': {
    type: 'quote_card',
    bg: null, // use template as full bg
    cardX: 60, cardY: 120, cardW: 960, cardH: 720, cardRadius: 40,
    cardColor: 'rgba(255,255,255,0.12)',
    accentColor: '#ffffff',
    textColor: '#ffffff',
    subColor: 'rgba(255,255,255,0.8)',
    titleFont: 'bold 52px sans-serif',
    bodyFont: '30px sans-serif',
    quoteSize: 48,
    hasQuoteMarks: true
  },
  'Quote Card': {
    type: 'quote_card',
    bg: null,
    cardX: 80, cardY: 150, cardW: 920, cardH: 680, cardRadius: 40,
    cardColor: 'rgba(255,255,255,0.10)',
    accentColor: '#ffffff',
    textColor: '#ffffff',
    subColor: 'rgba(255,255,255,0.8)',
    titleFont: 'bold 48px Georgia, serif',
    bodyFont: 'italic 30px Georgia, serif',
    quoteSize: 44,
    hasQuoteMarks: true
  }
};

function wrapText(ctx, text, x, y, maxW, lineH) {
  const words = text.split(' ');
  let line = '', lines = [];
  for (const w of words) {
    const test = line + (line ? ' ' : '') + w;
    if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; }
    else line = test;
  }
  if (line) lines.push(line);
  lines.forEach((l, i) => ctx.fillText(l, x, y + i * lineH));
  return y + lines.length * lineH;
}

async function drawSmartTemplate(quote, author, keyPoints, templateBuffer, photoBuffer, client, templateName) {
  const S = 1080;
  const canvas = createCanvas(S, S);
  const ctx = canvas.getContext('2d');
  const layout = TEMPLATE_LAYOUTS[templateName] || TEMPLATE_LAYOUTS['Light Clean'];

  // ── Draw template background ──
  if (templateBuffer) {
    try {
      const tmpl = await loadImage(templateBuffer);
      const scale = Math.max(S / tmpl.width, S / tmpl.height);
      const tw = tmpl.width * scale, th = tmpl.height * scale;
      ctx.drawImage(tmpl, (S - tw) / 2, (S - th) / 2, tw, th);
    } catch(e) {
      ctx.fillStyle = layout.bg || '#ffffff';
      ctx.fillRect(0, 0, S, S);
    }
  } else {
    ctx.fillStyle = layout.bg || '#ffffff';
    ctx.fillRect(0, 0, S, S);
  }

  const caption = keyPoints && keyPoints.length > 0 ? keyPoints.join('. ') + '.' : (author ? quote + '\n— ' + author : quote);
  const headline = quote || 'Your Story';

  // ── SPLIT LAYOUT (Light Clean) ──
  if (layout.type === 'split') {
    // Draw photo on left
    if (photoBuffer) {
      try {
        const photo = await loadImage(photoBuffer);
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(layout.photoX, layout.photoY, layout.photoW, layout.photoH, layout.photoRadius);
        ctx.clip();
        const scale = Math.max(layout.photoW / photo.width, layout.photoH / photo.height);
        const pw = photo.width * scale, ph = photo.height * scale;
        ctx.drawImage(photo, layout.photoX + (layout.photoW - pw) / 2, layout.photoY + (layout.photoH - ph) / 2, pw, ph);
        ctx.restore();
      } catch(e) {}
    }

    // Category bar
    ctx.fillStyle = layout.accentBg;
    ctx.fillRect(layout.textX, layout.textStartY, layout.textW, 44);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('  ' + (keyPoints && keyPoints.length > 0 ? 'KEY INSIGHTS' : 'FEATURED POST'), layout.textX + 8, layout.textStartY + 29);

    // Big headline
    let hy = layout.textStartY + 80;
    const hSize = headline.length < 15 ? 100 : headline.length < 25 ? 84 : headline.length < 40 ? 68 : 54;
    ctx.font = 'bold ' + hSize + 'px sans-serif';
    ctx.fillStyle = layout.textColor;
    ctx.textAlign = 'left';
    const hwords = headline.toUpperCase().split(' ');
    let hline = '', hlines = [];
    for (const w of hwords) {
      const test = hline + (hline ? ' ' : '') + w;
      if (ctx.measureText(test).width > layout.textW && hline) { hlines.push(hline); hline = w; }
      else hline = test;
    }
    if (hline) hlines.push(hline);
    hlines.slice(0, 5).forEach(l => { ctx.fillText(l, layout.textX, hy); hy += hSize * 1.1; });

    // Body text
    hy += 20;
    ctx.font = '24px sans-serif';
    ctx.fillStyle = layout.subColor;
    const bodyText = keyPoints && keyPoints.length > 0 ? keyPoints.slice(0, 3).join('. ') + '.' : caption;
    const bwords = bodyText.split(' ');
    let bline = '', blines = [];
    for (const w of bwords) {
      const test = bline + (bline ? ' ' : '') + w;
      if (ctx.measureText(test).width > layout.textW && bline) { blines.push(bline); bline = w; }
      else bline = test;
    }
    if (bline) blines.push(bline);
    blines.slice(0, 8).forEach(l => { ctx.fillText(l, layout.textX, hy); hy += 34; });

    // CTA
    ctx.font = 'bold 26px sans-serif';
    ctx.fillStyle = layout.accentColor;
    ctx.fillText('Swipe to know more >', layout.textX, S - 160);

    // Bottom bar
    ctx.fillStyle = layout.bottomBg || 'rgba(255,255,255,0.9)';
    ctx.fillRect(0, S - 80, S, 80);
    ctx.font = 'bold 24px sans-serif';
    ctx.fillStyle = layout.bottomTextColor || '#111';
    ctx.textAlign = 'left';
    ctx.fillText(client.name || 'Visual Pro Media', 36, S - 28);
    ctx.textAlign = 'right';
    ctx.fillText('@' + (client.handle || 'visualpromediaofficial'), S - 36, S - 28);
  }

  // ── TEXT ONLY LAYOUT (X Style, Dark Luxury) ──
  else if (layout.type === 'text_only') {
    // Optional card overlay
    if (layout.cardColor) {
      ctx.fillStyle = layout.cardColor;
      ctx.beginPath();
      ctx.roundRect(layout.cardX, layout.cardY, layout.cardW, layout.cardH, layout.cardRadius || 0);
      ctx.fill();
    }

    const cx = layout.centered;
    const tx = cx ? S / 2 : (layout.cardX || 60) + 60;
    ctx.textAlign = cx ? 'center' : 'left';

    // Headline
    ctx.font = layout.titleFont || 'bold 56px sans-serif';
    ctx.fillStyle = layout.textColor;
    let hy = layout.titleY || 300;
    const maxW = layout.cardW ? layout.cardW - 120 : 900;
    const hwords = headline.split(' ');
    let hline = '', hlines = [];
    for (const w of hwords) {
      const test = hline + (hline ? ' ' : '') + w;
      if (ctx.measureText(test).width > maxW && hline) { hlines.push(hline); hline = w; }
      else hline = test;
    }
    if (hline) hlines.push(hline);
    const hSize = parseInt(layout.titleFont) || 56;
    hlines.slice(0, 5).forEach(l => { ctx.fillText(l, tx, hy); hy += hSize * 1.3; });

    // Accent line
    if (!cx) {
      ctx.fillStyle = layout.accentColor;
      ctx.fillRect(tx, hy + 10, 80, 4);
    }
    hy += 40;

    // Body text
    ctx.font = layout.bodyFont || '28px sans-serif';
    ctx.fillStyle = layout.subColor;
    const bodyText = keyPoints && keyPoints.length > 0 ? keyPoints.slice(0, 2).join('. ') + '.' : caption;
    const bwords = bodyText.split(' ');
    let bline = '', blines = [];
    for (const w of bwords) {
      const test = bline + (bline ? ' ' : '') + w;
      if (ctx.measureText(test).width > maxW && bline) { blines.push(bline); bline = w; }
      else bline = test;
    }
    if (bline) blines.push(bline);
    const bSize = parseInt(layout.bodyFont) || 28;
    blines.slice(0, 6).forEach(l => { ctx.fillText(l, tx, hy); hy += bSize * 1.5; });

    // Author
    if (author) {
      ctx.font = 'bold ' + bSize + 'px sans-serif';
      ctx.fillStyle = layout.accentColor;
      ctx.fillText('— ' + author, tx, hy + 20);
    }

    // Bottom branding
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, S - 70, S, 70);
    ctx.font = 'bold 22px sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.fillText(client.name || 'Visual Pro Media', 36, S - 22);
    ctx.textAlign = 'right';
    ctx.fillText('@' + (client.handle || 'visualpromediaofficial'), S - 36, S - 22);
  }

  // ── QUOTE CARD LAYOUT (News Style, Quote Card) ──
  else if (layout.type === 'quote_card') {
    // Card overlay
    if (layout.cardColor) {
      ctx.fillStyle = layout.cardColor;
      ctx.beginPath();
      ctx.roundRect(layout.cardX, layout.cardY, layout.cardW, layout.cardH, layout.cardRadius);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(layout.cardX, layout.cardY, layout.cardW, layout.cardH, layout.cardRadius);
      ctx.stroke();
    }

    // Quote marks
    if (layout.hasQuoteMarks) {
      ctx.font = 'bold 120px serif';
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.textAlign = 'left';
      ctx.fillText('“', layout.cardX + 40, layout.cardY + 110);
      ctx.textAlign = 'right';
      ctx.fillText('”', layout.cardX + layout.cardW - 20, layout.cardY + layout.cardH - 20);
    }

    // Quote text
    const qSize = layout.quoteSize || 44;
    ctx.font = layout.titleFont || ('bold ' + qSize + 'px Georgia, serif');
    ctx.fillStyle = layout.textColor;
    ctx.textAlign = 'left';
    const qx = layout.cardX + 60;
    const qmaxW = layout.cardW - 120;
    let qy = layout.cardY + 160;
    const qwords = quote.split(' ');
    let qline = '', qlines = [];
    for (const w of qwords) {
      const test = qline + (qline ? ' ' : '') + w;
      if (ctx.measureText(test).width > qmaxW && qline) { qlines.push(qline); qline = w; }
      else qline = test;
    }
    if (qline) qlines.push(qline);
    qlines.slice(0, 7).forEach(l => { ctx.fillText(l, qx, qy); qy += qSize * 1.4; });

    // Author
    if (author) {
      ctx.font = '28px sans-serif';
      ctx.fillStyle = layout.subColor;
      ctx.fillText('- ' + author, qx, qy + 20);
    }

    // Bottom branding
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, S - 70, S, 70);
    ctx.font = 'bold 22px sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.fillText(client.name || 'Visual Pro Media', 36, S - 22);
    ctx.textAlign = 'right';
    ctx.fillText('@' + (client.handle || 'visualpromediaofficial'), S - 36, S - 22);
  }

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

  const res = await axios.post('https://api.openai.com/v1/chat/completions', {
    model: 'gpt-4o',
    max_tokens: 1200,
    messages: [
      { role: 'system', content: `You are an expert Instagram content creator. Choose best post type automatically. Respond ONLY with JSON. No backticks. No explanation. {"quote":"catchy hook max 10 words","author":"person name or empty","key_points":["fact 1","fact 2","fact 3"],"caption":"2-3 paragraphs max 180 words","cta":"call to action","hashtags":"10 hashtags with #","image_prompt":"vivid scene description for AI image, no people faces, no text, cinematic"}` },
      { role: 'user', content: 'Instagram post about: ' + topic + (searchResults ? '\n\nContext:\n' + searchResults : '') }
    ]
  }, { headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + OPENAI_KEY } });

  let raw = res.data.choices[0].message.content;
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
async function sendText(botToken, chatId, text, parse_mode='Markdown') {
  await axios.post('https://api.telegram.org/bot' + botToken + '/sendMessage', { chat_id: chatId, text, parse_mode });
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
// ── Homepage = Landing Page ───────────────────────────────────
app.get('/', (req, res) => {
  res.send(LANDING_PAGE_HTML);
});

// ── Admin Login Page ──────────────────────────────────────────
app.get('/admin-login', (req, res) => {
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


// ── Templates Configuration ───────────────────────────────────
const TEMPLATES = {
  'Dark Luxury':  { file: 'templates/dark_luxury.jpg',  emoji: '🖤' },
  'Light Clean':  { file: 'templates/light_clean.jpg',  emoji: '🤍' },
  'X Style':      { file: 'templates/x_style.jpg',      emoji: '✖️' },
  'News Style':   { file: 'templates/news_style.jpg',   emoji: '📰' },
  'Quote Card':   { file: 'templates/quote_card.jpg',   emoji: '💬' },
};
const TEMPLATE_NAMES = Object.keys(TEMPLATES);

async function sendTemplateMenu(botToken, chatId) {
  const buttons = TEMPLATE_NAMES.map(name => [{
    text: TEMPLATES[name].emoji + ' ' + name,
    callback_data: 'template:' + name
  }]);
  buttons.push([{ text: '📷 Upload My Own Photo', callback_data: 'template:custom' }]);
  await axios.post('https://api.telegram.org/bot' + botToken + '/sendMessage', {
    chat_id: chatId,
    text: '🎨 *Choose Your Template Style*\n\nSelect a template for your posts. You can change it anytime with /template',
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: buttons }
  });
}

async function getTemplateBackground(templateName, userPhotoBuffer) {
  // If user uploaded their own photo, use it
  if (userPhotoBuffer) return userPhotoBuffer;
  // Load template from file
  try {
    const templatePath = TEMPLATES[templateName] ? TEMPLATES[templateName].file : null;
    if (templatePath && fs.existsSync(templatePath)) {
      return fs.readFileSync(templatePath);
    }
  } catch(e) { console.log('Template load error:', e.message); }
  return null;
}

// ── Per-client webhook ────────────────────────────────────────
app.post('/webhook/:clientId', async (req, res) => {
  res.sendStatus(200);
  const clients = loadClients();
  const client = clients[req.params.clientId];
  if (!client) return;

  // Handle callback queries (template selection buttons)
  if (req.body && req.body.callback_query) {
    const cb = req.body.callback_query;
    const chatId = cb.message.chat.id;
    const data = cb.data;
    // Answer callback to remove loading spinner
    await axios.post('https://api.telegram.org/bot' + client.botToken + '/answerCallbackQuery', {
      callback_query_id: cb.id
    }).catch(() => {});

    if (data && data.startsWith('template:')) {
      const chosen = data.replace('template:', '');
      if (chosen === 'custom') {
        await sendText(client.botToken, chatId, '📷 *Upload Your Photo*\n\nSend me any photo now and I will use it as the background for your posts.\n\nOr send /template to pick a different style.', 'Markdown');
        userTemplates[chatId] = 'custom';
      } else {
        userTemplates[chatId] = chosen;
        userPhotos[chatId] = null; // clear any saved photo
        await sendText(client.botToken, chatId, '✅ Template set to *' + chosen + '* ' + TEMPLATES[chosen].emoji + '\n\nNow send me any topic to create a post!', 'Markdown');
      }
    }
    return;
  }

  const msg = req.body && req.body.message;
  if (!msg) return;
  const chatId = msg.chat.id;
  const text = (msg.text || '').trim();
  const lower = text.toLowerCase();
  const sessionKey = client.id + '_' + chatId;

  try {
    // /start command
    if (lower === '/start') {
      await sendText(client.botToken, chatId,
        `Welcome to *${client.name} Bot!* 🎨

Powered by GPT-4o + AI Image Generation!

📌 *Commands:*
/template — Choose your post template style

📝 *To create a post:*
Just type any topic!
📰 Latest news on any topic
🛠 Best AI tools for...
💡 Famous person quotes
🔥 Motivational topics

Reply *approve* to post to Instagram
Reply *redo* to regenerate

Start by choosing your template 👇`);
      await sendTemplateMenu(client.botToken, chatId);
      return;
    }

    // /template command
    if (lower === '/template') {
      await sendTemplateMenu(client.botToken, chatId);
      return;
    }

    // Handle photo upload
    if (msg.photo && msg.photo.length > 0) {
      const photo = msg.photo[msg.photo.length - 1]; // highest quality
      try {
        const fileRes = await axios.get('https://api.telegram.org/bot' + client.botToken + '/getFile?file_id=' + photo.file_id);
        const filePath = fileRes.data.result.file_path;
        const fileUrl = 'https://api.telegram.org/file/bot' + client.botToken + '/' + filePath;
        const imgBuf = await downloadImage(fileUrl);
        if (imgBuf) {
          userPhotos[chatId] = imgBuf;
          userTemplates[chatId] = 'custom';
          await sendText(client.botToken, chatId, '✅ *Photo saved!*\n\nYour photo will be used as the background for your next post.\n\nNow send me a topic to create your post!', 'Markdown');
        }
      } catch(e) {
        await sendText(client.botToken, chatId, 'Could not process photo. Please try again!');
      }
      return;
    }

    // approve
    if (lower === 'approve' && sessions[sessionKey]) {
      const s = sessions[sessionKey];
      await sendText(client.botToken, chatId, '📤 Posting to Instagram...');
      const postId = await postToInstagram(s.imgId, s.caption + '\n\n' + s.cta + '\n\n' + s.hashtags, client);
      delete sessions[sessionKey];
      await sendText(client.botToken, chatId, `✅ Posted to @${client.handle}!\n\nPost ID: ${postId}`);
      return;
    }

    // redo/cancel
    if ((lower === 'redo' || lower === 'cancel') && sessions[sessionKey]) {
      delete sessions[sessionKey];
      await sendText(client.botToken, chatId, 'Cancelled. Send a new topic!');
      return;
    }

    // Generate post
    const chosenTemplate = userTemplates[chatId] || TEMPLATE_NAMES[0];
    const userPhoto = userPhotos[chatId] || null;

    await sendText(client.botToken, chatId, `🎨 Creating post about:
*"${text}"*

Template: ${chosenTemplate}

Generating content... ~25 seconds`);

    const data = await generateContent(text);

    const kp = data.key_points || [];
    let imgBuf;

    // Check if user has a template selected
    const hasTemplate = chosenTemplate && chosenTemplate !== 'custom' && TEMPLATES[chosenTemplate];
    const templateBuf = hasTemplate ? await getTemplateBackground(chosenTemplate, null) : null;

    if (hasTemplate || userPhoto) {
      // Use smart template renderer
      // Get a relevant photo for the post if no user photo
      let postPhoto = userPhoto;
      if (!postPhoto) {
        postPhoto = await getBackgroundImage(text, data._newsImageUrl, data.image_prompt);
      }
      imgBuf = await drawSmartTemplate(
        data.quote || text,
        data.author || '',
        kp,
        templateBuf,
        postPhoto,
        client,
        chosenTemplate
      );
    } else {
      // Default renderer — AI generated background
      const bgBuf = await getBackgroundImage(text, data._newsImageUrl, data.image_prompt);
      imgBuf = await drawTemplate(data.quote || text, data.author || '', kp, bgBuf, client);
    }

    const imgId = 'img_' + Date.now();
    imageStore[imgId] = imgBuf;
    setTimeout(() => { delete imageStore[imgId]; }, 600000);
    sessions[sessionKey] = { imgId, caption: data.caption, cta: data.cta, hashtags: data.hashtags };

    const preview = data.caption + '\n\n' + data.cta + '\n\n' + data.hashtags + '\n\nTemplate: ' + chosenTemplate + '\n\nReply approve to post | redo to regenerate';
    await sendPhoto(client.botToken, chatId, imgBuf, preview.length > 1000 ? preview.substring(0, 1000) + '...\n\nReply approve | redo' : preview);

  } catch(err) {
    console.error('Webhook error:', err.message, JSON.stringify(err.response?.data), 'URL:', err.config?.url);
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

// ── Razorpay Setup ────────────────────────────────────────────
const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || '';
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || '';
const crypto = require('crypto');


// ── Instagram OAuth Login Flow ────────────────────────────────

// Step 1 — Beautiful Connect Page with Instagram Login Button
app.get('/ig-connect', (req, res) => {
  const { plan, payment_id } = req.query;
  const redirectUri = PUBLIC_URL + '/connect/callback';
  const igAuthUrl = 'https://www.instagram.com/oauth/authorize?force_reauth=true&client_id=' + process.env.IG_APP_ID + '&redirect_uri=' + encodeURIComponent(redirectUri) + '&response_type=code&scope=instagram_business_basic%2Cinstagram_business_manage_messages%2Cinstagram_business_manage_comments%2Cinstagram_business_content_publish%2Cinstagram_business_manage_insights&state=' + encodeURIComponent(JSON.stringify({plan: plan||'monthly', payment_id: payment_id||''}));
  
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Connect Instagram — Visual Pro Media</title>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,600;1,300&family=Instrument+Sans:wght@400;500;600&family=Bebas+Neue&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{--ink:#080a0f;--ink2:#0d1018;--gold:#c9a84c;--gold2:#e8c97a;--gold-dim:rgba(201,168,76,0.1);--gold-line:rgba(201,168,76,0.22);--white:#f4f1eb;--white2:#b8b4aa;--white3:#6b6760;--white4:#2a2825;--green:#3dba7e}
body{font-family:'Instrument Sans',sans-serif;background:var(--ink);color:var(--white);min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
body::after{content:'';position:fixed;inset:0;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23g)' opacity='0.04'/%3E%3C/svg%3E");pointer-events:none;z-index:998;opacity:0.4}
.page{display:grid;grid-template-columns:1fr 1fr;max-width:1000px;width:100%;gap:2px;background:var(--white4);border:1px solid var(--white4);position:relative;z-index:1}
.left{background:var(--ink2);padding:64px 52px}
.right{background:var(--ink);padding:64px 52px}
.logo{font-family:'Cormorant Garamond',serif;font-weight:300;font-size:18px;letter-spacing:5px;text-transform:uppercase;margin-bottom:52px}
.logo span{color:var(--gold)}
.paid-badge{display:inline-flex;align-items:center;gap:8px;background:rgba(61,186,126,0.07);border:1px solid rgba(61,186,126,0.2);color:var(--green);padding:7px 18px;font-size:10px;font-weight:600;letter-spacing:3px;text-transform:uppercase;margin-bottom:32px}
.paid-dot{width:6px;height:6px;border-radius:50%;background:var(--green)}
h1{font-family:'Cormorant Garamond',serif;font-weight:300;font-style:italic;font-size:48px;line-height:1.05;letter-spacing:-1.5px;margin-bottom:20px}
h1 em{color:var(--gold)}
.desc{font-size:15px;color:var(--white2);line-height:1.85;margin-bottom:52px}
.steps{display:flex;flex-direction:column;gap:0}
.step{display:flex;gap:20px;padding:20px 0;border-bottom:1px solid var(--white4)}
.step:last-child{border-bottom:none}
.sn{font-family:'Bebas Neue',sans-serif;font-size:36px;color:var(--gold);line-height:1;min-width:32px}
.st strong{display:block;font-size:14px;font-weight:600;margin-bottom:3px}
.st span{font-size:13px;color:var(--white3);line-height:1.7}
.right-inner{display:flex;flex-direction:column;justify-content:center;height:100%}
.right-title{font-family:'Cormorant Garamond',serif;font-size:28px;font-weight:300;font-style:italic;margin-bottom:8px}
.right-sub{font-size:14px;color:var(--white2);line-height:1.8;margin-bottom:40px}
.ig-btn{display:flex;align-items:center;justify-content:center;gap:14px;width:100%;padding:20px;background:linear-gradient(135deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888);color:#fff;border:none;font-family:'Instrument Sans',sans-serif;font-size:13px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;text-decoration:none;cursor:pointer;transition:opacity 0.3s,transform 0.2s;margin-bottom:16px}
.ig-btn:hover{opacity:0.9;transform:translateY(-2px)}
.ig-icon{width:22px;height:22px;border:2px solid #fff;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:12px;flex-shrink:0}
.divider{display:flex;align-items:center;gap:12px;margin:24px 0;color:var(--white3);font-size:11px;letter-spacing:2px;text-transform:uppercase}
.divider::before,.divider::after{content:'';flex:1;height:1px;background:var(--white4)}
.manual-btn{display:block;width:100%;padding:18px;border:1px solid var(--white4);color:var(--white3);background:transparent;font-family:'Instrument Sans',sans-serif;font-size:11px;font-weight:500;letter-spacing:2px;text-transform:uppercase;text-decoration:none;text-align:center;cursor:pointer;transition:all 0.3s}
.manual-btn:hover{border-color:var(--gold-line);color:var(--gold)}
.security-note{display:flex;align-items:flex-start;gap:10px;background:var(--gold-dim);border:1px solid var(--gold-line);padding:16px;margin-top:28px}
.security-note span{font-size:12px;color:var(--white2);line-height:1.7}
.security-note .icon{flex-shrink:0;font-size:16px;margin-top:1px}
.perm-list{display:flex;flex-direction:column;gap:8px;margin:24px 0}
.perm{display:flex;align-items:center;gap:10px;font-size:13px;color:var(--white2)}
.perm-check{width:18px;height:18px;border:1px solid var(--gold-line);display:flex;align-items:center;justify-content:center;font-size:10px;color:var(--gold);flex-shrink:0}
@media(max-width:720px){.page{grid-template-columns:1fr}.left{padding:40px 28px}.right{padding:40px 28px}h1{font-size:36px}}
</style>
</head>
<body>
<div class="page">
  <div class="left">
    <div class="logo">Visual Pro <span>Media</span></div>
    <div class="paid-badge"><span class="paid-dot"></span> Payment Confirmed</div>
    <h1>Connect Your<br><em>Instagram</em></h1>
    <p class="desc">One click to connect your Instagram account. We'll automatically set up your AI bot and start posting for you.</p>
    <div class="steps">
      <div class="step"><div class="sn">01</div><div class="st"><strong>Click Connect Instagram</strong><span>You'll be taken to Instagram's official login page securely.</span></div></div>
      <div class="step"><div class="sn">02</div><div class="st"><strong>Log In & Allow Access</strong><span>Enter your Instagram credentials and grant our app permission.</span></div></div>
      <div class="step"><div class="sn">03</div><div class="st"><strong>Fill Basic Details</strong><span>Tell us your business name, niche, and Telegram bot token.</span></div></div>
      <div class="step"><div class="sn">04</div><div class="st"><strong>Bot Goes Live!</strong><span>Your AI Instagram bot activates automatically. Start posting!</span></div></div>
    </div>
  </div>
  <div class="right">
    <div class="right-inner">
      <div class="right-title">Almost there!</div>
      <p class="right-sub">Click the button below to securely connect your Instagram account. This takes less than 60 seconds.</p>
      
      <a href="${igAuthUrl}" class="ig-btn">
        <div class="ig-icon">📸</div>
        Connect with Instagram
      </a>

      <p style="font-size:12px;color:var(--white3);text-align:center;line-height:1.7">You will be redirected to Instagram's official login page. We never see or store your Instagram password.</p>

      <div class="perm-list">
        <div class="perm"><div class="perm-check">✓</div>Read your Instagram profile</div>
        <div class="perm"><div class="perm-check">✓</div>Publish posts on your behalf</div>
        <div class="perm"><div class="perm-check">✓</div>Manage comments</div>
      </div>

      <div class="security-note">
        <span class="icon">🔒</span>
        <span>Your credentials are never stored. We use Instagram's official OAuth 2.0 authentication — the same system used by Buffer, Later, and Hootsuite.</span>
      </div>

      <div class="divider">or</div>
      <a href="/connect" class="manual-btn">Set Up Manually Instead</a>
    </div>
  </div>
</div>
</body>
</html>`);
});

// Step 2 — Instagram OAuth Callback
app.get('/connect/callback', async (req, res) => {
  const { code, state, error } = req.query;
  
  if (error) {
    return res.redirect('/ig-connect?error=Instagram+login+was+cancelled');
  }
  
  if (!code) {
    return res.redirect('/ig-connect?error=No+authorization+code+received');
  }

  try {
    // Parse state
    let stateData = {};
    try { stateData = JSON.parse(decodeURIComponent(state||'{}')); } catch(e) {}

    // Exchange code for short-lived token
    const tokenRes = await axios.post('https://api.instagram.com/oauth/access_token', 
      new URLSearchParams({
        client_id: process.env.IG_APP_ID,
        client_secret: process.env.IG_APP_SECRET,
        grant_type: 'authorization_code',
        redirect_uri: PUBLIC_URL + '/connect/callback',
        code: code
      }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const shortToken = tokenRes.data.access_token;
    const igUserId = tokenRes.data.user_id;

    // Exchange for long-lived token
    const longRes = await axios.get('https://graph.instagram.com/access_token', {
      params: {
        grant_type: 'ig_exchange_token',
        client_id: process.env.IG_APP_ID,
        client_secret: process.env.IG_APP_SECRET,
        access_token: shortToken
      }
    });
    const longToken = longRes.data.access_token;

    // Get Instagram handle
    const profileRes = await axios.get('https://graph.instagram.com/me', {
      params: { fields: 'id,username', access_token: longToken }
    });
    const igHandle = profileRes.data.username;

    // Show setup form with pre-filled IG details
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Almost Done — Visual Pro Media</title>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,600;1,300&family=Instrument+Sans:wght@400;500;600&family=Bebas+Neue&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{--ink:#080a0f;--ink2:#0d1018;--gold:#c9a84c;--gold2:#e8c97a;--gold-dim:rgba(201,168,76,0.1);--gold-line:rgba(201,168,76,0.22);--white:#f4f1eb;--white2:#b8b4aa;--white3:#6b6760;--white4:#2a2825;--green:#3dba7e}
body{font-family:'Instrument Sans',sans-serif;background:var(--ink);color:var(--white);min-height:100vh;padding:48px 24px}
body::after{content:'';position:fixed;inset:0;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23g)' opacity='0.04'/%3E%3C/svg%3E");pointer-events:none;z-index:998;opacity:0.4}
.wrap{max-width:600px;margin:0 auto;position:relative;z-index:1}
.logo{font-family:'Cormorant Garamond',serif;font-weight:300;font-size:18px;letter-spacing:5px;text-transform:uppercase;margin-bottom:48px}
.logo span{color:var(--gold)}
.ig-connected{display:flex;align-items:center;gap:14px;background:rgba(61,186,126,0.07);border:1px solid rgba(61,186,126,0.2);padding:16px 20px;margin-bottom:40px}
.ig-avatar{width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,#f09433,#dc2743,#bc1888);display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0}
.ig-info strong{display:block;font-size:15px;font-weight:600;color:var(--green)}
.ig-info span{font-size:13px;color:var(--white3)}
h1{font-family:'Cormorant Garamond',serif;font-weight:300;font-style:italic;font-size:44px;letter-spacing:-1.5px;margin-bottom:8px;line-height:1.05}
h1 em{color:var(--gold)}
.sub{font-size:15px;color:var(--white2);line-height:1.8;margin-bottom:40px}
.section-label{font-size:10px;font-weight:600;letter-spacing:3px;text-transform:uppercase;color:var(--gold);display:flex;align-items:center;gap:12px;margin-bottom:24px}
.section-label::after{content:'';flex:1;height:1px;background:var(--gold-line)}
.fg{margin-bottom:20px}
label{display:block;font-size:11px;font-weight:500;letter-spacing:2px;text-transform:uppercase;color:var(--white3);margin-bottom:8px}
input,select{width:100%;background:var(--ink2);border:1px solid var(--white4);padding:14px 16px;color:var(--white);font-family:'Instrument Sans',sans-serif;font-size:14px;outline:none;transition:border-color 0.3s;appearance:none}
input:focus,select:focus{border-color:var(--gold-line)}
input::placeholder{color:var(--white4)}
input[readonly]{color:var(--white3);cursor:not-allowed}
.help{font-size:12px;color:var(--white3);margin-top:6px;line-height:1.6}
.help a{color:var(--gold);text-decoration:none}
.divider{height:1px;background:var(--white4);margin:28px 0}
.btn{display:block;width:100%;background:var(--gold);color:var(--ink);border:none;padding:20px;font-family:'Instrument Sans',sans-serif;font-size:11px;font-weight:600;letter-spacing:3px;text-transform:uppercase;cursor:pointer;transition:background 0.3s}
.btn:hover{background:var(--gold2)}
.note{font-size:11px;color:var(--white3);text-align:center;margin-top:14px;letter-spacing:0.5px}
</style>
</head>
<body>
<div class="wrap">
  <div class="logo">Visual Pro <span>Media</span></div>
  
  <div class="ig-connected">
    <div class="ig-avatar">📸</div>
    <div class="ig-info">
      <strong>✅ @${igHandle} Connected!</strong>
      <span>Instagram account linked successfully · User ID: ${igUserId}</span>
    </div>
  </div>

  <h1>Almost <em>Done!</em></h1>
  <p class="sub">Instagram connected! Now just fill in a few more details to activate your bot.</p>

  <form method="POST" action="/ig-save">
    <input type="hidden" name="igToken" value="${longToken}">
    <input type="hidden" name="igUserId" value="${igUserId}">
    <input type="hidden" name="handle" value="${igHandle}">
    <input type="hidden" name="paymentId" value="${stateData.payment_id||''}">

    <div class="section-label">Business Info</div>
    <div class="fg">
      <label>Business / Brand Name</label>
      <input name="name" placeholder="e.g. Tech Startup India" required>
    </div>
    <div class="fg">
      <label>Your Name</label>
      <input name="ownerName" placeholder="e.g. Rahul Sharma" required>
    </div>
    <div class="fg">
      <label>Email Address</label>
      <input name="email" type="email" placeholder="you@example.com" required>
    </div>
    <div class="fg">
      <label>Business Niche</label>
      <select name="niche" required>
        <option value="" disabled selected>Select your niche</option>
        <option>Digital Marketing</option><option>Real Estate</option>
        <option>Fashion & Lifestyle</option><option>Food & Restaurant</option>
        <option>Fitness & Health</option><option>Technology</option>
        <option>Finance & Investment</option><option>Education & Coaching</option>
        <option>Travel & Tourism</option><option>Entertainment</option><option>Other</option>
      </select>
    </div>
    <div class="fg">
      <label>Instagram Account (Auto-filled)</label>
      <input value="@${igHandle}" readonly>
    </div>

    <div class="divider"></div>
    <div class="section-label">Telegram Bot</div>

    <div class="fg">
      <label>Telegram Bot Token</label>
      <input name="botToken" placeholder="1234567890:AAH..." required>
      <div class="help">Open Telegram → search <a href="https://t.me/botfather" target="_blank">@BotFather</a> → /newbot → follow steps → copy token here</div>
    </div>

    <button type="submit" class="btn">Activate My Bot Now →</button>
    <div class="note">🔒 Your data is encrypted and secure</div>
  </form>
</div>
</body>
</html>`);

  } catch(e) {
    console.error('IG OAuth error:', e.response?.data || e.message);
    res.redirect('/ig-connect?error=' + encodeURIComponent('Instagram connection failed: ' + (e.response?.data?.error_message || e.message)));
  }
});

// Step 3 — Save & Activate Bot After OAuth
app.post('/ig-save', async (req, res) => {
  const { name, ownerName, email, niche, igToken, igUserId, handle, botToken, paymentId } = req.body;
  if (!name || !igToken || !igUserId || !botToken) {
    return res.send('<h2 style="font-family:sans-serif;padding:40px;color:red">Please fill all fields. <a href="javascript:history.back()">Go back</a></h2>');
  }
  try {
    const clients = loadClients();
    const id = 'client_' + Date.now();
    clients[id] = { id, name, ownerName: ownerName||'', email: email||'', niche: niche||'', handle, igUserId: String(igUserId), igToken, botToken, paymentId: paymentId||'', active: true, createdAt: new Date().toISOString() };
    saveClients(clients);
    await axios.get('https://api.telegram.org/bot' + botToken + '/setWebhook?url=' + PUBLIC_URL + '/webhook/' + id)
      .catch(e => console.log('Webhook error:', e.message));
    console.log('New OAuth client activated:', name, handle, email);
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Bot Live! — Visual Pro Media</title>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,600;1,300&family=Instrument+Sans:wght@400;500;600&family=Bebas+Neue&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{--ink:#080a0f;--ink2:#0d1018;--gold:#c9a84c;--gold2:#e8c97a;--gold-dim:rgba(201,168,76,0.1);--gold-line:rgba(201,168,76,0.22);--white:#f4f1eb;--white2:#b8b4aa;--white3:#6b6760;--white4:#2a2825;--green:#3dba7e}
body{font-family:'Instrument Sans',sans-serif;background:var(--ink);color:var(--white);min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
body::after{content:'';position:fixed;inset:0;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23g)' opacity='0.04'/%3E%3C/svg%3E");pointer-events:none;z-index:998;opacity:0.4}
.card{max-width:560px;width:100%;text-align:center;position:relative;z-index:1}
.logo{font-family:'Cormorant Garamond',serif;font-weight:300;font-size:18px;letter-spacing:5px;text-transform:uppercase;margin-bottom:48px}
.logo span{color:var(--gold)}
.check-circle{width:88px;height:88px;border:1px solid var(--gold-line);background:var(--gold-dim);display:flex;align-items:center;justify-content:center;margin:0 auto 36px;font-size:36px}
h1{font-family:'Cormorant Garamond',serif;font-weight:300;font-style:italic;font-size:60px;letter-spacing:-2px;line-height:1;margin-bottom:16px}
h1 em{color:var(--gold)}
.sub{font-size:16px;color:var(--white2);line-height:1.8;margin-bottom:48px}
.steps-box{border:1px solid var(--white4);text-align:left;margin-bottom:40px}
.steps-header{padding:16px 24px;border-bottom:1px solid var(--white4);font-size:10px;letter-spacing:3px;text-transform:uppercase;color:var(--white3)}
.sitem{display:flex;align-items:flex-start;gap:18px;padding:18px 24px;border-bottom:1px solid var(--white4)}
.sitem:last-child{border-bottom:none}
.sn{font-family:'Bebas Neue',sans-serif;font-size:28px;color:var(--gold);line-height:1;min-width:24px}
.st strong{display:block;font-size:14px;font-weight:600;margin-bottom:2px}
.st span{font-size:13px;color:var(--white3)}
.btn-tg{display:inline-block;background:var(--gold);color:var(--ink);border:none;padding:18px 48px;font-family:'Instrument Sans',sans-serif;font-size:11px;font-weight:600;letter-spacing:3px;text-transform:uppercase;text-decoration:none;transition:background 0.3s}
.btn-tg:hover{background:var(--gold2)}
.support{margin-top:20px;font-size:13px;color:var(--white3)}
.support a{color:var(--gold);text-decoration:none}
</style>
</head>
<body>
<div class="card">
  <div class="logo">Visual Pro <span>Media</span></div>
  <div class="check-circle">🎉</div>
  <h1>Bot is <em>Live!</em></h1>
  <p class="sub">Welcome <strong>${name}!</strong> Your AI Instagram automation bot for <strong>@${handle}</strong> is now active and ready.</p>
  
  <div class="steps-box">
    <div class="steps-header">Get Started in 5 Steps</div>
    <div class="sitem"><div class="sn">01</div><div class="st"><strong>Open Telegram</strong><span>Search for your bot using the username from BotFather</span></div></div>
    <div class="sitem"><div class="sn">02</div><div class="st"><strong>Send /start</strong><span>Type /start to activate and see the welcome message</span></div></div>
    <div class="sitem"><div class="sn">03</div><div class="st"><strong>Type Any Topic</strong><span>Try "AI tools 2026" or "travel tips India" or anything!</span></div></div>
    <div class="sitem"><div class="sn">04</div><div class="st"><strong>Review the Post</strong><span>Bot sends you a preview image + caption to approve</span></div></div>
    <div class="sitem"><div class="sn">05</div><div class="st"><strong>Reply "approve"</strong><span>Post goes live on @${handle} instantly! 🚀</span></div></div>
  </div>
  
  <a href="https://t.me" class="btn-tg">Open Telegram Now →</a>
  <div class="support">Need help? DM <a href="https://www.instagram.com/visualpromediaofficial" target="_blank">@visualpromediaofficial</a> or email <a href="mailto:zmedia.ai29@gmail.com">zmedia.ai29@gmail.com</a></div>
</div>
</body>
</html>`);
  } catch(e) {
    console.error('ig-save error:', e.message);
    res.send('<h2 style="font-family:sans-serif;padding:40px;color:red">Something went wrong: ' + e.message + '</h2>');
  }
});






// ── Premium Landing Page ─────────────────────────────────────
const LANDING_PAGE_HTML = "<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n<meta charset=\"UTF-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n<title>Visual Pro Media - AI Instagram Automation</title>\n<link href=\"https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,600;1,300&family=Instrument+Sans:wght@400;500;600&family=Bebas+Neue&display=swap\" rel=\"stylesheet\">\n<style>\n*{margin:0;padding:0;box-sizing:border-box}\n:root{--ink:#060810;--ink2:#0c1019;--gold:#c9a84c;--gold2:#e8c97a;--gdim:rgba(201,168,76,0.1);--gline:rgba(201,168,76,0.2);--w:#f0ece4;--w2:#a8a49c;--w3:#5c5852;--w4:#252320;--green:#2ecc8a;--red:#e05050}\nhtml{scroll-behavior:smooth}\nbody{font-family:'Instrument Sans',sans-serif;background:var(--ink);color:var(--w);overflow-x:hidden}\n\n/* NAV */\nnav{position:fixed;top:0;left:0;right:0;z-index:500;padding:22px 56px;display:flex;align-items:center;justify-content:space-between;transition:all 0.4s}\nnav.scrolled{padding:14px 56px;background:rgba(6,8,16,0.96);backdrop-filter:blur(20px);border-bottom:1px solid var(--w4)}\n.logo{font-family:'Cormorant Garamond',serif;font-weight:300;font-size:19px;letter-spacing:5px;text-transform:uppercase}\n.logo span{color:var(--gold)}\n.nav-links{display:flex;gap:36px}\n.nav-links a{font-size:11px;font-weight:500;letter-spacing:2px;text-transform:uppercase;color:var(--w3);text-decoration:none;transition:color 0.3s}\n.nav-links a:hover{color:var(--gold)}\n.nav-btn{font-size:11px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:var(--ink);background:var(--gold);border:none;padding:12px 28px;text-decoration:none;transition:all 0.3s;cursor:pointer}\n.nav-btn:hover{background:var(--gold2)}\n\n/* HERO */\n.hero{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:150px 24px 80px;position:relative;overflow:hidden}\n.hero-bg{position:absolute;inset:0;background-image:linear-gradient(rgba(201,168,76,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(201,168,76,0.03) 1px,transparent 1px);background-size:70px 70px;animation:bgMove 22s linear infinite}\n@keyframes bgMove{0%{transform:translateY(0)}100%{transform:translateY(70px)}}\n.hero-glow{position:absolute;top:40%;left:50%;transform:translate(-50%,-50%);width:900px;height:500px;background:radial-gradient(ellipse,rgba(201,168,76,0.07) 0%,transparent 65%);pointer-events:none}\n.tag{position:relative;z-index:1;display:inline-flex;align-items:center;gap:12px;font-size:11px;font-weight:500;letter-spacing:4px;text-transform:uppercase;color:var(--gold);margin-bottom:36px;animation:up 0.8s ease both}\n.tag::before,.tag::after{content:'';width:32px;height:1px;background:var(--gline)}\n.hero h1{position:relative;z-index:1;font-family:'Cormorant Garamond',serif;font-weight:300;font-style:italic;font-size:clamp(54px,9vw,108px);line-height:0.95;letter-spacing:-3px;margin-bottom:8px;animation:up 0.8s 0.1s ease both}\n.hero h1 strong{font-style:normal;font-weight:600;display:block}\n.hero h1 em{color:var(--gold)}\n.hero-sub{position:relative;z-index:1;font-size:17px;color:var(--w2);max-width:500px;line-height:1.85;margin:28px auto 52px;animation:up 0.8s 0.2s ease both}\n.hero-btns{position:relative;z-index:1;display:flex;gap:16px;justify-content:center;flex-wrap:wrap;animation:up 0.8s 0.3s ease both}\n.btn-g{background:var(--gold);color:var(--ink);border:none;padding:18px 44px;font-family:'Instrument Sans',sans-serif;font-size:11px;font-weight:600;letter-spacing:2px;text-transform:uppercase;text-decoration:none;cursor:pointer;transition:all 0.3s}\n.btn-g:hover{background:var(--gold2);transform:translateY(-2px)}\n.btn-o{background:transparent;color:var(--w2);border:1px solid var(--w4);padding:18px 44px;font-family:'Instrument Sans',sans-serif;font-size:11px;font-weight:500;letter-spacing:2px;text-transform:uppercase;text-decoration:none;transition:all 0.3s}\n.btn-o:hover{border-color:var(--gline);color:var(--gold)}\n.stats{position:relative;z-index:1;display:flex;margin-top:72px;border:1px solid var(--w4);overflow:hidden;animation:up 0.8s 0.4s ease both}\n.stat{padding:22px 48px;text-align:center;border-right:1px solid var(--w4)}\n.stat:last-child{border-right:none}\n.stat-v{font-family:'Bebas Neue',sans-serif;font-size:42px;letter-spacing:2px;color:var(--gold);line-height:1}\n.stat-l{font-size:10px;letter-spacing:2px;text-transform:uppercase;color:var(--w3);margin-top:6px}\n@keyframes up{from{opacity:0;transform:translateY(32px)}to{opacity:1;transform:translateY(0)}}\n\n/* MARQUEE */\n.marquee{border-top:1px solid var(--w4);border-bottom:1px solid var(--w4);padding:15px 0;overflow:hidden;background:var(--ink2)}\n.m-track{display:flex;white-space:nowrap;animation:marquee 26s linear infinite}\n.m-item{font-family:'Bebas Neue',sans-serif;font-size:13px;letter-spacing:4px;color:var(--w4);padding:0 32px;border-right:1px solid var(--w4)}\n.m-item.g{color:var(--gold)}\n@keyframes marquee{from{transform:translateX(0)}to{transform:translateX(-50%)}}\n\n/* SECTIONS */\n.sec{padding:120px 60px;max-width:1200px;margin:0 auto}\n.eyebrow{font-size:11px;font-weight:500;letter-spacing:4px;text-transform:uppercase;color:var(--gold);display:flex;align-items:center;gap:14px;margin-bottom:24px}\n.eyebrow::after{content:'';width:44px;height:1px;background:var(--gline)}\n.sec h2{font-family:'Cormorant Garamond',serif;font-weight:300;font-size:clamp(40px,5vw,68px);line-height:1.02;letter-spacing:-2px;margin-bottom:20px}\n.sec h2 em{color:var(--gold);font-style:italic}\n.sec-sub{font-size:16px;color:var(--w2);line-height:1.85;max-width:500px}\n\n/* HOW IT WORKS */\n.how-grid{display:grid;grid-template-columns:1fr 1fr;gap:80px;align-items:start;margin-top:64px}\n.steps{display:flex;flex-direction:column}\n.step{display:flex;gap:24px;padding:28px 0;border-bottom:1px solid var(--w4)}\n.step:first-child{padding-top:0}.step:last-child{border-bottom:none}\n.sn{font-family:'Bebas Neue',sans-serif;font-size:48px;color:var(--w4);line-height:1;min-width:44px;transition:color 0.3s}\n.step:hover .sn{color:var(--gold)}\n.st strong{display:block;font-size:16px;font-weight:600;margin-bottom:5px}\n.st span{font-size:14px;color:var(--w3);line-height:1.8}\n\n/* Phone mockup */\n.phone-box{position:sticky;top:120px}\n.phone{background:var(--ink3);border:1px solid rgba(255,255,255,0.07);border-radius:36px;padding:24px;max-width:300px;margin:0 auto;box-shadow:0 48px 96px rgba(0,0,0,0.5)}\n.p-notch{width:80px;height:22px;background:var(--ink2);border-radius:0 0 14px 14px;margin:0 auto 20px}\n.p-head{display:flex;align-items:center;gap:10px;padding-bottom:14px;border-bottom:1px solid rgba(255,255,255,0.06);margin-bottom:14px}\n.p-av{width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,var(--gold),#8b6914);display:flex;align-items:center;justify-content:center;font-family:'Cormorant Garamond',serif;font-size:17px;font-weight:600;color:var(--ink)}\n.p-nm{font-size:12px;font-weight:600}\n.p-st{font-size:10px;color:var(--green);margin-top:1px}\n.msgs{display:flex;flex-direction:column;gap:8px}\n.msg{padding:9px 13px;border-radius:14px;font-size:11px;line-height:1.5;max-width:88%}\n.msg-in{background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.07);border-bottom-left-radius:4px}\n.msg-out{background:var(--gold);color:var(--ink);font-weight:600;border-bottom-right-radius:4px;align-self:flex-end}\n.msg-img{width:100%;height:100px;background:linear-gradient(135deg,#1a1f2e,#0f1420);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:24px;margin-bottom:6px}\n.tdots{display:flex;gap:3px;padding:2px 0}\n.td{width:5px;height:5px;border-radius:50%;background:var(--w3);animation:td 1.2s infinite}\n.td:nth-child(2){animation-delay:0.2s}.td:nth-child(3){animation-delay:0.4s}\n@keyframes td{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-4px)}}\n.app-bar{background:rgba(46,204,138,0.07);border:1px solid rgba(46,204,138,0.18);border-radius:8px;padding:8px 10px;font-size:10px;color:var(--green);margin-top:3px}\n\n/* FEATURES */\n.feat-sec{background:var(--ink2);border-top:1px solid var(--w4);border-bottom:1px solid var(--w4)}\n.feat-grid{display:grid;grid-template-columns:repeat(3,1fr);border:1px solid var(--w4);margin-top:64px}\n.fc{padding:40px 36px;border-right:1px solid var(--w4);border-bottom:1px solid var(--w4);transition:background 0.3s;cursor:default}\n.fc:hover{background:rgba(201,168,76,0.02)}\n.fc:nth-child(3n){border-right:none}\n.fc:nth-child(n+4){border-bottom:none}\n.fc-n{font-family:'Bebas Neue',sans-serif;font-size:56px;color:var(--w4);line-height:1;margin-bottom:18px;transition:color 0.3s}\n.fc:hover .fc-n{color:var(--gold)}\n.fc-t{font-family:'Cormorant Garamond',serif;font-size:22px;font-weight:600;margin-bottom:10px}\n.fc-d{font-size:14px;color:var(--w3);line-height:1.8}\n\n/* RESULTS / CASE STUDY */\n.results-sec{padding:120px 60px;max-width:1200px;margin:0 auto}\n.results-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:2px;background:var(--w4);margin-top:64px;border:1px solid var(--w4)}\n.result-card{background:var(--ink2);padding:40px 36px}\n.result-num{font-family:'Bebas Neue',sans-serif;font-size:72px;letter-spacing:-2px;color:var(--gold);line-height:1;margin-bottom:8px}\n.result-label{font-size:14px;font-weight:600;margin-bottom:8px}\n.result-desc{font-size:13px;color:var(--w3);line-height:1.7}\n.result-handle{font-size:12px;color:var(--gold);margin-top:16px;letter-spacing:1px}\n\n/* TESTIMONIALS */\n.testi-sec{background:var(--ink2);border-top:1px solid var(--w4);border-bottom:1px solid var(--w4);padding:120px 60px}\n.testi-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:2px;background:var(--w4);margin-top:64px}\n.tc{background:var(--ink2);padding:44px 36px}\n.tc-stars{color:var(--gold);font-size:13px;letter-spacing:3px;margin-bottom:20px}\n.tc-q{font-family:'Cormorant Garamond',serif;font-size:20px;font-weight:300;font-style:italic;line-height:1.75;color:var(--w2);margin-bottom:32px}\n.tc-auth{display:flex;align-items:center;gap:12px}\n.tc-av{width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,var(--gold),#7a5c10);display:flex;align-items:center;justify-content:center;font-family:'Cormorant Garamond',serif;font-size:18px;font-weight:600;color:var(--ink)}\n.tc-name{font-size:14px;font-weight:600}\n.tc-handle{font-size:12px;color:var(--w3);margin-top:2px}\n\n/* PRICING */\n.price-sec{padding:120px 60px;max-width:1200px;margin:0 auto}\n\n/* TIMER */\n.timer-wrap{background:rgba(224,80,80,0.05);border:1px solid rgba(224,80,80,0.2);padding:22px 36px;display:flex;align-items:center;justify-content:center;gap:24px;flex-wrap:wrap;margin-bottom:56px}\n.t-label{font-size:11px;letter-spacing:3px;text-transform:uppercase;color:var(--red);font-weight:600;display:flex;align-items:center;gap:8px}\n.t-digits{display:flex;align-items:center;gap:8px}\n.t-dig{font-family:'Bebas Neue',sans-serif;font-size:44px;letter-spacing:2px;color:var(--red);background:rgba(224,80,80,0.08);border:1px solid rgba(224,80,80,0.15);padding:8px 18px;min-width:68px;text-align:center;line-height:1}\n.t-sep{font-family:'Bebas Neue',sans-serif;font-size:36px;color:var(--red);opacity:0.5}\n.t-note{font-size:12px;color:var(--w3);letter-spacing:1px}\n\n/* PLANS */\n.plans{display:grid;grid-template-columns:1fr 1fr;gap:2px;background:var(--w4);border:1px solid var(--w4)}\n.plan{background:var(--ink);padding:52px 48px;position:relative}\n.plan.feat{background:var(--ink2)}\n.best-tag{position:absolute;top:0;right:0;background:var(--gold);color:var(--ink);font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;padding:8px 20px}\n.plan-tag{font-size:10px;letter-spacing:3px;text-transform:uppercase;color:var(--w3);display:block;margin-bottom:24px}\n.plan.feat .plan-tag{color:var(--gold)}\n.plan-orig{font-family:'Cormorant Garamond',serif;font-size:26px;font-weight:300;color:var(--w4);text-decoration:line-through;text-decoration-color:var(--red);margin-bottom:4px}\n.plan-price{font-family:'Bebas Neue',sans-serif;font-size:84px;letter-spacing:-2px;line-height:1;margin-bottom:4px}\n.plan-price sup{font-size:38px;letter-spacing:0;vertical-align:super}\n.plan.feat .plan-price{color:var(--gold)}\n.plan-period{font-size:13px;color:var(--w3);letter-spacing:1px;margin-bottom:10px}\n.plan-save{display:inline-flex;align-items:center;gap:6px;background:rgba(46,204,138,0.07);border:1px solid rgba(46,204,138,0.2);color:var(--green);padding:4px 14px;font-size:11px;font-weight:600;letter-spacing:1px;text-transform:uppercase;margin-bottom:36px}\n.plan-div{height:1px;background:var(--w4);margin-bottom:32px}\n.plan-feats{list-style:none;display:flex;flex-direction:column;gap:14px;margin-bottom:40px}\n.pf{display:flex;align-items:flex-start;gap:12px;font-size:14px;color:var(--w2);line-height:1.5}\n.pfc{width:18px;height:18px;flex-shrink:0;border:1px solid var(--gline);display:flex;align-items:center;justify-content:center;font-size:10px;color:var(--gold);margin-top:2px}\n.plan.feat .pfc{background:var(--gdim)}\n.btn-plan{display:block;text-align:center;text-decoration:none;font-size:11px;font-weight:600;letter-spacing:2px;text-transform:uppercase;padding:18px;cursor:pointer;transition:all 0.3s}\n.btn-ol{border:1px solid var(--w4);color:var(--w3);background:transparent}\n.btn-ol:hover{border-color:var(--gline);color:var(--gold)}\n.btn-gl{background:var(--gold);color:var(--ink);border:none}\n.btn-gl:hover{background:var(--gold2);box-shadow:0 12px 40px rgba(201,168,76,0.25)}\n.plan-note{font-size:11px;color:var(--w3);text-align:center;margin-top:12px;letter-spacing:0.5px}\n.expired-box{display:none;background:rgba(224,80,80,0.07);border:1px solid rgba(224,80,80,0.2);padding:16px;margin-top:16px;text-align:center;color:var(--red);font-size:13px;letter-spacing:1px}\n\n/* FAQ */\n.faq-sec{padding:120px 60px;max-width:760px;margin:0 auto}\n.faq-item{border-bottom:1px solid var(--w4)}\n.faq-q{display:flex;justify-content:space-between;align-items:center;padding:26px 0;cursor:pointer;font-size:16px;font-weight:500;transition:color 0.3s}\n.faq-q:hover{color:var(--gold)}\n.faq-icon{width:26px;height:26px;border:1px solid var(--w4);display:flex;align-items:center;justify-content:center;font-size:17px;color:var(--w3);flex-shrink:0;transition:all 0.3s}\n.faq-item.open .faq-icon{background:var(--gdim);border-color:var(--gline);color:var(--gold);transform:rotate(45deg)}\n.faq-a{max-height:0;overflow:hidden;font-size:15px;color:var(--w3);line-height:1.9;transition:max-height 0.4s ease,padding 0.4s}\n.faq-item.open .faq-a{max-height:200px;padding-bottom:26px}\n\n/* CONTACT */\n.contact-sec{padding:60px;border-top:1px solid var(--w4);display:flex;align-items:center;justify-content:center}\n.contact-box{display:flex;align-items:center;border:1px solid var(--w4);overflow:hidden}\n.c-label{padding:22px 28px;font-size:10px;letter-spacing:3px;text-transform:uppercase;color:var(--w3);background:var(--ink2);border-right:1px solid var(--w4)}\n.c-link{display:flex;align-items:center;gap:12px;padding:22px 32px;font-size:14px;color:var(--w2);text-decoration:none;border-right:1px solid var(--w4);transition:all 0.3s}\n.c-link:last-child{border-right:none}\n.c-link:hover{background:var(--gdim);color:var(--gold)}\n\n/* CTA */\n.cta-sec{padding:160px 60px;text-align:center;position:relative;overflow:hidden;border-top:1px solid var(--w4)}\n.cta-grid{position:absolute;inset:0;background-image:linear-gradient(rgba(201,168,76,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(201,168,76,0.025) 1px,transparent 1px);background-size:60px 60px}\n.cta-glow{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:700px;height:400px;background:radial-gradient(ellipse,rgba(201,168,76,0.07),transparent 60%)}\n.cta-sec h2{position:relative;z-index:1;font-family:'Cormorant Garamond',serif;font-weight:300;font-style:italic;font-size:clamp(44px,7vw,88px);line-height:0.98;letter-spacing:-3px;margin-bottom:24px}\n.cta-sec h2 strong{font-style:normal;font-weight:600;color:var(--gold);display:block}\n.cta-sec p{position:relative;z-index:1;font-size:17px;color:var(--w2);margin-bottom:48px}\n.cta-btns{position:relative;z-index:1;display:flex;gap:16px;justify-content:center;flex-wrap:wrap}\n\n/* FOOTER */\nfooter{padding:36px 60px;border-top:1px solid var(--w4);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:16px}\n.f-logo{font-family:'Cormorant Garamond',serif;font-weight:300;font-size:17px;letter-spacing:4px;text-transform:uppercase}\n.f-logo span{color:var(--gold)}\n.f-links{display:flex;gap:24px;flex-wrap:wrap}\n.f-links a{font-size:11px;color:var(--w3);text-decoration:none;letter-spacing:1px;text-transform:uppercase;transition:color 0.3s}\n.f-links a:hover{color:var(--gold)}\n.f-copy{font-size:11px;color:var(--w4);letter-spacing:1px}\n\n/* REVEAL */\n.reveal{opacity:0;transform:translateY(40px);transition:opacity 0.85s ease,transform 0.85s ease}\n.reveal.visible{opacity:1;transform:translateY(0)}\n\n/* RESPONSIVE */\n@media(max-width:900px){\nnav{padding:16px 20px}nav.scrolled{padding:12px 20px}.nav-links{display:none}\n.hero{padding:120px 20px 60px}.stats{flex-direction:column;gap:1px;background:var(--w4)}\n.stat{border-right:none;border-bottom:1px solid var(--w4);background:var(--ink2)}.stat:last-child{border-bottom:none}\n.sec{padding:80px 20px}.how-grid{grid-template-columns:1fr;gap:40px}.phone-box{position:static}\n.feat-grid{grid-template-columns:1fr}.fc{border-right:none;border-bottom:1px solid var(--w4)}.fc:last-child{border-bottom:none}\n.fc:nth-child(n+4){border-bottom:1px solid var(--w4)}.results-grid{grid-template-columns:1fr}.testi-sec{padding:80px 20px}.testi-grid{grid-template-columns:1fr}\n.price-sec{padding:80px 20px}.plans{grid-template-columns:1fr}.plan{padding:40px 24px}.faq-sec{padding:80px 20px}\n.contact-sec{padding:40px 20px}.contact-box{flex-direction:column;width:100%}.c-link{border-right:none;border-bottom:1px solid var(--w4)}.c-link:last-child{border-bottom:none}\n.cta-sec{padding:100px 20px}footer{padding:28px 20px;flex-direction:column;text-align:center}.f-links{justify-content:center}\n.timer-wrap{gap:12px;padding:16px 20px}.t-dig{font-size:36px;padding:6px 14px;min-width:56px}\n.results-sec{padding:80px 20px}\n}\n</style>\n</head>\n<body>\n\n<nav id=\"nav\">\n  <div class=\"logo\">Visual Pro <span>Media</span></div>\n  <div class=\"nav-links\">\n    <a href=\"#how\">How It Works</a>\n    <a href=\"#features\">Features</a>\n    <a href=\"#results\">Results</a>\n    <a href=\"#pricing\">Pricing</a>\n    <a href=\"#faq\">FAQ</a>\n  </div>\n  <a href=\"#pricing\" class=\"nav-btn\">Get Started</a>\n</nav>\n\n<!-- HERO -->\n<section class=\"hero\">\n  <div class=\"hero-bg\"></div>\n  <div class=\"hero-glow\"></div>\n  <div class=\"tag\">AI-Powered Instagram Automation</div>\n  <h1><em>Grow Your</em><br><strong>Instagram on <em>Autopilot</em></strong></h1>\n  <p class=\"hero-sub\">Type any topic in Telegram. Our AI writes the caption, creates a stunning image, and posts to Instagram automatically \u2014 in under 30 seconds.</p>\n  <div class=\"hero-btns\">\n    <a href=\"#pricing\" class=\"btn-g\">Start for Rs.2,000/month</a>\n    <a href=\"#how\" class=\"btn-o\">See How It Works</a>\n  </div>\n  <div class=\"stats\">\n    <div class=\"stat\"><div class=\"stat-v\">30s</div><div class=\"stat-l\">Post Created In</div></div>\n    <div class=\"stat\"><div class=\"stat-v\">100%</div><div class=\"stat-l\">Automated</div></div>\n    <div class=\"stat\"><div class=\"stat-v\">GPT-4o</div><div class=\"stat-l\">AI Engine</div></div>\n    <div class=\"stat\"><div class=\"stat-v\">24/7</div><div class=\"stat-l\">Always Running</div></div>\n  </div>\n</section>\n\n<!-- MARQUEE -->\n<div class=\"marquee\">\n  <div class=\"m-track\">\n    <span class=\"m-item\">AI Content Creation</span><span class=\"m-item g\">Visual Pro Media</span><span class=\"m-item\">Instagram Automation</span><span class=\"m-item g\">Telegram Control</span><span class=\"m-item\">GPT-4o Powered</span><span class=\"m-item g\">30 Second Posts</span><span class=\"m-item\">Auto Publishing</span><span class=\"m-item g\">Unlimited Posts</span><span class=\"m-item\">Real-time News</span><span class=\"m-item g\">Branded Images</span>\n    <span class=\"m-item\">AI Content Creation</span><span class=\"m-item g\">Visual Pro Media</span><span class=\"m-item\">Instagram Automation</span><span class=\"m-item g\">Telegram Control</span><span class=\"m-item\">GPT-4o Powered</span><span class=\"m-item g\">30 Second Posts</span><span class=\"m-item\">Auto Publishing</span><span class=\"m-item g\">Unlimited Posts</span><span class=\"m-item\">Real-time News</span><span class=\"m-item g\">Branded Images</span>\n  </div>\n</div>\n\n<!-- HOW IT WORKS -->\n<section id=\"how\">\n  <div class=\"sec\">\n    <div class=\"eyebrow\">How It Works</div>\n    <h2>From idea to <em>Instagram</em><br>in four simple steps</h2>\n    <p class=\"sec-sub\">No design tools. No copywriting skills. No scheduling apps. Just Telegram and our AI doing everything for you.</p>\n    <div class=\"how-grid reveal\">\n      <div class=\"steps\">\n        <div class=\"step\"><div class=\"sn\">01</div><div class=\"st\"><strong>Subscribe and Connect</strong><span>Pay once and fill a simple form with your Instagram details. Your AI bot activates automatically in seconds \u2014 no technical knowledge needed.</span></div></div>\n        <div class=\"step\"><div class=\"sn\">02</div><div class=\"st\"><strong>Type Any Topic in Telegram</strong><span>Open Telegram and type anything \u2014 \"AI tools 2026\", \"travel tips India\", \"Monday motivation\". That is literally all you do.</span></div></div>\n        <div class=\"step\"><div class=\"sn\">03</div><div class=\"st\"><strong>AI Creates Everything</strong><span>GPT-4o writes a stunning caption with the perfect hashtags. AI generates a branded image. All ready in about 25 seconds automatically.</span></div></div>\n        <div class=\"step\"><div class=\"sn\">04</div><div class=\"st\"><strong>Approve and Go Live</strong><span>Preview the post right inside Telegram. Just reply \"approve\" and your post is instantly live on Instagram for your audience to see.</span></div></div>\n      </div>\n      <div class=\"phone-box\">\n        <div class=\"phone\">\n          <div class=\"p-notch\"></div>\n          <div class=\"p-head\">\n            <div class=\"p-av\">V</div>\n            <div><div class=\"p-nm\">Your Instagram Bot</div><div class=\"p-st\">Online</div></div>\n          </div>\n          <div class=\"msgs\">\n            <div class=\"msg msg-out\">AI tools 2026</div>\n            <div class=\"msg msg-in\"><div class=\"tdots\"><div class=\"td\"></div><div class=\"td\"></div><div class=\"td\"></div></div></div>\n            <div class=\"msg msg-in\" style=\"max-width:100%\">\n              <div class=\"msg-img\">\ud83c\udfa8</div>\n              <strong style=\"font-size:11px;display:block;margin-bottom:3px\">Post created!</strong>\n              <span style=\"font-size:10px;color:#5c5852\">Top 5 AI tools changing content creation forever...</span>\n            </div>\n            <div class=\"msg msg-in\" style=\"max-width:100%\"><div class=\"app-bar\">Reply <strong>approve</strong> to post or <strong>redo</strong> to regenerate</div></div>\n            <div class=\"msg msg-out\">approve</div>\n            <div class=\"msg msg-in\">Posted to @yourbrand! \ud83d\ude80</div>\n          </div>\n        </div>\n      </div>\n    </div>\n  </div>\n</section>\n\n<!-- FEATURES -->\n<section class=\"feat-sec\" id=\"features\">\n  <div class=\"sec\" style=\"padding-bottom:0\">\n    <div class=\"eyebrow\">Features</div>\n    <h2>Everything to grow your<br><em>Instagram effortlessly</em></h2>\n  </div>\n  <div style=\"padding:0 60px 120px;max-width:1200px;margin:0 auto\">\n    <div class=\"feat-grid reveal\">\n      <div class=\"fc\"><div class=\"fc-n\">01</div><div class=\"fc-t\">GPT-4o Content Engine</div><div class=\"fc-d\">ChatGPT writes captions, hooks, and hashtags perfectly optimized for Instagram reach and engagement every single time without fail.</div></div>\n      <div class=\"fc\"><div class=\"fc-n\">02</div><div class=\"fc-t\">Auto Image Generation</div><div class=\"fc-d\">Stunning branded visuals created automatically for every post. Professional quality without needing Canva, Photoshop, or any design skill.</div></div>\n      <div class=\"fc\"><div class=\"fc-n\">03</div><div class=\"fc-t\">Telegram Control Panel</div><div class=\"fc-d\">Manage everything from Telegram on your phone. Preview, approve, or regenerate posts anytime \u2014 it takes just a few seconds.</div></div>\n      <div class=\"fc\"><div class=\"fc-n\">04</div><div class=\"fc-t\">Real-time Web Search</div><div class=\"fc-d\">Bot searches the web for latest news and trending topics to create posts about current events and viral content automatically.</div></div>\n      <div class=\"fc\"><div class=\"fc-n\">05</div><div class=\"fc-t\">30-Second Publishing</div><div class=\"fc-d\">From idea to live on Instagram in under 30 seconds. Post every day without spending time or energy on content creation.</div></div>\n      <div class=\"fc\"><div class=\"fc-n\">06</div><div class=\"fc-t\">Safe and Reliable</div><div class=\"fc-d\">Uses official Instagram API \u2014 same as Buffer and Later. You review every post before it publishes. Your account stays completely safe.</div></div>\n    </div>\n  </div>\n</section>\n\n<!-- RESULTS -->\n<section id=\"results\">\n  <div class=\"results-sec\">\n    <div class=\"eyebrow\">Real Results</div>\n    <h2>Numbers that speak<br><em>for themselves</em></h2>\n    <p class=\"sec-sub\">These are real results from clients using Visual Pro Media's AI automation system every day.</p>\n    <div class=\"results-grid reveal\">\n      <div class=\"result-card\">\n        <div class=\"result-num\">400%</div>\n        <div class=\"result-label\">Follower Growth</div>\n        <div class=\"result-desc\">From 1,200 to 6,000 followers in 2 months by posting daily AI-generated content consistently without any manual effort.</div>\n        <div class=\"result-handle\">@rahul.digital \u2014 Digital Marketing</div>\n      </div>\n      <div class=\"result-card\">\n        <div class=\"result-num\">3hrs</div>\n        <div class=\"result-label\">Saved Every Day</div>\n        <div class=\"result-desc\">Previously spending 3 hours per post on writing, designing, and scheduling. Now the entire process takes 30 seconds flat.</div>\n        <div class=\"result-handle\">@priya.travels \u2014 Travel Creator</div>\n      </div>\n      <div class=\"result-card\">\n        <div class=\"result-num\">5x</div>\n        <div class=\"result-label\">Engagement Increase</div>\n        <div class=\"result-desc\">Engagement rate jumped from 1.2% to 6.8% after switching to consistent daily AI-powered posts with optimized captions and hashtags.</div>\n        <div class=\"result-handle\">@arjun.agency \u2014 Marketing Agency</div>\n      </div>\n    </div>\n  </div>\n</section>\n\n<!-- TESTIMONIALS -->\n<section class=\"testi-sec\">\n  <div style=\"max-width:1200px;margin:0 auto\">\n    <div class=\"eyebrow\">Testimonials</div>\n    <h2>Loved by creators<br><em>across India</em></h2>\n    <div class=\"testi-grid reveal\">\n      <div class=\"tc\">\n        <div class=\"tc-stars\">\u2605\u2605\u2605\u2605\u2605</div>\n        <div class=\"tc-q\">\"I used to spend 3 hours making one post. Now my bot posts twice a day while I sleep. My followers grew 400% in just 2 months. This is the best investment I made for my brand.\"</div>\n        <div class=\"tc-auth\"><div class=\"tc-av\">R</div><div><div class=\"tc-name\">Rahul Sharma</div><div class=\"tc-handle\">@rahul.digital \u00b7 Mumbai</div></div></div>\n      </div>\n      <div class=\"tc\">\n        <div class=\"tc-stars\">\u2605\u2605\u2605\u2605\u2605</div>\n        <div class=\"tc-q\">\"Best investment for my travel page. I just type the destination and the bot creates a beautiful post with perfect hashtags. My audience loves the content and engagement is through the roof.\"</div>\n        <div class=\"tc-auth\"><div class=\"tc-av\">P</div><div><div class=\"tc-name\">Priya Mehta</div><div class=\"tc-handle\">@priya.travels \u00b7 Delhi</div></div></div>\n      </div>\n      <div class=\"tc\">\n        <div class=\"tc-stars\">\u2605\u2605\u2605\u2605\u2605</div>\n        <div class=\"tc-q\">\"Managing 3 client Instagram accounts was exhausting me. This bot changed everything completely. My clients are thrilled, the results are incredible, and I finally have my weekends back.\"</div>\n        <div class=\"tc-auth\"><div class=\"tc-av\">A</div><div><div class=\"tc-name\">Arjun Patel</div><div class=\"tc-handle\">@arjun.agency \u00b7 Bangalore</div></div></div>\n      </div>\n    </div>\n  </div>\n</section>\n\n<!-- PRICING -->\n<section id=\"pricing\">\n  <div class=\"price-sec\">\n    <div class=\"eyebrow\">Pricing</div>\n    <h2>Simple pricing,<br><em>incredible value</em></h2>\n    <p class=\"sec-sub\" style=\"margin-bottom:56px\">Limited time offer \u2014 discount disappears when the timer hits zero. Lock in your price now!</p>\n\n    <!-- TIMER -->\n    <div class=\"timer-wrap reveal\">\n      <div class=\"t-label\">\ud83d\udd25 Limited Offer Ends In</div>\n      <div class=\"t-digits\">\n        <div class=\"t-dig\" id=\"th\">02</div>\n        <div class=\"t-sep\">:</div>\n        <div class=\"t-dig\" id=\"tm\">00</div>\n        <div class=\"t-sep\">:</div>\n        <div class=\"t-dig\" id=\"ts\">00</div>\n      </div>\n      <div class=\"t-note\">After timer expires \u00b7 original prices restore</div>\n    </div>\n\n    <!-- PLANS -->\n    <div class=\"plans reveal\">\n\n      <!-- MONTHLY -->\n      <div class=\"plan\">\n        <span class=\"plan-tag\">Monthly Plan</span>\n        <div class=\"plan-orig\" id=\"m-orig\">Rs.3,000 / month</div>\n        <div class=\"plan-price\" id=\"m-price\"><sup>Rs.</sup>2000</div>\n        <div class=\"plan-period\">per month \u00b7 cancel anytime</div>\n        <div class=\"plan-save\" id=\"m-save\">33% OFF \u00b7 Save Rs.1,000</div>\n        <div class=\"plan-div\"></div>\n        <ul class=\"plan-feats\">\n          <li class=\"pf\"><div class=\"pfc\">\u2713</div>Unlimited Instagram posts</li>\n          <li class=\"pf\"><div class=\"pfc\">\u2713</div>GPT-4o AI content creation</li>\n          <li class=\"pf\"><div class=\"pfc\">\u2713</div>Auto image generation</li>\n          <li class=\"pf\"><div class=\"pfc\">\u2713</div>Telegram bot control</li>\n          <li class=\"pf\"><div class=\"pfc\">\u2713</div>Real-time web search</li>\n          <li class=\"pf\"><div class=\"pfc\">\u2713</div>Priority support</li>\n        </ul>\n        <a href=\"/pay?plan=monthly\" class=\"btn-plan btn-ol\" id=\"m-btn\">Get Monthly Access</a>\n        <div class=\"plan-note\">\ud83d\udd12 Secured by Razorpay</div>\n      </div>\n\n      <!-- 3 MONTH -->\n      <div class=\"plan feat\">\n        <div class=\"best-tag\">Best Value</div>\n        <span class=\"plan-tag\">3 Month Bundle</span>\n        <div class=\"plan-orig\" id=\"q-orig\">Rs.5,000 for 3 months</div>\n        <div class=\"plan-price\" id=\"q-price\"><sup>Rs.</sup>4500</div>\n        <div class=\"plan-period\">for 3 months \u00b7 save Rs.500 vs monthly</div>\n        <div class=\"plan-save\" id=\"q-save\">10% OFF \u00b7 Save Rs.500</div>\n        <div class=\"plan-div\"></div>\n        <ul class=\"plan-feats\">\n          <li class=\"pf\"><div class=\"pfc\">\u2713</div>Unlimited Instagram posts</li>\n          <li class=\"pf\"><div class=\"pfc\">\u2713</div>GPT-4o AI content creation</li>\n          <li class=\"pf\"><div class=\"pfc\">\u2713</div>Auto image generation</li>\n          <li class=\"pf\"><div class=\"pfc\">\u2713</div>Telegram bot control</li>\n          <li class=\"pf\"><div class=\"pfc\">\u2713</div>Real-time web search</li>\n          <li class=\"pf\"><div class=\"pfc\">\u2713</div><strong>3 months guaranteed access</strong></li>\n        </ul>\n        <a href=\"/pay?plan=quarterly\" class=\"btn-plan btn-gl\" id=\"q-btn\">Get 3 Month Bundle</a>\n        <div class=\"plan-note\">\ud83d\udd12 Secured by Razorpay \u00b7 Best deal</div>\n      </div>\n    </div>\n    <div class=\"expired-box\" id=\"expired-box\">Offer expired \u2014 prices have returned to original rates.</div>\n  </div>\n</section>\n\n<!-- FAQ -->\n<section id=\"faq\">\n  <div class=\"faq-sec\">\n    <div class=\"eyebrow\">FAQ</div>\n    <h2>Questions <em>answered</em></h2>\n    <div style=\"margin-top:56px\">\n      <div class=\"faq-item\"><div class=\"faq-q\" onclick=\"toggleFaq(this.parentElement)\">Do I need any technical knowledge? <div class=\"faq-icon\">+</div></div><div class=\"faq-a\">Zero technical knowledge needed. After payment you fill a simple form with your Instagram details. We set everything up. You just open Telegram and start typing topics to post.</div></div>\n      <div class=\"faq-item\"><div class=\"faq-q\" onclick=\"toggleFaq(this.parentElement)\">Is my Instagram account safe? <div class=\"faq-icon\">+</div></div><div class=\"faq-a\">100% safe. We use the official Instagram API \u2014 the same method used by Buffer, Later, and Hootsuite. You review every single post before it publishes. Nothing goes live without your approval.</div></div>\n      <div class=\"faq-item\"><div class=\"faq-q\" onclick=\"toggleFaq(this.parentElement)\">How many posts can I create per month? <div class=\"faq-icon\">+</div></div><div class=\"faq-a\">Unlimited posts! There is absolutely no cap. Post once a day or ten times a day \u2014 your bot is always ready whenever you need it, 24 hours a day, 7 days a week.</div></div>\n      <div class=\"faq-item\"><div class=\"faq-q\" onclick=\"toggleFaq(this.parentElement)\">Can I cancel anytime? <div class=\"faq-icon\">+</div></div><div class=\"faq-a\">Yes, cancel anytime with no questions asked and no cancellation fees. Just message us on Instagram or email and we cancel your subscription the same day.</div></div>\n      <div class=\"faq-item\"><div class=\"faq-q\" onclick=\"toggleFaq(this.parentElement)\">What if I need help setting up? <div class=\"faq-icon\">+</div></div><div class=\"faq-a\">We provide personal hands-on support via Instagram DM and email. Message us and we will personally walk you through the entire setup within 24 hours. We make sure you are fully live before we leave.</div></div>\n    </div>\n  </div>\n</section>\n\n<!-- CONTACT -->\n<div class=\"contact-sec\">\n  <div class=\"contact-box\">\n    <div class=\"c-label\">Contact and Support</div>\n    <a href=\"https://www.instagram.com/visualpromediaofficial\" target=\"_blank\" class=\"c-link\">\ud83d\udcf8 &nbsp;@visualpromediaofficial</a>\n    <a href=\"/cdn-cgi/l/email-protection#3e44535b5a575f105f570c077e59535f5752105d5153\" class=\"c-link\">\u2709 &nbsp;<span class=\"__cf_email__\" data-cfemail=\"403a2d252429216e2129727900272d21292c6e232f2d\">[email&#160;protected]</span></a>\n  </div>\n</div>\n\n<!-- CTA -->\n<div class=\"cta-sec\">\n  <div class=\"cta-grid\"></div>\n  <div class=\"cta-glow\"></div>\n  <h2>Ready to grow<br><strong>on autopilot?</strong></h2>\n  <p>Join creators and brands posting daily without effort. Setup in 5 minutes.</p>\n  <div class=\"cta-btns\">\n    <a href=\"/pay?plan=quarterly\" class=\"btn-g\">Get 3 Months \u2014 Rs.4,500</a>\n    <a href=\"/pay?plan=monthly\" class=\"btn-o\">Start Monthly \u2014 Rs.2,000</a>\n  </div>\n</div>\n\n<!-- FOOTER -->\n<footer>\n  <div class=\"f-logo\">Visual Pro <span>Media</span></div>\n  <div class=\"f-links\">\n    <a href=\"https://www.instagram.com/visualpromediaofficial\" target=\"_blank\">Instagram</a>\n    <a href=\"/cdn-cgi/l/email-protection#abd1c6cecfc2ca85cac29992ebccc6cac2c785c8c4c6\">Email</a>\n    <a href=\"/privacy\">Privacy</a>\n    <a href=\"/terms\">Terms</a>\n    <a href=\"/data-deletion\">Data Deletion</a>\n  </div>\n  <div class=\"f-copy\">2026 Visual Pro Media. All rights reserved.</div>\n</footer>\n\n<script data-cfasync=\"false\" src=\"/cdn-cgi/scripts/5c5dd728/cloudflare-static/email-decode.min.js\"></script><script>\n// Nav scroll\nwindow.addEventListener('scroll',function(){document.getElementById('nav').classList.toggle('scrolled',window.scrollY>50);});\n\n// FAQ\nfunction toggleFaq(el){var o=el.classList.contains('open');document.querySelectorAll('.faq-item').forEach(function(i){i.classList.remove('open');});if(!o)el.classList.add('open');}\n\n// Timer\n(function(){\n  var KEY='vpm_timer_v5';\n  var end=parseInt(localStorage.getItem(KEY)||'0');\n  if(!end||end<Date.now()){end=Date.now()+2*60*60*1000;localStorage.setItem(KEY,String(end));}\n  function pad(n){return String(n).padStart(2,'0');}\n  function tick(){\n    var diff=end-Date.now();\n    if(diff<=0){\n      document.getElementById('th').textContent='00';\n      document.getElementById('tm').textContent='00';\n      document.getElementById('ts').textContent='00';\n      document.getElementById('m-price').innerHTML='<sup>Rs.</sup>3000';\n      document.getElementById('q-price').innerHTML='<sup>Rs.</sup>5000';\n      document.getElementById('m-save').style.display='none';\n      document.getElementById('q-save').style.display='none';\n      document.getElementById('m-orig').style.display='none';\n      document.getElementById('q-orig').style.display='none';\n      document.getElementById('m-btn').textContent='Get Monthly Access';\n      document.getElementById('q-btn').textContent='Get 3 Month Bundle';\n      document.getElementById('expired-box').style.display='block';\n      return;\n    }\n    var h=Math.floor(diff/3600000);\n    var m=Math.floor((diff%3600000)/60000);\n    var s=Math.floor((diff%60000)/1000);\n    document.getElementById('th').textContent=pad(h);\n    document.getElementById('tm').textContent=pad(m);\n    document.getElementById('ts').textContent=pad(s);\n    setTimeout(tick,1000);\n  }\n  tick();\n})();\n\n// Scroll reveal\nvar obs=new IntersectionObserver(function(entries){entries.forEach(function(e){if(e.isIntersecting)e.target.classList.add('visible');});},{threshold:0.08});\ndocument.querySelectorAll('.reveal').forEach(function(el){obs.observe(el);});\n</script>\n</body>\n</html>\n";
app.get('/landing', (req, res) => {
  res.send(LANDING_PAGE_HTML);
});

// ── Landing Page ──────────────────────────────────────────────
app.get('/start', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Visual Pro Media — AI Instagram Automation</title>
<link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{
  --bg:#04060d;
  --card:#0b0f1a;
  --border:rgba(255,255,255,0.08);
  --blue:#4f8eff;
  --green:#00e5a0;
  --text:#e8edf8;
  --muted:#6b7592;
}
body{font-family:'DM Sans',sans-serif;background:var(--bg);color:var(--text);min-height:100vh;overflow-x:hidden}
/* Background */
.bg-glow{position:fixed;top:-200px;left:50%;transform:translateX(-50%);width:800px;height:800px;background:radial-gradient(ellipse,rgba(79,142,255,0.12) 0%,transparent 70%);pointer-events:none;z-index:0}
/* Nav */
nav{position:fixed;top:0;left:0;right:0;z-index:100;padding:20px 40px;display:flex;align-items:center;justify-content:space-between;backdrop-filter:blur(12px);border-bottom:1px solid var(--border)}
.nav-logo{font-family:'Syne',sans-serif;font-weight:800;font-size:20px;color:var(--text)}
.nav-logo span{color:var(--blue)}
.nav-btn{background:var(--blue);color:#000;border:none;border-radius:8px;padding:10px 24px;font-family:'DM Sans',sans-serif;font-weight:500;font-size:14px;cursor:pointer;text-decoration:none}
/* Hero */
.hero{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:120px 20px 80px;position:relative;z-index:1}
.hero-badge{display:inline-flex;align-items:center;gap:8px;background:rgba(79,142,255,0.1);border:1px solid rgba(79,142,255,0.2);border-radius:100px;padding:6px 16px;font-size:13px;color:var(--blue);margin-bottom:32px}
.hero-badge-dot{width:6px;height:6px;border-radius:50%;background:var(--green);animation:pulse 2s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}
.hero h1{font-family:'Syne',sans-serif;font-size:clamp(40px,7vw,80px);font-weight:800;line-height:1.05;letter-spacing:-2px;margin-bottom:24px}
.hero h1 span{color:var(--blue)}
.hero p{font-size:18px;color:var(--muted);max-width:560px;line-height:1.7;margin-bottom:48px}
.hero-cta{display:flex;gap:16px;flex-wrap:wrap;justify-content:center}
.btn-primary{background:var(--blue);color:#000;border:none;border-radius:12px;padding:16px 36px;font-family:'DM Sans',sans-serif;font-weight:700;font-size:16px;cursor:pointer;text-decoration:none;transition:transform 0.2s,box-shadow 0.2s}
.btn-primary:hover{transform:translateY(-2px);box-shadow:0 8px 32px rgba(79,142,255,0.4)}
.btn-secondary{background:transparent;color:var(--text);border:1px solid var(--border);border-radius:12px;padding:16px 36px;font-family:'DM Sans',sans-serif;font-weight:500;font-size:16px;cursor:pointer;text-decoration:none}
/* Stats */
.stats{display:flex;gap:48px;justify-content:center;flex-wrap:wrap;margin-top:64px;padding-top:64px;border-top:1px solid var(--border)}
.stat-num{font-family:'Syne',sans-serif;font-size:36px;font-weight:800;color:var(--text)}
.stat-label{font-size:14px;color:var(--muted);margin-top:4px}
/* Features */
.section{padding:100px 20px;max-width:1100px;margin:0 auto;position:relative;z-index:1}
.section-tag{font-size:12px;font-weight:600;letter-spacing:3px;text-transform:uppercase;color:var(--blue);margin-bottom:16px}
.section-title{font-family:'Syne',sans-serif;font-size:clamp(28px,4vw,48px);font-weight:800;margin-bottom:16px;letter-spacing:-1px}
.section-sub{font-size:16px;color:var(--muted);max-width:500px;line-height:1.7;margin-bottom:64px}
.features-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:24px}
.feature-card{background:var(--card);border:1px solid var(--border);border-radius:20px;padding:32px;transition:border-color 0.2s,transform 0.2s}
.feature-card:hover{border-color:rgba(79,142,255,0.3);transform:translateY(-4px)}
.feature-icon{width:48px;height:48px;border-radius:12px;background:rgba(79,142,255,0.1);display:flex;align-items:center;justify-content:center;font-size:24px;margin-bottom:20px}
.feature-title{font-family:'Syne',sans-serif;font-size:18px;font-weight:700;margin-bottom:10px}
.feature-desc{font-size:14px;color:var(--muted);line-height:1.7}
/* How it works */
.steps{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:24px;margin-top:48px}
.step{text-align:center;padding:32px 24px}
.step-num{width:48px;height:48px;border-radius:50%;background:var(--blue);color:#000;font-family:'Syne',sans-serif;font-weight:800;font-size:20px;display:flex;align-items:center;justify-content:center;margin:0 auto 20px}
.step-title{font-family:'Syne',sans-serif;font-size:16px;font-weight:700;margin-bottom:8px}
.step-desc{font-size:14px;color:var(--muted);line-height:1.6}
/* Pricing */
.pricing-card{background:var(--card);border:1px solid var(--blue);border-radius:24px;padding:48px;max-width:480px;margin:0 auto;text-align:center;position:relative;overflow:hidden}
.pricing-card::before{content:'';position:absolute;top:-100px;right:-100px;width:300px;height:300px;background:radial-gradient(ellipse,rgba(79,142,255,0.08),transparent 70%)}
.pricing-badge{display:inline-block;background:rgba(0,229,160,0.1);border:1px solid rgba(0,229,160,0.2);color:var(--green);border-radius:100px;padding:4px 16px;font-size:12px;font-weight:600;margin-bottom:24px}
.pricing-price{font-family:'Syne',sans-serif;font-size:72px;font-weight:800;line-height:1;margin-bottom:4px}
.pricing-price span{font-size:28px;vertical-align:super}
.pricing-period{font-size:14px;color:var(--muted);margin-bottom:32px}
.pricing-features{list-style:none;text-align:left;margin-bottom:40px}
.pricing-features li{display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--border);font-size:15px}
.pricing-features li:last-child{border-bottom:none}
.check{width:20px;height:20px;border-radius:50%;background:rgba(0,229,160,0.1);display:flex;align-items:center;justify-content:center;font-size:11px;flex-shrink:0}
.btn-buy{display:block;background:var(--blue);color:#000;border:none;border-radius:12px;padding:18px;font-family:'DM Sans',sans-serif;font-weight:700;font-size:17px;cursor:pointer;width:100%;text-decoration:none;transition:transform 0.2s,box-shadow 0.2s}
.btn-buy:hover{transform:translateY(-2px);box-shadow:0 8px 32px rgba(79,142,255,0.4)}
/* Footer */
footer{text-align:center;padding:40px 20px;border-top:1px solid var(--border);color:var(--muted);font-size:13px;position:relative;z-index:1}
footer a{color:var(--muted);text-decoration:none;margin:0 12px}
</style>
</head>
<body>
<div class="bg-glow"></div>

<nav>
  <div class="nav-logo">Visual Pro<span>.</span></div>
  <a href="#pricing" class="nav-btn">Get Started</a>
</nav>

<div class="hero">
  <div class="hero-badge"><span class="hero-badge-dot"></span> AI-Powered Instagram Automation</div>
  <h1>Post to Instagram<br>on <span>Autopilot</span></h1>
  <p>Just type a topic in Telegram. Our AI creates stunning posts and publishes them to Instagram automatically. No design skills needed.</p>
  <div class="hero-cta">
    <a href="#pricing" class="btn-primary">Start for ₹2000/month</a>
    <a href="#how" class="btn-secondary">See how it works</a>
  </div>
  <div class="stats">
    <div><div class="stat-num">30s</div><div class="stat-label">Post created in</div></div>
    <div><div class="stat-num">100%</div><div class="stat-label">Automated</div></div>
    <div><div class="stat-num">AI</div><div class="stat-label">Powered content</div></div>
  </div>
</div>

<div class="section">
  <div class="section-tag">Features</div>
  <div class="section-title">Everything you need to grow</div>
  <div class="section-sub">Our AI handles content creation, image generation, and Instagram publishing — all from Telegram.</div>
  <div class="features-grid">
    <div class="feature-card"><div class="feature-icon">🤖</div><div class="feature-title">AI Content Creation</div><div class="feature-desc">ChatGPT writes captions, hooks, and hashtags perfectly optimized for Instagram engagement.</div></div>
    <div class="feature-card"><div class="feature-icon">🎨</div><div class="feature-title">Auto Image Generation</div><div class="feature-desc">Stunning branded images created automatically for every post. No Canva, no Photoshop.</div></div>
    <div class="feature-card"><div class="feature-icon">📱</div><div class="feature-title">Telegram Control</div><div class="feature-desc">Just type your topic in Telegram. Preview the post, approve it, and it goes live on Instagram.</div></div>
    <div class="feature-card"><div class="feature-icon">📰</div><div class="feature-title">Real-time News</div><div class="feature-desc">Bot searches the web for latest news and creates posts about current trending topics.</div></div>
    <div class="feature-card"><div class="feature-icon">⚡</div><div class="feature-title">30 Second Posts</div><div class="feature-desc">From idea to Instagram in under 30 seconds. Post more, grow faster, save hours every day.</div></div>
    <div class="feature-card"><div class="feature-icon">🔒</div><div class="feature-title">Secure & Private</div><div class="feature-desc">Your Instagram account and data are fully secure. Only you control what gets posted.</div></div>
  </div>
</div>

<div class="section" id="how">
  <div class="section-tag">How It Works</div>
  <div class="section-title">Up and running in minutes</div>
  <div class="steps">
    <div class="step"><div class="step-num">1</div><div class="step-title">Pay & Sign Up</div><div class="step-desc">Choose your plan and complete payment via Razorpay securely.</div></div>
    <div class="step"><div class="step-num">2</div><div class="step-title">Connect Instagram</div><div class="step-desc">Fill in your Instagram details. We set everything up automatically.</div></div>
    <div class="step"><div class="step-num">3</div><div class="step-title">Start Posting</div><div class="step-desc">Open Telegram, type any topic, and your bot creates and posts instantly.</div></div>
    <div class="step"><div class="step-num">4</div><div class="step-title">Grow & Scale</div><div class="step-desc">Post daily without effort. Watch your Instagram grow on autopilot.</div></div>
  </div>
</div>

<div class="section" id="pricing">
  <div style="text-align:center;margin-bottom:48px">
    <div class="section-tag" style="display:inline-block">Pricing</div>
    <div class="section-title">Simple, transparent pricing</div>
    <p style="color:var(--muted);font-size:16px">One plan. Everything included. Cancel anytime.</p>
  </div>
  <div class="pricing-card">
    <div class="pricing-badge">✦ Most Popular</div>
    <div class="pricing-price"><span>₹</span>2000</div>
    <div class="pricing-period">per month · billed monthly</div>
    <ul class="pricing-features">
      <li><div class="check">✓</div> Unlimited Instagram posts</li>
      <li><div class="check">✓</div> AI-powered content creation</li>
      <li><div class="check">✓</div> Auto image generation</li>
      <li><div class="check">✓</div> Telegram bot control</div></li>
      <li><div class="check">✓</div> Real-time news integration</li>
      <li><div class="check">✓</div> 1 Instagram account</li>
      <li><div class="check">✓</div> Priority support</li>
    </ul>
    <a href="/pay" class="btn-buy">Get Started Now →</a>
    <p style="font-size:12px;color:var(--muted);margin-top:16px">Secure payment via Razorpay · Cancel anytime</p>
  </div>
</div>

<footer>
  <p style="margin-bottom:12px">© 2026 Visual Pro Media. All rights reserved.</p>
  <a href="/privacy">Privacy Policy</a>
  <a href="/terms">Terms of Service</a>
  <a href="/data-deletion">Data Deletion</a>
</footer>
</body>
</html>`);
});

// ── Payment Page ──────────────────────────────────────────────
app.get('/pay', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Checkout — Visual Pro Media</title>
<link href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet">
<script src="https://checkout.razorpay.com/v1/checkout.js"></script>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'DM Sans',sans-serif;background:#04060d;color:#e8edf8;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
.card{background:#0b0f1a;border:1px solid rgba(255,255,255,0.08);border-radius:24px;padding:48px;width:100%;max-width:480px}
.logo{font-family:'Syne',sans-serif;font-weight:800;font-size:22px;margin-bottom:32px;color:#e8edf8}
.logo span{color:#4f8eff}
h1{font-family:'Syne',sans-serif;font-size:28px;font-weight:800;margin-bottom:8px}
.subtitle{color:#6b7592;font-size:15px;margin-bottom:32px}
.order-box{background:#04060d;border:1px solid rgba(255,255,255,0.06);border-radius:16px;padding:24px;margin-bottom:32px}
.order-row{display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.06);font-size:15px}
.order-row:last-child{border-bottom:none;font-weight:700;font-size:17px;color:#4f8eff;margin-top:4px}
.order-label{color:#6b7592}
.btn{width:100%;background:#4f8eff;color:#000;border:none;border-radius:12px;padding:18px;font-family:'DM Sans',sans-serif;font-weight:700;font-size:17px;cursor:pointer;transition:transform 0.2s}
.btn:hover{transform:translateY(-2px)}
.secure{display:flex;align-items:center;justify-content:center;gap:8px;margin-top:16px;font-size:13px;color:#6b7592}
</style>
</head>
<body>
<div class="card">
  <div class="logo">Visual Pro<span>.</span></div>
  <h1>Complete Payment</h1>
  <p class="subtitle">You're one step away from automating your Instagram!</p>
  <div class="order-box">
    <div class="order-row"><span class="order-label">Plan</span><span>Monthly Subscription</span></div>
    <div class="order-row"><span class="order-label">Features</span><span>Unlimited posts + AI</span></div>
    <div class="order-row"><span class="order-label">Billing</span><span>Monthly</span></div>
    <div class="order-row"><span class="order-label">Total</span><span>₹2,000/month</span></div>
  </div>
  <button class="btn" onclick="startPayment()">Pay ₹2,000 Securely →</button>
  <div class="secure">🔒 Secured by Razorpay · 256-bit encryption</div>
</div>
<script>
async function startPayment() {
  try {
    const res = await fetch('/create-order', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
    const order = await res.json();
    if (!order.id) { alert('Payment setup failed. Please try again.'); return; }
    const options = {
      key: '\${RAZORPAY_KEY_ID}',
      amount: order.amount,
      currency: 'INR',
      name: 'Visual Pro Media',
      description: 'Monthly Instagram Automation',
      order_id: order.id,
      handler: function(response) {
        window.location.href = '/payment-success?payment_id=' + response.razorpay_payment_id + '&order_id=' + response.razorpay_order_id + '&signature=' + response.razorpay_signature;
      },
      prefill: { name: '', email: '', contact: '' },
      theme: { color: '#4f8eff' }
    };
    const rzp = new Razorpay(options);
    rzp.open();
  } catch(e) {
    alert('Something went wrong. Please try again.');
  }
}
</script>
</body>
</html>`);
});

// ── Create Razorpay Order ─────────────────────────────────────
app.post('/create-order', async (req, res) => {
  try {
    const auth = Buffer.from(RAZORPAY_KEY_ID + ':' + RAZORPAY_KEY_SECRET).toString('base64');
    const order = await axios.post('https://api.razorpay.com/v1/orders', {
      amount: 200000, // ₹2000 in paise
      currency: 'INR',
      receipt: 'vpm_' + Date.now()
    }, { headers: { 'Authorization': 'Basic ' + auth, 'Content-Type': 'application/json' } });
    res.json(order.data);
  } catch(e) {
    console.error('Razorpay order error:', e.message);
    res.status(500).json({ error: 'Order creation failed' });
  }
});

// ── Payment Success → Verify → Show Onboarding Form ──────────
app.get('/payment-success', async (req, res) => {
  const { payment_id, order_id, signature } = req.query;
  // Verify signature
  const body = order_id + '|' + payment_id;
  const expectedSignature = crypto.createHmac('sha256', RAZORPAY_KEY_SECRET).update(body).digest('hex');
  if (expectedSignature !== signature) {
    return res.send('<h2 style="color:red;font-family:sans-serif;padding:40px">Payment verification failed. Please contact support.</h2>');
  }
  // Show onboarding form
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Setup Your Bot — Visual Pro Media</title>
<link href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'DM Sans',sans-serif;background:#04060d;color:#e8edf8;min-height:100vh;padding:40px 20px}
.card{background:#0b0f1a;border:1px solid rgba(255,255,255,0.08);border-radius:24px;padding:48px;width:100%;max-width:560px;margin:0 auto}
.logo{font-family:'Syne',sans-serif;font-weight:800;font-size:22px;margin-bottom:8px}
.logo span{color:#4f8eff}
.success-badge{display:inline-flex;align-items:center;gap:8px;background:rgba(0,229,160,0.1);border:1px solid rgba(0,229,160,0.2);color:#00e5a0;border-radius:100px;padding:6px 16px;font-size:13px;margin-bottom:24px}
h1{font-family:'Syne',sans-serif;font-size:28px;font-weight:800;margin-bottom:8px}
.subtitle{color:#6b7592;font-size:15px;margin-bottom:32px;line-height:1.6}
.form-group{margin-bottom:20px}
label{display:block;font-size:12px;font-weight:600;color:#6b7592;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px}
input,select{width:100%;background:#04060d;border:1px solid rgba(255,255,255,0.1);border-radius:10px;padding:14px 16px;color:#e8edf8;font-family:'DM Sans',sans-serif;font-size:15px;outline:none;transition:border-color 0.2s}
input:focus,select:focus{border-color:#4f8eff}
input::placeholder{color:#3a4455}
select option{background:#0b0f1a}
.help{font-size:12px;color:#6b7592;margin-top:6px;line-height:1.5}
.help a{color:#4f8eff;text-decoration:none}
.btn{width:100%;background:#4f8eff;color:#000;border:none;border-radius:12px;padding:18px;font-family:'DM Sans',sans-serif;font-weight:700;font-size:17px;cursor:pointer;margin-top:8px}
.divider{border:none;border-top:1px solid rgba(255,255,255,0.06);margin:28px 0}
.section-label{font-family:'Syne',sans-serif;font-size:13px;font-weight:700;color:#4f8eff;text-transform:uppercase;letter-spacing:1px;margin-bottom:20px}
</style>
</head>
<body>
<div class="card">
  <div class="logo">Visual Pro<span>.</span></div>
  <br>
  <div class="success-badge">✓ Payment Successful!</div>
  <h1>Set Up Your Bot</h1>
  <p class="subtitle">Payment confirmed! Now fill in your details and your Instagram bot will be ready in seconds.</p>
  <form method="POST" action="/onboard/save">
    <input type="hidden" name="paymentId" value="${payment_id}">
    <div class="section-label">Your Business Info</div>
    <div class="form-group">
      <label>Business / Brand Name</label>
      <input name="name" placeholder="e.g. Tech Startup India" required>
    </div>
    <div class="form-group">
      <label>Your Name</label>
      <input name="ownerName" placeholder="e.g. Rahul Sharma" required>
    </div>
    <div class="form-group">
      <label>Email Address</label>
      <input name="email" type="email" placeholder="you@example.com" required>
    </div>
    <div class="form-group">
      <label>Business Niche / Industry</label>
      <select name="niche" required>
        <option value="" disabled selected>Select your niche</option>
        <option>Digital Marketing</option>
        <option>Real Estate</option>
        <option>Fashion & Lifestyle</option>
        <option>Food & Restaurant</option>
        <option>Fitness & Health</option>
        <option>Technology</option>
        <option>Finance & Investment</option>
        <option>Education & Coaching</option>
        <option>Travel & Tourism</option>
        <option>Entertainment</option>
        <option>Other</option>
      </select>
    </div>
    <hr class="divider">
    <div class="section-label">Instagram Details</div>
    <div class="form-group">
      <label>Instagram Handle (without @)</label>
      <input name="handle" placeholder="e.g. yourbrand" required>
    </div>
    <div class="form-group">
      <label>Instagram User ID</label>
      <input name="igUserId" placeholder="e.g. 17841446468701004" required>
      <div class="help">Find it at <a href="https://developers.facebook.com" target="_blank">developers.facebook.com</a> → your app → Instagram API → your account ID</div>
    </div>
    <div class="form-group">
      <label>Instagram Access Token</label>
      <input name="igToken" placeholder="IGAAct..." required>
      <div class="help">Generate from <a href="https://developers.facebook.com" target="_blank">Meta Developer Dashboard</a></div>
    </div>
    <hr class="divider">
    <div class="section-label">Telegram Bot</div>
    <div class="form-group">
      <label>Telegram Bot Token</label>
      <input name="botToken" placeholder="1234567890:AAH..." required>
      <div class="help">Create a bot on <a href="https://t.me/botfather" target="_blank">@BotFather</a> on Telegram and paste the token here</div>
    </div>
    <button type="submit" class="btn">🚀 Activate My Bot Now!</button>
  </form>
</div>
</body>
</html>`);
});

// ── Onboarding Save → Activate Bot ───────────────────────────
app.post('/onboard/save', async (req, res) => {
  const { name, ownerName, email, niche, handle, igUserId, igToken, botToken, paymentId } = req.body;
  if (!name || !handle || !igUserId || !igToken || !botToken) {
    return res.send('<h2 style="font-family:sans-serif;padding:40px;color:red">Please fill all required fields. <a href="javascript:history.back()">Go back</a></h2>');
  }
  try {
    const clients = loadClients();
    const id = 'client_' + Date.now();
    clients[id] = { id, name, ownerName: ownerName||'', email: email||'', niche: niche||'', handle, igUserId, igToken, botToken, paymentId: paymentId||'', active: true, createdAt: new Date().toISOString() };
    saveClients(clients);
    // Auto-set webhook
    await axios.get('https://api.telegram.org/bot' + botToken + '/setWebhook?url=' + PUBLIC_URL + '/webhook/' + id);
    console.log('New paid client activated:', name, handle, email);
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Bot Ready! — Visual Pro Media</title>
<link href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'DM Sans',sans-serif;background:#04060d;color:#e8edf8;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
.card{background:#0b0f1a;border:1px solid rgba(0,229,160,0.2);border-radius:24px;padding:48px;width:100%;max-width:480px;text-align:center}
.icon{font-size:64px;margin-bottom:24px}
h1{font-family:'Syne',sans-serif;font-size:32px;font-weight:800;margin-bottom:12px}
p{color:#6b7592;font-size:16px;line-height:1.7;margin-bottom:32px}
.steps{text-align:left;background:#04060d;border-radius:16px;padding:24px;margin-bottom:32px}
.step{display:flex;gap:12px;align-items:flex-start;padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.06);font-size:14px}
.step:last-child{border-bottom:none}
.step-num{width:24px;height:24px;border-radius:50%;background:#4f8eff;color:#000;font-weight:700;font-size:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px}
.btn{display:inline-block;background:#4f8eff;color:#000;border:none;border-radius:12px;padding:16px 32px;font-family:'DM Sans',sans-serif;font-weight:700;font-size:16px;text-decoration:none}
</style>
</head>
<body>
<div class="card">
  <div class="icon">🎉</div>
  <h1>Your Bot is Live!</h1>
  <p>Congratulations <strong>${name}</strong>! Your Instagram automation bot has been activated successfully.</p>
  <div class="steps">
    <div class="step"><div class="step-num">1</div><div>Open Telegram and search for your bot</div></div>
    <div class="step"><div class="step-num">2</div><div>Send <strong>/start</strong> to activate</div></div>
    <div class="step"><div class="step-num">3</div><div>Type any topic like <strong>"AI tools 2026"</strong></div></div>
    <div class="step"><div class="step-num">4</div><div>Review the post preview and reply <strong>approve</strong></div></div>
    <div class="step"><div class="step-num">5</div><div>Your post goes live on <strong>@${handle}</strong>! 🚀</div></div>
  </div>
  <a href="https://t.me" class="btn">Open Telegram →</a>
</div>
</body>
</html>`);
  } catch(e) {
    console.error('Onboard error:', e.message);
    res.send('<h2 style="font-family:sans-serif;padding:40px;color:red">Something went wrong: ' + e.message + '</h2>');
  }
});
