import "server-only";
import { getDb } from "@opentab/db";

export const db = () => getDb();
