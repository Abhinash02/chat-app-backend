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
