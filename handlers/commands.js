import {
  getConversationState,
  setConversationState,
  clearConversationState,
  getSession,
  isAuthenticated,
} from '../utils/session.js';
import {
  getUserCards,
  addCard,
  getCardTransactions,
  addTransaction,
  getCardById,
  updateCardLimits,
  addCardLimit,
  addCardPlan,
  addCardWish,
  getScheduledTransactions,
  getCurrentTransactions,
  getAllUserTransactions,
} from '../services/firebase.js';
import {
  generateSpendingByCategoryChart,
  generateIncomeVsExpenseChart,
  generateNetRevenueChart,
  generateScheduledImpactChart,
  generateSpendingTrendChart,
  generateTotalRevenueChart,
  getDateRange,
} from '../services/charts.js';

// Temporary storage for multi-step input data
const tempData = new Map();

// Middleware to check authentication
function requireAuth(bot, chatId) {
  if (!isAuthenticated(chatId)) {
    bot.sendMessage(chatId, '❌ Please /login or /signup first to use this feature.');
    return false;
  }
  return true;
}

// /cards - List all cards
export async function handleCards(bot, msg) {
  const chatId = msg.chat.id;
  if (!requireAuth(bot, chatId)) return;

  const session = getSession(chatId);
  console.log('Session data:', JSON.stringify(session, null, 2));
  console.log('Querying cards for UID:', session.uid, '(type:', typeof session.uid + ')');
  
  const cards = await getUserCards(session.uid);
  console.log('Cards retrieved:', cards.length);

  if (cards.length === 0) {
    bot.sendMessage(chatId, `📭 You have no cards yet.\n\nUse /addcard to add your first card!\n\n💡 Tip: Use /debug to see detailed information.`);
    return;
  }

  let message = '💳 *Your Cards:*\n\n';
  cards.forEach((card, index) => {
    const maskedNumber = `**** ${card.card_number.slice(-4)}`;
    message += `${index + 1}. Card ${maskedNumber}\n`;
    message += `   💰 Balance: ${card.current_amount.toFixed(2)} ₼\n\n`;
  });

  message += '_Use /balance to see detailed balance info_';

  bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
}

// /addcard - Start adding a new card
export function handleAddCard(bot, msg) {
  const chatId = msg.chat.id;
  if (!requireAuth(bot, chatId)) return;

  setConversationState(chatId, { step: 'awaiting_card_number' });
  tempData.set(chatId, {});
  bot.sendMessage(chatId, '💳 Please enter the *card number* (16 digits):', { parse_mode: 'Markdown' });
}

// /balance - Show balance for all cards or specific card
export async function handleBalance(bot, msg) {
  const chatId = msg.chat.id;
  if (!requireAuth(bot, chatId)) return;

  const session = getSession(chatId);
  const cards = await getUserCards(session.uid);

  if (cards.length === 0) {
    bot.sendMessage(chatId, '📭 You have no cards yet.\n\nUse /addcard to add your first card!');
    return;
  }

  let message = '💰 *Card Balances:*\n\n';
  let totalBalance = 0;

  cards.forEach((card, index) => {
    const maskedNumber = `**** ${card.card_number.slice(-4)}`;
    message += `${index + 1}. Card ${maskedNumber}\n`;
    message += `   Balance: *${card.current_amount.toFixed(2)} ₼*\n\n`;
    totalBalance += card.current_amount;
  });

  message += `━━━━━━━━━━━━━━━\n`;
  message += `📊 *Total Balance: ${totalBalance.toFixed(2)} ₼*`;

  bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
}

// /transactions - View transactions
export async function handleTransactions(bot, msg) {
  const chatId = msg.chat.id;
  if (!requireAuth(bot, chatId)) return;

  const session = getSession(chatId);
  const cards = await getUserCards(session.uid);

  if (cards.length === 0) {
    bot.sendMessage(chatId, '📭 You have no cards yet.\n\nUse /addcard to add your first card!');
    return;
  }

  // If only one card, show transactions directly
  if (cards.length === 1) {
    await showCardTransactions(bot, chatId, cards[0]);
    return;
  }

  // If multiple cards, let user choose
  const keyboard = cards.map((card, index) => [{
    text: `Card **** ${card.card_number.slice(-4)}`,
    callback_data: `view_tx_${card.id}`,
  }]);

  bot.sendMessage(chatId, '📋 Select a card to view transactions:', {
    reply_markup: { inline_keyboard: keyboard },
  });
}

