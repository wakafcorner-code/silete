import { redirect } from "next/navigation";

export default function HomePage() {
  // redirect is handled by middleware usually, but let's be explicit
  redirect("/dashboard");
}
