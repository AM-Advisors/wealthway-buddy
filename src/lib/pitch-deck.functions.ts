/**
 * Pitch deck for a fund's diligence room.
 *
 * A deck is a title, a short summary, an ordered set of slide images and an
 * optional source file (PDF / PowerPoint) investors can download. Slide images
 * and the source file live in the private "pitch-decks" bucket; every read goes
 * through a short-lived signed URL issued only after the caller's room access
 * has been checked.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const BUCKET = "pitch-decks";
const SIGNED_URL_SECONDS = 60 * 30;

async function canManage(supabase: any, offeringId: string) {
  const { data } = await supabase.rpc("can_manage_diligence", { _offering_id: offeringId });
  return Boolean(data);
}

async function canView(supabase: any, offeringId: string) {
  const { data } = await supabase.rpc("can_view_diligence", { _offering_id: offeringId });
  return Boolean(data);
}

async function assertManage(supabase: any, offeringId: string) {
  if (!(await canManage(supabase, offeringId))) {
    throw new Error("You do not have permission to change this fund's pitch deck.");
  }
}

/** Records a deck event on the room's activity trail (best effort). */
async function logDeckActivity(
  supabase: any,
  userId: string,
  offeringId: string,
  eventType: string,
  summary: string,
  metadata: Record<string, unknown> = {},
) {
  try {
    const { data: room } = await supabase
      .from("diligence_rooms")
      .select("id")
      .eq("offering_id", offeringId)
      .maybeSingle();
    if (!room) return;
    const { data: profile } = await supabase
      .from("profiles")
      .select("legal_name, email")
      .eq("user_id", userId)
      .maybeSingle();
    await supabase.from("diligence_activity").insert({
      room_id: room.id,
      offering_id: offeringId,
      actor_id: userId,
      actor_name: profile?.legal_name ?? null,
      actor_email: profile?.email ?? null,
      event_type: eventType,
      summary,
      metadata,
    });
  } catch {
    /* activity logging must never block the deck */
  }
}

async function ensureDeck(supabase: any, offeringId: string, userId: string) {
  const { data: existing } = await supabase
    .from("pitch_decks")
    .select("id, title, summary, deck_file_path, deck_file_name, deck_file_size_bytes, updated_at")
    .eq("offering_id", offeringId)
    .maybeSingle();
  if (existing) return existing;

  const { data: created, error } = await supabase
    .from("pitch_decks")
    .insert({ offering_id: offeringId, created_by: userId })
    .select("id, title, summary, deck_file_path, deck_file_name, deck_file_size_bytes, updated_at")
    .single();
  if (error) throw new Error(error.message);
  return created;
}

const offeringInput = (data: unknown) => z.object({ offering_id: z.string().uuid() }).parse(data);

export type PitchSlide = {
  id: string;
  position: number;
  heading: string | null;
  caption: string | null;
  image_url: string | null;
  image_name: string | null;
};

/** Everything the viewer needs: deck details, ordered slides with image links. */
export const getPitchDeck = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(offeringInput)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    if (!(await canView(supabase, data.offering_id))) {
      throw new Error("You do not have access to this fund's materials.");
    }
    const manage = await canManage(supabase, data.offering_id);

    const { data: deck } = await supabase
      .from("pitch_decks")
      .select("id, title, summary, deck_file_path, deck_file_name, deck_file_size_bytes, updated_at")
      .eq("offering_id", data.offering_id)
      .maybeSingle();

    type DeckInfo = {
      id: string;
      title: string;
      summary: string | null;
      file_name: string | null;
      file_size_bytes: number | null;
      updated_at: string;
    };
    const slides: PitchSlide[] = [];
    let info: DeckInfo | null = null;

    if (deck) {
      info = {
        id: deck.id,
        title: deck.title,
        summary: deck.summary,
        file_name: deck.deck_file_name,
        file_size_bytes: deck.deck_file_size_bytes,
        updated_at: deck.updated_at,
      };

      const { data: rows } = await supabase
        .from("pitch_deck_slides")
        .select("id, position, heading, caption, image_path, image_name")
        .eq("deck_id", deck.id)
        .order("position", { ascending: true });

      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      for (const row of rows ?? []) {
        const { data: signed } = await supabaseAdmin.storage
          .from(BUCKET)
          .createSignedUrl(row.image_path, SIGNED_URL_SECONDS);
        slides.push({
          id: row.id,
          position: row.position,
          heading: row.heading,
          caption: row.caption,
          image_name: row.image_name,
          image_url: signed?.signedUrl ?? null,
        });
      }
    }

    return {
      canManage: manage,
      deck: info,
      slides,
      hasDownload: Boolean(deck?.deck_file_path),
    };
  });

