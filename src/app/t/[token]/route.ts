import { NextResponse } from "next/server";

type Params = {
  params: Promise<{
    token: string;
  }>;
};

export async function GET(request: Request, context: Params) {
  const { token } = await context.params;
  const cleanedToken = (token ?? "").trim();

  if (!cleanedToken) {
    return NextResponse.redirect(new URL("/tracking", request.url));
  }

  return NextResponse.redirect(
    new URL(`/tracking?token=${encodeURIComponent(cleanedToken)}`, request.url)
  );
}

