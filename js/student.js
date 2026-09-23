let unlockedPrivateKey = null;

window.onload = () => {
    if (!localStorage.getItem('student_id') || !localStorage.getItem('student_vault')) {
        document.getElementById('status').innerHTML = `<div class="alert alert-error">Device not registered. Please register first.</div>`;
        document.getElementById('pin-section').style.display = 'none';
    }
};

document.getElementById('btnUnlock').addEventListener('click', async () => {
    const pin = document.getElementById('unlockPin').value;
    const vault = JSON.parse(localStorage.getItem('student_vault'));
    const status = document.getElementById('status');
    
    try {
        unlockedPrivateKey = await cryptoUtil.decryptKeyWithPin(vault, pin);
        document.getElementById('pin-section').style.display = 'none';
        document.getElementById('btnBack').style.display = 'none';
        document.getElementById('scanner-section').style.display = 'block';
        startScanner();
    } catch (e) {
        status.innerHTML = `<div class="alert alert-error">Incorrect PIN.</div>`;
    }
});

function startScanner() {
    // supportedScanTypes: [0] forces the scanner to use the Camera ONLY (removes image upload)
    const html5QrcodeScanner = new Html5QrcodeScanner(
        "qr-reader", 
        { 
            fps: 10, 
            qrbox: 250,
            supportedScanTypes: [0] 
        }
    );
    const status = document.getElementById('status');

    html5QrcodeScanner.render(async (decodedText) => {
        html5QrcodeScanner.clear(); // Stop scanning on success
        status.innerHTML = `<div class="alert alert-info">Verifying and signing request...</div>`;
        
        try {
            const qrData = JSON.parse(decodedText);
            const studentId = localStorage.getItem('student_id');
            const payloadStr = JSON.stringify({ s: qrData.s, t: qrData.t, time: Date.now() });
            
            // Cryptographically sign the request
            const signature = await cryptoUtil.signPayload(unlockedPrivateKey, payloadStr);

            // Attempt Location (fail gracefully if denied)
            navigator.geolocation.getCurrentPosition(
                (pos) => sendAttendance(studentId, qrData, signature, payloadStr, pos.coords.latitude, pos.coords.longitude),
                () => sendAttendance(studentId, qrData, signature, payloadStr, null, null),
                { timeout: 5000 }
            );
        } catch (e) {
            status.innerHTML = `<div class="alert alert-error">Invalid QR Code format.</div>`;
        }
    }, (error) => {});
}

async function sendAttendance(studentId, qrData, signature, payloadStr, lat, lng) {
    const status = document.getElementById('status');
    try {
        const res = await fetch(`${EDGE_FUNCTIONS_URL}/submit-attendance`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                studentId, sessionId: qrData.s, token: qrData.t,
                signatureBase64: signature, payloadStr, lat, lng
            })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed");
        
        status.innerHTML = `<div class="alert alert-success">✅ Attendance Recorded! ${data.locationVerified ? '(Location Verified)' : ''}</div>`;
    } catch (err) {
        status.innerHTML = `<div class="alert alert-error">${err.message}</div>`;
        setTimeout(() => location.reload(), 3000); // Reload to let them try again
    }
}
