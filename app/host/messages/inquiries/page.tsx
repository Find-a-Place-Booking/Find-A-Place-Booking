import Link from "next/link";

import { DashboardShell } from "@/components/DashboardShell";
import { getHostProfileInquiries } from "@/lib/host/inquiries";

import {
  markHostProfileInquiryRead,
  replyToHostProfileInquiry,
} from "./actions";
import styles from "./inquiries.module.css";

function stamp(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export default async function HostInquiryPage({
  searchParams,
}: {
  searchParams: Promise<{
    inquiry?: string;
    saved?: string;
    error?: string;
  }>;
}) {
  const [inquiries, params] = await Promise.all([
    getHostProfileInquiries(),
    searchParams,
  ]);

  const selected =
    inquiries.find((inquiry) => inquiry.id === params.inquiry) ??
    inquiries[0] ??
    null;

  const unreadCount = inquiries.filter(
    (inquiry) => !inquiry.readByHostAt,
  ).length;

  return (
    <DashboardShell
      active="Inquiries"
      title="Pre-booking inquiries"
      eyebrow="Guest communication"
    >
      <div className={styles.toolbar}>
        <div>
          <p>
            Questions sent from public host profiles appear here. Reservation
            messages stay in the normal booking messenger.
          </p>
        </div>
        <Link className="button button-small button-quiet" href="/host/messages">
          Booking messages →
        </Link>
      </div>

      {params.saved ? (
        <div className="admin-message success">{params.saved}</div>
      ) : null}
      {params.error ? (
        <div className="admin-message error">{params.error}</div>
      ) : null}

      <div className={styles.metrics}>
        <div>
          <span>Open inquiries</span>
          <strong>{inquiries.length}</strong>
        </div>
        <div>
          <span>Unread</span>
          <strong>{unreadCount}</strong>
        </div>
      </div>

      {selected ? (
        <div className={styles.inbox}>
          <aside className={styles.list}>
            {inquiries.map((inquiry) => (
              <Link
                className={`${styles.listItem} ${
                  selected.id === inquiry.id ? styles.active : ""
                } ${!inquiry.readByHostAt ? styles.unread : ""}`}
                href={`/host/messages/inquiries?inquiry=${inquiry.id}`}
                key={inquiry.id}
              >
                <div>
                  <strong>{inquiry.guestName}</strong>
                  {!inquiry.readByHostAt ? <b>New</b> : null}
                </div>
                <span>{inquiry.propertyName || "General host question"}</span>
                <small>{stamp(inquiry.createdAt)}</small>
              </Link>
            ))}
          </aside>

          <section className={styles.thread}>
            <div className={styles.threadHead}>
              <div>
                <p className="eyebrow dark">Pre-booking inquiry</p>
                <h2>{selected.guestName}</h2>
                <span>{selected.guestEmail}</span>
              </div>
              <span className="status-pill status-muted">
                {selected.status}
              </span>
            </div>

            {selected.propertyName ? (
              <div className={styles.propertyLine}>
                <span>Question about</span>
                {selected.propertySlug ? (
                  <Link href={`/stays/${selected.propertySlug}`}>
                    {selected.propertyName} →
                  </Link>
                ) : (
                  <strong>{selected.propertyName}</strong>
                )}
              </div>
            ) : null}

            <article className={styles.guestMessage}>
              <small>
                {selected.guestName} · {stamp(selected.createdAt)}
              </small>
              <p>{selected.message}</p>
            </article>

            {selected.hostReply ? (
              <article className={styles.hostMessage}>
                <small>
                  Your reply
                  {selected.repliedAt
                    ? ` · ${stamp(selected.repliedAt)}`
                    : ""}
                </small>
                <p>{selected.hostReply}</p>
              </article>
            ) : null}

            {!selected.readByHostAt ? (
              <form action={markHostProfileInquiryRead}>
                <input
                  type="hidden"
                  name="inquiry_id"
                  value={selected.id}
                />
                <button className="button button-small button-quiet" type="submit">
                  Mark read
                </button>
              </form>
            ) : null}

            <form className={styles.replyForm} action={replyToHostProfileInquiry}>
              <input
                type="hidden"
                name="inquiry_id"
                value={selected.id}
              />
              <label>
                <span>
                  {selected.hostReply ? "Send an updated reply" : "Reply to guest"}
                </span>
                <textarea
                  name="reply"
                  rows={5}
                  maxLength={4000}
                  defaultValue={selected.hostReply || ""}
                  placeholder="Answer their question here. Find A Place emails the reply without exposing your private account email or phone."
                  required
                />
              </label>
              <div>
                <small>
                  The guest receives the reply by email from Find A Place.
                </small>
                <button className="button button-small" type="submit">
                  Send reply
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : (
        <section className="panel">
          <div className="panel-empty panel-empty-large">
            <strong>No pre-booking inquiries yet.</strong>
            <span>
              Messages sent from public host profiles will appear here.
            </span>
          </div>
        </section>
      )}
    </DashboardShell>
  );
}
