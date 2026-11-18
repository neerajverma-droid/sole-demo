"use client";

import Link from "next/link";
import { Fragment, useState } from "react";
import { ChevronRight, FolderOpen } from "lucide-react";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Card } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { matchesName, type ResourceFolderDetail } from "@/lib/resources";
import { ResourceFileRow } from "./resource-file-row";
import { NoResults, ResourceSearchInput } from "./resource-search-input";
import { ResourceShell } from "./resource-shell";

export function ResourceFolder({
  folder,
  slugPath,
}: {
  folder: ResourceFolderDetail;
  slugPath: string;
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const term = searchTerm.trim();

  const allChildren = folder.children ?? [];
  const allFiles = folder.files ?? [];
  const children = term
    ? allChildren.filter((c) => matchesName(c.name, term))
    : allChildren;
  const files = term
    ? allFiles.filter((f) => matchesName(f.name, term))
    : allFiles;
  const hasItems = allChildren.length > 0 || allFiles.length > 0;
  const breadcrumbs = folder.breadcrumbs ?? [];

  return (
    <ResourceShell>
      <div className="mx-auto w-full max-w-4xl">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/resource">Resources</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            {breadcrumbs.map((crumb, i) => {
              const href = `/resource/${breadcrumbs
                .slice(0, i + 1)
                .map((c) => c.slug)
                .join("/")}`;
              const isLast = i === breadcrumbs.length - 1;
              return (
                <Fragment key={href}>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    {isLast ? (
                      <BreadcrumbPage>{crumb.name}</BreadcrumbPage>
                    ) : (
                      <BreadcrumbLink asChild>
                        <Link href={href}>{crumb.name}</Link>
                      </BreadcrumbLink>
                    )}
                  </BreadcrumbItem>
                </Fragment>
              );
            })}
          </BreadcrumbList>
        </Breadcrumb>

        <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1.5">
            <h1 className="text-2xl font-semibold tracking-tight">
              {folder.name}
            </h1>
            {folder.description && (
              <p className="text-sm leading-relaxed text-muted-foreground">
                {folder.description}
              </p>
            )}
          </div>
          {hasItems && (
            <ResourceSearchInput
              className="sm:w-72"
              label="Search files in this folder"
              onChange={setSearchTerm}
              placeholder="Search files by name"
              value={searchTerm}
            />
          )}
        </div>

        <div className="mt-6 space-y-6">
          {term && children.length === 0 && files.length === 0 && (
            <NoResults title="No files found" />
          )}

          {children.length > 0 && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {children.map((child) => (
                <Card
                  key={child.id}
                  className="overflow-hidden transition-colors hover:border-primary/40"
                >
                  <Link
                    href={`/resource/${slugPath}/${child.slug}`}
                    className="group flex items-center gap-3 p-4 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-md bg-primary/10 text-primary [&_svg]:size-4">
                      <FolderOpen aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {child.name}
                    </span>
                    <ChevronRight
                      className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                      aria-hidden
                    />
                  </Link>
                </Card>
              ))}
            </div>
          )}

          {files.length > 0 && (
            <Card className="divide-y divide-border overflow-hidden">
              {files.map((file) => (
                <ResourceFileRow file={file} key={file.id} />
              ))}
            </Card>
          )}

          {!hasItems && (
            <Empty>
              <EmptyMedia>
                <FolderOpen aria-hidden />
              </EmptyMedia>
              <EmptyTitle>No files in this folder yet</EmptyTitle>
              <EmptyDescription>
                Check back soon — new downloads are added regularly.
              </EmptyDescription>
            </Empty>
          )}
        </div>
      </div>
    </ResourceShell>
  );
}
