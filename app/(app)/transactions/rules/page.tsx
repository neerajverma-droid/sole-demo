import type { Metadata } from "next";

import { RulesScreen } from "@/components/rules/rules-screen";

export const metadata: Metadata = {
  title: "Matching rules · Sole",
};

export default function MatchingRulesPage() {
  return <RulesScreen />;
}
