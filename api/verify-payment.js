// api/verify-payment.js
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

    const { orderID, planID, userUID, credits } = req.body;
    if (!orderID || !planID || !userUID || !credits) {
        return res.status(400).json({ error: 'Campos obrigatórios ausentes' });
    }

    const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
    const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET;
    if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
        return res.status(500).json({ error: 'Credenciais PayPal não configuradas' });
    }

    // Obter token PayPal
    const auth = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString('base64');
    let accessToken;
    try {
        const tokenResponse = await fetch('https://api-m.paypal.com/v1/oauth2/token', {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: 'grant_type=client_credentials'
        });
        const tokenData = await tokenResponse.json();
        if (!tokenResponse.ok) {
            throw new Error(tokenData.error_description || 'Falha ao obter token PayPal');
        }
        accessToken = tokenData.access_token;
    } catch (error) {
        console.error('Erro token PayPal:', error);
        return res.status(500).json({ error: 'Autenticação PayPal falhou' });
    }

    // Capturar ordem
    try {
        const captureResponse = await fetch(`https://api-m.paypal.com/v2/checkout/orders/${orderID}/capture`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        });
        const captureData = await captureResponse.json();
        if (!captureResponse.ok) {
            throw new Error(captureData.message || 'Falha na captura');
        }

        const capturedAmount = captureData.purchase_units[0].payments.captures[0].amount.value;
        if (capturedAmount !== planID) {
            throw new Error(`Valor incorreto: esperado ${planID}, recebido ${capturedAmount}`);
        }

        // Adicionar créditos
        const userRef = db.collection('nagi_users').doc(userUID);
        await userRef.update({
            credits: admin.firestore.FieldValue.increment(parseInt(credits))
        });

        // Registrar pagamento (opcional)
        const paymentsRef = db.collection('nagi_payments');
        await paymentsRef.add({
            userId: userUID,
            amount: planID,
            credits: parseInt(credits),
            orderId: orderID,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        res.status(200).json({ success: true });
    } catch (error) {
        console.error('Erro na verificação do pagamento:', error);
        res.status(500).json({ success: false, error: error.message });
    }
}