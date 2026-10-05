"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Globe, ArrowLeft, ArrowRight, RotateCcw, Camera } from "lucide-react";

export function BrowserTab() {
  const [url, setUrl] = useState("https://example.com");
  const [currentUrl, setCurrentUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleNavigate = async () => {
    if (!url.trim()) return;
    setIsLoading(true);
    try {
      // This would call the sandbox browser API
      setCurrentUrl(url);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Browser Chrome */}
      <div className="border-b border-border p-2">
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="icon" className="h-7 w-7">
            <ArrowLeft className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7">
            <ArrowRight className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7">
            <RotateCcw className="h-3 w-3" />
          </Button>
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleNavigate();
            }}
            placeholder="Enter URL..."
            className="h-7 flex-1 text-xs"
          />
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleNavigate}>
            <Globe className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7">
            <Camera className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Browser View */}
      <div className="flex-1 overflow-hidden">
        {currentUrl ? (
          <div className="flex h-full flex-col items-center justify-center bg-muted/30 p-4 text-center">
            <Globe className="h-12 w-12 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium">Browser Preview</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {isLoading ? "Loading..." : `Viewing: ${currentUrl}`}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Browser automation runs inside the sandbox container. A live preview
              will appear here when the sandbox browser is active.
            </p>
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center p-4 text-center">
            <span className="text-4xl">🌐</span>
            <p className="mt-3 text-sm font-medium">No browser active</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Navigate to a URL to start the sandbox browser.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}