/** Logs that someone opened the deck (throttled to once every 30 minutes). */
export const recordDeckView = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(offeringInput)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!(await canView(supabase, data.offering_id))) return { recorded: false };
    const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data: recent } = await supabase
      .from("diligence_activity")
      .select("id")
      .eq("offering_id", data.offering_id)
      .eq("actor_id", userId)
      .eq("event_type", "pitch_deck_viewed")
      .gte("created_at", since)
      .limit(1);
    if (recent && recent.length > 0) return { recorded: false };
    await logDeckActivity(supabase, userId, data.offering_id, "pitch_deck_viewed", "Opened the pitch deck");
    return { recorded: true };
  });

/** Manager: deck title and summary. */
export const savePitchDeckDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        offering_id: z.string().uuid(),
        title: z.string().min(1).max(160),
        summary: z.string().max(1000).optional().nullable(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertManage(supabase, data.offering_id);
    const deck = await ensureDeck(supabase, data.offering_id, userId);
    const { error } = await supabase
      .from("pitch_decks")
      .update({
        title: data.title.trim(),
        summary: data.summary?.trim() ? data.summary.trim() : null,
      })
      .eq("id", deck.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Manager: adds one slide image to the end of the deck. */
export const addPitchSlide = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        offering_id: z.string().uuid(),
        file_name: z.string().min(1).max(255),
        content_type: z.string().max(120).optional(),
        content_base64: z.string().min(1).max(14_000_000),
        heading: z.string().max(200).optional().nullable(),
        caption: z.string().max(600).optional().nullable(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertManage(supabase, data.offering_id);

    const contentType = data.content_type || "image/png";
    if (!contentType.startsWith("image/")) {
      throw new Error("Slides must be images (PNG or JPG). Upload the deck file itself for the download link.");
    }
    const binary = Buffer.from(data.content_base64, "base64");
    if (binary.length === 0) throw new Error("That image appears to be empty.");
    if (binary.length > 10 * 1024 * 1024) throw new Error("Each slide image must be 10 MB or smaller.");

    const deck = await ensureDeck(supabase, data.offering_id, userId);

    const { data: last } = await supabase
      .from("pitch_deck_slides")
      .select("position")
      .eq("deck_id", deck.id)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    const position = (last?.position ?? 0) + 1;

    const safeName = data.file_name.replace(/[\\/:*?"<>|]/g, "_");
    const path = `${data.offering_id}/slides/${crypto.randomUUID()}-${safeName}`;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: upErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(path, binary, { contentType, upsert: false });
    if (upErr) throw new Error(upErr.message);

    const { error } = await supabase.from("pitch_deck_slides").insert({
      deck_id: deck.id,
      offering_id: data.offering_id,
      position,
      image_path: path,
      image_name: safeName,
      heading: data.heading?.trim() ? data.heading.trim() : null,
      caption: data.caption?.trim() ? data.caption.trim() : null,
    });
    if (error) throw new Error(error.message);

    await logDeckActivity(supabase, userId, data.offering_id, "pitch_deck_updated", "Added a pitch deck slide", {
      file_name: safeName,
      position,
    });
    return { ok: true, position };
  });

/** Manager: heading and caption for one slide. */
export const savePitchSlideText = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        heading: z.string().max(200).optional().nullable(),
        caption: z.string().max(600).optional().nullable(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: slide } = await supabase
      .from("pitch_deck_slides")
      .select("id, offering_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!slide) throw new Error("That slide no longer exists.");
    await assertManage(supabase, slide.offering_id);
    const { error } = await supabase
      .from("pitch_deck_slides")
      .update({
        heading: data.heading?.trim() ? data.heading.trim() : null,
        caption: data.caption?.trim() ? data.caption.trim() : null,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Manager: moves a slide one place earlier or later. */
export const movePitchSlide = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ id: z.string().uuid(), direction: z.enum(["up", "down"]) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: slide } = await supabase
      .from("pitch_deck_slides")
      .select("id, deck_id, offering_id, position")
      .eq("id", data.id)
      .maybeSingle();
    if (!slide) throw new Error("That slide no longer exists.");
    await assertManage(supabase, slide.offering_id);

    const query = supabase
      .from("pitch_deck_slides")
      .select("id, position")
      .eq("deck_id", slide.deck_id)
      .limit(1);
    const { data: neighbour } =
      data.direction === "up"
        ? await query.lt("position", slide.position).order("position", { ascending: false }).maybeSingle()
        : await query.gt("position", slide.position).order("position", { ascending: true }).maybeSingle();
    if (!neighbour) return { ok: true, moved: false };

    await supabase.from("pitch_deck_slides").update({ position: neighbour.position }).eq("id", slide.id);
    await supabase.from("pitch_deck_slides").update({ position: slide.position }).eq("id", neighbour.id);
    return { ok: true, moved: true };
  });

/** Manager: removes a slide and its image. */
export const removePitchSlide = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: slide } = await supabase
      .from("pitch_deck_slides")
      .select("id, offering_id, image_path")
      .eq("id", data.id)
      .maybeSingle();
    if (!slide) return { ok: true };
    await assertManage(supabase, slide.offering_id);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.storage.from(BUCKET).remove([slide.image_path]);
    const { error } = await supabase.from("pitch_deck_slides").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await logDeckActivity(supabase, userId, slide.offering_id, "pitch_deck_updated", "Removed a pitch deck slide");
    return { ok: true };
  });

