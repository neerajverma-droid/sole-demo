import { redirect } from "next/navigation";

/** `/admin` has no screen of its own; the guard moves anyone without the dashboard grant on from there. */
export default function AdminIndexPage() {
  redirect("/admin/dashboard");
}