async function showCardTransactions(bot, chatId, card) {
  const transactions = await getCardTransactions(card.id);

  if (transactions.length === 0) {
    const maskedNumber = `**** ${card.card_number.slice(-4)}`;
    bot.sendMessage(chatId, `📭 No transactions found for card ${maskedNumber}.\n\nUse /addtransaction to add one!`);
    return;
  }

  const maskedNumber = `**** ${card.card_number.slice(-4)}`;
  let message = `📋 *Transactions for Card ${maskedNumber}:*\n\n`;

  // Show last 10 transactions
  const recentTx = transactions.slice(0, 10);
  recentTx.forEach((tx) => {
    const icon = tx.type === 'cost' ? '🔴' : '🟢';
    const sign = tx.type === 'cost' ? '-' : '+';
    const date = new Date(tx.date).toLocaleDateString();
    const scheduled = tx.scheduled ? ' ⏰' : '';
    message += `${icon} ${tx.title}${scheduled}\n`;
    message += `   ${sign}${tx.amount.toFixed(2)} ₼ • ${tx.category} • ${date}\n\n`;
  });

  if (transactions.length > 10) {
    message += `_...and ${transactions.length - 10} more transactions_`;
  }

  bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
}

// /addtransaction - Start adding a new transaction
export async function handleAddTransaction(bot, msg) {
  const chatId = msg.chat.id;
  if (!requireAuth(bot, chatId)) return;

  const session = getSession(chatId);
  const cards = await getUserCards(session.uid);

  if (cards.length === 0) {
    bot.sendMessage(chatId, '📭 You have no cards yet.\n\nUse /addcard first to add a card!');
    return;
  }

  tempData.set(chatId, { cards });

  if (cards.length === 1) {
    // Single card, proceed with title
    tempData.get(chatId).cardId = cards[0].id;
    setConversationState(chatId, { step: 'awaiting_tx_title' });
    bot.sendMessage(chatId, '📝 Enter transaction *title*:', { parse_mode: 'Markdown' });
    return;
  }

  // Multiple cards, let user choose
  const keyboard = cards.map((card) => [{
    text: `Card **** ${card.card_number.slice(-4)}`,
    callback_data: `add_tx_card_${card.id}`,
  }]);

  setConversationState(chatId, { step: 'awaiting_tx_card' });
  bot.sendMessage(chatId, '💳 Select a card for this transaction:', {
    reply_markup: { inline_keyboard: keyboard },
  });
}

// /limits - View and manage card limits
export async function handleLimits(bot, msg) {
  const chatId = msg.chat.id;
  if (!requireAuth(bot, chatId)) return;

  const session = getSession(chatId);
  const cards = await getUserCards(session.uid);

  if (cards.length === 0) {
    bot.sendMessage(chatId, '📭 You have no cards yet.\n\nUse /addcard to add your first card!');
    return;
  }

  let message = '⚙️ *Card Limits:*\n\n';

  cards.forEach((card, index) => {
    const maskedNumber = `**** ${card.card_number.slice(-4)}`;
    message += `${index + 1}. Card ${maskedNumber}\n`;

    if (card.limits && card.limits.length > 0) {
      card.limits.forEach((limit) => {
        message += `   📅 ${limit.month}: ${limit.amount} ₼\n`;
      });
    } else {
      message += `   _No limits set_\n`;
    }
    message += '\n';
  });

  message += '_Use /addlimit to add a new limit_\n';
  message += '_Use /limitstatus to see spending vs limits_';

  bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
}

// /addlimit - Add a new spending limit
export async function handleAddLimit(bot, msg) {
  const chatId = msg.chat.id;
  if (!requireAuth(bot, chatId)) return;

  const session = getSession(chatId);
  const cards = await getUserCards(session.uid);

  if (cards.length === 0) {
    bot.sendMessage(chatId, '📭 You have no cards yet.\n\nUse /addcard first!');
    return;
  }

  tempData.set(chatId, { cards, action: 'addlimit' });

  if (cards.length === 1) {
    tempData.get(chatId).cardId = cards[0].id;
    setConversationState(chatId, { step: 'awaiting_limit_month' });
    bot.sendMessage(chatId, '📅 Enter the month for the limit (YYYY-MM, e.g., 2026-01):', { parse_mode: 'Markdown' });
    return;
  }

  const keyboard = cards.map((card) => [{
    text: `Card **** ${card.card_number.slice(-4)}`,
    callback_data: `limit_card_${card.id}`,
  }]);

  setConversationState(chatId, { step: 'awaiting_limit_card' });
  bot.sendMessage(chatId, '💳 Select a card to add a limit:', {
    reply_markup: { inline_keyboard: keyboard },
  });
}

