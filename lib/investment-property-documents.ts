import api from "@/utils/axiosInstance";
import apiRoutes from "@/config/api-routes";
import { unwrap, type Envelope } from "@/lib/investment-property";

export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;

export const ACCEPTED_DOCUMENT_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;

export const ACCEPT_ATTRIBUTE = ".pdf,.png,.jpg,.jpeg,.doc,.docx";

export type PropertyDocument = {
  id: string;
  name: string;
  url: string;
  uploadedAt: string;
};

type ApiDocument = {
  document_id?: number | string;
  id?: number | string;
  file_name?: string | null;
  file_path?: string | null;
  created_at?: string | null;
};

export function mapDocument(raw: ApiDocument): PropertyDocument {
  return {
    id: String(raw.document_id ?? raw.id ?? ""),
    name: raw.file_name?.trim() || "Document",
    url: raw.file_path ?? "",
    uploadedAt: raw.created_at ?? "",
  };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function documentFileIssue(file: { type: string; size: number } | null): string | null {
  if (!file) return "Choose a file to upload.";
  if (!(ACCEPTED_DOCUMENT_TYPES as readonly string[]).includes(file.type)) {
    return "Only PDF, PNG, JPG and Word documents can be uploaded.";
  }
  if (file.size > MAX_DOCUMENT_BYTES) return "Files can be up to 20 MB.";
  if (file.size === 0) return "That file is empty.";
  return null;
}

export function defaultDocumentName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "").trim();
}

export function documentNameIssue(name: string): string | null {
  if (!name.trim()) return "Document name is required.";
  if (name.trim().length > 255) return "Document name must be 255 characters or fewer.";
  return null;
}

export async function fetchPropertyDocuments(propertyId: string): Promise<PropertyDocument[]> {
  const response = await api.get<Envelope<ApiDocument[]>>(
    `${apiRoutes.investment.documents}${encodeURIComponent(propertyId)}`,
  );
  return unwrap(response, "Couldn't load documents.").map(mapDocument);
}

export async function uploadPropertyDocumentApi(
  propertyId: string,
  name: string,
  file: File,
): Promise<void> {
  const form = new FormData();
  form.append("document_name", name.trim());
  form.append("file", file);
  const response = await api.post<Envelope<unknown>>(
    `${apiRoutes.investment.documents}${encodeURIComponent(propertyId)}`,
    form,
  );
  unwrap(response, "Couldn't upload the document.");
}

export async function deletePropertyDocumentApi(documentId: string): Promise<void> {
  const response = await api.delete<Envelope<unknown>>(
    `${apiRoutes.fileUpload.document}/${encodeURIComponent(documentId)}`,
  );
  if (response.data?.success === false) {
    throw new Error(response.data.message || "Couldn't delete the document.");
  }
}
