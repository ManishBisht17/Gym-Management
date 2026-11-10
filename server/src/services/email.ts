import { env } from '../config/env.js';

type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
  senderName?: string;
  replyTo?: string;
};

export async function sendEmail({ to, subject, html, text, senderName, replyTo }: SendEmailInput) {
  if (!env.BREVO_API_KEY || !env.BREVO_SENDER_EMAIL) {
    throw new Error('Email is not configured. Set BREVO_API_KEY and BREVO_SENDER_EMAIL.');
  }

  const payload: Record<string, unknown> = {
    sender: {
      name: senderName || env.BREVO_SENDER_NAME || 'GymFlow',
      email: env.BREVO_SENDER_EMAIL,
    },
    to: [{ email: to }],
    subject,
    htmlContent: html,
    textContent: text,
  };

  if (replyTo) {
    payload.replyTo = { email: replyTo, name: senderName || env.BREVO_SENDER_NAME || 'GymFlow' };
  }

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'api-key': env.BREVO_API_KEY,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Brevo email failed (${response.status}): ${detail.slice(0, 200)}`);
  }
}

function brandHeader(eyebrow: string, gymName: string, logoDataUri?: string) {
  const logo = logoDataUri
    ? `<img src="${logoDataUri}" alt="${gymName}" width="56" height="56" style="display:block;border-radius:12px;object-fit:cover;margin:0 0 14px;border:1px solid #ffffff22" />`
    : '';
  return `
    <div style="background:#14211c;color:#f4f6f1;padding:22px 24px;border-radius:14px 14px 0 0">
      ${logo}
      <p style="margin:0 0 6px;font-size:12px;letter-spacing:1.5px;color:#c7ed7d;font-weight:700">${eyebrow}</p>
      <h2 style="margin:0;font-size:24px">${gymName}</h2>
    </div>
  `;
}

export async function sendPasswordResetOtp(to: string, otp: string) {
  const subject = 'Your GymFlow password reset code';
  const text = `Your GymFlow password reset code is ${otp}. It expires in 10 minutes. If you did not request this, you can ignore this email.`;
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#1b2721;max-width:520px">
      <h2 style="margin:0 0 12px">Reset your GymFlow password</h2>
      <p style="margin:0 0 16px">Use this one-time code to reset your password. It expires in <strong>10 minutes</strong>.</p>
      <p style="font-size:28px;letter-spacing:6px;font-weight:700;margin:0 0 16px">${otp}</p>
      <p style="margin:0;color:#6f7b74;font-size:13px">If you did not request this, you can ignore this email.</p>
    </div>
  `;
  await sendEmail({ to, subject, html, text });
}

type MemberWelcomeInput = {
  to: string;
  memberName: string;
  memberCode: string;
  gymName: string;
  gymEmail?: string;
  gymPhone?: string;
  logoDataUri?: string;
};

