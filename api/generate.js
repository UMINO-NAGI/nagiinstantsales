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
  const { prompt, userId } = req.body;
  if (!prompt || !userId) return res.status(400).json({ error: 'Dados incompletos' });

  const userRef = db.collection('users').doc(userId);
  const userSnap = await userRef.get();
  if (!userSnap.exists) return res.status(404).json({ error: 'Usuário não encontrado' });
  let credits = userSnap.data().credits || 0;

  const deepseekKey = process.env.DEEPSEEK_API_KEY;
  if (!deepseekKey) return res.status(500).json({ error: 'Chave DeepSeek não configurada' });

  const systemPrompt = `Você é um expert em criar páginas de vendas de alta conversão.
  Com base na descrição do produto, gere HTML/CSS moderno, responsivo, com botão de compra, depoimentos fictícios, layout atrativo.
  Responda APENAS um JSON válido: {"cost": número inteiro (1 a 10 baseado na complexidade), "html": "código completo da página"}.`;

  const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${deepseekKey}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Produto: ${prompt}` },
      ],
      temperature: 0.7,
    }),
  });

  const data = await response.json();
  let cost = 3;
  let generatedHTML = '';
  try {
    const aiJson = JSON.parse(data.choices[0].message.content);
    cost = Math.min(10, Math.max(1, aiJson.cost));
    generatedHTML = aiJson.html;
  } catch (e) {
    return res.status(500).json({ error: 'Resposta da IA inválida' });
  }

  if (credits < cost) {
    return res.status(400).json({ error: `Créditos insuficientes. Necessário ${cost}, você tem ${credits}.` });
  }

  const newCredits = credits - cost;
  const historyEntry = {
    prompt,
    generatedHTML,
    cost,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
  };
  await userRef.update({
    credits: newCredits,
    history: admin.firestore.FieldValue.arrayUnion(historyEntry),
  });

  res.status(200).json({ success: true, html: generatedHTML, cost, remainingCredits: newCredits });
};