let currentSession = null;
let qrInterval = null;
let realtimeSubscription = null;
let presentStudents = [];

// Handle Login
document.getElementById('btnLogin').addEventListener('click', async () => {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return alert(error.message);
    document.getElementById('login-section').style.display = 'none';
    document.getElementById('dashboard-section').style.display = 'block';
});

// Check if already logged in
supabase.auth.getSession().then(({ data: { session } }) => {
    if (session) {
        document.getElementById('login-section').style.display = 'none';
        document.getElementById('dashboard-section').style.display = 'block';
    }
});

// Start Session
document.getElementById('btnStart').addEventListener('click', async () => {
    // Generate secure secret for TOTP
    const secret = cryptoUtil.bufToBase64(crypto.getRandomValues(new Uint8Array(16)));
    
    // Change button text so you know it was clicked
    document.getElementById('btnStart').innerText = "Starting session...";
    
    // Get Admin Location with a strict 5-second timeout
    navigator.geolocation.getCurrentPosition(
        async (pos) => {
            createSessionRecord(secret, pos.coords.latitude, pos.coords.longitude);
        }, 
        () => {
            // Fallback: If location is denied or times out, start session without location
            createSessionRecord(secret, null, null);
        },
        { timeout: 5000 } // <-- THIS PREVENTS THE HANG
    );
});
    
    // Get Admin Location (Optional)
    navigator.geolocation.getCurrentPosition(async (pos) => {
        createSessionRecord(secret, pos.coords.latitude, pos.coords.longitude);
    }, () => {
        createSessionRecord(secret, null, null);
    });
});

async function createSessionRecord(secret, lat, lng) {
    const { data, error } = await supabase.from('sessions').insert({ secret, admin_lat: lat, admin_lng: lng }).select().single();
    if (error) return alert("Failed to start session.");
    
    currentSession = data;
    document.getElementById('btnStart').style.display = 'none';
    document.getElementById('btnStop').style.display = 'block';
    document.getElementById('qr-container').style.display = 'block';
    presentStudents = [];
    updateListUI();

    // Start rotating QR
    updateQR();
    qrInterval = setInterval(updateQR, 5000);

    // Listen for live attendance via Supabase Realtime
    realtimeSubscription = supabase.channel('realtime-attendance')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'attendance_records', filter: `session_id=eq.${currentSession.id}` }, 
        async (payload) => {
            // Fetch student details
            const { data: student } = await supabase.from('students').select('roll_number, name').eq('id', payload.new.student_id).single();
            if (student) {
                presentStudents.push({ ...student, locationVerified: payload.new.location_verified });
                updateListUI();
            }
        }).subscribe();
}

async function updateQR() {
    if (!currentSession) return;
    const token = await cryptoUtil.generateTOTP(currentSession.secret);
    const payload = JSON.stringify({ s: currentSession.id, t: token });
    QRCode.toCanvas(document.getElementById('qr-canvas'), payload, { width: 300 });
}

// Stop Session
document.getElementById('btnStop').addEventListener('click', async () => {
    clearInterval(qrInterval);
    if (realtimeSubscription) supabase.removeChannel(realtimeSubscription);
    await supabase.from('sessions').update({ is_active: false }).eq('id', currentSession.id);
    
    currentSession = null;
    document.getElementById('btnStart').style.display = 'block';
    document.getElementById('btnStop').style.display = 'none';
    document.getElementById('qr-container').style.display = 'none';
});

// Copy List
document.getElementById('btnCopy').addEventListener('click', () => {
    const dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
    let text = `*Attendance - ${dateStr}*\n\n`;
    
    presentStudents.sort((a,b) => a.roll_number.localeCompare(b.roll_number))
                   .forEach(s => text += `${s.roll_number} - ${s.name} ${s.locationVerified ? '' : '(Location Unverified)'}\n`);
    
    navigator.clipboard.writeText(text);
    alert('List copied to clipboard!');
});

function updateListUI() {
    document.getElementById('count').innerText = presentStudents.length;
    const list = document.getElementById('attendanceList');
    list.innerHTML = presentStudents.sort((a,b) => a.roll_number.localeCompare(b.roll_number))
        .map(s => `<div class="list-item"><strong>${s.roll_number}</strong> <span>${s.name}</span></div>`).join('');
}
