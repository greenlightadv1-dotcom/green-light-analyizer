import { redirect } from "next/navigation";

/**
 * Self-registration was removed (2026-11-02): no account may exist before a
 * reviewer approves the application. Old links land on Get Started.
 */
export default function RegisterPage() {
  redirect("/get-started");
}