// /limitstatus - View spending vs limits
export async function handleLimitStatus(bot, msg) {
  const chatId = msg.chat.id;
  if (!requireAuth(bot, chatId)) return;

  const session = getSession(chatId);
  const cards = await getUserCards(session.uid);

  if (cards.length === 0) {
    bot.sendMessage(chatId, '📭 You have no cards yet.');
    return;
  }

  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  let message = '📊 *Spending vs Limits (Current Month):*\n\n';

  for (const card of cards) {
    const maskedNumber = `**** ${card.card_number.slice(-4)}`;
    message += `💳 Card ${maskedNumber}\n`;

    const limit = card.limits?.find(l => l.month === currentMonth);
    if (!limit) {
      message += `   _No limit set for ${currentMonth}_\n\n`;
      continue;
    }

    // Get current month transactions
    const transactions = await getCardTransactions(card.id);
    const monthSpending = transactions
      .filter(tx => {
        if (tx.type !== 'cost' || !tx.isAffect) return false;
        const txMonth = tx.date.substring(0, 7);
        return txMonth === currentMonth;
      })
      .reduce((sum, tx) => sum + tx.amount, 0);

    const percentage = Math.min((monthSpending / limit.amount) * 100, 100);
    const remaining = Math.max(limit.amount - monthSpending, 0);
    const progressBar = generateProgressBar(percentage);

    message += `   Limit: ${limit.amount} ₼\n`;
    message += `   Spent: ${monthSpending.toFixed(2)} ₼\n`;
    message += `   ${progressBar} ${percentage.toFixed(0)}%\n`;
    message += `   Remaining: ${remaining.toFixed(2)} ₼\n`;
    
    if (monthSpending > limit.amount) {
      message += `   ⚠️ *OVER LIMIT by ${(monthSpending - limit.amount).toFixed(2)} ₼*\n`;
    }
    message += '\n';
  }

  bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
}

// /plans - View all plans
export async function handlePlans(bot, msg) {
  const chatId = msg.chat.id;
  if (!requireAuth(bot, chatId)) return;

  const session = getSession(chatId);
  const cards = await getUserCards(session.uid);

  if (cards.length === 0) {
    bot.sendMessage(chatId, '📭 You have no cards yet.');
    return;
  }

  let message = '📋 *Card Plans (Minimum Balance Goals):*\n\n';

  cards.forEach((card, index) => {
    const maskedNumber = `**** ${card.card_number.slice(-4)}`;
    message += `${index + 1}. Card ${maskedNumber}\n`;
    message += `   Current Balance: *${card.current_amount.toFixed(2)} ₼*\n`;

    if (card.plans && card.plans.length > 0) {
      card.plans.forEach((plan) => {
        const status = card.current_amount >= plan.amount ? '✅' : '⚠️';
        message += `   ${status} ${plan.month}: min ${plan.amount} ₼\n`;
      });
    } else {
      message += `   _No plans set_\n`;
    }
    message += '\n';
  });

  message += '_Use /addplan to add a new plan_';

  bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
}

// /addplan - Add a new plan
export async function handleAddPlan(bot, msg) {
  const chatId = msg.chat.id;
  if (!requireAuth(bot, chatId)) return;

  const session = getSession(chatId);
  const cards = await getUserCards(session.uid);

  if (cards.length === 0) {
    bot.sendMessage(chatId, '📭 You have no cards yet.');
    return;
  }

  tempData.set(chatId, { cards, action: 'addplan' });

  if (cards.length === 1) {
    tempData.get(chatId).cardId = cards[0].id;
    setConversationState(chatId, { step: 'awaiting_plan_month' });
    bot.sendMessage(chatId, '📅 Enter the month for the plan (YYYY-MM, e.g., 2026-01):', { parse_mode: 'Markdown' });
    return;
  }

  const keyboard = cards.map((card) => [{
    text: `Card **** ${card.card_number.slice(-4)}`,
    callback_data: `plan_card_${card.id}`,
  }]);

  setConversationState(chatId, { step: 'awaiting_plan_card' });
  bot.sendMessage(chatId, '💳 Select a card to add a plan:', {
    reply_markup: { inline_keyboard: keyboard },
  });
}

// /wishes - View all wishes
export async function handleWishes(bot, msg) {
  const chatId = msg.chat.id;
  if (!requireAuth(bot, chatId)) return;

  const session = getSession(chatId);
  const cards = await getUserCards(session.uid);

  if (cards.length === 0) {
    bot.sendMessage(chatId, '📭 You have no cards yet.');
    return;
  }

  let message = '🌟 *Card Wishes (Savings Goals):*\n\n';

  cards.forEach((card, index) => {
    const maskedNumber = `**** ${card.card_number.slice(-4)}`;
    message += `${index + 1}. Card ${maskedNumber}\n`;
    message += `   Balance: *${card.current_amount.toFixed(2)} ₼*\n`;

    if (card.wishes && card.wishes.length > 0) {
      card.wishes.forEach((wish) => {
        const progress = Math.min((card.current_amount / wish.targetAmount) * 100, 100);
        const remaining = Math.max(wish.targetAmount - card.current_amount, 0);
        const status = card.current_amount >= wish.targetAmount ? '✅' : '🎯';
        message += `   ${status} ${wish.name}: ${wish.targetAmount} ₼\n`;
        message += `      Progress: ${progress.toFixed(0)}% (${remaining.toFixed(2)} ₼ remaining)\n`;
      });
    } else {
      message += `   _No wishes set_\n`;
    }
    message += '\n';
  });

  message += '_Use /addwish to add a new wish_\n';
  message += '_Use /wishstatus for detailed progress_';

  bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
}

