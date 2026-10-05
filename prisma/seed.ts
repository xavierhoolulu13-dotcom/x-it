import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  // Create demo user
  const hashedPassword = await hash("demo1234", 12);
  const user = await prisma.user.upsert({
    where: { email: "demo@xit.dev" },
    update: {},
    create: {
      email: "demo@xit.dev",
      name: "Demo User",
      hashedPassword,
      role: "ADMIN",
      settings: {
        theme: "dark",
        defaultModel: "gpt-4",
        defaultTemperature: 0.7,
      },
    },
  });
  console.log(`Created user: ${user.email}`);

  // Create default project
  const project = await prisma.project.upsert({
    where: { id: "default-project" },
    update: {},
    create: {
      id: "default-project",
      name: "Default Project",
      description: "Your default workspace",
      userId: user.id,
      systemPrompt:
        "You are a helpful AI computer assistant. You can create files, run code, execute commands, and browse the web — all inside an isolated sandbox environment. Always explain what you're doing and ask for approval before potentially destructive actions.",
    },
  });
  console.log(`Created project: ${project.name}`);

  // Create project templates
  const templates = [
    {
      name: "React Dashboard",
      description: "A React dashboard with charts and data tables",
      category: "web",
      fileTree: {
        "package.json": {
          content: JSON.stringify(
            {
              name: "react-dashboard",
              dependencies: { react: "^18", "react-dom": "^18" },
            },
            null,
            2
          ),
        },
        "src/index.js": { content: 'import React from "react";\nimport App from "./App";\n' },
        "src/App.js": { content: "export default function App() { return <div>Dashboard</div>; }" },
        "public/index.html": {
          content: '<!DOCTYPE html>\n<html><head><title>Dashboard</title></head><body><div id="root"></div></body></html>',
        },
      },
    },
    {
      name: "Express API",
      description: "A RESTful API with Express.js",
      category: "api",
      fileTree: {
        "package.json": {
          content: JSON.stringify(
            { name: "express-api", dependencies: { express: "^4" } },
            null,
            2
          ),
        },
        "src/index.js": {
          content:
            'const express = require("express");\nconst app = express();\napp.get("/", (req, res) => res.json({ status: "ok" }));\napp.listen(3000);\n',
        },
      },
    },
    {
      name: "Python Script",
      description: "A Python script template",
      category: "script",
      fileTree: {
        "main.py": { content: '#!/usr/bin/env python3\n\ndef main():\n    print("Hello, World!")\n\nif __name__ == "__main__":\n    main()\n' },
        "requirements.txt": { content: "" },
        "README.md": { content: "# Python Script\n\nA Python script template.\n" },
      },
    },
    {
      name: "Static Website",
      description: "A simple HTML/CSS/JS website",
      category: "web",
      fileTree: {
        "index.html": {
          content:
            '<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <title>My Website</title>\n  <link rel="stylesheet" href="style.css">\n</head>\n<body>\n  <h1>Welcome</h1>\n  <script src="script.js"></script>\n</body>\n</html>',
        },
        "style.css": {
          content:
            "* { margin: 0; padding: 0; box-sizing: border-box; }\nbody { font-family: system-ui; padding: 2rem; }",
        },
        "script.js": { content: 'console.log("Website loaded!");\n' },
      },
    },
  ];

  for (const template of templates) {
    await prisma.projectTemplate.upsert({
      where: { name: template.name },
      update: {},
      create: template,
    });
  }
  console.log(`Created ${templates.length} project templates`);

  console.log("Seeding complete!");
}

main()
  .catch((e) => {
    console.error("Seeding failed:", e);
    process.exit(1);
  })
  .finally(() => {
    prisma.$disconnect();
  });