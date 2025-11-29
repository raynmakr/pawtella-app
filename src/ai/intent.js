export async function interpretSubscriptionCommand(text, engine) {
  const lower = text.toLowerCase();

  // Very simple rule-based mock before LLM
  if (lower.includes("add")) {
    // extract item name (dirty but fine for mock)
    const name = lower.split("add ")[1].split(" every")[0].trim();

    // extract frequency
    let frequency = "Every Month";
    if (lower.includes("week")) frequency = "Every Week";
    if (lower.includes("2 weeks")) frequency = "Every 2 Weeks";
    if (lower.includes("2 months")) frequency = "Every 2 Months";

    return engine.addItem({ name, frequency });
  }

  if (lower.includes("remove")) {
    const name = lower.split("remove ")[1].trim();
    return engine.removeItem(name);
  }

  if (lower.includes("change") || lower.includes("switch")) {
    const name = lower.split("change ")[1].split(" to ")[0].trim();

    let frequency = "Every Month";
    if (lower.includes("week")) frequency = "Every Week";
    if (lower.includes("2 weeks")) frequency = "Every 2 Weeks";
    if (lower.includes("2 months")) frequency = "Every 2 Months";

    return engine.updateFrequency(name, frequency);
  }

  return { error: "Command not understood." };
}
