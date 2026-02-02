import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { context, createServer, getServerPort } from "@devvit/web/server";
import { createPost } from "./post";
import type { OnAppInstallRequest, TriggerResponse } from "@devvit/web/shared";

const app = new Hono();

app.post("/on-app-install", async (c) => {
  try {
    const post = await createPost();

    const input = await c.req.json<OnAppInstallRequest>();

    return c.json<TriggerResponse>(
      {
        status: "success",
        message: `Post created in subreddit ${context.subredditName} with id ${post.id} (trigger: ${input.type})`,
      },
      200,
    );
  } catch (error) {
    console.error(`Error creating post: ${error}`);
    return c.json<TriggerResponse>(
      {
        status: "error",
        message: "Failed to create post",
      },
      400,
    );
  }
});

serve({
  fetch: app.fetch,
  createServer: createServer,
  port: getServerPort(),
});
