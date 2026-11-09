import type { Metadata } from "next";
import { NewPostForm } from "@/components/post/new-post-form";

export const metadata: Metadata = { title: "New post" };

export default function NewPostPage() {
  return <NewPostForm />;
}
