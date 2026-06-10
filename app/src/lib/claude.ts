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

  const message = await client.messages.create({
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
  });

  const block = message.content[0];
  return block.type === "text" ? block.text : "";
}
