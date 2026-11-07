import {
  LayoutDashboard,
  FileText,
  FolderOpen,
  BookOpen,
  Share2,
  Settings,
} from "lucide-react";

// Workspace nav; each title must match a key in screens/registry.jsx.
export const workspaceNav = [
  { title: "Overview", icon: LayoutDashboard },
  { title: "Documents", icon: FileText },
  { title: "Collections", icon: FolderOpen },
  { title: "Templates", icon: BookOpen },
  { title: "Shared", icon: Share2 },
  { title: "Settings", icon: Settings },
];
