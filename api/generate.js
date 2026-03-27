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

    const { product, audience, offer, color, userUID, cost } = req.body;
    if (!product || !audience || !offer || !userUID || !cost) {
        return res.status(400).json({ error: 'Campos obrigatórios ausentes' });
    }

    const userRef = db.collection('instantSalesUsers').doc(userUID);
    const userSnap = await userRef.get();
    if (!userSnap.exists) {
        return res.status(404).json({ error: 'Usuário não encontrado' });
    }
    const credits = userSnap.data().credits || 0;
    if (credits < cost) {
        return res.status(402).json({ error: `Créditos insuficientes. Necessário ${cost}, você tem ${credits}.` });
    }

    const systemPrompt = `You are a professional landing page designer. Generate a complete, responsive HTML/CSS landing page based on the following inputs. Return ONLY the HTML code (including <style> inside <head> or inline). Do not include any explanations, markdown, or extra text. Use modern design, glassmorphism if appropriate, and make it visually appealing. The page should have a clear header, hero section, benefits, call-to-action, and footer. Adapt to the product details provided. Ensure the page is ready to host.`;

    const userPrompt = `Product: ${product}\nTarget Audience: ${audience}\nMain Offer: ${offer}\nPreferred color (optional): ${color || 'blue'}`;

    const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
    if (!DEEPSEEK_API_KEY) {
        return res.status(500).json({ error: 'Chave da API não configurada' });
    }

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