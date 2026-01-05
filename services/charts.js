// Chart generation service using QuickChart.io API

const QUICKCHART_URL = 'https://quickchart.io/chart';

// Generate spending by category chart
export function generateSpendingByCategoryChart(transactions, title = 'Spending by Category') {
  const categoryTotals = {};
  
  transactions
    .filter(tx => tx.type === 'cost' && tx.isAffect)
    .forEach(tx => {
      const cat = tx.category || 'Other';
      categoryTotals[cat] = (categoryTotals[cat] || 0) + tx.amount;
    });
  
  const labels = Object.keys(categoryTotals);
  const data = Object.values(categoryTotals);
  
  if (labels.length === 0) {
    return null;
  }
  
  const chartConfig = {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: [
          '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', 
          '#9966FF', '#FF9F40', '#FF6384', '#C9CBCF'
        ],
      }],
    },
    options: {
      title: {
        display: true,
        text: title,
        fontSize: 18,
      },
      plugins: {
        datalabels: {
          display: true,
          formatter: (value) => value.toFixed(2) + ' ₼',
          color: '#fff',
          font: { weight: 'bold' },
        },
      },
    },
  };
  
  return `${QUICKCHART_URL}?c=${encodeURIComponent(JSON.stringify(chartConfig))}&w=500&h=400`;
}

// Generate income vs expense chart over time
export function generateIncomeVsExpenseChart(transactions, title = 'Income vs Expense') {
  // Group transactions by month
  const monthlyData = {};
  
  transactions.forEach(tx => {
    if (!tx.isAffect) return;
    const date = new Date(tx.date);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    
    if (!monthlyData[monthKey]) {
      monthlyData[monthKey] = { income: 0, expense: 0 };
    }
    
    if (tx.type === 'cost') {
      monthlyData[monthKey].expense += tx.amount;
    } else {
      monthlyData[monthKey].income += tx.amount;
    }
  });
  
  const sortedMonths = Object.keys(monthlyData).sort();
  if (sortedMonths.length === 0) return null;
  
  const labels = sortedMonths.map(m => {
    const [year, month] = m.split('-');
    return new Date(year, month - 1).toLocaleString('default', { month: 'short', year: '2-digit' });
  });
  
  const incomeData = sortedMonths.map(m => monthlyData[m].income);
  const expenseData = sortedMonths.map(m => monthlyData[m].expense);
  
  const chartConfig = {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Income',
          data: incomeData,
          backgroundColor: '#4BC0C0',
        },
        {
          label: 'Expense',
          data: expenseData,
          backgroundColor: '#FF6384',
        },
      ],
    },
    options: {
      title: {
        display: true,
        text: title,
        fontSize: 18,
      },
      scales: {
        yAxes: [{
          ticks: { beginAtZero: true },
        }],
      },
    },
  };
  
  return `${QUICKCHART_URL}?c=${encodeURIComponent(JSON.stringify(chartConfig))}&w=600&h=400`;
}

// Generate net revenue chart (balance changes over time)
export function generateNetRevenueChart(transactions, title = 'Net Revenue Over Time') {
  // Group by month and calculate net
  const monthlyNet = {};
  
  transactions.forEach(tx => {
    if (!tx.isAffect) return;
    const date = new Date(tx.date);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    
    if (!monthlyNet[monthKey]) {
      monthlyNet[monthKey] = 0;
    }
    
    if (tx.type === 'cost') {
      monthlyNet[monthKey] -= tx.amount;
    } else {
      monthlyNet[monthKey] += tx.amount;
    }
  });
  
  const sortedMonths = Object.keys(monthlyNet).sort();
  if (sortedMonths.length === 0) return null;
  
  const labels = sortedMonths.map(m => {
    const [year, month] = m.split('-');
    return new Date(year, month - 1).toLocaleString('default', { month: 'short', year: '2-digit' });
  });
  
  const data = sortedMonths.map(m => monthlyNet[m]);
  const colors = data.map(v => v >= 0 ? '#4BC0C0' : '#FF6384');
  
  const chartConfig = {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Net Revenue',
        data,
        backgroundColor: colors,
      }],
    },
    options: {
      title: {
        display: true,
        text: title,
        fontSize: 18,
      },
      scales: {
        yAxes: [{
          ticks: { beginAtZero: false },
        }],
      },
    },
  };
  
  return `${QUICKCHART_URL}?c=${encodeURIComponent(JSON.stringify(chartConfig))}&w=600&h=400`;
}

