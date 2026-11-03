import { Input } from "@/components/ui/input";

/**
 * A business's country on its address. Shown, never edited: the country is
 * chosen once when the business is created and everything that follows from it
 * — currency, tax, bank fields — is built on it.
 */
export function LockedCountryInput({ id, value }: { id: string; value: string }) {
  return <Input id={id} value={value} readOnly disabled aria-readonly="true" />;
}
