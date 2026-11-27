import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { SKILL_NAMES, getSkill, getSkillFile, listSkills } from "@/lib/skills";

const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] });

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      "list_skills",
      {
        title: "List K's skills",
        description: "List K's skills served by this connector: name, status, description, source path and git blob SHA.",
        inputSchema: z.object({}),
        annotations: { readOnlyHint: true },
      },
      async () => text(JSON.stringify(listSkills(), null, 2)),
    );

    server.registerTool(
      "get_skill",
      {
        title: "Get a skill",
        description: `Return the full SKILL.md text of one of K's skills plus its helper text files. Names: ${SKILL_NAMES.join(", ")}.`,
        inputSchema: z.object({
          name: z.enum(SKILL_NAMES as [string, ...string[]]).describe("Skill name"),
          include_helpers: z.boolean().optional().describe("Include reference/helper text files (default true)"),
        }),
        annotations: { readOnlyHint: true },
      },
      async ({ name, include_helpers }) => {
        const t = getSkill(name, include_helpers ?? true);
        return t ? text(t) : { ...text(`Unknown skill: ${name}`), isError: true };
      },
    );

    server.registerTool(
      "get_skill_file",
      {
        title: "Get one skill file",
        description: "Return a single file (e.g. references/originals.md) from a skill.",
        inputSchema: z.object({
          name: z.enum(SKILL_NAMES as [string, ...string[]]),
          path: z.string().describe("File path inside the skill folder, as listed by list_skills helperFiles"),
        }),
        annotations: { readOnlyHint: true },
      },
      async ({ name, path }) => {
        const t = getSkillFile(name, path);
        return t ? text(t) : { ...text(`Not found: ${name}/${path}`), isError: true };
      },
    );

    for (const n of SKILL_NAMES) {
      server.registerPrompt(
        n,
        { title: `Skill: ${n}`, description: `Load K's ${n} skill instructions into the conversation.` },
        () => ({
          messages: [{ role: "user" as const, content: { type: "text" as const, text: getSkill(n, false) ?? "" } }],
        }),
      );
      server.registerResource(
        `skill-${n}`,
        `skill://${n}/SKILL.md`,
        { title: `${n} SKILL.md`, mimeType: "text/markdown" },
        async (uri) => ({ contents: [{ uri: uri.href, mimeType: "text/markdown", text: getSkill(n, false) ?? "" }] }),
      );
    }
  },
  { serverInfo: { name: "k-skills", version: "1.0.0" } },
);

// The URL key is not in source: it is the SKILLS_MCP_KEY env var set on the Vercel project.
function guarded(req: Request, ctx: { params: Promise<{ key: string }> }) {
  return ctx.params.then(({ key }) => {
    const expected = process.env.SKILLS_MCP_KEY?.trim();
    if (!expected || expected.length < 32 || !timingSafeEqual(key, expected)) {
      return new Response("Not found", { status: 404 });
    }
    return handler(req);
  });
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export { guarded as GET, guarded as POST, guarded as DELETE };
