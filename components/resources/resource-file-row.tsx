import { Download, FileText } from "lucide-react";

import { formatFileSize, type ResourceFile } from "@/lib/resources";

/** One downloadable file — a row inside a bordered Card list. */
export function ResourceFileRow({
  file,
  folderName,
}: {
  file: ResourceFile;
  folderName?: string;
}) {
  const meta = [
    file.extension?.toUpperCase(),
    formatFileSize(file.size),
    folderName,
  ].filter(Boolean);

  return (
    <a
      className="group flex items-center gap-3 px-4 py-3 outline-none transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
      href={file.url}
      rel="noopener noreferrer"
      target="_blank"
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-md bg-primary/10 text-primary [&_svg]:size-4">
        <FileText aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{file.name}</p>
        {meta.length > 0 && (
          <p className="truncate text-xs text-muted-foreground tabular">
            {meta.join(" · ")}
          </p>
        )}
      </div>
      <span className="inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-primary">
        <span className="max-sm:sr-only">Download</span>
        <Download className="size-4" aria-hidden />
      </span>
    </a>
  );
}
