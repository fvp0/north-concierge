const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const axios = require('axios');
require('dotenv').config();

let historico = {};
const HISTORICO_FILE = 'historico_whatsapp.json';

try {
  const data = fs.readFileSync(HISTORICO_FILE, 'utf8');
  historico = JSON.parse(data);
} catch {}

function salvarHistorico() {
  fs.writeFileSync(HISTORICO_FILE, JSON.stringify(historico, null, 2));
}

const SAUDACAO_FIXA = "Oi! Tudo certo? 👋 Aqui é da North Store Brasil. Me diz como posso te ajudar que eu já te direciono.";

const systemPrompt = `Você é o North Concierge, consultor da North Store Brasil.

IDENTIDADE:
- Você é um atendente de loja especializado em acessórios
- Seu trabalho é ajudar clientes a encontrar produtos

PRODUTOS QUE VOCÊ VENDE:
- CAPINHAS para celular (todos os modelos: iPhone, Samsung, Motorola, etc.)
- PELÍCULAS de vidro para celular
- CARREGADORES (USB-C, Lightning, Micro-USB)
- CABOS (USB-C, Lightning, Micro-USB)
- FONES DE OUVIDO (com fio e bluetooth)
- POWER BANKS
- SUPORTES para celular
- ACESSÓRIOS AUTOMOTIVOS

REGRAS OBRIGATÓRIAS:
1. CAPINHA = proteção para celular, NÃO é câmera
2. Quando cliente pedir CAPINHA, pergunte: "Qual modelo do seu celular?"
3. Quando cliente pedir PELÍCULA, pergunte: "Qual modelo do seu celular?"
4. Quando cliente pedir CARREGADOR, pergunte: "Qual entrada? USB-C ou Lightning?"
5. Quando cliente pedir FONE, pergunte: "Com fio ou bluetooth?"
6. NUNCA confunda capa com câmera
7. NUNCA invente informações
8. Se não souber, diga: "Vou verificar para você"

EXEMPLOS:
Cliente: "Quero uma capa"
Você: "Qual modelo do seu celular? Temos capinhas para todos os modelos."

Cliente: "Quero película"
Você: "Qual modelo do seu celular? Temos películas de vidro."

Cliente: "Tem carregador?"
Você: "Sim! Qual entrada você precisa? USB-C ou Lightning?"`;

const SAUDACOES = ['oi', 'ola', 'olá', 'eai', 'e aí', 'tudo bem', 'bom dia', 'boa tarde', 'boa noite', 'oie'];

function isSaudacao(msg) {
  const lower = msg.toLowerCase().trim();
  for (const s of SAUDACOES) {
    if (lower.includes(s)) return true;
  }
  return false;
}

async function processAI(msg, sender) {
  try {
    if (!historico[sender]) {
      historico[sender] = [];
    }

    const hist = historico[sender];
    hist.push({ role: 'cliente', content: msg });

    // Se for saudação, usa resposta fixa
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

    const response = await axios.post('http://localhost:11434/api/generate', {
      model: 'llama3.2:3b',
      prompt: promptCompleto,
      stream: false,
      options: {
        num_predict: 300,
        temperature: 0.3
      }
    });

    const resposta = response.data.response;
    hist.push({ role: 'north', content: resposta });
    salvarHistorico();
    return resposta;
  } catch (e) {
    console.log("Erro IA:", e.message);
    return "Desculpe, estou com dificuldades técnicas. Vou transferir seu atendimento para um humano.";
  }
}

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info');

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    browser: ['North Concierge', 'Chrome', '1.0.0']
  });

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('\n🔑 ESCANEIE O QR CODE COM O WHATSAPP:');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'open') {
      console.log('\n✅ North Concierge CONECTADO ao WhatsApp!');
      console.log('📱 Aguardando mensagens...\n');
    }

    if (connection === 'close') {
      const reason = lastDisconnect?.error?.output?.statusCode;
      if (reason === DisconnectReason.loggedOut) {
        console.log('❌ Deslogado. Apague a pasta auth_info e reinicie.');
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

    console.log(`\n📩 ${sender}: ${text}`);

    const response = await processAI(text, sender);

    await sock.sendMessage(sender, {
      text: response
    });

    console.log(`📤 Resposta enviada: ${response}`);
  });
}

console.log('🤖 NORTH CONCIERGE WHATSAPP BOT');
console.log('📱 Conectando ao WhatsApp...\n');

startBot();
