import TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Import handlers
import { handleStart } from './handlers/start.js';
import { handleLogin, handleSignup, handleLogout, handleAuthInput } from './handlers/auth.js';
import {
  handleCards,
  handleAddCard,
  handleBalance,
  handleTransactions,
  handleAddTransaction,
  handleLimits,
  handleAddLimit,
  handleLimitStatus,
  handlePlans,
  handleAddPlan,
  handleWishes,
  handleAddWish,
  handleWishStatus,
  handleScheduled,
  handleCurrent,
  handleStats,
  handleCallbackQuery,
  handleCommandInput,
} from './handlers/commands.js';
import { getConversationState } from './utils/session.js';

// Initialize bot
const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
  console.error('ERROR: TELEGRAM_BOT_TOKEN is not set in environment variables!');
  process.exit(1);
}

// Create bot instance with polling
const bot = new TelegramBot(token, { polling: true });

console.log('🤖 Transaction Bot is starting...');

// Register commands with Telegram (creates the dropdown menu)
bot.setMyCommands([
  { command: 'start', description: 'Start the bot' },
  { command: 'login', description: 'Sign in to your account' },
  { command: 'signup', description: 'Create a new account' },
  { command: 'logout', description: 'Sign out' },
  { command: 'cards', description: 'View your cards' },
  { command: 'addcard', description: 'Add a new card' },
  { command: 'balance', description: 'Check card balances' },
  { command: 'transactions', description: 'View all transactions' },
  { command: 'scheduled', description: 'View scheduled transactions' },
  { command: 'current', description: 'View applied transactions' },
  { command: 'addtransaction', description: 'Add a transaction' },
  { command: 'limits', description: 'View card limits' },
  { command: 'addlimit', description: 'Add a spending limit' },
  { command: 'limitstatus', description: 'Spending vs limits' },
  { command: 'plans', description: 'View balance goals' },
  { command: 'addplan', description: 'Add a balance goal' },
  { command: 'wishes', description: 'View savings goals' },
  { command: 'addwish', description: 'Add a savings goal' },
  { command: 'wishstatus', description: 'Progress to wishes' },
  { command: 'stats', description: 'View charts and statistics' },
  { command: 'help', description: 'Show all commands' },
  { command: 'cancel', description: 'Cancel current operation' },
]).then(() => {
  console.log('📋 Bot commands menu registered successfully');
}).catch((err) => {
  console.error('Failed to set bot commands:', err.message);
});

// Command handlers
bot.onText(/\/start/, (msg) => handleStart(bot, msg));
bot.onText(/\/login/, (msg) => handleLogin(bot, msg));
bot.onText(/\/signup/, (msg) => handleSignup(bot, msg));
bot.onText(/\/logout/, (msg) => handleLogout(bot, msg));
bot.onText(/\/cards/, (msg) => handleCards(bot, msg));
bot.onText(/\/addcard/, (msg) => handleAddCard(bot, msg));
bot.onText(/\/balance/, (msg) => handleBalance(bot, msg));
bot.onText(/\/transactions/, (msg) => handleTransactions(bot, msg));
bot.onText(/\/addtransaction/, (msg) => handleAddTransaction(bot, msg));
bot.onText(/\/limits/, (msg) => handleLimits(bot, msg));
bot.onText(/\/addlimit/, (msg) => handleAddLimit(bot, msg));
bot.onText(/\/limitstatus/, (msg) => handleLimitStatus(bot, msg));
bot.onText(/\/plans/, (msg) => handlePlans(bot, msg));
bot.onText(/\/addplan/, (msg) => handleAddPlan(bot, msg));
bot.onText(/\/wishes/, (msg) => handleWishes(bot, msg));
bot.onText(/\/addwish/, (msg) => handleAddWish(bot, msg));
bot.onText(/\/wishstatus/, (msg) => handleWishStatus(bot, msg));
bot.onText(/\/scheduled/, (msg) => handleScheduled(bot, msg));
bot.onText(/\/current/, (msg) => handleCurrent(bot, msg));
bot.onText(/\/stats/, (msg) => handleStats(bot, msg));

// Help command
bot.onText(/\/help/, (msg) => {
  const helpMessage = `📚 *Transaction Bot Help*

*Authentication:*
/start - Start the bot
/login - Sign in to your account
/signup - Create a new account
/logout - Sign out

*Card Management:*
/cards - View all your cards
/addcard - Add a new card
/balance - Check card balances

*Transactions:*
/transactions - View all transactions
/addtransaction - Add a new transaction
/scheduled - View scheduled (future) transactions
/current - View current (applied) transactions

*Limits (Monthly Spending):*
/limits - View all limits
/addlimit - Add a spending limit
/limitstatus - See spending vs limits

*Plans (Balance Goals):*
/plans - View all plans
/addplan - Add a balance goal

*Wishes (Savings Goals):*
/wishes - View all wishes
/addwish - Add a savings goal
/wishstatus - See progress to wishes

*Statistics:*
/stats - View charts and graphs

*Other:*
/help - Show this help message
/cancel - Cancel current operation
/debug - Show debug information`;

  bot.sendMessage(msg.chat.id, helpMessage, { parse_mode: 'Markdown' });
});

