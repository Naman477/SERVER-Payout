import express from 'express';
import cors from 'cors';
import admin from 'firebase-admin';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// --- Firebase Setup ---
// On Render, we can't easily upload a file, so we'll use an Environment Variable
// OR we can check if the file exists (if user committed it).
let serviceAccount;

try {
    if (process.env.FIREBASE_SERVICE_KEY) {
        // If key is in ENV var (Best for Render)
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_KEY);
    } else if (fs.existsSync('./ServiceAccountKey.json')) {
        // If file exists (e.g. Local testing)
        serviceAccount = JSON.parse(fs.readFileSync('./ServiceAccountKey.json', 'utf8'));
    } else {
        throw new Error('No Service Account Key found! Set FIREBASE_SERVICE_KEY env var.');
    }

    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
    console.log('[Cloud Server] Firebase Initialized');
} catch (error) {
    console.error('[Critical Error] Firebase failed to load:', error.message);
    process.exit(1);
}

const db = admin.firestore();

// --- Dynamic Routes ---
const ALLOWED_COLLECTIONS = [
    'areas', 'attendance', 'customers', 'expenses',
    'inventory', 'inventory_logs', 'leads', 'settings',
    'system_logs', 'users', 'payouts'
];

// POST /:collection - Write to Cloud Firestore
app.post('/:collection', async (req, res) => {
    const { collection } = req.params;
    if (!ALLOWED_COLLECTIONS.includes(collection)) {
        return res.status(404).json({ error: 'Collection not found' });
    }

    try {
        const data = req.body;
        // Add timestamp
        data.createdAt = admin.firestore.FieldValue.serverTimestamp();

        const docRef = await db.collection(collection).add(data);
        res.status(201).json({
            id: docRef.id,
            message: `Saved to ${collection} on Cloud`,
            data: data
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /:collection - Read from Cloud Firestore
app.get('/:collection', async (req, res) => {
    const { collection } = req.params;
    if (!ALLOWED_COLLECTIONS.includes(collection)) {
        return res.status(404).json({ error: 'Collection not found' });
    }

    try {
        const snapshot = await db.collection(collection).orderBy('createdAt', 'desc').limit(100).get();
        const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.json(items);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/', (req, res) => res.send('Payout Code Server is Running!'));

app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
