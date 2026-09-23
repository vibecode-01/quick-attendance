import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import { generateTOTP, calculateDistance } from '@/lib/crypto';

const prisma = new PrismaClient();

export async function POST(req: Request) {
  try {
    const { studentId, sessionId, token, signature, lat, lng, payload } = await req.json();

    // 1. Validate Session & Token (Anti-Replay / Anti-Screenshot)
    const session = await prisma.session.findUnique({ where: { id: sessionId } });
    if (!session || !session.isActive) return NextResponse.json({ error: 'Session inactive or closed' }, { status: 400 });

    const currentToken = await generateTOTP(session.sessionSecret);
    // Allow minor clock drift/processing delay by checking previous window too
    const previousToken = await generateTOTP(session.sessionSecret, 10000 /* previous window logic adjusted in production */); 
    
    if (token !== currentToken && token !== previousToken) {
      return NextResponse.json({ error: 'QR Code expired. Scan again.' }, { status: 403 });
    }

    // 2. Validate Device Signature (Anti-Proxy)
    const student = await prisma.student.findUnique({ where: { id: studentId } });
    if (!student || !student.devicePublicKey) return NextResponse.json({ error: 'Device not registered' }, { status: 401 });

    const verifyKey = crypto.createPublicKey({ key: Buffer.from(student.devicePublicKey, 'base64'), format: 'der', type: 'spki' });
    const isVerified = crypto.verify('SHA256', Buffer.from(payload), verifyKey, Buffer.from(signature, 'base64'));

    if (!isVerified) return NextResponse.json({ error: 'Cryptographic binding failed. Unauthorized device.' }, { status: 403 });

    // 3. Location Verification
    let locationVerified = false;
    if (lat && lng && session.adminLat && session.adminLng) {
      const distance = calculateDistance(session.adminLat, session.adminLng, lat, lng);
      locationVerified = distance <= 150; // within 150 meters
    }

    // 4. Record Attendance (Prisma constraints handle duplicates)
    await prisma.attendanceRecord.create({
      data: { sessionId, studentId, locationVerified }
    });

    return NextResponse.json({ success: true, locationVerified });
  } catch (err: any) {
    if (err.code === 'P2002') return NextResponse.json({ error: 'Attendance already recorded' }, { status: 400 });
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
