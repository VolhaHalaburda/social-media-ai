import { NextResponse } from "next/server";
import { readVideosAsync, writeVideosAsync } from "@/lib/csv";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const configName = searchParams.get("configName");
  const creator = searchParams.get("creator");

  let videos = await readVideosAsync();

  if (configName) videos = videos.filter((v) => v.configName === configName);
  if (creator) videos = videos.filter((v) => v.creator === creator);

  videos.sort((a, b) => {
    const dateDiff = (b.dateAdded || "").localeCompare(a.dateAdded || "");
    if (dateDiff !== 0) return dateDiff;
    return b.views - a.views;
  });

  return NextResponse.json(videos);
}

export async function PATCH(request: Request) {
  const { id, starred } = await request.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const videos = await readVideosAsync();
  const video = videos.find((v) => v.id === id);
  if (!video) return NextResponse.json({ error: "not found" }, { status: 404 });

  video.starred = starred;
  await writeVideosAsync(videos);
  return NextResponse.json(video);
}
