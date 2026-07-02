const axios = require('axios');
const readline = require('readline');
const fs = require('fs');
require('dotenv').config();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

let historico = [];
const HISTORICO_FILE = 'historico.json';

try {
  const data = fs.readFileSync(HISTORICO_FILE, 'utf8');
  historico = JSON.parse(data);
  console.log(`📚 Memória carregada: ${historico.length} conversas`);
} catch {
  console.log('📚 Nova memória iniciada.');
}

function salvarHistorico() {
  fs.writeFileSync(HISTORICO_FILE, JSON.stringify(historico, null, 2));
}

// SAUDAÇÃO EXATA QUE VOCÊ QUER
const SAUDACAO_FIXA = "Oi! Tudo certo? 👋 Aqui é da North Store Brasil. Me diz como posso te ajudar que eu já te direciono.";

// Palavras que indicam que o cliente está cumprimentando
const SAUDACOES = ['oi', 'ola', 'olá', 'eai', 'e aí', 'tudo bem', 'bom dia', 'boa tarde', 'boa noite', 'oie'];

const systemPrompt = `Você é o North Concierge, um consultor virtual premium da marca North.

IDENTIDADE:
Nome: North Concierge
Sua missão é oferecer um atendimento extremamente humano, natural e profissional.

Sua personalidade é:
- Educado, calmo, inteligente, estratégico, paciente, prestativo, simpático, profissional, objetivo, discreto.

Nunca pareça um robô.
Adapte sempre a linguagem ao cliente.

ESPECIALIDADES:
- Acessórios para celulares (capinhas, películas, carregadores, cabos, fones, smartwatches, caixas de som, power banks, suportes)
- Acessórios automotivos (organização, iluminação, limpeza, segurança, conforto, eletrônicos)
- Cosméticos, produtos de beleza, maquiagem, cuidados pessoais

OBJETIVO:
- Ajudar o cliente a encontrar exatamente o que ele procura.
- Fazer venda consultiva.
- Entender a necessidade antes de oferecer produtos.
- Nunca forçar uma venda.

REGRAS IMPORTANTES:
NUNCA inventar informações, estoque, preços, promoções, prazo de entrega, produtos, políticas da empresa.
NUNCA confirmar pagamentos, compras, criar pedidos, alterar pedidos, cancelar pedidos, aprovar reembolsos.
Se não souber, seja transparente.

ATENDIMENTO HUMANO:
Transferir para humano quando houver: reclamações, problemas financeiros, trocas, devoluções, garantias, cancelamentos.

ESTILO:
Converse naturalmente.
Nunca diga "Sou apenas uma IA" ou "Como modelo de linguagem".
Evite textos gigantes.
Prefira respostas claras.

TOM DA MARCA:
Elegância, tecnologia, confiança, atendimento premium, qualidade, honestidade, transparência, respeito.

MISSÃO FINAL:
Seu maior objetivo é fazer o cliente confiar na North.
Toda resposta deve parecer escrita por um consultor humano experiente.`;

// Verifica se a mensagem é um cumprimento
function isSaudacao(msg) {
  const lower = msg.toLowerCase().trim();
  for (const s of SAUDACOES) {
    if (lower.includes(s)) return true;
  }
  return false;
}

async function chat(msg) {
  try {
    historico.push({ role: 'cliente', content: msg });
    
    // Se for a PRIMEIRA mensagem OU for um cumprimento, usa a saudação fixa
    if (historico.length === 1 || isSaudacao(msg)) {
      const resposta = SAUDACAO_FIXA;
      historico.push({ role: 'north', content: resposta });
      salvarHistorico();
      console.log("\n" + resposta);
      console.log("\n" + "-".repeat(50) + "\n");
      return;
    }

    let contexto = '';
    const ultimas = historico.slice(-5);
    for (const item of ultimas) {
      contexto += `${item.role === 'cliente' ? 'Cliente' : 'North Concierge'}: ${item.content}\n`;
    }

    const promptCompleto = `${systemPrompt}\n\n${contexto}\nCliente: ${msg}\nNorth Concierge:`;

    const response = await axios.post('http://localhost:11434/api/generate', {
      model: 'llama3.2:1b',
      prompt: promptCompleto,
      stream: false,
      options: {
        num_predict: 200,
        temperature: 0.7
      }
    });

    const resposta = response.data.response;
    historico.push({ role: 'north', content: resposta });
    salvarHistorico();

    console.log("\n" + resposta);
    console.log("\n" + "-".repeat(50) + "\n");
  } catch (e) {
    console.log("Erro: " + e.message);
  }
}

function loop() {
  rl.question("Voce: ", async (msg) => {
    if (msg.toLowerCase() === "sair") {
      console.log("Tchau! Volte sempre! 😊");
      rl.close();
      return;
    }
    await chat(msg);
    loop();
  });
}

console.log("🏨 North Concierge");
console.log("🧠 Com memória ativa");
console.log("Digite 'sair' para encerrar.\n");
loop();
