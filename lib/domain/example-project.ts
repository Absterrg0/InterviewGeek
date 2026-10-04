import type { Project } from "./learner";

/**
 * A typical small SaaS: the kind of system many learners have actually built.
 * Offered as a starting point so the project workspace is never a blank form.
 */
export function exampleProject(id: string, now: string): Project {
  return {
    id,
    name: "Subscription SaaS (example)",
    summary:
      "A Next.js app with a Postgres database, Stripe subscriptions, a background job queue for emails and invoices, and file uploads to S3. Replace any part with how your own system works.",
    source: { type: "manual" },
    components: [
      { id: "web", label: "Next.js frontend", kind: "client", responsibility: "Pages, forms and the checkout redirect." },
      {
        id: "api",
        label: "API routes",
        kind: "service",
        responsibility: "Auth, account and billing endpoints, and the Stripe webhook handler.",
      },
      {
        id: "postgres",
        label: "Postgres",
        kind: "database",
        responsibility: "Users, teams, subscriptions and invoices.",
        durableState: "users, teams, subscriptions (status, stripe ids), invoices",
      },
      { id: "stripe", label: "Stripe", kind: "external", responsibility: "Checkout, subscriptions and payment events." },
      {
        id: "jobs",
        label: "Job queue",
        kind: "queue",
        responsibility: "Pending background jobs (pg-boss tables in the same Postgres).",
        durableState: "pending and retrying jobs",
      },
      {
        id: "worker",
        label: "Background worker",
        kind: "worker",
        responsibility: "Sends emails and renders invoice PDFs.",
      },
      {
        id: "s3",
        label: "S3",
        kind: "object-store",
        responsibility: "Avatars and invoice PDFs.",
        durableState: "avatars/{user}, invoices/{invoice}.pdf",
      },
      { id: "email", label: "Email provider", kind: "external", responsibility: "Delivers transactional email." },
    ],
    flows: [
      { id: "app-requests", from: "web", to: "api", label: "Sign up and upgrade plan", kind: "request" },
      { id: "read-write", from: "api", to: "postgres", label: "Read and write accounts", kind: "request" },
      { id: "checkout-session", from: "api", to: "stripe", label: "Create checkout session", kind: "request" },
      { id: "stripe-webhooks", from: "stripe", to: "api", label: "Subscription webhooks", kind: "async" },
      { id: "enqueue", from: "api", to: "jobs", label: "Enqueue welcome email and invoice", kind: "async" },
      { id: "claim-jobs", from: "worker", to: "jobs", label: "Claim jobs", kind: "request" },
      { id: "send-email", from: "worker", to: "email", label: "Send email", kind: "request" },
      { id: "store-invoice", from: "worker", to: "s3", label: "Store invoice PDF", kind: "data" },
    ],
    invariants: [
      {
        id: "one-active-subscription",
        statement: "A team has at most one active subscription",
        enforcedBy: ["postgres", "api"],
        mechanism: "",
      },
      {
        id: "paid-before-upgrade",
        statement: "A team is upgraded only after Stripe confirms payment",
        enforcedBy: ["api"],
        mechanism: "",
      },
    ],
    createdAt: now,
    updatedAt: now,
  };
}
