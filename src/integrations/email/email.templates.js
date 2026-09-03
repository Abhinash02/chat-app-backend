const BASE_STYLES = `
  font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  background: #FFF7FA;
  padding: 32px 20px;
  color: #1B1024;
`;

function wrap({ title, body, appName }) {
  return `
  <div style="${BASE_STYLES}">
    <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:20px;padding:32px;box-shadow:0 8px 30px rgba(27,16,36,0.08)">
      <div style="font-size:22px;font-weight:700;color:#FF4E88;margin-bottom:4px">${appName}</div>
      <h1 style="font-size:20px;margin:16px 0 12px">${title}</h1>
      ${body}
      <hr style="border:none;border-top:1px solid #F3D7E2;margin:28px 0" />
      <p style="font-size:12px;color:#9C8AA6;margin:0">
        If you did not request this email you can safely ignore it. Never share this code with anyone —
        our team will never ask for it.
      </p>
    </div>
  </div>`;
}

function codeBlock(code) {
  return `
    <div style="font-size:34px;letter-spacing:10px;font-weight:700;text-align:center;
                background:#FDEDF3;border-radius:14px;padding:18px;margin:20px 0;color:#D62E68">
      ${code}
    </div>`;
}

export function buildVerificationEmail({ code, name, expiresInMinutes, appName }) {
  return {
    subject: `${code} is your ${appName} verification code`,
    text: `Hi ${name}, your ${appName} verification code is ${code}. It expires in ${expiresInMinutes} minutes.`,
    html: wrap({
      appName,
      title: `Welcome, ${name}!`,
      body: `
        <p style="font-size:15px;line-height:1.6;color:#5C4A63;margin:0">
          Enter this code in the app to verify your email and start chatting.
        </p>
        ${codeBlock(code)}
        <p style="font-size:14px;color:#5C4A63;margin:0">
          The code expires in <strong>${expiresInMinutes} minutes</strong>.
        </p>`,
    }),
  };
}

export function buildPasswordResetEmail({ code, name, expiresInMinutes, appName }) {
  return {
    subject: `${code} is your ${appName} password reset code`,
    text: `Hi ${name}, use ${code} to reset your ${appName} password. It expires in ${expiresInMinutes} minutes.`,
    html: wrap({
      appName,
      title: 'Reset your password',
      body: `
        <p style="font-size:15px;line-height:1.6;color:#5C4A63;margin:0">
          Hi ${name}, enter this code in the app to choose a new password.
        </p>
        ${codeBlock(code)}
        <p style="font-size:14px;color:#5C4A63;margin:0">
          The code expires in <strong>${expiresInMinutes} minutes</strong>.
          Your password stays unchanged until you finish the reset.
        </p>`,
    }),
  };
}

export function buildWelcomeEmail({ name, appName, freeTalkMinutes }) {
  return {
    subject: `Welcome to ${appName}!`,
    text: `Hi ${name}, your ${appName} account is verified. Enjoy ${freeTalkMinutes} minutes of free chat.`,
    html: wrap({
      appName,
      title: `You're in, ${name} 🎉`,
      body: `
        <p style="font-size:15px;line-height:1.6;color:#5C4A63">
          Your email is verified. You have <strong>${freeTalkMinutes} minutes of free chat</strong> to get started,
          plus a daily coin bonus you can claim every day.
        </p>
        <p style="font-size:15px;line-height:1.6;color:#5C4A63">
          Add a photo and a short bio — profiles with both get far more replies.
        </p>`,
    }),
  };
}

function formatEmailDate(dateInput) {
  const d = dateInput ? new Date(dateInput) : new Date();
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  });
}

