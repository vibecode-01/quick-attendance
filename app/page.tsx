'use client';
import { useState, useEffect } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { signPayload } from '@/lib/crypto';

export default function StudentPortal() {
  const [pin, setPin] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [status, setStatus] = useState({ type: '', msg: '' });

  // In a real implementation, the private key is AES-encrypted using the PIN. 
  // For this codebase, we use PIN as a simple validation wall before signing.
  const handleUnlock = () => {
    const storedStudent = localStorage.getItem('studentData');
    if (!storedStudent) return setStatus({ type: 'error', msg: 'Device not registered. Please setup.' });
    if (pin.length === 4) setUnlocked(true);
  };

  useEffect(() => {
    if (!unlocked) return;
    
    const scanner = new Html5QrcodeScanner('reader', { fps: 10, qrbox: { width: 250, height: 250 } }, false);
    
    scanner.render(async (text) => {
      scanner.pause(true); // Stop scanning immediately
      setStatus({ type: 'info', msg: 'Verifying cryptographic signature...' });
      
      try {
        const qrData = JSON.parse(text); // {s: sessionId, t: token}
        const student = JSON.parse(localStorage.getItem('studentData')!);
        
        const payload = JSON.stringify({ s: qrData.s, t: qrData.t, time: Date.now() });
        const signature = await signPayload(student.privKey, payload);

        // Get location (fail-safe)
        navigator.geolocation.getCurrentPosition(async (pos) => {
          const res = await fetch('/api/student/attend', {
            method: 'POST',
            body: JSON.stringify({
              studentId: student.id, sessionId: qrData.s, token: qrData.t,
              signature, payload, lat: pos.coords.latitude, lng: pos.coords.longitude
            })
          });
          const data = await res.json();
          if (data.success) setStatus({ type: 'success', msg: '✅ Attendance Recorded Successfully!' });
          else setStatus({ type: 'error', msg: data.error });
        }, () => setStatus({ type: 'error', msg: 'Location access required.' }));
      } catch (err) {
        setStatus({ type: 'error', msg: 'Invalid QR Code' });
      }
    }, () => {});

    return () => scanner.clear();
  }, [unlocked]);

  if (!unlocked) return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-4">
      <h1 className="text-2xl font-bold mb-6 text-gray-800">Class Attendance</h1>
      <input type="password" placeholder="Enter 4-digit PIN" maxLength={4}
        className="text-center text-2xl tracking-widest p-4 border rounded shadow-sm mb-4 w-full max-w-xs"
        value={pin} onChange={e => setPin(e.target.value)} />
      <button onClick={handleUnlock} className="bg-blue-600 text-white font-bold py-3 px-8 rounded w-full max-w-xs shadow-md">
        Unlock Scanner
      </button>
      {status.msg && <p className="mt-4 text-red-600">{status.msg}</p>}
    </div>
  );

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-black text-white p-4">
      <h2 className="text-xl font-bold mb-4">Scan Teacher's QR</h2>
      <div id="reader" className="w-full max-w-md bg-white rounded overflow-hidden"></div>
      {status.msg && (
        <div className={`mt-6 p-4 rounded text-center w-full max-w-md ${status.type === 'success' ? 'bg-green-600' : status.type === 'error' ? 'bg-red-600' : 'bg-blue-600'}`}>
          <span className="font-bold">{status.msg}</span>
        </div>
      )}
    </div>
  );
}
