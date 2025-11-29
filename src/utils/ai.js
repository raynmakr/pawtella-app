export async function generateCaptionForImage(uri) {
  // TEMP MOCK AI
  // Replace this later with real API logic
  const list = [
    "Caught being adorable.",
    "Professional attention seeker.",
    "Just vibing.",
    "Absolutely no thoughts behind those eyes.",
    "Living their best chaotic life.",
    "Has opinions about everything.",
    "Certified good pet.",
    "Served face. Then stole your snack.",
    "Plotting something cute and illegal.",
    "Requesting treats immediately."
  ];

  // Fake network delay
  await new Promise(res => setTimeout(res, 400));

  return list[Math.floor(Math.random() * list.length)];
}