export async function sendMemberWelcomeEmail({
  to,
  memberName,
  memberCode,
  gymName,
  gymEmail,
  gymPhone,
  logoDataUri,
}: MemberWelcomeInput) {
  const subject = `Welcome to ${gymName}`;
  const contactBits = [gymEmail, gymPhone].filter(Boolean).join(' · ');
  const text = `Hi ${memberName}, welcome to ${gymName}. Your member ID is ${memberCode}. ${contactBits ? `Contact us at ${contactBits}.` : ''}`.trim();
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.55;color:#1b2721;max-width:560px">
      ${brandHeader('WELCOME', gymName, logoDataUri)}
      <div style="border:1px solid #e4eadf;border-top:0;padding:24px;border-radius:0 0 14px 14px">
        <p style="margin:0 0 14px">Hi <strong>${memberName}</strong>,</p>
        <p style="margin:0 0 14px">Your membership account is ready. We’re glad to have you with us.</p>
        <div style="background:#f3f6f1;border:1px solid #e4eadf;border-radius:10px;padding:14px 16px;margin:0 0 16px">
          <p style="margin:0;font-size:12px;color:#6f7b74">Member ID</p>
          <p style="margin:4px 0 0;font-size:20px;font-weight:700;letter-spacing:0.4px">${memberCode}</p>
        </div>
        ${contactBits ? `<p style="margin:0 0 8px;color:#6f7b74;font-size:13px">Questions? Reach us at ${contactBits}</p>` : ''}
        <p style="margin:0;color:#6f7b74;font-size:13px">See you on the floor,<br/><strong>${gymName}</strong></p>
      </div>
    </div>
  `;

  await sendEmail({
    to,
    subject,
    html,
    text,
    senderName: gymName,
    replyTo: gymEmail,
  });
}

type RenewalReminderInput = {
  to: string;
  memberName: string;
  planName: string;
  endDate: Date;
  balance: number;
  gymName: string;
  gymEmail?: string;
  gymPhone?: string;
  logoDataUri?: string;
};

export async function sendRenewalReminderEmail({
  to,
  memberName,
  planName,
  endDate,
  balance,
  gymName,
  gymEmail,
  gymPhone,
  logoDataUri,
}: RenewalReminderInput) {
  const endLabel = endDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  const balanceLabel = `₹${Number(balance || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
  const contactBits = [gymEmail, gymPhone].filter(Boolean).join(' · ');
  const subject = `Renewal reminder from ${gymName}`;
  const text = `Hi ${memberName}, your ${planName} membership at ${gymName} ends on ${endLabel}. Outstanding balance: ${balanceLabel}. Please renew to keep training without interruption.`;
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.55;color:#1b2721;max-width:560px">
      ${brandHeader('RENEWAL REMINDER', gymName, logoDataUri)}
      <div style="border:1px solid #e4eadf;border-top:0;padding:24px;border-radius:0 0 14px 14px">
        <p style="margin:0 0 14px">Hi <strong>${memberName}</strong>,</p>
        <p style="margin:0 0 14px">This is a friendly reminder to renew your membership so your access stays uninterrupted.</p>
        <div style="background:#f3f6f1;border:1px solid #e4eadf;border-radius:10px;padding:14px 16px;margin:0 0 16px">
          <p style="margin:0 0 8px"><span style="color:#6f7b74;font-size:12px">Plan</span><br/><strong>${planName}</strong></p>
          <p style="margin:0 0 8px"><span style="color:#6f7b74;font-size:12px">Ends on</span><br/><strong>${endLabel}</strong></p>
          <p style="margin:0"><span style="color:#6f7b74;font-size:12px">Outstanding balance</span><br/><strong>${balanceLabel}</strong></p>
        </div>
        <p style="margin:0 0 12px">Reply to this email or visit the gym desk to renew.</p>
        ${contactBits ? `<p style="margin:0 0 8px;color:#6f7b74;font-size:13px">Contact: ${contactBits}</p>` : ''}
        <p style="margin:0;color:#6f7b74;font-size:13px">See you soon,<br/><strong>${gymName}</strong></p>
      </div>
    </div>
  `;

  await sendEmail({
    to,
    subject,
    html,
    text,
    senderName: gymName,
    replyTo: gymEmail,
  });
}

type PaymentReceiptInput = {
  to: string;
  memberName: string;
  gymName: string;
  gymEmail?: string;
  gymPhone?: string;
  amount: number;
  method: string;
  receiptNumber: string;
  paymentDate: Date;
  remainingBalance: number;
  planName?: string;
  reference?: string;
  logoDataUri?: string;
};

export async function sendPaymentReceiptEmail({
  to,
  memberName,
  gymName,
  gymEmail,
  gymPhone,
  amount,
  method,
  receiptNumber,
  paymentDate,
  remainingBalance,
  planName,
  reference,
  logoDataUri,
}: PaymentReceiptInput) {
  const amountLabel = `₹${Number(amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
  const balanceLabel = `₹${Number(remainingBalance || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
  const dateLabel = paymentDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  const methodLabel = String(method || 'cash').replace(/_/g, ' ');
  const contactBits = [gymEmail, gymPhone].filter(Boolean).join(' · ');
  const subject = `Payment receipt from ${gymName}`;
  const text = `Hi ${memberName}, we received ${amountLabel} at ${gymName} on ${dateLabel}. Receipt: ${receiptNumber}. Remaining balance: ${balanceLabel}.`;
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.55;color:#1b2721;max-width:560px">
      ${brandHeader('PAYMENT RECEIPT', gymName, logoDataUri)}
      <div style="border:1px solid #e4eadf;border-top:0;padding:24px;border-radius:0 0 14px 14px">
        <p style="margin:0 0 14px">Hi <strong>${memberName}</strong>,</p>
        <p style="margin:0 0 14px">Thanks! Your payment has been recorded successfully.</p>
        <div style="background:#f3f6f1;border:1px solid #e4eadf;border-radius:10px;padding:14px 16px;margin:0 0 16px">
          <p style="margin:0 0 8px"><span style="color:#6f7b74;font-size:12px">Receipt</span><br/><strong>${receiptNumber}</strong></p>
          <p style="margin:0 0 8px"><span style="color:#6f7b74;font-size:12px">Amount paid</span><br/><strong>${amountLabel}</strong></p>
          <p style="margin:0 0 8px"><span style="color:#6f7b74;font-size:12px">Date</span><br/><strong>${dateLabel}</strong></p>
          <p style="margin:0 0 8px"><span style="color:#6f7b74;font-size:12px">Method</span><br/><strong style="text-transform:capitalize">${methodLabel}</strong></p>
          ${planName ? `<p style="margin:0 0 8px"><span style="color:#6f7b74;font-size:12px">Plan</span><br/><strong>${planName}</strong></p>` : ''}
          ${reference ? `<p style="margin:0 0 8px"><span style="color:#6f7b74;font-size:12px">Reference</span><br/><strong>${reference}</strong></p>` : ''}
          <p style="margin:0"><span style="color:#6f7b74;font-size:12px">Remaining balance</span><br/><strong>${balanceLabel}</strong></p>
        </div>
        ${contactBits ? `<p style="margin:0 0 8px;color:#6f7b74;font-size:13px">Questions? ${contactBits}</p>` : ''}
        <p style="margin:0;color:#6f7b74;font-size:13px">Thank you,<br/><strong>${gymName}</strong></p>
      </div>
    </div>
  `;

  await sendEmail({
    to,
    subject,
    html,
    text,
    senderName: gymName,
    replyTo: gymEmail,
  });
}
