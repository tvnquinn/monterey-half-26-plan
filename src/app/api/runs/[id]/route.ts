import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { deleteRun, loadRuns } from "@/lib/storage";

/**
 * Delete one run by id.
 *
 * Gated on ADMIN_TOKEN because the rest of this app's write surface is open —
 * `/api/openclaw/ingest` takes an unauthenticated POST — and an open delete is
 * a different proposition from an open append: a bad append is visible and
 * reversible, a bad delete is neither. Fails closed when ADMIN_TOKEN is unset,
 * so a local or preview deployment without the variable cannot delete at all.
 */
function authorised(req: NextRequest): boolean {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) return false;
  const given = req.headers.get("x-admin-token") ?? "";
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on a length mismatch, which would itself leak length.
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  if (!authorised(req)) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }
  const { id } = await ctx.params;

  // Report what was removed, so a deletion leaves a record of its own.
  const before = (await loadRuns()).find((r) => r.id === id);
  if (!before) {
    return NextResponse.json({ error: `No run with id ${id}` }, { status: 404 });
  }

  const deleted = await deleteRun(id);
  return NextResponse.json({
    deleted,
    run: {
      id: before.id,
      startDate: before.startDate,
      distanceMi: before.distanceMi,
      movingTimeSec: before.movingTimeSec,
    },
  });
}
