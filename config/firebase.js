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

    // Check if full service account JSON is provided (easier for Railway)
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    
    if (serviceAccountJson) {
      try {
        console.log('Using FIREBASE_SERVICE_ACCOUNT_JSON...');
        const serviceAccount = JSON.parse(serviceAccountJson);
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
        });
        adminInitialized = true;
        db = admin.firestore();
        console.log('✅ Firebase Admin SDK initialized successfully with service account JSON');
      } catch (jsonError) {
        console.error('❌ Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON:', jsonError.message);
        throw jsonError;
      }
    } else if (hasPrivateKey && hasClientEmail && hasProjectId) {
      console.log('Initializing Firebase Admin SDK with service account credentials...');
      
      // Parse private key - handle different formats
      let privateKey = process.env.FIREBASE_PRIVATE_KEY;
      
      // Remove surrounding quotes if present
      if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
        privateKey = privateKey.slice(1, -1);
      }
      if (privateKey.startsWith("'") && privateKey.endsWith("'")) {
        privateKey = privateKey.slice(1, -1);
      }
      
      // Replace escaped newlines with actual newlines
      // Handle both \\n (double escaped) and \n (single escaped)
      privateKey = privateKey.replace(/\\n/g, '\n');
      
      // Also handle if Railway stored it with actual newlines
      // If it doesn't have BEGIN/END markers on same line, it might have real newlines
      if (!privateKey.includes('BEGIN PRIVATE KEY') && !privateKey.includes('BEGIN PRIVATE KEY')) {
        // Try to find if it's base64 encoded
        try {
          privateKey = Buffer.from(privateKey, 'base64').toString('utf-8');
        } catch (e) {
          // Not base64, continue
        }
      }
      
      // Ensure the key starts and ends with proper markers
      if (!privateKey.includes('BEGIN PRIVATE KEY')) {
        console.error('❌ Private key format invalid - missing BEGIN PRIVATE KEY');
        console.error('Key preview:', privateKey.substring(0, 100));
        throw new Error('Invalid private key format - see RAILWAY_SETUP.md for help');
      }
      
      try {
        admin.initializeApp({
          credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: privateKey,
          }),
        });
        adminInitialized = true;
        db = admin.firestore();
        console.log('✅ Firebase Admin SDK initialized successfully with credentials');
      } catch (certError) {
        console.error('❌ Failed to initialize Firebase with credentials:', certError.message);
        console.error('Private key length:', privateKey.length);
        console.error('Private key preview (first 50 chars):', privateKey.substring(0, 50));
        console.error('Private key preview (last 50 chars):', privateKey.substring(Math.max(0, privateKey.length - 50)));
        console.error('\n💡 Tip: Try using FIREBASE_SERVICE_ACCOUNT_JSON instead (see RAILWAY_SETUP.md)');
        throw certError;
      }
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

