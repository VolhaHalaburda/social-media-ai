import Anthropic from "@anthropic-ai/sdk";

export async function generateNewConcepts(
  videoAnalysis: string,
  newConceptsPrompt: string
): Promise<string> {
  const rawKey = process.env.ANTHROPIC_API_KEY;
  if (!rawKey) throw new Error("ANTHROPIC_API_KEY not set");

  // Defensive: if the env var was accidentally pasted multiple times or has
  // stray whitespace/newlines, keep only the first valid token so it can't
  // produce an invalid HTTP header value.
  const apiKey = rawKey.trim().split(/\s+/)[0];

  const client = new Anthropic({ apiKey });

  // Stream the response: generating 3 full concepts takes 60-90+ seconds,
  // which a single blocking request can't tolerate (a flat 45s timeout here
  // previously made every generation fail). With streaming the timeout only
  // bounds time-to-first-token and stall gaps, not total generation time.
  // The worker route allows 300s, so 240s is a safe overall ceiling.
  const stream = client.messages.stream(
    {
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: `# ROLE
You're an expert in creating viral Reels on Instagram.

# OBJECTIVE
Take as input viral video from my competitor and based on it generate new concepts for me. Adapt this reference for me.

# REFERENCE VIDEO DESCRIPTION
------
${videoAnalysis}
------

# MY INSTRUCTIONS FOR NEW CONCEPTS
------
${newConceptsPrompt}
------

# BEGIN YOUR WORK`,
        },
      ],
    },
    { timeout: 240_000, maxRetries: 2 }
  );

  const message = await stream.finalMessage();
  return message.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");
}
