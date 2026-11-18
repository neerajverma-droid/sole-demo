"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowRight,
  BriefcaseBusiness,
  ClipboardCheck,
  FileText,
  FolderOpen,
  LifeBuoy,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import {
  countFiles,
  flattenFiles,
  matchesName,
  type ResourceFolderNode,
} from "@/lib/resources";
import { cn } from "@/lib/utils";
import { ResourceFileRow } from "./resource-file-row";
import { NoResults, ResourceSearchInput } from "./resource-search-input";
import { ResourceShell } from "./resource-shell";

type BuiltInResource = {
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
  meta: string;
};

const resourceSections: {
  title: string;
  description: string;
  resources: BuiltInResource[];
}[] = [
  {
    title: "Small Business",
    description: "Practical resources for sole traders and small business owners.",
    resources: [
      {
        title: "Get Paid Faster Kit",
        description:
          "Practical steps to follow up overdue invoices and improve payment habits.",
        href: "/resource/invoice-rescue",
        icon: LifeBuoy,
        meta: "Invoices",
      },
      {
        title: "Small Business Admin Toolkit",
        description:
          "Templates and guidance to keep everyday business admin more organised.",
        href: "/resource/spm-business-toolkit",
        icon: FileText,
        meta: "Toolkit",
      },
      {
        title: "Business Launch Starter Kit",
        description:
          "A practical resource for planning, setup, and early business admin.",
        href: "/resource/small-business-launch-tooklit",
        icon: BriefcaseBusiness,
        meta: "Launch",
      },
    ],
  },
  {
    title: "Accountants & Bookkeepers",
    description: "Checklists and tools for reviewing client work with confidence.",
    resources: [
      {
        title: "Client File Health Check",
        description:
          "A focused checklist for reviewing client records and spotting cleanup work.",
        href: "/resource/spm-client-cleanup",
        icon: ClipboardCheck,
        meta: "Checklist",
      },
    ],
  },
];

const getSectionId = (title: string) =>
  title.toLowerCase().replaceAll(" ", "-").replaceAll("&", "and");

const cardLinkClass =
  "group flex h-full flex-col gap-4 p-5 outline-none transition-colors hover:border-primary/40 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring";

function ResourceCard({
  href,
  icon: Icon,
  badge,
  title,
  description,
  footer,
  action,
  // The HTML kits are route handlers, not React pages, so they need a full
  // page load rather than a client-side navigation.
  hardNavigate = false,
}: {
  href: string;
  icon: LucideIcon;
  badge: string;
  title: string;
  description: string;
  footer?: React.ReactNode;
  action: string;
  hardNavigate?: boolean;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary [&_svg]:size-5">
          <Icon aria-hidden />
        </span>
        <Badge variant="secondary" className="tabular">
          {badge}
        </Badge>
      </div>

      <div className="flex-1 space-y-1.5">
        <h3 className="font-semibold leading-snug tracking-tight">{title}</h3>
        <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
        {footer}
      </div>

      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-primary">
        {action}
        <ArrowRight
          className="size-4 transition-transform group-hover:translate-x-0.5"
          aria-hidden
        />
      </span>
    </>
  );

  return (
    <Card className="h-full overflow-hidden transition-colors hover:border-primary/40">
      {hardNavigate ? (
        <a className={cardLinkClass} href={href}>
          {body}
        </a>
      ) : (
        <Link className={cardLinkClass} href={href}>
          {body}
        </Link>
      )}
    </Card>
  );
}

function SectionHeader({
  title,
  description,
  aside,
  className,
}: {
  title: string;
  description?: string;
  aside?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between",
        className
      )}
    >
      <div className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {aside}
    </div>
  );
}

