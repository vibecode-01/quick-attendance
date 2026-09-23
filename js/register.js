document.getElementById('regForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('studentName').value.trim();
    const rollNumber = document.getElementById('rollNumber').value.trim();
    const pin = document.getElementById('pin').value;
    const btn = document.getElementById('btnSubmit');
    const status = document.getElementById('status');

    if (pin.length !== 4) return alert("PIN must be exactly 4 digits.");
    
    btn.disabled = true;
    btn.innerText = "Registering Device...";

    try {
        const keys = await cryptoUtil.generateDeviceKeys();
        const encryptedVault = await cryptoUtil.encryptKeyWithPin(keys.privateKeyBase64, pin);

        const res = await fetch(`${EDGE_FUNCTIONS_URL}/register-student`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, rollNumber, publicKey: keys.publicKey })
        });
        
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Registration failed");

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
