const admin = require('firebase-admin');

// Inicializa apenas se não estiver inicializado
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
  if (req.method !== 'POST') return res.status(405).end();
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
};