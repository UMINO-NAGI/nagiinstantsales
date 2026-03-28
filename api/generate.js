// api/generate.js
import admin from 'firebase-admin';

if (!admin.apps.length) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}
const db = admin.firestore();

export default async function handler(req, res) {
    res.setHeader('Content-Type', 'application/json');

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { product, description, audience, style, userUID, cost } = req.body;
    if (!product || !description || !audience || !userUID || !cost) {
        return res.status(400).json({ error: 'Campos obrigatórios ausentes' });
    }

    // Verificar créditos
    const userRef = db.collection('nagi_users').doc(userUID);
    const userSnap = await userRef.get();
    if (!userSnap.exists) {
        return res.status(404).json({ error: 'Usuário não encontrado' });
    }
    const credits = userSnap.data().credits || 0;
    if (credits < cost) {
        return res.status(402).json({ error: `Créditos insuficientes. Necessário ${cost}, você tem ${credits}.` });
    }

    const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
    if (!DEEPSEEK_API_KEY) {
        return res.status(500).json({ error: 'Chave da API não configurada' });
    }

    // Prompt de sistema para a IA
    const systemPrompt = `Você é um especialista em criação de landing pages de alta conversão. Gere uma página HTML/CSS completa, responsiva, com base nas informações fornecidas. Inclua: cabeçalho, seção hero, benefícios, depoimentos, FAQ, call-to-action, rodapé. Use o estilo "${style}" (moderno, elegante, etc.). Retorne APENAS o código HTML, sem explicações.`;

    const userPrompt = `Produto: ${product}\nDescrição: ${description}\nPúblico-alvo: ${audience}`;

    try {
        const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
            },
            body: JSON.stringify({
                model: 'deepseek-chat',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                temperature: 0.7,
                max_tokens: 4000
            })
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error?.message || 'Erro na API DeepSeek');
        }

        let html = data.choices[0].message.content.trim();
        html = html.replace(/```html|```/g, '').trim();

        // Salvar página no Firestore
        const pagesRef = db.collection('nagi_pages');
        const pageData = {
            userId: userUID,
            name: product,
            description: description,
            audience: audience,
            style: style,
            html: html,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        };
        await pagesRef.add(pageData);

        // Subtrair créditos
        await userRef.update({
            credits: admin.firestore.FieldValue.increment(-cost)
        });

        res.status(200).json({ success: true, html });
    } catch (error) {
        console.error('Erro na geração:', error);
        res.status(500).json({ success: false, error: error.message });
    }
}