
// ============================================
// VARIÁVEIS GLOBAIS
// ============================================

var supabase = null;
var currentUser = null;
var accounts = [];
var categories = [];
var transactions = [];
var investments = [];
var creditCards = [];
var billingCycles = [];
var currentView = 'dashboard';
var charts = {};
var filterCategory = 'all';  // 'all' ou ID da categoria
var filterType = 'all';      // 'all', 'income', 'expense', 'transfer'
var filterAccount = 'all';   // 'all' ou ID da conta
var filterDateStart = null;  // Data inicial (YYYY-MM-DD)
var filterDateEnd = null;    // Data final (YYYY-MM-DD)

var APP_CONFIG = window.APP_CONFIG || {};
var CARD_MODE = 'statement-only'; // 'statement-only' | 'hybrid'

function getReportingTransactions() {
  if (CARD_MODE !== 'statement-only') return transactions;
  return transactions.filter(t => !(t.type === 'expense' && t.credit_card_id));
}

function getAppConfigValue(key) {
  return APP_CONFIG[key] || localStorage.getItem(key) || '';
}

// ============================================
// IA CATEGORY SUGGESTION - CLAUDE API
// ============================================

// Configuração da API
var CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';

// Mapeamento de categorias para IDs
var categoryMap = {
  'HABITAÇÃO': 'categoria_id_da_sua_categoria_habitacao',
  'ALIMENTAÇÃO': 'categoria_id_da_sua_categoria_alimentacao',
  'SAÚDE': 'categoria_id_da_sua_categoria_saude',
  'MENSALIDADES CRIANÇAS': 'categoria_id_da_sua_categoria_mensalidades_criancas',
  'INFANTIL': 'categoria_id_da_sua_categoria_infantil',
  'ANIMAIS': 'categoria_id_da_sua_categoria_animais',
  'MENSALIDADES ADULTOS': 'categoria_id_da_sua_categoria_mensalidades_adultos',
  'VESTUÁRIO ADULTO': 'categoria_id_da_sua_categoria_vestuario_adulto',
  'SAÚDE & BELEZA': 'categoria_id_da_sua_categoria_saude_beleza',
  'SERVIÇOS DOMÉSTICOS': 'categoria_id_da_sua_categoria_servicos_domesticos',
  'VEÍCULOS & COMBUSTÍVEL': 'categoria_id_da_sua_categoria_veiculos_combustivel',
  'LAZER & CULTURA': 'categoria_id_da_sua_categoria_lazer_cultura',
  'VIAGENS': 'categoria_id_da_sua_categoria_viagens'
};

// Variável para armazenar guia
var CATEGORIZATION_GUIDE = null;

/**
 * Carrega guia de categorização do arquivo JSON
 */
async function loadCategorizationGuide() {
  try {
    console.log('📚 Carregando guia de categorização...');

    if (window.location && window.location.protocol === 'file:') {
      console.warn('⚠️ Guia não carregado via file://');
      alert('⚠️ Para carregar o guia, execute o app via servidor HTTP (ex: Live Server).');
      return;
    }
    
    const response = await fetch('./categorization-guide.json');
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data = await response.json();
    CATEGORIZATION_GUIDE = data.guide;
    
    console.log(`✅ Guia carregado! (${Math.round(CATEGORIZATION_GUIDE.length / 1024)}KB)`);
    
  } catch (error) {
    console.error('❌ Erro ao carregar guia:', error);
    alert('⚠️ Guia não carregado. Categoria manual será necessária.');
  }
}

/**
 * Aguarda guia estar carregado
 */
function ensureGuideLoaded() {
  return new Promise((resolve) => {
    if (CATEGORIZATION_GUIDE) {
      resolve();
    } else {
      let attempts = 0;
      const check = setInterval(() => {
        if (CATEGORIZATION_GUIDE || attempts++ > 50) {
          clearInterval(check);
          resolve();
        }
      }, 100);
    }
  });
}

// ============================================
// SUGERIR CATEGORIA COM IA (Na tabela preview do CSV)
// Ao clicar, analisa a DESCRIÇÃO daquela linha específica
// ============================================

async function suggestCategoryForCsvLine(rowIndex) {
  console.log('=== INICIO: Sugestao para linha', rowIndex);

  const row = csvData[rowIndex];
  if (!row) {
    alert('Linha nao encontrada');
    return;
  }

  const description = row[csvMapping.description];

  if (!description || !description.trim()) {
    alert('Descricao vazia para esta linha');
    return;
  }

  // Mostrar indicador de carregamento
  const loadingId = 'csvAILoading_' + rowIndex;
  const loadingEl = document.getElementById(loadingId);
  if (loadingEl) {
    loadingEl.style.display = 'block';
    loadingEl.textContent = '...';
  }

  try {
    console.log('Analisando descricao:', description);

    // Chamar Supabase Edge Function
    const supabaseUrl = `${SUPABASE_URL}/functions/v1/categorizer`;

    const response = await fetch(supabaseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ description })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Erro na resposta');
    }

    const data = await response.json();
    console.log('Resposta IA:', data);

    if (!data.success) {
      throw new Error(data.error || 'Erro na categorizacao');
    }

    // METODO 1: Procurar por ID numérico da linha na tabela
    console.log('METODO 1: Procurando select por data-index ou proximidade');

    const allRows = document.querySelectorAll('#csvPreviewTable tbody tr');
    console.log('Total de linhas na tabela:', allRows.length);

    if (allRows.length === 0) {
      console.error('ERRO: Nenhuma linha encontrada na tabela!');
      showCsvAISuccessToast(rowIndex, data.categoryName, data.confidence, data.reason);
      return;
    }

    // Encontrar a linha específica
    const targetRow = allRows[rowIndex];
    if (!targetRow) {
      console.error('ERRO: Linha', rowIndex, 'nao existe na tabela. Total de linhas:', allRows.length);
      showCsvAISuccessToast(rowIndex, data.categoryName, data.confidence, data.reason);
      return;
    }

    // METODO 2: Procurar o select dentro dessa linha
    console.log('METODO 2: Procurando select dentro da linha');
    const selectInRow = targetRow.querySelector('select');

    if (!selectInRow) {
      console.error('ERRO: Nenhum select encontrado na linha', rowIndex);
      console.log('HTML da linha:', targetRow.innerHTML);
      showCsvAISuccessToast(rowIndex, data.categoryName, data.confidence, data.reason);
      return;
    }

    console.log('SELECT ENCONTRADO na linha', rowIndex);
    console.log('Select tagName:', selectInRow.tagName);
    console.log('Select className:', selectInRow.className);

    // METODO 3: Procurar a opcao com o nome ou ID da categoria
    console.log('METODO 3: Procurando opcao com nome:', data.categoryName, 'ou ID:', data.categoryId);

    let foundOption = null;
    let foundByName = false;
    let foundById = false;

    for (let i = 0; i < selectInRow.options.length; i++) {
      const option = selectInRow.options[i];
      const optionText = option.textContent.trim();
      const optionValue = option.value;

      // Debug: mostrar todas as opcoes
      console.log('  Opcao', i, ':', optionValue, '===', optionText);

      // Verificar nome exato
      if (optionText === data.categoryName) {
        foundOption = option;
        foundByName = true;
        console.log('  --> MATCH POR NOME!');
        break;
      }

      // Verificar por ID
      if (optionValue === data.categoryId) {
        foundOption = option;
        foundById = true;
        console.log('  --> MATCH POR ID!');
        break;
      }
    }

    if (foundOption) {
      selectInRow.value = foundOption.value;
      selectInRow.dispatchEvent(new Event('change', { bubbles: true }));
      console.log('SUCESSO! Categoria preenchida:', data.categoryName);

      // Mostrar modal de sucesso
      showCsvAISuccessToast(rowIndex, data.categoryName, data.confidence, data.reason);
    } else {
      console.warn('AVISO: Opcao nao encontrada no select');
      console.log('Opcoes disponveis no select:');
      for (let i = 0; i < selectInRow.options.length; i++) {
        console.log(' -', selectInRow.options[i].value, ':', selectInRow.options[i].textContent);
      }

      // Mesmo sem encontrar, mostrar a sugestao (o usuario pode copiar manualmente)
      showCsvAISuccessToast(rowIndex, data.categoryName, data.confidence, data.reason);
    }

  } catch (error) {
    console.error('ERRO:', error);
    alert('Erro ao sugerir categoria: ' + error.message);
  } finally {
    if (loadingEl) loadingEl.style.display = 'none';
  }
}

// ============================================
// FUNCAO: Modal de sucesso com SUGESTAO VISIVEL
// ============================================
function showCsvAISuccessToast(rowIndex, categoryName, confidence, reason) {
  const confidencePercent = confidence === 'alta' ? '95%' : confidence === 'media' ? '70%' : '50%';

  if (typeof confidencePercent === 'string' && confidencePercent.includes('%')) {
    // Já vem em formato string como "95%"
  } else {
    const conf = Math.round(confidence * 100);
    confidencePercent = conf + '%';
  }

  // MODAL para exibir a sugestao
  const modal = document.createElement('div');
  modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 998; display: flex; align-items: center; justify-content: center;';

  const content = document.createElement('div');
  content.style.cssText = 'background: white; padding: 30px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.2); max-width: 500px; text-align: center;';

  content.innerHTML = '<h2 style="color: #22c55e; margin-top: 0; font-size: 24px;">Sugestao da IA</h2>' +
    '<div style="font-size: 32px; font-weight: bold; color: #166534; margin: 20px 0;">' + categoryName + '</div>' +
    '<div style="display: flex; justify-content: center; gap: 30px; margin-bottom: 20px;">' +
      '<div>' +
        '<div style="font-size: 14px; color: #666;">Confianca</div>' +
        '<div style="font-size: 20px; font-weight: bold; color: #16a34a;">' + confidencePercent + '</div>' +
      '</div>' +
    '</div>' +
    '<div style="font-size: 14px; color: #666; margin-bottom: 20px; line-height: 1.6; background: #f5f5f5; padding: 15px; border-radius: 5px; text-align: left;">' + reason + '</div>' +
    '<button onclick="this.parentElement.parentElement.remove()" style="padding: 12px 30px; background: #22c55e; color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: bold; font-size: 16px;">OK, Perfeito</button>';

  modal.appendChild(content);
  document.body.appendChild(modal);

  // Remover modal ao clicar fora
  modal.addEventListener('click', function(e) {
    if (e.target === modal) {
      modal.remove();
    }
  });

  // Auto-remover depois de 5 segundos
  setTimeout(function() {
    if (modal.parentElement) {
      modal.remove();
    }
  }, 5000);

  console.log('MODAL exibido com sugestao');
}

/**
 * Sugere categoria usando Supabase Edge Function COM AUTENTICAÇÃO
 */
async function suggestCategoryWithAI() {
  const descriptionInput = document.getElementById('transactionDescription');
  const description = descriptionInput?.value?.trim();

  if (!description) {
    alert('⚠️ Preencha a descrição da transação primeiro');
    return;
  }

  const loadingEl = document.getElementById('aiLoadingIndicator');
  if (loadingEl) loadingEl.style.display = 'block';

  try {
    console.log('🔄 Enviando para Supabase Edge Function...');
    
    // Obter token de autenticação
    const session = await supabase.auth.getSession();
    const token = session?.data?.session?.access_token;

    if (!token) {
      throw new Error('Você precisa estar logado para usar esta função');
    }

    // SUBSTITUA "gbvjdntklbggxycmfyhg" pelo seu ID real do Supabase!
    // Encontre em: Dashboard → Settings → General → Project ID
    const supabaseUrl = `${SUPABASE_URL}/functions/v1/categorizer`;
    
    const response = await fetch(supabaseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ description })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `Erro ${response.status}`);
    }

    const data = await response.json();

    console.log('✅ Resposta:', data);

    if (!data.success) {
      throw new Error(data.error || 'Erro na categorização');
    }

    const { categoryName, categoryId, confidence, reason } = data;

    showAISuggestion(categoryName, categoryId, confidence, reason);

  } catch (error) {
    console.error('❌ Erro:', error);
    alert(`❌ Erro ao sugerir categoria:\n${error.message}`);
    
  } finally {
    if (loadingEl) loadingEl.style.display = 'none';
  }
}

/**
 * Mostra sugestão da IA
 */
function showAISuggestion(categoryName, categoryId, confidence, reason) {
  const messageEl = document.getElementById('aiSuggestionMessage');
  const textEl = document.getElementById('aiSuggestionText');

  if (!messageEl || !textEl) {
    console.warn('⚠️ Elementos de sugestão não encontrados');
    return;
  }

  textEl.innerHTML = `<strong>${categoryName}</strong> (${confidence})<br><small>${reason}</small>`;
  messageEl.style.display = 'block';
  messageEl.dataset.suggestedCategoryId = categoryId;

  console.log('✅ Sugestão exibida:', categoryName);
}

/**
 * Aceita sugestão da IA e preenche o formulário COMPLETAMENTE
 */
function acceptAISuggestion() {
  console.log('🎯 Aceitar sugestão iniciado...');
  
  const messageEl = document.getElementById('aiSuggestionMessage');
  const categorySelect = document.getElementById('transactionCategory');
  const descriptionInput = document.getElementById('transactionDescription');

  if (!messageEl || !categorySelect || !descriptionInput) {
    console.warn('⚠️ Elementos não encontrados');
    console.log('messageEl:', !!messageEl);
    console.log('categorySelect:', !!categorySelect);
    console.log('descriptionInput:', !!descriptionInput);
    return;
  }

  const categoryId = messageEl.dataset.suggestedCategoryId;
  const descriptionValue = descriptionInput.value.trim();

  if (!categoryId) {
    alert('❌ Nenhuma sugestão para aceitar');
    return;
  }

  if (!descriptionValue) {
    alert('❌ Descrição vazia');
    return;
  }

  // 🎯 PASSO 1: PREENCHER CATEGORIA NO SELECT
  categorySelect.value = categoryId;
  console.log('✅ Categoria preenchida:', categoryId);

  // 🎯 PASSO 2: DISPARAR EVENTO CHANGE (atualizar UI)
  categorySelect.dispatchEvent(new Event('change', { bubbles: true }));
  console.log('✅ Evento change disparado');

  // 🎯 PASSO 3: GARANTIR QUE A DESCRIÇÃO MANTÉM SEU VALOR
  // A descrição já está no campo, então só confirmamos
  console.log('✅ Descrição mantida:', descriptionValue);

  // 🎯 PASSO 4: FECHAR A MENSAGEM DE SUGESTÃO
  messageEl.style.display = 'none';
  console.log('✅ Sugestão fechada');

  // 🎯 PASSO 5: OPCIONAL - MOSTRAR MENSAGEM DE SUCESSO
  console.log('✅ Formulário preenchido com sucesso!');

  // 🎯 PASSO 6: OPCIONAL - FOCAR NO PRÓXIMO CAMPO (Valor)
  const amountInput = document.getElementById('transactionAmount');
  if (amountInput) {
    amountInput.focus();
    console.log('✅ Foco movido para campo de valor');
  }
}

/**
 * Rejeita sugestão da IA
 */
function rejectAISuggestion() {
  const messageEl = document.getElementById('aiSuggestionMessage');
  
  if (!messageEl) return;

  messageEl.style.display = 'none';
  console.log('❌ Sugestão rejeitada');
}

/**
 * Mostra sugestão da IA
 */
function showAISuggestion(categoryName, categoryId, confidence, reason) {
  const messageEl = document.getElementById('aiSuggestionMessage');
  const textEl = document.getElementById('aiSuggestionText');

  if (!messageEl || !textEl) {
    console.warn('⚠️ Elementos de sugestão não encontrados');
    return;
  }

  // Preencher a sugestão com informações da IA
  textEl.innerHTML = `
    <div style="margin: 10px 0;">
      <strong>${categoryName}</strong> 
      <span style="color: #666; font-size: 0.9em;">(${confidence})</span>
      <br>
      <small style="color: #666;">${reason}</small>
    </div>
  `;
  
  messageEl.style.display = 'block';
  messageEl.dataset.suggestedCategoryId = categoryId;

  console.log('✅ Sugestão exibida:', categoryName);
}


// ============================================
// CONFIGURAÇÃO DO SUPABASE (EMBUTIDA)
// ============================================

var SUPABASE_URL = getAppConfigValue('SUPABASE_URL');
var SUPABASE_KEY = getAppConfigValue('SUPABASE_KEY');

// ============================================
// INICIALIZAÇÃO
// ============================================

async function initApp() {
  try {
    console.log('🚀 Iniciando aplicação...');

    if (!SUPABASE_URL || !SUPABASE_KEY) {
      alert('❌ Configuração do Supabase ausente. Defina SUPABASE_URL e SUPABASE_KEY.');
      showScreen('loginScreen');
      return;
    }
    
    // Inicializar Supabase com credenciais embutidas
    console.log('🔌 Conectando ao Supabase...');
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    console.log('✅ Supabase inicializado com sucesso!');

    // Verificar sessão
    const { data, error } = await supabase.auth.getSession();
    
    if (error) {
      console.error('❌ Erro ao verificar sessão:', error);
      showScreen('loginScreen');
      return;
    }

    if (data?.session) {
      currentUser = data.session.user;
      console.log('✅ Usuário logado:', currentUser.email);
      showScreen('mainApp');
      loadAllData();
      if (typeof startAutoReload === 'function') {
      startAutoReload(30);
      }
    } else {
      console.log('ℹ️ Nenhuma sessão ativa. Mostrando tela de login.');
      showScreen('loginScreen');
    }
  } catch (error) {
    console.error('❌ Erro fatal na inicialização:', error);
    alert('❌ Erro ao conectar com Supabase:\n' + error.message);
    showScreen('loginScreen');
  }
}

async function loadAllData() {
  if (!currentUser) return;

  try {
    await Promise.all([
      loadAccounts(),
      loadCategories(),
      loadTransactions(),
      loadCreditCards(),
      loadBillingCycles(),  // ← NOVO
      loadInvestments(),
      loadPendingTransactions()
    ]);
    
    displayAccounts();
    displayCategories();
    displayCreditCards();
    displayTransactions();
    updateDashboard();
    
    console.log('✅ Todos os dados carregados');
  } catch (error) {
    console.error('❌ Erro ao carregar dados:', error);
  }
}

