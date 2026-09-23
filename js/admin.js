// Admin Dashboard - Main JavaScript
// Handles: Login, Session Management, QR Code Generation, Realtime Attendance

let currentSession = null;
let qrInterval = null;
let realtimeSubscription = null;
let presentStudents = [];
let isLoading = false;

// DOM Elements
const loginSection = document.getElementById('login-section');
const dashboardSection = document.getElementById('dashboard-section');
const btnLogin = document.getElementById('btnLogin');
const btnStart = document.getElementById('btnStart');
const btnStop = document.getElementById('btnStop');
const btnCopy = document.getElementById('btnCopy');
const qrContainer = document.getElementById('qr-container');
const qrCanvas = document.getElementById('qr-canvas');
const countEl = document.getElementById('count');
const attendanceListEl = document.getElementById('attendanceList');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');

// ============================================
// Utility Functions
// ============================================

function setButtonLoading(button, loading = true) {
    if (loading) {
        button.disabled = true;
        button.classList.add('btn-loading');
        button.innerHTML = button.dataset.originalText || button.innerHTML;
    } else {
        button.disabled = false;
        button.classList.remove('btn-loading');
    }
}

function saveButtonText(button) {
    if (!button.dataset.originalText) {
        button.dataset.originalText = button.innerHTML;
    }
}

function showError(message) {
    Toast.error(message);
}

function showSuccess(message) {
    Toast.success(message);
}

// ============================================
// QR Code Management
// ============================================

async function generateAndRenderQR() {
    if (!currentSession || !qrContainer) return;

    try {
        const token = await cryptoUtil.generateTOTP(currentSession.secret, 10000);
        const payload = JSON.stringify({ s: currentSession.id, t: token });
        
        // Use QRious for QR code generation
        new QRious({
            element: qrCanvas,
            value: payload,
            size: 300,
            background: '#ffffff',
            foreground: '#1e293b'
        });
    } catch (error) {
        console.error('QR generation error:', error);
        showError('Failed to generate QR code');
    }
}

function startQRRotation() {
    // Clear any existing interval
    if (qrInterval) {
        clearInterval(qrInterval);
        qrInterval = null;
    }
    
    // Generate immediately
    generateAndRenderQR();
    
    // Then every 10 seconds (matching the TOTP window)
    qrInterval = setInterval(generateAndRenderQR, 10000);
}

function stopQRRotation() {
    if (qrInterval) {
        clearInterval(qrInterval);
        qrInterval = null;
    }
}

// ============================================
// Session Management
// ============================================

async function createSessionRecord(secret, lat, lng) {
    try {
        const { data, error } = await supabase
            .from('sessions')
            .insert({ 
                secret, 
                admin_lat: lat, 
                admin_lng: lng,
                is_active: true 
            })
            .select()
            .single();
        
        if (error) throw error;
        
        currentSession = data;
        
        // Update UI
        btnStart.style.display = 'none';
        btnStop.style.display = 'block';
        qrContainer.style.display = 'block';
        
        // Start QR rotation
        startQRRotation();
        
        // Initialize attendance tracking
        presentStudents = [];
        updateListUI();
        
        // Setup realtime subscription
        setupRealtimeSubscription();
        
        showSuccess('Live session started! QR code is active.');
        
    } catch (error) {
        console.error('Session creation error:', error);
        showError(error.message || 'Failed to start session');
        btnStart.innerText = 'Start Live Session';
        setButtonLoading(btnStart, false);
    }
}

function setupRealtimeSubscription() {
    // Clean up any existing subscription
    cleanupRealtimeSubscription();
    
    if (!currentSession) return;
    
    try {
        realtimeSubscription = supabase
            .channel('realtime-attendance-' + currentSession.id)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'attendance_records',
                filter: `session_id=eq.${currentSession.id}`
            }, async (payload) => {
                handleNewAttendance(payload.new);
            })
            .subscribe((status, err) => {
                if (err) {
                    console.error('Realtime subscription error:', err);
                    showError('Failed to setup realtime updates');
                }
            });
    } catch (error) {
        console.error('Realtime setup error:', error);
        showError('Failed to setup realtime updates');
    }
}

