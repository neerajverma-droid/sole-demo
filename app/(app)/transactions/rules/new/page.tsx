import type { Metadata } from "next";

import { RuleForm } from "@/components/rules/rule-form";

export const metadata: Metadata = {
  title: "New matching rule · Sole",
};

export default function NewRulePage() {
  return <RuleForm />;
}
