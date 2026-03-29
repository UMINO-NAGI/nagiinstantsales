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
  if (req.method !== 'POST') return res.status(405).end();
  const { userId, creditsToAdd } = req.body;
  if (!userId || !creditsToAdd) return res.status(400).json({ error: 'userId/credits missing' });
  const userRef = db.collection('users').doc(userId);
  await userRef.update({
    credits: admin.firestore.FieldValue.increment(creditsToAdd),
  });
  res.status(200).json({ success: true });
};