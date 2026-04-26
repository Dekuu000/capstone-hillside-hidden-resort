import type { PricingRecommendation } from "../../packages/shared/src/types";

export function getAiSource(recommendation: PricingRecommendation | null): "fallback" | "live" | null {
  if (!recommendation) return null;
  const explains = recommendation.explanations.map((item) => item.toLowerCase());
  return explains.some((item) => item.includes("fallback")) ? "fallback" : "live";
}
