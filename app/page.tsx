import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default function HomePage() {
  return (
    <Suspense fallback={null}>
      <RootRedirect />
    </Suspense>
  );
}

async function RootRedirect() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return redirect(user ? "/dashboard" : "/auth/login");
}
