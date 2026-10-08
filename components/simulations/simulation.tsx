import type { SimulationName } from "@/lib/domain/simulations";
import { CacheStampede } from "./cache-stampede";
import { ConsistentHashing } from "./consistent-hashing";
import { LeaseFencing } from "./lease-fencing";
import { RateLimitWindows } from "./rate-limit-windows";

/** The interactive widget for a lesson's simulation step. */
export function Simulation({ name }: { name: SimulationName }) {
  switch (name) {
    case "rate-limit-windows":
      return <RateLimitWindows />;
    case "lease-fencing":
      return <LeaseFencing />;
    case "cache-stampede":
      return <CacheStampede />;
    case "consistent-hashing":
      return <ConsistentHashing />;
  }
}
