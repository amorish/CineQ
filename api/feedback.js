const nodemailer = require('nodemailer');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { email, message, attachment, filename } = req.body;

  if (!message) {
    return res.status(400).json({ message: 'Message is required' });
  }

  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    return res.status(500).json({ message: 'Server email configuration is missing.' });
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });

  const mailOptions = {
    from: `CineQ Feedback <${process.env.EMAIL_USER}>`,
    to: process.env.EMAIL_USER, // Send to yourself
    subject: `CineQ Feedback/Bug Report from ${email || 'Anonymous'}`,
    text: `You have received new feedback from CineQ:\n\nSender: ${email || 'Anonymous'}\n\nMessage:\n${message}`,
  };

  if (attachment && filename) {
    mailOptions.attachments = [
      {
        filename: filename,
        content: attachment.split('base64,')[1] || attachment,
        encoding: 'base64'
      }
    ];
  }

  try {
    await transporter.sendMail(mailOptions);
    return res.status(200).json({ message: 'Feedback sent successfully!' });
  } catch (error) {
    console.error('Error sending email:', error);
    return res.status(500).json({ message: 'Failed to send feedback', error: error.message });
  }
}