// Generate scheduled transactions impact chart
export function generateScheduledImpactChart(currentBalance, scheduledTransactions, title = 'Scheduled Transactions Impact') {
  if (scheduledTransactions.length === 0) return null;
  
  // Sort by date
  const sorted = [...scheduledTransactions].sort((a, b) => new Date(a.date) - new Date(b.date));
  
  // Calculate running balance
  let balance = currentBalance;
  const balancePoints = [{ date: 'Current', balance }];
  
  sorted.forEach(tx => {
    if (tx.type === 'cost') {
      balance -= tx.amount;
    } else {
      balance += tx.amount;
    }
    const date = new Date(tx.date);
    balancePoints.push({
      date: date.toLocaleDateString('default', { month: 'short', day: 'numeric' }),
      balance,
    });
  });
  
  const labels = balancePoints.map(p => p.date);
  const data = balancePoints.map(p => p.balance);
  
  const chartConfig = {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Expected Balance',
        data,
        fill: false,
        borderColor: '#36A2EB',
        backgroundColor: '#36A2EB',
        tension: 0.1,
      }],
    },
    options: {
      title: {
        display: true,
        text: title,
        fontSize: 18,
      },
      scales: {
        yAxes: [{
          ticks: { beginAtZero: false },
        }],
      },
    },
  };
  
  return `${QUICKCHART_URL}?c=${encodeURIComponent(JSON.stringify(chartConfig))}&w=600&h=400`;
}

// Generate spending trend line chart
export function generateSpendingTrendChart(transactions, title = 'Daily Spending Trend') {
  const dailySpending = {};
  
  transactions
    .filter(tx => tx.type === 'cost' && tx.isAffect)
    .forEach(tx => {
      const date = tx.date.split('T')[0];
      dailySpending[date] = (dailySpending[date] || 0) + tx.amount;
    });
  
  const sortedDates = Object.keys(dailySpending).sort();
  if (sortedDates.length === 0) return null;
  
  // Take last 30 days max
  const last30 = sortedDates.slice(-30);
  
  const labels = last30.map(d => {
    const date = new Date(d);
    return date.toLocaleDateString('default', { month: 'short', day: 'numeric' });
  });
  
  const data = last30.map(d => dailySpending[d]);
  
  const chartConfig = {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Daily Spending',
        data,
        fill: true,
        borderColor: '#FF6384',
        backgroundColor: 'rgba(255, 99, 132, 0.2)',
        tension: 0.3,
      }],
    },
    options: {
      title: {
        display: true,
        text: title,
        fontSize: 18,
      },
      scales: {
        yAxes: [{
          ticks: { beginAtZero: true },
        }],
      },
    },
  };
  
  return `${QUICKCHART_URL}?c=${encodeURIComponent(JSON.stringify(chartConfig))}&w=600&h=400`;
}

// Generate total revenue on scheduled chart
export function generateTotalRevenueChart(transactions, title = 'Total Revenue Breakdown') {
  let totalIncome = 0;
  let totalExpense = 0;
  let scheduledIncome = 0;
  let scheduledExpense = 0;
  
  transactions.forEach(tx => {
    if (tx.isAffect) {
      if (tx.type === 'cost') {
        totalExpense += tx.amount;
      } else {
        totalIncome += tx.amount;
      }
    } else if (tx.scheduled) {
      if (tx.type === 'cost') {
        scheduledExpense += tx.amount;
      } else {
        scheduledIncome += tx.amount;
      }
    }
  });
  
  const chartConfig = {
    type: 'bar',
    data: {
      labels: ['Current Income', 'Current Expense', 'Scheduled Income', 'Scheduled Expense'],
      datasets: [{
        data: [totalIncome, totalExpense, scheduledIncome, scheduledExpense],
        backgroundColor: ['#4BC0C0', '#FF6384', '#36A2EB', '#FFCE56'],
      }],
    },
    options: {
      title: {
        display: true,
        text: title,
        fontSize: 18,
      },
      legend: { display: false },
      scales: {
        yAxes: [{
          ticks: { beginAtZero: true },
        }],
      },
    },
  };
  
  return `${QUICKCHART_URL}?c=${encodeURIComponent(JSON.stringify(chartConfig))}&w=600&h=400`;
}

// Helper to get date range based on period selection
export function getDateRange(period) {
  const now = new Date();
  let startDate, endDate;
  
  switch (period) {
    case 'week':
      startDate = new Date(now);
      startDate.setDate(now.getDate() - 7);
      endDate = now;
      break;
    case 'month':
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      break;
    case '3months':
      startDate = new Date(now);
      startDate.setMonth(now.getMonth() - 3);
      endDate = now;
      break;
    case 'year':
      startDate = new Date(now.getFullYear(), 0, 1);
      endDate = now;
      break;
    default:
      // All time
      startDate = new Date(2000, 0, 1);
      endDate = new Date(2100, 11, 31);
  }
  
  return {
    startDate: startDate.toISOString().split('T')[0],
    endDate: endDate.toISOString().split('T')[0],
  };
}

