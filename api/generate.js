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
    const { prompt, userId } = req.body;
    if (!prompt || !userId) return res.status(400).json({ error: 'Dados incompletos' });

    // Chamar DeepSeek para obter custo e HTML
    const deepseekKey = process.env.DEEPSEEK_API_KEY;
    if (!deepseekKey) return res.status(500).json({ error: 'DeepSeek key missing' });

    const aiResponse = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${deepseekKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: 'Você é um expert em landing pages. Retorne APENAS JSON: {"cost": 1-10, "html": "código completo"}' },
          { role: 'user', content: `Produto: ${prompt}` }
        ],
        temperature: 0.7,
      }),
    });
    const aiData = await aiResponse.json();
    let cost = 3, generatedHTML = '';
    try {
      const parsed = JSON.parse(aiData.choices[0].message.content);
      cost = Math.min(10, Math.max(1, parsed.cost));
      generatedHTML = parsed.html;
    } catch (e) {
      return res.status(500).json({ error: 'Resposta da IA inválida' });
    }

    // Transação Firestore para descontar créditos atomicamente
    const userRef = db.collection('users').doc(userId);
    const result = await db.runTransaction(async (t) => {
      const doc = await t.get(userRef);
      if (!doc.exists) throw new Error('Usuário não encontrado');
      const currentCredits = doc.data().credits || 0;
      if (currentCredits < cost) throw new Error(`Créditos insuficientes. Necessário ${cost}, você tem ${currentCredits}.`);
      const newCredits = currentCredits - cost;
      t.update(userRef, {
        credits: newCredits,
        history: admin.firestore.FieldValue.arrayUnion({
          prompt,
          generatedHTML,
          cost,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
        })
      });
      return { newCredits };
    });
    res.status(200).json({ success: true, html: generatedHTML, cost, remainingCredits: result.newCredits });
  } catch (err) {
    console.error('generate error:', err);
    res.status(500).json({ error: err.message });
  }
};