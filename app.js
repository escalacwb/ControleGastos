// Supabase Configuration
const SUPABASE_URL = 'https://gbvjdntklbggxycmfyhg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdidmpkbnRrbGJnZ3h5Y21meWhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI1MzUyMzYsImV4cCI6MjA3ODExMTIzNn0.aNVzAIJFavtrBsYwkuXUfrbwBU2gO3xXuePIpTkNpdQ';

let supabase;
let currentUser = null;
let accounts = [];
let categories = [];
let transactions = [];
let investments = [];
let investmentTransactions = [];
let currentInvestmentId = null;

// Investment Type Configuration
const investmentTypes = {
  stocks: { label: 'Ações', icon: '📈', color: '#3B82F6' },
  fixed_income: { label: 'Renda Fixa', icon: '💰', color: '#10B981' },
  funds: { label: 'Fundos', icon: '🏦', color: '#F59E0B' },
  crypto: { label: 'Criptomoedas', icon: '₿', color: '#8B5CF6' },
  real_estate: { label: 'Imóveis', icon: '🏠', color: '#EC4899' },
  other: { label: 'Outros', icon: '📦', color: '#6B7280' }
};

const investmentTransactionTypes = {
  contribution: { label: 'Aporte', icon: '💵', color: '#EF4444' },
  withdrawal: { label: 'Resgate', icon: '💸', color: '#10B981' },
  yield: { label: 'Rendimento', icon: '📊', color: '#3B82F6' },
  dividend: { label: 'Dividendo', icon: '💰', color: '#8B5CF6' }
};

// Initialize App
window.addEventListener('DOMContentLoaded', () => {
  initSupabase();
});

function initSupabase() {
  if (SUPABASE_URL === 'YOUR_SUPABASE_URL' || SUPABASE_ANON_KEY === 'YOUR_SUPABASE_ANON_KEY') {
    showSetupInstructions();
    return;
  }

  supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  checkAuth();
}

function showSetupInstructions() {
  const loginScreen = document.getElementById('loginScreen');
  loginScreen.innerHTML = `
    <div class="login-container">
      <div class="login-header">
        <h1>⚙️ Configuração Necessária</h1>
        <p>Configure seu Supabase para começar</p>
      </div>
      <div style="text-align: left; padding: var(--space-20); background: var(--color-bg-2); border-radius: var(--radius-lg); margin-top: var(--space-24);">
        <h3 style="margin-bottom: var(--space-16);">Passos para Configurar:</h3>
        <ol style="margin-left: var(--space-20); line-height: 1.8;">
          <li>Crie uma conta no <a href="https://supabase.com" target="_blank" style="color: var(--color-primary);">Supabase</a></li>
          <li>Crie um novo projeto</li>
          <li>No painel do projeto, vá em Settings → API</li>
          <li>Copie a URL do projeto e a chave anon/public</li>
          <li>Execute o SQL Schema fornecido no SQL Editor</li>
          <li>Cole suas credenciais no arquivo app.js:</li>
        </ol>
        <pre style="background: var(--color-surface); padding: var(--space-12); border-radius: var(--radius-base); margin-top: var(--space-12); overflow-x: auto;"><code>const SUPABASE_URL = 'sua-url-aqui';
const SUPABASE_ANON_KEY = 'sua-chave-aqui';</code></pre>
        <h4 style="margin-top: var(--space-20); margin-bottom: var(--space-12);">SQL Schema Completo:</h4>
        <pre style="background: var(--color-surface); padding: var(--space-12); border-radius: var(--radius-base); overflow-x: auto; max-height: 300px; font-size: 11px;"><code>-- Complete schema
alter table accounts enable row level security;
alter table categories enable row level security;
alter table transactions enable row level security;
alter table investments enable row level security;
alter table investment_transactions enable row level security;

CREATE TABLE accounts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users NOT NULL,
  name text NOT NULL,
  type text NOT NULL,
  balance decimal(15,2) DEFAULT 0,
  created_at timestamp DEFAULT now()
);

CREATE TABLE categories (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users NOT NULL,
  name text NOT NULL,
  type text NOT NULL,
  primary_allocation text,
  secondary_allocation text,
  color text DEFAULT '#3B82F6',
  created_at timestamp DEFAULT now()
);

CREATE TABLE transactions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users NOT NULL,
  account_id uuid REFERENCES accounts,
  category_id uuid REFERENCES categories,
  type text NOT NULL,
  amount decimal(15,2) NOT NULL,
  description text,
  date date NOT NULL,
  transfer_to_account_id uuid REFERENCES accounts,
  created_at timestamp DEFAULT now()
);

CREATE TABLE investments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users NOT NULL,
  name text NOT NULL,
  type text NOT NULL,
  initial_amount decimal(15,2) NOT NULL,
  current_value decimal(15,2) NOT NULL,
  purchase_date date NOT NULL,
  maturity_date date,
  institution text,
  notes text,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE TABLE investment_transactions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users NOT NULL,
  investment_id uuid REFERENCES investments NOT NULL,
  account_id uuid REFERENCES accounts,
  type text NOT NULL,
  amount decimal(15,2) NOT NULL,
  date date NOT NULL,
  description text,
  created_at timestamp DEFAULT now()
);

CREATE INDEX idx_transactions_user_id ON transactions(user_id);
CREATE INDEX idx_transactions_date ON transactions(date);
CREATE INDEX idx_accounts_user_id ON accounts(user_id);
CREATE INDEX idx_categories_user_id ON categories(user_id);
CREATE INDEX idx_investments_user_id ON investments(user_id);
CREATE INDEX idx_investment_transactions_user_id ON investment_transactions(user_id);

CREATE POLICY "Users can view own accounts" ON accounts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own accounts" ON accounts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own accounts" ON accounts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own accounts" ON accounts FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own categories" ON categories FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own categories" ON categories FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own categories" ON categories FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own categories" ON categories FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own transactions" ON transactions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own transactions" ON transactions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own transactions" ON transactions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own transactions" ON transactions FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own investments" ON investments FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own investments" ON investments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own investments" ON investments FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own investments" ON investments FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own investment_transactions" ON investment_transactions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own investment_transactions" ON investment_transactions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own investment_transactions" ON investment_transactions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own investment_transactions" ON investment_transactions FOR DELETE USING (auth.uid() = user_id);</code></pre>
      </div>
    </div>
  `;
}

