"use server";

import * as core from "@opentab/core";
import { revalidatePath } from "next/cache";
import { run } from "@/lib/actions";
import { db } from "@/lib/db";
import { getTokenActor } from "@/lib/session";

/**
 * Private-link actions. The token in the URL is the credential; every action
 * resolves it again server-side and the core services check that the subject
 * (judge or entry) is allowed to touch the resource.
 */

async function actorFor(token: string) {
  const t = await getTokenActor(token);
  if (!t) throw core.forbidden("This link is no longer valid. Ask the tab room for a new one.");
  return t;
}

export async function saveBallotViaLink(
  token: string,
  ballotId: string,
  input: core.BallotInput,
  mode: "draft" | "submit",
) {
  return run(async () => {
    const { actor } = await actorFor(token);
    const res = await core.saveBallot(db(), actor, ballotId, input, mode);
    if (mode === "submit") revalidatePath(`/p/${token}`, "layout");
    return { warnings: res.warnings };
  });
}

export async function startRoundViaLink(token: string, ballotId: string) {
  return run(async () => {
    const { actor } = await actorFor(token);
    await core.markStarted(db(), actor, ballotId);
    revalidatePath(`/p/${token}`);
    return null;
  }, "Marked as started — good luck!");
}

export async function updateRfdViaLink(token: string, ballotId: string, rfd: string) {
  return run(async () => {
    const { actor } = await actorFor(token);
    await core.updateRfd(db(), actor, ballotId, rfd);
    return null;
  }, "RFD saved");
}

export async function requestCorrectionViaLink(token: string, ballotId: string, message: string) {
  return run(async () => {
    const { actor } = await actorFor(token);
    await core.requestCorrection(db(), actor, ballotId, message);
    return null;
  }, "Sent to the tab room");
}

export async function savePrefsViaLink(
  token: string,
  input: {
    prefs: { judgeId: string; ordinal?: number | null; tier?: number | null; strike?: boolean }[];
    submit: boolean;
  },
) {
  return run(
    async () => {
      const { actor, resolved } = await actorFor(token);
      if (resolved.subjectType !== "entry") throw core.forbidden();
      const res = await core.savePrefSheet(db(), actor, resolved.subjectId, input);
      revalidatePath(`/p/${token}`, "layout");
      return res;
    },
    input.submit ? "Pref sheet submitted" : "Saved",
  );
}

export async function addSpeechViaLink(
  token: string,
  pairingId: string,
  input: { entryId: string; legislation?: string; stance?: string },
) {
  return run(async () => {
    const { actor } = await actorFor(token);
    await core.addSpeech(db(), actor, pairingId, input);
    revalidatePath(`/p/${token}/chamber/${pairingId}`);
    return null;
  });
}

export async function removeSpeechViaLink(token: string, pairingId: string, speechId: string) {
  return run(async () => {
    const { actor } = await actorFor(token);
    await core.removeSpeech(db(), actor, pairingId, speechId);
    revalidatePath(`/p/${token}/chamber/${pairingId}`);
    return null;
  });
}
