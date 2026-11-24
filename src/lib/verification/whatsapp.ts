import { ACTIVATION_TTL_HOURS } from "./tokens.ts";

/**
 * The applicant's WhatsApp number as wa.me wants it: international digits
 * only, no "+", no leading "00". Anything that is not 8–15 digits after that
 * is refused, so a malformed number never builds a link to someone else.
 * Pure — tested in whatsapp.test.ts.
 */
export function whatsappDigits(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let digits = raw.replace(/[\s().-]/g, "");
  if (digits.startsWith("+")) digits = digits.slice(1);
  else if (digits.startsWith("00")) digits = digits.slice(2);
  return /^[1-9]\d{7,14}$/.test(digits) ? digits : null;
}

/** The message the reviewer sends on WhatsApp: Arabic first, then English. */
export function activationWhatsAppText(link: string, hours: number = ACTIVATION_TTL_HOURS): string {
  return [
    "Green Light ✅",
    `تمت الموافقة على طلبك. افتح الرابط ده واختار كلمة السر عشان تفعّل حسابك (صالح ${hours} ساعة، ولمرة واحدة):`,
    link,
    "",
    `Your application is approved. Open this link to choose your password and activate your account (valid for ${hours} hours, single use):`,
    link,
  ].join("\n");
}

/** For an account that signed up itself: approved, sign in. No link that grants access, just the sign-in page. */
export function approvedWhatsAppText(loginUrl: string): string {
  return [
    "Green Light ✅",
    "تمت الموافقة على حسابك. تقدر تسجّل الدخول دلوقتي بإيميلك وكلمة السر اللي اخترتها:",
    loginUrl,
    "",
    "Your account is approved. You can sign in now with your email and the password you chose:",
    loginUrl,
  ].join("\n");
}
