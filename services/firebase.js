import { db, adminInitialized } from '../config/firebase.js';
import dotenv from 'dotenv';

dotenv.config();

const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY;
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID;

// Authenticate user via Firebase REST API
export async function signInWithEmailPassword(email, password) {
  try {
    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          returnSecureToken: true,
        }),
      }
    );

    const data = await response.json();

    if (data.error) {
      return { error: data.error.message };
    }

    // Get user profile from Firestore
    const userProfile = await getUserProfile(data.localId);

    return {
      user: {
        uid: data.localId,
        email: data.email,
        name: userProfile?.name || '',
        surname: userProfile?.surname || '',
      },
    };
  } catch (error) {
    return { error: error.message };
  }
}

// Sign up user via Firebase REST API
export async function signUpWithEmailPassword(email, password, name, surname) {
  try {
    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          returnSecureToken: true,
        }),
      }
    );

    const data = await response.json();

    if (data.error) {
      return { error: data.error.message };
    }

    // Add user profile to Firestore
    await db.collection('users').add({
      uid: data.localId,
      name,
      surname,
      email,
      createdAt: new Date(),
    });

    return {
      user: {
        uid: data.localId,
        email: data.email,
        name,
        surname,
      },
    };
  } catch (error) {
    return { error: error.message };
  }
}

// Get user profile from Firestore
export async function getUserProfile(uid) {
  try {
    const snapshot = await db.collection('users').where('uid', '==', uid).get();
    if (snapshot.empty) return null;
    return snapshot.docs[0].data();
  } catch (error) {
    console.error('Error getting user profile:', error);
    return null;
  }
}

// Get all cards for a user
export async function getUserCards(userId) {
  try {
    if (!db) {
      console.error('❌ Firebase db is not initialized');
      console.error('   This usually means Firebase Admin SDK credentials are missing.');
      console.error('   Please set FIREBASE_PRIVATE_KEY, FIREBASE_CLIENT_EMAIL, and FIREBASE_PROJECT_ID in .env');
      console.error('   Get credentials from: Firebase Console > Project Settings > Service Accounts');
      return [];
    }
    
    if (!adminInitialized) {
      console.warn('⚠️  Firebase Admin SDK initialized without credentials - queries may fail');
    }
    
    console.log('Querying cards for userId:', userId);
    console.log('Admin SDK initialized:', adminInitialized);
    
    // Query cards where user_id matches
    const snapshot = await db.collection('cards').where('user_id', '==', userId).get();
    console.log(`Found ${snapshot.docs.length} cards for user ${userId}`);
    
    // Debug: If no cards found, check what user_ids exist in the database
    if (snapshot.docs.length === 0) {
      console.log('No cards found. Checking database for debugging...');
      try {
        const allCardsSnapshot = await db.collection('cards').limit(10).get();
        console.log(`Total cards in database (sample of 10): ${allCardsSnapshot.docs.length}`);
        allCardsSnapshot.docs.forEach((doc) => {
          const data = doc.data();
          console.log(`Sample card - ID: ${doc.id}, user_id: "${data.user_id}" (type: ${typeof data.user_id}), card_number: ${data.card_number}`);
          console.log(`  Query userId: "${userId}" (type: ${typeof userId})`);
          console.log(`  Match: ${data.user_id === userId}`);
        });
      } catch (debugError) {
        console.error('Error during debug query:', debugError.message);
      }
    }
    
    const cards = snapshot.docs.map((doc) => {
      const data = doc.data();
      console.log('Card found:', { id: doc.id, user_id: data.user_id, card_number: data.card_number });
      return {
        id: doc.id,
        ...data,
      };
    });
    
    return cards;
  } catch (error) {
    console.error('Error getting cards:', error);
    console.error('Error details:', error.message);
    if (error.code) {
      console.error('Error code:', error.code);
    }
    if (error.stack) {
      console.error('Stack trace:', error.stack);
    }
    return [];
  }
}

// Add a new card
export async function addCard(userId, cardNumber, amount) {
  try {
    const docRef = await db.collection('cards').add({
      card_number: cardNumber,
      current_amount: Number(amount),
      user_id: userId,
      limits: [],
      plans: [],
      wishes: [],
      createdAt: new Date(),
    });
    return { id: docRef.id };
  } catch (error) {
    console.error('Error adding card:', error);
    return { error: error.message };
  }
}

// Get transactions for a card
export async function getCardTransactions(cardId) {
  try {
    const snapshot = await db
      .collection('transactions')
      .where('cardId', '==', cardId)
      .orderBy('date', 'desc')
      .get();
    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
  } catch (error) {
    console.error('Error getting transactions:', error);
    return [];
  }
}

// Add a transaction
export async function addTransaction(tx) {
  try {
    const txDate = new Date(tx.date);
    const now = new Date();
    const isFuture = txDate > now;

    const docRef = await db.collection('transactions').add({
      cardId: tx.cardId,
      title: tx.title,
      type: tx.type,
      category: tx.category,
      amount: Number(tx.amount),
      date: tx.date,
      scheduled: isFuture,
      isAffect: !isFuture,
      includeInExpected: true,
      createdAt: new Date(),
    });

    // Update card balance if not scheduled
    if (!isFuture) {
      const cardRef = db.collection('cards').doc(tx.cardId);
      const cardDoc = await cardRef.get();
      if (cardDoc.exists) {
        const cardData = cardDoc.data();
        const newAmount =
          tx.type === 'cost'
            ? cardData.current_amount - Number(tx.amount)
            : cardData.current_amount + Number(tx.amount);
        await cardRef.update({ current_amount: newAmount });
      }
    }

    return { id: docRef.id };
  } catch (error) {
    console.error('Error adding transaction:', error);
    return { error: error.message };
  }
}

