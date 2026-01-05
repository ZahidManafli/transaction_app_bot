// In-memory session storage
// For production, consider using Redis or a database

const sessions = new Map();
const conversationStates = new Map();

// Session structure: { uid, email, name, surname }
export function getSession(chatId) {
  return sessions.get(chatId) || null;
}

export function setSession(chatId, userData) {
  sessions.set(chatId, {
    uid: userData.uid,
    email: userData.email,
    name: userData.name,
    surname: userData.surname,
    loggedInAt: Date.now(),
  });
}

export function clearSession(chatId) {
  sessions.delete(chatId);
  conversationStates.delete(chatId);
}

export function isAuthenticated(chatId) {
  return sessions.has(chatId);
}

// Conversation state management for multi-step inputs
// States: null, 'awaiting_login_email', 'awaiting_login_password', 
//         'awaiting_signup_name', 'awaiting_signup_surname', 'awaiting_signup_email', 'awaiting_signup_password'
//         'awaiting_card_number', 'awaiting_card_amount'
//         'awaiting_tx_card', 'awaiting_tx_title', 'awaiting_tx_type', 'awaiting_tx_category', 'awaiting_tx_amount', 'awaiting_tx_date'
export function getConversationState(chatId) {
  return conversationStates.get(chatId) || null;
}

export function setConversationState(chatId, state) {
  conversationStates.set(chatId, state);
}

export function clearConversationState(chatId) {
  conversationStates.delete(chatId);
}

