/**
 * Vercel Serverless Function — Registration Confirmation Email
 *
 * Required environment variables (set in Vercel dashboard):
 *   RESEND_API_KEY  — API key from https://resend.com
 *   EMAIL_FROM      — Verified sender address, e.g. "Science Fair <noreply@yourdomain.com>"
 *                     For testing you can use "onboarding@resend.dev" (Resend sandbox)
 *
 * POST /api/send-registration-email
 * Body: { studentEmail, studentName, regNumber, projectTitle, category, division }
 */
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { studentEmail, advisorEmail, studentName, regNumber, projectTitle, category, division } = req.body || {};

  if (!studentEmail || !studentName || !regNumber || !projectTitle) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) {
    // Email service not configured — log and return success so form submission still works
    console.warn("RESEND_API_KEY not set — skipping confirmation email");
    return res.status(200).json({ success: true, skipped: true });
  }

  const FROM = process.env.EMAIL_FROM || "onboarding@resend.dev";

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:'Source Sans 3',Arial,sans-serif;color:#1e293b;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;background:#ffffff;border-radius:16px;border:1px solid #e2e8f0;overflow:hidden;">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#1e3a5f,#2d5a8e);padding:28px 32px;text-align:center;">
            <div style="font-size:2.5rem;margin-bottom:8px;">🔬</div>
            <div style="font-family:Georgia,serif;font-size:1.35rem;font-weight:700;color:#ffffff;margin-bottom:4px;">
              Science Fair SY 2025-2026
            </div>
            <div style="font-size:.85rem;color:rgba(255,255,255,.7);">Dishchiibikoh Community School</div>
          </td>
        </tr>

        <!-- Registration number -->
        <tr>
          <td style="padding:28px 32px 0;">
            <table width="100%" cellpadding="0" cellspacing="0"
              style="background:#f0fdf4;border:1px solid #059669;border-radius:12px;padding:20px;">
              <tr>
                <td style="text-align:center;">
                  <div style="font-size:.72rem;letter-spacing:.12em;text-transform:uppercase;color:#059669;margin-bottom:8px;font-weight:600;">
                    Your Registration Number
                  </div>
                  <div style="font-family:'DM Mono',monospace,Courier New;font-size:2rem;font-weight:700;color:#1e3a5f;letter-spacing:.05em;">
                    ${regNumber}
                  </div>
                  <div style="font-size:.78rem;color:#64748b;margin-top:8px;">
                    Write this number on your project trifold board
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Project details -->
        <tr>
          <td style="padding:20px 32px 0;">
            <table width="100%" cellpadding="0" cellspacing="0"
              style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px;">
              <tr>
                <td style="font-size:.72rem;letter-spacing:.1em;text-transform:uppercase;color:#64748b;padding-bottom:12px;font-weight:600;">
                  Registered Project
                </td>
              </tr>
              <tr>
                <td style="padding:4px 0;">
                  <span style="color:#64748b;font-size:.82rem;display:inline-block;width:130px;">Student Name</span>
                  <span style="font-weight:600;font-size:.9rem;">${studentName}</span>
                </td>
              </tr>
              <tr>
                <td style="padding:4px 0;">
                  <span style="color:#64748b;font-size:.82rem;display:inline-block;width:130px;">Project Title</span>
                  <span style="font-weight:600;font-size:.9rem;">${projectTitle}</span>
                </td>
              </tr>
              <tr>
                <td style="padding:4px 0;">
                  <span style="color:#64748b;font-size:.82rem;display:inline-block;width:130px;">Category</span>
                  <span style="font-weight:600;font-size:.9rem;">${category}</span>
                </td>
              </tr>
              <tr>
                <td style="padding:4px 0;">
                  <span style="color:#64748b;font-size:.82rem;display:inline-block;width:130px;">Division</span>
                  <span style="font-weight:600;font-size:.9rem;">${division}</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Important reminder -->
        <tr>
          <td style="padding:20px 32px 0;">
            <table width="100%" cellpadding="0" cellspacing="0"
              style="background:#fffbeb;border:1px solid #d97706;border-radius:12px;padding:14px 16px;">
              <tr>
                <td style="font-size:.88rem;color:#92400e;line-height:1.6;">
                  <strong>Important:</strong> Please write your registration number
                  <strong style="font-family:monospace;">&nbsp;${regNumber}&nbsp;</strong>
                  on your project trifold board and bring it to the venue on event day.
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:24px 32px;text-align:center;border-top:1px solid #e2e8f0;margin-top:20px;">
            <div style="font-size:.82rem;color:#64748b;line-height:1.8;">
              Thank you for participating in the Science Fair SY 2025-2026!<br>
              <strong style="color:#1e3a5f;">Dishchiibikoh Community School</strong>
            </div>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const recipients = [studentEmail];
  if (advisorEmail && advisorEmail.toLowerCase() !== studentEmail.toLowerCase()) {
    recipients.push(advisorEmail);
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM,
        to: recipients,
        subject: `Science Fair Registration Confirmed — ${regNumber}`,
        html,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      console.error("Resend API error:", err);
      return res.status(500).json({ error: "Email delivery failed", details: err });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("Email handler error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
