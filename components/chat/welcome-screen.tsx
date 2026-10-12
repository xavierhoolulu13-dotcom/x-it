"use client";

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
    <div className="relative flex h-full flex-col items-center justify-center overflow-hidden px-4">
      {/* Animated aurora backdrop */}
      <div className="ss-aurora" aria-hidden />

      <div className="relative w-full max-w-3xl text-center">
        {/* Logo & Title */}
        <div className="ss-rise mb-8">
          <div className="ss-logo mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-[22px]">
            <span className="text-3xl font-bold text-white">X</span>
          </div>
          <h1 className="ss-gradient-text text-4xl font-bold tracking-tight">
            Welcome to X-IT
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
            Your personal AI computer assistant. I can write code, manage files,
            run commands, browse the web, and build applications — all in an
            isolated sandbox environment.
          </p>
        </div>

        {/* Starter Prompts */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {STARTER_PROMPTS.map((item, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onSend(item.prompt)}
              className="ss-glow-card ss-rise flex h-auto flex-col items-start gap-2 p-4 text-left"
              style={{ animationDelay: `${0.12 + i * 0.08}s` }}
            >
              <span className="flex items-center gap-2 text-primary">
                {item.icon}
                <span className="font-medium text-foreground">{item.title}</span>
              </span>
              <span className="line-clamp-2 text-xs text-muted-foreground">
                {item.prompt}
              </span>
            </button>
          ))}
        </div>

        {/* Quick Tips */}
        <div
          className="ss-rise mt-8 text-xs text-muted-foreground"
          style={{ animationDelay: "0.7s" }}
        >
          <p>
            💡 Tip: I&apos;ll ask for your approval before running commands,
            writing files, or performing any potentially destructive actions.
          </p>
        </div>
      </div>
    </div>
  );
}