// Auth Functions
async function checkAuth() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    currentUser = session.user;
    showMainApp();
  } else {
    showLogin();
  }
}

function showLogin() {
  document.getElementById('loginScreen').classList.add('active');
  document.getElementById('signupScreen').classList.remove('active');
  document.getElementById('mainApp').classList.remove('active');
}

function showSignup() {
  document.getElementById('loginScreen').classList.remove('active');
  document.getElementById('signupScreen').classList.add('active');
  document.getElementById('mainApp').classList.remove('active');
}

async function handleLogin() {
  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  
  if (error) {
    alert('Erro ao fazer login: ' + error.message);
  } else {
    currentUser = data.user;
    showMainApp();
  }
}

async function handleSignup() {
  const email = document.getElementById('signupEmail').value;
  const password = document.getElementById('signupPassword').value;

  const { data, error } = await supabase.auth.signUp({ email, password });
  
  if (error) {
    alert('Erro ao criar conta: ' + error.message);
  } else {
    alert('Conta criada! Verifique seu email para confirmar.');
    showLogin();
  }
}

async function handleLogout() {
  await supabase.auth.signOut();
  currentUser = null;
  accounts = [];
  categories = [];
  transactions = [];
  investments = [];
  investmentTransactions = [];
  showLogin();
}

// Main App
async function showMainApp() {
  document.getElementById('loginScreen').classList.remove('active');
  document.getElementById('signupScreen').classList.remove('active');
  document.getElementById('mainApp').classList.add('active');
  
  await loadData();
  showView('dashboard');
}

async function loadData() {
  await Promise.all([
    loadAccounts(),
    loadCategories(),
    loadTransactions(),
    loadInvestments(),
    loadInvestmentTransactions()
  ]);
}

async function loadAccounts() {
  const { data, error } = await supabase
    .from('accounts')
    .select('*')
    .eq('user_id', currentUser.id)
    .order('created_at', { ascending: false });
  
  if (!error) {
    accounts = data || [];
  }
}

async function loadCategories() {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .eq('user_id', currentUser.id)
    .order('created_at', { ascending: false });
  
  if (!error) {
    categories = data || [];
  }
}

