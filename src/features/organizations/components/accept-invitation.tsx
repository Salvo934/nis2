"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { FormAlert } from "@/components/forms/form-alert";
import { Button } from "@/components/ui/button";
import { acceptInvitationAction } from "@/features/organizations/actions";

export function AcceptInvitationButton({
  token,
  organizationName,
}: {
  token: string;
  organizationName: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function accept() {
    setError(null);
    startTransition(async () => {
      const result = await acceptInvitationAction(token);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(`Benvenuto in ${organizationName}`);
      router.replace("/dashboard");
    });
  }

  return (
    <div className="space-y-4">
      {error ? <FormAlert>{error}</FormAlert> : null}
      <Button onClick={accept} disabled={pending} size="lg" className="w-full">
        {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
        Accetta l&apos;invito
      </Button>
    </div>
  );
}
