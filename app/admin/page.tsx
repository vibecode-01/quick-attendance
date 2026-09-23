'use client';
import { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { generateTOTP } from '@/lib/crypto';

export default function AdminDashboard() {
  const [session, setSession] = useState<{ id: string, secret: string } | null>(null);
  const [qrToken, setQrToken] = useState('');
  const [presentStudents, setPresentStudents] = useState<any[]>([]);

  // Rotate QR code token every 5 seconds locally (no server hits needed)
  useEffect(() => {
    if (!session) return;
    const interval = setInterval(async () => {
      const token = await generateTOTP(session.secret);
      setQrToken(token);
    }, 5000);
    return () => clearInterval(interval);
  }, [session]);

  const startSession = async () => {
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const res = await fetch('/api/admin/session', {
        method: 'POST',
        body: JSON.stringify({ action: 'start', lat: pos.coords.latitude, lng: pos.coords.longitude })
      });
      const data = await res.json();
      setSession({ id: data.sessionId, secret: data.sessionSecret });
    });
  };

  const copyToWhatsApp = () => {
    const dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
    let text = `*Attendance - ${dateStr}*\n\n`;
    presentStudents.sort((a,b) => a.rollNumber.localeCompare(b.rollNumber)).forEach(s => {
      text += `${s.rollNumber} - ${s.name}\n`;
    });
    navigator.clipboard.writeText(text);
    alert('Copied to clipboard! Ready to paste in WhatsApp.');
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-6 text-gray-800">Admin Dashboard</h1>
      
      {!session ? (
        <button onClick={startSession} className="bg-green-600 text-white px-6 py-3 rounded shadow font-bold text-lg">
          Start Attendance Session
        </button>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="flex flex-col items-center bg-white p-6 rounded shadow">
            <h2 className="text-xl font-bold text-gray-600 mb-4">Live Session Active</h2>
            <QRCodeSVG value={JSON.stringify({ s: session.id, t: qrToken })} size={300} />
            <p className="mt-4 text-sm text-gray-400">QR updates automatically</p>
            <button onClick={() => setSession(null)} className="mt-6 bg-red-600 text-white px-4 py-2 rounded">
              Close Session
            </button>
          </div>

          <div className="bg-white p-6 rounded shadow flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">Present: {presentStudents.length}</h2>
              <button onClick={copyToWhatsApp} className="bg-blue-600 text-white px-4 py-2 rounded text-sm font-bold">
                Copy for WhatsApp
              </button>
            </div>
            <div className="flex-1 overflow-auto border rounded p-2">
              {presentStudents.map(s => (
                <div key={s.id} className="flex justify-between py-2 border-b last:border-0">
                  <span className="font-mono text-gray-600">{s.rollNumber}</span>
                  <span className="font-medium">{s.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