function cleanupRealtimeSubscription() {
    if (realtimeSubscription) {
        try {
            supabase.removeChannel(realtimeSubscription);
        } catch (error) {
            console.error('Error removing channel:', error);
        }
        realtimeSubscription = null;
    }
}

async function handleNewAttendance(record) {
    try {
        // Check if student already exists in our list
        const exists = presentStudents.some(s => s.id === record.student_id);
        if (exists) return;
        
        // Fetch student details
        const { data: student, error } = await supabase
            .from('students')
            .select('id, roll_number, name')
            .eq('id', record.student_id)
            .single();
        
        if (error) {
            console.error('Error fetching student:', error);
            return;
        }
        
        if (student) {
            presentStudents.push({
                ...student,
                locationVerified: record.location_verified,
                attendanceTime: record.created_at
            });
            updateListUI();
            showSuccess(`${student.name} (${student.roll_number}) marked attendance`);
        }
    } catch (error) {
        console.error('Error handling attendance:', error);
    }
}

async function stopSession() {
    if (!currentSession) return;
    
    try {
        // Stop QR rotation
        stopQRRotation();
        
        // Clean up realtime subscription
        cleanupRealtimeSubscription();
        
        // Update session in database
        await supabase
            .from('sessions')
            .update({ is_active: false })
            .eq('id', currentSession.id);
        
        // Reset state
        currentSession = null;
        
        // Update UI
        btnStart.style.display = 'block';
        btnStop.style.display = 'none';
        qrContainer.style.display = 'none';
        
        showSuccess('Session stopped. Attendance list preserved.');
        
    } catch (error) {
        console.error('Error stopping session:', error);
        showError(error.message || 'Failed to stop session');
    }
}

async function restoreSession() {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return false;
        
        // Check for active session
        const { data: activeSession, error } = await supabase
            .from('sessions')
            .select('*')
            .eq('admin_id', session.user.id)
            .eq('is_active', true)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();
        
        if (error && error.code !== 'PGRST116') {
            // PGRST116 = no rows found, which is fine
            console.error('Session restore error:', error);
        }
        
        if (activeSession) {
            currentSession = activeSession;
            
            // Update UI
            btnStart.style.display = 'none';
            btnStop.style.display = 'block';
            qrContainer.style.display = 'block';
            
            // Load existing attendance
            const { data: records } = await supabase
                .from('attendance_records')
                .select('*, students(roll_number, name)')
                .eq('session_id', currentSession.id);
            
            if (records) {
                presentStudents = records.map(r => ({
                    id: r.student_id,
                    roll_number: r.students.roll_number,
                    name: r.students.name,
                    locationVerified: r.location_verified,
                    attendanceTime: r.created_at
                }));
            }
            
            updateListUI();
            startQRRotation();
            setupRealtimeSubscription();
            
            return true;
        }
        
        return false;
    } catch (error) {
        console.error('Session restore error:', error);
        return false;
    }
}

// ============================================
// UI Updates
// ============================================