export function ResourceHome({ folders }: { folders: ResourceFolderNode[] }) {
  const [searchTerm, setSearchTerm] = useState("");
  const term = searchTerm.trim();

  const allFiles = useMemo(() => flattenFiles(folders), [folders]);
  const searchResults = useMemo(
    () =>
      term
        ? allFiles.filter(
            (file) =>
              matchesName(file.name, term) || matchesName(file.folderName, term)
          )
        : null,
    [allFiles, term]
  );

  return (
    <ResourceShell>
      <div className="max-w-2xl space-y-2">
        <p className="text-sm font-medium text-primary">Sole Resources</p>
        <h1 className="text-3xl font-semibold tracking-tight">Resources</h1>
        <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">
          Helpful tools and checklists for small businesses, accountants, and
          bookkeepers.
        </p>
      </div>

      <nav
        aria-label="Resource sections"
        className="mt-6 flex flex-wrap items-center gap-1.5"
      >
        {resourceSections.map((section) => (
          <a
            className="rounded-full border border-border bg-background px-3 py-1 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            href={`#${getSectionId(section.title)}`}
            key={section.title}
          >
            {section.title}
          </a>
        ))}
        <a
          className="rounded-full border border-border bg-background px-3 py-1 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          href="#resource-library"
        >
          Downloads
        </a>
      </nav>

      <div className="mt-10 space-y-10">
        {resourceSections.map((section) => (
          <section
            id={getSectionId(section.title)}
            key={section.title}
            className="scroll-mt-6"
          >
            <SectionHeader
              title={section.title}
              description={section.description}
              aside={
                <span className="text-sm text-muted-foreground tabular">
                  {section.resources.length}{" "}
                  {section.resources.length === 1 ? "resource" : "resources"}
                </span>
              }
            />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {section.resources.map((resource) => (
                <ResourceCard
                  action="Open resource"
                  badge={resource.meta}
                  description={resource.description}
                  hardNavigate
                  href={resource.href}
                  icon={resource.icon}
                  key={resource.href}
                  title={resource.title}
                />
              ))}
            </div>
          </section>
        ))}

        <section id="resource-library" className="scroll-mt-6">
          <SectionHeader
            title="Downloadable Business Tools"
            description={
              folders.length > 0
                ? "Browse folders of templates, checklists, worksheets, and calculators, or search every file by name."
                : undefined
            }
            aside={
              folders.length > 0 && (
                <ResourceSearchInput
                  className="sm:w-72"
                  label="Search resources by name"
                  onChange={setSearchTerm}
                  placeholder="Search by name"
                  value={searchTerm}
                />
              )
            }
          />

          {folders.length === 0 ? (
            <Empty>
              <EmptyMedia>
                <FolderOpen aria-hidden />
              </EmptyMedia>
              <EmptyTitle>No resources published yet</EmptyTitle>
              <EmptyDescription>
                Templates, checklists and downloads will appear here soon.
              </EmptyDescription>
            </Empty>
          ) : searchResults ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground tabular">
                {searchResults.length}{" "}
                {searchResults.length === 1 ? "resource" : "resources"} found
              </p>
              {searchResults.length > 0 ? (
                <Card className="divide-y divide-border overflow-hidden">
                  {searchResults.map((file) => (
                    <ResourceFileRow
                      file={file}
                      folderName={file.folderName}
                      key={file.id}
                    />
                  ))}
                </Card>
              ) : (
                <NoResults title="No resources found" />
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {folders.map((folder) => {
                const total = countFiles(folder);
                const subfolders = folder.children?.length ?? 0;
                return (
                  <ResourceCard
                    action="Open folder"
                    badge={`${total} ${total === 1 ? "file" : "files"}`}
                    description={
                      folder.description ||
                      "Templates, checklists and downloads in this folder."
                    }
                    footer={
                      subfolders > 0 && (
                        <p className="text-xs text-muted-foreground tabular">
                          {subfolders}{" "}
                          {subfolders === 1 ? "subfolder" : "subfolders"}
                        </p>
                      )
                    }
                    href={`/resource/${folder.slug}`}
                    icon={FolderOpen}
                    key={folder.id}
                    title={folder.name}
                  />
                );
              })}
            </div>
          )}
        </section>
      </div>
    </ResourceShell>
  );
}
