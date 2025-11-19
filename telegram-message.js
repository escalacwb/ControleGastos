// api/telegram-message.js
import axios from 'axios';
import { createClient } from '@supabase/supabase-js';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  try {
    const { message } = req.body;

    if (!message || !message.text) {
      return res.status(400).json({ error: 'Nenhuma mensagem de texto' });
    }

    const userId = message.from.id;
    const userName = message.from.first_name || 'Usuário';
    const messageText = message.text;

    console.log(`[Telegram] ${userName}: ${messageText}`);

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

    // Salvar em pending_transactions
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

    if (insertError) throw insertError;

    // Enviar confirmação para Telegram
    await sendTelegramMessage(
      userId,
      `✅ Transação recebida!\n\n` +
      `Tipo: ${extractedData.data.type}\n` +
      `Valor: R$ ${extractedData.data.amount}\n` +
      `Categoria: ${extractedData.data.category}\n` +
      `Conta: ${extractedData.data.account}\n\n` +
      `Por favor, revise no painel web.`
    );

    return res.status(200).json({
      success: true,
      message: 'Transação recebida',
      transaction: insertedTrans[0]
    });

  } catch (error) {
    console.error('Erro:', error);
    return res.status(500).json({ error: error.message });
  }
}

async function extractTransactionFromAI(messageText) {
  try {
    const prompt = `
Você é um assistente de análise financeira. Analise a mensagem e extraia uma transação.

RESPONDA APENAS COM JSON, sem explicações.

Regras:
1. "type": "receita" | "despesa" | "transferencia"
2. "amount": número decimal
3. "category": nome da categoria
4. "account": banco ou cartão
5. "payment_method": "banco" | "cartao"
6. "date": YYYY-MM-DD (hoje se não mencionado)
7. "description": resumo breve

Mensagem: "${messageText}"

JSON:
{
  "type": "",
  "amount": 0,
  "category": "",
  "account": "",
  "payment_method": "",
  "date": "",
  "description": ""
}
    `;

    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }]
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
    const jsonMatch = content.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      throw new Error('JSON inválido na resposta');
    }

    const data = JSON.parse(jsonMatch[0]);
    return { success: true, data };

  } catch (error) {
    return { success: false, error: error.message };
  }
}

function validateExtractedData(data) {
  const errors = [];
  if (!['receita', 'despesa', 'transferencia'].includes(data.type)) {
    errors.push('Tipo inválido');
  }
  if (!data.amount || data.amount <= 0) {
    errors.push('Valor inválido');
  }
  if (!data.category) {
    errors.push('Categoria não encontrada');
  }
  if (!data.account) {
    errors.push('Conta não encontrada');
  }
  return { valid: errors.length === 0, errors };
}

async function sendTelegramMessage(chatId, text) {
  try {
    await axios.post(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      { chat_id: chatId, text }
    );
  } catch (error) {
    console.error('Erro ao enviar Telegram:', error);
  }
}
