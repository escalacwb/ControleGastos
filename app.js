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

// ============================================
// INICIALIZAÇÃO
// ============================================

async function initApp() {
  try {
    const supabaseUrl = localStorage.getItem('https://gbvjdntklbggxycmfyhg.supabase.co');
    const supabaseKey = localStorage.getItem('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdidmpkbnRrbGJnZ3h5Y21meWhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI1MzUyMzYsImV4cCI6MjA3ODExMTIzNn0.aNVzAIJFavtrBsYwkuXUfrbwBU2gO3xXuePIpTkNpdQ');

    // Se não tiver as credenciais, mostrar tela de configuração
    if (!supabaseUrl || !supabaseKey) {
      showConfigModal();
      return;
    }

    // Inicializar Supabase
    supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

    // Verificar sessão
    const { data } = await supabase.auth.getSession();
    
    if (data?.session) {
      currentUser = data.session.user;
      showScreen('mainApp');
      loadAllData();
    } else {
      showScreen('loginScreen');
    }
  } catch (error) {
    console.error('Erro na inicialização:', error);
    alert('Erro ao conectar com Supabase. Verifique as credenciais.');
    showScreen('loginScreen');
  }
}

async function loadAllData() {
  try {
    await Promise.all([
      loadAccounts(),
      loadCategories(),
      loadTransactions(),
      loadInvestments(),
      loadCreditCards()
    ]);
    updateDashboard();
  } catch (error) {
    console.error('Erro ao carregar dados:', error);
  }
}

// ============================================
// MODAL DE CONFIGURAÇÃO DO SUPABASE
// ============================================

function showConfigModal() {
  const html = `
    <div style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 9999;">
      <div style="background: white; padding: 30px; border-radius: 12px; max-width: 400px; width: 90%;">
        <h2 style="margin-bottom: 20px; color: #1F2937;">⚙️ Configurar Supabase</h2>
        
        <p style="margin-bottom: 15px; color: #6B7280; font-size: 14px;">
          Você precisa configurar suas credenciais do Supabase primeiro.
        </p>
        
        <div style="margin-bottom: 15px;">
          <label style="display: block; font-weight: 600; margin-bottom: 5px; color: #1F2937;">URL do Supabase:</label>
          <input type="text" id="configUrl" placeholder="https://xyzxyz.supabase.co" style="width: 100%; padding: 10px; border: 1px solid #E5E7EB; border-radius: 6px; font-size: 14px; box-sizing: border-box;">
        </div>
        
        <div style="margin-bottom: 20px;">
          <label style="display: block; font-weight: 600; margin-bottom: 5px; color: #1F2937;">Chave Pública (anon):</label>
          <input type="text" id="configKey" placeholder="eyJhbGciOiJIUzI1NiIsInR5..." style="width: 100%; padding: 10px; border: 1px solid #E5E7EB; border-radius: 6px; font-size: 14px; box-sizing: border-box;">
        </div>
        
        <p style="margin-bottom: 15px; color: #6B7280; font-size: 12px;">
          🔗 <strong>Como obter:</strong> Vá em Project Settings → API no seu projeto Supabase e copie a URL do projeto e a chave anon.
        </p>
        
        <button onclick="saveSupabaseConfig()" style="width: 100%; padding: 12px; background: #3B82F6; color: white; border: none; border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 14px;">
          Salvar Configuração
        </button>
      </div>
    </div>
  `;
  
  document.body.insertAdjacentHTML('beforeend', html);
}

function saveSupabaseConfig() {
  const url = document.getElementById('configUrl').value.trim();
  const key = document.getElementById('configKey').value.trim();

  if (!url || !key) {
    alert('Preencha URL e Chave do Supabase');
    return;
  }

  localStorage.setItem('supabase_url', url);
  localStorage.setItem('supabase_key', key);
  
  // Remover modal
  const modal = document.querySelector('div[style*="position: fixed"]');
  if (modal) modal.remove();
  
  // Reinicializar app
  initApp();
}

// ============================================
// AUTENTICAÇÃO
// ============================================

async function handleLogin() {
  if (!supabase) {
    alert('Supabase não está configurado');
    return;
  }

  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;

  if (!email || !password) {
    alert('Preencha email e senha');
    return;
  }

  try {
    const { data, error } = await supabase.auth.signInWithPassword({ 
      email, 
      password 
    });

    if (error) throw error;

    currentUser = data.user;
    showScreen('mainApp');
    loadAllData();
  } catch (error) {
    alert('Erro no login: ' + error.message);
  }
}

