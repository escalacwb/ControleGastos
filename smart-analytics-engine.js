// ============================================
// SMART ANALYTICS ENGINE v1.0
// Data-Driven Financial Analysis
// ============================================

const SmartAnalytics = {
  
  /**
   * Agrega transações por mês
   * @param {Array} transactions - Lista de transações
   * @returns {Array} - Array com totais por mês [mes1, mes2, ...]
   */
  aggregateByMonth(transactions) {
    const monthlyTotals = {};
    
    transactions.forEach(tx => {
      const date = new Date(tx.date);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      
      if (!monthlyTotals[monthKey]) {
        monthlyTotals[monthKey] = 0;
      }
      monthlyTotals[monthKey] += Math.abs(tx.amount);
    });
    
    // Ordenar por data e retornar array de valores
    const sortedMonths = Object.keys(monthlyTotals).sort();
    return sortedMonths.map(month => monthlyTotals[month]);
  },

  /**
   * Calcula média de um array
   */
  mean(arr) {
    if (arr.length === 0) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  },

  /**
   * Calcula mediana de um array
   */
  median(arr) {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  },

  /**
   * Calcula desvio padrão de um array
   */
  std(arr) {
    if (arr.length === 0) return 0;
    const avg = this.mean(arr);
    const squareDiffs = arr.map(value => Math.pow(value - avg, 2));
    const avgSquareDiff = this.mean(squareDiffs);
    return Math.sqrt(avgSquareDiff);
  },

  /**
   * Calcula tendência (slope) via regressão linear simples
   * Retorna % de crescimento/decrescimento mensal
   */
  calculateTrend(arr) {
    if (arr.length < 2) return 0;
    
    const n = arr.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    
    arr.forEach((y, x) => {
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumX2 += x * x;
    });
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const avgY = sumY / n;
    
    // Retorna % de mudança mensal
    return avgY !== 0 ? (slope / avgY) * 100 : 0;
  },

  /**
   * Previsão do próximo mês usando regressão linear
   */
  linearForecast(arr) {
    if (arr.length === 0) return 0;
    if (arr.length === 1) return arr[0];
    
    const n = arr.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    
    arr.forEach((y, x) => {
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumX2 += x * x;
    });
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    
    // Previsão para próximo período (n)
    return slope * n + intercept;
  },

  /**
   * Análise completa de padrão de gastos por categoria
   * @param {string} categoryId - ID da categoria
   * @param {number} months - Número de meses a analisar (default: 12)
   * @returns {Object} - Estatísticas completas
   */
  analyzeExpensePattern(categoryId, months = 12) {
    // Filtrar transações da categoria nos últimos N meses
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - months);
    
    const categoryTransactions = transactions.filter(tx => 
      tx.category_id === categoryId &&
      tx.type === 'expense' &&
      new Date(tx.date) >= cutoffDate
    );
    
    if (categoryTransactions.length === 0) {
      return {
        average: 0,
        median: 0,
        stddev: 0,
        min: 0,
        max: 0,
        trend: 0,
        forecast: 0,
        anomalyThreshold: 0,
        dataPoints: 0
      };
    }
    
    const monthlyTotals = this.aggregateByMonth(categoryTransactions);
    
    const avg = this.mean(monthlyTotals);
    const stdDev = this.std(monthlyTotals);
    
    return {
      average: avg,
      median: this.median(monthlyTotals),
      stddev: stdDev,
      min: Math.min(...monthlyTotals),
      max: Math.max(...monthlyTotals),
      trend: this.calculateTrend(monthlyTotals),
      forecast: this.linearForecast(monthlyTotals),
      anomalyThreshold: avg + (1.5 * stdDev), // Limite para anomalia
      dataPoints: monthlyTotals.length
    };
  },

  /**
   * Detecta se gasto atual é anômalo
   * @param {string} categoryId - ID da categoria
   * @param {number} currentSpend - Gasto atual do mês
   * @returns {Object} - Informações sobre anomalia
   */
  detectAnomaly(categoryId, currentSpend) {
    const pattern = this.analyzeExpensePattern(categoryId);
    
    if (pattern.dataPoints === 0) {
      return { isAnomaly: false, message: 'Sem dados históricos' };
    }
    
    const isAnomaly = currentSpend > pattern.anomalyThreshold;
    const percentageAbove = pattern.average > 0 
      ? ((currentSpend / pattern.average - 1) * 100).toFixed(1)
      : 0;
    
    if (isAnomaly) {
      const excess = currentSpend - pattern.average;
      return {
        isAnomaly: true,
        severity: percentageAbove > 50 ? 'high' : percentageAbove > 25 ? 'medium' : 'low',
        currentSpend: currentSpend,
        average: pattern.average,
        percentageAbove: percentageAbove,
        excess: excess,
        recommendation: `Reduzir para R$ ${pattern.average.toFixed(0)} economiza R$ ${excess.toFixed(0)}`
      };
    }
    
    // Oportunidade: gasto abaixo da média
    if (currentSpend < pattern.average * 0.8) {
      const saved = pattern.average - currentSpend;
      return {
        isAnomaly: false,
        isOpportunity: true,
        currentSpend: currentSpend,
        average: pattern.average,
        percentageBelow: Math.abs(percentageAbove),
        saved: saved,
        message: `Ótimo! Economizou R$ ${saved.toFixed(0)} vs. média`
      };
    }
    
    return { 
      isAnomaly: false, 
      isOpportunity: false,
      message: 'Dentro do esperado' 
    };
  },

  /**
   * Análise completa de todas as categorias
   * @returns {Array} - Array com análise de cada categoria
   */
  analyzeAllCategories() {
    const analyses = [];
    
    categories.forEach(cat => {
      if (cat.type !== 'expense') return; // Apenas despesas
      
      const pattern = this.analyzeExpensePattern(cat.id);
      
      // Calcular gasto atual do mês
      const now = new Date();
      const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      
      const currentMonthTransactions = transactions.filter(tx =>
        tx.category_id === cat.id &&
        tx.type === 'expense' &&
        new Date(tx.date) >= currentMonthStart
      );
      
      const currentSpend = currentMonthTransactions.reduce((sum, tx) => 
        sum + Math.abs(tx.amount), 0
      );
      
      const anomaly = this.detectAnomaly(cat.id, currentSpend);
      
      analyses.push({
        categoryId: cat.id,
        categoryName: cat.name,
        currentSpend: currentSpend,
        pattern: pattern,
        anomaly: anomaly
      });
    });
    
    return analyses.sort((a, b) => b.currentSpend - a.currentSpend);
  },

  /**
   * Calcula Score de Saúde Financeira (0-100)
   */
  calculateHealthScore() {
    let score = 0;
    
    // Critério 1: Margem de investimento (40 pontos)
    const thisMonth = this.getCurrentMonthSummary();
    const investmentGoal = 5000; // Meta: R$ 5K/mês (você ajusta)
    
    if (thisMonth.income > 0) {
      const margin = thisMonth.income - thisMonth.expenses;
      const marginPercent = (margin / thisMonth.income) * 100;
      
      if (margin >= investmentGoal) {
        score += 40;
      } else {
        score += (margin / investmentGoal) * 40;
      }
    }
    
    // Critério 2: Consistência (30 pontos)
    // Verifica se últimos 3 meses estão sob controle
    const last3MonthsAvg = this.getAverageExpensesLastMonths(3);
    const historicalAvg = this.getAverageExpensesLastMonths(12);
    
    if (historicalAvg > 0) {
      const consistency = 1 - Math.abs(last3MonthsAvg - historicalAvg) / historicalAvg;
      score += consistency * 30;
    }
    
    // Critério 3: Anomalias (30 pontos)
    // Penaliza anomalias, premia oportunidades
    const analyses = this.analyzeAllCategories();
    let anomalyPenalty = 0;
    let opportunityBonus = 0;
    
    analyses.forEach(a => {
      if (a.anomaly.isAnomaly && a.anomaly.severity === 'high') {
        anomalyPenalty += 10;
      } else if (a.anomaly.isAnomaly && a.anomaly.severity === 'medium') {
        anomalyPenalty += 5;
      }
      
      if (a.anomaly.isOpportunity) {
        opportunityBonus += 5;
      }
    });
    
    score += Math.max(0, 30 - anomalyPenalty + opportunityBonus);
    
    return Math.min(100, Math.max(0, Math.round(score)));
  },

  /**
   * Resumo do mês atual
   */
  getCurrentMonthSummary() {
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    
    const thisMonthTransactions = transactions.filter(tx =>
      new Date(tx.date) >= currentMonthStart
    );
    
    let income = 0, expenses = 0;
    
    thisMonthTransactions.forEach(tx => {
      if (tx.type === 'income') {
        income += tx.amount;
      } else if (tx.type === 'expense') {
        expenses += Math.abs(tx.amount);
      }
    });
    
    return { income, expenses, balance: income - expenses };
  },

  /**
   * Média de gastos dos últimos N meses
   */
  getAverageExpensesLastMonths(months) {
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - months);
    
    const relevantTransactions = transactions.filter(tx =>
      tx.type === 'expense' &&
      new Date(tx.date) >= cutoffDate
    );
    
    const monthlyTotals = this.aggregateByMonth(relevantTransactions);
    return this.mean(monthlyTotals);
  }
};

// ============================================
// FIM DO SMART ANALYTICS ENGINE
// ============================================

console.log('✅ Smart Analytics Engine v1.0 carregado');
