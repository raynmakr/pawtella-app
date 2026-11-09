import type { Metadata } from "next";
import { MyProfile } from "@/components/profile/my-profile";

export const metadata: Metadata = { title: "Profile" };

export default function ProfilePage() {
  return <MyProfile />;
}
