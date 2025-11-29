import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.EXPO_PUBLIC_OPENAI_API_KEY
});

export async function interpretWithLLM(userText, inventory) {
  const inventoryList = inventory.map(i => i.name).join(", ");

  const prompt = `
You are the AI shopping assistant for Pawtella, a pet care app.
Your job is to translate the user's natural language into a clear JSON instruction.

The user may want to:
- Add an item to subscription
- Remove an item
- Change frequency
- Modify an existing item

Valid frequencies:
"Every Week", "Every 2 Weeks", "Every Month", "Every 2 Months"

Available inventory:
${inventoryList}

Return ONLY valid JSON in this format:

{
  "action": "add" | "remove" | "update",
  "itemName": "name of product",
  "frequency": "string or null"
}

If unsure, guess the closest matching item.
If item not found, pick the best match from the inventory list.
`;

  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: prompt },
      { role: "user", content: userText }
    ]
  });

  try {
    return JSON.parse(response.choices[0].message.content);
  } catch (err) {
    return { error: "AI returned invalid JSON", raw: response };
  }
}