async function handleSignup() {
  if (!supabase) {
    alert('Supabase não está configurado');
    return;
  }

  const email = document.getElementById('signupEmail').value.trim();
  const password = document.getElementById('signupPassword').value;

  if (!email || !password) {
    alert('Preencha email e senha');
    return;
  }

  try {
    const { data, error } = await supabase.auth.signUp({ 
      email, 
      password 
    });

    if (error) throw error;
    
    alert('Conta criada! Verifique seu email para confirmar.');
    showLogin();
  } catch (error) {
    alert('Erro no cadastro: ' + error.message);
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
  document.getElementById(screenId).classList.add('active');
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
  document.querySelector(`[data-view="${viewName}"]`).classList.add('active');

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
    document.getElementById(viewId).classList.add('active');
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
  if (!supabase || !currentUser) return;
  
  try {
    const { data, error } = await supabase
      .from('credit_cards')
      .select('*')
      .eq('user_id', currentUser.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    creditCards = data || [];
    displayCreditCards();
  } catch (error) {
    console.error('Erro ao carregar cartões:', error);
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
    alert('Erro: Supabase não está configurado');
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
    alert('Insira um valor válido');
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
      .update({ balance: (card.balance || 0) - amount })
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
    updateAccountSelects();
    displayAccounts();
  } catch (error) {
    console.error('Erro ao carregar contas:', error);
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

    closeModal('accountModal');
    loadAccounts();
  } catch (error) {
    alert('Erro ao salvar conta: ' + error.message);
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
    alert('Erro ao deletar: ' + error.message);
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
    updateCategorySelects();
    displayCategories();
  } catch (error) {
    console.error('Erro ao carregar categorias:', error);
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
          <div style="font-size: 12px; color: #666;">${cat.primary_allocation} → ${cat.secondary_allocation}</div>
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
          <div style="font-size: 12px; color: #666;">${cat.primary_allocation}</div>
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

    closeModal('categoryModal');
    loadCategories();
  } catch (error) {
    alert('Erro ao salvar categoria: ' + error.message);
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
    alert('Erro ao deletar: ' + error.message);
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
    filterTransactions();
  } catch (error) {
    console.error('Erro ao carregar transações:', error);
  }
}

function updateTransactionForm() {
  const type = document.getElementById('transactionType').value;
  document.getElementById('categoryGroup').style.display = type === 'transfer' ? 'none' : 'block';
  document.getElementById('transferToGroup').style.display = type === 'transfer' ? 'block' : 'none';
  updateCategorySelects();
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
      <div class="transaction-item">
        <div style="display: flex; align-items: center; gap: 12px; flex: 1;">
          <div style="width: 8px; height: 8px; border-radius: 50%; background-color: ${typeColor};"></div>
          <div style="flex: 1;">
            <div style="font-weight: bold;">${trans.description}</div>
            <div style="font-size: 12px; color: #666;">${new Date(trans.date).toLocaleDateString('pt-BR')} • ${account?.name || 'Conta'} • ${category?.name || 'Outra'}</div>
          </div>
        </div>
        <div style="text-align: right;">
          <div style="font-weight: bold; color: ${typeColor};">
            ${trans.type === 'expense' ? '-' : trans.type === 'income' ? '+' : ''} R$ ${trans.amount.toFixed(2)}
          </div>
          <div style="font-size: 12px; color: #999;">${typeLabel}</div>
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

    closeModal('transactionModal');
    loadTransactions();
    loadAccounts();
    loadCreditCards();
  } catch (error) {
    alert('Erro ao salvar transação: ' + error.message);
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
    filterInvestments();
  } catch (error) {
    console.error('Erro ao carregar investimentos:', error);
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

    closeModal('investmentModal');
    loadInvestments();
  } catch (error) {
    alert('Erro ao salvar investimento: ' + error.message);
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
    alert('Erro ao deletar: ' + error.message);
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

    closeModal('investmentTransactionModal');
    loadInvestments();
  } catch (error) {
    alert('Erro ao salvar: ' + error.message);
  }
}

// ============================================
// DASHBOARD
// ============================================

function updateDashboard() {
  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();

  const monthTransactions = transactions.filter(t => {
    const date = new Date(t.date);
    return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
  });

  const income = monthTransactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
  const expense = monthTransactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
  const balance = income - expense;

  const totalAccounts = accounts.reduce((sum, a) => sum + parseFloat(a.balance), 0);
  const totalInvested = investments.reduce((sum, i) => sum + i.current_value, 0);
  const totalCardsDebt = creditCards.reduce((sum, c) => sum + (c.balance || 0), 0);
  const netWorth = totalAccounts + totalInvested - totalCardsDebt;

  const monthIncEl = document.getElementById('monthIncomeValue');
  const monthExpEl = document.getElementById('monthExpenseValue');
  const monthBalEl = document.getElementById('monthBalanceValue');
  const totalAccEl = document.getElementById('totalAccountsValue');
  const totalInvEl = document.getElementById('totalInvestedValue');
  const totalCardEl = document.getElementById('totalCardsDebtValue');
  const netWorthEl = document.getElementById('netWorthValue');

  if (monthIncEl) monthIncEl.textContent = `R$ ${income.toFixed(2)}`;
  if (monthExpEl) monthExpEl.textContent = `R$ ${expense.toFixed(2)}`;
  if (monthBalEl) monthBalEl.textContent = `R$ ${balance.toFixed(2)}`;
  if (totalAccEl) totalAccEl.textContent = `R$ ${totalAccounts.toFixed(2)}`;
  if (totalInvEl) totalInvEl.textContent = `R$ ${totalInvested.toFixed(2)}`;
  if (totalCardEl) totalCardEl.textContent = `R$ ${totalCardsDebt.toFixed(2)}`;
  if (netWorthEl) netWorthEl.textContent = `R$ ${netWorth.toFixed(2)}`;

  updateCharts();
}

function updateCharts() {
  // Implementar gráficos com Chart.js se necessário
}

// ============================================
// INICIALIZAR APP QUANDO PÁGINA CARREGAR
// ============================================

document.addEventListener('DOMContentLoaded', () => {
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
});
