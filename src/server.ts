import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { context, createServer, getServerPort } from "@devvit/web/server";
import { createPost, publishLevel } from "./post";
import { validateLevel } from "./validation";
import type { OnAppInstallRequest, TriggerResponse } from "@devvit/web/shared";
import type { Level } from "./types";

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

interface PublishRequest {
  level: Level;
  levelName?: string;
}

interface PublishResponse {
  success: boolean;
  postId?: string;
  error?: string;
}

app.post("/api/publish", async (c) => {
  try {
    const body = await c.req.json<PublishRequest>();
    const { level } = body;

    if (!level) {
      return c.json<PublishResponse>(
        {
          success: false,
          error: "Level data is required",
        },
        400,
      );
    }

    // Validate level server-side
    const validation = validateLevel(level);
    if (!validation.valid) {
      return c.json<PublishResponse>(
        {
          success: false,
          error: validation.error || "Invalid level",
        },
        400,
      );
    }

    // Publish the level
    const result = await publishLevel(level);

    if (result.success) {
      return c.json<PublishResponse>(
        {
          success: true,
          postId: result.postId,
        },
        200,
      );
    } else {
      return c.json<PublishResponse>(
        {
          success: false,
          error: result.error || "Failed to publish level",
        },
        500,
      );
    }
  } catch (error) {
    console.error(`Error in publish endpoint: ${error}`);
    return c.json<PublishResponse>(
      {
        success: false,
        error: error instanceof Error ? error.message : "Internal server error",
      },
      500,
    );
  }
});

serve({
  fetch: app.fetch,
  createServer: createServer,
  port: getServerPort(),
});
