import type { InvestigationInput } from "@/lib/domain/content";
import { chatMessageStore } from "./chat-message-store";
import { distributedCache } from "./distributed-cache";
import { jobQueue } from "./job-queue";
import { newsFeed } from "./news-feed";
import { notificationSystem } from "./notification-system";
import { paymentWorkflow } from "./payment-workflow";
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
  notificationSystem,
  paymentWorkflow,
  distributedCache,
  chatMessageStore,
  realtimeCollaboration,
  shardLiveDatabase,
];