async function loadTransactions() {
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', currentUser.id)
    .order('date', { ascending: false });
  
  if (!error) {
    transactions = data || [];
  }
}

async function loadInvestments() {
  const { data, error } = await supabase
    .from('investments')
    .select('*')
    .eq('user_id', currentUser.id)
    .order('created_at', { ascending: false });
  
  if (!error) {
    investments = data || [];
  }
}

async function loadInvestmentTransactions() {
  const { data, error } = await supabase
    .from('investment_transactions')
    .select('*')
    .eq('user_id', currentUser.id)
    .order('date', { ascending: false });
  
  if (!error) {
    investmentTransactions = data || [];
  }
}

// View Management
function showView(viewName) {
  // Update navigation
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.remove('active');
  });
  document.querySelector(`[data-view="${viewName}"]`)?.classList.add('active');

  // Update views
  document.querySelectorAll('.view').forEach(view => {
    view.classList.remove('active');
  });
  document.getElementById(`${viewName}View`)?.classList.add('active');

  // Render content
  switch(viewName) {
    case 'dashboard':
      renderDashboard();
      break;
    case 'transactions':
      renderTransactions();
      break;
    case 'accounts':
      renderAccounts();
      break;
    case 'categories':
      renderCategories();
      break;
    case 'investments':
      renderInvestments();
      break;
  }
}

// Dashboard
function renderDashboard() {
  const totalAccounts = accounts.reduce((sum, acc) => sum + parseFloat(acc.balance || 0), 0);
  const totalInvested = investments.reduce((sum, inv) => sum + parseFloat(inv.current_value || 0), 0);
  const totalInitialInvestment = investments.reduce((sum, inv) => sum + parseFloat(inv.initial_amount || 0), 0);
  const investmentReturns = totalInvested - totalInitialInvestment;
  const netWorth = totalAccounts + totalInvested;

  document.getElementById('netWorthValue').textContent = formatCurrency(netWorth);
  document.getElementById('totalAccountsValue').textContent = formatCurrency(totalAccounts);
  document.getElementById('totalInvestedValue').textContent = formatCurrency(totalInvested);
  document.getElementById('investmentReturnsValue').textContent = formatCurrency(investmentReturns);

  // Current month transactions
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  
  const monthTransactions = transactions.filter(t => {
    const date = new Date(t.date);
    return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
  });

  const monthIncome = monthTransactions
    .filter(t => t.type === 'income')
    .reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
  
  const monthExpense = monthTransactions
    .filter(t => t.type === 'expense')
    .reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
  
  const monthBalance = monthIncome - monthExpense;

  document.getElementById('monthIncomeValue').textContent = formatCurrency(monthIncome);
  document.getElementById('monthExpenseValue').textContent = formatCurrency(monthExpense);
  document.getElementById('monthBalanceValue').textContent = formatCurrency(monthBalance);

  renderCategoryChart();
  renderMonthlyChart();
}

function renderCategoryChart() {
  const ctx = document.getElementById('categoryChart');
  if (!ctx) return;

  // Get expenses by category
  const expensesByCategory = {};
  transactions
    .filter(t => t.type === 'expense' && t.category_id)
    .forEach(t => {
      const category = categories.find(c => c.id === t.category_id);
      if (category) {
        expensesByCategory[category.name] = (expensesByCategory[category.name] || 0) + parseFloat(t.amount);
      }
    });

  const labels = Object.keys(expensesByCategory);
  const data = Object.values(expensesByCategory);
  const colors = labels.map((_, i) => {
    const category = categories.find(c => c.name === labels[i]);
    return category?.color || '#3B82F6';
  });

  if (window.categoryChartInstance) {
    window.categoryChartInstance.destroy();
  }

  window.categoryChartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors,
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom'
        }
      }
    }
  });
}

