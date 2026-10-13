import React from "react";
import ReactDOM from "react-dom/client";
import "./styles.css";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { announceDownloads } from "./downloads";
import { Root } from "./root";

announceDownloads();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <TooltipProvider>
      <Root />
    </TooltipProvider>
    <Toaster />
  </React.StrictMode>,
);