// ============================================
// AUTENTICAÇÃO
// ============================================

async function handleLogin() {
  if (!supabase) {
    alert('❌ Supabase não está disponível');
    return;
  }

  const email = document.getElementById('loginEmail')?.value?.trim();
  const password = document.getElementById('loginPassword')?.value;

  if (!email || !password) {
    alert('⚠️ Preencha email e senha');
    return;
  }

  try {
    console.log('🔐 Tentando login com:', email);
    const { data, error } = await supabase.auth.signInWithPassword({ 
      email, 
      password 
    });

    if (error) throw error;

    currentUser = data.user;
    console.log('✅ Login bem-sucedido!');
    showScreen('mainApp');
    loadAllData();
  } catch (error) {
    console.error('❌ Erro no login:', error);
    alert('❌ Erro no login:\n' + error.message);
  }
}

async function handleSignup() {
  if (!supabase) {
    alert('❌ Supabase não está disponível');
    return;
  }

  const email = document.getElementById('signupEmail')?.value?.trim();
  const password = document.getElementById('signupPassword')?.value;

  if (!email || !password) {
    alert('⚠️ Preencha email e senha');
    return;
  }

  if (password.length < 6) {
    alert('⚠️ A senha deve ter pelo menos 6 caracteres');
    return;
  }

  try {
    console.log('📝 Criando conta com:', email);
    const { data, error } = await supabase.auth.signUp({ 
      email, 
      password 
    });

    if (error) throw error;
    
    alert('✅ Conta criada! Verifique seu email para confirmar.');
    showLogin();
  } catch (error) {
    console.error('❌ Erro no cadastro:', error);
    alert('❌ Erro no cadastro:\n' + error.message);
  }
}

async function handleLogout() {
  if (supabase) {
    await supabase.auth.signOut();
  }
  currentUser = null;
  showScreen('loginScreen');
}

// ============================================
// NAVEGAÇÃO
// ============================================

function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const screen = document.getElementById(screenId);
  if (screen) {
    screen.classList.add('active');
  }
}

function showLogin() {
  showScreen('loginScreen');
}

function showSignup() {
  showScreen('signupScreen');
}

function showView(viewName) {
  currentView = viewName;
  
  document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
  const navBtn = document.querySelector(`[data-view="${viewName}"]`);
  if (navBtn) navBtn.classList.add('active');

  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  
  const viewMap = {
    'dashboard': 'dashboardView',
    'transactions': 'transactionsView',
    'credit-cards': 'creditCardsView',
    'accounts': 'accountsView',
    'categories': 'categoriesView',
    'investments': 'investmentsView',
    'importCsv': 'importCsvView',
    'pendingTransactions': 'pendingTransactionsView'
  };

  const viewId = viewMap[viewName];
  if (viewId) {
    const view = document.getElementById(viewId);
    if (view) view.classList.add('active');
  }

  if (viewName === 'dashboard') {
    updateDashboard();
  }
}

// ============================================
// MODAL FUNCTIONS
// ============================================

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.style.display = 'none';
  }
}

function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.style.display = 'block';
  }
}

// Fechar modal ao clicar fora
window.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal')) {
    e.target.style.display = 'none';
  }
});

// ============================================
// CARTÕES DE CRÉDITO
// ============================================

async function loadCreditCards() {
  if (!supabase || !currentUser) {
    console.warn('⚠️ Supabase não disponível');
    return;
  }

  try {
    const { data, error } = await supabase
      .from('credit_cards')
      .select('*')
      .eq('user_id', currentUser.id)
      .eq('is_active', true);

    if (error) throw error;

    creditCards = data || [];
    console.log('✅ Cartões carregados:', creditCards.length);

  } catch (error) {
    console.error('❌ Erro ao carregar cartões:', error);
  }
}

async function loadBillingCycles() {
  if (!supabase || !currentUser) return;

  try {
    const { data, error } = await supabase
      .from('billing_cycles')
      .select('*')
      .eq('user_id', currentUser.id)
      .order('due_date', { ascending: false });

    if (error) throw error;

    billingCycles = data || [];

    console.log('✅ Ciclos de faturamento carregados:', billingCycles.length);
  } catch (error) {
    console.error('❌ Erro ao carregar billing cycles:', error);
  }
}

async function ensureBillingCycleExists(creditCardId) {
  if (!supabase || !currentUser) return null;

  try {
    // Verificar se já existe ciclo aberto
    const { data: existingCycle } = await supabase
      .from('billing_cycles')
      .select('*')
      .eq('credit_card_id', creditCardId)
      .eq('status', 'open')
      .single();

    if (existingCycle) {
      return existingCycle;
    }

    // Se não existe, criar novo
    const card = creditCards.find(c => c.id === creditCardId);
    if (!card) return null;

    const today = new Date();
    const cycleEnd = new Date(today);
    cycleEnd.setDate(card.closing_day);
    
    if (cycleEnd < today) {
      cycleEnd.setMonth(cycleEnd.getMonth() + 1);
    }

    const dueDate = new Date(cycleEnd);
    dueDate.setDate(card.due_day);

    const { data: newCycle, error } = await supabase
      .from('billing_cycles')
      .insert([{
        user_id: currentUser.id,
        credit_card_id: creditCardId,
        cycle_start_date: today.toISOString().split('T')[0],
        cycle_end_date: cycleEnd.toISOString().split('T')[0],
        closing_date: cycleEnd.toISOString().split('T')[0],
        due_date: dueDate.toISOString().split('T')[0],
        total_spent: 0,
        total_paid: 0,
        status: 'open'
      }])
      .select()
      .single();

    if (error) throw error;

    console.log('✅ Novo ciclo de faturamento criado');
    return newCycle;
  } catch (error) {
    console.error('❌ Erro ao garantir billing cycle:', error);
    return null;
  }
}

async function closeBillingCycleAndCreateNew(creditCardId) {
  if (!supabase || !currentUser) return;

  try {
    const card = creditCards.find(c => c.id === creditCardId);
    if (!card) return;

    // Procurar ciclo aberto
    const { data: openCycle } = await supabase
      .from('billing_cycles')
      .select('*')
      .eq('credit_card_id', creditCardId)
      .eq('status', 'open')
      .single();

    if (!openCycle) return;

    // FECHAR ciclo atual
    await supabase
      .from('billing_cycles')
      .update({ status: 'closed' })
      .eq('id', openCycle.id);

    // CRIAR novo ciclo
    const newCycleStart = new Date(openCycle.cycle_end_date);
    newCycleStart.setDate(newCycleStart.getDate() + 1);

    const newCycleEnd = new Date(newCycleStart);
    newCycleEnd.setMonth(newCycleEnd.getMonth() + 1);
    newCycleEnd.setDate(card.closing_day);

    const newDueDate = new Date(newCycleEnd);
    newDueDate.setDate(card.due_day);

    await supabase
      .from('billing_cycles')
      .insert([{
        user_id: currentUser.id,
        credit_card_id: creditCardId,
        cycle_start_date: newCycleStart.toISOString().split('T')[0],
        cycle_end_date: newCycleEnd.toISOString().split('T')[0],
        closing_date: newCycleEnd.toISOString().split('T')[0],
        due_date: newDueDate.toISOString().split('T')[0],
        total_spent: 0,
        total_paid: 0,
        status: 'open'
      }]);

    console.log('✅ Novo ciclo de faturamento criado automaticamente');
  } catch (error) {
    console.error('❌ Erro ao fechar ciclo:', error);
  }
}

async function addCreditCard(cardData) {
  try {
    const { data, error } = await supabase
      .from('credit_cards')
      .insert([{
        user_id: currentUser.id,
        bank_name: cardData.bankName,
        card_network: cardData.network,
        card_type: cardData.type,
        last_four_digits: cardData.lastDigits,
        holder_name: cardData.holderName,
        closing_day: cardData.closingDay,
        due_day: cardData.dueDay,
        credit_limit: cardData.limit,
        account_id: cardData.accountId,
        balance: 0,
        is_active: true
      }]);

    if (error) throw error;

    console.log('✅ Cartão adicionado');
    await loadCreditCards();
    return true;

  } catch (error) {
    console.error('❌ Erro:', error);
    alert('❌ Erro ao adicionar cartão: ' + error.message);
    return false;
  }
}

