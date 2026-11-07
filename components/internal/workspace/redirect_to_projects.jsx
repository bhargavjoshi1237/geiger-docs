"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";

// Legacy entry points (/home, /org) forward to the project resolver.
export function RedirectToProjects() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/project");
  }, [router]);
  return <div className="flex h-[100dvh] w-full items-center justify-center bg-background" />;
}
