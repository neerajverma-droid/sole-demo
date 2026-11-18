import type { Metadata } from "next";

import { RuleForm } from "@/components/rules/rule-form";

export const metadata: Metadata = {
  title: "Matching rule · Sole",
};

export default async function EditRulePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <RuleForm ruleId={id} />;
}
