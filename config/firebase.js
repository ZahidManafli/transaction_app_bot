import admin from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config();

// Initialize Firebase Admin SDK
let db = null;
let adminInitialized = false;

try {
  // Check if Firebase app is already initialized
  const apps = admin.apps;
  if (apps.length > 0) {
    console.log('Firebase app already initialized, using existing instance');
    db = admin.firestore();
    adminInitialized = true;
  } else {
    // Try to initialize with service account if available
    const hasPrivateKey = process.env.FIREBASE_PRIVATE_KEY && 
                         !process.env.FIREBASE_PRIVATE_KEY.includes('YOUR_PRIVATE_KEY_HERE') &&
                         process.env.FIREBASE_PRIVATE_KEY.length > 50;
    
    const hasClientEmail = process.env.FIREBASE_CLIENT_EMAIL && 
                          !process.env.FIREBASE_CLIENT_EMAIL.includes('xxxxx');
    
    const hasProjectId = process.env.FIREBASE_PROJECT_ID;

    console.log('Firebase initialization check:');
    console.log('  - Has private key:', !!hasPrivateKey);
    console.log('  - Has client email:', !!hasClientEmail);
    console.log('  - Has project ID:', !!hasProjectId);

    if (hasPrivateKey && hasClientEmail && hasProjectId) {
      console.log('Initializing Firebase Admin SDK with service account credentials...');
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        }),
      });
      adminInitialized = true;
      db = admin.firestore();
      console.log('✅ Firebase Admin SDK initialized successfully with credentials');
    } else {
      console.warn('⚠️  Firebase service account credentials not found!');
      console.warn('   Please set FIREBASE_PRIVATE_KEY, FIREBASE_CLIENT_EMAIL, and FIREBASE_PROJECT_ID in .env');
      console.warn('   Firestore queries will not work without credentials.');
      console.warn('   Get credentials from: Firebase Console > Project Settings > Service Accounts');
      
      // Try to initialize without credentials (won't work for queries, but won't crash)
      try {
        admin.initializeApp({
          projectId: process.env.FIREBASE_PROJECT_ID || 'card-transaction-1dbff',
        });
        db = admin.firestore();
        console.log('⚠️  Firebase initialized without credentials (limited functionality)');
      } catch (initError) {
        console.error('❌ Failed to initialize Firebase:', initError.message);
        db = null;
      }
    }
  }
  
  if (db) {
    console.log('Firebase project ID:', process.env.FIREBASE_PROJECT_ID || 'card-transaction-1dbff');
  }
} catch (error) {
  console.error('❌ Firebase initialization error:', error.message);
  console.error('Full error:', error);
  db = null;
  adminInitialized = false;
}

export { admin, db, adminInitialized };