// Debug command
bot.onText(/\/debug/, async (msg) => {
  const { getSession, isAuthenticated } = await import('./utils/session.js');
  const { getUserCards } = await import('./services/firebase.js');
  const { db, adminInitialized } = await import('./config/firebase.js');
  
  const chatId = msg.chat.id;
  const authenticated = isAuthenticated(chatId);
  const session = getSession(chatId);
  
  let debugInfo = `🔍 *Debug Information*\n\n`;
  
  // Firebase Status
  debugInfo += `*Firebase Status:*\n`;
  debugInfo += `Database initialized: ${db ? '✅ Yes' : '❌ No'}\n`;
  debugInfo += `Admin SDK with credentials: ${adminInitialized ? '✅ Yes' : '❌ No'}\n\n`;
  
  if (!db || !adminInitialized) {
    debugInfo += `⚠️ *Firebase credentials missing!*\n\n`;
    debugInfo += `To fix this:\n`;
    debugInfo += `1. Get service account from Firebase Console\n`;
    debugInfo += `2. Update .env file with credentials\n`;
    debugInfo += `3. Restart the bot\n\n`;
    debugInfo += `See SETUP_FIREBASE.md for detailed instructions.\n\n`;
  }
  
  // Authentication Status
  debugInfo += `*Authentication:*\n`;
  debugInfo += `Status: ${authenticated ? '✅ Logged in' : '❌ Not logged in'}\n\n`;
  
  if (session) {
    debugInfo += `*Session Data:*\n`;
    debugInfo += `UID: \`${session.uid}\`\n`;
    debugInfo += `Email: ${session.email}\n`;
    debugInfo += `Name: ${session.name || '(not set)'}\n\n`;
    
    // Try to get cards if Firebase is initialized
    if (db && adminInitialized) {
      debugInfo += `*Testing Card Query:*\n`;
      const cards = await getUserCards(session.uid);
      debugInfo += `Cards found: ${cards.length}\n`;
      if (cards.length > 0) {
        debugInfo += `\n*Card Details:*\n`;
        cards.forEach((card, i) => {
          debugInfo += `${i + 1}. ID: \`${card.id}\`\n`;
          debugInfo += `   Card: **** ${card.card_number?.slice(-4) || 'N/A'}\n`;
          debugInfo += `   Balance: ${card.current_amount || 0} ₼\n`;
          debugInfo += `   User ID in DB: \`${card.user_id}\`\n`;
          debugInfo += `   Match: ${card.user_id === session.uid ? '✅' : '❌'}\n\n`;
        });
      } else {
        debugInfo += `\n💡 No cards found. This could mean:\n`;
        debugInfo += `• You haven't added any cards yet\n`;
        debugInfo += `• Cards belong to a different user ID\n`;
        debugInfo += `• Check the console logs for more details\n`;
      }
    } else {
      debugInfo += `\n⚠️ Cannot query cards - Firebase not initialized properly.\n`;
    }
  } else {
    debugInfo += `No session found. Please /login first.`;
  }
  
  bot.sendMessage(chatId, debugInfo, { parse_mode: 'Markdown' });
});

// Cancel command to stop current conversation
bot.onText(/\/cancel/, (msg) => {
  import('./utils/session.js').then(({ clearConversationState }) => {
    clearConversationState(msg.chat.id);
    bot.sendMessage(msg.chat.id, '❌ Operation cancelled.\n\nUse /help to see available commands.');
  });
});

// Handle callback queries (inline keyboard buttons)
bot.on('callback_query', (query) => handleCallbackQuery(bot, query));

// Handle text messages for multi-step conversations
bot.on('message', async (msg) => {
  // Ignore commands
  if (msg.text && msg.text.startsWith('/')) return;

  // Check if we're in a conversation state
  const state = getConversationState(msg.chat.id);
  if (!state) return;

  // Try auth handlers first
  const authHandled = await handleAuthInput(bot, msg);
  if (authHandled) return;

  // Try command handlers
  await handleCommandInput(bot, msg);
});

// Error handling
bot.on('polling_error', (error) => {
  console.error('Polling error:', error.message);
});

bot.on('error', (error) => {
  console.error('Bot error:', error.message);
});

console.log('✅ Transaction Bot is running!');
console.log('📱 Open Telegram and search for your bot to start using it.');