function renderMonthlyChart() {
  const ctx = document.getElementById('monthlyChart');
  if (!ctx) return;

  // Get last 6 months
  const months = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(date);
  }

  const labels = months.map(m => m.toLocaleDateString('pt-BR', { month: 'short' }));
  const incomeData = [];
  const expenseData = [];

  months.forEach(month => {
    const monthTransactions = transactions.filter(t => {
      const date = new Date(t.date);
      return date.getMonth() === month.getMonth() && date.getFullYear() === month.getFullYear();
    });

    const income = monthTransactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
    
    const expense = monthTransactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);

    incomeData.push(income);
    expenseData.push(expense);
  });

  if (window.monthlyChartInstance) {
    window.monthlyChartInstance.destroy();
  }

  window.monthlyChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Receitas',
          data: incomeData,
          borderColor: '#10B981',
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          tension: 0.4
        },
        {
          label: 'Despesas',
          data: expenseData,
          borderColor: '#EF4444',
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          tension: 0.4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom'
        }
      },
      scales: {
        y: {
          beginAtZero: true
        }
      }
    }
  });
}

// Transactions
function renderTransactions() {
  populateAccountFilters();
  populateCategoryFilters();
  filterTransactions();
}

function populateAccountFilters() {
  const select = document.getElementById('transactionAccountFilter');
  select.innerHTML = '<option value="all">Todas as Contas</option>';
  accounts.forEach(account => {
    select.innerHTML += `<option value="${account.id}">${account.name}</option>`;
  });
}

function populateCategoryFilters() {
  const select = document.getElementById('transactionCategoryFilter');
  select.innerHTML = '<option value="all">Todas as Categorias</option>';
  categories.forEach(category => {
    select.innerHTML += `<option value="${category.id}">${category.name}</option>`;
  });
}

function filterTransactions() {
  const typeFilter = document.getElementById('transactionTypeFilter').value;
  const accountFilter = document.getElementById('transactionAccountFilter').value;
  const categoryFilter = document.getElementById('transactionCategoryFilter').value;

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

  const totalIncome = filtered
    .filter(t => t.type === 'income')
    .reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
  
  const totalExpense = filtered
    .filter(t => t.type === 'expense')
    .reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);

  document.getElementById('totalIncome').textContent = formatCurrency(totalIncome);
  document.getElementById('totalExpense').textContent = formatCurrency(totalExpense);
  document.getElementById('totalBalance').textContent = formatCurrency(totalIncome - totalExpense);

  const list = document.getElementById('transactionsList');
  if (filtered.length === 0) {
    list.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📝</div><div class="empty-state-text">Nenhuma transação encontrada</div></div>';
    return;
  }

  list.innerHTML = filtered.map(t => {
    const account = accounts.find(a => a.id === t.account_id);
    const category = categories.find(c => c.id === t.category_id);
    const transferTo = accounts.find(a => a.id === t.transfer_to_account_id);
    
    const typeLabel = t.type === 'income' ? 'Receita' : t.type === 'expense' ? 'Despesa' : 'Transferência';
    const date = new Date(t.date).toLocaleDateString('pt-BR');

    return `
      <div class="transaction-item">
        <div class="transaction-info">
          <div class="transaction-description">${t.description || 'Sem descrição'}</div>
          <div class="transaction-details">
            ${typeLabel} • ${date} • ${account?.name || 'N/A'}
            ${category ? ` • ${category.name}` : ''}
            ${transferTo ? ` → ${transferTo.name}` : ''}
          </div>
        </div>
        <div class="transaction-amount ${t.type}">
          ${t.type === 'expense' ? '-' : '+'}${formatCurrency(t.amount)}
        </div>
        <div class="transaction-actions">
          <button onclick="deleteTransaction('${t.id}')" class="btn btn--sm btn--outline" style="color: var(--color-error); border-color: var(--color-error);">Excluir</button>
        </div>
      </div>
    `;
  }).join('');
}

async function deleteTransaction(id) {
  if (!confirm('Deseja realmente excluir esta transação?')) return;

  const { error } = await supabase
    .from('transactions')
    .delete()
    .eq('id', id);

  if (error) {
    alert('Erro ao excluir transação: ' + error.message);
  } else {
    await loadTransactions();
    await loadAccounts();
    filterTransactions();
    renderDashboard();
  }
}

