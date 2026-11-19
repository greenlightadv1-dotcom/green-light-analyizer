export function Alert({
  tone = "error",
  children,
}: {
  tone?: "error" | "info";
  children: React.ReactNode;
}) {
  const styles =
    tone === "error"
      ? "border-danger/25 bg-danger/8 text-danger"
      : "border-forest/15 bg-forest-soft text-forest dark:text-info";

  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={`rounded-control border px-4 py-2.5 text-sm ${styles}`}
    >
      {children}
    </p>
  );
}
