"use client";

import * as React from "react";
import {
  Eye,
  EyeOff,
  ListTree,
  Lock,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyActions,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { MenuAction } from "@/components/ui/menu-action";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Shimmer } from "@/components/ui/shimmer";
import {
  HUG_COLUMN,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/layout/page-header";
import { StatusPill } from "@/components/admin/shared/status-pill";
import { AccountDialog } from "@/components/admin/chart-of-accounts/account-dialog";
import { CategoryDialog } from "@/components/admin/chart-of-accounts/category-dialog";
import {
  RetireAccountDialog,
  RetireCategoryDialog,
} from "@/components/admin/chart-of-accounts/retire-dialog";
import {
  useAdminChartCountriesQuery,
  useAdminChartQuery,
  useRestoreAccountMutation,
  useRestoreCategoryMutation,
} from "@/hooks/use-admin-chart-query";
import { apiErrorMessage } from "@/lib/api-error";
import { formatCount } from "@/lib/admin/format";
import {
  TAX_ROLE_LABELS,
  availabilityLabel,
  categoryRetireBlockedReason,
  nameIn,
  retireBlockedReason,
  type ChartAccount,
  type ChartCategory,
  type ChartCountry,
} from "@/lib/admin/chart-of-accounts";
import { cn } from "@/lib/utils";

const EVERY_COUNTRY = "__all__";

/**
 * The shared chart of accounts.
 *
 * One catalogue, not one per country — every journal line points at an account
 * id, and a dozen ids are named directly in Sole's code, so a chart that forked
 * per country would fork those too. What a super admin maintains here is
 * therefore what each country *calls* an account and where it is *offered*.
 *
 * The country picker is a preview, not a filter on edit: choosing New Zealand
 * shows the chart as a New Zealand business sees it, names and all. That is the
 * only way to check an override without signing in as someone.
 */
export function ChartOfAccountsScreen() {
  const [country, setCountry] = React.useState<string | null>(null);
  const [includeDeleted, setIncludeDeleted] = React.useState(false);
  const [search, setSearch] = React.useState("");

  const chart = useAdminChartQuery({ includeDeleted, country });
  const countriesQuery = useAdminChartCountriesQuery();
  const countries: ChartCountry[] = React.useMemo(() => countriesQuery.data ?? [], [countriesQuery.data]);

  const [editingAccount, setEditingAccount] = React.useState<ChartAccount | null>(null);
  const [accountOpen, setAccountOpen] = React.useState(false);
  const [addingUnder, setAddingUnder] = React.useState<number | null>(null);
  const [editingCategory, setEditingCategory] = React.useState<ChartCategory | null>(null);
  const [categoryOpen, setCategoryOpen] = React.useState(false);
  const [retiringAccount, setRetiringAccount] = React.useState<ChartAccount | null>(null);
  const [retiringCategory, setRetiringCategory] = React.useState<ChartCategory | null>(null);

  const categories = chart.data ?? [];
  const term = search.trim().toLowerCase();
  const shown = term
    ? categories
        .map((category) => ({
          ...category,
          accounts: category.accounts.filter(
            (account) =>
              account.name.toLowerCase().includes(term) ||
              account.code.toLowerCase().includes(term) ||
              Object.values(account.labels ?? {}).some((label) => label.toLowerCase().includes(term)),
          ),
        }))
        .filter((category) => category.accounts.length > 0 || category.name.toLowerCase().includes(term))
    : categories;
  /*
   * Nothing in this view of the chart at all — loaded, unsearched and empty,
   * never a failed fetch. There's nothing to search then. The country picker
   * and the retired toggle stay: they change what the chart holds rather
   * than narrowing it, and the toggle is the only way back to a retired
   * category to restore it.
   */
  const chartEmpty =
    chart.isSuccess && !chart.isPlaceholderData && !term && categories.length === 0;

  const openAccount = (account: ChartAccount | null, categoryId: number | null) => {
    setEditingAccount(account);
    setAddingUnder(categoryId);
    setAccountOpen(true);
  };
  const openCategory = (category: ChartCategory | null) => {
    setEditingCategory(category);
    setCategoryOpen(true);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon={ListTree}
        title="Chart of accounts"
        description="One catalogue shared by every country. What changes per country is what an account is called and whether it's offered there."
      >
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => openCategory(null)}>
            <Plus />
            Category
          </Button>
          <Button onClick={() => openAccount(null, categories[0]?.id ?? null)}>
            <Plus />
            Account
          </Button>
        </div>
      </PageHeader>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={country ?? EVERY_COUNTRY}
            onValueChange={(value) => setCountry(value === EVERY_COUNTRY ? null : value)}
          >
            <SelectTrigger className="w-56" aria-label="Preview the chart as a country sees it">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={EVERY_COUNTRY}>Every account</SelectItem>
              {countries.map((entry) => (
                <SelectItem key={entry.iso2} value={entry.iso2}>
                  As {entry.name} sees it
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant={includeDeleted ? "default" : "outline"}
            onClick={() => setIncludeDeleted((on) => !on)}
          >
            {includeDeleted ? <Eye /> : <EyeOff />}
            {includeDeleted ? "Showing retired" : "Show retired"}
          </Button>
        </div>
        {!chartEmpty && (
          <Input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name or code"
            aria-label="Search the chart of accounts"
            className="w-full lg:w-72"
          />
        )}
      </div>

      {country ? (
        <p className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
          Showing the chart as a business in{" "}
          <span className="font-medium text-foreground">
            {countries.find((entry) => entry.iso2 === country)?.name ?? country}
          </span>{" "}
          sees it — its own names, and only the accounts offered there.
        </p>
      ) : null}

      {chart.isError ? (
        <Empty>
          <EmptyMedia>
            <TriangleAlert />
          </EmptyMedia>
          <EmptyTitle>Couldn&apos;t load the chart</EmptyTitle>
          <EmptyDescription>
            {apiErrorMessage(chart.error, "The chart of accounts request didn't complete.")}
          </EmptyDescription>
          <EmptyActions>
            <Button onClick={() => chart.refetch()} disabled={chart.isFetching}>
              {chart.isFetching ? "Trying again…" : "Try again"}
            </Button>
          </EmptyActions>
        </Empty>
      ) : chart.isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }, (_, index) => (
            <Shimmer key={index} className="h-40 w-full rounded-lg" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <Empty>
          <EmptyMedia>
            <ListTree />
          </EmptyMedia>
          <EmptyTitle>{term ? "Nothing matches" : "The chart is empty"}</EmptyTitle>
          <EmptyDescription>
            {term ? `No account matches "${search.trim()}".` : "Add a category, then the accounts under it."}
          </EmptyDescription>
          {term ? (
            <EmptyActions>
              <Button variant="outline" onClick={() => setSearch("")}>
                Clear search
              </Button>
            </EmptyActions>
          ) : null}
        </Empty>
      ) : (
        <div className="space-y-5">
          {shown.map((category) => (
            <CategoryBlock
              key={category.id}
              category={category}
              countries={countries}
              previewCountry={country}
              onEditCategory={() => openCategory(category)}
              onRetireCategory={() => setRetiringCategory(category)}
              onAddAccount={() => openAccount(null, category.id)}
              onEditAccount={(account) => openAccount(account, category.id)}
              onRetireAccount={setRetiringAccount}
            />
          ))}
        </div>
      )}

      <AccountDialog
        account={editingAccount}
        categories={categories}
        countries={countries}
        defaultCategoryId={addingUnder}
        open={accountOpen}
        onOpenChange={setAccountOpen}
      />
      <CategoryDialog
        category={editingCategory}
        countries={countries}
        open={categoryOpen}
        onOpenChange={setCategoryOpen}
      />
      <RetireAccountDialog account={retiringAccount} onClose={() => setRetiringAccount(null)} />
      <RetireCategoryDialog category={retiringCategory} onClose={() => setRetiringCategory(null)} />
    </div>
  );
}

function CategoryBlock({
  category,
  countries,
  previewCountry,
  onEditCategory,
  onRetireCategory,
  onAddAccount,
  onEditAccount,
  onRetireAccount,
}: {
  category: ChartCategory;
  countries: ChartCountry[];
  previewCountry: string | null;
  onEditCategory: () => void;
  onRetireCategory: () => void;
  onAddAccount: () => void;
  onEditAccount: (account: ChartAccount) => void;
  onRetireAccount: (account: ChartAccount) => void;
}) {
  const restoreCategory = useRestoreCategoryMutation();
  const blocked = categoryRetireBlockedReason(category);
  const displayName = previewCountry ? nameIn(category, previewCountry) : category.name;

  return (
    <section className={cn("space-y-2", category.deleted && "opacity-60")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          {displayName}
          {category.deleted ? <StatusPill label="Retired" tone="neutral" /> : null}
          {category.countryIso2 ? (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
              {availabilityLabel(category, countries)} only
            </span>
          ) : null}
          <span className="text-xs font-normal text-muted-foreground">
            {category.accounts.length} {category.accounts.length === 1 ? "account" : "accounts"}
          </span>
        </h2>
        <div className="flex gap-2">
          {category.deleted ? (
            <Button
              variant="outline"
              size="sm"
              disabled={restoreCategory.isPending}
              onClick={() =>
                restoreCategory.mutate(category.id, {
                  onSuccess: () => toast.success(`${category.name} restored`),
                  onError: (error) =>
                    toast.error(apiErrorMessage(error, "That category couldn't be restored.")),
                })
              }
            >
              <RotateCcw />
              Restore
            </Button>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={onAddAccount}>
                <Plus />
                Account
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-8" aria-label={`Actions for ${category.name}`}>
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  <MenuAction icon={<Pencil />} label="Edit category" onSelect={onEditCategory} />
                  <MenuAction
                    icon={<EyeOff />}
                    label="Retire category"
                    destructive
                    onSelect={onRetireCategory}
                    disabledReason={blocked ?? undefined}
                  />
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <Table>
          <TableHeader className="surface-subtle">
            <TableRow>
              <TableHead className={`${HUG_COLUMN} pl-4`}>Code</TableHead>
              <TableHead>Account</TableHead>
              <TableHead className={HUG_COLUMN}>Offered in</TableHead>
              <TableHead className={HUG_COLUMN}>Tax role</TableHead>
              <TableHead className={HUG_COLUMN}>Postings</TableHead>
              <TableHead className={`${HUG_COLUMN} pr-4`}>
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {category.accounts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-6 text-center text-sm text-muted-foreground">
                  No accounts in this category.
                </TableCell>
              </TableRow>
            ) : (
              category.accounts.map((account) => (
                <AccountRow
                  key={account.id}
                  account={account}
                  countries={countries}
                  previewCountry={previewCountry}
                  onEdit={() => onEditAccount(account)}
                  onRetire={() => onRetireAccount(account)}
                />
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

function AccountRow({
  account,
  countries,
  previewCountry,
  onEdit,
  onRetire,
}: {
  account: ChartAccount;
  countries: ChartCountry[];
  previewCountry: string | null;
  onEdit: () => void;
  onRetire: () => void;
}) {
  const restore = useRestoreAccountMutation();
  const blocked = retireBlockedReason(account);
  const displayName = previewCountry ? nameIn(account, previewCountry) : account.name;
  const overrides = Object.entries(account.labels ?? {});

  return (
    <TableRow className={cn(account.deleted && "text-muted-foreground")}>
      <TableCell className={`${HUG_COLUMN} pl-4 tabular`}>{account.code}</TableCell>
      <TableCell>
        <span className="flex items-center gap-2 font-medium">
          {displayName}
          {account.deleted ? <StatusPill label="Retired" tone="neutral" /> : null}
          {account.protected ? <Lock className="size-3 text-muted-foreground" aria-label="Used in code" /> : null}
        </span>
        {/* Without the preview on, the overrides are the only way to see that
            this account reads differently elsewhere. */}
        {!previewCountry && overrides.length > 0 ? (
          <p className="text-xs text-muted-foreground">
            {overrides.map(([iso2, label]) => `${iso2}: ${label}`).join(" · ")}
          </p>
        ) : null}
      </TableCell>
      <TableCell className={`${HUG_COLUMN} text-sm`}>{availabilityLabel(account, countries)}</TableCell>
      <TableCell className={`${HUG_COLUMN} text-sm`}>
        {account.taxRole ? TAX_ROLE_LABELS[account.taxRole].label : "—"}
      </TableCell>
      <TableCell className={`${HUG_COLUMN} tabular`}>
        {account.postings ? formatCount(account.postings) : "—"}
      </TableCell>
      <TableCell className={`${HUG_COLUMN} pr-4`}>
        <div className="flex justify-end">
          {account.deleted ? (
            <Button
              variant="ghost"
              size="sm"
              disabled={restore.isPending}
              onClick={() =>
                restore.mutate(account.id, {
                  onSuccess: () => toast.success(`${account.name} restored`),
                  onError: (error) =>
                    toast.error(apiErrorMessage(error, "That account couldn't be restored.")),
                })
              }
            >
              <RotateCcw />
              Restore
            </Button>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-8" aria-label={`Actions for ${account.name}`}>
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72">
                <MenuAction icon={<Pencil />} label="Edit account" onSelect={onEdit} />
                <MenuAction
                  icon={<EyeOff />}
                  label="Retire account"
                  destructive
                  onSelect={onRetire}
                  disabledReason={blocked ?? undefined}
                />
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}