/** Manager: uploads the downloadable deck file (PDF or PowerPoint). */
export const uploadDeckFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        offering_id: z.string().uuid(),
        file_name: z.string().min(1).max(255),
        content_type: z.string().max(160).optional(),
        content_base64: z.string().min(1).max(40_000_000),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertManage(supabase, data.offering_id);

    const binary = Buffer.from(data.content_base64, "base64");
    if (binary.length === 0) throw new Error("That file appears to be empty.");
    if (binary.length > 25 * 1024 * 1024) throw new Error("The deck file must be 25 MB or smaller.");

    const deck = await ensureDeck(supabase, data.offering_id, userId);
    const safeName = data.file_name.replace(/[\\/:*?"<>|]/g, "_");
    const path = `${data.offering_id}/deck/${crypto.randomUUID()}-${safeName}`;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: upErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(path, binary, { contentType: data.content_type || "application/pdf", upsert: false });
    if (upErr) throw new Error(upErr.message);

    if (deck.deck_file_path) {
      await supabaseAdmin.storage.from(BUCKET).remove([deck.deck_file_path]);
    }

    const { error } = await supabase
      .from("pitch_decks")
      .update({
        deck_file_path: path,
        deck_file_name: safeName,
        deck_file_size_bytes: binary.length,
      })
      .eq("id", deck.id);
    if (error) throw new Error(error.message);

    await logDeckActivity(supabase, userId, data.offering_id, "pitch_deck_updated", "Uploaded the pitch deck file", {
      file_name: safeName,
    });
    return { ok: true };
  });

/** Manager: removes the downloadable deck file. */
export const removeDeckFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(offeringInput)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await assertManage(supabase, data.offering_id);
    const { data: deck } = await supabase
      .from("pitch_decks")
      .select("id, deck_file_path")
      .eq("offering_id", data.offering_id)
      .maybeSingle();
    if (!deck?.deck_file_path) return { ok: true };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.storage.from(BUCKET).remove([deck.deck_file_path]);
    const { error } = await supabase
      .from("pitch_decks")
      .update({ deck_file_path: null, deck_file_name: null, deck_file_size_bytes: null })
      .eq("id", deck.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Anyone with room access: a short-lived download link for the deck file. */
export const getDeckDownloadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(offeringInput)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!(await canView(supabase, data.offering_id))) {
      throw new Error("You do not have access to this fund's materials.");
    }
    const { data: deck } = await supabase
      .from("pitch_decks")
      .select("deck_file_path, deck_file_name")
      .eq("offering_id", data.offering_id)
      .maybeSingle();
    if (!deck?.deck_file_path) throw new Error("No deck file has been uploaded yet.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(deck.deck_file_path, 300, { download: deck.deck_file_name ?? "pitch-deck" });
    if (error || !signed?.signedUrl) throw new Error(error?.message ?? "Could not create the download link.");

    await logDeckActivity(supabase, userId, data.offering_id, "pitch_deck_downloaded", "Downloaded the pitch deck", {
      file_name: deck.deck_file_name,
    });
    return { url: signed.signedUrl, file_name: deck.deck_file_name };
  });