export function buildPaymentSuccessInvoiceEmail({ user, order, appName = 'VibeChat', invoiceUrl }) {
  const userName = user?.name || user?.nickname || 'Valued Member';
  const userEmail = user?.email || 'user@vibechat.app';
  const orderId = String(order?._id || order?.id || '');
  const amount = ((order?.amountInPaise || 0) / 100).toFixed(2);
  const coins = order?.coins || 0;
  const bonus = order?.bonusCoins || 0;
  const totalCoins = order?.totalCoins || coins + bonus;
  const dateStr = formatEmailDate(order?.creditedAt || order?.createdAt);
  const paymentId = order?.providerPaymentId || order?.providerOrderId || 'Verified';
  const gateway = order?.provider ? order.provider.toUpperCase() : 'ONLINE GATEWAY';

  const subject = `🧾 Payment Receipt: ₹${amount} for ${order?.packageName || 'Coins'} - ${appName}`;
  const text = `Hi ${userName},\n\nYour payment of ₹${amount} for ${order?.packageName || 'Coins Bundle'} was successful!\n\n+${totalCoins} Coins have been added to your wallet.\nOrder ID: ${orderId}\nPayment Ref: ${paymentId}\nDate: ${dateStr}\n\nThank you for choosing ${appName}!`;

  const html = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Payment Receipt</title>
  </head>
  <body style="margin:0;padding:0;background-color:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
    <table width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color:#F8FAFC;padding:32px 16px;">
      <tr>
        <td align="center">
          <table width="100%" border="0" cellpadding="0" cellspacing="0" style="max-width:580px;background:#FFFFFF;border-radius:20px;overflow:hidden;box-shadow:0 10px 30px rgba(0,0,0,0.06);border:1px solid #E2E8F0;">
            
            <!-- Header Banner -->
            <tr>
              <td style="background:linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%);padding:36px 32px;text-align:center;">
                <div style="display:inline-block;background:rgba(255,255,255,0.18);padding:8px 18px;border-radius:30px;margin-bottom:12px;">
                  <span style="color:#FFFFFF;font-size:14px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">✨ ${appName} Official Invoice</span>
                </div>
                <h1 style="color:#FFFFFF;font-size:26px;font-weight:800;margin:0 0 8px 0;letter-spacing:-0.5px;">Payment Successful! 🎉</h1>
                <p style="color:#E0E7FF;font-size:15px;margin:0;font-weight:500;">Your coins have been added to your account</p>
              </td>
            </tr>

            <!-- Content Area -->
            <tr>
              <td style="padding:32px;">
                
                <!-- Greeting & Summary Card -->
                <p style="font-size:15px;line-height:1.6;color:#334155;margin:0 0 20px 0;">
                  Hi <strong>${userName}</strong>,<br/>
                  Thank you for your purchase! We have successfully received your payment of <strong>₹${amount}</strong>. Your wallet has been instantly credited with <strong>${totalCoins} Coins</strong>.
                </p>

                <!-- Billing & User Information Box -->
                <table width="100%" border="0" cellpadding="0" cellspacing="0" style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:14px;margin-bottom:24px;overflow:hidden;">
                  <tr>
                    <td style="padding:16px 20px;border-bottom:1px solid #E2E8F0;background:#F1F5F9;">
                      <strong style="color:#1E293B;font-size:13px;text-transform:uppercase;letter-spacing:0.8px;">Customer & Order Information</strong>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:16px 20px;">
                      <table width="100%" border="0" cellpadding="0" cellspacing="0">
                        <tr>
                          <td style="padding:6px 0;color:#64748B;font-size:13px;width:38%;">Billed To:</td>
                          <td style="padding:6px 0;color:#0F172A;font-size:13px;font-weight:600;">${userName}</td>
                        </tr>
                        <tr>
                          <td style="padding:6px 0;color:#64748B;font-size:13px;">Customer Email:</td>
                          <td style="padding:6px 0;color:#0F172A;font-size:13px;font-family:monospace;">${userEmail}</td>
                        </tr>
                        <tr>
                          <td style="padding:6px 0;color:#64748B;font-size:13px;">Order Reference:</td>
                          <td style="padding:6px 0;color:#4F46E5;font-size:13px;font-family:monospace;font-weight:700;">#${orderId}</td>
                        </tr>
                        <tr>
                          <td style="padding:6px 0;color:#64748B;font-size:13px;">Payment Gateway:</td>
                          <td style="padding:6px 0;color:#0F172A;font-size:13px;font-weight:600;">${gateway}</td>
                        </tr>
                        <tr>
                          <td style="padding:6px 0;color:#64748B;font-size:13px;">Transaction ID:</td>
                          <td style="padding:6px 0;color:#0F172A;font-size:13px;font-family:monospace;">${paymentId}</td>
                        </tr>
                        <tr>
                          <td style="padding:6px 0;color:#64748B;font-size:13px;">Date & Time:</td>
                          <td style="padding:6px 0;color:#0F172A;font-size:13px;">${dateStr}</td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>

                <!-- Itemized Invoice Breakdown -->
                <table width="100%" border="0" cellpadding="0" cellspacing="0" style="border:1px solid #E2E8F0;border-radius:14px;margin-bottom:24px;overflow:hidden;">
                  <thead>
                    <tr style="background:#F1F5F9;">
                      <th align="left" style="padding:12px 18px;color:#475569;font-size:12px;font-weight:700;text-transform:uppercase;">Item Description</th>
                      <th align="center" style="padding:12px 18px;color:#475569;font-size:12px;font-weight:700;text-transform:uppercase;">Coins</th>
                      <th align="right" style="padding:12px 18px;color:#475569;font-size:12px;font-weight:700;text-transform:uppercase;">Price (INR)</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style="padding:16px 18px;border-top:1px solid #E2E8F0;color:#0F172A;font-size:14px;font-weight:600;">
                        ${order?.packageName || 'Coins Bundle'}
                        <div style="color:#64748B;font-size:12px;font-weight:400;margin-top:2px;">Instant digital chat credits</div>
                      </td>
                      <td align="center" style="padding:16px 18px;border-top:1px solid #E2E8F0;color:#D97706;font-size:14px;font-weight:800;">
                        🪙 +${totalCoins}
                      </td>
                      <td align="right" style="padding:16px 18px;border-top:1px solid #E2E8F0;color:#0F172A;font-size:14px;font-weight:700;">
                        ₹${amount}
                      </td>
                    </tr>
                    <tr style="background:#F8FAFC;">
                      <td colspan="2" style="padding:10px 18px;border-top:1px solid #E2E8F0;color:#64748B;font-size:13px;">Subtotal</td>
                      <td align="right" style="padding:10px 18px;border-top:1px solid #E2E8F0;color:#334155;font-size:13px;">₹${amount}</td>
                    </tr>
                    <tr style="background:#F8FAFC;">
                      <td colspan="2" style="padding:10px 18px;color:#64748B;font-size:13px;">Taxes & GST</td>
                      <td align="right" style="padding:10px 18px;color:#10B981;font-size:13px;font-weight:600;">₹0.00 (Inclusive)</td>
                    </tr>
                    <tr style="background:#EEF2FF;">
                      <td colspan="2" style="padding:14px 18px;border-top:2px solid #C7D2FE;color:#1E1B4B;font-size:15px;font-weight:800;">Total Paid</td>
                      <td align="right" style="padding:14px 18px;border-top:2px solid #C7D2FE;color:#4F46E5;font-size:18px;font-weight:900;">₹${amount}</td>
                    </tr>
                  </tbody>
                </table>

                <!-- Download / View CTA Button -->
                ${
                  invoiceUrl
                    ? `
                <div style="text-align:center;margin:28px 0 16px 0;">
                  <a href="${invoiceUrl}" target="_blank" style="background:linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%);color:#FFFFFF;text-decoration:none;padding:14px 32px;border-radius:12px;font-size:14px;font-weight:700;display:inline-block;box-shadow:0 4px 15px rgba(79,70,229,0.35);">
                    📥 Download Official Tax Invoice (PDF)
                  </a>
                </div>`
                    : ''
                }

                <div style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:12px;padding:14px 18px;margin-top:20px;">
                  <span style="font-size:16px;vertical-align:middle;margin-right:6px;">🛡️</span>
                  <span style="color:#166534;font-size:12.5px;font-weight:600;">
                    Your transaction is verified & secured. If you ever have any billing query, our support team is here 24/7.
                  </span>
                </div>

              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="background:#F8FAFC;padding:24px 32px;text-align:center;border-top:1px solid #E2E8F0;">
                <p style="color:#64748B;font-size:12px;line-height:1.6;margin:0 0 6px 0;">
                  This is an automated invoice generated by <strong>${appName}</strong>.
                </p>
                <p style="color:#94A3B8;font-size:11.5px;margin:0;">
                  Need help? Contact support at <a href="mailto:support@vibechat.app" style="color:#4F46E5;text-decoration:none;">support@vibechat.app</a>
                </p>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </body>
  </html>
  `;

  return { subject, text, html };
}

export function buildPaymentFailedEmail({ user, order, reason, appName = 'VibeChat' }) {
  const userName = user?.name || user?.nickname || 'Valued Member';
  const userEmail = user?.email || 'user@vibechat.app';
  const orderId = String(order?._id || order?.id || '');
  const amount = ((order?.amountInPaise || 0) / 100).toFixed(2);
  const dateStr = formatEmailDate(order?.updatedAt || order?.createdAt);
  const failureReason = reason || order?.failureReason || 'Transaction was cancelled or declined by the payment gateway';

  const subject = `⚠️ Payment Status: #${orderId} - 100% Auto-Refund Protected - ${appName}`;
  const text = `Hi ${userName},\n\nYour payment attempt of ₹${amount} for ${order?.packageName || 'Coins Bundle'} could not be completed.\n\nReason: ${failureReason}\nOrder ID: ${orderId}\nDate: ${dateStr}\n\n100% Auto-Refund Protection:\nIf any amount was deducted from your bank account or UPI app, it was NOT captured by us and will be automatically refunded to your source account within 2–24 hours (max 2–3 business days).\n\nYou can retry the payment anytime in the app.\n\n${appName} Support`;

  const html = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Payment Failed Notice</title>
  </head>
  <body style="margin:0;padding:0;background-color:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
    <table width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color:#F8FAFC;padding:32px 16px;">
      <tr>
        <td align="center">
          <table width="100%" border="0" cellpadding="0" cellspacing="0" style="max-width:580px;background:#FFFFFF;border-radius:20px;overflow:hidden;box-shadow:0 10px 30px rgba(0,0,0,0.06);border:1px solid #E2E8F0;">
            
            <!-- Header Banner -->
            <tr>
              <td style="background:linear-gradient(135deg, #DC2626 0%, #EA580C 100%);padding:36px 32px;text-align:center;">
                <div style="display:inline-block;background:rgba(255,255,255,0.2);padding:8px 18px;border-radius:30px;margin-bottom:12px;">
                  <span style="color:#FFFFFF;font-size:14px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">⚠️ ${appName} Payment Notice</span>
                </div>
                <h1 style="color:#FFFFFF;font-size:26px;font-weight:800;margin:0 0 8px 0;letter-spacing:-0.5px;">Payment Incomplete</h1>
                <p style="color:#FEE2E2;font-size:15px;margin:0;font-weight:500;">No coins were charged or deducted</p>
              </td>
            </tr>

            <!-- Content Area -->
            <tr>
              <td style="padding:32px;">
                
                <p style="font-size:15px;line-height:1.6;color:#334155;margin:0 0 20px 0;">
                  Hi <strong>${userName}</strong>,<br/>
                  We noticed that your recent payment attempt of <strong>₹${amount}</strong> for <strong>${order?.packageName || 'Coins Bundle'}</strong> could not be completed.
                </p>

                <!-- Failure Reason Banner -->
                <div style="background:#FEF2F2;border-left:4px solid #EF4444;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
                  <div style="font-size:12px;font-weight:700;color:#991B1B;text-transform:uppercase;margin-bottom:4px;">Reason for Failure / Cancellation:</div>
                  <div style="font-size:14px;color:#B91C1C;font-weight:600;">${failureReason}</div>
                </div>

                <!-- 100% AUTO-REFUND SHIELD CARD -->
                <table width="100%" border="0" cellpadding="0" cellspacing="0" style="background:#ECFDF5;border:2px solid #10B981;border-radius:14px;margin-bottom:24px;overflow:hidden;">
                  <tr>
                    <td style="padding:18px 22px;">
                      <div style="display:flex;align-items:center;margin-bottom:8px;">
                        <span style="font-size:22px;margin-right:10px;">🛡️</span>
                        <strong style="color:#065F46;font-size:15px;font-weight:800;">100% Auto-Refund Protection Guarantee</strong>
                      </div>
                      <p style="color:#047857;font-size:13px;line-height:1.6;margin:0;">
                        If any money was debited from your bank account, card, or UPI app, <strong>it was NOT captured by us</strong>. Your bank or payment gateway will automatically reverse the full amount back to your source account within <strong>2–24 hours</strong> (maximum 2–3 business days).
                      </p>
                    </td>
                  </tr>
                </table>

                <!-- Order Details Summary -->
                <table width="100%" border="0" cellpadding="0" cellspacing="0" style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:14px;margin-bottom:24px;">
                  <tr>
                    <td style="padding:16px 20px;">
                      <table width="100%" border="0" cellpadding="0" cellspacing="0">
                        <tr>
                          <td style="padding:6px 0;color:#64748B;font-size:13px;width:38%;">Customer Name:</td>
                          <td style="padding:6px 0;color:#0F172A;font-size:13px;font-weight:600;">${userName}</td>
                        </tr>
                        <tr>
                          <td style="padding:6px 0;color:#64748B;font-size:13px;">Customer Email:</td>
                          <td style="padding:6px 0;color:#0F172A;font-size:13px;font-family:monospace;">${userEmail}</td>
                        </tr>
                        <tr>
                          <td style="padding:6px 0;color:#64748B;font-size:13px;">Order Reference:</td>
                          <td style="padding:6px 0;color:#EF4444;font-size:13px;font-family:monospace;font-weight:700;">#${orderId}</td>
                        </tr>
                        <tr>
                          <td style="padding:6px 0;color:#64748B;font-size:13px;">Attempted Amount:</td>
                          <td style="padding:6px 0;color:#0F172A;font-size:13px;font-weight:700;">₹${amount}</td>
                        </tr>
                        <tr>
                          <td style="padding:6px 0;color:#64748B;font-size:13px;">Date & Time:</td>
                          <td style="padding:6px 0;color:#0F172A;font-size:13px;">${dateStr}</td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>

                <!-- Tips to Retry -->
                <div style="background:#F1F5F9;border-radius:12px;padding:16px 20px;margin-bottom:24px;">
                  <div style="font-size:13px;font-weight:700;color:#1E293B;margin-bottom:8px;">💡 Quick tips for your next attempt:</div>
                  <ul style="margin:0;padding-left:18px;color:#475569;font-size:12.5px;line-height:1.7;">
                    <li>Ensure your UPI app (GPay, PhonePe, Paytm) has sufficient balance.</li>
                    <li>Check if your bank card has online / e-commerce transactions enabled.</li>
                    <li>You can also try using a direct UPI ID (e.g. <code>success@razorpay</code> for testing).</li>
                  </ul>
                </div>

                <p style="font-size:13.5px;color:#64748B;text-align:center;margin:0;">
                  You can try placing your order again anytime by opening the app.
                </p>

              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="background:#F8FAFC;padding:24px 32px;text-align:center;border-top:1px solid #E2E8F0;">
                <p style="color:#64748B;font-size:12px;line-height:1.6;margin:0 0 6px 0;">
                  Official automated notification from <strong>${appName} Billing</strong>.
                </p>
                <p style="color:#94A3B8;font-size:11.5px;margin:0;">
                  Need assistance? Contact our team at <a href="mailto:support@vibechat.app" style="color:#4F46E5;text-decoration:none;">support@vibechat.app</a>
                </p>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </body>
  </html>
  `;

  return { subject, text, html };
}
