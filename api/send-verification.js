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

  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ message: 'Email is required' });
  }

  if (!admin.apps.length) {
    return res.status(500).json({ message: 'Firebase Admin not configured. Please add FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY.' });
  }

  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    return res.status(500).json({ message: 'SMTP configuration is missing. Please add EMAIL_USER and EMAIL_PASS.' });
  }

  try {
    const actionCodeSettings = {
      url: 'https://cine-q.vercel.app', 
    };
    const link = await admin.auth().generateEmailVerificationLink(email, actionCodeSettings);

    const htmlTemplate = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background-color: #0a0a0a; color: #ffffff; margin: 0; padding: 20px; }
          .container { max-width: 500px; margin: 0 auto; background-color: #121212; padding: 40px; border-radius: 16px; margin-top: 40px; border: 1px solid #2d2d30; text-align: center; }
          .logo { margin-bottom: 32px; font-weight: 800; font-size: 32px; letter-spacing: -1px; }
          .logo-q { color: #e11d48; }
          .title { font-size: 24px; font-weight: 700; color: #ffffff; margin-bottom: 16px; }
          .text { font-size: 15px; color: #a1a1aa; line-height: 1.6; margin-bottom: 32px; }
          .button { display: inline-block; background-color: #e11d48; color: #ffffff !important; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 16px; font-weight: 600; margin-bottom: 32px; transition: opacity 0.2s; }
          .button:hover { opacity: 0.9; }
          .footer { font-size: 12px; color: #52525b; border-top: 1px solid #2d2d30; padding-top: 24px; margin-top: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="logo">Cine<span class="logo-q">Q</span></div>
          <h2 class="title">Verify your email address</h2>
          <p class="text">Welcome! You've successfully created an account with <strong>${email}</strong>. Please click the button below to verify your email address and unlock your watchlist.</p>
          <a href="${link}" class="button">Verify Email</a>
          <p class="text" style="font-size: 13px; margin-bottom: 0;">If you didn't create an account, you can safely ignore this email.</p>
          <div class="footer">&copy; ${new Date().getFullYear()} CineQ. All rights reserved.</div>
        </div>
      </body>
      </html>
    `;

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
    console.error('Error generating/sending verification link:', error);
    return res.status(500).json({ message: 'Internal Server Error', error: error.message });
  }
}
