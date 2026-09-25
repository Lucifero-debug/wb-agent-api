import { redirect } from "next/navigation";
import Link from "next/link";

import { isAuthenticated } from "@/lib/auth";
import { business, withArticle } from "@/lib/business";
import { listLeads, type Lead } from "@/lib/leads";
import { businessPhoneId } from "@/lib/tenant";
import { logout, updateStatus } from "./actions";
import { AutoRefresh } from "./auto-refresh";

export const metadata = { title: "Leads" };

// Leads change whenever a customer messages, so there is nothing here
// worth caching between requests.
export const dynamic = "force-dynamic";

function ago(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);

  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;

  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;

  return `${Math.round(hours / 24)}d ago`;
}

const intentStyles: Record<string, string> = {
  booking: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  complaint: "bg-red-500/10 text-red-700 dark:text-red-400",
  enquiry: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  other: "bg-black/5 text-black/60 dark:bg-white/10 dark:text-white/60",
};

// A dash reads better than an empty cell, and makes "the model did not
// capture this" visible rather than looking like a rendering bug.
function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-black/40 dark:text-white/40">
        {label}
      </div>
      <div className="mt-0.5 text-sm">
        {value ?? <span className="text-black/30 dark:text-white/30">—</span>}
      </div>
    </div>
  );
}

function StatusButton({
  id,
  status,
  label,
}: {
  id: string;
  status: string;
  label: string;
}) {
  return (
    <form action={updateStatus}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <button
        type="submit"
        className="rounded-md border border-black/15 px-2.5 py-1 text-xs font-medium transition-colors hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
      >
        {label}
      </button>
    </form>
  );
}

function LeadCard({ lead }: { lead: Lead }) {
  return (
    <li className="rounded-lg border border-black/10 p-4 dark:border-white/15">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium">
              {lead.name ?? (
                <span className="text-black/40 dark:text-white/40">
                  Name not given
                </span>
              )}
            </span>

            <span
              className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
                intentStyles[lead.intent] ?? intentStyles.other
              }`}
            >
              {lead.intent}
            </span>

            {lead.status === "contacted" && (
              <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
                contacted
              </span>
            )}

            {lead.status === "closed" && (
              <span className="rounded bg-black/5 px-1.5 py-0.5 text-[11px] font-medium text-black/50 dark:bg-white/10 dark:text-white/50">
                closed
              </span>
            )}

            {lead.botPaused && (
              <span className="rounded bg-violet-500/10 px-1.5 py-0.5 text-[11px] font-medium text-violet-700 dark:text-violet-400">
                staff handling
              </span>
            )}
          </div>

          {/* Replies go from the business's number via the chat page. A
              wa.me link would open the chat from whoever's personal
              WhatsApp is on this device — the customer would get a
              stranger's number. */}
          <div className="mt-1 flex items-center gap-3 text-sm">
            <span className="font-mono text-black/60 dark:text-white/60">
              +{lead.customerWaId}
            </span>
            <Link
              href={`/leads/chat/${lead.customerWaId}`}
              className="font-medium underline-offset-2 hover:underline"
            >
              Open chat →
            </Link>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-black/40 dark:text-white/40">
            {ago(lead.updatedAt)}
          </span>

          {lead.status !== "contacted" && (
            <StatusButton id={lead.id} status="contacted" label="Contacted" />
          )}
          {lead.status !== "closed" ? (
            <StatusButton id={lead.id} status="closed" label="Close" />
          ) : (
            <StatusButton id={lead.id} status="new" label="Reopen" />
          )}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Field label={business.request.whatLabel} value={lead.service} />
        <Field label={business.request.whenLabel} value={lead.preferredTime} />
        <Field label="Notes" value={lead.notes} />
      </div>
    </li>
  );
}

export default async function LeadsPage({ searchParams }: PageProps<"/leads">) {
  if (!(await isAuthenticated())) {
    redirect("/leads/login");
  }

  const params = await searchParams;
  const includeClosed = params.closed === "1";

  const leads = await listLeads(businessPhoneId(), { includeClosed });

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
      <AutoRefresh seconds={30} />

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            {business.name}
          </h1>
          <p className="mt-1 text-sm text-black/60 dark:text-white/60">
            {leads.length} {includeClosed ? "total" : "open"}{" "}
            {leads.length === 1 ? "lead" : "leads"}
          </p>
        </div>

        <div className="flex items-center gap-3 text-sm">
          <Link
            href={includeClosed ? "/leads" : "/leads?closed=1"}
            className="text-black/60 underline-offset-2 hover:underline dark:text-white/60"
          >
            {includeClosed ? "Hide closed" : "Show closed"}
          </Link>

          <form action={logout}>
            <button
              type="submit"
              className="text-black/60 underline-offset-2 hover:underline dark:text-white/60"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>

      {leads.length === 0 ? (
        <p className="mt-10 rounded-lg border border-dashed border-black/15 p-8 text-center text-sm text-black/50 dark:border-white/20 dark:text-white/50">
          No leads yet. They appear here as soon as someone asks for{" "}
          {withArticle(business.request.noun)} on WhatsApp.
        </p>
      ) : (
        <ul className="mt-6 flex flex-col gap-3">
          {leads.map((lead) => (
            <LeadCard key={lead.id} lead={lead} />
          ))}
        </ul>
      )}
    </main>
  );
}