// Get card by ID
export async function getCardById(cardId) {
  try {
    const doc = await db.collection('cards').doc(cardId).get();
    if (!doc.exists) return null;
    return { id: doc.id, ...doc.data() };
  } catch (error) {
    console.error('Error getting card:', error);
    return null;
  }
}

// Update card limits
export async function updateCardLimits(cardId, limits) {
  try {
    await db.collection('cards').doc(cardId).update({ limits });
    return { success: true };
  } catch (error) {
    console.error('Error updating limits:', error);
    return { error: error.message };
  }
}

// Add a limit to a card
export async function addCardLimit(cardId, month, amount) {
  try {
    const cardDoc = await db.collection('cards').doc(cardId).get();
    if (!cardDoc.exists) return { error: 'Card not found' };
    
    const card = cardDoc.data();
    const limits = card.limits || [];
    
    // Check if limit for this month already exists
    const existingIndex = limits.findIndex(l => l.month === month);
    if (existingIndex >= 0) {
      limits[existingIndex].amount = Number(amount);
    } else {
      limits.push({ month, amount: Number(amount) });
    }
    
    await db.collection('cards').doc(cardId).update({ limits });
    return { success: true };
  } catch (error) {
    console.error('Error adding limit:', error);
    return { error: error.message };
  }
}

// Update card plans
export async function updateCardPlans(cardId, plans) {
  try {
    await db.collection('cards').doc(cardId).update({ plans });
    return { success: true };
  } catch (error) {
    console.error('Error updating plans:', error);
    return { error: error.message };
  }
}

// Add a plan to a card
export async function addCardPlan(cardId, month, amount) {
  try {
    const cardDoc = await db.collection('cards').doc(cardId).get();
    if (!cardDoc.exists) return { error: 'Card not found' };
    
    const card = cardDoc.data();
    const plans = card.plans || [];
    
    // Check if plan for this month already exists
    const existingIndex = plans.findIndex(p => p.month === month);
    if (existingIndex >= 0) {
      plans[existingIndex].amount = Number(amount);
    } else {
      plans.push({ month, amount: Number(amount) });
    }
    
    await db.collection('cards').doc(cardId).update({ plans });
    return { success: true };
  } catch (error) {
    console.error('Error adding plan:', error);
    return { error: error.message };
  }
}

// Update card wishes
export async function updateCardWishes(cardId, wishes) {
  try {
    await db.collection('cards').doc(cardId).update({ wishes });
    return { success: true };
  } catch (error) {
    console.error('Error updating wishes:', error);
    return { error: error.message };
  }
}

// Add a wish to a card
export async function addCardWish(cardId, name, targetAmount) {
  try {
    const cardDoc = await db.collection('cards').doc(cardId).get();
    if (!cardDoc.exists) return { error: 'Card not found' };
    
    const card = cardDoc.data();
    const wishes = card.wishes || [];
    
    wishes.push({ 
      name, 
      targetAmount: Number(targetAmount),
      createdAt: new Date().toISOString()
    });
    
    await db.collection('cards').doc(cardId).update({ wishes });
    return { success: true };
  } catch (error) {
    console.error('Error adding wish:', error);
    return { error: error.message };
  }
}

// Get scheduled (future) transactions for a card
export async function getScheduledTransactions(cardId) {
  try {
    const snapshot = await db
      .collection('transactions')
      .where('cardId', '==', cardId)
      .where('scheduled', '==', true)
      .orderBy('date', 'asc')
      .get();
    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
  } catch (error) {
    console.error('Error getting scheduled transactions:', error);
    return [];
  }
}

// Get current (applied) transactions for a card
export async function getCurrentTransactions(cardId) {
  try {
    const snapshot = await db
      .collection('transactions')
      .where('cardId', '==', cardId)
      .where('isAffect', '==', true)
      .orderBy('date', 'desc')
      .get();
    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
  } catch (error) {
    console.error('Error getting current transactions:', error);
    return [];
  }
}

// Get transactions for a specific time period
export async function getTransactionsByPeriod(cardId, startDate, endDate) {
  try {
    const snapshot = await db
      .collection('transactions')
      .where('cardId', '==', cardId)
      .where('date', '>=', startDate)
      .where('date', '<=', endDate)
      .orderBy('date', 'desc')
      .get();
    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
  } catch (error) {
    console.error('Error getting transactions by period:', error);
    return [];
  }
}

// Get all transactions for a user (across all cards)
export async function getAllUserTransactions(userId) {
  try {
    // First get all user's cards
    const cards = await getUserCards(userId);
    if (cards.length === 0) return [];
    
    // Get transactions for all cards
    const allTransactions = [];
    for (const card of cards) {
      const transactions = await getCardTransactions(card.id);
      allTransactions.push(...transactions.map(tx => ({ ...tx, cardId: card.id, cardNumber: card.card_number })));
    }
    
    // Sort by date
    allTransactions.sort((a, b) => new Date(b.date) - new Date(a.date));
    return allTransactions;
  } catch (error) {
    console.error('Error getting all user transactions:', error);
    return [];
  }
}