// /addwish - Add a new wish
export async function handleAddWish(bot, msg) {
  const chatId = msg.chat.id;
  if (!requireAuth(bot, chatId)) return;

  const session = getSession(chatId);
  const cards = await getUserCards(session.uid);

  if (cards.length === 0) {
    bot.sendMessage(chatId, '📭 You have no cards yet.');
    return;
  }

  tempData.set(chatId, { cards, action: 'addwish' });

  if (cards.length === 1) {
    tempData.get(chatId).cardId = cards[0].id;
    setConversationState(chatId, { step: 'awaiting_wish_name' });
    bot.sendMessage(chatId, '🌟 Enter a name for your wish (e.g., "New Phone", "Vacation"):', { parse_mode: 'Markdown' });
    return;
  }

  const keyboard = cards.map((card) => [{
    text: `Card **** ${card.card_number.slice(-4)}`,
    callback_data: `wish_card_${card.id}`,
  }]);

  setConversationState(chatId, { step: 'awaiting_wish_card' });
  bot.sendMessage(chatId, '💳 Select a card to add a wish:', {
    reply_markup: { inline_keyboard: keyboard },
  });
}

// /wishstatus - Detailed wish progress
export async function handleWishStatus(bot, msg) {
  const chatId = msg.chat.id;
  if (!requireAuth(bot, chatId)) return;

  const session = getSession(chatId);
  const cards = await getUserCards(session.uid);

  if (cards.length === 0) {
    bot.sendMessage(chatId, '📭 You have no cards yet.');
    return;
  }

  let message = '🎯 *Wish Progress Status:*\n\n';
  let hasWishes = false;

  for (const card of cards) {
    if (!card.wishes || card.wishes.length === 0) continue;
    hasWishes = true;

    const maskedNumber = `**** ${card.card_number.slice(-4)}`;
    message += `💳 Card ${maskedNumber}\n`;
    message += `Balance: *${card.current_amount.toFixed(2)} ₼*\n\n`;

    card.wishes.forEach((wish, i) => {
      const progress = Math.min((card.current_amount / wish.targetAmount) * 100, 100);
      const remaining = Math.max(wish.targetAmount - card.current_amount, 0);
      const progressBar = generateProgressBar(progress);
      const status = card.current_amount >= wish.targetAmount ? '✅ ACHIEVED!' : '';

      message += `${i + 1}. *${wish.name}*\n`;
      message += `   Target: ${wish.targetAmount} ₼\n`;
      message += `   ${progressBar} ${progress.toFixed(1)}%\n`;
      if (remaining > 0) {
        message += `   💰 ${remaining.toFixed(2)} ₼ more needed\n`;
      } else {
        message += `   ${status}\n`;
      }
      message += '\n';
    });
  }

  if (!hasWishes) {
    message += '_No wishes set for any card._\n\nUse /addwish to create a savings goal!';
  }

  bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
}

// /scheduled - View scheduled transactions
export async function handleScheduled(bot, msg) {
  const chatId = msg.chat.id;
  if (!requireAuth(bot, chatId)) return;

  const session = getSession(chatId);
  const cards = await getUserCards(session.uid);

  if (cards.length === 0) {
    bot.sendMessage(chatId, '📭 You have no cards yet.');
    return;
  }

  if (cards.length === 1) {
    await showScheduledTransactions(bot, chatId, cards[0]);
    return;
  }

  const keyboard = cards.map((card) => [{
    text: `Card **** ${card.card_number.slice(-4)}`,
    callback_data: `scheduled_${card.id}`,
  }]);

  bot.sendMessage(chatId, '📋 Select a card to view scheduled transactions:', {
    reply_markup: { inline_keyboard: keyboard },
  });
}

async function showScheduledTransactions(bot, chatId, card) {
  const transactions = await getScheduledTransactions(card.id);
  const maskedNumber = `**** ${card.card_number.slice(-4)}`;

  if (transactions.length === 0) {
    bot.sendMessage(chatId, `⏰ No scheduled transactions for card ${maskedNumber}.\n\nScheduled transactions are future-dated transactions that haven't been applied yet.`);
    return;
  }

  let message = `⏰ *Scheduled Transactions for ${maskedNumber}:*\n\n`;
  let totalIncome = 0;
  let totalExpense = 0;

  transactions.forEach((tx) => {
    const icon = tx.type === 'cost' ? '🔴' : '🟢';
    const sign = tx.type === 'cost' ? '-' : '+';
    const date = new Date(tx.date).toLocaleDateString();
    message += `${icon} ${tx.title}\n`;
    message += `   ${sign}${tx.amount.toFixed(2)} ₼ • ${tx.category} • ${date}\n\n`;

    if (tx.type === 'cost') {
      totalExpense += tx.amount;
    } else {
      totalIncome += tx.amount;
    }
  });

  message += `━━━━━━━━━━━━━━━\n`;
  message += `📊 *Summary:*\n`;
  message += `Scheduled Income: +${totalIncome.toFixed(2)} ₼\n`;
  message += `Scheduled Expense: -${totalExpense.toFixed(2)} ₼\n`;
  message += `Net Impact: ${(totalIncome - totalExpense).toFixed(2)} ₼`;

  bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
}

