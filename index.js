const express = require('express');
const axios = require('axios');
const { createCanvas } = require('canvas');
const FormData = require('form-data');

const app = express();
app.use(express.json());

const TELEGRAM_TOKEN = '7651985462:AAHC_StUMFvGprQiQDTzOI5L0wVX3TotKps';
const GROQ_KEY = process.env.GROQ_API_KEY;
const IG_TOKEN = 'IGAActCgt3xEVBZAGFpX1VvaTZA1VlZAhZAUlGSjhVMkdOcmgweWRYWUxBZAXVwc25hcWxnV1I3Vnd2WlRmRzg0OWI2cVZALZATNGR0lSN1hnX09ZAZAURoTzhkM0JOTElBSFFvMzZA4TktJTDBNVTBXVFI3ME1PTXVuWnhtWFozNlFYTjZALbwZDZD';
const IG_USER_ID = '17841446468701004';
const TELEGRAM_API = 'https://api.telegram.org/bot' + TELEGRAM_TOKEN;

const sessions = {};

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
  [[m-2,m-2,1,1],[S-m+2,m-2,-1,1],[m-2,S-m+2,1,-1],[S-m+2,S-m+2,-1,-1]].forEach(function(c) {
    ctx.beginPath(); ctx.moveTo(c[0]+c[2]*cs,c[1]); ctx.lineTo(c[0],c[1]); ctx.lineTo(c[0],c[1]+c[3]*cs); ctx.stroke();
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
  ctx.font = 'italic ' + fSize + 'px serif';
  ctx.fillStyle = '#e8edf5';
  ctx.textAlign = 'center';
  const words = quote.split(' ');
  const lines = [];
  let line = '';
  for (let i = 0; i < words.length; i++) {
    const test = line + (line ? ' ' : '') + words[i];
    if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = words[i]; }
    else line = test;
  }
  if (line) lines.push(line);
  const lh = fSize * 1.55;
  let ty = S/2 - (lines.length*lh)/2 + lh/2 - 30;
  for (let j = 0; j < lines.length; j++) { ctx.fillText(lines[j], S/2, ty); ty += lh; }
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

async function sendText(chatId, text) {
  await axios.post(TELEGRAM_API + '/sendMessage', { chat_id: chatId, text: text, parse_mode: 'Markdown' });
}

async function sendPhoto(chatId, imageBuffer, caption) {
  const form = new FormData();
  form.append('chat_id', String(chatId));
  form.append('caption', caption);
  form.append('photo', imageBuffer, { filename: 'post.png', contentType: 'image/png' });
  await axios.post(TELEGRAM_API + '/sendPhoto', form, { headers: form.getHeaders() });
}

// Upload image buffer directly to Instagram using multipart form
async function postToInstagram(imgBuffer, caption) {
  // Step 1: Create container using image bytes directly
  const form = new FormData();
  form.append('image', imgBuffer, { filename: 'post.png', contentType: 'image/png' });
  form.append('caption', caption);
  form.append('access_token', IG_TOKEN);

  const create = await axios.post(
    'https://graph.instagram.com/v21.0/' + IG_USER_ID + '/media',
    form,
    { headers: form.getHeaders() }
  );

  // Step 2: Wait for processing
  await new Promise(function(r) { setTimeout(r, 8000); });

  // Step 3: Publish
  const publish = await axios.post(
    'https://graph.instagram.com/v21.0/' + IG_USER_ID + '/media_publish',
    { creation_id: create.data.id, access_token: IG_TOKEN }
  );
  return publish.data.id;
}

async function generateContent(topic) {
  const res = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
    model: 'llama-3.3-70b-versatile',
    max_tokens: 900,
    messages: [
      { role: 'system', content: 'You are an expert Instagram content creator. Respond ONLY with raw JSON. No backticks. No markdown. Just JSON. Format: {"quote":"powerful quote max 160 chars","author":"author name or empty","caption":"2-3 paragraph motivational caption max 160 words","cta":"call to action line","hashtags":"12 hashtags with # separated by spaces"}' },
      { role: 'user', content: 'Create an Instagram business post about: ' + topic }
    ]
  }, { headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + GROQ_KEY } });
  const raw = res.data.choices[0].message.content;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON found');
  return JSON.parse(raw.substring(start, end + 1));
}

app.post('/webhook', async function(req, res) {
  res.sendStatus(200);
  const msg = req.body && req.body.message;
  if (!msg) return;
  const chatId = msg.chat.id;
  const text = (msg.text || '').trim();
  const lower = text.toLowerCase();
  try {
    if (lower === '/start') {
      await sendText(chatId, 'Welcome to *Visual Pro Media Bot!*\n\nSend me any business topic and I will generate a branded post.\n\nReply *approve* to post to Instagram.\nReply *redo* to regenerate.\n\nTry: _consistency builds empires_');
      return;
    }
    if (lower === 'approve' && sessions[chatId]) {
      const s = sessions[chatId];
      await sendText(chatId, 'Posting to Instagram now...');
      const postId = await postToInstagram(s.imgBuffer, s.caption + '\n\n' + s.cta + '\n\n' + s.hashtags);
      delete sessions[chatId];
      await sendText(chatId, 'Posted successfully! Check @visualpromediaofficial\n\nPost ID: ' + postId + '\n\nSend another idea anytime!');
      return;
    }
    if ((lower === 'redo' || lower === 'cancel') && sessions[chatId]) {
      delete sessions[chatId];
      await sendText(chatId, 'Cancelled. Send a new topic anytime!');
      return;
    }
    await sendText(chatId, 'Generating post about: "' + text + '"\n\nPlease wait ~15 seconds...');
    const data = await generateContent(text);
    const imgBuffer = drawTemplate(data.quote, data.author || '');
    sessions[chatId] = { imgBuffer: imgBuffer, caption: data.caption, cta: data.cta, hashtags: data.hashtags };
    await sendPhoto(chatId, imgBuffer, data.caption + '\n\n' + data.cta + '\n\n' + data.hashtags + '\n\nReply approve to post | redo to regenerate');
  } catch (err) {
    console.error(err && err.response ? JSON.stringify(err.response.data) : err.message);
    await sendText(chatId, 'Something went wrong. Please try again!');
  }
});

app.get('/', function(req, res) { res.send('Visual Pro Media Bot is running!'); });

const PORT = process.env.PORT || 3000;
app.listen(PORT, function() { console.log('Bot live on port ' + PORT); });
