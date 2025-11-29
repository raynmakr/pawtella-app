import OpenAI from "openai";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Your secure server-side OpenAI API key
  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const { userText, inventory } = req.body;

  if (!userText || !inventory) {
    return res.status(400).json({ error: "Missing userText or inventory" });
  }

  const prompt = `
You are a subscription shopping assistant for a pet store.
Translate the user’s natural language into JSON.

Inventory items:
${inventory.map(i => i.name).join(", ")}

Frequencies allowed:
"Every Week", "Every 2 Weeks", "Every Month", "Every 2 Months"

Return ONLY a JSON object like:
{
  "action": "add" | "remove" | "update",
  "itemName": "string",
  "frequency": "string or null"
}
`;

  try {
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: userText }
      ],
    });

    const json = JSON.parse(response.choices[0].message.content);
    return res.status(200).json(json);

  } catch (error) {
    console.error("ERROR:", error);
    return res.status(500).json({ error: error.message });
  }
}
