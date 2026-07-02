const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode');
const express = require('express');
const fs = require('fs');
const axios = require('axios');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

let qrCode = null;
let sock = null;
let isConnected = false;

const systemPrompt = `Você é o North Concierge, consultor premium da North Store Brasil.
Seja educado, profissional, direto e humano.
Nunca invente informações.
Se não souber, diga que vai encaminhar para um atendente.`;

const SAUDACAO_FIXA = "Oi! Tudo certo? 👋 Aqui é da North Store Brasil. Me diz como posso te ajudar que eu já te direciono.";

const SAUDACOES = ['oi', 'ola', 'olá', 'eai', 'e aí', 'tudo bem', 'bom dia', 'boa tarde', 'boa noite'];

function isSaudacao(msg) {
  const lower = msg.toLowerCase().trim();
  for (const s of SAUDACOES) {
    if (lower.includes(s)) return true;
  }
  return false;
}

async function processAI(msg, sender) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return "Desculpe, estou com dificuldades técnicas. Vou transferir seu atendimento para um humano.";
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`;
    
    const response = await axios.post(url, {
      contents: [{
        parts: [{ text: `${systemPrompt}\n\nCliente: ${msg}\nNorth Concierge:` }]
      }]
    });

    return response.data.candidates[0].content.parts[0].text;
  } catch (e) {
    console.error("Erro IA:", e.message);
    return "Desculpe, estou com dificuldades técnicas. Vou transferir seu atendimento para um humano.";
  }
}

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info');

  sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    browser: ['North Concierge', 'Chrome', '1.0.0']
  });

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      qrCode = qr;
      console.log('QR Code gerado! Acesse o site para escanear.');
    }

    if (connection === 'open') {
      isConnected = true;
      console.log('✅ North Concierge CONECTADO!');
    }

    if (connection === 'close') {
      isConnected = false;
      const reason = lastDisconnect?.error?.output?.statusCode;
      if (reason === DisconnectReason.loggedOut) {
        console.log('❌ Deslogado. Reinicie.');
      } else {
        console.log('🔄 Reconectando...');
        startBot();
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

    await sock.sendMessage(sender, {
      text: response
    });

    console.log(`📤 Resposta enviada`);
  });
}

// Rota para mostrar o QR Code
app.get('/', (req, res) => {
  if (isConnected) {
    res.send('✅ North Concierge está CONECTADO! Envie mensagens no WhatsApp.');
  } else if (qrCode) {
    res.send(`
      <html>
        <head><title>North Concierge</title></head>
        <body style="display:flex;justify-content:center;align-items:center;height:100vh;flex-direction:column;background:#000;color:#fff;font-family:sans-serif;">
          <h1>📱 Escaneie o QR Code</h1>
          <p>Abra o WhatsApp → 3 pontinhos → WhatsApp Web</p>
          <img src="https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrCode)}" />
          <p style="margin-top:20px;font-size:12px;">Aguardando conexão...</p>
        </body>
      </html>
    `);
  } else {
    res.send('⏳ Aguardando QR Code ser gerado...');
  }
});

app.listen(port, () => {
  console.log(`🌐 Servidor rodando na porta ${port}`);
  startBot();
});

console.log('🤖 NORTH CONCIERGE WHATSAPP BOT');
console.log('🌐 Acesse o site para ver o QR Code');
