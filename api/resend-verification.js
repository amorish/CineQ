const admin = require('firebase-admin');
const nodemailer = require('nodemailer');

if (!admin.apps.length) {
  const privateKey = process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : '';
  if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && privateKey) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: privateKey,
      }),
    });
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  // Extract ID Token from Authorization Header
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Unauthorized. Authorization header is missing or invalid.' });
  }
  const token = authHeader.split('Bearer ')[1];

  if (!admin.apps.length) {
    return res.status(500).json({ message: 'Firebase Admin not configured on backend.' });
  }

  try {
    // Verify the client's ID Token
    const decodedToken = await admin.auth().verifyIdToken(token);
    const uid = decodedToken.uid;
    const email = decodedToken.email;

    if (!email) {
      return res.status(400).json({ message: 'Email address not found in token.' });
    }

    // Check if the user is already verified in Firebase Auth
    const userRecord = await admin.auth().getUser(uid);
    if (userRecord.emailVerified) {
      return res.status(400).json({ message: 'Your email address is already verified.' });
    }

    const db = admin.firestore();
    const userDocRef = db.collection('cineq_users').doc(uid);
    const docSnap = await userDocRef.get();
    
    const todayStr = new Date().toISOString().split('T')[0];
    let resendsToday = 0;
    let resetDate = todayStr;

    if (docSnap.exists) {
      const data = docSnap.data();
      
      // 1. Cooldown Rate Limiting (2 Minutes)
      const lastSent = data.lastVerificationSentAt;
      if (lastSent) {
        const lastSentTime = lastSent.toDate ? lastSent.toDate().getTime() : (lastSent.seconds * 1000);
        const now = Date.now();
        const diffMs = now - lastSentTime;
        if (diffMs < 120000) { // 120,000 ms = 2 minutes
          const waitSeconds = Math.ceil((120000 - diffMs) / 1000);
          return res.status(429).json({ message: `Please wait ${waitSeconds} seconds before requesting another email.` });
        }
      }

      // 2. Daily Rate Limiting (Max 5/Day)
      resendsToday = data.verificationResendsToday || 0;
      resetDate = data.lastVerificationResetDate || '';

      if (resetDate === todayStr) {
        if (resendsToday >= 5) {
          return res.status(429).json({ message: 'You have reached the limit of 5 verification emails per day. Please try again tomorrow.' });
        }
        resendsToday += 1;
      } else {
        resendsToday = 1;
        resetDate = todayStr;
      }

      // Update the user document
      await userDocRef.update({
        lastVerificationSentAt: admin.firestore.FieldValue.serverTimestamp(),
        verificationResendsToday: resendsToday,
        lastVerificationResetDate: resetDate
      });
    } else {
      // If document doesn't exist, create it dynamically
      resendsToday = 1;
      await userDocRef.set({
        username: decodedToken.name || email.split('@')[0],
        email: email,
        authProvider: 'password',
        emailVerified: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        lastVerificationSentAt: admin.firestore.FieldValue.serverTimestamp(),
        verificationResendsToday: 1,
        lastVerificationResetDate: todayStr
      });
    }

    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      return res.status(500).json({ message: 'SMTP email configuration is missing on server.' });
    }

    // Generate Custom Verification Link
    const origin = req.headers.origin || 'https://cine-q.vercel.app';
    const actionCodeSettings = { url: origin };
    const link = await admin.auth().generateEmailVerificationLink(email, actionCodeSettings);

    // Premium Golden-Ticket custom HTML Template
    const htmlTemplate = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Account Verification Code</title>
      <style>
        body {
          margin: 0;
          padding: 0;
          background-color: #0a0a0a;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          color: #ffffff;
        }
        .email-wrapper {
          width: 100%;
          max-width: 650px;
          padding: 40px 20px;
          margin: 0 auto;
          box-sizing: border-box;
        }
        .ticket-container {
          background: #141414;
          border-radius: 12px;
          border: 2px solid #eab308;
          overflow: hidden;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6);
        }
        .ticket-table {
          width: 100%;
          border-collapse: collapse;
        }
        .ticket-main {
          padding: 35px;
          vertical-align: top;
        }
        .admit-text {
          font-size: 10px;
          letter-spacing: 4px;
          text-transform: uppercase;
          color: #eab308;
          margin-bottom: 24px;
          display: block;
          font-weight: 700;
        }
        .logo-box {
          margin-bottom: 20px;
          display: block;
          max-width: 140px; 
        }
        .logo-box img {
          width: 100%;
          height: auto;
          display: block;
        }
        .subtitle {
          font-size: 15px;
          color: #a8a6a5;
          margin: 0 0 28px 0;
          font-weight: 500;
          line-height: 1.5;
        }
        .btn-container {
          margin: 32px 0 24px 0;
        }
        .verify-btn {
          display: inline-block;
          background-color: #eab308; 
          color: #0a0a0a !important;
          text-decoration: none;
          padding: 14px 36px;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 800;
          letter-spacing: 1.5px;
          text-transform: uppercase;
          box-shadow: 0 4px 15px rgba(234, 179, 8, 0.35);
        }
        .security-warning {
          font-size: 12px;
          color: #666;
          margin: 0;
          line-height: 1.5;
        }
        .ticket-stub {
          background: #1a1a1a;
          padding: 35px 25px;
          border-left: 2px dashed #eab308;
          vertical-align: middle;
          text-align: center;
          width: 180px;
        }
        .stub-label {
          font-size: 9px;
          color: #666;
          text-transform: uppercase;
          letter-spacing: 1.5px;
          margin: 0 0 4px 0;
          font-weight: 700;
        }
        .stub-value {
          font-size: 14px;
          font-weight: 700;
          color: #fff;
          margin: 0 0 24px 0;
          letter-spacing: 0.5px;
        }
        .barcode {
          width: 44px; 
          margin: 28px auto 0 auto;
          display: block;
        }
        .barcode-line {
          background-color: #eab308;
          height: 3px;
          margin-bottom: 3px;
          border-radius: 1px;
        }
        @media (max-width: 520px) {
          .ticket-table, .ticket-table tbody, .ticket-table tr {
            display: block !important;
            width: 100% !important;
          }
          .ticket-main {
            display: block !important;
            width: 100% !important;
            padding: 25px !important;
            box-sizing: border-box !important;
          }
          .ticket-stub {
            display: block !important;
            width: 100% !important;
            border-left: none !important;
            border-top: 2px dashed #eab308 !important;
            padding: 25px !important;
            box-sizing: border-box !important;
          }
          .barcode {
            display: none !important;
          }
        }
      </style>
      </head>
      <body>
      <div class="email-wrapper">
        <div class="ticket-container">
          <table class="ticket-table">
            <tr>
              <td class="ticket-main">
                <span class="admit-text">• Secure Access Ticket •</span>
                
                <div class="logo-box">
                  <img src="https://raw.githubusercontent.com/amorish/CineQ/main/assets/images/cineqLogoDarkmode.png" alt="CineQ">
                </div>
                
                <p class="subtitle">Welcome to CineQ! To verify your account and activate your shared watchlist, please click the golden button below.</p>
                
                <div class="btn-container">
                  <a href="${link}" class="verify-btn">Verify Account</a>
                </div>
                
                <p class="security-warning">Please ignore if you didn't create an account.<br>For safety, this ticket link will expire in 24 hours.</p>
              </td>
              <td class="ticket-stub">
                <p class="stub-label">Ticket Type</p>
                <p class="stub-value" style="color: #eab308;">Verification</p>
                
                <p class="stub-label">Validity</p>
                <p class="stub-value">24 Hours</p>
                
                <p class="stub-label">Status</p>
                <p class="stub-value">Single-Use</p>
                
                <div class="barcode">
                  <div class="barcode-line" style="width: 100%;"></div>
                  <div class="barcode-line" style="width: 60%;"></div>
                  <div class="barcode-line" style="width: 90%;"></div>
                  <div class="barcode-line" style="width: 40%;"></div>
                  <div class="barcode-line" style="width: 80%;"></div>
                  <div class="barcode-line" style="width: 70%;"></div>
                  <div class="barcode-line" style="width: 95%;"></div>
                  <div class="barcode-line" style="width: 50%;"></div>
                </div>
              </td>
            </tr>
          </table>
        </div>
      </div>
      </body>
      </html>
    `;

    // Configure SMTP Nodemailer
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    const mailOptions = {
      from: `"CineQ Accounts" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Verify your email address for CineQ',
      html: htmlTemplate,
      text: `Verify your email for CineQ by clicking this link: ${link}`
    };

    await transporter.sendMail(mailOptions);
    return res.status(200).json({ message: 'Verification email sent successfully!' });
  } catch (error) {
    console.error('Error in resend-verification handler:', error);
    return res.status(500).json({ message: 'Internal Server Error', error: error.message });
  }
};
