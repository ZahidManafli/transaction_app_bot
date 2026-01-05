import { isAuthenticated, getSession } from '../utils/session.js';

export function handleStart(bot, msg) {
  const chatId = msg.chat.id;

  if (isAuthenticated(chatId)) {
    const session = getSession(chatId);
    const welcomeMessage = `Welcome back, ${session.name || 'User'}! 👋

Here are the available commands:

💳 *Cards & Balance*
/cards - View your cards
/addcard - Add a new card
/balance - Check balances

📋 *Transactions*
/transactions - All transactions
/scheduled - Future transactions
/current - Applied transactions
/addtransaction - Add transaction

💰 *Limits & Goals*
/limitstatus - Spending vs limits
/wishstatus - Progress to wishes
/plans - View balance goals

📊 *Statistics*
/stats - Charts and graphs

🚪 /logout - Sign out
❓ /help - All commands`;

    bot.sendMessage(chatId, welcomeMessage, { parse_mode: 'Markdown' });
  } else {
    const welcomeMessage = `Hi! 👋 Welcome to *Transaction Bot*.

This bot helps you manage your cards and transactions.

🔐 *Getting Started:*
• If you have an account, use /login
• If you're new here, use /signup`;

    bot.sendMessage(chatId, welcomeMessage, { parse_mode: 'Markdown' });
  }
}

