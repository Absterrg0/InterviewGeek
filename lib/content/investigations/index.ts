import type { InvestigationInput } from "@/lib/domain/content";
import { notificationSystem } from "./notification-system";
import { paymentWorkflow } from "./payment-workflow";
import { rateLimiter } from "./rate-limiter";
import { realtimeCollaboration } from "./realtime-collaboration";
import { urlShortener } from "./url-shortener";
import { videoPipeline } from "./video-pipeline";

/** Ordered as a path: foundational first, then increasingly subtle failure semantics. */
export const allInvestigations: InvestigationInput[] = [
  urlShortener,
  videoPipeline,
  rateLimiter,
  notificationSystem,
  paymentWorkflow,
  realtimeCollaboration,
];
