import type { InvestigationInput } from "@/lib/domain/content";
import { chatMessageStore } from "./chat-message-store";
import { distributedCache } from "./distributed-cache";
import { jobQueue } from "./job-queue";
import { liveQueries } from "./live-queries";
import { newsFeed } from "./news-feed";
import { notificationSystem } from "./notification-system";
import { paymentWorkflow } from "./payment-workflow";
import { productAnalytics } from "./product-analytics";
import { rateLimiter } from "./rate-limiter";
import { realtimeCollaboration } from "./realtime-collaboration";
import { shardLiveDatabase } from "./shard-live-database";
import { urlShortener } from "./url-shortener";
import { videoPipeline } from "./video-pipeline";

/** Ordered as a path: foundational first, then increasingly subtle failure semantics. */
export const allInvestigations: InvestigationInput[] = [
  urlShortener,
  videoPipeline,
  rateLimiter,
  newsFeed,
  jobQueue,
  productAnalytics,
  notificationSystem,
  paymentWorkflow,
  distributedCache,
  chatMessageStore,
  realtimeCollaboration,
  liveQueries,
  shardLiveDatabase,
];
