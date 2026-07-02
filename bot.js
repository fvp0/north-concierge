const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('✅ North Concierge está no ar!');
});

app.listen(port, () => {
  console.log(`🌐 Servidor rodando na porta ${port}`);
});

console.log('🤖 NORTH CONCIERGE WHATSAPP BOT');