function displayCreditCards() {
  const grid = document.getElementById('creditCardsGrid');
  
  if (!grid) return;

  if (creditCards.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 60px 20px;">
        <div style="font-size: 64px; margin-bottom: 20px;">💳</div>
        <h3 style="font-size: 20px; margin-bottom: 10px; color: #1F2937;">Nenhum cartão cadastrado</h3>
        <p style="color: #6B7280; margin-bottom: 20px;">Comece adicionando seu primeiro cartão de crédito</p>
        <button class="btn btn--primary" onclick="showAddCreditCardModal()">
          ➕ Adicionar Primeiro Cartão
        </button>
      </div>
    `;
    return;
  }

  grid.innerHTML = creditCards.map(card => {
    return `
      <div class="credit-card-item" style="background: ${getCardGradient(card.card_network)};">
        <div class="card-header">
          <div class="card-info-left">
            <div class="card-bank">${card.bank_name}</div>
            <div class="card-network">${card.card_network}</div>
          </div>
          <div class="card-digits">•••• ${card.last_four_digits}</div>
        </div>

        <div class="card-footer">
          <button class="card-btn" onclick="showPayCardModal('${card.id}')">Pagar</button>
          <button class="card-btn" onclick="deleteCreditCard('${card.id}')">Deletar</button>
        </div>
      </div>
    `;
  }).join('');
}

function getCardGradient(network) {
  const gradients = {
    'Visa': 'linear-gradient(135deg, #1a56db 0%, #7e22ce 100%)',
    'Mastercard': 'linear-gradient(135deg, #eb5757 0%, #ffa500 100%)',
    'Elo': 'linear-gradient(135deg, #4b21a4 0%, #e11d48 100%)',
    'Amex': 'linear-gradient(135deg, #0066cc 0%, #00cc99 100%)',
    'Diners': 'linear-gradient(135deg, #333 0%, #666 100%)',
    'Hipercard': 'linear-gradient(135deg, #ff6600 0%, #ffcc00 100%)'
  };
  return gradients[network] || 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
}

function showAddCreditCardModal() {
  const accountSelect = document.getElementById('creditCardAccount');
  if (accountSelect) {
    accountSelect.innerHTML = accounts
      .filter(a => a.type !== 'credit_card')
      .map(a => `<option value="${a.id}">${a.name}</option>`)
      .join('');
  }

  document.getElementById('creditCardBank').value = '';
  document.getElementById('creditCardNetwork').value = 'Visa';
  document.getElementById('creditCardDigits').value = '';
  document.getElementById('creditCardHolder').value = '';
  document.getElementById('creditCardLimit').value = '';
  document.getElementById('creditCardClosingDay').value = '15';
  document.getElementById('creditCardDueDay').value = '25';
  document.getElementById('creditCardNotes').value = '';

  openModal('creditCardModal');
}

async function saveCreditCard() {
  if (!supabase || !currentUser) {
    alert('❌ Erro: Supabase não está disponível');
    return;
  }

  const data = {
    user_id: currentUser.id,
    bank_name: document.getElementById('creditCardBank').value,
    card_network: document.getElementById('creditCardNetwork').value,
    card_type: 'credit',
    last_four_digits: document.getElementById('creditCardDigits').value,
    holder_name: document.getElementById('creditCardHolder').value,
    credit_limit: parseFloat(document.getElementById('creditCardLimit').value),
    closing_day: parseInt(document.getElementById('creditCardClosingDay').value),
    due_day: parseInt(document.getElementById('creditCardDueDay').value),
    account_id: document.getElementById('creditCardAccount').value,
    notes: document.getElementById('creditCardNotes').value,
    balance: 0
  };

  try {
    const { error } = await supabase
      .from('credit_cards')
      .insert([data]);

    if (error) throw error;

    alert('✅ Cartão adicionado com sucesso!');
    closeModal('creditCardModal');
    loadCreditCards();
  } catch (error) {
    alert('❌ Erro ao salvar cartão: ' + error.message);
  }
}

function showPayCardModal(cardId) {
  const card = creditCards.find(c => c.id === cardId);
  if (!card) {
    alert('❌ Cartão não encontrado');
    return;
  }

  // Preencher informações do cartão
  document.getElementById('payCardTitle').textContent = `Pagar Fatura - ${card.bank_name}`;
  document.getElementById('payCardInfo').innerHTML = `<strong>${card.bank_name}</strong>`;

  // Preencher valor inicial
  document.getElementById('payCardAmount').value = '';
  document.getElementById('payCardAmount').disabled = false;
  
  // Preencher data
  document.getElementById('payCardDate').valueAsDate = new Date();
  
  // Preencher seletor de contas (QUALQUER conta pode pagar!)
  const fromAccountSelect = document.getElementById('payCardFromAccount');
  fromAccountSelect.innerHTML = getBankAccounts()
    .map(a => `<option value="${a.id}">${a.name} (R$ ${(a.balance || 0).toFixed(2)})</option>`)
    .join('');

  if (fromAccountSelect.options.length === 0) {
    alert('❌ Você não tem nenhuma conta disponível para pagar');
    return;
  }

  // Guardar ID do cartão no modal
  document.getElementById('payCardModal').dataset.cardId = cardId;
  
  // Abrir modal
  openModal('payCardModal');
}

function ensureStatementYearOptions(centerYear) {
  const yearSelect = document.getElementById('statementYearSelect');
  if (!yearSelect) return;

  yearSelect.innerHTML = '';
  for (let year = centerYear - 2; year <= centerYear + 2; year++) {
    const option = document.createElement('option');
    option.value = year;
    option.textContent = year;
    yearSelect.appendChild(option);
  }
}

function getStatementMonthValue() {
  const monthSelect = document.getElementById('statementMonthSelect');
  const yearSelect = document.getElementById('statementYearSelect');
  if (monthSelect && yearSelect) {
    const year = yearSelect.value;
    const month = String(monthSelect.value).padStart(2, '0');
    return year ? `${year}-${month}` : '';
  }

  return document.getElementById('statementMonth')?.value || '';
}

function setStatementMonthValue(monthValue) {
  const monthSelect = document.getElementById('statementMonthSelect');
  const yearSelect = document.getElementById('statementYearSelect');
  if (monthSelect && yearSelect && monthValue) {
    const [year, month] = monthValue.split('-');
    monthSelect.value = String(parseInt(month, 10));
    yearSelect.value = year;
    return;
  }

  const monthInput = document.getElementById('statementMonth');
  if (monthInput) monthInput.value = monthValue || '';
}

function showCardStatementModal() {
  if (!creditCards || creditCards.length === 0) {
    alert('❌ Nenhum cartão disponível');
    return;
  }

  const cardSelect = document.getElementById('statementCardId');
  const monthInput = document.getElementById('statementMonth');
  const monthSelect = document.getElementById('statementMonthSelect');
  const yearSelect = document.getElementById('statementYearSelect');
  const dueInput = document.getElementById('statementDueDate');
  const totalInput = document.getElementById('statementTotal');
  const notesInput = document.getElementById('statementNotes');

  if (!cardSelect || !dueInput || !totalInput || (!monthInput && !(monthSelect && yearSelect))) return;

  cardSelect.innerHTML = creditCards
    .filter(c => c.is_active)
    .map(c => `<option value="${c.id}">${c.bank_name} (${c.last_four_digits})</option>`)
    .join('');

  const now = new Date();
  const monthValue = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  ensureStatementYearOptions(now.getFullYear());
  setStatementMonthValue(monthValue);
  totalInput.value = '';
  if (notesInput) notesInput.value = '';

  cardSelect.onchange = updateStatementDueDate;
  if (monthSelect && yearSelect) {
    monthSelect.onchange = updateStatementDueDate;
    yearSelect.onchange = updateStatementDueDate;
  } else {
    monthInput.onchange = updateStatementDueDate;
  }

  updateStatementDueDate();
  openModal('cardStatementModal');
}

function updateStatementDueDate() {
  const cardId = document.getElementById('statementCardId')?.value;
  const monthValue = getStatementMonthValue();
  const dueInput = document.getElementById('statementDueDate');

  if (!cardId || !monthValue || !dueInput) return;

  const card = creditCards.find(c => c.id === cardId);
  if (!card || !card.due_day) return;

  const [year, month] = monthValue.split('-').map(v => parseInt(v, 10));
  const dueDate = new Date(year, month - 1, card.due_day);
  dueInput.value = dueDate.toISOString().split('T')[0];
}

function getMonthRange(monthValue) {
  const [year, month] = monthValue.split('-').map(v => parseInt(v, 10));
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0);
  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0]
  };
}

async function saveCardStatement() {
  if (!supabase || !currentUser) return;

  const cardId = document.getElementById('statementCardId')?.value;
  const monthValue = getStatementMonthValue();
  const dueDate = document.getElementById('statementDueDate')?.value || null;
  const total = parseFloat(document.getElementById('statementTotal')?.value);

  if (!cardId || !monthValue) {
    alert('❌ Selecione o cartão e o mês da fatura');
    return;
  }

  if (!total || total <= 0) {
    alert('❌ Informe um total válido');
    return;
  }

  try {
    const cycle = await ensureBillingCycleExists(cardId);
    if (!cycle) throw new Error('Ciclo não encontrado');

    const { start, end } = getMonthRange(monthValue);
    const totalPaid = cycle.total_paid || 0;
    const nextStatus = totalPaid >= total ? 'paid' : 'open';

    const updateData = {
      total_spent: total,
      cycle_start_date: start,
      cycle_end_date: end,
      closing_date: end,
      status: nextStatus
    };

    if (dueDate) updateData.due_date = dueDate;

    const { error: cycleError } = await supabase
      .from('billing_cycles')
      .update(updateData)
      .eq('id', cycle.id);

    if (cycleError) throw cycleError;

    alert('✅ Fatura registrada com sucesso!');
    closeModal('cardStatementModal');
    loadCreditCards();
    loadBillingCycles();
  } catch (error) {
    console.error('❌ Erro ao registrar fatura:', error);
    alert('❌ Erro ao registrar fatura: ' + error.message);
  }
}

// CORRIGIDA: Processar pagamento com suporte a conta diferente
async function processCardPayment() {
  if (!supabase || !currentUser) return;

  const cardId = document.getElementById('payCardModal').dataset.cardId;
  const card = creditCards.find(c => c.id === cardId);
  
  if (!card) {
    alert('❌ Cartão não encontrado');
    return;
  }

  const amount = parseFloat(document.getElementById('payCardAmount').value);
  const date = document.getElementById('payCardDate').value;
  const fromAccountId = document.getElementById('payCardFromAccount').value;
  const fromAccount = accounts.find(a => a.id === fromAccountId);

  // ✅ VALIDAÇÕES
  if (!amount || amount <= 0) {
    alert('❌ Valor inválido');
    return;
  }

  if (!fromAccount) {
    alert('❌ Conta de origem não encontrada');
    return;
  }

  if (fromAccount.balance < amount) {
    alert(`❌ Saldo insuficiente. Disponível: R$ ${fromAccount.balance.toFixed(2)}`);
    return;
  }

  try {
    const paymentCategory = await ensureExpenseCategory('Pagamento de Fatura');
    if (!paymentCategory) {
      alert('❌ Não foi possível obter a categoria de pagamento da fatura.');
      return;
    }

    // PASSO 1: Procurar ou criar billing_cycle
    const { data: billingCycles, error: cycleError } = await supabase
      .from('billing_cycles')
      .select('*')
      .eq('credit_card_id', cardId)
      .eq('status', 'open')
      .order('cycle_end_date', { ascending: false })
      .limit(1);

    if (cycleError) throw cycleError;

    let cycleId = null;
    let currentCycle = null;
    
    if (billingCycles && billingCycles.length > 0) {
      cycleId = billingCycles[0].id;
      currentCycle = billingCycles[0];
    } else {
      // Se não houver ciclo aberto, criar um
      const newCycle = await ensureBillingCycleExists(cardId);
      if (newCycle) {
        cycleId = newCycle.id;
        currentCycle = newCycle;
      }
    }

    // PASSO 2: Criar transação de despesa do pagamento
    const { data: paymentTransaction, error: transError } = await supabase
      .from('transactions')
      .insert([{
        user_id: currentUser.id,
        account_id: fromAccountId,  // ← Conta que vai SAIR o dinheiro
        type: 'expense',
        category_id: paymentCategory.id,
        amount: amount,
        date: date,
        description: `Pagamento da fatura de ${card.bank_name}`
      }])
      .select()
      .single();

    if (transError) throw transError;

    // PASSO 3: Registrar em card_payments
    const { error: paymentError } = await supabase
      .from('card_payments')
      .insert([{
        user_id: currentUser.id,
        credit_card_id: cardId,
        billing_cycle_id: cycleId,
        account_id: fromAccountId,  // ← Conta de origem do pagamento
        amount: amount,
        payment_date: date,
        payment_method: 'transferencia_bancaria',
        description: `Pagamento da fatura de ${card.bank_name} via ${fromAccount.name}`,
        status: 'paid',
        transaction_id: paymentTransaction.id
      }]);

    if (paymentError) throw paymentError;

    // PASSO 4: Atualizar saldo da conta de ORIGEM (reduzir)
    const newFromBalance = fromAccount.balance - amount;
    await supabase
      .from('accounts')
      .update({ balance: newFromBalance })
      .eq('id', fromAccountId);

    // PASSO 6: Atualizar billing_cycle
    if (cycleId && currentCycle) {
      const newTotalPaid = (currentCycle.total_paid || 0) + amount;
      const totalSpent = currentCycle.total_spent || 0;
      const newStatus = totalSpent > 0 && newTotalPaid >= totalSpent ? 'paid' : 'partial_payment';

      await supabase
        .from('billing_cycles')
        .update({
          total_paid: newTotalPaid,
          status: newStatus
        })
        .eq('id', cycleId);

      // PASSO 7: Se pagou tudo, fechar ciclo e criar novo
      if (totalSpent > 0 && newTotalPaid >= totalSpent) {
        await closeBillingCycleAndCreateNew(cardId);
        alert('✅ Fatura paga completamente! Um novo ciclo foi criado automaticamente.');
      } else {
        alert('✅ Pagamento registrado!');
      }
    }

    // Fechar modal e recarregar dados
    closeModal('payCardModal');
    loadCreditCards();
    loadAccounts();
    loadTransactions();
    loadBillingCycles();
    displayCreditCards();
    displayAccounts();
    displayTransactions();

  } catch (error) {
    console.error('❌ Erro completo:', error);
    alert('❌ Erro ao processar pagamento:\n' + error.message);
  }
}

async function recalculateCardBalancesFromCycles() {
  return;
}

function showClearCardItemizations() {
  const cardExpenses = transactions.filter(t => t.type === 'expense' && t.credit_card_id);

  if (cardExpenses.length === 0) {
    alert('✅ Nenhuma compra itemizada encontrada.');
    return;
  }

  const total = cardExpenses.reduce((sum, t) => sum + t.amount, 0);
  const confirmText = prompt(
    `Isso vai excluir ${cardExpenses.length} compras de cartao (R$ ${total.toFixed(2)}).\n` +
    'Digite APAGAR para confirmar:'
  );

  if (confirmText !== 'APAGAR') {
    alert('Operacao cancelada.');
    return;
  }

  clearCardItemizedTransactions(cardExpenses.map(t => t.id));
}

async function clearCardItemizedTransactions(ids) {
  if (!supabase || !currentUser) return;

  try {
    const chunkSize = 100;
    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunk = ids.slice(i, i + chunkSize);
      const { error } = await supabase
        .from('transactions')
        .delete()
        .in('id', chunk)
        .eq('user_id', currentUser.id);

      if (error) throw error;
    }

    await loadTransactions();
    await loadCreditCards();
    updateDashboard();

    alert('✅ Compras itemizadas removidas com sucesso.');
  } catch (error) {
    console.error('❌ Erro ao remover compras:', error);
    alert('❌ Erro ao remover compras: ' + error.message);
  }
}

async function deleteCreditCard(cardId) {
  if (!confirm('Tem certeza que deseja deletar este cartão?')) return;

  try {
    const { error } = await supabase
      .from('credit_cards')
      .delete()
      .eq('id', cardId);

    if (error) throw error;

    alert('✅ Cartão deletado!');
    loadCreditCards();
  } catch (error) {
    alert('❌ Erro ao deletar: ' + error.message);
  }
}

function showAddCardForm() {
  // Criar um formulário simples
  const form = `
    <div class="modal-overlay" onclick="closeForm()">
      <div class="modal-content">
        <h3>Adicionar Cartão de Crédito</h3>
        
        <div class="form-group">
          <label>Banco:</label>
          <input type="text" id="cardBank" placeholder="Ex: Itaú">
        </div>

        <div class="form-group">
          <label>Rede (Visa, Mastercard, etc):</label>
          <input type="text" id="cardNetwork" placeholder="Visa">
        </div>

        <div class="form-group">
          <label>Últimos 4 dígitos:</label>
          <input type="text" id="cardDigits" placeholder="1234" maxlength="4">
        </div>

        <div class="form-group">
          <label>Titular:</label>
          <input type="text" id="cardHolder" placeholder="Seu Nome">
        </div>

        <div class="form-group">
          <label>Dia do Fechamento:</label>
          <input type="number" id="cardClosing" min="1" max="31" placeholder="10">
        </div>

        <div class="form-group">
          <label>Dia do Vencimento:</label>
          <input type="number" id="cardDue" min="1" max="31" placeholder="20">
        </div>

        <div class="form-group">
          <label>Limite de Crédito:</label>
          <input type="number" id="cardLimit" step="0.01" placeholder="5000">
        </div>

        <div class="form-group">
          <label>Conta Associada:</label>
          <select id="cardAccount">
            <option value="">Selecionar</option>
          </select>
        </div>

        <button onclick="saveCard()" class="btn-primary">Adicionar</button>
      </div>
    </div>
  `;

  // Inserir no body
  const container = document.createElement('div');
  container.id = 'cardFormModal';
  container.innerHTML = form;
  document.body.appendChild(container);

  // Preencher seletor de contas
  const select = document.getElementById('cardAccount');
  accounts.forEach(acc => {
    const option = document.createElement('option');
    option.value = acc.id;
    option.textContent = acc.name;
    select.appendChild(option);
  });
}

function closeForm() {
  const modal = document.getElementById('cardFormModal');
  if (modal) modal.remove();
}

function saveCard() {
  const cardData = {
    bankName: document.getElementById('cardBank').value,
    network: document.getElementById('cardNetwork').value,
    type: 'Crédito',
    lastDigits: document.getElementById('cardDigits').value,
    holderName: document.getElementById('cardHolder').value,
    closingDay: parseInt(document.getElementById('cardClosing').value),
    dueDay: parseInt(document.getElementById('cardDue').value),
    limit: parseFloat(document.getElementById('cardLimit').value),
    accountId: document.getElementById('cardAccount').value
  };

  if (!cardData.bankName || !cardData.lastDigits || !cardData.accountId) {
    alert('⚠️ Preencha todos os campos obrigatórios');
    return;
  }

  addCreditCard(cardData).then(success => {
    if (success) {
      closeForm();
      alert('✅ Cartão adicionado com sucesso!');
    }
  });
}



// ============================================
// CONTAS
// ============================================

async function loadAccounts() {
  if (!supabase || !currentUser) return;

  try {
    const { data, error } = await supabase
      .from('accounts')
      .select('*')
      .eq('user_id', currentUser.id)
      .order('created_at', { ascending: true });

    if (error) throw error;
    accounts = data || [];
    console.log('✅ Contas carregadas:', accounts.length);
    updateAccountSelects();
    displayAccounts();
  } catch (error) {
    console.error('❌ Erro ao carregar contas:', error);
  }
}

function updateAccountSelects(type = 'expense', accountType = 'bank_account') {
  let selectElement = null;
  
  // Selecionar o campo correto
  if (type === 'expense' && accountType === 'credit_card') {
    selectElement = document.getElementById('transactionCreditCard');
  } else {
    selectElement = document.getElementById('transactionBankAccount') || 
                    document.getElementById('transactionAccount');
  }
  
  if (!selectElement) {
    console.warn('⚠️ Select element not found:', selectElement);
    return;
  }

  let filteredAccounts = accounts;
  
  // Filtrar apenas contas normais (não cartões)
  if (type === 'transfer' || type === 'income' || (type === 'expense' && accountType === 'bank_account')) {
    filteredAccounts = getBankAccounts();
  }

  // Preencher com contas
  selectElement.innerHTML = filteredAccounts
    .map(a => `<option value="${a.id}">${a.name} (R$ ${(a.balance || 0).toFixed(2)})</option>`)
    .join('');

  // Se é seletor de cartão, popular com cartões
  if (type === 'expense' && accountType === 'credit_card') {
    const cardSelect = document.getElementById('transactionCreditCard');
    if (cardSelect) {
      cardSelect.innerHTML = creditCards
        .filter(c => c.is_active)
        .map(c => `<option value="${c.id}">${c.bank_name} (${c.last_four_digits}) - R$ ${(c.balance || 0).toFixed(2)}</option>`)
        .join('');
    }
  }
}

function isCardLikeAccount(account) {
  const typeValue = (account?.type || '').toString().toLowerCase();
  return typeValue.includes('credit') || typeValue.includes('card');
}

function getBankAccounts() {
  return accounts.filter(account => !isCardLikeAccount(account));
}

function displayAccounts() {
  const list = document.getElementById('accountsList');
  if (!list) return;

  list.innerHTML = accounts.map(account => `
    <div class="account-card">
      <div class="account-header">
        <h3>${account.name}</h3>
        <span class="account-type">${account.type}</span>
      </div>
      <div class="account-balance">
        <span class="balance-label">Saldo</span>
        <span class="balance-value">R$ ${parseFloat(account.balance).toFixed(2)}</span>
      </div>
      <div class="account-actions">
        <button class="btn btn--sm btn--outline" onclick="editAccount('${account.id}')">Editar</button>
        <button class="btn btn--sm btn--outline" onclick="deleteAccount('${account.id}')">Deletar</button>
      </div>
    </div>
  `).join('');
}

function showAddAccountModal() {
  document.getElementById('accountName').value = '';
  document.getElementById('accountBalance').value = '0';
  document.getElementById('accountType').value = 'checking';
  openModal('accountModal');
}

async function saveAccount() {
  if (!supabase || !currentUser) return;

  const data = {
    user_id: currentUser.id,
    name: document.getElementById('accountName').value,
    type: document.getElementById('accountType').value,
    balance: parseFloat(document.getElementById('accountBalance').value)
  };

  try {
    const { error } = await supabase
      .from('accounts')
      .insert([data]);

    if (error) throw error;

    alert('✅ Conta criada com sucesso!');
    closeModal('accountModal');
    loadAccounts();
  } catch (error) {
    alert('❌ Erro ao salvar conta: ' + error.message);
  }
}

async function deleteAccount(accountId) {
  if (!confirm('Tem certeza?')) return;

  try {
    const { error } = await supabase
      .from('accounts')
      .delete()
      .eq('id', accountId);

    if (error) throw error;
    loadAccounts();
  } catch (error) {
    alert('❌ Erro ao deletar: ' + error.message);
  }
}

// ============================================
// CATEGORIAS
// ============================================

async function loadCategories() {
  if (!supabase || !currentUser) return;

  try {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('user_id', currentUser.id)
      .order('name');

    if (error) throw error;
    categories = data || [];
    console.log('✅ Categorias carregadas:', categories.length);
    updateCategorySelects();
    displayCategories();
  } catch (error) {
    console.error('❌ Erro ao carregar categorias:', error);
  }
}

function updateCategorySelects() {
  const select = document.getElementById('transactionCategory');
  if (select) {
    const type = document.getElementById('transactionType').value;
    const filtered = categories.filter(c => c.type === type);
    select.innerHTML = filtered.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  }
}

function displayCategories() {
  const list = document.getElementById('categoriesList');
  if (!list) return;

  const expenses = categories.filter(c => c.type === 'expense');
  const incomes = categories.filter(c => c.type === 'income');

  let html = '<h3>Despesas</h3>';
  html += expenses.map(cat => `
    <div class="category-item">
      <div style="display: flex; align-items: center; gap: 10px;">
        <div class="category-color" style="background-color: ${cat.color}; width: 20px; height: 20px; border-radius: 4px;"></div>
        <div>
          <div style="font-weight: bold;">${cat.name}</div>
          <div style="font-size: 12px; color: #666;">${cat.primary_allocation || ''} → ${cat.secondary_allocation || ''}</div>
        </div>
      </div>
      <button class="btn btn--sm btn--outline" onclick="deleteCategory('${cat.id}')">Deletar</button>
    </div>
  `).join('');

  html += '<h3 style="margin-top: 20px;">Receitas</h3>';
  html += incomes.map(cat => `
    <div class="category-item">
      <div style="display: flex; align-items: center; gap: 10px;">
        <div class="category-color" style="background-color: ${cat.color}; width: 20px; height: 20px; border-radius: 4px;"></div>
        <div>
          <div style="font-weight: bold;">${cat.name}</div>
          <div style="font-size: 12px; color: #666;">${cat.primary_allocation || ''}</div>
        </div>
      </div>
      <button class="btn btn--sm btn--outline" onclick="deleteCategory('${cat.id}')">Deletar</button>
    </div>
  `).join('');

  list.innerHTML = html;
}

function showAddCategoryModal() {
  document.getElementById('categoryName').value = '';
  document.getElementById('categoryType').value = 'expense';
  document.getElementById('categoryPrimary').value = '';
  document.getElementById('categorySecondary').value = '';
  document.getElementById('categoryColor').value = '#3B82F6';
  openModal('categoryModal');
}

async function saveCategory() {
  if (!supabase || !currentUser) return;

  const data = {
    user_id: currentUser.id,
    name: document.getElementById('categoryName').value,
    type: document.getElementById('categoryType').value,
    primary_allocation: document.getElementById('categoryPrimary').value,
    secondary_allocation: document.getElementById('categorySecondary').value,
    color: document.getElementById('categoryColor').value
  };

  try {
    const { error } = await supabase
      .from('categories')
      .insert([data]);

    if (error) throw error;

    alert('✅ Categoria criada com sucesso!');
    closeModal('categoryModal');
    loadCategories();
  } catch (error) {
    alert('❌ Erro ao salvar categoria: ' + error.message);
  }
}

async function deleteCategory(categoryId) {
  if (!confirm('Tem certeza?')) return;

  try {
    const { error } = await supabase
      .from('categories')
      .delete()
      .eq('id', categoryId);

    if (error) throw error;
    loadCategories();
  } catch (error) {
    alert('❌ Erro ao deletar: ' + error.message);
  }
}

async function ensureExpenseCategory(name) {
  const existing = categories.find(c => c.name.toLowerCase() === name.toLowerCase());
  if (existing) return existing;

  try {
    const payload = {
      user_id: currentUser.id,
      name: name,
      type: 'expense',
      primary_allocation: 'cartao',
      secondary_allocation: null,
      color: '#F59E0B'
    };

    const { data, error } = await supabase
      .from('categories')
      .insert([payload])
      .select()
      .single();

    if (error) throw error;

    categories.push(data);
    return data;
  } catch (error) {
    console.error('❌ Erro ao criar categoria:', error);
    return null;
  }
}

// ============================================
// TRANSAÇÕES
// ============================================

async function loadTransactions() {
  if (!supabase || !currentUser) return;

  try {
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', currentUser.id)
      .order('date', { ascending: false });

    if (error) throw error;
    transactions = data || [];
    console.log('✅ Transações carregadas:', transactions.length);
    filterTransactions();
  } catch (error) {
    console.error('❌ Erro ao carregar transações:', error);
  }
}

async function recalculateAccountBalances() {
  if (!supabase || !currentUser) return;

  console.log('🔄 Recalculando saldos das contas...');

  for (const account of accounts) {
    // Buscar todas as transações da conta
    const { data: trans, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('account_id', account.id);

    if (error) {
      console.error(`Erro ao buscar transações da conta ${account.name}:`, error);
      continue;
    }

    // Calcular saldo baseado nas transações
    let balance = 0;
    
    trans.forEach(t => {
      if (t.type === 'expense' && t.credit_card_id) {
        return;
      }

      if (t.type === 'income') {
        balance += t.amount;
      } else if (t.type === 'expense') {
        balance -= t.amount;
      } else if (t.type === 'transfer') {
        // Se é origem da transferência, deduz
        balance -= t.amount;
      }
    });

    // Somar transferências recebidas (onde esta conta é destino)
    const { data: receivedTransfers } = await supabase
      .from('transactions')
      .select('*')
      .eq('transfer_to_account_id', account.id)
      .eq('type', 'transfer');

    receivedTransfers?.forEach(t => {
      balance += t.amount;
    });

    // Atualizar no Supabase
    const { error: updateError } = await supabase
      .from('accounts')
      .update({ balance: balance })
      .eq('id', account.id);

    if (updateError) {
      console.error(`Erro ao atualizar saldo da conta ${account.name}:`, updateError);
    } else {
      console.log(`✅ Conta ${account.name}: R$ ${balance.toFixed(2)}`);
    }
  }

  // Recarregar contas
  await loadAccounts();
  console.log('✅ Saldos recalculados!');
}



function updateTransactionForm() {
  const type = document.getElementById('transactionType').value;
  
  // Referências aos elementos
  const categoryGroup = document.getElementById('categoryGroup');
  const transferToGroup = document.getElementById('transferToGroup');
  const bankAccountGroup = document.getElementById('bankAccountGroup');
  const creditCardGroup = document.getElementById('creditCardGroup');
  const installmentGroup = document.getElementById('installmentGroup');

  // Resetar visibilidade
  if (transferToGroup) transferToGroup.style.display = 'none';
  if (installmentGroup) installmentGroup.style.display = 'none';

  // ===== TRANSFERÊNCIA =====
  if (type === 'transfer') {
    if (categoryGroup) categoryGroup.style.display = 'none';
    if (transferToGroup) transferToGroup.style.display = 'block';
    if (bankAccountGroup) bankAccountGroup.style.display = 'block';
    if (creditCardGroup) creditCardGroup.style.display = 'none';
    updateAccountSelects('transfer');
  }
  // ===== RECEITA =====
  else if (type === 'income') {
    if (categoryGroup) categoryGroup.style.display = 'block';
    if (bankAccountGroup) bankAccountGroup.style.display = 'block';
    if (creditCardGroup) creditCardGroup.style.display = 'none';
    if (installmentGroup) installmentGroup.style.display = 'none';
    updateAccountSelects('income');
    updateCategorySelects('income');
  }
  // ===== DESPESA =====
  else if (type === 'expense') {
    if (categoryGroup) categoryGroup.style.display = 'block';
    if (bankAccountGroup) bankAccountGroup.style.display = 'block';
    if (creditCardGroup) creditCardGroup.style.display = 'none';
    if (installmentGroup) installmentGroup.style.display = 'none';
    updateAccountSelects('expense', 'bank_account');
    updateCategorySelects('expense');
  }
}

function updateInstallmentFields() {
  const useInstallment = document.querySelector('input[name="useInstallment"]:checked')?.value === 'yes';
  const countGroup = document.getElementById('installmentCountGroup');
  const previewGroup = document.getElementById('installmentPreviewGroup');
  
  if (useInstallment) {
    if (countGroup) countGroup.style.display = 'block';
    if (previewGroup) previewGroup.style.display = 'block';
    updateInstallmentPreview();
  } else {
    if (countGroup) countGroup.style.display = 'none';
    if (previewGroup) previewGroup.style.display = 'none';
  }
}

// NOVO: Calcular preview de parcelas
function updateInstallmentPreview() {
  const amount = parseFloat(document.getElementById('transactionAmount').value) || 0;
  const installmentCount = parseInt(document.getElementById('installmentCount').value) || 1;
  const previewValue = document.getElementById('installmentPreviewValue');
  
  if (previewValue && amount > 0) {
    const perInstallment = amount / installmentCount;
    previewValue.textContent = `R$ ${perInstallment.toFixed(2)}`;
  }
}

// NOVO: Atualizar campo de pagamento
function updatePaymentFields() {
  const paymentType = document.getElementById('payCardPaymentType').value;
  const cardId = document.getElementById('payCardModal').dataset.cardId;
  const card = creditCards.find(c => c.id === cardId);
  const amountInput = document.getElementById('payCardAmount');
  
  if (!card) return;
  
  if (paymentType === 'full') {
    amountInput.value = (card.balance || 0).toFixed(2);
    amountInput.disabled = true;
  } else if (paymentType === 'minimum') {
    amountInput.value = ((card.balance || 0) * 0.1).toFixed(2);
    amountInput.disabled = true;
  } else {
    amountInput.disabled = false;
    amountInput.value = '';
  }
  
  updateInstallmentPreview();
}

function filterTransactions() {
  const typeFilter = document.getElementById('transactionTypeFilter')?.value || 'all';
  const accountFilter = document.getElementById('transactionAccountFilter')?.value || 'all';
  const categoryFilter = document.getElementById('filterCategory')?.value || 'all';
  
  let filtered = [...transactions];
  
  // Filtro por tipo
  if (typeFilter !== 'all') {
    filtered = filtered.filter(t => t.type === typeFilter);
  }
  
  // Filtro por conta
  if (accountFilter !== 'all') {
    filtered = filtered.filter(t => t.account_id === accountFilter);
  }
  
  // Filtro por categoria
  if (categoryFilter !== 'all') {
    filtered = filtered.filter(t => t.category_id === categoryFilter);
  }
  
  // Filtro por data inicial
  if (filterDateStart) {
    filtered = filtered.filter(t => {
      const transDate = new Date(t.date);
      const startDate = new Date(filterDateStart);
      return transDate >= startDate;
    });
  }
  
  // Filtro por data final
  if (filterDateEnd) {
    filtered = filtered.filter(t => {
      const transDate = new Date(t.date);
      const endDate = new Date(filterDateEnd);
      endDate.setHours(23, 59, 59, 999);
      return transDate <= endDate;
    });
  }
  
  // Ordenar por data decrescente
  filtered.sort((a, b) => new Date(b.date) - new Date(a.date));
  
  // Exibir
  displayTransactions(filtered);
  updateTransactionTotals(filtered);
  
  console.log(`✅ Filtrados: ${filtered.length} transações`);
}

function displayTransactions(transList) {
  const list = document.getElementById('transactionsList');
  if (!list) return;

  list.innerHTML = transList.map(trans => {
    const account = accounts.find(a => a.id === trans.account_id);
    const category = categories.find(c => c.id === trans.category_id);
    
    let typeLabel = trans.type === 'expense' ? '↓ Despesa' : trans.type === 'income' ? '↑ Receita' : '⇄ Transferência';
    let typeColor = trans.type === 'expense' ? '#ef4444' : trans.type === 'income' ? '#10b981' : '#06b6d4';

    return `
      <div class="transaction-item" id="trans-${trans.id}">
        <div style="display: flex; align-items: center; gap: 12px; flex: 1;">
          <div style="width: 8px; height: 8px; border-radius: 50%; background-color: ${typeColor};"></div>
          <div style="flex: 1;">
            <div style="font-weight: bold;">${trans.description}</div>
            <div style="font-size: 12px; color: #666;">${new Date(trans.date).toLocaleDateString('pt-BR')} • ${account?.name || 'Conta'} • ${category?.name || 'Outra'}</div>
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <div style="text-align: right;">
            <div style="font-weight: bold; color: ${typeColor};">
              ${trans.type === 'expense' ? '-' : trans.type === 'income' ? '+' : ''} R$ ${trans.amount.toFixed(2)}
            </div>
            <div style="font-size: 12px; color: #999;">${typeLabel}</div>
          </div>
          <div style="display: flex; gap: 6px; margin-left: 12px;">
            <button class="btn-transaction" onclick="editTransaction('${trans.id}')" title="Editar">
              ✏️
            </button>
            <button class="btn-transaction btn-danger" onclick="deleteTransaction('${trans.id}')" title="Deletar">
              🗑️
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}
function updateTransactionTotals(transactionsList) {
  const income = transactionsList.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
  const expense = transactionsList.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
  const balance = income - expense;

  const incomeEl = document.getElementById('totalIncome');
  const expenseEl = document.getElementById('totalExpense');
  const balanceEl = document.getElementById('totalBalance');

  if (incomeEl) incomeEl.textContent = `R$ ${income.toFixed(2)}`;
  if (expenseEl) expenseEl.textContent = `R$ ${expense.toFixed(2)}`;
  if (balanceEl) balanceEl.textContent = `R$ ${balance.toFixed(2)}`;
}

function showAddTransactionModal() {
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('transactionDate').value = today;
  document.getElementById('transactionAmount').value = '';
  document.getElementById('transactionDescription').value = '';
  document.getElementById('transactionType').value = 'expense';
  updateTransactionForm();
  openModal('transactionModal');
}

async function saveTransaction() {
  if (!supabase || !currentUser) return;

  const type = document.getElementById('transactionType').value;
  const accountType = document.querySelector('input[name="accountType"]:checked')?.value || 'bank_account';
  const amount = parseFloat(document.getElementById('transactionAmount').value);
  const description = document.getElementById('transactionDescription').value;
  const date = document.getElementById('transactionDate').value;
  const categoryId = document.getElementById('transactionCategory').value;

  if (!amount || amount <= 0) {
    alert('❌ Insira um valor válido');
    return;
  }

  if (!description.trim()) {
    alert('❌ Insira uma descrição');
    return;
  }

  try {
    let accountId = null;
    let creditCardId = null;
    let useInstallment = false;
    let installmentCount = 1;

    if (type === 'expense' && accountType === 'credit_card' && CARD_MODE === 'statement-only') {
      alert('⚠️ Modo fatura total ativo. Use "Registrar Fatura" na aba Cartões.');
      return;
    }

    // ============================================
    // CASO 1: DESPESA EM CARTÃO DE CRÉDITO
    // ============================================
    if (type === 'expense' && accountType === 'credit_card') {
      creditCardId = document.getElementById('transactionCreditCard').value;
      useInstallment = document.querySelector('input[name="useInstallment"]:checked')?.value === 'yes';
      
      if (useInstallment) {
        installmentCount = parseInt(document.getElementById('installmentCount').value) || 1;
      }

      const card = creditCards.find(c => c.id === creditCardId);
      if (!card) {
        alert('❌ Cartão não encontrado');
        return;
      }

      accountId = card.account_id; // Usar conta vinculada ao cartão
      
      // Garantir que existe billing cycle aberto
      const cycle = await ensureBillingCycleExists(creditCardId);
      if (!cycle) {
        alert('❌ Erro ao criar ciclo de faturamento');
        return;
      }

      // ===== PARCELADO =====
      if (useInstallment && installmentCount > 1) {
        const installmentAmount = amount / installmentCount;
        
        // 1. Criar transação principal
        const { data: mainTransaction, error: mainError } = await supabase
          .from('transactions')
          .insert([{
            user_id: currentUser.id,
            account_id: accountId,
            credit_card_id: creditCardId,
            category_id: categoryId,
            type: 'expense',
            amount: amount,
            description: `${description} (${installmentCount}x)`,
            date: date
          }])
          .select()
          .single();

        if (mainError) throw mainError;

        // 2. Criar registro de parcelas
        for (let i = 1; i <= installmentCount; i++) {
          const installmentDate = new Date(date);
          installmentDate.setMonth(installmentDate.getMonth() + (i - 1));

          const { error: installError } = await supabase
            .from('installments')
            .insert([{
              user_id: currentUser.id,
              credit_card_id: creditCardId,
              transaction_id: mainTransaction.id,
              total_installments: installmentCount,
              current_installment: i,
              total_amount: amount,
              installment_amount: installmentAmount,
              installment_date: installmentDate.toISOString().split('T')[0],
              status: i === 1 ? 'pending' : 'scheduled'
            }]);

          if (installError) throw installError;
        }

        // 3. Atualizar billing cycle com total gasto
        await supabase
          .from('billing_cycles')
          .update({
            total_spent: (cycle.total_spent || 0) + amount
          })
          .eq('id', cycle.id);

        alert(`✅ Compra parcelada em ${installmentCount}x de R$ ${installmentAmount.toFixed(2)} criada!`);
      }
      
      // ===== À VISTA =====
      else {
        const { error: transError } = await supabase
          .from('transactions')
          .insert([{
            user_id: currentUser.id,
            account_id: accountId,
            credit_card_id: creditCardId,
            category_id: categoryId,
            type: 'expense',
            amount: amount,
            description: description,
            date: date
          }]);

        if (transError) throw transError;

        // Atualizar billing cycle
        await supabase
          .from('billing_cycles')
          .update({
            total_spent: (cycle.total_spent || 0) + amount
          })
          .eq('id', cycle.id);

        alert('✅ Gasto em cartão registrado!');
      }
    }

    // ============================================
    // CASO 2: DESPESA EM CONTA NORMAL
    // ============================================
    else if (type === 'expense' && accountType === 'bank_account') {
      accountId = document.getElementById('transactionBankAccount').value;

      const { error: transError } = await supabase
        .from('transactions')
        .insert([{
          user_id: currentUser.id,
          account_id: accountId,
          category_id: categoryId,
          type: 'expense',
          amount: amount,
          description: description,
          date: date
        }]);

      if (transError) throw transError;

      // Atualizar saldo da conta
      const account = accounts.find(a => a.id === accountId);
      if (account) {
        await supabase
          .from('accounts')
          .update({ balance: account.balance - amount })
          .eq('id', accountId);
      }

      alert('✅ Despesa registrada!');
    }

    // ============================================
    // CASO 3: RECEITA
    // ============================================
    else if (type === 'income') {
      accountId = document.getElementById('transactionBankAccount').value;

      const { error: transError } = await supabase
        .from('transactions')
        .insert([{
          user_id: currentUser.id,
          account_id: accountId,
          category_id: categoryId,
          type: 'income',
          amount: amount,
          description: description,
          date: date
        }]);

      if (transError) throw transError;

      // Atualizar saldo da conta
      const account = accounts.find(a => a.id === accountId);
      if (account) {
        await supabase
          .from('accounts')
          .update({ balance: account.balance + amount })
          .eq('id', accountId);
      }

      alert('✅ Receita registrada!');
    }

    // ============================================
    // CASO 4: TRANSFERÊNCIA
    // ============================================
    else if (type === 'transfer') {
      accountId = document.getElementById('transactionBankAccount').value;
      const transferToId = document.getElementById('transactionTransferTo').value;

      const { error: transError } = await supabase
        .from('transactions')
        .insert([{
          user_id: currentUser.id,
          account_id: accountId,
          type: 'transfer',
          amount: amount,
          description: description,
          date: date,
          transfer_to_account_id: transferToId
        }]);

      if (transError) throw transError;

      // Atualizar ambas as contas
      const fromAccount = accounts.find(a => a.id === accountId);
      const toAccount = accounts.find(a => a.id === transferToId);

      if (fromAccount) {
        await supabase
          .from('accounts')
          .update({ balance: fromAccount.balance - amount })
          .eq('id', accountId);
      }

      if (toAccount) {
        await supabase
          .from('accounts')
          .update({ balance: toAccount.balance + amount })
          .eq('id', transferToId);
      }

      alert('✅ Transferência realizada!');
    }

    // Fechamento bem-sucedido
    closeModal('transactionModal');
    loadTransactions();
    loadAccounts();
    loadCreditCards();
    loadBillingCycles();

  } catch (error) {
    alert('❌ Erro: ' + error.message);
    console.error('Erro completo:', error);
  }
}

// ============================================
// INVESTIMENTOS
// ============================================

async function loadInvestments() {
  if (!supabase || !currentUser) return;

  try {
    const { data, error } = await supabase
      .from('investments')
      .select('*')
      .eq('user_id', currentUser.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    investments = data || [];
    console.log('✅ Investimentos carregados:', investments.length);
    filterInvestments();
  } catch (error) {
    console.error('❌ Erro ao carregar investimentos:', error);
  }
}

function filterInvestments() {
  const typeFilter = document.getElementById('investmentTypeFilter')?.value || 'all';
  let filtered = investments;

  if (typeFilter !== 'all') {
    filtered = filtered.filter(i => i.type === typeFilter);
  }

  displayInvestments(filtered);
  updateInvestmentsSummary(filtered);
}

function displayInvestments(invList) {
  const list = document.getElementById('investmentsList');
  if (!list) return;

  list.innerHTML = invList.map(inv => {
    const returnAmount = inv.current_value - inv.initial_amount;
    const returnPercent = ((returnAmount / inv.initial_amount) * 100).toFixed(2);
    const returnColor = returnAmount >= 0 ? '#10b981' : '#ef4444';

    return `
      <div class="investment-card">
        <div class="investment-header">
          <h3>${inv.name}</h3>
          <span class="investment-type">${inv.type}</span>
        </div>
        <div class="investment-values">
          <div class="inv-value-row">
            <span>Investido:</span>
            <strong>R$ ${inv.initial_amount.toFixed(2)}</strong>
          </div>
          <div class="inv-value-row">
            <span>Valor Atual:</span>
            <strong>R$ ${inv.current_value.toFixed(2)}</strong>
          </div>
          <div class="inv-value-row" style="color: ${returnColor};">
            <span>Retorno:</span>
            <strong>R$ ${returnAmount.toFixed(2)} (${returnPercent}%)</strong>
          </div>
        </div>
        <div class="investment-footer">
          <button class="btn btn--sm btn--primary" onclick="showInvestmentDetail('${inv.id}')">Detalhes</button>
          <button class="btn btn--sm btn--outline" onclick="deleteInvestment('${inv.id}')">Deletar</button>
        </div>
      </div>
    `;
  }).join('');
}

function updateInvestmentsSummary(invList) {
  const totalInvested = invList.reduce((sum, i) => sum + i.initial_amount, 0);
  const totalCurrent = invList.reduce((sum, i) => sum + i.current_value, 0);
  const totalReturn = totalCurrent - totalInvested;
  const returnPercent = totalInvested > 0 ? ((totalReturn / totalInvested) * 100).toFixed(2) : 0;

  const invInvEl = document.getElementById('invTotalInvested');
  const invCurEl = document.getElementById('invCurrentValue');
  const invRetEl = document.getElementById('invTotalReturn');
  const invPerEl = document.getElementById('invReturnPercent');

  if (invInvEl) invInvEl.textContent = `R$ ${totalInvested.toFixed(2)}`;
  if (invCurEl) invCurEl.textContent = `R$ ${totalCurrent.toFixed(2)}`;
  if (invRetEl) invRetEl.textContent = `R$ ${totalReturn.toFixed(2)}`;
  if (invPerEl) invPerEl.textContent = `${returnPercent}%`;
}

function showAddInvestmentModal() {
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('investmentPurchaseDate').value = today;
  document.getElementById('investmentName').value = '';
  document.getElementById('investmentInitialAmount').value = '';
  document.getElementById('investmentCurrentValue').value = '';
  
  const accountSelect = document.getElementById('investmentAccount');
  if (accountSelect) {
    accountSelect.innerHTML = accounts
      .filter(a => a.type !== 'credit_card')
      .map(a => `<option value="${a.id}">${a.name}</option>`)
      .join('');
  }

  openModal('investmentModal');
}

async function saveInvestment() {
  if (!supabase || !currentUser) return;

  const data = {
    user_id: currentUser.id,
    name: document.getElementById('investmentName').value,
    type: document.getElementById('investmentType').value,
    institution: document.getElementById('investmentInstitution').value,
    initial_amount: parseFloat(document.getElementById('investmentInitialAmount').value),
    current_value: parseFloat(document.getElementById('investmentCurrentValue').value),
    purchase_date: document.getElementById('investmentPurchaseDate').value,
    maturity_date: document.getElementById('investmentMaturityDate').value || null,
    notes: document.getElementById('investmentNotes').value
  };

  try {
    const { error } = await supabase
      .from('investments')
      .insert([data]);

    if (error) throw error;

    alert('✅ Investimento criado com sucesso!');
    closeModal('investmentModal');
    loadInvestments();
  } catch (error) {
    alert('❌ Erro ao salvar investimento: ' + error.message);
  }
}

function showInvestmentDetail(investmentId) {
  const inv = investments.find(i => i.id === investmentId);
  if (!inv) return;

  const returnAmount = inv.current_value - inv.initial_amount;
  const returnPercent = ((returnAmount / inv.initial_amount) * 100).toFixed(2);

  document.getElementById('invDetailName').textContent = inv.name;
  document.getElementById('invDetailType').textContent = inv.type;
  document.getElementById('invDetailInstitution').textContent = inv.institution;
  document.getElementById('invDetailTotalInvested').textContent = `R$ ${inv.initial_amount.toFixed(2)}`;
  document.getElementById('invDetailCurrentValue').textContent = `R$ ${inv.current_value.toFixed(2)}`;
  document.getElementById('invDetailReturn').textContent = `R$ ${returnAmount.toFixed(2)}`;
  document.getElementById('invDetailReturnPercent').textContent = `${returnPercent}%`;

  document.getElementById('investmentDetailModal').dataset.investmentId = investmentId;
  openModal('investmentDetailModal');
}

async function deleteInvestment(investmentId) {
  if (!confirm('Tem certeza?')) return;

  try {
    const { error } = await supabase
      .from('investments')
      .delete()
      .eq('id', investmentId);

    if (error) throw error;
    loadInvestments();
    closeModal('investmentDetailModal');
  } catch (error) {
    alert('❌ Erro ao deletar: ' + error.message);
  }
}

function showAddInvestmentTransactionModal() {
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('invTransactionDate').value = today;
  document.getElementById('invTransactionAmount').value = '';
  
  const accountSelect = document.getElementById('invTransactionAccount');
  if (accountSelect) {
    accountSelect.innerHTML = accounts
      .filter(a => a.type !== 'credit_card')
      .map(a => `<option value="${a.id}">${a.name}</option>`)
      .join('');
  }

  openModal('investmentTransactionModal');
}

async function saveInvestmentTransaction() {
  const investmentId = document.getElementById('investmentDetailModal').dataset.investmentId;
  const inv = investments.find(i => i.id === investmentId);

  if (!supabase || !currentUser) return;

  const data = {
    user_id: currentUser.id,
    investment_id: investmentId,
    account_id: document.getElementById('invTransactionAccount').value,
    type: document.getElementById('invTransactionType').value,
    amount: parseFloat(document.getElementById('invTransactionAmount').value),
    date: document.getElementById('invTransactionDate').value,
    description: document.getElementById('invTransactionDescription').value
  };

  try {
    const { error } = await supabase
      .from('investment_transactions')
      .insert([data]);

    if (error) throw error;

    let newValue = inv.current_value;
    if (data.type === 'contribution' || data.type === 'yield' || data.type === 'dividend') {
      newValue += data.amount;
    } else if (data.type === 'withdrawal') {
      newValue -= data.amount;
    }

    await supabase
      .from('investments')
      .update({ current_value: newValue })
      .eq('id', investmentId);

    alert('✅ Transação registrada com sucesso!');
    closeModal('investmentTransactionModal');
    loadInvestments();
  } catch (error) {
    alert('❌ Erro ao salvar: ' + error.message);
  }
}

// ============================================
// DASHBOARD
// ============================================



// Função auxiliar para atualizar elementos
function updateElement(id, value) {
  const el = document.getElementById(id);
  if (el) {
    el.textContent = value;
  }
}

function updateCharts() {
  // Implementar gráficos com Chart.js se necessário
}


async function editTransaction(transactionId) {
  const transaction = transactions.find(t => t.id === transactionId);
  if (!transaction) {
    console.error('❌ Transação não encontrada');
    return;
  }

  console.log('✏️ Editando transação:', transaction);

  // ⚠️ ATIVAR FLAG DE EDIÇÃO
  isEditingTransaction = true;

  // Converter data para formato correto (sem timezone)
  let dateValue = transaction.date;
  if (dateValue.includes('T')) {
    dateValue = dateValue.split('T')[0];
  }

  // ============================================
  // PREENCHER TODOS OS CAMPOS COM DELAY
  // Para garantir que selects estão carregados
  // ============================================

  setTimeout(() => {
    console.log('📝 Preenchendo formulário...');

    // Data
    const dateInput = document.getElementById('transactionDate');
    if (dateInput) {
      dateInput.value = dateValue;
      console.log(`✅ Data: ${dateValue}`);
    }

    // Tipo (Income/Expense/Transfer)
    const typeInput = document.getElementById('transactionType');
    if (typeInput) {
      typeInput.value = transaction.type || 'expense';
      console.log(`✅ Tipo: ${transaction.type}`);
      
      // IMPORTANTE: Chamar updateTransactionForm para mostrar campos corretos
      updateTransactionForm();
    }

    // Valor
    const amountInput = document.getElementById('transactionAmount');
    if (amountInput) {
      amountInput.value = transaction.amount;
      console.log(`✅ Valor: ${transaction.amount}`);
    }

    // Descrição
    const descriptionInput = document.getElementById('transactionDescription');
    if (descriptionInput) {
      descriptionInput.value = transaction.description;
      console.log(`✅ Descrição: ${transaction.description}`);
    }

    // ============================================
    // CONTA - CORRIGIDA
    // ============================================
    const accountSelect = document.getElementById('transactionAccount');
    if (accountSelect && transaction.account_id) {
      console.log(`🏦 Tentando selecionar conta: ${transaction.account_id}`);
      
      // Método 1: Valor direto
      accountSelect.value = transaction.account_id;
      
      // Método 2: Se não funcionar, procurar pelo option
      if (!accountSelect.value || accountSelect.value === '') {
        const option = accountSelect.querySelector(`option[value="${transaction.account_id}"]`);
        if (option) {
          accountSelect.value = transaction.account_id;
          console.log(`✅ Conta selecionada via option`);
        } else {
          console.warn(`⚠️ Option não encontrada para conta: ${transaction.account_id}`);
          console.log('Opções disponíveis:', Array.from(accountSelect.options).map(o => ({ value: o.value, text: o.text })));
        }
      } else {
        console.log(`✅ Conta selecionada: ${accountSelect.value}`);
      }
      
      // Disparar evento para atualizar UI
      accountSelect.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // ============================================
    // CATEGORIA - CORRIGIDA
    // ============================================
    const categorySelect = document.getElementById('transactionCategory');
    if (categorySelect && transaction.category_id) {
      console.log(`📂 Tentando selecionar categoria: ${transaction.category_id}`);
      
      // Método 1: Valor direto
      categorySelect.value = transaction.category_id;
      
      // Método 2: Se não funcionar, procurar pelo option
      if (!categorySelect.value || categorySelect.value === '') {
        const option = categorySelect.querySelector(`option[value="${transaction.category_id}"]`);
        if (option) {
          categorySelect.value = transaction.category_id;
          console.log(`✅ Categoria selecionada via option`);
        } else {
          console.warn(`⚠️ Option não encontrada para categoria: ${transaction.category_id}`);
        }
      } else {
        console.log(`✅ Categoria selecionada: ${categorySelect.value}`);
      }
      
      // Disparar evento
      categorySelect.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // Cartão de crédito (se existir)
    const creditCardSelect = document.getElementById('transactionCreditCard');
    if (creditCardSelect && transaction.credit_card_id) {
      console.log(`💳 Tentando selecionar cartão: ${transaction.credit_card_id}`);
      creditCardSelect.value = transaction.credit_card_id;
      creditCardSelect.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // Conta destino (transferência)
    const transferToSelect = document.getElementById('transactionTransferTo');
    if (transferToSelect && transaction.transfer_to_account_id) {
      console.log(`📤 Tentando selecionar conta destino: ${transaction.transfer_to_account_id}`);
      transferToSelect.value = transaction.transfer_to_account_id;
      transferToSelect.dispatchEvent(new Event('change', { bubbles: true }));
    }

    console.log('✅ Formulário preenchido completamente');
  }, 100);  // Delay de 100ms para garantir que os selects estão prontos

  // Mudar título do modal
  const modalTitle = document.querySelector('#transactionModal .modal-header h3');
  if (modalTitle) {
    modalTitle.textContent = '🔄 Editar Transação';
  }

  // Encontrar e modificar o botão salvar
  const modal = document.getElementById('transactionModal');
  const modalBody = modal.querySelector('.modal-body');
  
  let saveBtns = Array.from(modalBody.querySelectorAll('button')).filter(btn => 
    btn.textContent.includes('Salvar') || btn.textContent.includes('Atualizar')
  );
  
  if (saveBtns.length > 0) {
    const saveBtn = saveBtns[0];
    saveBtn.textContent = '🔄 Atualizar Transação';
    saveBtn.dataset.editingTransactionId = transactionId;
    saveBtn.onclick = () => {
      updateTransaction(transactionId);
    };
    console.log('✅ Botão modificado para "Atualizar"');
  }

  modal.dataset.editingTransactionId = transactionId;
  openModal('transactionModal');
  console.log('✅ Modal aberto para edição');
}


function resetTransactionModal() {
  const modalTitle = document.querySelector('#transactionModal .modal-header h3');
  if (modalTitle) {
    modalTitle.textContent = '➕ Nova Transação';
  }

  let saveBtns = Array.from(document.querySelectorAll('#transactionModal button')).filter(btn => 
    btn.textContent.includes('Atualizar') || btn.textContent.includes('Salvar')
  );
  
  if (saveBtns.length > 0) {
    const saveBtn = saveBtns[0];
    saveBtn.textContent = '💾 Salvar Transação';
    saveBtn.onclick = () => saveTransaction();
    delete saveBtn.dataset.editingTransactionId;
  }

  const modal = document.getElementById('transactionModal');
  delete modal.dataset.editingTransactionId;
}

async function updateTransaction(transactionId) {
  if (!supabase || !currentUser) {
    console.error('❌ Supabase não inicializado');
    return;
  }

  const transaction = transactions.find(t => t.id === transactionId);
  if (!transaction) {
    console.error('❌ Transação não encontrada');
    return;
  }

  try {
    console.log('💾 Atualizando transação...');

    const accountType = document.querySelector('input[name="accountType"]:checked')?.value || 'bank_account';
    const categoryId = document.getElementById('transactionCategory')?.value;
    const creditCardId = document.getElementById('transactionCreditCard')?.value || null;
    const transferToAccountId = document.getElementById('transactionTransferTo')?.value || null;
    const amount = parseFloat(document.getElementById('transactionAmount').value);
    const date = document.getElementById('transactionDate').value;
    const description = document.getElementById('transactionDescription').value;
    const type = document.getElementById('transactionType').value;

    let accountId = document.getElementById('transactionBankAccount')?.value || null;

    if (type === 'expense' && accountType === 'credit_card') {
      const card = creditCards.find(c => c.id === creditCardId);
      accountId = card ? card.account_id : null;
    }

    if (!accountId) {
      alert('❌ Selecione uma conta!');
      return;
    }

    if (type !== 'transfer' && !categoryId) {
      alert('❌ Selecione uma categoria!');
      return;
    }

    if (!amount || amount <= 0) {
      alert('❌ Valor inválido');
      return;
    }

    if (type === 'transfer' && !transferToAccountId) {
      alert('❌ Selecione a conta de destino!');
      return;
    }

    // Obter dados do formulário
    const updateData = {
      type: type,
      amount: amount,
      date: date,
      description: description,
      account_id: accountId,
      category_id: type === 'transfer' ? null : (categoryId || null),
      credit_card_id: creditCardId,
      transfer_to_account_id: type === 'transfer' ? transferToAccountId : null
    };

    console.log('📝 Dados a atualizar:', updateData);

    // Atualizar transação
    const { error } = await supabase
      .from('transactions')
      .update(updateData)
      .eq('id', transactionId)
      .eq('user_id', currentUser.id);

    if (error) {
      console.error('❌ Erro do Supabase:', error);
      throw error;
    }

    console.log('✅ Transação atualizada no Supabase');

    // ============================================
    // RECALCULAR SALDOS SE CONTA MUDOU
    // ============================================

    const novaContaId = updateData.account_id;
    const diferenca = updateData.amount - transaction.amount;
    const contaMudou = transaction.account_id !== novaContaId;

    console.log(`📊 Diferença: R$ ${diferenca.toFixed(2)}, Conta mudou: ${contaMudou}`);

    const isTransferChange = transaction.type === 'transfer' || updateData.type === 'transfer';

    if (isTransferChange) {
      await recalculateAccountBalances();
    }

    // Se conta mudou, reverter saldo da conta antiga
    if (contaMudou && !isTransferChange) {
      console.log('🔄 Conta foi alterada, revertendo saldo da conta antiga...');
      
      const contaAntiga = accounts.find(a => a.id === transaction.account_id);
      if (contaAntiga) {
        let novoSaldoAntiga = contaAntiga.balance;
        
        // Reverter transação antiga
        if (transaction.type === 'expense') novoSaldoAntiga += transaction.amount;
        if (transaction.type === 'income') novoSaldoAntiga -= transaction.amount;

        const { error: accError1 } = await supabase
          .from('accounts')
          .update({ balance: novoSaldoAntiga })
          .eq('id', transaction.account_id)
          .eq('user_id', currentUser.id);

        if (accError1) {
          console.error('Erro ao atualizar conta antiga:', accError1);
        } else {
          console.log(`✅ Conta antiga revertida: R$ ${novoSaldoAntiga.toFixed(2)}`);
        }
      }

      // Aplicar nova transação na conta nova
      const contaNova = accounts.find(a => a.id === novaContaId);
      if (contaNova) {
        let novoSaldoNova = contaNova.balance;
        
        if (updateData.type === 'expense') novoSaldoNova -= updateData.amount;
        if (updateData.type === 'income') novoSaldoNova += updateData.amount;

        const { error: accError2 } = await supabase
          .from('accounts')
          .update({ balance: novoSaldoNova })
          .eq('id', novaContaId)
          .eq('user_id', currentUser.id);

        if (accError2) {
          console.error('Erro ao atualizar conta nova:', accError2);
        } else {
          console.log(`✅ Conta nova atualizada: R$ ${novoSaldoNova.toFixed(2)}`);
        }
      }
    } else if (!isTransferChange) {
      // Se conta não mudou, apenas ajustar pela diferença
      if (diferenca !== 0) {
        const account = accounts.find(a => a.id === transaction.account_id);
        if (account) {
          const novoSaldo = account.balance - diferenca;
          
          const { error: accError } = await supabase
            .from('accounts')
            .update({ balance: novoSaldo })
            .eq('id', transaction.account_id)
            .eq('user_id', currentUser.id);

          if (accError) {
            console.error('Erro ao atualizar conta:', accError);
          } else {
            console.log(`✅ Saldo ajustado: R$ ${novoSaldo.toFixed(2)}`);
          }
        }
      }
    }

    alert('✅ Transação atualizada com sucesso!');
    closeModal('transactionModal');
    
    resetTransactionModal();

    // Desativar flag
    isEditingTransaction = false;
    console.log('✅ Modo edição desativado');

    // Recarregar dados
    console.log('🔄 Recarregando dados...');
    await loadTransactions();
    await loadAccounts();
    await loadCreditCards();
    updateDashboard();
    
    console.log('✅ Dados recarregados');
  } catch (error) {
    console.error('❌ Erro ao atualizar:', error);
    alert('❌ Erro ao atualizar transação: ' + error.message);
    isEditingTransaction = false;
  }
}

async function deleteTransaction(transactionId) {
  const transaction = transactions.find(t => t.id === transactionId);
  if (!transaction) {
    console.error('❌ Transação não encontrada');
    return;
  }

  // Confirmação
  const confirmDelete = confirm(
    `⚠️ Deletar transação?\n\n` +
    `${transaction.description}\n` +
    `R$ ${transaction.amount.toFixed(2)}\n` +
    `${new Date(transaction.date).toLocaleDateString('pt-BR')}\n\n` +
    `Esta ação não pode ser desfeita!`
  );

  if (!confirmDelete) {
    console.log('❌ Exclusão cancelada pelo usuário');
    return;
  }

  try {
    console.log('🗑️ Deletando transação...');

    // Reverter o saldo da conta
    const account = accounts.find(a => a.id === transaction.account_id);
    if (account) {
      let novoSaldo = account.balance;
      
      if (transaction.type === 'expense') novoSaldo += transaction.amount;
      if (transaction.type === 'income') novoSaldo -= transaction.amount;
      if (transaction.type === 'transfer') novoSaldo += transaction.amount;

      await supabase
        .from('accounts')
        .update({ balance: novoSaldo })
        .eq('id', transaction.account_id);

      console.log(`✅ Saldo revertido: ${account.name}`);

      // Se foi transferência, atualizar conta de destino
      if (transaction.type === 'transfer' && transaction.transfer_to_account_id) {
        const targetAccount = accounts.find(a => a.id === transaction.transfer_to_account_id);
        if (targetAccount) {
          await supabase
            .from('accounts')
            .update({ balance: targetAccount.balance - transaction.amount })
            .eq('id', transaction.transfer_to_account_id);
        }
      }
    }

    // Deletar transação
    const { error } = await supabase
      .from('transactions')
      .delete()
      .eq('id', transactionId);

    if (error) throw error;
    console.log('✅ Transação deletada do Supabase');

    alert('✅ Transação deletada com sucesso!');
    
    // Animar remoção
    const element = document.getElementById(`trans-${transactionId}`);
    if (element) {
      element.style.transition = 'opacity 0.3s ease';
      element.style.opacity = '0';
      setTimeout(() => {
        loadTransactions();
        loadAccounts();
        loadCreditCards();
      }, 300);
    } else {
      await Promise.all([
        loadTransactions(),
        loadAccounts(),
        loadCreditCards()
      ]);
    }
  } catch (error) {
    console.error('❌ Erro ao deletar:', error);
    alert('❌ Erro ao deletar transação: ' + error.message);
  }
}


// ============================================
// INICIALIZAR APP QUANDO PÁGINA CARREGAR
// ============================================


  console.log('🚀 Iniciando aplicação...');
  console.log('📦 Versão: 1.0.0');
  console.log('✅ Supabase configurado internamente');
  
  // Fechar modais ao clicar no X
  document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const modal = e.target.closest('.modal');
      if (modal) {
        modal.style.display = 'none';
      }
    });
  });

  // Iniciar app
  // Aguardar window.supabase estar disponível antes de iniciar
  const waitForSupabase = setInterval(() => {
    if (typeof window.supabase !== 'undefined' && window.supabase) {
      clearInterval(waitForSupabase);
      console.log('✅ window.supabase disponível, iniciando app...');
      initApp();
    }
  }, 100);

  // Timeout para não ficar esperando forever
  setTimeout(() => {
    if (!window.supabase) {
      console.error('❌ Timeout aguardando window.supabase');
      clearInterval(waitForSupabase);
      alert('❌ SDK do Supabase não carregou. Use um servidor HTTP (ex: Live Server) e recarregue.');
    }
  }, 5000);
  
  // ============================================
  // INICIALIZAR GUIA DE CATEGORIZAÇÃO
  // ============================================
  loadCategorizationGuide();

  // ============================================
  // EVENT LISTENERS - IA CATEGORIZATION
  // ============================================
  
  // Botão "Sugerir"
  const suggestBtn = document.getElementById('suggestCategoryBtn');
  if (suggestBtn) {
    suggestBtn.addEventListener('click', suggestCategoryWithAI);
  }

  // Botão "Aceitar"
  const acceptBtn = document.getElementById('acceptSuggestionBtn');
  if (acceptBtn) {
    acceptBtn.addEventListener('click', acceptAISuggestion);
  }

  // Botão "Rejeitar"
  const rejectBtn = document.getElementById('rejectSuggestionBtn');
  if (rejectBtn) {
    rejectBtn.addEventListener('click', rejectAISuggestion);
  }

  // Enter no campo de descrição também dispara sugestão
  const descInput = document.getElementById('transactionDescription');
  if (descInput) {
    descInput.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') suggestCategoryWithAI();
    });
  }

  console.log('✅ AI Module Inicializado');

  // Iniciar auto-reload
