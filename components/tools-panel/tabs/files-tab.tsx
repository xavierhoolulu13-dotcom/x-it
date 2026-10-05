"use client";

import { useSandboxStore, type FileNode } from "@/lib/stores/sandbox-store";
import {
  File,
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import { useState } from "react";

function FileTreeNode({ node, depth = 0 }: { node: FileNode; depth?: number }) {
  const [isOpen, setIsOpen] = useState(node.isExpanded || false);
  const { setActiveFile, activeFilePath } = useSandboxStore();

  const handleClick = () => {
    if (node.type === "directory") {
      setIsOpen(!isOpen);
    } else {
      setActiveFile(node.path);
    }
  };

  const isActive = activeFilePath === node.path;

  return (
    <div>
      <button
        onClick={handleClick}
        className={`flex w-full items-center gap-1.5 py-1 px-2 text-sm hover:bg-accent/50 transition-colors ${
          isActive ? "bg-accent" : ""
        }`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        {node.type === "directory" ? (
          <>
            {isOpen ? (
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
            )}
            {isOpen ? (
              <FolderOpen className="h-4 w-4 text-primary" />
            ) : (
              <Folder className="h-4 w-4 text-primary" />
            )}
          </>
        ) : (
          <>
            <span className="w-3" />
            <File className="h-4 w-4 text-muted-foreground" />
          </>
        )}
        <span className="truncate">{node.name}</span>
      </button>
      {node.type === "directory" && isOpen && node.children && (
        <div>
          {node.children.map((child) => (
            <FileTreeNode key={child.path} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export function FilesTab() {
  const { fileTree, activeFilePath, fileContents } = useSandboxStore();
  const activeContent = activeFilePath ? fileContents[activeFilePath] : null;

  if (fileTree.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-4 text-center">
        <span className="text-4xl">📁</span>
        <p className="mt-3 text-sm font-medium">No files yet</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Files will appear here when the AI creates or accesses files in the sandbox.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* File Tree */}
      <div className="w-1/2 overflow-y-auto border-r border-border">
        {fileTree.map((node) => (
          <FileTreeNode key={node.path} node={node} />
        ))}
      </div>

      {/* File Preview */}
      <div className="w-1/2 overflow-y-auto p-3">
        {activeFilePath ? (
          <div>
            <div className="mb-2 text-xs font-medium text-muted-foreground truncate">
              {activeFilePath}
            </div>
            {activeContent !== null ? (
              <pre className="whitespace-pre-wrap rounded-md bg-muted/50 p-3 text-xs font-mono">
                {activeContent}
              </pre>
            ) : (
              <p className="text-xs text-muted-foreground">
                Select a file to view its contents
              </p>
            )}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Select a file to preview
          </div>
        )}
      </div>
    </div>
  );
}