// api/telegram-message.js
// VERSÃO SIMPLIFICADA PARA DIAGNÓSTICO

module.exports = async (req, res) => {
  console.log('='.repeat(50));
  console.log('[WEBHOOK] RECEBIDO!');
  console.log('Método:', req.method);
  console.log('Body:', JSON.stringify(req.body));
  console.log('='.repeat(50));

  // Responder imediatamente
  res.status(200).json({ ok: true, received: true });

  // Se chegou aqui, tudo funcionou
  console.log('[SUCCESS] Resposta enviada ao Telegram');
};
