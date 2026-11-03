import type { Metadata } from "next";

import { ProjectSettingsScreen } from "@/components/projects/project-settings-screen";

export const metadata: Metadata = {
  title: "Project settings · Sole",
};

export default function ProjectSettingsPage() {
  return <ProjectSettingsScreen />;
}
