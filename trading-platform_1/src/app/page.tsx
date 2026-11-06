import { redirect } from "next/navigation";

// The front page is the dashboard: open the site and it is already there.
export default function Home() {
  redirect("/dashboard");
}
