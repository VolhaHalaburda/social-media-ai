import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { v4 as uuid } from "uuid";
import { readConfigsAsync, writeConfigsAsync } from "@/lib/csv";
import type { Config } from "@/lib/types";

export async function GET() {
  const configs = await readConfigsAsync();
  return NextResponse.json(configs);
}

export async function POST(request: Request) {
  const auth = await requireRole("admin");
  if (auth instanceof NextResponse) return auth;

  const body = await request.json();
  const configs = await readConfigsAsync();
  const newConfig: Config = {
    id: uuid(),
    configName: body.configName,
    creatorsCategory: body.creatorsCategory,
    analysisInstruction: body.analysisInstruction,
    newConceptsInstruction: body.newConceptsInstruction,
  };
  configs.push(newConfig);
  await writeConfigsAsync(configs);
  return NextResponse.json(newConfig, { status: 201 });
}

export async function PUT(request: Request) {
  const auth = await requireRole("admin");
  if (auth instanceof NextResponse) return auth;

  const body = await request.json();
  const configs = await readConfigsAsync();
  const index = configs.findIndex((c) => c.id === body.id);
  if (index === -1) return NextResponse.json({ error: "Not found" }, { status: 404 });
  configs[index] = { ...configs[index], ...body };
  await writeConfigsAsync(configs);
  return NextResponse.json(configs[index]);
}

export async function DELETE(request: Request) {
  const auth = await requireRole("admin");
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const configs = await readConfigsAsync();
  await writeConfigsAsync(configs.filter((c) => c.id !== id));
  return NextResponse.json({ success: true });
}
