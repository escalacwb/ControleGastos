// ============================================
// VARIÁVEIS GLOBAIS
// ============================================

let supabase = null;
let currentUser = null;
let accounts = [];
let categories = [];
let transactions = [];
let investments = [];
let creditCards = [];
let currentView = 'dashboard';
let charts = {};
let filterCategory = 'all';  // 'all' ou ID da categoria
let filterType = 'all';      // 'all', 'income', 'expense', 'transfer'
let filterAccount = 'all';   // 'all' ou ID da conta
let filterDateStart = null;  // Data inicial (YYYY-MM-DD)
let filterDateEnd = null;    // Data final (YYYY-MM-DD)

// ============================================
// CONFIGURAÇÃO DO SUPABASE (EMBUTIDA)
// ============================================

const SUPABASE_URL = 'https://gbvjdntklbggxycmfyhg.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdidmpkbnRrbGJnZ3h5Y21meWhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI1MzUyMzYsImV4cCI6MjA3ODExMTIzNn0.aNVzAIJFavtrBsYwkuXUfrbwBU2gO3xXuePIpTkNpdQ';

// ============================================
// INICIALIZAÇÃO
// ============================================

async function initApp() {
  try {
    console.log('🚀 Iniciando aplicação...');
    
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
      startAutoReload(30);
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
  try {
    console.log('📥 Carregando todos os dados...');
    
    await Promise.all([
      loadAccounts(),
      loadCategories(),
      loadTransactions(),
      loadInvestments(),
      loadCreditCards()
    ]);

    // Recalcular saldos após carregar transações
    await recalculateAccountBalances();

    updateDashboard();
    
    console.log('✅ Todos os dados carregados!');
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
    'investments': 'investmentsView'
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
    console.warn('⚠️ Não é possível carregar cartões: supabase ou usuário não disponível');
    return;
  }
  
  try {
    const { data, error } = await supabase
      .from('credit_cards')
      .select('*')
      .eq('user_id', currentUser.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    creditCards = data || [];
    console.log('✅ Cartões carregados:', creditCards.length);
    displayCreditCards();
  } catch (error) {
    console.error('❌ Erro ao carregar cartões:', error);
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
    const saldo = card.balance || 0;
    const utilizacao = (saldo / card.credit_limit * 100).toFixed(1);
    const disponivel = card.credit_limit - saldo;
    
    let statusClass = 'status-ok';
    let statusText = '✅ OK';
    
    if (utilizacao > 80) {
      statusClass = 'status-danger';
      statusText = '⚠️ ATENÇÃO';
    } else if (utilizacao > 50) {
      statusClass = 'status-warning';
      statusText = '🟡 AVISO';
    }

    return `
      <div class="credit-card-item" style="background: ${getCardGradient(card.card_network)};">
        <div class="card-header">
          <div class="card-info-left">
            <div class="card-bank">${card.bank_name}</div>
            <div class="card-network">${card.card_network}</div>
          </div>
          <div class="card-digits">•••• ${card.last_four_digits}</div>
        </div>

        <div class="card-body">
          <div class="card-info-row">
            <span class="card-info-label">Saldo Atual</span>
            <span class="card-info-value">R$ ${saldo.toFixed(2)}</span>
          </div>
          <div class="card-info-row">
            <span class="card-info-label">Limite</span>
            <span class="card-info-value">R$ ${card.credit_limit.toFixed(2)}</span>
          </div>
          <div class="card-info-row">
            <span class="card-info-label">Disponível</span>
            <span class="card-info-value">R$ ${disponivel.toFixed(2)}</span>
          </div>
          <div class="card-progress-bar">
            <div class="card-progress-fill" style="width: ${Math.min(utilizacao, 100)}%"></div>
          </div>
          <div class="card-status ${statusClass}">${statusText} - ${utilizacao}%</div>
        </div>

        <div class="card-footer">
          <button class="card-btn" onclick="showCreditCardDetail('${card.id}')">Detalhes</button>
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

async function showCreditCardDetail(cardId) {
  const card = creditCards.find(c => c.id === cardId);
  if (!card) return;

  const { data: cardTransactions } = await supabase
    .from('transactions')
    .select('*')
    .eq('account_id', card.account_id)
    .gte('date', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0])
    .order('date', { ascending: false });

  const totalGasto = cardTransactions?.reduce((sum, t) => sum + (t.type === 'expense' ? t.amount : 0), 0) || 0;
  const utilizacao = ((card.balance || 0) / card.credit_limit * 100).toFixed(1);
  const disponivel = card.credit_limit - (card.balance || 0);

  const content = `
    <div style="padding: 20px;">
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px;">
        <div>
          <p><strong>Banco:</strong> ${card.bank_name}</p>
          <p><strong>Bandeira:</strong> ${card.card_network}</p>
          <p><strong>Dígitos:</strong> •••• ${card.last_four_digits}</p>
          <p><strong>Titular:</strong> ${card.holder_name}</p>
        </div>
        <div>
          <p><strong>Limite:</strong> R$ ${card.credit_limit.toFixed(2)}</p>
          <p><strong>Saldo:</strong> R$ ${(card.balance || 0).toFixed(2)}</p>
          <p><strong>Disponível:</strong> R$ ${disponivel.toFixed(2)}</p>
          <p><strong>Utilização:</strong> ${utilizacao}%</p>
        </div>
      </div>

      <h4>Transações do Ciclo Atual</h4>
      <table style="width: 100%; border-collapse: collapse;">
        <tr style="background: #f5f5f5;">
          <th style="padding: 8px; text-align: left; border-bottom: 2px solid #ddd;">Data</th>
          <th style="padding: 8px; text-align: left; border-bottom: 2px solid #ddd;">Descrição</th>
          <th style="padding: 8px; text-align: right; border-bottom: 2px solid #ddd;">Valor</th>
        </tr>
        ${cardTransactions?.map(t => `
          <tr style="border-bottom: 1px solid #eee;">
            <td style="padding: 8px;">${new Date(t.date).toLocaleDateString('pt-BR')}</td>
            <td style="padding: 8px;">${t.description}</td>
            <td style="padding: 8px; text-align: right; color: #ef4444;">R$ ${t.amount.toFixed(2)}</td>
          </tr>
        `).join('') || '<tr><td colspan="3" style="padding: 8px; text-align: center;">Nenhuma transação</td></tr>'}
      </table>

      <p style="margin-top: 20px; font-weight: bold; text-align: right;">
        Total: R$ ${totalGasto.toFixed(2)}
      </p>
    </div>
  `;

  document.getElementById('cardDetailTitle').textContent = `${card.bank_name} - ${card.card_network}`;
  document.getElementById('cardDetailContent').innerHTML = content;
  openModal('creditCardDetailModal');
}

function showPayCardModal(cardId) {
  const card = creditCards.find(c => c.id === cardId);
  if (!card) return;

  const saldo = card.balance || 0;
  document.getElementById('payCardInfo').innerHTML = 
    `<strong>${card.bank_name}</strong> - Saldo a pagar: <strong>R$ ${saldo.toFixed(2)}</strong>`;
  document.getElementById('payCardAmount').value = saldo.toFixed(2);
  document.getElementById('payCardDate').valueAsDate = new Date();

  const fromAccountSelect = document.getElementById('payCardFromAccount');
  fromAccountSelect.innerHTML = accounts
    .filter(a => a.type !== 'credit_card')
    .map(a => `<option value="${a.id}">${a.name}</option>`)
    .join('');

  document.getElementById('payCardModal').dataset.cardId = cardId;
  openModal('payCardModal');
}

async function processCardPayment() {
  const cardId = document.getElementById('payCardModal').dataset.cardId;
  const card = creditCards.find(c => c.id === cardId);
  const amount = parseFloat(document.getElementById('payCardAmount').value);
  const date = document.getElementById('payCardDate').value;
  const fromAccountId = document.getElementById('payCardFromAccount').value;

  if (!amount || amount <= 0) {
    alert('❌ Insira um valor válido');
    return;
  }

  try {
    const { error: transError } = await supabase
      .from('transactions')
      .insert([{
        user_id: currentUser.id,
        type: 'transfer',
        amount: amount,
        date: date,
        description: `Pagamento ${card.bank_name}`,
        account_id: fromAccountId,
        transfer_to_account_id: card.account_id
      }]);

    if (transError) throw transError;

    await supabase
      .from('card_payments')
      .insert([{
        user_id: currentUser.id,
        credit_card_id: cardId,
        account_id: fromAccountId,
        amount: amount,
        payment_date: date,
        payment_method: 'bank_transfer',
        status: 'paid'
      }]);

    await supabase
      .from('credit_cards')
      .update({ balance: Math.max(0, (card.balance || 0) - amount) })
      .eq('id', cardId);

    alert('✅ Pagamento registrado com sucesso!');
    closeModal('payCardModal');
    loadCreditCards();
    loadAccounts();
    loadTransactions();
  } catch (error) {
    alert('❌ Erro ao processar pagamento: ' + error.message);
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

function updateAccountSelects() {
  const selects = [
    'transactionAccount',
    'transactionTransferTo',
    'investmentAccount',
    'invTransactionAccount',
    'creditCardAccount',
    'payCardFromAccount'
  ];

  selects.forEach(selectId => {
    const select = document.getElementById(selectId);
    if (select) {
      select.innerHTML = accounts.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
    }
  });

  const filterSelect = document.getElementById('transactionAccountFilter');
  if (filterSelect) {
    const currentValue = filterSelect.value;
    filterSelect.innerHTML = '<option value="all">Todas as Contas</option>' +
      accounts.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
    filterSelect.value = currentValue;
  }
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
  const categoryField = document.getElementById('transactionCategoryField');
  const transferField = document.getElementById('transactionTransferField');
  
  // Mostrar/ocultar campos baseado no tipo
  if (categoryField) {
    categoryField.style.display = type === 'transfer' ? 'none' : 'block';
  }
  
  if (transferField) {
    transferField.style.display = type === 'transfer' ? 'block' : 'none';
  }
  
  console.log(`📋 Formulário atualizado para tipo: ${type}`);
}

function filterTransactions() {
  const typeFilter = document.getElementById('transactionTypeFilter')?.value || 'all';
  const accountFilter = document.getElementById('transactionAccountFilter')?.value || 'all';
  const categoryFilter = document.getElementById('transactionCategoryFilter')?.value || 'all';

  let filtered = transactions;

  if (typeFilter !== 'all') {
    filtered = filtered.filter(t => t.type === typeFilter);
  }
  if (accountFilter !== 'all') {
    filtered = filtered.filter(t => t.account_id === accountFilter);
  }
  if (categoryFilter !== 'all') {
    filtered = filtered.filter(t => t.category_id === categoryFilter);
  }

  displayTransactions(filtered);
  updateTransactionTotals(filtered);
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

  const data = {
    user_id: currentUser.id,
    type: document.getElementById('transactionType').value,
    amount: parseFloat(document.getElementById('transactionAmount').value),
    date: document.getElementById('transactionDate').value,
    description: document.getElementById('transactionDescription').value,
    account_id: document.getElementById('transactionAccount').value,
    category_id: document.getElementById('transactionType').value === 'transfer' ? null : document.getElementById('transactionCategory').value,
    transfer_to_account_id: document.getElementById('transactionType').value === 'transfer' ? document.getElementById('transactionTransferTo').value : null
  };

  try {
    const { error } = await supabase
      .from('transactions')
      .insert([data]);

    if (error) throw error;

    const account = accounts.find(a => a.id === data.account_id);
    if (account) {
      let newBalance = account.balance;
      if (data.type === 'expense') newBalance -= data.amount;
      if (data.type === 'income') newBalance += data.amount;
      if (data.type === 'transfer') newBalance -= data.amount;

      await supabase
        .from('accounts')
        .update({ balance: newBalance })
        .eq('id', data.account_id);

      if (data.type === 'transfer' && data.transfer_to_account_id) {
        const targetAccount = accounts.find(a => a.id === data.transfer_to_account_id);
        if (targetAccount) {
          await supabase
            .from('accounts')
            .update({ balance: targetAccount.balance + data.amount })
            .eq('id', data.transfer_to_account_id);
        }
      }
    }

    if (data.type === 'expense') {
      const card = creditCards.find(c => c.account_id === data.account_id);
      if (card) {
        await supabase
          .from('credit_cards')
          .update({ balance: (card.balance || 0) + data.amount })
          .eq('id', card.id);
      }
    }

    alert('✅ Transação registrada com sucesso!');
    closeModal('transactionModal');
    loadTransactions();
    loadAccounts();
    loadCreditCards();
  } catch (error) {
    alert('❌ Erro ao salvar transação: ' + error.message);
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

function updateDashboard() {
  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();
  const lastYear = currentYear - 1;

  // ============================================
  // 1. DADOS DO MÊS ATUAL
  // ============================================
  
  const monthTransactions = transactions.filter(t => {
    const date = new Date(t.date);
    return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
  });

  const monthIncome = monthTransactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
  const monthExpense = monthTransactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
  const monthBalance = monthIncome - monthExpense;

  // ============================================
  // 2. DADOS DO ANO ATUAL
  // ============================================
  
  const yearTransactions = transactions.filter(t => {
    const date = new Date(t.date);
    return date.getFullYear() === currentYear;
  });

  const yearIncome = yearTransactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
  const yearExpense = yearTransactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
  const yearBalance = yearIncome - yearExpense;

  // ============================================
  // 3. DADOS DO ANO ANTERIOR (COMPARATIVO)
  // ============================================
  
  const lastYearTransactions = transactions.filter(t => {
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
  const totalInvested = investments.reduce((sum, i) => sum + (i.currentvalue || 0), 0);
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
    
    const monthTrans = transactions.filter(t => {
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

  // Insights
  updateElement('topCategoryName', topCategoryName);
  updateElement('topCategoryValue', `R$ ${topCategoryValue.toFixed(2)}`);
  updateElement('avgMonthExpenseValue', `R$ ${avgMonthExpense.toFixed(2)}`);

  console.log('✅ Dashboard atualizado!');
  console.log(`📊 Mês: R$ ${monthBalance.toFixed(2)} | Ano: R$ ${yearBalance.toFixed(2)}`);
}

// Função auxiliar para atualizar elementos
function updateElement(id, value) {
  const el = document.getElementById(id);
  if (el) {
    el.textContent = value;
  }
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
    console.log('💾 Salvando alterações...');

    const updateData = {
      type: document.getElementById('transactionType').value,
      amount: parseFloat(document.getElementById('transactionAmount').value),
      date: document.getElementById('transactionDate').value,
      description: document.getElementById('transactionDescription').value,
      category_id: document.getElementById('transactionType').value === 'transfer' ? null : document.getElementById('transactionCategory').value,
    };

    // Calcular diferença de saldo (se mudou o valor)
    const diferenca = updateData.amount - transaction.amount;
    console.log(`📊 Diferença de valor: R$ ${diferenca}`);

    // Atualizar no Supabase
    const { error } = await supabase
      .from('transactions')
      .update(updateData)
      .eq('id', transactionId);

    if (error) throw error;
    console.log('✅ Transação atualizada no Supabase');

    // Ajustar saldo da conta se o valor mudou
    if (diferenca !== 0) {
      const account = accounts.find(a => a.id === transaction.account_id);
      if (account) {
        const novoSaldo = account.balance - diferenca;
        await supabase
          .from('accounts')
          .update({ balance: novoSaldo })
          .eq('id', transaction.account_id);
        console.log(`✅ Saldo da conta ajustado: ${account.name}`);
      }

      // Ajustar cartão de crédito se for despesa
      if (updateData.type === 'expense') {
        const card = creditCards.find(c => c.account_id === transaction.account_id);
        if (card) {
          const novoSaldoCard = (card.balance || 0) + diferenca;
          await supabase
            .from('credit_cards')
            .update({ balance: novoSaldoCard })
            .eq('id', card.id);
          console.log(`✅ Saldo do cartão ajustado`);
        }
      }
    }

    alert('✅ Transação atualizada com sucesso!');
    closeModal('transactionModal');
    
    // Resetar modal para novo lançamento
    resetTransactionModal();

    // Recarregar dados
    await Promise.all([
      loadTransactions(),
      loadAccounts(),
      loadCreditCards()
    ]);
    
    console.log('✅ Dados recarregados');
  } catch (error) {
    console.error('❌ Erro ao atualizar:', error);
    alert('❌ Erro ao atualizar transação: ' + error.message);
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

    // Obter dados do formulário
    const updateData = {
      type: document.getElementById('transactionType').value,
      amount: parseFloat(document.getElementById('transactionAmount').value),
      date: document.getElementById('transactionDate').value,
      description: document.getElementById('transactionDescription').value,
      // ⚠️ IMPORTANTE: Incluir account_id na atualização
      account_id: document.getElementById('transactionAccount').value,
      category_id: document.getElementById('transactionType').value === 'transfer' 
        ? null 
        : (document.getElementById('transactionCategory').value || null),
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

    // Se conta mudou, reverter saldo da conta antiga
    if (contaMudou) {
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
    } else {
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

    // Ajustar cartão de crédito se for despesa
    if (updateData.type === 'expense') {
      const card = creditCards.find(c => c.account_id === novaContaId);
      if (card) {
        let novoSaldoCard = (card.balance || 0);
        
        // Se mudou de conta, remover da conta anterior
        if (contaMudou) {
          const cardAntiga = creditCards.find(c => c.account_id === transaction.account_id);
          if (cardAntiga) {
            novoSaldoCard = (cardAntiga.balance || 0) - transaction.amount;
            await supabase
              .from('credit_cards')
              .update({ balance: novoSaldoCard })
              .eq('id', cardAntiga.id);
          }
        }
        
        // Adicionar à nova conta
        novoSaldoCard = (card.balance || 0) + updateData.amount;
        await supabase
          .from('credit_cards')
          .update({ balance: novoSaldoCard })
          .eq('id', card.id);
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

    // Reverter saldo do cartão se for despesa
    if (transaction.type === 'expense') {
      const card = creditCards.find(c => c.account_id === transaction.account_id);
      if (card) {
        await supabase
          .from('credit_cards')
          .update({ balance: Math.max(0, (card.balance || 0) - transaction.amount) })
          .eq('id', card.id);
        console.log('✅ Saldo do cartão revertido');
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

document.addEventListener('DOMContentLoaded', () => {
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
  initApp();

  // Iniciar auto-reload
let autoReloadInterval = null;

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
  console.log('🔍 Aplicando filtros...');
  console.log({
    category: filterCategory,
    type: filterType,
    account: filterAccount,
    dateStart: filterDateStart,
    dateEnd: filterDateEnd
  });

  let filtered = transactions;

  // Filtro por tipo
  if (filterType !== 'all') {
    filtered = filtered.filter(t => t.type === filterType);
    console.log(`✅ Filtrado por tipo: ${filterType} (${filtered.length} transações)`);
  }

  // Filtro por conta
  if (filterAccount !== 'all') {
    filtered = filtered.filter(t => t.account_id === filterAccount);
    console.log(`✅ Filtrado por conta: ${filterAccount} (${filtered.length} transações)`);
  }

  // Filtro por categoria
  if (filterCategory !== 'all') {
    filtered = filtered.filter(t => t.category_id === filterCategory);
    console.log(`✅ Filtrado por categoria: ${filterCategory} (${filtered.length} transações)`);
  }

  // Filtro por data inicial
  if (filterDateStart) {
    filtered = filtered.filter(t => {
      const transDate = new Date(t.date);
      const startDate = new Date(filterDateStart);
      return transDate >= startDate;
    });
    console.log(`✅ Filtrado data inicial: ${filterDateStart} (${filtered.length} transações)`);
  }

  // Filtro por data final
  if (filterDateEnd) {
    filtered = filtered.filter(t => {
      const transDate = new Date(t.date);
      const endDate = new Date(filterDateEnd);
      endDate.setHours(23, 59, 59, 999); // Incluir todo o dia final
      return transDate <= endDate;
    });
    console.log(`✅ Filtrado data final: ${filterDateEnd} (${filtered.length} transações)`);
  }

  // Ordenar por data (mais recente primeiro)
  filtered.sort((a, b) => new Date(b.date) - new Date(a.date));

  // Exibir transações filtradas
  displayTransactions(filtered);

  // Atualizar totais
  updateFilteredTotals(filtered);

  console.log(`✅ Filtros aplicados! Total: ${filtered.length} transações`);
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
// ATALHOS DE DATA
// ============================================

function filterLast7Days() {
  const today = new Date();
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(today.getDate() - 7);

  filterDateStart = sevenDaysAgo.toISOString().split('T')[0];
  filterDateEnd = today.toISOString().split('T')[0];

  document.getElementById('filterDateStart').value = filterDateStart;
  document.getElementById('filterDateEnd').value = filterDateEnd;

  console.log(`📅 Filtro: Últimos 7 dias (${filterDateStart} a ${filterDateEnd})`);
  applyFilters();
}

function filterLast30Days() {
  const today = new Date();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(today.getDate() - 30);

  filterDateStart = thirtyDaysAgo.toISOString().split('T')[0];
  filterDateEnd = today.toISOString().split('T')[0];

  document.getElementById('filterDateStart').value = filterDateStart;
  document.getElementById('filterDateEnd').value = filterDateEnd;

  console.log(`📅 Filtro: Últimos 30 dias (${filterDateStart} a ${filterDateEnd})`);
  applyFilters();
}

function filterThisMonth() {
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);

  filterDateStart = firstDay.toISOString().split('T')[0];
  filterDateEnd = lastDay.toISOString().split('T')[0];

  document.getElementById('filterDateStart').value = filterDateStart;
  document.getElementById('filterDateEnd').value = filterDateEnd;

  console.log(`📅 Filtro: Este mês (${filterDateStart} a ${filterDateEnd})`);
  applyFilters();
}

function filterLastMonth() {
  const today = new Date();
  const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1);
  
  const firstDay = new Date(lastMonth.getFullYear(), lastMonth.getMonth(), 1);
  const lastDay = new Date(lastMonth.getFullYear(), lastMonth.getMonth() + 1, 0);

  filterDateStart = firstDay.toISOString().split('T')[0];
  filterDateEnd = lastDay.toISOString().split('T')[0];

  document.getElementById('filterDateStart').value = filterDateStart;
  document.getElementById('filterDateEnd').value = filterDateEnd;

  console.log(`📅 Filtro: Mês passado (${filterDateStart} a ${filterDateEnd})`);
  applyFilters();
}

function filterThisYear() {
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), 0, 1);
  const lastDay = new Date(today.getFullYear(), 11, 31);

  filterDateStart = firstDay.toISOString().split('T')[0];
  filterDateEnd = lastDay.toISOString().split('T')[0];

  document.getElementById('filterDateStart').value = filterDateStart;
  document.getElementById('filterDateEnd').value = filterDateEnd;

  console.log(`📅 Filtro: Este ano (${filterDateStart} a ${filterDateEnd})`);
  applyFilters();
}
  
});