// Accounts
function renderAccounts() {
  const list = document.getElementById('accountsList');
  
  if (accounts.length === 0) {
    list.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🏦</div><div class="empty-state-text">Nenhuma conta cadastrada</div></div>';
    return;
  }

  list.innerHTML = accounts.map(account => {
    const typeLabels = {
      checking: 'Conta Corrente',
      savings: 'Poupança',
      credit_card: 'Cartão de Crédito',
      cash: 'Dinheiro',
      other: 'Outro'
    };

    return `
      <div class="account-card">
        <div class="account-header">
          <div>
            <div class="account-name">${account.name}</div>
            <div class="account-type">${typeLabels[account.type] || account.type}</div>
          </div>
        </div>
        <div class="account-balance">${formatCurrency(account.balance)}</div>
        <div class="account-actions">
          <button onclick="deleteAccount('${account.id}')" class="btn btn--sm btn--outline" style="color: var(--color-error); border-color: var(--color-error);">Excluir</button>
        </div>
      </div>
    `;
  }).join('');
}

async function deleteAccount(id) {
  if (!confirm('Deseja realmente excluir esta conta?')) return;

  const { error } = await supabase
    .from('accounts')
    .delete()
    .eq('id', id);

  if (error) {
    alert('Erro ao excluir conta: ' + error.message);
  } else {
    await loadAccounts();
    renderAccounts();
    renderDashboard();
  }
}

// Categories
function renderCategories() {
  const list = document.getElementById('categoriesList');
  
  if (categories.length === 0) {
    list.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🏷️</div><div class="empty-state-text">Nenhuma categoria cadastrada</div></div>';
    return;
  }

  list.innerHTML = categories.map(category => {
    const typeLabel = category.type === 'income' ? 'Receita' : 'Despesa';

    return `
      <div class="category-card">
        <div class="category-color" style="background: ${category.color};"></div>
        <div class="category-name">${category.name}</div>
        <div class="category-type">${typeLabel}</div>
        <div class="category-allocations">
          ${category.primary_allocation || ''} ${category.secondary_allocation ? '• ' + category.secondary_allocation : ''}
        </div>
        <div class="category-actions">
          <button onclick="deleteCategory('${category.id}')" class="btn btn--sm btn--outline" style="color: var(--color-error); border-color: var(--color-error);">Excluir</button>
        </div>
      </div>
    `;
  }).join('');
}

async function deleteCategory(id) {
  if (!confirm('Deseja realmente excluir esta categoria?')) return;

  const { error } = await supabase
    .from('categories')
    .delete()
    .eq('id', id);

  if (error) {
    alert('Erro ao excluir categoria: ' + error.message);
  } else {
    await loadCategories();
    renderCategories();
  }
}

// Investments
function renderInvestments() {
  const totalInvested = investments.reduce((sum, inv) => sum + parseFloat(inv.current_value || 0), 0);
  const totalInitial = investments.reduce((sum, inv) => sum + parseFloat(inv.initial_amount || 0), 0);
  const totalReturn = totalInvested - totalInitial;
  const returnPercent = totalInitial > 0 ? ((totalReturn / totalInitial) * 100) : 0;

  document.getElementById('invTotalInvested').textContent = formatCurrency(totalInitial);
  document.getElementById('invCurrentValue').textContent = formatCurrency(totalInvested);
  document.getElementById('invTotalReturn').textContent = formatCurrency(totalReturn);
  document.getElementById('invReturnPercent').textContent = `${returnPercent >= 0 ? '+' : ''}${returnPercent.toFixed(2)}%`;
  document.getElementById('invReturnPercent').style.color = returnPercent >= 0 ? 'var(--color-success)' : 'var(--color-error)';

  filterInvestments();
}