// /current - View current (applied) transactions
export async function handleCurrent(bot, msg) {
  const chatId = msg.chat.id;
  if (!requireAuth(bot, chatId)) return;

  const session = getSession(chatId);
  const cards = await getUserCards(session.uid);

  if (cards.length === 0) {
    bot.sendMessage(chatId, '📭 You have no cards yet.');
    return;
  }

  if (cards.length === 1) {
    await showCurrentTransactions(bot, chatId, cards[0]);
    return;
  }

  const keyboard = cards.map((card) => [{
    text: `Card **** ${card.card_number.slice(-4)}`,
    callback_data: `current_${card.id}`,
  }]);

  bot.sendMessage(chatId, '📋 Select a card to view current transactions:', {
    reply_markup: { inline_keyboard: keyboard },
  });
}

async function showCurrentTransactions(bot, chatId, card) {
  const transactions = await getCurrentTransactions(card.id);
  const maskedNumber = `**** ${card.card_number.slice(-4)}`;

  if (transactions.length === 0) {
    bot.sendMessage(chatId, `📋 No current transactions for card ${maskedNumber}.`);
    return;
  }

  let message = `📋 *Current Transactions for ${maskedNumber}:*\n\n`;

  // Show last 15 transactions
  const recent = transactions.slice(0, 15);
  recent.forEach((tx) => {
    const icon = tx.type === 'cost' ? '🔴' : '🟢';
    const sign = tx.type === 'cost' ? '-' : '+';
    const date = new Date(tx.date).toLocaleDateString();
    message += `${icon} ${tx.title}\n`;
    message += `   ${sign}${tx.amount.toFixed(2)} ₼ • ${tx.category} • ${date}\n\n`;
  });

  if (transactions.length > 15) {
    message += `_...and ${transactions.length - 15} more transactions_`;
  }

  bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
}

// /stats - View statistics and charts
export async function handleStats(bot, msg) {
  const chatId = msg.chat.id;
  if (!requireAuth(bot, chatId)) return;

  const keyboard = [
    [{ text: '📅 This Week', callback_data: 'stats_period_week' }],
    [{ text: '📆 This Month', callback_data: 'stats_period_month' }],
    [{ text: '🗓️ Last 3 Months', callback_data: 'stats_period_3months' }],
    [{ text: '📊 This Year', callback_data: 'stats_period_year' }],
    [{ text: '🌐 All Time', callback_data: 'stats_period_all' }],
  ];

  bot.sendMessage(chatId, '📊 *Select a time period for statistics:*', {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: keyboard },
  });
}