function updateListUI() {
    if (!countEl || !attendanceListEl) return;
    
    countEl.textContent = presentStudents.length;
    
    if (presentStudents.length === 0) {
        attendanceListEl.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">
                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        <path d="M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        <path d="M20 8v6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        <path d="M23 11h-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                </div>
                <h3 class="empty-state-title">No attendance yet</h3>
                <p class="empty-state-description">Students will appear here as they scan the QR code.</p>
            </div>
        `;
        return;
    }
    
    const sortedStudents = [...presentStudents].sort((a, b) => 
        a.roll_number.localeCompare(b.roll_number)
    );
    
    attendanceListEl.innerHTML = sortedStudents.map(student => `
        <div class="attendance-item">
            <div class="attendance-item-avatar">
                ${student.name.substring(0, 2).toUpperCase()}
            </div>
            <div class="attendance-item-info">
                <div class="attendance-item-roll">${student.roll_number}</div>
                <div class="attendance-item-name">${student.name}</div>
            </div>
            <div class="attendance-item-status">
                <span class="location-badge ${student.locationVerified ? 'verified' : 'unverified'}">
                    ${student.locationVerified ? 
                        '<svg viewBox="0 0 24 24" fill="none"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M9 12l2 2 4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>' : 
                        '<svg viewBox="0 0 24 24" fill="none"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 5v7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
                    }
                    ${student.locationVerified ? 'Verified' : 'Pending'}
                </span>
            </div>
            <div class="attendance-item-time">
                ${student.attendanceTime ? new Date(student.attendanceTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : ''}
            </div>
        </div>
    `).join('');
}

// ============================================
// Copy Attendance List
// ============================================

function copyAttendanceList() {
    if (presentStudents.length === 0) {
        showError('No attendance to copy');
        return;
    }
    
    const dateStr = new Date().toLocaleDateString('en-GB', { 
        day: '2-digit', 
        month: 'long', 
        year: 'numeric' 
    });
    
    let text = `*Attendance - ${dateStr}*\n\n`;
    text += `Total Present: ${presentStudents.length}\n\n`;
    
    const sorted = [...presentStudents].sort((a, b) => a.roll_number.localeCompare(b.roll_number));
    sorted.forEach(s => {
        text += `${s.roll_number} - ${s.name} ${s.locationVerified ? '\u2705' : '\u274C'}\n`;
    });
    
    text += `\nGenerated by Quick Attendance`;
    
    navigator.clipboard.writeText(text).then(() => {
        showSuccess('Attendance list copied to clipboard!');
    }).catch(() => {
        showError('Failed to copy. Please try again.');
    });
}

// ============================================
// Event Listeners
// ============================================

// Login
btnLogin.addEventListener('click', async () => {
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    
    if (!email || !password) {
        showError('Please enter both email and password');
        return;
    }
    
    setButtonLoading(btnLogin, true);
    
    try {
        const { data, error } = await supabase.auth.signInWithPassword({ 
            email, 
            password 
        });
        
        if (error) {
            showError(error.message);
            setButtonLoading(btnLogin, false);
            return;
        }
        
        // Hide login, show dashboard
        loginSection.style.display = 'none';
        dashboardSection.style.display = 'block';
        
        // Try to restore any active session
        await restoreSession();
        
        showSuccess('Welcome back!');
        
    } catch (error) {
        console.error('Login error:', error);
        showError(error.message || 'Login failed');
    } finally {
        setButtonLoading(btnLogin, false);
    }
});

// Start Session
btnStart.addEventListener('click', async () => {
    if (isLoading) return;
    isLoading = true;
    
    saveButtonText(btnStart);
    setButtonLoading(btnStart, true);
    
    // Generate secure secret for TOTP
    const secret = cryptoUtil.bufToBase64(crypto.getRandomValues(new Uint8Array(16)));
    
    // Get admin location with timeout
    try {
        await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    createSessionRecord(secret, pos.coords.latitude, pos.coords.longitude);
                    resolve();
                },
                (err) => {
                    // Fallback: start session without location
                    console.warn('Location error:', err);
                    createSessionRecord(secret, null, null);
                    resolve();
                },
                { timeout: 5000 }
            );
        });
    } catch (error) {
        // If geolocation is not supported or permission denied
        createSessionRecord(secret, null, null);
    } finally {
        isLoading = false;
    }
});

// Stop Session
btnStop.addEventListener('click', async () => {
    if (isLoading) return;
    isLoading = true;
    
    setButtonLoading(btnStop, true);
    await stopSession();
    setButtonLoading(btnStop, false);
    isLoading = false;
});

// Copy List
btnCopy.addEventListener('click', copyAttendanceList);

// Check auth state on load
supabase.auth.getSession().then(({ data: { session } }) => {
    if (session) {
        loginSection.style.display = 'none';
        dashboardSection.style.display = 'block';
        restoreSession();
    }
});

// Handle session cleanup on page unload
window.addEventListener('beforeunload', () => {
    stopQRRotation();
    cleanupRealtimeSubscription();
});

// Save button texts on load
saveButtonText(btnLogin);
saveButtonText(btnStart);
saveButtonText(btnStop);
saveButtonText(btnCopy);
