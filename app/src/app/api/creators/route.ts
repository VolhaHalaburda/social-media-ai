import { NextResponse } from "next/server";
import { v4 as uuid } from "uuid";
import { readCreatorsAsync, writeCreatorsAsync } from "@/lib/csv";
import { scrapeCreatorStats } from "@/lib/apify";
import type { Creator } from "@/lib/types";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category");
  let creators = await readCreatorsAsync();
  if (category) creators = creators.filter((c) => c.category === category);
  return NextResponse.json(creators);
}

export async function POST(request: Request) {
  const body = await request.json();
  const creators = await readCreatorsAsync();

  const newCreator: Creator = {
    id: uuid(),
    username: body.username,
    category: body.category,
    profilePicUrl: "",
    followers: 0,
    reelsCount30d: 0,
    avgViews30d: 0,
    lastScrapedAt: "",
  };

  creators.push(newCreator);
  await writeCreatorsAsync(creators);

  try {
    const stats = await scrapeCreatorStats(body.username);
    const updated = await readCreatorsAsync();
    const idx = updated.findIndex((c) => c.id === newCreator.id);
    if (idx !== -1) {
      updated[idx] = {
        ...updated[idx],
        profilePicUrl: stats.profilePicUrl,
        followers: stats.followers,
        reelsCount30d: stats.reelsCount30d,
        avgViews30d: stats.avgViews30d,
        lastScrapedAt: new Date().toISOString(),
      };
      await writeCreatorsAsync(updated);
      return NextResponse.json(updated[idx], { status: 201 });
    }
  } catch (err) {
    console.error(`Failed to scrape stats for @${body.username}:`, err);
  }

  return NextResponse.json(newCreator, { status: 201 });
}

export async function PUT(request: Request) {
  const body = await request.json();
  const creators = await readCreatorsAsync();
  const index = creators.findIndex((c) => c.id === body.id);
  if (index === -1) return NextResponse.json({ error: "Not found" }, { status: 404 });
  creators[index] = { ...creators[index], ...body };
  await writeCreatorsAsync(creators);
  return NextResponse.json(creators[index]);
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const creators = await readCreatorsAsync();
  await writeCreatorsAsync(creators.filter((c) => c.id !== id));
  return NextResponse.json({ success: true });
}
