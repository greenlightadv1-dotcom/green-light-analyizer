export function Alert({
  tone = "error",
  children,
}: {
  tone?: "error" | "info";
  children: React.ReactNode;
}) {
  const styles =
    tone === "error"
      ? "border-red-400/30 bg-red-500/10 text-red-700 dark:text-red-200"
      : "border-brand-green/25 bg-brand-green/10 text-brand-green";

  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={`rounded-xl border px-3.5 py-2.5 text-sm ${styles}`}
    >
      {children}
    </p>
  );
}
