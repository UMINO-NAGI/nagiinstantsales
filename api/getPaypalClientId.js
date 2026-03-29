module.exports = (req, res) => {
  res.status(200).json({ clientId: process.env.PAYPAL_CLIENT_ID || '' });
};