import { RuleForm } from "@/components/rules/rule-form";

export default async function EditRulePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <RuleForm ruleId={id} />;
}
