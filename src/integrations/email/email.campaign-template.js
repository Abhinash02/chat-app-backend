/**
 * Wraps admin-authored HTML in a shell that gives every promotional email the
 * things it legally and practically needs: a sender identity, an unsubscribe
 * link, and a layout that survives Outlook.
 *
 * Email clients strip <style> blocks and ignore most modern CSS, so everything
 * here is inline styles on tables — the ugly-but-correct way to build email.
 */
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function wrapCampaignHtml({ bodyHtml, appName, preheader, unsubscribeUrl, supportEmail, colors = {} }) {
  const primary = colors.primary ?? '#FF4E88';
  const background = '#f4f2f9';
  const surface = '#ffffff';
  const textMuted = '#8d83b6';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(appName)}</title>
</head>
<body style="margin:0;padding:0;background:${background};">
  <!-- Preheader: shown next to the subject in the inbox, hidden in the body. -->
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader ?? '')}</div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${background};padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${surface};border-radius:16px;overflow:hidden;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
          <tr>
            <td style="padding:20px 28px;background:${primary};">
              <span style="font-size:18px;font-weight:700;color:#ffffff;">${escapeHtml(appName)}</span>
            </td>
          </tr>
          <tr>
            <td style="padding:28px;font-size:15px;line-height:1.6;color:#2c2740;">
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 28px;border-top:1px solid #eceaf5;font-size:12px;line-height:1.6;color:${textMuted};">
              <p style="margin:0 0 8px;">
                You are receiving this because you have a ${escapeHtml(appName)} account.
              </p>
              <p style="margin:0;">
                <a href="${unsubscribeUrl}" style="color:${textMuted};text-decoration:underline;">Unsubscribe from promotional emails</a>
                ${supportEmail ? ` &middot; <a href="mailto:${escapeHtml(supportEmail)}" style="color:${textMuted};text-decoration:underline;">Contact support</a>` : ''}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Substitutes `{{name}}`-style placeholders.
 *
 * Values are HTML-escaped: a nickname is user-authored text, and dropping it
 * unescaped into an email is how one user's display name becomes markup in
 * everyone else's inbox.
 */
export function renderTemplate(html, variables = {}) {
  return String(html).replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key) =>
    Object.hasOwn(variables, key) ? escapeHtml(variables[key]) : match,
  );
}

/** Built-in starting points, seeded on first boot. */
export const SYSTEM_EMAIL_TEMPLATES = [
  {
    slug: 'promo-coins',
    name: 'Coin offer',
    description: 'Promote a coin pack or a limited-time discount.',
    subject: 'More coins, same price 🎁',
    preheader: 'A little something to keep the conversation going.',
    variables: ['name', 'coinBalance'],
    html: `<p style="margin:0 0 14px;">Hi {{name}},</p>
<p style="margin:0 0 14px;">You have <strong>{{coinBalance}} coins</strong> left. Top up today and get more talking time for the same price.</p>
<p style="margin:0 0 22px;">Offer ends this weekend.</p>
<p style="margin:0;"><a href="#" style="display:inline-block;background:#FF4E88;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600;">Get coins</a></p>`,
  },
  {
    slug: 'win-back',
    name: 'Come back',
    description: 'For people who have not opened the app in a while.',
    subject: 'People are waiting to chat with you',
    preheader: 'Your conversations are still there.',
    variables: ['name'],
    html: `<p style="margin:0 0 14px;">Hi {{name}},</p>
<p style="margin:0 0 14px;">It has been a while. New people have joined since you were last here, and your old conversations are exactly where you left them.</p>
<p style="margin:0;"><a href="#" style="display:inline-block;background:#FF4E88;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600;">Open the app</a></p>`,
  },
  {
    slug: 'announcement',
    name: 'Announcement',
    description: 'A plain, flexible layout for news and updates.',
    subject: 'Something new in the app',
    preheader: 'A quick update from the team.',
    variables: ['name'],
    html: `<p style="margin:0 0 14px;">Hi {{name}},</p>
<p style="margin:0 0 14px;">Write your announcement here.</p>
<p style="margin:0;">— The team</p>`,
  },
];
