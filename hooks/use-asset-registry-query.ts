"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";

import {
  createAssetBrandApi,
  createAssetTypeApi,
  fetchAssetRegistry,
  registryEntryByName,
} from "@/lib/assets";
import { useAssetRegistryStore } from "@/stores/asset-registry";

/**
 * The server answers 409 when the name is already on its list. Our copy of the
 * list can be stale (another tab, another user, a row we never loaded), and
 * "already exists" is exactly what the person wanted — a value to pick — so it
 * resolves to the existing entry rather than surfacing as a failure.
 */
const isAlreadyExists = (error: unknown) =>
  axios.isAxiosError(error) && error.response?.status === 409;

/**
 * Loads the asset registry (makes and asset types) and mirrors it into the
 * shared store, so every screen that reads `useAssetRegistryStore` — the
 * form's comboboxes, the management dialog, the register table's usage
 * counts — sees the same live lists. Safe to call from more than one mounted
 * component — React Query dedupes the underlying request.
 */
export function useAssetRegistryQuery() {
  const setRegistry = useAssetRegistryStore((state) => state.setRegistry);

  const query = useQuery({
    queryKey: ["asset-registry"],
    queryFn: fetchAssetRegistry,
  });

  React.useEffect(() => {
    if (query.data) setRegistry(query.data);
  }, [query.data, setRegistry]);

  return query;
}

/**
 * Adds a make, or resolves to the existing one if it's already on the list —
 * the same add-or-find behaviour the registry always had, now backed by
 * `POST /asset-registry/brands` instead of a purely local write. Checking the
 * already-hydrated store first means picking an existing name never touches
 * the network at all.
 */
export function useCreateAssetBrandMutation() {
  const brandRecords = useAssetRegistryStore((state) => state.brandRecords);
  const addBrandRecord = useAssetRegistryStore((state) => state.addBrandRecord);
  const setRegistry = useAssetRegistryStore((state) => state.setRegistry);

  return React.useCallback(
    async (name: string): Promise<string> => {
      const existing = registryEntryByName(brandRecords, name);
      if (existing) return existing.name;
      try {
        const created = await createAssetBrandApi(name);
        addBrandRecord(created);
        return created.name;
      } catch (error) {
        if (!isAlreadyExists(error)) throw error;
        const snapshot = await fetchAssetRegistry();
        setRegistry(snapshot);
        const found = registryEntryByName(snapshot.brands, name);
        if (found) return found.name;
        throw error;
      }
    },
    [brandRecords, addBrandRecord, setRegistry],
  );
}

/** Same shape as `useCreateAssetBrandMutation`, for asset types. */
export function useCreateAssetTypeMutation() {
  const typeRecords = useAssetRegistryStore((state) => state.typeRecords);
  const addTypeRecord = useAssetRegistryStore((state) => state.addTypeRecord);
  const setRegistry = useAssetRegistryStore((state) => state.setRegistry);

  return React.useCallback(
    async (name: string): Promise<string> => {
      const existing = registryEntryByName(typeRecords, name);
      if (existing) return existing.name;
      try {
        const created = await createAssetTypeApi(name);
        addTypeRecord(created);
        return created.name;
      } catch (error) {
        if (!isAlreadyExists(error)) throw error;
        const snapshot = await fetchAssetRegistry();
        setRegistry(snapshot);
        const found = registryEntryByName(snapshot.types, name);
        if (found) return found.name;
        throw error;
      }
    },
    [typeRecords, addTypeRecord, setRegistry],
  );
}
