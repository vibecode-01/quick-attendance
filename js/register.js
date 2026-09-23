document.getElementById('regForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = document.getElementById('regCode').value.trim();
    const pin = document.getElementById('pin').value;
    const btn = document.getElementById('btnSubmit');
    const status = document.getElementById('status');

    if (pin.length !== 4) return alert("PIN must be exactly 4 digits.");
    
    btn.disabled = true;
    btn.innerText = "Generating Security Keys...";

    try {
        // 1. Generate WebCrypto Keys
        const keys = await cryptoUtil.generateDeviceKeys();
        
        // 2. Encrypt Private Key with PIN
        const encryptedVault = await cryptoUtil.encryptKeyWithPin(keys.privateKeyBase64, pin);

        // 3. Send Public Key to Edge Function
        const res = await fetch(`${EDGE_FUNCTIONS_URL}/register-student`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ registrationCode: code, publicKey: keys.publicKey })
        });
        
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Registration failed");

        // 4. Save to LocalStorage
        localStorage.setItem('student_vault', JSON.stringify(encryptedVault));
        localStorage.setItem('student_id', data.studentId);

        status.innerHTML = `<div class="alert alert-success">Device Bound Successfully! You can now mark attendance.</div>`;
        document.getElementById('regForm').style.display = 'none';
    } catch (err) {
        status.innerHTML = `<div class="alert alert-error">${err.message}</div>`;
        btn.disabled = false;
        btn.innerText = "Register Device";
    }
});
