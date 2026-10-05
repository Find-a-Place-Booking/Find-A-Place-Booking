export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    process.env.TZ =
      process.env.FAP_SERVER_TIME_ZONE?.trim() || "America/Chicago";
  }
}