var autoReloadInterval = null;

function startAutoReload(intervalSeconds = 30) {
  if (autoReloadInterval) clearInterval(autoReloadInterval);
  
  autoReloadInterval = setInterval(async () => {
    console.log('🔄 Auto-recarregando dados...');
    try {
      await loadAllData();
      console.log('✅ Dados recarregados automaticamente');
    } catch (error) {
      console.error('❌ Erro no auto-reload:', error);
    }
  }, intervalSeconds * 1000);
  
  console.log(`✅ Auto-reload iniciado (a cada ${intervalSeconds}s)`);
}

function stopAutoReload() {
  if (autoReloadInterval) {
    clearInterval(autoReloadInterval);
    autoReloadInterval = null;
    console.log('⏹️ Auto-reload parado');
  }
}

function applyFilters() {
  console.log('🔍 Aplicando filtros...', {
    tipo: filterType,
    conta: filterAccount,
    categoria: filterCategory,
    dataInicio: filterDateStart,
    dataFim: filterDateEnd
  });
  
  let filtered = [...transactions];
  
  // Filtro por tipo
  if (filterType !== 'all') {
    filtered = filtered.filter(t => t.type === filterType);
  }
  
  // Filtro por conta
  if (filterAccount !== 'all') {
    filtered = filtered.filter(t => t.account_id === filterAccount);
  }
  
  // Filtro por categoria
  if (filterCategory !== 'all') {
    filtered = filtered.filter(t => t.category_id === filterCategory);
  }
  
  // Filtro por data inicial
  if (filterDateStart) {
    filtered = filtered.filter(t => {
      const transDate = new Date(t.date);
      const startDate = new Date(filterDateStart);
      return transDate >= startDate;
    });
  }
  
  // Filtro por data final
  if (filterDateEnd) {
    filtered = filtered.filter(t => {
      const transDate = new Date(t.date);
      const endDate = new Date(filterDateEnd);
      endDate.setHours(23, 59, 59, 999);
      return transDate <= endDate;
    });
  }
  
  // Ordenar por data decrescente
  filtered.sort((a, b) => new Date(b.date) - new Date(a.date));
  
  // Exibir resultados
  console.log(`✅ Filtros aplicados! Total: ${filtered.length} transações`);
  
  if (typeof displayTransactions === 'function') {
    displayTransactions(filtered);
  }
  
  if (typeof updateTransactionTotals === 'function') {
    updateTransactionTotals(filtered);
  }
}

