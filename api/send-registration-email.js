/**
 * Vercel Serverless Function — Registration Confirmation Email
 *
 * Required environment variables (set in Vercel dashboard):
 *   RESEND_API_KEY  — API key from https://resend.com
 *   EMAIL_FROM      — Verified sender address, e.g. "Science Fair <noreply@yourdomain.com>"
 *                     For testing you can use "onboarding@resend.dev" (Resend sandbox)
 *   VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — already set for the build; reused here to look
 *                     up the school's name and logo (SUPABASE_URL / SUPABASE_ANON_KEY also accepted).
 *
 * POST /api/send-registration-email
 * Body: { studentEmail, advisorEmail, studentName, regNumber, projectTitle, category, division, schoolId }
 *
 * The school's name and logo are looked up HERE from schoolId (public data) — never taken from
 * the request — so an email can only carry the branding that school actually set (migration
 * 2026-10l). Without a school (or if the lookup fails) the email is sent unbranded.
 */
const APP_ORIGIN = "https://qritiko.com";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// Keep in step with LEGACY_LOGOS in src/ScienceFairJudging.jsx.
const LEGACY_LOGOS = {
  "5667eba1-2f45-4830-96b7-6a6467113dfc": {
    slug: "dishchiibikoh-community-school", path: "builtin:dishchiibikoh", src: "/branding/dishchiibikoh-logo.png",
  },
};

// Everything placed into the HTML goes through this — form fields are typed by students.
export function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// → { name, logoUrl } for the school, or empty strings. Never throws.
export async function loadSchoolBranding(schoolId, env = process.env) {
  const base = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
  const key  = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY;
  const none = { name: "", logoUrl: "" };
  if (!base || !key || !UUID_RE.test(String(schoolId || ""))) return none;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 4000);
  const get = async (path) => {
    const r = await fetch(`${base}/rest/v1/${path}`, { headers: { apikey: key, Authorization: `Bearer ${key}` }, signal: ctl.signal });
    return r.ok ? r.json() : [];
  };
  try {
    const [schools, rows] = await Promise.all([
      get(`schools?id=eq.${schoolId}&select=id,name,slug`),
      get(`school_branding?school_id=eq.${schoolId}&select=logo_path`).catch(() => []),
    ]);
    const school = Array.isArray(schools) ? schools[0] : null;
    if (!school || school.id !== schoolId) return none;
    const path = (Array.isArray(rows) ? rows[0]?.logo_path : null) || "";
    let logoUrl = "";
    if (path.startsWith(`${schoolId}/`)) {
      logoUrl = `${base}/storage/v1/object/public/school-branding/${path.split("/").map(encodeURIComponent).join("/")}`;
    } else if (path.startsWith("builtin:")) {
      const l = LEGACY_LOGOS[schoolId];
      if (l && l.slug === school.slug && l.path === path) logoUrl = `${APP_ORIGIN}${l.src}`;
    }
    return { name: String(school.name || ""), logoUrl };
  } catch {
    return none;
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { studentEmail, advisorEmail, studentName, regNumber, projectTitle, category, division, schoolId } = req.body || {};

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
  const { name: schoolName, logoUrl } = await loadSchoolBranding(schoolId);

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
            ${logoUrl
              ? `<img src="${esc(logoUrl)}" alt="${esc(schoolName ? `${schoolName} logo` : "School logo")}" width="64" height="64"
                  style="width:64px;height:64px;object-fit:contain;background:#ffffff;border-radius:12px;padding:6px;margin-bottom:10px;">`
              : `<div style="font-size:2.5rem;margin-bottom:8px;">🔬</div>`}
            <div style="font-family:Georgia,serif;font-size:1.35rem;font-weight:700;color:#ffffff;margin-bottom:4px;">
              Science Fair SY 2025-2026
            </div>
            ${schoolName ? `<div style="font-size:.85rem;color:rgba(255,255,255,.7);">${esc(schoolName)}</div>` : ""}
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
                    ${esc(regNumber)}
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
                  <span style="font-weight:600;font-size:.9rem;">${esc(studentName)}</span>
                </td>
              </tr>
              <tr>
                <td style="padding:4px 0;">
                  <span style="color:#64748b;font-size:.82rem;display:inline-block;width:130px;">Project Title</span>
                  <span style="font-weight:600;font-size:.9rem;">${esc(projectTitle)}</span>
                </td>
              </tr>
              <tr>
                <td style="padding:4px 0;">
                  <span style="color:#64748b;font-size:.82rem;display:inline-block;width:130px;">Category</span>
                  <span style="font-weight:600;font-size:.9rem;">${esc(category)}</span>
                </td>
              </tr>
              <tr>
                <td style="padding:4px 0;">
                  <span style="color:#64748b;font-size:.82rem;display:inline-block;width:130px;">Division</span>
                  <span style="font-weight:600;font-size:.9rem;">${esc(division)}</span>
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
                  <strong style="font-family:monospace;">&nbsp;${esc(regNumber)}&nbsp;</strong>
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
              Thank you for participating in the Science Fair SY 2025-2026!
              ${schoolName ? `<br><strong style="color:#1e3a5f;">${esc(schoolName)}</strong>` : ""}
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
