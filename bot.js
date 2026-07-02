const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const express = require('express');
const axios = require('axios');
const fs = require('fs');
const qrCode = require('qrcode');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

let qrCodeImage = null;
let isConnected = false;
let ultimoQRCode = null;

// ========== MEMÓRIA ==========
let historico = {};
const HISTORICO_FILE = 'historico_whatsapp.json';

try {
  const data = fs.readFileSync(HISTORICO_FILE, 'utf8');
  historico = JSON.parse(data);
} catch {}

function salvarHistorico() {
  fs.writeFileSync(HISTORICO_FILE, JSON.stringify(historico, null, 2));
}

// ========== PROMPT ==========
const SAUDACAO_FIXA = "Oi! Tudo certo? 👋 Aqui é da North Store Brasil. Me diz como posso te ajudar que eu já te direciono.";
const systemPrompt = `Você é o North Concierge, consultor premium da North Store Brasil. Seja educado, profissional, direto e humano. Nunca invente informações.`;
const SAUDACOES = ['oi', 'ola', 'olá', 'eai', 'e aí', 'tudo bem', 'bom dia', 'boa tarde', 'boa noite'];

function isSaudacao(msg) {
  const lower = msg.toLowerCase().trim();
  for (const s of SAUDACOES) {
    if (lower.includes(s)) return true;
  }
  return false;
}

// ========== IA ==========
async function processAI(msg, sender) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return "Desculpe, estou com dificuldades técnicas.";

    if (!historico[sender]) historico[sender] = [];
    const hist = historico[sender];
    hist.push({ role: 'cliente', content: msg });

    if (hist.length === 1 || isSaudacao(msg)) {
      const resposta = SAUDACAO_FIXA;
      hist.push({ role: 'north', content: resposta });
      salvarHistorico();
      return resposta;
    }

    let contexto = '';
    const ultimas = hist.slice(-5);
    for (const item of ultimas) {
      contexto += `${item.role === 'cliente' ? 'Cliente' : 'North Concierge'}: ${item.content}\n`;
    }

    const promptCompleto = `${systemPrompt}\n\n${contexto}\nCliente: ${msg}\nNorth Concierge:`;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`;
    const response = await axios.post(url, {
      contents: [{ parts: [{ text: promptCompleto }] }]
    });

    const resposta = response.data.candidates[0].content.parts[0].text;
    hist.push({ role: 'north', content: resposta });
    salvarHistorico();
    return resposta;
  } catch (e) {
    return "Desculpe, estou com dificuldades técnicas. Vou transferir seu atendimento para um humano.";
  }
}

// ========== WHATSAPP ==========
async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info');

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: true,
    browser: ['North Concierge', 'Chrome', '1.0.0']
  });

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr && qr !== ultimoQRCode) {
      ultimoQRCode = qr;
      console.log('✅ QR Code gerado!');
      
      try {
        qrCodeImage = await qrCode.toDataURL(qr);
        console.log('✅ Imagem QR Code salva!');
      } catch (err) {
        console.error('Erro ao gerar QR:', err);
      }
    }

    if (connection === 'open') {
      isConnected = true;
      console.log('✅ North Concierge CONECTADO ao WhatsApp!');
    }

    if (connection === 'close') {
      isConnected = false;
      const reason = lastDisconnect?.error?.output?.statusCode;
      if (reason === DisconnectReason.loggedOut) {
        console.log('❌ Deslogado.');
      } else {
        console.log('🔄 Reconectando...');
        setTimeout(startBot, 5000);
      }
    }
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('messages.upsert', async (m) => {
    const msg = m.messages[0];
    if (msg.key.fromMe || !msg.message?.conversation) return;

    const sender = msg.key.remoteJid;
    const text = msg.message.conversation;

    console.log(`📩 ${sender}: ${text}`);
    const response = await processAI(text, sender);
    await sock.sendMessage(sender, { text: response });
    console.log(`📤 Resposta enviada`);
  });
}

// ========== ROTAS WEB ==========
app.get('/', (req, res) => {
  if (isConnected) {
    res.send(`
      <html>
        <head><title>North Concierge</title></head>
        <body style="display:flex;justify-content:center;align-items:center;height:100vh;flex-direction:column;background:#000;color:#fff;font-family:sans-serif;">
          <h1>✅ Conectado ao WhatsApp!</h1>
          <p style="color:#4CAF50;">Bot online e respondendo mensagens</p>
        </body>
      </html>
    `);
  } else if (qrCodeImage) {
    res.send(`
      <html>
        <head><title>North Concierge - QR Code</title></head>
        <body style="display:flex;justify-content:center;align-items:center;height:100vh;flex-direction:column;background:#000;color:#fff;font-family:sans-serif;">
          <h1>📱 Escaneie o QR Code</h1>
          <p>Abra o WhatsApp → 3 pontinhos → WhatsApp Web</p>
          <img src="${qrCodeImage}" style="width:300px;height:300px;border:2px solid #4CAF50;border-radius:10px;" />
          <p style="margin-top:20px;font-size:12px;color:#888;">Aguardando escaneamento...</p>
          <p style="font-size:10px;color:#555;">Clique em "Atualizar" se o QR Code não aparecer</p>
        </body>
      </html>
    `);
  } else {
    res.send(`
      <html>
        <head><title>North Concierge</title></head>
        <body style="display:flex;justify-content:center;align-items:center;height:100vh;flex-direction:column;background:#000;color:#fff;font-family:sans-serif;">
          <h1>⏳ Iniciando bot...</h1>
          <p>Aguarde alguns segundos para o QR Code aparecer</p>
          <p style="font-size:12px;color:#888;">Isso pode levar até 1 minuto</p>
        </body>
      </html>
    `);
  }
});

app.listen(port, () => {
  console.log(`🌐 Servidor rodando na porta ${port}`);
  startBot();
});

console.log('🤖 NORTH CONCIERGE WHATSAPP BOT');
console.log('🌐 Acesse o site para ver o QR Code');
