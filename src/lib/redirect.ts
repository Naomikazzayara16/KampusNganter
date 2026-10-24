/** Hanya izinkan path internal sebagai tujuan setelah login (mencegah open redirect). */
export function safeNextPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return "/pesanan";
  }
  return value;
}