// ============================================
// FUNÇÃO: ATUALIZAR TOTAIS COM FILTRO
// ============================================

function updateFilteredTotals(filteredTrans) {
  const totalReceitas = filteredTrans
    .filter(t => t.type === 'income')
    .reduce((sum, t) => sum + t.amount, 0);

  const totalDespesas = filteredTrans
    .filter(t => t.type === 'expense')
    .reduce((sum, t) => sum + t.amount, 0);

  const saldo = totalReceitas - totalDespesas;

  // Atualizar elementos HTML
  const receitas = document.getElementById('filteredTotalReceitas');
  const despesas = document.getElementById('filteredTotalDespesas');
  const saldoEl = document.getElementById('filteredSaldo');

  if (receitas) receitas.textContent = `R$ ${totalReceitas.toFixed(2)}`;
  if (despesas) despesas.textContent = `R$ ${totalDespesas.toFixed(2)}`;
  if (saldoEl) saldoEl.textContent = `R$ ${saldo.toFixed(2)}`;

  console.log(`💰 Totais: Receitas ${totalReceitas.toFixed(2)} | Despesas ${totalDespesas.toFixed(2)} | Saldo ${saldo.toFixed(2)}`);
}

// ============================================
// EVENTO: ALTERAR TIPO
// ============================================

