document.getElementById('pushForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const rawPhones = document.getElementById('phoneNumbers').value;
    const amount = document.getElementById('amount').value;
    const reference = document.getElementById('reference').value;

    // Sanitize and split phone numbers array
    const phoneNumbers = rawPhones.split('\n')
        .map(num => num.trim())
        .filter(num => num.length >= 10);

    if(phoneNumbers.length === 0) {
        alert('Please enter valid phone numbers!');
        return;
    }

    try {
        const response = await fetch('/api/push-bulk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phoneNumbers, amount, reference })
        });
        const data = await response.json();
        alert(data.message || 'Bulk processing initiated!');
    } catch (error) {
        alert('Error dispatching bulk requests.');
    }
});

// Poll logs every 2 seconds for clean dashboard updates
async function fetchLogs() {
    try {
        const response = await fetch('/api/logs');
        const logs = await response.json();
        const tbody = document.getElementById('logTableBody');
        
        if(logs.length === 0) return;

        tbody.innerHTML = logs.map(log => `
            <tr>
                <td>${new Date(log.timestamp).toLocaleTimeString()}</td>
                <td>${log.phone}</td>
                <td>KES ${log.amount}</td>
                <td><strong>${log.status}</strong></td>
            </tr>
        `).join('');
    } catch (err) {
        console.error('Failed fetching updates.', err);
    }
}

setInterval(fetchLogs, 2000);