function filterInvestments() {
  const typeFilter = document.getElementById('investmentTypeFilter').value;
  let filtered = investments;

  if (typeFilter !== 'all') {
    filtered = filtered.filter(inv => inv.type === typeFilter);
  }

  const list = document.getElementById('investmentsList');
  
  if (filtered.length === 0) {
    list.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📈</div><div class="empty-state-text">Nenhum investimento encontrado</div></div>';
    return;
  }

  list.innerHTML = filtered.map(inv => {
    const type = investmentTypes[inv.type];
    const returnAmount = parseFloat(inv.current_value) - parseFloat(inv.initial_amount);
    const returnPercent = parseFloat(inv.initial_amount) > 0 ? ((returnAmount / parseFloat(inv.initial_amount)) * 100) : 0;
    const isPositive = returnAmount >= 0;

    return `
      <div class="investment-card" onclick="showInvestmentDetail('${inv.id}')">
        <div class="investment-header">
          <div class="investment-type-icon">${type?.icon || '📦'}</div>
          <div style="flex: 1;">
            <div class="investment-name">${inv.name}</div>
            <div class="investment-institution">${inv.institution || 'N/A'}</div>
          </div>
        </div>
        <div class="investment-values">
          <div class="investment-value-row">
            <span class="investment-value-label">Investido:</span>
            <span class="investment-value-amount">${formatCurrency(inv.initial_amount)}</span>
          </div>
          <div class="investment-value-row">
            <span class="investment-value-label">Atual:</span>
            <span class="investment-value-amount">${formatCurrency(inv.current_value)}</span>
          </div>
        </div>
        <div class="investment-return">
          <span class="investment-return-label">Retorno</span>
          <div class="investment-return-value">
            <span class="return-amount ${isPositive ? 'positive' : 'negative'}">
              ${isPositive ? '+' : ''}${formatCurrency(returnAmount)}
            </span>
            <span class="return-percent" style="color: ${isPositive ? 'var(--color-success)' : 'var(--color-error)'}">
              ${isPositive ? '+' : ''}${returnPercent.toFixed(2)}%
            </span>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function showInvestmentDetail(id) {
  currentInvestmentId = id;
  const investment = investments.find(inv => inv.id === id);
  if (!investment) return;

  const type = investmentTypes[investment.type];
  const invTransactions = investmentTransactions.filter(t => t.investment_id === id);

  const totalContributions = invTransactions
    .filter(t => t.type === 'contribution')
    .reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
  
  const totalWithdrawals = invTransactions
    .filter(t => t.type === 'withdrawal')
    .reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
  
  const totalYields = invTransactions
    .filter(t => t.type === 'yield' || t.type === 'dividend')
    .reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);

  const currentValue = parseFloat(investment.current_value);
  const netReturn = currentValue - totalContributions + totalWithdrawals;
  const returnPercent = totalContributions > 0 ? ((netReturn / totalContributions) * 100) : 0;

  document.getElementById('invDetailName').textContent = investment.name;
  document.getElementById('invDetailType').textContent = `${type?.icon || '📦'} ${type?.label || investment.type}`;
  document.getElementById('invDetailInstitution').textContent = investment.institution || 'N/A';
  document.getElementById('invDetailTotalInvested').textContent = formatCurrency(totalContributions);
  document.getElementById('invDetailCurrentValue').textContent = formatCurrency(currentValue);
  document.getElementById('invDetailReturn').textContent = formatCurrency(netReturn);
  document.getElementById('invDetailReturnPercent').textContent = `${returnPercent >= 0 ? '+' : ''}${returnPercent.toFixed(2)}%`;
  document.getElementById('invDetailReturnPercent').style.color = returnPercent >= 0 ? 'var(--color-success)' : 'var(--color-error)';

  const transactionsList = document.getElementById('investmentTransactionsList');
  if (invTransactions.length === 0) {
    transactionsList.innerHTML = '<div class="empty-state"><div class="empty-state-text">Nenhuma transação registrada</div></div>';
  } else {
    transactionsList.innerHTML = invTransactions.map(t => {
      const transType = investmentTransactionTypes[t.type];
      const account = accounts.find(a => a.id === t.account_id);
      const date = new Date(t.date).toLocaleDateString('pt-BR');

      return `
        <div class="inv-transaction-item">
          <div class="inv-transaction-info">
            <div class="inv-transaction-type">
              ${transType?.icon || '💰'} ${transType?.label || t.type}
            </div>
            <div class="inv-transaction-details">
              ${date} • ${account?.name || 'N/A'}
              ${t.description ? ` • ${t.description}` : ''}
            </div>
          </div>
          <div class="inv-transaction-amount" style="color: ${t.type === 'contribution' ? 'var(--color-error)' : 'var(--color-success)'}">
            ${t.type === 'contribution' ? '-' : '+'}${formatCurrency(t.amount)}
          </div>
        </div>
      `;
    }).join('');
  }

  openModal('investmentDetailModal');
}

async function deleteInvestment() {
  if (!confirm('Deseja realmente excluir este investimento?')) return;

  const { error } = await supabase
    .from('investments')
    .delete()
    .eq('id', currentInvestmentId);

  if (error) {
    alert('Erro ao excluir investimento: ' + error.message);
  } else {
    closeModal('investmentDetailModal');
    await loadInvestments();
    await loadInvestmentTransactions();
    renderInvestments();
    renderDashboard();
  }
}

// Modals
function showAddTransactionModal() {
  document.getElementById('transactionType').value = 'expense';
  document.getElementById('transactionAmount').value = '';
  document.getElementById('transactionDescription').value = '';
  document.getElementById('transactionDate').value = new Date().toISOString().split('T')[0];
  
  updateTransactionForm();
  openModal('transactionModal');
}

function updateTransactionForm() {
  const type = document.getElementById('transactionType').value;
  const categoryGroup = document.getElementById('categoryGroup');
  const transferToGroup = document.getElementById('transferToGroup');

  if (type === 'transfer') {
    categoryGroup.style.display = 'none';
    transferToGroup.style.display = 'block';
  } else {
    categoryGroup.style.display = 'block';
    transferToGroup.style.display = 'none';
  }

  // Populate dropdowns
  const accountSelect = document.getElementById('transactionAccount');
  accountSelect.innerHTML = '<option value="">Selecione uma conta</option>' +
    accounts.map(a => `<option value="${a.id}">${a.name}</option>`).join('');

  const categorySelect = document.getElementById('transactionCategory');
  const filteredCategories = categories.filter(c => c.type === type);
  categorySelect.innerHTML = '<option value="">Selecione uma categoria</option>' +
    filteredCategories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');

  const transferToSelect = document.getElementById('transactionTransferTo');
  transferToSelect.innerHTML = '<option value="">Selecione uma conta</option>' +
    accounts.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
}

async function saveTransaction() {
  const type = document.getElementById('transactionType').value;
  const amount = parseFloat(document.getElementById('transactionAmount').value);
  const accountId = document.getElementById('transactionAccount').value;
  const categoryId = document.getElementById('transactionCategory').value;
  const transferToId = document.getElementById('transactionTransferTo').value;
  const date = document.getElementById('transactionDate').value;
  const description = document.getElementById('transactionDescription').value;

  if (!amount || !accountId || !date) {
    alert('Preencha todos os campos obrigatórios');
    return;
  }

  if (type !== 'transfer' && !categoryId) {
    alert('Selecione uma categoria');
    return;
  }

  if (type === 'transfer' && !transferToId) {
    alert('Selecione a conta de destino');
    return;
  }

  const { error } = await supabase
    .from('transactions')
    .insert({
      user_id: currentUser.id,
      type,
      amount,
      account_id: accountId,
      category_id: type !== 'transfer' ? categoryId : null,
      transfer_to_account_id: type === 'transfer' ? transferToId : null,
      date,
      description
    });

  if (error) {
    alert('Erro ao salvar transação: ' + error.message);
  } else {
    closeModal('transactionModal');
    await loadTransactions();
    await loadAccounts();
    filterTransactions();
    renderDashboard();
  }
}

function showAddAccountModal() {
  document.getElementById('accountName').value = '';
  document.getElementById('accountType').value = 'checking';
  document.getElementById('accountBalance').value = '0';
  openModal('accountModal');
}

async function saveAccount() {
  const name = document.getElementById('accountName').value;
  const type = document.getElementById('accountType').value;
  const balance = parseFloat(document.getElementById('accountBalance').value) || 0;

  if (!name) {
    alert('Digite o nome da conta');
    return;
  }

  const { error } = await supabase
    .from('accounts')
    .insert({
      user_id: currentUser.id,
      name,
      type,
      balance
    });

  if (error) {
    alert('Erro ao salvar conta: ' + error.message);
  } else {
    closeModal('accountModal');
    await loadAccounts();
    renderAccounts();
    renderDashboard();
  }
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
  const name = document.getElementById('categoryName').value;
  const type = document.getElementById('categoryType').value;
  const primary = document.getElementById('categoryPrimary').value;
  const secondary = document.getElementById('categorySecondary').value;
  const color = document.getElementById('categoryColor').value;

  if (!name) {
    alert('Digite o nome da categoria');
    return;
  }

  const { error } = await supabase
    .from('categories')
    .insert({
      user_id: currentUser.id,
      name,
      type,
      primary_allocation: primary,
      secondary_allocation: secondary,
      color
    });

  if (error) {
    alert('Erro ao salvar categoria: ' + error.message);
  } else {
    closeModal('categoryModal');
    await loadCategories();
    renderCategories();
  }
}

function showAddInvestmentModal() {
  document.getElementById('investmentName').value = '';
  document.getElementById('investmentType').value = 'stocks';
  document.getElementById('investmentInstitution').value = '';
  document.getElementById('investmentInitialAmount').value = '';
  document.getElementById('investmentCurrentValue').value = '';
  document.getElementById('investmentPurchaseDate').value = new Date().toISOString().split('T')[0];
  document.getElementById('investmentMaturityDate').value = '';
  document.getElementById('investmentNotes').value = '';

  const accountSelect = document.getElementById('investmentAccount');
  accountSelect.innerHTML = '<option value="">Selecione uma conta</option>' +
    accounts.map(a => `<option value="${a.id}">${a.name}</option>`).join('');

  openModal('investmentModal');
}

async function saveInvestment() {
  const name = document.getElementById('investmentName').value;
  const type = document.getElementById('investmentType').value;
  const institution = document.getElementById('investmentInstitution').value;
  const initialAmount = parseFloat(document.getElementById('investmentInitialAmount').value);
  const currentValue = parseFloat(document.getElementById('investmentCurrentValue').value);
  const purchaseDate = document.getElementById('investmentPurchaseDate').value;
  const maturityDate = document.getElementById('investmentMaturityDate').value || null;
  const accountId = document.getElementById('investmentAccount').value;
  const notes = document.getElementById('investmentNotes').value;

  if (!name || !initialAmount || !currentValue || !purchaseDate || !accountId) {
    alert('Preencha todos os campos obrigatórios');
    return;
  }

  const { data: investment, error } = await supabase
    .from('investments')
    .insert({
      user_id: currentUser.id,
      name,
      type,
      institution,
      initial_amount: initialAmount,
      current_value: currentValue,
      purchase_date: purchaseDate,
      maturity_date: maturityDate,
      notes
    })
    .select()
    .single();

  if (error) {
    alert('Erro ao salvar investimento: ' + error.message);
    return;
  }

  // Create initial transaction
  await supabase
    .from('investment_transactions')
    .insert({
      user_id: currentUser.id,
      investment_id: investment.id,
      account_id: accountId,
      type: 'contribution',
      amount: initialAmount,
      date: purchaseDate,
      description: 'Aporte inicial'
    });

  closeModal('investmentModal');
  await loadInvestments();
  await loadInvestmentTransactions();
  await loadAccounts();
  renderInvestments();
  renderDashboard();
}

function showAddInvestmentTransactionModal() {
  document.getElementById('invTransactionType').value = 'contribution';
  document.getElementById('invTransactionAmount').value = '';
  document.getElementById('invTransactionDescription').value = '';
  document.getElementById('invTransactionDate').value = new Date().toISOString().split('T')[0];

  const accountSelect = document.getElementById('invTransactionAccount');
  accountSelect.innerHTML = '<option value="">Selecione uma conta</option>' +
    accounts.map(a => `<option value="${a.id}">${a.name}</option>`).join('');

  openModal('investmentTransactionModal');
}

async function saveInvestmentTransaction() {
  const type = document.getElementById('invTransactionType').value;
  const amount = parseFloat(document.getElementById('invTransactionAmount').value);
  const accountId = document.getElementById('invTransactionAccount').value;
  const date = document.getElementById('invTransactionDate').value;
  const description = document.getElementById('invTransactionDescription').value;

  if (!amount || !accountId || !date) {
    alert('Preencha todos os campos obrigatórios');
    return;
  }

  const { error } = await supabase
    .from('investment_transactions')
    .insert({
      user_id: currentUser.id,
      investment_id: currentInvestmentId,
      account_id: accountId,
      type,
      amount,
      date,
      description
    });

  if (error) {
    alert('Erro ao salvar transação: ' + error.message);
  } else {
    closeModal('investmentTransactionModal');
    await loadInvestments();
    await loadInvestmentTransactions();
    await loadAccounts();
    showInvestmentDetail(currentInvestmentId);
    renderInvestments();
    renderDashboard();
  }
}

function openModal(modalId) {
  document.getElementById(modalId).classList.add('active');
}

function closeModal(modalId) {
  document.getElementById(modalId).classList.remove('active');
}

// Utilities
function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(value || 0);
}