function onFilterTypeChange(event) {
  filterType = event.target.value;
  console.log(`📋 Tipo filtrado: ${filterType}`);
  applyFilters();
}

// ============================================
// EVENTO: ALTERAR CONTA
// ============================================

function onFilterAccountChange(event) {
  filterAccount = event.target.value;
  console.log(`🏦 Conta filtrada: ${filterAccount}`);
  applyFilters();
}

// ============================================
// EVENTO: ALTERAR CATEGORIA
// ============================================

function onFilterCategoryChange(event) {
  filterCategory = event.target.value;
  console.log(`📂 Categoria filtrada: ${filterCategory}`);
  applyFilters();
}

// ============================================
// EVENTO: ALTERAR DATA INICIAL
// ============================================

function onFilterDateStartChange(event) {
  filterDateStart = event.target.value;
  console.log(`📅 Data inicial: ${filterDateStart}`);
  applyFilters();
}

// ============================================
// EVENTO: ALTERAR DATA FINAL
// ============================================

function onFilterDateEndChange(event) {
  filterDateEnd = event.target.value;
  console.log(`📅 Data final: ${filterDateEnd}`);
  applyFilters();
}

// ============================================
// FUNÇÃO: LIMPAR TODOS OS FILTROS
// ============================================

function clearAllFilters() {
  console.log('🔄 Limpando todos os filtros...');
  
  filterCategory = 'all';
  filterType = 'all';
  filterAccount = 'all';
  filterDateStart = null;
  filterDateEnd = null;

  // Resetar elementos HTML
  const typeSelect = document.getElementById('filterType');
  const accountSelect = document.getElementById('filterAccount');
  const categorySelect = document.getElementById('filterCategory');
  const dateStartInput = document.getElementById('filterDateStart');
  const dateEndInput = document.getElementById('filterDateEnd');

  if (typeSelect) typeSelect.value = 'all';
  if (accountSelect) accountSelect.value = 'all';
  if (categorySelect) categorySelect.value = 'all';
  if (dateStartInput) dateStartInput.value = '';
  if (dateEndInput) dateEndInput.value = '';

  applyFilters();
  console.log('✅ Filtros limpos!');
}

// ============================================
// FUNÇÃO: OBTER DATA HOJE
// ============================================

function getTodayDate() {
  const today = new Date();
  return today.toISOString().split('T')[0];
}

// ============================================
// FUNÇÃO: OBTER DATA 30 DIAS ATRÁS
// ============================================

function get30DaysAgoDate() {
  const today = new Date();
  today.setDate(today.getDate() - 30);
  return today.toISOString().split('T')[0];
}

// ============================================
// FUNÇÃO: OBTER DATA 90 DIAS ATRÁS
// ============================================

function get90DaysAgoDate() {
  const today = new Date();
  today.setDate(today.getDate() - 90);
  return today.toISOString().split('T')[0];
}

// ============================================
// PHASE 1C: Historical Charts Functions
// ============================================

/**
 * Gráfico 1: Line Chart - Trend de gastos últimos 12 meses
 */
function renderTrendChart() {
  if (typeof SmartAnalytics === 'undefined' || typeof Chart === 'undefined') {
    console.warn('⚠️ SmartAnalytics ou Chart.js não carregado');
    return;
  }

  const canvas = document.getElementById('trendChart');
  if (!canvas) return;

  // Destruir gráfico anterior se existir
  if (charts.trend) charts.trend.destroy();

  // Agregar gastos por mês dos últimos 12 meses
  const now = new Date();
  const cutoffDate = new Date();
  cutoffDate.setMonth(cutoffDate.getMonth() - 12);

  // Construir array de meses
  const months = [];
  const monthData = {};

  for (let i = 11; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthKey = date.toLocaleString('pt-BR', { month: 'short', year: '2-digit' });
    months.push(monthKey);
    monthData[monthKey] = 0;
  }

  // Agregar transações por mês
  const reportingTransactions = getReportingTransactions();

  reportingTransactions.forEach(tx => {
    if (tx.type === 'expense') {
      const txDate = new Date(tx.date);
      if (txDate >= cutoffDate) {
        const monthKey = txDate.toLocaleString('pt-BR', { month: 'short', year: '2-digit' });
        if (monthData[monthKey] !== undefined) {
          monthData[monthKey] += Math.abs(tx.amount);
        }
      }
    }
  });

  const data = months.map(m => monthData[m]);

  // Criar gráfico
  charts.trend = new Chart(canvas, {
    type: 'line',
    data: {
      labels: months,
      datasets: [{
        label: 'Gastos Mensais',
        data: data,
        borderColor: '#3B82F6',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        borderWidth: 2,
        fill: true,
        tension: 0.4,
        pointRadius: 4,
        pointBackgroundColor: '#3B82F6',
        pointHoverRadius: 6,
        pointBorderColor: 'white',
        pointBorderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          labels: {
            color: '#1F2937',
            font: { size: 12, weight: '500' }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: function(value) {
              return 'R$ ' + value.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
            },
            color: '#6B7280'
          },
          grid: {
            color: 'rgba(0, 0, 0, 0.05)'
          }
        },
        x: {
          ticks: {
            color: '#6B7280'
          },
          grid: {
            display: false
          }
        }
      }
    }
  });
}

/**
 * Gráfico 2: Bar Chart - Este Mês vs. Média por Categoria
 */
function renderComparisonChart() {
  if (typeof SmartAnalytics === 'undefined' || typeof Chart === 'undefined') {
    console.warn('⚠️ SmartAnalytics ou Chart.js não carregado');
    return;
  }

  const canvas = document.getElementById('comparisonChart');
  if (!canvas) return;

  // Destruir gráfico anterior se existir
  if (charts.comparison) charts.comparison.destroy();

  // Obter análises
  const analyses = SmartAnalytics.analyzeAllCategories();

  if (analyses.length === 0) return;

  // Preparar dados (pegar top 6 categorias)
  const topCategories = analyses.slice(0, 6);
  const labels = topCategories.map(a => a.categoryName);
  const currentData = topCategories.map(a => a.currentSpend);
  const averageData = topCategories.map(a => a.pattern.average);

  // Criar gráfico
  charts.comparison = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Este Mês',
          data: currentData,
          backgroundColor: 'rgba(59, 130, 246, 0.8)',
          borderRadius: 4
        },
        {
          label: 'Média 12m',
          data: averageData,
          backgroundColor: 'rgba(107, 114, 128, 0.5)',
          borderRadius: 4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          labels: {
            color: '#1F2937',
            font: { size: 12, weight: '500' },
            padding: 15
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: function(value) {
              return 'R$ ' + value.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
            },
            color: '#6B7280'
          },
          grid: {
            color: 'rgba(0, 0, 0, 0.05)'
          }
        },
        x: {
          ticks: {
            color: '#6B7280',
            font: { size: 11 }
          },
          grid: {
            display: false
          }
        }
      }
    }
  });
}

/**
 * Orquestrador: Renderiza ambos os gráficos
 */
function renderHistoricalCharts() {
  // Garantir que dados estão carregados
  if (transactions.length === 0 || categories.length === 0) {
    console.warn('⚠️ Dados não carregados para gráficos');
    return;
  }

  const chartsSection = document.getElementById('chartsSection');
  if (!chartsSection) {
    console.warn('⚠️ Seção de gráficos não encontrada no HTML');
    return;
  }

  // Renderizar gráficos
  renderTrendChart();
  renderComparisonChart();

  // Mostrar seção
  chartsSection.style.display = 'block';

  console.log('✅ Gráficos históricos renderizados');
}

// ============================================
// PHASE 2: Alerts & Anomalies Functions
// ============================================

/**
 * Renderiza cards de alertas e anomalias
 */
function renderAnomalyAlerts() {
  if (typeof SmartAnalytics === 'undefined') {
    console.warn('⚠️ Smart Analytics não está carregado');
    return;
  }

  const section = document.getElementById('alertsSection');
  const container = document.getElementById('alertsContainer');
  
  if (!section || !container) {
    console.warn('⚠️ Elementos de alertas não encontrados no HTML');
    return;
  }

  // Obter análises de todas as categorias
  const analyses = SmartAnalytics.analyzeAllCategories();
  
  if (analyses.length === 0) {
    section.style.display = 'none';
    return;
  }

  // Filtrar apenas com anomalias ou oportunidades
  const alerts = analyses.filter(a => 
    a.anomaly.isAnomaly || a.anomaly.isOpportunity
  );

  if (alerts.length === 0) {
    section.style.display = 'none';
    return;
  }

  // Limpar container
  container.innerHTML = '';

  // Renderizar cada alerta
  alerts.forEach(alert => {
    const { categoryName, currentSpend, pattern, anomaly } = alert;

    // Determinar tipo de alerta
    let cardClass = 'alert-low';
    let icon = '💡';
    let title = 'Info';

    if (anomaly.isAnomaly) {
      if (anomaly.severity === 'high') {
        cardClass = 'alert-high';
        icon = '🔴';
        title = 'ALERTA - Gasto Elevado';
      } else if (anomaly.severity === 'medium') {
        cardClass = 'alert-medium';
        icon = '🟡';
        title = 'AVISO - Acima da Média';
      }
    } else if (anomaly.isOpportunity) {
      cardClass = 'alert-opportunity';
      icon = '🟢';
      title = 'OPORTUNIDADE - Economizando';
    }

    // Criar card
    const card = document.createElement('div');
    card.className = `alert-card ${cardClass}`;
    
    let html = `
      <div class="alert-icon">${icon}</div>
      <div class="alert-title">${title}</div>
      <div class="alert-category"><strong>${categoryName}</strong></div>
      <div class="alert-values">
        <span class="alert-current">Gasto: R$ ${currentSpend.toFixed(0)}</span>
        <span class="alert-average">Média: R$ ${pattern.average.toFixed(0)}</span>
      </div>
    `;

    if (anomaly.recommendation) {
      html += `<div class="alert-recommendation">💡 ${anomaly.recommendation}</div>`;
    }

    if (anomaly.isOpportunity && anomaly.message) {
      html += `<div class="alert-recommendation">${anomaly.message}</div>`;
    }

    card.innerHTML = html;
    container.appendChild(card);
  });

  // Mostrar seção
  section.style.display = 'block';
  console.log(`✅ ${alerts.length} alerta(s) renderizado(s)`);
}

// ============================================
// PHASE 1B: Comparison Table Functions
// ============================================

/**
 * Renderiza tabela comparativa: Este Mês vs. Histórico
 */
