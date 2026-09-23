// Student Attendance Handler
let unlockedPrivateKey = null;
let html5QrcodeScanner = null;

// DOM Elements
const pinSection = document.getElementById('pin-section');
const scannerSection = document.getElementById('scanner-section');
const successSection = document.getElementById('success-section');
const errorSection = document.getElementById('error-section');
const statusEl = document.getElementById('status');
const scannerStatusEl = document.getElementById('scannerStatus');

// Check if device is registered on page load
window.onload = () => {
    if (!localStorage.getItem('student_id') || !localStorage.getItem('student_vault')) {
        statusEl.innerHTML = `
            <div class="alert alert-error">
                <span class="alert-icon">
                    <svg viewBox="0 0 24 24" fill="none" style="width: 20px; height: 20px;">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
                        <path d="M15 9l-6 6M9 9l6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                </span>
                <span class="alert-content">Device not registered. Please register first.</span>
            </div>
        `;
        document.getElementById('btnUnlock').disabled = true;
    } else {
        // Pre-fill student info in status
        const name = localStorage.getItem('student_name') || 'Student';
        const roll = localStorage.getItem('student_roll') || 'Unknown';
        statusEl.innerHTML = `
            <div class="alert alert-info">
                <span class="alert-icon">
                    <svg viewBox="0 0 24 24" fill="none" style="width: 20px; height: 20px;">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
                        <path d="M12 16v-4M12 8h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                </span>
                <span class="alert-content">Signed in as ${name} (${roll})</span>
            </div>
        `;
    }
};

// Unlock with PIN
document.getElementById('btnUnlock').addEventListener('click', async () => {
    const pin = document.getElementById('unlockPin').value;
    const vault = JSON.parse(localStorage.getItem('student_vault'));
    
    if (pin.length !== 4) {
        Toast.error('PIN must be exactly 4 digits');
        return;
    }
    
    try {
        unlockedPrivateKey = await cryptoUtil.decryptKeyWithPin(vault, pin);
        
        // Hide PIN section, show scanner
        pinSection.classList.add('hidden');
        scannerSection.classList.remove('hidden');
        
        // Start scanner
        startScanner();
        
    } catch (e) {
        console.error('PIN unlock error:', e);
        statusEl.innerHTML = `
            <div class="alert alert-error">
                <span class="alert-icon">
                    <svg viewBox="0 0 24 24" fill="none" style="width: 20px; height: 20px;">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
                        <path d="M15 9l-6 6M9 9l6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                </span>
                <span class="alert-content">Incorrect PIN. Please try again.</span>
            </div>
        `;
        Toast.error('Incorrect PIN');
    }
});

// Start QR Scanner
function startScanner() {
    try {
        // Clean up any existing scanner
        if (html5QrcodeScanner) {
            html5QrcodeScanner.clear();
            html5QrcodeScanner = null;
        }
        
        scannerStatusEl.textContent = 'Scanning for QR code...';
        
        html5QrcodeScanner = new Html5QrcodeScanner(
            "qr-reader",
            {
                fps: 10,
                qrbox: Math.min(window.innerWidth - 40, 400),
                supportedScanTypes: [0], // Camera only
                rememberLastUsedCamera: true,
                showTorchButtonIfSupported: true
            }
        );
        
        html5QrcodeScanner.render(
            async (decodedText) => {
                // Stop scanning on success
                if (html5QrcodeScanner) {
                    html5QrcodeScanner.clear();
                    html5QrcodeScanner = null;
                }
                
                scannerStatusEl.textContent = 'Verifying and signing request...';
                
                try {
                    await processQRCode(decodedText);
                } catch (error) {
                    console.error('QR processing error:', error);
                    showError(error.message);
                }
            },
            (error) => {
                console.warn('Scanner error:', error);
                scannerStatusEl.textContent = 'Scanner error. Please try again.';
            }
        );
        
    } catch (error) {
        console.error('Scanner initialization error:', error);
        scannerStatusEl.textContent = 'Failed to initialize scanner.';
        Toast.error('Failed to initialize camera. Please check permissions.');
    }
}

// Process scanned QR code
async function processQRCode(decodedText) {
    try {
        const qrData = JSON.parse(decodedText);
        
        // Validate QR data structure
        if (!qrData.s || !qrData.t) {
            throw new Error('Invalid QR code format. Please scan the correct QR code.');
        }
        
        const studentId = localStorage.getItem('student_id');
        const payloadStr = JSON.stringify({ 
            s: qrData.s, 
            t: qrData.t, 
            time: Date.now() 
        });
        
        // Cryptographically sign the request
        const signature = await cryptoUtil.signPayload(unlockedPrivateKey, payloadStr);
        
        // Attempt to get location
        let lat = null, lng = null;
        try {
            await new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(
                    (pos) => {
                        lat = pos.coords.latitude;
                        lng = pos.coords.longitude;
                        resolve();
                    },
                    () => {
                        // Location denied or unavailable
                        resolve();
                    },
                    { timeout: 5000, maximumAge: 0 }
                );
            });
        } catch (locError) {
            console.warn('Location error:', locError);
        }
        
        // Send attendance
        await sendAttendance(studentId, qrData, signature, payloadStr, lat, lng);
        
    } catch (e) {
        throw new Error(e.message || 'Invalid QR code format');
    }
}

// Send attendance to server
async function sendAttendance(studentId, qrData, signature, payloadStr, lat, lng) {
    try {
        const res = await fetch(`${EDGE_FUNCTIONS_URL}/submit-attendance`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                studentId, 
                sessionId: qrData.s, 
                token: qrData.t,
                signatureBase64: signature, 
                payloadStr, 
                lat, 
                lng
            })
        });
        
        const data = await res.json();
        
        if (!res.ok) {
            throw new Error(data.error || 'Failed to record attendance');
        }
        
        // Show success
        showSuccess(data);
        
    } catch (err) {
        throw new Error(err.message || 'Network error. Please try again.');
    }
}

// Show success screen
function showSuccess(data) {
    scannerSection.classList.add('hidden');
    successSection.classList.remove('hidden');
    
    // Set time
    const now = new Date();
    document.getElementById('attendanceTime').textContent = now.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
    
    // Set location status
    const locationStatus = document.getElementById('locationStatus');
    if (data.locationVerified) {
        locationStatus.textContent = 'Verified';
        locationStatus.style.color = 'var(--success)';
    } else {
        locationStatus.textContent = 'Not verified';
        locationStatus.style.color = 'var(--warning)';
    }
    
    Toast.success('Attendance recorded successfully!');
}

// Show error screen
function showError(message) {
    scannerSection.classList.add('hidden');
    errorSection.classList.remove('hidden');
    document.getElementById('errorMessage').textContent = message;
    Toast.error(message);
}

// Cancel scanner
function cancelScanner() {
    if (html5QrcodeScanner) {
        html5QrcodeScanner.clear();
        html5QrcodeScanner = null;
    }
    scannerSection.classList.add('hidden');
    pinSection.classList.remove('hidden');
    document.getElementById('unlockPin').value = '';
    document.getElementById('unlockPin').focus();
}

// Reset to scanner
function resetScanner() {
    successSection.classList.add('hidden');
    scannerSection.classList.remove('hidden');
    startScanner();
}

// Reset to PIN
function resetToPin() {
    errorSection.classList.add('hidden');
    pinSection.classList.remove('hidden');
    document.getElementById('unlockPin').value = '';
    document.getElementById('unlockPin').focus();
}

// Handle keyboard input for PIN
document.getElementById('unlockPin').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        document.getElementById('btnUnlock').click();
    }
});
