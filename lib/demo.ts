import fs from "fs";
import path from "path";
import { z } from "zod";

const DiffDemoSchema = z.object({
  guidelineId:   z.string().min(1),
  fromVersionId: z.string().min(1),
  toVersionId:   z.string().min(1),
  title:         z.string(),
  notes:         z.array(z.string()),
});

const DemoConfigSchema = z.object({
  diffDemo: DiffDemoSchema,
});

export type DiffDemoConfig = z.infer<typeof DiffDemoSchema>;
export type DemoConfig     = z.infer<typeof DemoConfigSchema>;

export function readDemoConfig(): DemoConfig {
  const p = path.join(process.cwd(), "data", "demo.json");
  if (!fs.existsSync(p)) {
    throw new Error("Demo config not found. Run `npm run seed`.");
  }
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch {
    throw new Error("demo.json is not valid JSON. Run `npm run seed`.");
  }
  const result = DemoConfigSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`demo.json schema invalid: ${result.error.issues[0]?.message ?? "unknown"}. Run \`npm run seed\`.`);
  }
  return result.data;
}
