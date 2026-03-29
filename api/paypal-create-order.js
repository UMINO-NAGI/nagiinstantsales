module.exports = async (req, res) => {
  try {
    const { amount } = req.body;
    const clientId = process.env.PAYPAL_CLIENT_ID;
    const secret = process.env.PAYPAL_CLIENT_SECRET;
    if (!clientId || !secret) return res.status(500).json({ error: 'PayPal credentials missing' });
    const auth = Buffer.from(`${clientId}:${secret}`).toString('base64');
    const response = await fetch('https://api-m.sandbox.paypal.com/v2/checkout/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [{ amount: { currency_code: 'BRL', value: amount } }],
      }),
    });
    const data = await response.json();
    if (!data.id) throw new Error('PayPal order creation failed');
    res.status(200).json({ orderID: data.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};