"use client";

import { Button } from "@/components/ui/button";
import {
  Code2,
  FileText,
  Globe,
  Terminal,
  Lightbulb,
  Rocket,
} from "lucide-react";

interface WelcomeScreenProps {
  onSend: (message: string) => void;
}

const STARTER_PROMPTS = [
  {
    icon: <Code2 className="h-5 w-5" />,
    title: "Build a React app",
    prompt:
      "Create a React dashboard with a login page, charts, and a data table. Run it in the sandbox and show me the preview.",
  },
  {
    icon: <Terminal className="h-5 w-5" />,
    title: "Run shell commands",
    prompt:
      "List the files in the current directory, then create a Python script that calculates fibonacci numbers and run it.",
  },
  {
    icon: <FileText className="h-5 w-5" />,
    title: "Create & edit files",
    prompt:
      "Create a project with an HTML file, a CSS stylesheet, and a JavaScript file. Make a simple landing page.",
  },
  {
    icon: <Globe className="h-5 w-5" />,
    title: "Browse the web",
    prompt:
      "Navigate to example.com and take a screenshot. Then extract the main heading text.",
  },
  {
    icon: <Lightbulb className="h-5 w-5" />,
    title: "Explain code",
    prompt:
      "Explain how a binary search algorithm works, then implement it in Python with test cases.",
  },
  {
    icon: <Rocket className="h-5 w-5" />,
    title: "Deploy an API",
    prompt:
      "Create a REST API with Express.js that has CRUD operations for a todo list. Include input validation and error handling.",
  },
];

export function WelcomeScreen({ onSend }: WelcomeScreenProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-4">
      <div className="w-full max-w-3xl text-center">
        {/* Logo & Title */}
        <div className="mb-8">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary shadow-lg">
            <span className="text-2xl font-bold text-primary-foreground">X</span>
          </div>
          <h1 className="text-3xl font-bold">Welcome to X-IT</h1>
          <p className="mt-2 text-muted-foreground">
            Your personal AI computer assistant. I can write code, manage files, run
            commands, browse the web, and build applications — all in an isolated
            sandbox environment.
          </p>
        </div>

        {/* Starter Prompts */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {STARTER_PROMPTS.map((item, i) => (
            <Button
              key={i}
              variant="outline"
              className="flex h-auto flex-col items-start gap-2 p-4 text-left"
              onClick={() => onSend(item.prompt)}
            >
              <div className="flex items-center gap-2 text-primary">
                {item.icon}
                <span className="font-medium">{item.title}</span>
              </div>
              <span className="text-xs text-muted-foreground line-clamp-2">
                {item.prompt}
              </span>
            </Button>
          ))}
        </div>

        {/* Quick Tips */}
        <div className="mt-8 text-xs text-muted-foreground">
          <p>
            💡 Tip: I&apos;ll ask for your approval before running commands, writing files,
            or performing any potentially destructive actions.
          </p>
        </div>
      </div>
    </div>
  );
}