// Helper function to generate progress bar
function generateProgressBar(percentage) {
  const filled = Math.round(percentage / 10);
  const empty = 10 - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

// Handle callback queries (button clicks)
export async function handleCallbackQuery(bot, query) {
  const chatId = query.message.chat.id;
  const data = query.data;

  // View transactions for a specific card
  if (data.startsWith('view_tx_')) {
    const cardId = data.replace('view_tx_', '');
    const card = await getCardById(cardId);
    if (card) {
      await showCardTransactions(bot, chatId, card);
    }
    bot.answerCallbackQuery(query.id);
    return;
  }

  // Select card for transaction
  if (data.startsWith('add_tx_card_')) {
    const cardId = data.replace('add_tx_card_', '');
    const cardData = tempData.get(chatId) || {};
    cardData.cardId = cardId;
    tempData.set(chatId, cardData);
    setConversationState(chatId, { step: 'awaiting_tx_title' });
    bot.sendMessage(chatId, '📝 Enter transaction *title*:', { parse_mode: 'Markdown' });
    bot.answerCallbackQuery(query.id);
    return;
  }

  // Select transaction type
  if (data.startsWith('tx_type_')) {
    const type = data.replace('tx_type_', '');
    const txData = tempData.get(chatId) || {};
    txData.type = type;
    tempData.set(chatId, txData);
    setConversationState(chatId, { step: 'awaiting_tx_category' });

    const categories = type === 'cost' 
      ? ['Food', 'Transport', 'Shopping', 'Entertainment', 'Bills', 'Other']
      : ['Salary', 'Gift', 'Refund', 'Other'];

    const keyboard = categories.map((cat) => [{
      text: cat,
      callback_data: `tx_cat_${cat}`,
    }]);

    bot.sendMessage(chatId, '📂 Select a *category*:', {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: keyboard },
    });
    bot.answerCallbackQuery(query.id);
    return;
  }

  // Select category
  if (data.startsWith('tx_cat_')) {
    const category = data.replace('tx_cat_', '');
    const txData = tempData.get(chatId) || {};
    txData.category = category;
    tempData.set(chatId, txData);
    setConversationState(chatId, { step: 'awaiting_tx_amount' });
    bot.sendMessage(chatId, '💵 Enter the *amount* (in ₼):', { parse_mode: 'Markdown' });
    bot.answerCallbackQuery(query.id);
    return;
  }

  // Select card for limit
  if (data.startsWith('limit_card_')) {
    const cardId = data.replace('limit_card_', '');
    const cardData = tempData.get(chatId) || {};
    cardData.cardId = cardId;
    tempData.set(chatId, cardData);
    setConversationState(chatId, { step: 'awaiting_limit_month' });
    bot.sendMessage(chatId, '📅 Enter the month for the limit (YYYY-MM, e.g., 2026-01):', { parse_mode: 'Markdown' });
    bot.answerCallbackQuery(query.id);
    return;
  }

  // Select card for plan
  if (data.startsWith('plan_card_')) {
    const cardId = data.replace('plan_card_', '');
    const cardData = tempData.get(chatId) || {};
    cardData.cardId = cardId;
    tempData.set(chatId, cardData);
    setConversationState(chatId, { step: 'awaiting_plan_month' });
    bot.sendMessage(chatId, '📅 Enter the month for the plan (YYYY-MM, e.g., 2026-01):', { parse_mode: 'Markdown' });
    bot.answerCallbackQuery(query.id);
    return;
  }

  // Select card for wish
  if (data.startsWith('wish_card_')) {
    const cardId = data.replace('wish_card_', '');
    const cardData = tempData.get(chatId) || {};
    cardData.cardId = cardId;
    tempData.set(chatId, cardData);
    setConversationState(chatId, { step: 'awaiting_wish_name' });
    bot.sendMessage(chatId, '🌟 Enter a name for your wish (e.g., "New Phone", "Vacation"):', { parse_mode: 'Markdown' });
    bot.answerCallbackQuery(query.id);
    return;
  }

  // View scheduled transactions for a card
  if (data.startsWith('scheduled_')) {
    const cardId = data.replace('scheduled_', '');
    const card = await getCardById(cardId);
    if (card) {
      await showScheduledTransactions(bot, chatId, card);
    }
    bot.answerCallbackQuery(query.id);
    return;
  }

  // View current transactions for a card
  if (data.startsWith('current_')) {
    const cardId = data.replace('current_', '');
    const card = await getCardById(cardId);
    if (card) {
      await showCurrentTransactions(bot, chatId, card);
    }
    bot.answerCallbackQuery(query.id);
    return;
  }

  // Stats period selection
  if (data.startsWith('stats_period_')) {
    const period = data.replace('stats_period_', '');
    tempData.set(chatId, { period });

    const keyboard = [
      [{ text: '🍩 Spending by Category', callback_data: 'stats_chart_category' }],
      [{ text: '📊 Income vs Expense', callback_data: 'stats_chart_income_expense' }],
      [{ text: '📈 Net Revenue', callback_data: 'stats_chart_net' }],
      [{ text: '📉 Spending Trend', callback_data: 'stats_chart_trend' }],
      [{ text: '⏰ Scheduled Impact', callback_data: 'stats_chart_scheduled' }],
      [{ text: '💰 Total Revenue Breakdown', callback_data: 'stats_chart_total' }],
    ];

    bot.sendMessage(chatId, '📊 *Select a chart type:*', {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: keyboard },
    });
    bot.answerCallbackQuery(query.id);
    return;
  }

  // Stats chart type selection
  if (data.startsWith('stats_chart_')) {
    const chartType = data.replace('stats_chart_', '');
    const session = getSession(chatId);
    const periodData = tempData.get(chatId) || {};
    const period = periodData.period || 'month';

    bot.sendMessage(chatId, '⏳ Generating chart...');

    try {
      const transactions = await getAllUserTransactions(session.uid);
      const { startDate, endDate } = getDateRange(period);
      
      // Filter transactions by date range
      const filtered = transactions.filter(tx => {
        const txDate = tx.date.split('T')[0];
        return txDate >= startDate && txDate <= endDate;
      });

      let chartUrl = null;
      let chartTitle = '';

      switch (chartType) {
        case 'category':
          chartUrl = generateSpendingByCategoryChart(filtered, `Spending by Category (${getPeriodLabel(period)})`);
          chartTitle = 'Spending by Category';
          break;
        case 'income_expense':
          chartUrl = generateIncomeVsExpenseChart(filtered, `Income vs Expense (${getPeriodLabel(period)})`);
          chartTitle = 'Income vs Expense';
          break;
        case 'net':
          chartUrl = generateNetRevenueChart(filtered, `Net Revenue (${getPeriodLabel(period)})`);
          chartTitle = 'Net Revenue';
          break;
        case 'trend':
          chartUrl = generateSpendingTrendChart(filtered, `Spending Trend (${getPeriodLabel(period)})`);
          chartTitle = 'Spending Trend';
          break;
        case 'scheduled':
          // For scheduled impact, we need current balance and scheduled transactions
          const cards = await getUserCards(session.uid);
          const totalBalance = cards.reduce((sum, c) => sum + c.current_amount, 0);
          const scheduledTx = transactions.filter(tx => tx.scheduled);
          chartUrl = generateScheduledImpactChart(totalBalance, scheduledTx, 'Scheduled Transactions Impact');
          chartTitle = 'Scheduled Impact';
          break;
        case 'total':
          chartUrl = generateTotalRevenueChart(transactions, `Total Revenue Breakdown`);
          chartTitle = 'Total Revenue';
          break;
      }

      if (chartUrl) {
        await bot.sendPhoto(chatId, chartUrl, { caption: `📊 ${chartTitle}` });
      } else {
        bot.sendMessage(chatId, '📭 Not enough data to generate this chart. Try adding more transactions!');
      }
    } catch (error) {
      console.error('Chart generation error:', error);
      bot.sendMessage(chatId, '❌ Failed to generate chart. Please try again.');
    }

    tempData.delete(chatId);
    bot.answerCallbackQuery(query.id);
    return;
  }

  bot.answerCallbackQuery(query.id);
}

