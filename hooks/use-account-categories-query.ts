"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchRuleCategories } from "@/lib/rules";

/**
 * The chart of accounts, narrowed to one top-level category.
 *
 * The expense and asset importers both take a category *name* from the file
 * and have to turn it into an `account_subcategory_id` — the same job the
 * rule form already does with `fetchRuleCategories`, so that's reused rather
 * than given a second fetcher. One query key, so opening both importers
 * costs one request.
 *
 * `parentName` matches the chart's own top-level names ("Expenses",
 * "Assets", "Income"), the same strings sole-webapp filters
 * `categories.expanse` on with `parent_category`. Income is there for the
 * bulk transaction importer's Sole Fields step, where a credit books to an
 * income account rather than an expense one.
 */
export function useAccountCategoriesQuery(
  parentName: "Expenses" | "Assets" | "Income",
) {
  return useQuery({
    queryKey: ["account-categories"],
    queryFn: fetchRuleCategories,
    // The chart of accounts is fixed, platform-wide data — refetching it
    // every time an importer opens is a request that can never say anything
    // new within a session.
    staleTime: Infinity,
    select: (categories) =>
      categories
        .filter((category) => category.parentName === parentName)
        .map((category) => ({ id: category.id, name: category.name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
  });
}
