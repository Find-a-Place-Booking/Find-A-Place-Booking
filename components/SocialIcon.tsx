type SocialNetwork = "facebook" | "instagram" | "tiktok" | "lemon8";

const iconStyle = {
  width: 16,
  height: 16,
  minWidth: 16,
  minHeight: 16,
  maxWidth: 16,
  maxHeight: 16,
  display: "block",
  flex: "0 0 16px",
} as const;

export function SocialIcon({ network }: { network: SocialNetwork }) {
  if (network === "facebook") {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" focusable="false" style={iconStyle}>
        <path fill="currentColor" d="M13.7 22v-8.1h2.8l.4-3.2h-3.2V8.6c0-.9.3-1.6 1.6-1.6H17V4.1c-.3 0-1.3-.1-2.5-.1-2.5 0-4.2 1.5-4.2 4.3v2.4H7.5v3.2h2.8V22h3.4Z" />
      </svg>
    );
  }

  if (network === "instagram") {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" focusable="false" style={iconStyle}>
        <rect x="3.4" y="3.4" width="17.2" height="17.2" rx="5" ry="5" fill="none" stroke="currentColor" strokeWidth="2" />
        <circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="2" />
        <circle cx="17.7" cy="6.5" r="1.2" fill="currentColor" />
      </svg>
    );
  }

  if (network === "tiktok") {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" focusable="false" style={iconStyle}>
        <path fill="currentColor" d="M14.1 3h3c.2 1.6 1.1 2.8 2.9 3.6v3.1c-1.2 0-2.3-.3-3.3-.9v6.4c0 3.5-2.5 5.8-5.8 5.8-3 0-5.5-2.4-5.5-5.5 0-3.5 2.8-5.8 6.3-5.5v3.2c-1.8-.2-3.2.7-3.2 2.3 0 1.3 1 2.4 2.4 2.4 1.5 0 2.5-1 2.5-2.9V3h.7Z" />
      </svg>
    );
  }

  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" focusable="false" style={iconStyle}>
      <path fill="currentColor" d="M12 3.2c2.3 0 4.1 1.2 5.1 3.1 1.9 1 3.1 2.9 3.1 5.1 0 4.7-3.5 8.2-8.2 9.4-4.7-1.2-8.2-4.7-8.2-9.4 0-2.2 1.2-4.1 3.1-5.1 1-1.9 2.8-3.1 5.1-3.1Zm0 3.1c-1.5 0-2.7.8-3.3 2.1-1.2.5-2 1.6-2 3 0 2.8 2 5.1 5.3 6.2 3.3-1.1 5.3-3.4 5.3-6.2 0-1.4-.8-2.5-2-3-.6-1.3-1.8-2.1-3.3-2.1Z" />
    </svg>
  );
}