function renderComparisonTable() {
  // Garantir que Smart Analytics está carregado
  if (typeof SmartAnalytics === 'undefined') {
    console.warn('⚠️ Smart Analytics não está carregado');
    return;
  }

  const section = document.getElementById('comparisonSection');
  const tbody = document.getElementById('comparisonTableBody');
  
  if (!section || !tbody) {
    console.warn('⚠️ Elementos da tabela comparativa não encontrados no HTML');
    return;
  }

  // Obter análises de todas as categorias
  const analyses = SmartAnalytics.analyzeAllCategories();
  
  // Se não houver dados, esconder tabela
  if (analyses.length === 0) {
    section.style.display = 'none';
    return;
  }

  // Limpar tbody
  tbody.innerHTML = '';

  // Preencher cada linha
  analyses.forEach(analysis => {
    const { categoryName, currentSpend, pattern, anomaly } = analysis;

    // Calcular desvio percentual
    let desvioPercent = 0;
    let statusClass = 'status-good';
    let statusText = '✅ OK';

    if (pattern.average > 0) {
      desvioPercent = ((currentSpend / pattern.average - 1) * 100).toFixed(1);
      
      if (anomaly.isAnomaly) {
        if (anomaly.severity === 'high') {
          statusClass = 'status-alert';
          statusText = '🔴 ALERTA';
        } else if (anomaly.severity === 'medium') {
          statusClass = 'status-warning';
          statusText = '🟡 AVISO';
        }
      } else if (anomaly.isOpportunity) {
        statusClass = 'status-good';
        statusText = '🟢 OPORTUNIDADE';
      }
    }

    // Criar linha da tabela
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${categoryName}</strong></td>
      <td style="text-align: right; color: var(--color-text);">
        <span class="currency">R$ ${currentSpend.toFixed(0)}</span>
      </td>
      <td style="text-align: right; color: var(--color-text-light);">
        <span class="currency">R$ ${pattern.average.toFixed(0)}</span>
      </td>
      <td style="text-align: center; font-weight: 500; color: ${desvioPercent > 0 ? '#dc2626' : '#059669'};">
        ${desvioPercent > 0 ? '+' : ''}${desvioPercent}%
      </td>
      <td style="text-align: center;">
        <span class="status-badge ${statusClass}">${statusText}</span>
      </td>
    `;
    
    tbody.appendChild(tr);
  });

  // Mostrar seção
  section.style.display = 'block';
  console.log('✅ Tabela comparativa renderizada');
}

// ============================================
// UPDATE DASHBOARD
// ============================================

function updateDashboard() {
  const reportingTransactions = getReportingTransactions();
  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();
  const lastYear = currentYear - 1;

  // ============================================
  // 1. DADOS DO MÊS ATUAL
  // ============================================
  
  const monthTransactions = reportingTransactions.filter(t => {
    const date = new Date(t.date);
    return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
  });

  const monthIncome = monthTransactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
  const monthExpense = monthTransactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
  const monthBalance = monthIncome - monthExpense;

  // ============================================
  // 2. DADOS DO ANO ATUAL
  // ============================================
  
  const yearTransactions = reportingTransactions.filter(t => {
    const date = new Date(t.date);
    return date.getFullYear() === currentYear;
  });

  const yearIncome = yearTransactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
  const yearExpense = yearTransactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
  const yearBalance = yearIncome - yearExpense;

  // ============================================
  // 3. DADOS DO ANO ANTERIOR (COMPARATIVO)
  // ============================================
  
  const lastYearTransactions = reportingTransactions.filter(t => {
    const date = new Date(t.date);
    return date.getFullYear() === lastYear;
  });

  const lastYearIncome = lastYearTransactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
  const lastYearExpense = lastYearTransactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
  const lastYearBalance = lastYearIncome - lastYearExpense;

  // Cálculo de variação percentual
  const incomeVariation = lastYearIncome > 0 ? ((yearIncome - lastYearIncome) / lastYearIncome * 100).toFixed(1) : 0;
  const expenseVariation = lastYearExpense > 0 ? ((yearExpense - lastYearExpense) / lastYearExpense * 100).toFixed(1) : 0;

  // ============================================
  // 4. PATRIMÔNIO E SALDOS
  // ============================================
  
  const totalAccounts = accounts.reduce((sum, a) => sum + parseFloat(a.balance || 0), 0);
  const totalInvested = investments.reduce((sum, i) => sum + (i.current_value || 0), 0);
  const totalCardsDebt = creditCards.reduce((sum, c) => sum + (c.balance || 0), 0);
  const netWorth = totalAccounts + totalInvested - totalCardsDebt;

  // ============================================
  // 5. CATEGORIA MAIS GASTA (MÊS ATUAL)
  // ============================================
  
  const categoryExpenses = {};
  monthTransactions.filter(t => t.type === 'expense' && t.category_id).forEach(t => {
    const cat = categories.find(c => c.id === t.category_id);
    const catName = cat ? cat.name : 'Outros';
    categoryExpenses[catName] = (categoryExpenses[catName] || 0) + t.amount;
  });

  const topCategory = Object.entries(categoryExpenses).sort((a, b) => b[1] - a[1])[0];
  const topCategoryName = topCategory ? topCategory[0] : 'N/A';
  const topCategoryValue = topCategory ? topCategory[1] : 0;

  // ============================================
  // 6. MÉDIA DE GASTOS (ÚLTIMOS 6 MESES)
  // ============================================
  
  const last6Months = [];
  for (let i = 0; i < 6; i++) {
    const date = new Date();
    date.setMonth(date.getMonth() - i);
    
    const monthTrans = reportingTransactions.filter(t => {
      const tDate = new Date(t.date);
      return tDate.getMonth() === date.getMonth() && tDate.getFullYear() === date.getFullYear();
    });
    
    const expense = monthTrans.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
    last6Months.push(expense);
  }

  const avgMonthExpense = last6Months.reduce((sum, val) => sum + val, 0) / 6;

  // ============================================
  // 7. ATUALIZAR INTERFACE
  // ============================================

  // Mês Atual
  updateElement('monthIncomeValue', `R$ ${monthIncome.toFixed(2)}`);
  updateElement('monthExpenseValue', `R$ ${monthExpense.toFixed(2)}`);
  updateElement('monthBalanceValue', `R$ ${monthBalance.toFixed(2)}`);

  // Ano Atual
  updateElement('yearIncomeValue', `R$ ${yearIncome.toFixed(2)}`);
  updateElement('yearExpenseValue', `R$ ${yearExpense.toFixed(2)}`);
  updateElement('yearBalanceValue', `R$ ${yearBalance.toFixed(2)}`);

  // Comparativo com ano anterior
  updateElement('lastYearIncomeValue', `R$ ${lastYearIncome.toFixed(2)}`);
  updateElement('lastYearExpenseValue', `R$ ${lastYearExpense.toFixed(2)}`);
  updateElement('incomeVariation', `${incomeVariation > 0 ? '+' : ''}${incomeVariation}%`);
  updateElement('expenseVariation', `${expenseVariation > 0 ? '+' : ''}${expenseVariation}%`);

  // Patrimônio
  updateElement('totalAccountsValue', `R$ ${totalAccounts.toFixed(2)}`);
  updateElement('totalInvestedValue', `R$ ${totalInvested.toFixed(2)}`);
  updateElement('totalCardsDebtValue', `R$ ${totalCardsDebt.toFixed(2)}`);
  updateElement('netWorthValue', `R$ ${netWorth.toFixed(2)}`);

  // ===== FASE 1B: Renderizar Tabela Comparativa =====
  renderComparisonTable();

  // ===== FASE 1B: Renderizar Tabela Comparativa =====
  renderComparisonTable();

  // ===== FASE 1C: Renderizar Gráficos Históricos =====
  renderHistoricalCharts();

  // ===== FASE 2: Renderizar Alertas & Anomalias =====
  renderAnomalyAlerts();

  // Insights
  updateElement('topCategoryName', topCategoryName);
  updateElement('topCategoryValue', `R$ ${topCategoryValue.toFixed(2)}`);
  updateElement('avgMonthExpenseValue', `R$ ${avgMonthExpense.toFixed(2)}`);
  updateElement('totalTransactionsCount', reportingTransactions.length);

  console.log('✅ Dashboard atualizado!');
  console.log(`📊 Mês: R$ ${monthBalance.toFixed(2)} | Ano: R$ ${yearBalance.toFixed(2)}`);
}


// ===== FUNÇÕES DE FILTRO RÁPIDO POR DATA =====

function filterThisMonth() {
  console.log('🔄 Clicou em: Este Mês');
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  
  filterDateStart = firstDay.toISOString().split('T')[0];
  filterDateEnd = lastDay.toISOString().split('T')[0];
  
  // Resetar outros filtros
  filterType = 'all';
  filterAccount = 'all';
  filterCategory = 'all';
  
  // Resetar selects (SEM os inputs que não existem)
  const typeSelect = document.getElementById('transactionTypeFilter');
  const accountSelect = document.getElementById('transactionAccountFilter');
  const categorySelect = document.getElementById('filterCategory');
  
  if (typeSelect) typeSelect.value = 'all';
  if (accountSelect) accountSelect.value = 'all';
  if (categorySelect) categorySelect.value = 'all';
  
  console.log(`📅 Este Mês: ${filterDateStart} a ${filterDateEnd}`);
  applyFilters();
}

function filterThisYear() {
  console.log('🔄 Clicou em: Este Ano');
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), 0, 1);
  const lastDay = new Date(today.getFullYear(), 11, 31);
  
  filterDateStart = firstDay.toISOString().split('T')[0];
  filterDateEnd = lastDay.toISOString().split('T')[0];
  
  // Resetar outros filtros
  filterType = 'all';
  filterAccount = 'all';
  filterCategory = 'all';
  
  // Resetar selects
  const typeSelect = document.getElementById('transactionTypeFilter');
  const accountSelect = document.getElementById('transactionAccountFilter');
  const categorySelect = document.getElementById('filterCategory');
  
  if (typeSelect) typeSelect.value = 'all';
  if (accountSelect) accountSelect.value = 'all';
  if (categorySelect) categorySelect.value = 'all';
  
  console.log(`📊 Este Ano: ${filterDateStart} a ${filterDateEnd}`);
  applyFilters();
}

function filterLastMonth() {
  console.log('🔄 Clicou em: Mês Passado');
  const today = new Date();
  const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1);
  const firstDay = new Date(lastMonth.getFullYear(), lastMonth.getMonth(), 1);
  const lastDay = new Date(lastMonth.getFullYear(), lastMonth.getMonth() + 1, 0);
  
  filterDateStart = firstDay.toISOString().split('T')[0];
  filterDateEnd = lastDay.toISOString().split('T')[0];
  
  // Resetar outros filtros
  filterType = 'all';
  filterAccount = 'all';
  filterCategory = 'all';
  
  // Resetar selects
  const typeSelect = document.getElementById('transactionTypeFilter');
  const accountSelect = document.getElementById('transactionAccountFilter');
  const categorySelect = document.getElementById('filterCategory');
  
  if (typeSelect) typeSelect.value = 'all';
  if (accountSelect) accountSelect.value = 'all';
  if (categorySelect) categorySelect.value = 'all';
  
  console.log(`📆 Mês Passado: ${filterDateStart} a ${filterDateEnd}`);
  applyFilters();
}


// ===== FUNÇÃO DE SINCRONIZAÇÃO =====
function syncFilters() {
  console.log('Sincronizando filtros...');
  filterType = document.getElementById('transactionTypeFilter')?.value || 'all';
  filterAccount = document.getElementById('transactionAccountFilter')?.value || 'all';
  filterCategory = document.getElementById('filterCategory')?.value || 'all';
  
  console.log('Filtros sincronizados:', {
    tipo: filterType,
    conta: filterAccount,
    categoria: filterCategory,
    dateStart: filterDateStart,
    dateEnd: filterDateEnd
  });
  
  applyFilters();

}

// ============================================
// IMPORTADOR DE CSV - FUNÇÕES
// ============================================


var csvData = [];
var csvHeaders = [];
var csvMapping = {};

// ✅ FUNÇÃO: Detectar delimitador (vírgula ou ponto-e-vírgula)
function detectDelimiter(csvText) {
  // Remover BOM UTF-8 se houver
  if (csvText.charCodeAt(0) === 0xFEFF || csvText.charCodeAt(0) === 0xEF) {
    csvText = csvText.substring(csvText.charCodeAt(0) === 0xFEFF ? 1 : 3);
  }

  const firstLine = csvText.split('\n')[0];
  const commas = (firstLine.match(/,/g) || []).length;
  const semicolons = (firstLine.match(/;/g) || []).length;

  console.log('📊 Análise de delimitador:');
  console.log('   Vírgulas: ' + commas);
  console.log('   Pontos-vírgula: ' + semicolons);

  const result = semicolons > commas ? ';' : ',';
  console.log('✅ Delimitador detectado: ' + (result === ',' ? 'VÍRGULA (,)' : 'PONTO-E-VÍRGULA (;)'));

  return result;
}

// ✅ FUNÇÃO: Parse CSV com delimitador customizável
function parseCSVLine(line, delimiter) {
  const result = [];
  let current = '';
  let insideQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        current += '"';
        i++;
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === delimiter && !insideQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

// ✅ FUNÇÃO: Handle CSV com suporte a ambos delimitadores
function handleCsvFileSelect() {
  const fileInput = document.getElementById('csvFileInput');
  const file = fileInput.files[0];

  if (!file) {
    alert('⚠️ Selecione um arquivo CSV');
    return;
  }

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      let csv = e.target.result;

      // ✅ PASSO 1: Remover BOM UTF-8
      if (csv.charCodeAt(0) === 0xFEFF || csv.charCodeAt(0) === 0xEF) {
        csv = csv.substring(csv.charCodeAt(0) === 0xFEFF ? 1 : 3);
        console.log('🧹 BOM UTF-8 removido');
      }

      // ✅ PASSO 2: Detectar delimitador
      const delimiter = detectDelimiter(csv);

      // ✅ PASSO 3: Split por linhas
      const lines = csv.split('\n').filter(line => line.trim());

      if (lines.length < 2) {
        alert('❌ CSV vazio ou mal formatado');
        return;
      }

      // ✅ PASSO 4: Parse header com delimitador correto
      csvHeaders = parseCSVLine(lines[0], delimiter)
        .map(h => h.replace(/^"|"$/g, ''));

      console.log('✅ Headers parseados: ' + csvHeaders.length + ' colunas');
      console.log('   Colunas: ' + csvHeaders.join(' | '));

      // ✅ PASSO 5: Parse dados com delimitador correto
      csvData = lines.slice(1).map((line, lineIndex) => {
        const values = parseCSVLine(line, delimiter);
        const row = {};
        csvHeaders.forEach((header, index) => {
          row[header] = (values[index] || '').replace(/^"|"$/g, '');
        });
        return row;
      });

      console.log('✅ CSV CARREGADO COM SUCESSO!');
      console.log('   Total de linhas: ' + csvData.length);
      console.log('   Primeira linha:', csvData[0]);

      // ✅ PASSO 6: Popular selects e mostrar mapeamento
      populateMappingSelects();
      document.getElementById('csvUploadSection').style.display = 'none';
      document.getElementById('csvMappingSection').style.display = 'block';

    } catch (error) {
      console.error('❌ ERRO ao processar CSV:', error);
      alert('❌ Erro ao processar CSV:\n' + error.message);
    }
  };

  reader.readAsText(file, 'UTF-8');
}


function populateMappingSelects() {
  const selects = ['mapDate', 'mapDescription', 'mapAmount', 'mapCreditCard', 'mapCategory', 'mapInstallment'];
  
  selects.forEach(selectId => {
    const select = document.getElementById(selectId);
    if (!select) return; // Adiciona verificação
    
    const firstOption = select.querySelector('option:first-child');
    
    select.innerHTML = '';
    if (firstOption) { // Adiciona verificação
        select.appendChild(firstOption.cloneNode(true));
    }
    
    csvHeaders.forEach(header => {
      const option = document.createElement('option');
      option.value = header;
      option.textContent = header;
      select.appendChild(option);
    });
  });
}

function generateCsvPreview() {
  const dateCol = document.getElementById('mapDate').value;
  const descCol = document.getElementById('mapDescription').value;
  const amountCol = document.getElementById('mapAmount').value;
  const cardCol = document.getElementById('mapCreditCard').value;
  
  if (!dateCol || !descCol || !amountCol || !cardCol) {
    alert('❌ Preencha os campos obrigatórios: Data, Descrição, Valor e Cartão');
    return;
  }

  csvMapping = {
    date: dateCol,
    description: descCol,
    amount: amountCol,
    creditCard: cardCol,
    category: document.getElementById('mapCategory').value,
    installment: document.getElementById('mapInstallment').value
  };

  renderCsvPreviewTable();
  
  document.getElementById('csvMappingSection').style.display = 'none';
  document.getElementById('csvPreviewSection').style.display = 'block';
}

function renderCsvPreviewTable() {
  const container = document.getElementById('csvPreviewTable');
  if (!container) return;

  document.getElementById('csvRowCount').textContent = csvData.length;

  let html = `
  <div style="margin-bottom: 20px; padding: 15px; background: #e8f4f8; border-radius: 8px;">
    <label style="display: block; margin-bottom: 10px; font-weight: bold;">
      💳 Selecione o Cartão de Crédito de Destino:
    </label>
    <select id="csvPreviewCardSelect" onchange="replicateCardToAllRows(this.value)" style="width: 100%; padding: 10px; font-size: 14px; border: 2px solid #0066cc; border-radius: 5px;">
      <option value="">-- Selecione um Cartão --</option>
      ${creditCards.map(c => `<option value="${c.id}">${c.holder_name} (${c.bank_name} - ${c.last_four_digits})</option>`).join('')}
    </select>
  </div>

  <div style="margin-bottom: 15px; display: flex; gap: 20px; align-items: center;">
    <label>
      <input type="checkbox" id="selectAllCheckbox" onchange="toggleAllRows(this.checked)" style="width: 18px; height: 18px; cursor: pointer;" checked>
      <strong style="margin-left: 10px; vertical-align: middle;">Selecionar Todos</strong>
    </label>

    <div style="padding: 10px 15px; background: #fff3cd; border: 2px solid #ffc107; border-radius: 5px; font-weight: bold; color: #856404;">
      💰 Total Selecionado: <span id="csvTotalAmount" style="font-size: 16px; color: #28a745;">R$ 0.00</span>
    </div>
  </div>

  <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
    <thead>
      <tr style="background: #0066cc; color: white; position: sticky; top: 0;">
        <th style="padding: 8px; text-align: center; border: 1px solid #ccc; width: 40px;">✓</th>
        <th style="padding: 10px; text-align: left; border: 1px solid #ccc;">Data</th>
        <th style="padding: 10px; text-align: left; border: 1px solid #ccc;">Descrição</th>
        <th style="padding: 10px; text-align: right; border: 1px solid #ccc;">Valor</th>
        <th style="padding: 10px; text-align: left; border: 1px solid #ccc;">Categoria</th>
        <th style="padding: 10px; text-align: left; border: 1px solid #ccc;">Parcelas</th>
      </tr>
    </thead>
    <tbody>`;

  csvData.forEach((row, index) => {
    const bgColor = index % 2 === 0 ? '#fff' : '#f9f9f9';

    let date = row[csvMapping.date] || '';
    let description = row[csvMapping.description] || '';
    let amount = row[csvMapping.amount] || '';
    let category = row[csvMapping.category] || '';
    let installment = row[csvMapping.installment] || '';

    // Limpa o valor (remove R$, espaços, e troca vírgula por ponto)
    amount = amount.replace('R$', '').replace(/\s/g, '').replace(',', '.');
    // Se o valor for negativo (comum em faturas), torna positivo
    if (amount.startsWith('-')) {
        amount = amount.substring(1);
    }

    let categoryId = '';
    if (category) {
      const matchCat = categories.find(c => c.name.toUpperCase().includes(category.toUpperCase()));
      if (matchCat) categoryId = matchCat.id;
    }

    html += `<tr style="background: ${bgColor}; border-bottom: 1px solid #eee;">
      <td style="padding: 8px; text-align: center; border: 1px solid #eee;">
        <input type="checkbox" class="csvRowCheckbox" data-index="${index}" data-amount="${amount}" onchange="updateCsvTotal()" checked style="width: 16px; height: 16px; cursor: pointer;">
      </td>
      <td style="padding: 8px; border: 1px solid #eee;">
        <input type="date" value="${formatDateForInput(date)}" onchange="updateCsvRowField(${index}, 'date', this.value)" style="width: 95%; padding: 3px; font-size: 11px;">
      </td>
      <td style="padding: 8px; border: 1px solid #eee; display: flex; gap: 4px; align-items: center;">
        <input type="text" value="${description}" onchange="updateCsvRowField(${index}, 'description', this.value)" style="flex: 1; padding: 3px; font-size: 11px;">
        <button 
          type="button"
          onclick="suggestCategoryForCsvLine(${index})" 
          title="Sugerir categoria com IA"
          style="padding: 3px 6px; background: #0369a1; color: white; border: none; border-radius: 3px; cursor: pointer; font-size: 11px; white-space: nowrap; flex-shrink: 0;"
        >
          IA
        </button>
        <div id="csvAILoading_${index}" style="display: none; font-size: 10px; color: #0369a1;">...</div>
      </td>
      <td style="padding: 8px; border: 1px solid #eee; text-align: right;">
        <input type="number" value="${amount}" onchange="updateCsvRowFieldAndTotal(${index}, 'amount', this.value)" step="0.01" style="width: 95%; padding: 3px; font-size: 11px;">
      </td>
      <td style="padding: 8px; border: 1px solid #eee;">
        <select onchange="updateCsvRowField(${index}, 'category', this.value)" style="width: 95%; padding: 3px; font-size: 11px;">
          <option value="">-</option>
          ${categories.map(c => `<option value="${c.id}" ${categoryId === c.id ? 'selected' : ''}>${c.name}</option>`).join('')}
        </select>
      </td>
      <td style="padding: 8px; border: 1px solid #eee;">
        <input type="text" value="${installment}" onchange="updateCsvRowField(${index}, 'installment', this.value)" placeholder="1 de 3" style="width: 95%; padding: 3px; font-size: 11px;">
      </td>
    </tr>`;
  });

  html += `</tbody></table>

  <div style="margin-top: 15px; display: flex; gap: 10px;">
    <button onclick="backToMapping()" style="padding: 12px 24px; background: #6c757d; color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: bold;">
      ← Voltar
    </button>
    <button onclick="importSelectedTransactions()" style="padding: 12px 24px; background: #28a745; color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: bold;">
      ✅ Importar Selecionados
    </button>
  </div>`;

  container.innerHTML = html;

  // Calcular total inicial
  updateCsvTotal();

  console.log('✅ Tabela renderizada com', csvData.length, 'linhas');
}

function formatDateForInput(dateStr) {
  if (!dateStr) return '';
  
  // Tenta formato DD/MM/AAAA
  if (dateStr.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
    const [day, month, year] = dateStr.split('/');
    return `${year}-${month}-${day}`;
  }
  
  // Tenta formato AAAA-MM-DD
  if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
    return dateStr;
  }
  
  // Tenta converter data genérica (pode falhar)
  try {
    return new Date(dateStr).toISOString().split('T')[0];
  } catch (e) {
    return ''; // Retorna vazio se falhar
  }
}

// ============================================
// FUNÇÃO: Atualizar somatório de amounts
// ============================================
function updateCsvTotal() {
  const checkboxes = document.querySelectorAll('.csvRowCheckbox:checked');
  let total = 0;

  checkboxes.forEach(checkbox => {
    // Pega o valor do input da *mesma linha*
    const row = checkbox.closest('tr');
    const amountInput = row.querySelector('input[type="number"]');
    const amount = parseFloat(amountInput.value) || 0;
    
    total += Math.abs(amount); // Usar valor absoluto
  });

  // Atualizar display
  const totalDisplay = document.getElementById('csvTotalAmount');
  if (totalDisplay) {
    totalDisplay.textContent = 'R$ ' + total.toFixed(2).replace('.', ',');
    totalDisplay.style.color = total > 0 ? '#28a745' : '#dc3545';
  }

  console.log('Total atualizado:', total);
}

// ============================================
// FUNÇÃO: Atualizar field e recalcular total
// ============================================
function updateCsvRowFieldAndTotal(index, field, value) {
  updateCsvRowField(index, field, value);
  // Recalcula o total sempre que o valor é alterado
  updateCsvTotal();
}

function updateCsvRowField(index, field, value) {
  if (!csvData[index]) return;
  
  if (!csvData[index]._edited) csvData[index]._edited = {};
  csvData[index]._edited[field] = value;
  
  console.log(`✏️ Atualizado [${index}] ${field}:`, value);
}

// ============================================
// ***** INÍCIO DAS NOVAS FUNÇÕES *****
// ============================================

/**
 * ✅ FUNÇÃO: Marcar/Desmarcar todos os checkboxes
 * (Adicionada - estava faltando)
 */
function toggleAllRows(checked) {
  console.log('Toggling all rows:', checked);
  const checkboxes = document.querySelectorAll('.csvRowCheckbox');
  checkboxes.forEach(cb => {
    cb.checked = checked;
  });
  updateCsvTotal();
}

/**
 * ✅ FUNÇÃO: Replicar cartão para todas as linhas
 * (Adicionada - estava faltando)
 */
function replicateCardToAllRows(cardId) {
  console.log('Card ID selecionado para todas as linhas:', cardId);
  // Esta função é chamada pelo <select> principal.
  // A lógica de importação (importSelectedTransactions)
  // vai ler o valor deste select principal.
  // Não é necessário fazer mais nada aqui.
}

/**
 * ✅ FUNÇÃO: Importar transações selecionadas
 * (Adicionada - esta era a função que não fazia nada)
 */
async function importSelectedTransactions() {
  if (CARD_MODE === 'statement-only') {
    alert('⚠️ Modo fatura total ativo. Use "Registrar Fatura" na aba Cartões.');
    return;
  }

  const selectedCheckboxes = document.querySelectorAll('.csvRowCheckbox:checked');
  const totalToImport = selectedCheckboxes.length;
  
  if (totalToImport === 0) {
    alert('⚠️ Nenhuma transação selecionada para importar.');
    return;
  }

  // 1. Pegar o cartão de crédito de destino do dropdown principal
  const targetCardId = document.getElementById('csvPreviewCardSelect')?.value;
  if (!targetCardId) {
    alert('❌ Por favor, selecione o Cartão de Crédito de destino no topo da tabela.');
    return;
  }

  const card = creditCards.find(c => c.id === targetCardId);
  if (!card) {
    alert('❌ Cartão de crédito selecionado não encontrado.');
    return;
  }
  
  console.log(`Importando ${totalToImport} transações para o cartão: ${card.bank_name}`);

  try {
    let successCount = 0;
    let errorCount = 0;
    let totalAmountImported = 0; // Para atualizar o saldo do cartão
    
    document.getElementById('importProgressSection').style.display = 'block';

    // Lista para guardar as transações a serem inseridas
    const transactionsToInsert = [];

    // 2. Loop para coletar dados
    for (let i = 0; i < selectedCheckboxes.length; i++) {
      const checkbox = selectedCheckboxes[i];
      const index = parseInt(checkbox.dataset.index);
      const rowElement = checkbox.closest('tr');
      const rowData = csvData[index];
      
      // 3. Coletar dados da linha (lendo dos inputs, que podem estar editados)
      const date = rowElement.querySelector('input[type="date"]').value;
      const description = rowElement.querySelector('input[type="text"]').value;
      const amountStr = rowElement.querySelector('input[type="number"]').value;
      const categoryId = rowElement.querySelector('select').value;
      
      // 4. Limpar e validar valor
      let amount = parseFloat(amountStr.toString().replace('R$', '').replace(/\s/g, '').replace(',', '.'));
      
      if (amount < 0) {
        amount = Math.abs(amount); // Garante que é positivo
      }

      if (!description || !amount || amount <= 0 || !date) {
        console.warn(`⚠️ Linha ${index + 1} (${description}) com dados inválidos, pulando...`);
        errorCount++;
        continue;
      }
      
      // 5. Adicionar à lista de inserção
      transactionsToInsert.push({
        user_id: currentUser.id,
        type: 'expense',
        date: date,
        description: description,
        amount: amount,
        account_id: card.account_id, // Conta vinculada ao cartão
        credit_card_id: card.id,       // ID do cartão de destino
        category_id: categoryId || null
      });
      
      totalAmountImported += amount;
      successCount++; // Presume sucesso por enquanto, o insert em lote validará
      
      // 6. Atualizar UI de progresso
      const progress = ((i + 1) / totalToImport) * 100;
      document.getElementById('importProgressBar').style.width = progress + '%';
      document.getElementById('importStatus').textContent = `Preparando: ${i + 1}/${totalToImport}...`;
    }
    
    // 7. Inserir todas as transações de uma vez (Bulk Insert)
    if (transactionsToInsert.length > 0) {
        console.log(`Enviando ${transactionsToInsert.length} transações para o Supabase...`);
        document.getElementById('importStatus').textContent = `Salvando ${transactionsToInsert.length} transações...`;
        
        const { error } = await supabase
            .from('transactions')
            .insert(transactionsToInsert);

        if (error) {
            // Se o bulk insert falhar, reverte contagem e mostra erro
            console.error('❌ Erro no bulk insert:', error);
            errorCount += transactionsToInsert.length;
            successCount = 0;
            totalAmountImported = 0;
            throw new Error('Erro ao salvar transações: ' + error.message);
        }
    }

    // 8. Finalizar
    document.getElementById('importStatus').textContent = `✅ Importação concluída! ${successCount} transações cadastradas, ${errorCount} erros.`;
    
    await loadAllData(); // Recarregar tudo
    
    setTimeout(() => {
      document.getElementById('csvUploadSection').style.display = 'block';
      document.getElementById('csvPreviewSection').style.display = 'none';
      document.getElementById('importProgressSection').style.display = 'none';
      document.getElementById('csvFileInput').value = '';
      csvData = [];
      csvHeaders = [];
      csvMapping = {};
      alert(`✅ Importação finalizada!\n✅ Sucesso: ${successCount}\n❌ Erros: ${errorCount}`);
      showView('transactions'); // Mudar para a tela de transações
    }, 2000);

  } catch (error) {
    console.error('❌ Erro geral na importação:', error);
    alert('❌ Erro: ' + error.message);
    document.getElementById('importProgressSection').style.display = 'none';
  }
}

// ============================================
// ***** FIM DAS NOVAS FUNÇÕES *****
// ============================================

function backToMapping() {
  document.getElementById('csvPreviewSection').style.display = 'none';
  document.getElementById('csvMappingSection').style.display = 'block';
  document.getElementById('importProgressSection').style.display = 'none';
  // Limpar dados para evitar confusão se o usuário voltar e carregar outro arquivo
  csvData = [];
  csvHeaders = [];
  csvMapping = {};
  document.getElementById('csvFileInput').value = '';
}

// ==================== TRANSAÇÕES PENDENTES DO TELEGRAM ====================

// Carregar transações pendentes do Supabase
async function loadPendingTransactions() {
  if (!supabase) {
    console.warn('Supabase não disponível');
    return;
  }

  try {
    let query = supabase
      .from('pending_transactions')
      .select('*')
      .in('status', ['pending_review', 'approved'])
      .order('created_at', { ascending: false });

    if (currentUser?.id) {
      query = query.eq('user_id', currentUser.id);
    }

    const { data, error } = await query;

    if (error) throw error;

    window.pendingTransactions = data || [];
    console.log('Transações pendentes carregadas:', window.pendingTransactions.length);
    displayPendingTransactions();

  } catch (error) {
    console.error('Erro ao carregar transações pendentes:', error);
  }
}

// Exibir transações pendentes na interface
function displayPendingTransactions() {
  const list = document.getElementById('pendingTransactionsList');
  if (!list) return;

  if (!window.pendingTransactions || window.pendingTransactions.length === 0) {
    list.innerHTML = `
      <div style="text-align: center; padding: 40px; color: #999;">
        <p>Nenhuma transação pendente</p>
      </div>
    `;
    return;
  }

  list.innerHTML = window.pendingTransactions.map((transaction, index) => {
    const data = transaction.extracted_data;
    const createdAt = new Date(transaction.created_at).toLocaleDateString('pt-BR');

    return `
      <div class="pending-transaction-card">
        <div class="pending-header">
          <div>
            <strong>${data.description}</strong>
            <span class="pending-source" style="margin-left: 10px; font-size: 12px; color: #666;">
              De: ${transaction.telegram_user_name}
            </span>
          </div>
          <span class="pending-date">${createdAt}</span>
        </div>

        <div class="pending-body">
          <div class="pending-row">
            <span class="pending-label">Tipo:</span>
            <span class="pending-value">${data.type}</span>
          </div>
          <div class="pending-row">
            <span class="pending-label">Valor:</span>
            <span class="pending-value" style="color: ${data.type === 'despesa' ? '#ef4444' : '#10b981'};">
              ${data.type === 'despesa' ? '-' : '+'}R$ ${parseFloat(data.amount).toFixed(2)}
            </span>
          </div>
          <div class="pending-row">
            <span class="pending-label">Categoria:</span>
            <span class="pending-value">${data.category}</span>
          </div>
          <div class="pending-row">
            <span class="pending-label">Conta/Banco:</span>
            <span class="pending-value">${data.account}</span>
          </div>
          <div class="pending-row">
            <span class="pending-label">Data:</span>
            <span class="pending-value">${new Date(data.date).toLocaleDateString('pt-BR')}</span>
          </div>
          <div class="pending-row">
            <span class="pending-label">Mensagem original:</span>
            <span class="pending-value" style="font-size: 12px; color: #666;">
              "${transaction.raw_message}"
            </span>
          </div>
        </div>

        <div class="pending-actions">
          <button class="btn btn--sm btn--primary" onclick="approvePendingTransaction('${transaction.id}', ${index})">
            ✅ Aprovar
          </button>
          <button class="btn btn--sm btn--outline" style="color: #ef4444;" onclick="rejectPendingTransaction('${transaction.id}')">
            ❌ Rejeitar
          </button>
        </div>
      </div>
    `;
  }).join('');
}

// Aprovar transação pendente e criar no registro definitivo
async function approvePendingTransaction(pendingId, index) {
  if (!confirm('Deseja confirmar esta transação?')) return;

  try {
    const pendingTrans = window.pendingTransactions[index];
    const data = pendingTrans.extracted_data;
    const rawType = (data.type || '').toLowerCase();
    const typeMap = {
      despesa: 'expense',
      receita: 'income',
      transfer: 'transfer',
      transferencia: 'transfer'
    };
    const transactionType = typeMap[rawType] || rawType;

    // Encontrar categoria
    const category = categories.find(c => 
      c.name.toLowerCase().includes(data.category.toLowerCase())
    );

    if (!category) {
      alert('❌ Categoria não encontrada: ' + data.category + '\nCategorias disponíveis: ' + categories.map(c => c.name).join(', '));
      return;
    }

    // Encontrar conta/banco
    const account = accounts.find(a => 
      a.name.toLowerCase().includes(data.account.toLowerCase())
    );

    if (!account) {
      alert('❌ Conta/Banco não encontrado: ' + data.account + '\nContas disponíveis: ' + accounts.map(a => a.name).join(', '));
      return;
    }

    // Criar transação no banco definitivo
    const transactionPayload = {
      user_id: currentUser.id,
      type: transactionType,
      amount: parseFloat(data.amount),
      description: data.description,
      category_id: category.id,
      date: data.date,
      account_id: account.id
    };

    const { data: createdTrans, error: transError } = await supabase
      .from('transactions')
      .insert([transactionPayload])
      .select()
      .single();

    if (transError) throw transError;

    // Atualizar saldo da conta
    if (transactionType === 'expense') {
      await supabase
        .from('accounts')
        .update({ balance: account.balance - parseFloat(data.amount) })
        .eq('id', account.id);
    } else if (transactionType === 'income') {
      await supabase
        .from('accounts')
        .update({ balance: account.balance + parseFloat(data.amount) })
        .eq('id', account.id);
    }

    // Marcar pendente como aprovado
    await supabase
      .from('pending_transactions')
      .update({ status: 'approved' })
      .eq('id', pendingId);

    alert('✅ Transação aprovada e lançada com sucesso!');
    loadPendingTransactions();
    loadTransactions();
    loadAccounts();

  } catch (error) {
    console.error('Erro ao aprovar:', error);
    alert('❌ Erro ao aprovar transação: ' + error.message);
  }
}

// Rejeitar transação pendente
async function rejectPendingTransaction(pendingId) {
  if (!confirm('Tem certeza que deseja rejeitar?')) return;

  try {
    await supabase
      .from('pending_transactions')
      .update({ status: 'rejected' })
      .eq('id', pendingId);

    alert('❌ Transação rejeitada');
    loadPendingTransactions();

  } catch (error) {
    alert('Erro ao rejeitar: ' + error.message);
  }
}
