"use client";

import { magicLinkClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { withBase } from "./paths";

export const authClient = createAuthClient({
  basePath: withBase("/api/auth"),
  plugins: [magicLinkClient()],
});
