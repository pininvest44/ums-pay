const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// In-memory logs (For production, use a database like MongoDB or PostgreSQL)
let transactionLogs = [];

// Helper function to add delay (Rate limiting helper)
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// 1. Trigger Bulk STK Push
app.post('/api/push-bulk', async (req, res) => {
    const { phoneNumbers, amount, reference } = req.body;

    if (!phoneNumbers || !amount || !reference) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    // Respond immediately to the frontend to keep the UI snappy
    res.json({ message: `Processing ${phoneNumbers.length} requests in the background.` });

    // Background Queue Processing
    for (const phone of phoneNumbers) {
        const timestamp = new Date().toISOString();
        const logEntry = {
            phone,
            reference,
            amount,
            status: 'Pending...',
            timestamp,
            transactionRequestId: null
        };
        transactionLogs.unshift(logEntry); // Push to top of the log array

        try {
            // Respecting UMS Pay rate limit (10 requests/sec max -> ~100ms delay)
            await delay(110); 

            const response = await fetch('https://api.umspay.co.ke/api/v1/initiatestkpush', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    api_key: process.env.UMS_API_KEY,
                    email: process.env.UMS_EMAIL,
                    account_id: process.env.UMS_ACCOUNT_ID,
                    amount: Number(amount),
                    msisdn: phone,
                    reference: `${reference}-${Math.floor(1000 + Math.random() * 9000)}` // ensures uniqueness
                })
            });

            const data = await response.json();

            if (data.success === "200" || data.ResultCode === "200") {
                logEntry.status = 'Dispatched (Awaiting PIN)';
                logEntry.transactionRequestId = data.transaction_request_id;
            } else {
                logEntry.status = `Failed: ${data.errorMessage || 'Unknown Error'}`;
            }
        } catch (error) {
            logEntry.status = `Network Error: ${error.message}`;
        }
    }
});

// 2. Webhook Listener (UMS Pay calls this automatically when user enters/cancels PIN)
app.post('/api/webhook', (express.json()), (req, res) => {
    const webhookData = req.body;
    console.log('Incoming Webhook Payload:', webhookData);

    // Extract identifier provided by UMS Pay status callback
    const reqId = webhookData.TransactionID || webhookData.transaction_request_id;
    const status = webhookData.TransactionStatus || (webhookData.ResultCode == 0 ? 'Completed' : 'Failed');

    // Find entry in our local log array and update its real-time status
    const targetLog = transactionLogs.find(log => log.transactionRequestId === reqId);
    if (targetLog) {
        targetLog.status = status === 'Completed' ? '✅ Completed Successfully' : `❌ ${webhookData.ResultDesc || 'Failed'}`;
    }

    // Acknowledge receipt to UMS Pay
    res.status(200).send('Webhook Received');
});

// 3. Fetch logs for UI polling
app.get('/api/logs', (req, res) => {
    res.json(transactionLogs);
});

app.listen(PORT, () => {
    console.log(`Server running smoothly on port ${PORT}`);
});
