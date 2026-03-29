const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
  });
}
const db = admin.firestore();

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const { uid, email, displayName } = req.body;
    if (!uid) return res.status(400).json({ error: 'uid missing' });
    const userRef = db.collection('users').doc(uid);
    const doc = await userRef.get();
    if (!doc.exists) {
      await userRef.set({
        email: email || '',
        displayName: displayName || '',
        credits: 0,
        history: [],
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
    res.status(200).json({ success: true });
  } catch (err) {
    console.error('ensureUser error:', err);
    res.status(500).json({ error: err.message });
  }
};