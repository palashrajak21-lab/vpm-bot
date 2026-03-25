const express = require('express');
const axios = require('axios');
const { createCanvas } = require('canvas');
const FormData = require('form-data');

const app = express();
app.use(express.json());

const BOT_TOKEN = process.env.BOT_TOKEN;
const GROQ_KEY = process.env.GROQ_API_KEY;
const IG_TOKEN = process.env.IG_TOKEN;
const IG_USER_ID = process.env.IG_USER_ID;
const PUBLIC_URL = process.env.PUBLIC_URL;
const TELEGRAM_API = 'https://api.telegram.org/bot' + BOT_TOKEN;

const imageStore = {};
const sessions = {};

function drawTemplate(quote, author) {
  const S = 1080;
  const canvas = createCanvas(S, S);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#f7f9f9';
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = 'rgba(0,0,0,0.022)';
  for (let x = 0; x < S; x += 48) {
    for (let y = 0; y < S; y += 48) {
      ctx.beginPath(); ctx.arc(x, y, 2.4, 0, Math.PI * 2); ctx.fill();
    }
  }
  const cx = 72, cy = 72, cw = S - 144, ch = S - 144;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.roundRect(cx, cy, cw, ch, 36); ctx.fill();
  ctx.strokeStyle = '#e1e8ed'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.roundRect(cx, cy, cw, ch, 36); ctx.stroke();
  const avR = 44, avX = cx + 52 + avR, avY = cy + 60 + avR;
  ctx.fillStyle = '#1d9bf0';
  ctx.beginPath(); ctx.arc(avX, avY, avR, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffffff'; ctx.font = 'bold 32px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('V', avX, avY + 11);
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
  const xs = 28, xx = cx + cw - 68, xy = cy + 56;
  ctx.strokeStyle = '#0f1419'; ctx.lineWidth = 4.5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(xx, xy); ctx.lineTo(xx + xs, xy + xs); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(xx + xs, xy); ctx.lineTo(xx, xy + xs); ctx.stroke();
  ctx.strokeStyle = '#eff3f4'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(cx + 36, cy + 168); ctx.lineTo(cx + cw - 36, cy + 168); ctx.stroke();
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

async function generateContent(topic) {
  const res = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
    model: 'gemma2-9b-it', max_tokens: 600,
    messages: [
      { role: 'system', content: 'Respond ONLY with a JSON object. No explanation. No markdown. No backticks. JSON only. Fields: quote (string, max 12 words), author (string or empty), caption (string, 2 paragraphs), cta (string), hashtags (string of 10 hashtags).' },
      { role: 'user', content: 'Instagram post about: ' + topic }
    ]
  }, { headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + GROQ_KEY } });
  let raw = res.data.choices[0].message.content;
  const s = raw.indexOf('{'), e = raw.lastIndexOf('}');
  if (s === -1 || e === -1) throw new Error('No JSON');
  raw = raw.substring(s, e + 1);
  // Remove ALL control characters except newline and tab
  let cleaned = '';
  for (let i = 0; i < raw.length; i++) {
    const code = raw.charCodeAt(i);
    if (code === 9 || code === 10 || code === 13 || code >= 32) {
      cleaned += raw[i];
    }
  }
  return JSON.parse(cleaned);
}

async function postToInstagram(imgId, caption) {
  const imageUrl = PUBLIC_URL + '/img/' + imgId;
  console.log('Instagram URL:', imageUrl);
  const create = await axios.post('https://graph.instagram.com/v21.0/' + IG_USER_ID + '/media', {
    image_url: imageUrl, caption: caption, access_token: IG_TOKEN
  });
  let status = 'IN_PROGRESS', attempts = 0;
  while (status === 'IN_PROGRESS' && attempts < 12) {
    await new Promise(function(r) { setTimeout(r, 3000); });
    const sr = await axios.get('https://graph.instagram.com/v21.0/' + create.data.id + '?fields=status_code&access_token=' + IG_TOKEN);
    status = sr.data.status_code; attempts++;
    console.log('Status:', status);
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
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'public, max-age=3600');
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
      await sendText(chatId, 'Welcome to *Visual Pro Media Bot!*\n\nSend me:\n- A person name: _Ratan Tata_\n- A topic: _best AI tools for background removal_\n- A theme: _consistency wins_\n\nReply *approve* to post to Instagram\nReply *redo* to regenerate');
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
    await sendText(chatId, 'Generating post about: "' + text + '"\n\nPlease wait ~15 seconds...');
    const data = await generateContent(text);
    const imgBuf = drawTemplate(data.quote || text, data.author || '');
    const imgId = 'img_' + Date.now();
    imageStore[imgId] = imgBuf;
    setTimeout(function() { delete imageStore[imgId]; }, 600000);
    sessions[chatId] = { imgId: imgId, caption: data.caption, cta: data.cta, hashtags: data.hashtags };
    await sendPhoto(chatId, imgBuf, data.caption + '\n\n' + data.cta + '\n\n' + data.hashtags + '\n\nReply approve to post | redo to regenerate');
  } catch (err) {
    console.error(err && err.response ? JSON.stringify(err.response.data) : err.message);
    await sendText(chatId, 'Something went wrong. Please try again!');
  }
});

app.get('/', function(req, res) { res.send('VPM Bot is running!'); });
const PORT = process.env.PORT || 3000;
app.listen(PORT, function() { console.log('Bot live on port ' + PORT); });