// Helper to get period label
function getPeriodLabel(period) {
  switch (period) {
    case 'week': return 'This Week';
    case 'month': return 'This Month';
    case '3months': return 'Last 3 Months';
    case 'year': return 'This Year';
    default: return 'All Time';
  }
}

// Handle command conversation input
export async function handleCommandInput(bot, msg) {
  const chatId = msg.chat.id;
  const text = msg.text;
  const state = getConversationState(chatId);

  if (!state) return false;

  // Add card flow
  if (state.step === 'awaiting_card_number') {
    const cardNumber = text.replace(/\s/g, '');
    if (!/^\d{16}$/.test(cardNumber)) {
      bot.sendMessage(chatId, '❌ Invalid card number. Please enter exactly 16 digits:');
      return true;
    }
    const data = tempData.get(chatId) || {};
    data.cardNumber = cardNumber;
    tempData.set(chatId, data);
    setConversationState(chatId, { step: 'awaiting_card_amount' });
    bot.sendMessage(chatId, '💰 Enter the *initial balance* (in ₼):', { parse_mode: 'Markdown' });
    return true;
  }

  if (state.step === 'awaiting_card_amount') {
    const amount = parseFloat(text);
    if (isNaN(amount) || amount < 0) {
      bot.sendMessage(chatId, '❌ Invalid amount. Please enter a valid number:');
      return true;
    }

    const data = tempData.get(chatId);
    const session = getSession(chatId);

    bot.sendMessage(chatId, '⏳ Adding card...');

    const result = await addCard(session.uid, data.cardNumber, amount);

    if (result.error) {
      bot.sendMessage(chatId, `❌ Failed to add card: ${result.error}`);
    } else {
      const maskedNumber = `**** ${data.cardNumber.slice(-4)}`;
      bot.sendMessage(chatId, `✅ Card ${maskedNumber} added successfully with balance ${amount.toFixed(2)} ₼!`);
    }

    clearConversationState(chatId);
    tempData.delete(chatId);
    return true;
  }

  // Add transaction flow
  if (state.step === 'awaiting_tx_title') {
    const data = tempData.get(chatId) || {};
    data.title = text;
    tempData.set(chatId, data);
    setConversationState(chatId, { step: 'awaiting_tx_type' });

    const keyboard = [
      [{ text: '🔴 Cost (Expense)', callback_data: 'tx_type_cost' }],
      [{ text: '🟢 Income', callback_data: 'tx_type_income' }],
    ];

    bot.sendMessage(chatId, '📊 Select transaction *type*:', {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: keyboard },
    });
    return true;
  }

  if (state.step === 'awaiting_tx_amount') {
    const amount = parseFloat(text);
    if (isNaN(amount) || amount <= 0) {
      bot.sendMessage(chatId, '❌ Invalid amount. Please enter a positive number:');
      return true;
    }
    const data = tempData.get(chatId) || {};
    data.amount = amount;
    tempData.set(chatId, data);
    setConversationState(chatId, { step: 'awaiting_tx_date' });
    bot.sendMessage(chatId, '📅 Enter the *date* (YYYY-MM-DD) or type "today":', { parse_mode: 'Markdown' });
    return true;
  }

  if (state.step === 'awaiting_tx_date') {
    let date;
    if (text.toLowerCase() === 'today') {
      date = new Date().toISOString().split('T')[0];
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
      date = text;
    } else {
      bot.sendMessage(chatId, '❌ Invalid date format. Please use YYYY-MM-DD or type "today":');
      return true;
    }

    const data = tempData.get(chatId);
    data.date = date;

    bot.sendMessage(chatId, '⏳ Adding transaction...');

    const result = await addTransaction({
      cardId: data.cardId,
      title: data.title,
      type: data.type,
      category: data.category,
      amount: data.amount,
      date: data.date,
    });

    if (result.error) {
      bot.sendMessage(chatId, `❌ Failed to add transaction: ${result.error}`);
    } else {
      const icon = data.type === 'cost' ? '🔴' : '🟢';
      const sign = data.type === 'cost' ? '-' : '+';
      bot.sendMessage(
        chatId,
        `✅ Transaction added!\n\n${icon} ${data.title}\n${sign}${data.amount.toFixed(2)} ₼ • ${data.category} • ${data.date}`
      );
    }

    clearConversationState(chatId);
    tempData.delete(chatId);
    return true;
  }

  // Add limit flow
  if (state.step === 'awaiting_limit_month') {
    if (!/^\d{4}-\d{2}$/.test(text)) {
      bot.sendMessage(chatId, '❌ Invalid format. Please use YYYY-MM (e.g., 2026-01):');
      return true;
    }
    const data = tempData.get(chatId) || {};
    data.month = text;
    tempData.set(chatId, data);
    setConversationState(chatId, { step: 'awaiting_limit_amount' });
    bot.sendMessage(chatId, '💰 Enter the spending limit amount (in ₼):', { parse_mode: 'Markdown' });
    return true;
  }

  if (state.step === 'awaiting_limit_amount') {
    const amount = parseFloat(text);
    if (isNaN(amount) || amount <= 0) {
      bot.sendMessage(chatId, '❌ Invalid amount. Please enter a positive number:');
      return true;
    }

    const data = tempData.get(chatId);
    bot.sendMessage(chatId, '⏳ Adding limit...');

    const result = await addCardLimit(data.cardId, data.month, amount);

    if (result.error) {
      bot.sendMessage(chatId, `❌ Failed to add limit: ${result.error}`);
    } else {
      bot.sendMessage(chatId, `✅ Limit added!\n\n📅 Month: ${data.month}\n💰 Limit: ${amount.toFixed(2)} ₼`);
    }

    clearConversationState(chatId);
    tempData.delete(chatId);
    return true;
  }

  // Add plan flow
  if (state.step === 'awaiting_plan_month') {
    if (!/^\d{4}-\d{2}$/.test(text)) {
      bot.sendMessage(chatId, '❌ Invalid format. Please use YYYY-MM (e.g., 2026-01):');
      return true;
    }
    const data = tempData.get(chatId) || {};
    data.month = text;
    tempData.set(chatId, data);
    setConversationState(chatId, { step: 'awaiting_plan_amount' });
    bot.sendMessage(chatId, '💰 Enter the minimum balance goal (in ₼):', { parse_mode: 'Markdown' });
    return true;
  }

  if (state.step === 'awaiting_plan_amount') {
    const amount = parseFloat(text);
    if (isNaN(amount) || amount < 0) {
      bot.sendMessage(chatId, '❌ Invalid amount. Please enter a valid number:');
      return true;
    }

    const data = tempData.get(chatId);
    bot.sendMessage(chatId, '⏳ Adding plan...');

    const result = await addCardPlan(data.cardId, data.month, amount);

    if (result.error) {
      bot.sendMessage(chatId, `❌ Failed to add plan: ${result.error}`);
    } else {
      bot.sendMessage(chatId, `✅ Plan added!\n\n📅 Month: ${data.month}\n💰 Minimum Balance: ${amount.toFixed(2)} ₼`);
    }

    clearConversationState(chatId);
    tempData.delete(chatId);
    return true;
  }

  // Add wish flow
  if (state.step === 'awaiting_wish_name') {
    if (!text || text.trim().length === 0) {
      bot.sendMessage(chatId, '❌ Please enter a name for your wish:');
      return true;
    }
    const data = tempData.get(chatId) || {};
    data.wishName = text.trim();
    tempData.set(chatId, data);
    setConversationState(chatId, { step: 'awaiting_wish_amount' });
    bot.sendMessage(chatId, '💰 Enter the target amount for your wish (in ₼):', { parse_mode: 'Markdown' });
    return true;
  }

  if (state.step === 'awaiting_wish_amount') {
    const amount = parseFloat(text);
    if (isNaN(amount) || amount <= 0) {
      bot.sendMessage(chatId, '❌ Invalid amount. Please enter a positive number:');
      return true;
    }

    const data = tempData.get(chatId);
    bot.sendMessage(chatId, '⏳ Adding wish...');

    const result = await addCardWish(data.cardId, data.wishName, amount);

    if (result.error) {
      bot.sendMessage(chatId, `❌ Failed to add wish: ${result.error}`);
    } else {
      bot.sendMessage(chatId, `✅ Wish added!\n\n🌟 *${data.wishName}*\n🎯 Target: ${amount.toFixed(2)} ₼\n\nStart saving to achieve your goal!`, { parse_mode: 'Markdown' });
    }

    clearConversationState(chatId);
    tempData.delete(chatId);
    return true;
  }

  return false;
}

export { tempData as commandTempData };

