import { type NextRequest, NextResponse } from "next/server";

import { apiBaseUrl } from "@/lib/api-client";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const merchantId = request.nextUrl.searchParams.get("merchantId")?.trim();
  if (merchantId === undefined || merchantId.length === 0) {
    return NextResponse.json(
      { message: "merchantId is required." },
      { status: 400 },
    );
  }

  const response = await fetch(
    `${apiBaseUrl}/v1/merchants/${encodeURIComponent(merchantId)}/inventory.csv`,
    { cache: "no-store", headers: { accept: "text/csv" } },
  );
  if (!response.ok) {
    return NextResponse.json(
      { message: "Inventory export could not be generated." },
      { status: response.status },
    );
  }

  return new NextResponse(await response.arrayBuffer(), {
    status: 200,
    headers: {
      "content-type": response.headers.get("content-type") ?? "text/csv",
      "content-disposition":
        response.headers.get("content-disposition") ??
        'attachment; filename="merchant-inventory.csv"',
      "cache-control": "no-store",
    },
  });
}
