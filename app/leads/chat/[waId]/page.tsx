// app/leads/chat/[waId]/page.tsx
//
// One customer's whole thread, plus the controls to take it over from the
// bot and reply as the clinic.

import { notFound, redirect } from "next/navigation";
import Link from "next/link";

import { isAuthenticated } from "@/lib/auth";
import { business } from "@/lib/business";
import {
  lastCustomerMessageAt,
  loadThread,
  withinServiceWindow,
  type ThreadMessage,
} from "@/lib/conversation";
import { PAUSE_HOURS, pausedUntil } from "@/lib/handoff";
import { businessPhoneId } from "@/lib/tenant";
import { handBack, takeOver } from "../../actions";
import { AutoRefresh } from "../../auto-refresh";
import { ReplyForm } from "./reply-form";

export const metadata = { title: "Conversation" };

export const dynamic = "force-dynamic";

// The clinic reads times in Delhi, whatever timezone the server runs in.
function when(iso: string | Date): string {
  return new Date(iso).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

const authorLabel: Record<ThreadMessage["role"], string> = {
  user: "Customer",
  assistant: "Bot",
  staff: "Staff",
};

const bubbleStyle: Record<ThreadMessage["role"], string> = {
  user: "bg-black/5 dark:bg-white/10",
  assistant: "border border-black/10 dark:border-white/15",
  staff: "bg-violet-500/10",
};

function Bubble({ m }: { m: ThreadMessage }) {
  const ours = m.role !== "user";

  return (
    <li className={`flex ${ours ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${bubbleStyle[m.role]}`}>
        <div className="whitespace-pre-wrap break-words">{m.content}</div>
        <div className="mt-1 text-[10px] text-black/40 dark:text-white/40">
          {authorLabel[m.role]} · {when(m.createdAt)}
        </div>
      </div>
    </li>
  );
}

export default async function ChatPage({
  params,
}: {
  params: Promise<{ waId: string }>;
}) {
  if (!(await isAuthenticated())) {
    redirect("/leads/login");
  }

  const { waId } = await params;

  if (!/^\d{6,20}$/.test(waId)) notFound();

  const biz = businessPhoneId();

  const [thread, until, lastIn] = await Promise.all([
    loadThread(biz, waId),
    pausedUntil(biz, waId),
    lastCustomerMessageAt(biz, waId),
  ]);

  // Scoped by business: a number that never wrote to this clinic shows
  // nothing, rather than an empty chat staff could type into.
  if (thread.length === 0) notFound();

  const paused = until !== null;
  const windowOpen = withinServiceWindow(lastIn);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-10 sm:px-6">
      <AutoRefresh seconds={10} />

      <Link
        href="/leads"
        className="text-sm text-black/60 underline-offset-2 hover:underline dark:text-white/60"
      >
        ← {business.name} leads
      </Link>

      <header className="mt-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-mono text-lg font-semibold">+{waId}</h1>
          <p className="mt-1 text-sm text-black/60 dark:text-white/60">
            {until
              ? `You're handling this chat. The bot stays silent until ${when(until)}.`
              : "The bot is replying to this customer."}
          </p>
        </div>

        <form action={paused ? handBack : takeOver}>
          <input type="hidden" name="waId" value={waId} />
          <button
            type="submit"
            className={
              paused
                ? "rounded-md border border-black/15 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
                : "rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background transition-opacity hover:opacity-85"
            }
          >
            {paused ? "Hand back to bot" : "Take over"}
          </button>
        </form>
      </header>

      {/* flex-col-reverse with the newest message first keeps the view
          pinned to the bottom, like a chat app, with no scroll script. */}
      <ul className="mt-6 flex max-h-[60vh] flex-col-reverse gap-2 overflow-y-auto rounded-lg border border-black/10 p-3 dark:border-white/15">
        {[...thread].reverse().map((m) => (
          <Bubble key={m.id} m={m} />
        ))}
      </ul>

      {windowOpen ? (
        <ReplyForm waId={waId} paused={paused} pauseHours={PAUSE_HOURS} />
      ) : (
        <p className="mt-4 rounded-lg border border-dashed border-black/15 p-4 text-sm text-black/60 dark:border-white/20 dark:text-white/60">
          More than 24 hours since this customer last wrote, so WhatsApp only
          allows pre-approved template messages now. Call them on +{waId}{" "}
          instead — or reply here as soon as they message again.
        </p>
      )}
    </main>
  );
}
