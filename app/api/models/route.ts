import { NextRequest } from "next/server";
import { availableModels, resolveProvider } from "@/lib/ai/provider-adapter";
import { ok, withAuth } from "@/lib/util/api";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return withAuth(req, async () => {
    const models = availableModels();
    const resolved = resolveProvider(models[0]?.id);
    return ok({
      models,
      active: resolved.model,
      provider: resolved.provider.name,
      demoMode: resolved.demoMode,
      providers: {
        openai: Boolean(process.env.OPENAI_API_KEY),
        ollama: Boolean(process.env.OLLAMA_BASE_URL),
        demo: true,
      },
    });
  });
}
