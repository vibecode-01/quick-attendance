// Student Registration Handler

document.getElementById('regForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const name = document.getElementById('studentName').value.trim();
    const rollNumber = document.getElementById('rollNumber').value.trim();
    const pin = document.getElementById('pin').value;
    const confirmPin = document.getElementById('confirmPin').value;
    const btn = document.getElementById('btnSubmit');
    const status = document.getElementById('status');
    
    // Clear previous errors
    status.innerHTML = '';
    
    // Validation
    if (!name) {
        Toast.error('Please enter your full name');
        return;
    }
    
    if (!rollNumber) {
        Toast.error('Please enter your roll number');
        return;
    }
    
    if (pin.length !== 4 || !/^\d{4}$/.test(pin)) {
        Toast.error('PIN must be exactly 4 digits');
        return;
    }
    
    if (pin !== confirmPin) {
        Toast.error('PINs do not match');
        return;
    }
    
    // Show loading state
    btn.disabled = true;
    btn.classList.add('btn-loading');
    btn.innerHTML = 'Registering Device...';
    
    try {
        // Generate cryptographic keys
        const keys = await cryptoUtil.generateDeviceKeys();
        
        // Encrypt private key with PIN
        const encryptedVault = await cryptoUtil.encryptKeyWithPin(keys.privateKeyBase64, pin);
        
        // Register with backend
        const res = await fetch(`${EDGE_FUNCTIONS_URL}/register-student`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                name, 
                rollNumber, 
                publicKey: keys.publicKey 
            })
        });
        
        const data = await res.json();
        
        if (!res.ok) {
            throw new Error(data.error || 'Registration failed');
        }
        
        // Save to localStorage
        localStorage.setItem('student_vault', JSON.stringify(encryptedVault));
        localStorage.setItem('student_id', data.studentId);
        localStorage.setItem('student_name', name);
        localStorage.setItem('student_roll', rollNumber);
        
        // Hide form, show success
        document.getElementById('registration-form-section').classList.add('hidden');
        document.getElementById('success-section').classList.remove('hidden');
        
        // Set success info
        document.getElementById('successName').textContent = name;
        document.getElementById('successRoll').textContent = rollNumber;
        
        Toast.success('Device registered successfully!');
        
    } catch (err) {
        console.error('Registration error:', err);
        status.innerHTML = `<div class="alert alert-error">${err.message}</div>`;
        Toast.error(err.message);
    } finally {
        btn.disabled = false;
        btn.classList.remove('btn-loading');
        btn.innerHTML = 'Register Device';
    }
});
