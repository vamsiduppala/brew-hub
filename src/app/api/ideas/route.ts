import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const DB_PATH = path.resolve(process.cwd(), "src/data/db.json");

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category");

  try {
    if (!fs.existsSync(DB_PATH)) {
      return NextResponse.json([]);
    }

    const fileContent = fs.readFileSync(DB_PATH, "utf8");
    const ideas = JSON.parse(fileContent);

    if (!Array.isArray(ideas)) {
      return NextResponse.json([]);
    }

    if (category) {
      const filtered = ideas.filter((idea: any) => idea.category === category);
      return NextResponse.json(filtered);
    }

    return NextResponse.json(ideas);
  } catch (err: any) {
    console.error("Failed to read ideas database:", err);
    return NextResponse.json({ error: "Failed to read database." }, { status: 500 });
  }
}
