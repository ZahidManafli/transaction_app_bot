import {
  getConversationState,
  setConversationState,
  clearConversationState,
  setSession,
  clearSession,
  getSession,
  isAuthenticated,
} from '../utils/session.js';
import { signInWithEmailPassword, signUpWithEmailPassword } from '../services/firebase.js';

// Temporary storage for multi-step input data
const tempData = new Map();

export function handleLogin(bot, msg) {
  const chatId = msg.chat.id;

  if (isAuthenticated(chatId)) {
    bot.sendMessage(chatId, '✅ You are already logged in! Use /logout to sign out first.');
    return;
  }

  setConversationState(chatId, { step: 'awaiting_login_email' });
  bot.sendMessage(chatId, '📧 Please enter your *email address*:', { parse_mode: 'Markdown' });
}

export function handleSignup(bot, msg) {
  const chatId = msg.chat.id;

  if (isAuthenticated(chatId)) {
    bot.sendMessage(chatId, '✅ You are already logged in! Use /logout to sign out first.');
    return;
  }

  setConversationState(chatId, { step: 'awaiting_signup_name' });
  tempData.set(chatId, {});
  bot.sendMessage(chatId, '👤 Please enter your *first name*:', { parse_mode: 'Markdown' });
}

export function handleLogout(bot, msg) {
  const chatId = msg.chat.id;

  if (!isAuthenticated(chatId)) {
    bot.sendMessage(chatId, '❌ You are not logged in.');
    return;
  }

  clearSession(chatId);
  tempData.delete(chatId);
  bot.sendMessage(chatId, '👋 You have been logged out successfully.\n\nUse /login to sign in again or /signup to create a new account.');
}

export async function handleAuthInput(bot, msg) {
  const chatId = msg.chat.id;
  const text = msg.text;
  const state = getConversationState(chatId);

  if (!state) return false;

  // Login flow
  if (state.step === 'awaiting_login_email') {
    tempData.set(chatId, { email: text });
    setConversationState(chatId, { step: 'awaiting_login_password' });
    bot.sendMessage(chatId, '🔑 Please enter your *password*:', { parse_mode: 'Markdown' });
    return true;
  }

  if (state.step === 'awaiting_login_password') {
    const data = tempData.get(chatId);
    const email = data?.email;
    const password = text;

    bot.sendMessage(chatId, '⏳ Signing in...');

    const result = await signInWithEmailPassword(email, password);

    if (result.error) {
      clearConversationState(chatId);
      tempData.delete(chatId);
      bot.sendMessage(chatId, `❌ Login failed: ${result.error}\n\nUse /login to try again.`);
    } else {
      setSession(chatId, result.user);
      clearConversationState(chatId);
      tempData.delete(chatId);

      const welcomeMessage = `✅ Welcome, *${result.user.name || 'User'}*! You are now logged in.

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
    }
    return true;
  }

  // Signup flow
  if (state.step === 'awaiting_signup_name') {
    const data = tempData.get(chatId) || {};
    data.name = text;
    tempData.set(chatId, data);
    setConversationState(chatId, { step: 'awaiting_signup_surname' });
    bot.sendMessage(chatId, '👤 Please enter your *surname*:', { parse_mode: 'Markdown' });
    return true;
  }

  if (state.step === 'awaiting_signup_surname') {
    const data = tempData.get(chatId) || {};
    data.surname = text;
    tempData.set(chatId, data);
    setConversationState(chatId, { step: 'awaiting_signup_email' });
    bot.sendMessage(chatId, '📧 Please enter your *email address*:', { parse_mode: 'Markdown' });
    return true;
  }

  if (state.step === 'awaiting_signup_email') {
    const data = tempData.get(chatId) || {};
    data.email = text;
    tempData.set(chatId, data);
    setConversationState(chatId, { step: 'awaiting_signup_password' });
    bot.sendMessage(chatId, '🔑 Please create a *password* (at least 6 characters):', { parse_mode: 'Markdown' });
    return true;
  }

  if (state.step === 'awaiting_signup_password') {
    const data = tempData.get(chatId);
    const password = text;

    if (password.length < 6) {
      bot.sendMessage(chatId, '❌ Password must be at least 6 characters. Please try again:');
      return true;
    }

    bot.sendMessage(chatId, '⏳ Creating your account...');

    const result = await signUpWithEmailPassword(data.email, password, data.name, data.surname);

    if (result.error) {
      clearConversationState(chatId);
      tempData.delete(chatId);
      bot.sendMessage(chatId, `❌ Signup failed: ${result.error}\n\nUse /signup to try again.`);
    } else {
      clearConversationState(chatId);
      tempData.delete(chatId);
      bot.sendMessage(
        chatId,
        `✅ Account created successfully!\n\nYou can now use /login to sign in with your credentials.`
      );
    }
    return true;
  }

  return false;
}

export { tempData };

