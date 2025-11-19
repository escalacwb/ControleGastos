// api/telegram-message.js
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  try {
    const { message } = req.body;

    if (!message || !message.text) {
      return res.status(400).json({ error: 'Nenhuma mensagem de texto recebida' });
    }

    const userId = message.from.id;
    const userName = message.from.first_name || 'Usuário';
    const messageText = message.text;

    console.log(`[Telegram] ${userName} (${userId}): ${messageText}`);

    // Extrair dados com Claude
    const extractedData = await extractTransactionFromAI(messageText);

    if (!extractedData.success) {
      await sendTelegramMessage(userId, `❌ Erro ao processar: ${extractedData.error}`);
      return res.status(500).json({ error: extractedData.error });
    }

    // Validar dados
    const validation = validateExtractedData(extractedData.data);
    if (!validation.valid) {
      await sendTelegramMessage(userId, `❌ Dados inválidos: ${validation.errors.join(', ')}`);
      return res.status(400).json({ error: validation.errors });
    }

    // Salvar em pending_transactions (sem user_id porque não sabemos qual usuário)
    const { data: insertedTrans, error: insertError } = await supabase
      .from('pending_transactions')
      .insert([
        {
          telegram_user_id: userId,
          telegram_user_name: userName,
          raw_message: messageText,
          extracted_data: extractedData.data,
          status: 'pending_review',
          created_at: new Date().toISOString()
        }
      ])
      .select();

    if (insertError) {
      console.error('Erro ao inserir:', insertError);
      await sendTelegramMessage(userId, `❌ Erro ao salvar: ${insertError.message}`);
      return res.status(500).json({ error: insertError.message });
    }

    // Enviar confirmação para Telegram
    await sendTelegramMessage(
      userId,
      `✅ Transação recebida!\n\n` +
      `Tipo: ${extractedData.data.type}\n` +
      `Valor: R$ ${extractedData.data.amount.toFixed(2)}\n` +
      `Categoria: ${extractedData.data.category}\n` +
      `Conta: ${extractedData.data.account}\n` +
      `Data: ${new Date(extractedData.data.date).toLocaleDateString('pt-BR')}\n\n` +
      `Por favor, revise no painel web antes de confirmar.`
    );

    console.log('✅ Transação salva:', insertedTrans[0].id);
    return res.status(200).json({
      success: true,
      message: 'Transação recebida com sucesso',
      transaction_id: insertedTrans[0].id
    });

  } catch (error) {
    console.error('[ERRO]', error);
    return res.status(500).json({ error: error.message });
  }
};

async function extractTransactionFromAI(messageText) {
  try {
    const prompt = `
Você é um assistente de análise financeira. Analise a mensagem abaixo e extraia os dados da transação.

IMPORTANTE: Responda APENAS com um JSON válido, sem nenhuma explicação adicional.

Regras:
1. "type": pode ser "receita", "despesa" ou "transferencia"
2. "amount": número decimal (ex: 150.50)
3. "category": nome da categoria (ex: "Alimentação", "Combustível", "Habitação")
4. "account": pode ser um banco (ex: "Nubank", "Bradesco", "Itaú") ou um cartão (ex: "Cartão C6")
5. "payment_method": "banco" ou "cartao"
6. "date": data em formato YYYY-MM-DD (se não mencionado, use: ${new Date().toISOString().split('T')[0]})
7. "description": um resumo breve da transação

Mensagem a analisar:
"${messageText}"

Responda com APENAS este JSON (sem explicações):
{
  "type": "despesa",
  "amount": 0,
  "category": "",
  "account": "",
  "payment_method": "banco",
  "date": "YYYY-MM-DD",
  "description": ""
}
    `;

    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 500,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      },
      {
        headers: {
          'x-api-key': CLAUDE_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json'
        }
      }
    );

    const content = response.data.content[0].text;
    console.log('[Claude Response]', content);

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Resposta da IA não contém JSON válido');
    }

    const extractedData = JSON.parse(jsonMatch[0]);
    return { success: true, data: extractedData };

  } catch (error) {
    console.error('[Claude Error]', error.response?.data || error.message);
    return { success: false, error: error.message };
  }
}

function validateExtractedData(data) {
  const errors = [];

  if (!data.type || !['receita', 'despesa', 'transferencia'].includes(data.type)) {
    errors.push('Tipo de transação inválido');
  }

  if (!data.amount || isNaN(data.amount) || data.amount <= 0) {
    errors.push('Valor inválido');
  }

  if (!data.category || data.category.trim() === '') {
    errors.push('Categoria não identificada');
  }

  if (!data.account || data.account.trim() === '') {
    errors.push('Conta/banco não identificado');
  }

  if (!data.date || !/^\d{4}-\d{2}-\d{2}$/.test(data.date)) {
    errors.push('Data inválida');
  }

  return {
    valid: errors.length === 0,
    errors: errors
  };
}

async function sendTelegramMessage(chatId, text) {
  try {
    await axios.post(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        chat_id: chatId,
        text: text,
        parse_mode: 'HTML'
      }
    );
    console.log(`✅ Mensagem enviada para ${chatId}`);
  } catch (error) {
    console.error('❌ Erro ao enviar Telegram:', error.response?.data || error.message);
  }
}
